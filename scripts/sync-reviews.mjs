import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const reviewsDir = path.join(root, 'reviews');
const pagesDir = path.join(reviewsDir, 'page');
const dataFile = path.join(reviewsDir, 'reviews.json');
const site = 'https://noribox.org';
const cafeId = 31425115;
const menuId = 9;
const pageSize = 30;
let reviewsTotal = 0;
const headers = {
  'user-agent': 'Mozilla/5.0 (compatible; NoriboxReviewSync/1.0; +https://noribox.org/reviews/)',
  referer: 'https://cafe.naver.com/'
};

const esc = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
const xml = esc;
const jsonLd = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
const decodeEntities = (value = '') => String(value)
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'");
const cleanText = (value = '') => decodeEntities(String(value).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const truncate = (value, length) => {
  const text = cleanText(value);
  return text.length > length ? `${text.slice(0, length - 1).trim()}…` : text;
};
const formatDate = (date) => {
  const [year, month, day] = String(date).split('-');
  return `${year}.${month}.${day}`;
};
const toKoreanDate = (timestamp) => new Date(Number(timestamp) + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
const originalUrl = (id) => `https://cafe.naver.com/f-e/cafes/${cafeId}/articles/${id}?menuid=${menuId}`;
const reviewUrl = (review) => `${site}/reviews/${review.id}`;

async function fetchJson(url, attempt = 1) {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (attempt >= 3) throw new Error(`${url}: ${error.message}`);
    await new Promise((resolve) => setTimeout(resolve, attempt * 700));
    return fetchJson(url, attempt + 1);
  }
}

async function readExisting() {
  try {
    const data = JSON.parse(await readFile(dataFile, 'utf8'));
    return {
      reviews: Array.isArray(data.reviews) ? data.reviews : [],
      seenArticleIds: Array.isArray(data.seenArticleIds) ? data.seenArticleIds : []
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { reviews: [], seenArticleIds: [] };
    throw error;
  }
}

async function fetchArticleList() {
  const articles = [];
  for (let page = 1; page <= 100; page += 1) {
    const url = `https://apis.naver.com/cafe-web/cafe2/ArticleListV2dot1.json?search.clubid=${cafeId}&search.queryType=lastArticle&search.menuid=${menuId}&search.page=${page}&search.perPage=50`;
    const payload = await fetchJson(url);
    const result = payload?.message?.result;
    const items = Array.isArray(result?.articleList) ? result.articleList : [];
    articles.push(...items.filter((item) => Number(item.menuId) === menuId));
    if (!result?.hasNext || items.length === 0) break;
  }
  return [...new Map(articles.map((article) => [Number(article.articleId), article])).values()];
}

function bodyFromHtml(contentHtml = '') {
  return decodeEntities(String(contentHtml)
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/\[\[\[CONTENT-ELEMENT-\d+\]\]\]/g, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function linksFromHtml(contentHtml = '') {
  const links = [];
  for (const match of String(contentHtml).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(decodeEntities(match[1]));
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      links.push({ url: url.href, label: cleanText(match[2]) || url.hostname });
    } catch {}
  }
  return [...new Map(links.map((link) => [link.url, link])).values()];
}

function imagesFromElements(elements = []) {
  return elements.flatMap((element) => {
    if (element?.type !== 'IMAGE' || !element?.json?.image?.url) return [];
    const image = element.json.image;
    return [{ url: image.url, width: image.width || null, height: image.height || null }];
  });
}

async function fetchReview(listItem) {
  const id = Number(listItem.articleId);
  const url = `https://apis.naver.com/cafe-web/cafe-articleapi/v3/cafes/${cafeId}/articles/${id}?query=&useCafeId=true&requestFrom=A`;
  let payload;
  try {
    payload = await fetchJson(url);
  } catch (error) {
    if (/HTTP (401|403|404)\b/.test(error.message)) {
      console.warn(`공개되지 않은 후기 ${id} 건너뜀`);
      return null;
    }
    throw error;
  }
  const article = payload?.result?.article;
  if (!article || article.isNotice || article.isBlind || !article.isReadable || !article.isOpen || Number(article.menu?.id) !== menuId) return null;
  const title = cleanText(article.subject) || `노리박스 구매후기 ${id}`;
  const body = bodyFromHtml(article.contentHtml);
  const images = imagesFromElements(article.contentElements);
  if (!body && images.length === 0) return null;
  return {
    id,
    title,
    date: toKoreanDate(article.writeDate),
    author: cleanText(article.writer?.nick) || '네이버 카페 회원',
    body,
    images,
    links: linksFromHtml(article.contentHtml),
    originalUrl: originalUrl(id)
  };
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
      if ((index + 1) % 100 === 0) console.log(`후기 본문 ${index + 1}/${items.length}건 확인`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function nav(prefix, current = 'reviews') {
  const items = [
    ['home', `${prefix}index.html#home`, '홈'],
    ['about', `${prefix}about.html`, '브랜드소개'],
    ['products', `${prefix}products.html`, '제품'],
    ['reviews', `${prefix}reviews/`, '구매후기'],
    ['story', `${prefix}story/`, '이야기'],
    ['contact', `${prefix}contact.html`, '연락하기']
  ];
  return `<nav class="site-nav" id="site-nav" aria-label="주요 메뉴">${items.map(([key, href, label]) => `<a href="${href}"${key === current ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
}

function footer(prefix, topHref = '#main') {
  return `<footer class="site-footer"><a class="brand" href="${prefix}index.html" aria-label="노리박스 홈"><img class="brand-logo" src="${prefix}assets/images/noribox-logo.png" alt="노리박스"></a><p>즐거웠던 추억과 새로운 추억을 잇습니다.</p><div class="footer-business" aria-label="사업자 및 고객 안내"><section class="footer-company"><h2 class="sr-only">사업자 정보</h2><p><strong>상호명</strong> : (주)노리박스게임연구소　 <strong>대표</strong> : 양광진</p><p><strong>주소</strong> : 서울특별시 송파구 충민로 66 가든파이브라이프 T9121호</p><p><strong>사업자등록번호</strong> : 157-81-02792　 <strong>통신판매업신고</strong> : 2022-서울송파-2207호 <a href="https://www.ftc.go.kr/www/selectBizCommList.do?key=254" target="_blank" rel="noopener">[사업자정보확인]</a></p><p><strong>개인정보보호책임자</strong> : 김병석 (noribox@kakao.com)　 <strong>E-mail</strong> : <a href="mailto:noribox@kakao.com">noribox@kakao.com</a></p></section><section><h2>고객센터</h2><strong class="footer-phone">02-404-1404</strong><p>평일 09:00~18:00</p><p>주말, 공휴일도 상담하오니 부담 없이 연락주세요.</p></section><section><h2>입금 계좌안내</h2><p class="footer-account">KB국민은행 029401-00-015170</p><p>예금주 : (주)노리박스게임연구소</p><p class="footer-deposit-note">입금 시 주문자 성함 기재</p></section></div><nav class="footer-links" aria-label="연락처와 SNS"><a href="mailto:noribox@kakao.com" target="_blank" rel="noopener">noribox@kakao.com</a><a href="http://pf.kakao.com/_yxeGFC/chat" target="_blank" rel="noopener">카카오톡</a><a href="https://www.instagram.com/noribox58/" target="_blank" rel="noopener">인스타그램</a><a href="https://cafe.naver.com/noribox" target="_blank" rel="noopener">네이버카페</a><a href="https://www.youtube.com/@noribox" target="_blank" rel="noopener">유튜브</a></nav><div class="footer-bottom"><span>© <span data-year></span> 노리박스. All rights reserved.</span><a href="${topHref}">맨 위로 ↑</a></div></footer>`;
}

function head({ title, description, canonical, ogType = 'website', ogImage = '', prefix = '../', ld = [] }) {
  return `<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="#FFFFFF">
  <title>${esc(title)}</title>
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="${ogType}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}">${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ''}
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="512x512" href="/favicon.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${prefix}styles.css"><link rel="stylesheet" href="${prefix}reviews/reviews.css">
  ${ld.map((item) => `<script type="application/ld+json">${jsonLd(item)}</script>`).join('\n  ')}
</head>`;
}

function pagination(current, total) {
  const pageHref = (page) => {
    if (page === 1) return current === 1 ? './' : '../';
    return current === 1 ? `page/${page}.html` : `${page}.html`;
  };
  const pages = new Set([1, total]);
  for (let page = Math.max(1, current - 2); page <= Math.min(total, current + 2); page += 1) pages.add(page);
  let last = 0;
  const links = [];
  for (const page of [...pages].sort((a, b) => a - b)) {
    if (page - last > 1) links.push('<span aria-hidden="true">…</span>');
    links.push(page === current ? `<strong aria-current="page">${page}</strong>` : `<a href="${pageHref(page)}">${page}</a>`);
    last = page;
  }
  return `<nav class="review-pagination" aria-label="구매후기 페이지">${current > 1 ? `<a href="${pageHref(current - 1)}" aria-label="이전 페이지">←</a>` : '<span></span>'}${links.join('')}${current < total ? `<a href="${pageHref(current + 1)}" aria-label="다음 페이지">→</a>` : '<span></span>'}</nav>`;
}

function listPage(reviews, page, totalPages) {
  const nested = page > 1;
  const prefix = nested ? '../../' : '../';
  const pageRoot = nested ? '../' : './';
  const canonical = page === 1 ? `${site}/reviews/` : `${site}/reviews/page/${page}`;
  const title = page === 1 ? '구매후기 | 노리박스' : `구매후기 ${page}페이지 | 노리박스`;
  const description = '노리박스를 구매한 고객이 네이버 카페에 공개한 실제 사용후기를 사진과 원문 링크로 확인할 수 있습니다.';
  const collectionLd = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title.replace(' | 노리박스', ''), description, url: canonical, isPartOf: { '@type': 'WebSite', name: '노리박스', url: site } };
  const breadcrumbLd = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: '홈', item: `${site}/` },
    { '@type': 'ListItem', position: 2, name: '구매후기', item: `${site}/reviews/` }
  ] };
  const rows = reviews.map((review) => `<tr><td class="review-number">${review.id}</td><td><a class="review-title" href="${pageRoot}${review.id}.html">${esc(review.title)}</a><span class="review-mobile-meta">${esc(review.author)} · ${formatDate(review.date)}</span></td><td>${esc(review.author)}</td><td><time datetime="${review.date}">${formatDate(review.date)}</time></td><td aria-label="첨부 사진 ${review.images.length}장">${review.images.length ? `📷 ${review.images.length}` : '—'}</td></tr>`).join('\n');
  return `<!doctype html>
<html lang="ko">
${head({ title, description, canonical, prefix, ld: [collectionLd, breadcrumbLd] })}
<body class="reviews-page">
  <a class="skip-link" href="#main">본문으로 바로가기</a>
  <header class="site-header review-site-header" data-header><a class="brand" href="${prefix}index.html" aria-label="노리박스 홈"><img class="brand-logo" src="${prefix}assets/images/noribox-logo.png" alt="노리박스"></a><button class="menu-button" type="button" aria-expanded="false" aria-controls="site-nav"><span class="sr-only">메뉴 열기</span><span></span><span></span></button>${nav(prefix)}</header>
  <main id="main" class="reviews-main">
    <header class="reviews-heading"><p class="reviews-kicker">CUSTOMER REVIEWS</p><h1>구매후기</h1><p>노리박스를 구매한 고객이 네이버 카페에 공개한 실제 사용후기입니다.</p><a href="https://cafe.naver.com/f-e/cafes/${cafeId}/menus/${menuId}" target="_blank" rel="noopener">네이버 카페 원문 게시판 ↗</a></header>
    <section class="review-board" aria-label="구매후기 글 목록">
      <div class="review-board-summary"><strong>전체 ${reviewsTotal.toLocaleString('ko-KR')}건</strong><span>${page} / ${totalPages} 페이지</span></div>
      <div class="review-table-wrap"><table><thead><tr><th>번호</th><th>제목</th><th>작성자</th><th>작성일</th><th>사진</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${pagination(page, totalPages)}
    </section>
  </main>
  ${footer(prefix)}
  <script src="${prefix}script.js"></script>
</body>
</html>
`;
}

function detailPage(review) {
  const canonical = reviewUrl(review);
  const description = truncate(review.body || review.title, 145) || '노리박스 구매 고객이 네이버 카페에 남긴 실제 사용후기입니다.';
  const pageTitle = `${truncate(review.title, 36)} · 후기 #${review.id} | 노리박스`;
  const images = review.images.map((image, index) => `<figure><img src="${esc(image.url)}" alt="${esc(review.title)} 구매후기 사진 ${index + 1}" loading="lazy" decoding="async" referrerpolicy="no-referrer"${image.width ? ` width="${image.width}"` : ''}${image.height ? ` height="${image.height}"` : ''}></figure>`).join('\n');
  const paragraphs = review.body.split(/\n{2,}/).map((paragraph) => `<p>${esc(paragraph).replace(/\n/g, '<br>')}</p>`).join('\n');
  const links = review.links.length ? `<section class="review-links"><h2>후기에 포함된 링크</h2><ul>${review.links.map((link) => `<li><a href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.label)}</a></li>`).join('')}</ul></section>` : '';
  const articleLd = { '@context': 'https://schema.org', '@type': 'Article', headline: review.title, description, datePublished: review.date, dateModified: review.date, author: { '@type': 'Person', name: review.author }, publisher: { '@type': 'Organization', name: '노리박스', url: site }, mainEntityOfPage: canonical, citation: review.originalUrl, about: { '@type': 'Brand', name: '노리박스' }, ...(review.images.length ? { image: review.images.map((image) => image.url) } : {}) };
  const breadcrumbLd = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: '홈', item: `${site}/` },
    { '@type': 'ListItem', position: 2, name: '구매후기', item: `${site}/reviews/` },
    { '@type': 'ListItem', position: 3, name: review.title, item: canonical }
  ] };
  return `<!doctype html>
<html lang="ko">
${head({ title: pageTitle, description, canonical, ogType: 'article', ogImage: review.images[0]?.url || '', prefix: '../', ld: [articleLd, breadcrumbLd] })}
<body class="reviews-page review-detail-page">
  <a class="skip-link" href="#main">본문으로 바로가기</a>
  <header class="site-header review-site-header" data-header><a class="brand" href="../index.html" aria-label="노리박스 홈"><img class="brand-logo" src="../assets/images/noribox-logo.png" alt="노리박스"></a><button class="menu-button" type="button" aria-expanded="false" aria-controls="site-nav"><span class="sr-only">메뉴 열기</span><span></span><span></span></button>${nav('../')}</header>
  <main id="main" class="review-detail-main">
    <a class="review-back" href="./">← 구매후기 목록</a>
    <article class="review-article">
      <header><p class="review-source-label">네이버 카페 실제 구매후기</p><h1>${esc(review.title)}</h1><div class="review-meta"><span>${esc(review.author)}</span><time datetime="${review.date}">${formatDate(review.date)}</time><span>후기 번호 ${review.id}</span></div></header>
      ${images ? `<div class="review-images">${images}</div>` : ''}
      <div class="review-content">${paragraphs || '<p>사진으로 작성된 구매후기입니다.</p>'}</div>
      ${links}
      <aside class="review-origin"><p>이 글은 노리박스 네이버 카페 구매후기 게시판에 공개된 원문을 출처와 함께 옮긴 것입니다.</p><a href="${review.originalUrl}" target="_blank" rel="noopener">네이버 카페에서 원문 보기 ↗</a></aside>
    </article>
  </main>
  ${footer('../')}
  <script src="../script.js"></script>
</body>
</html>
`;
}

await mkdir(pagesDir, { recursive: true });
const existing = await readExisting();
const existingById = new Map(existing.reviews.map((review) => [Number(review.id), review]));
const seen = new Set(existing.seenArticleIds.map(Number));
for (const id of existingById.keys()) seen.add(id);

const articleList = await fetchArticleList();
const pending = articleList.filter((article) => !seen.has(Number(article.articleId)));
console.log(`구매후기 목록 ${articleList.length}건, 새로 확인할 글 ${pending.length}건`);
const forceRebuild = process.argv.includes('--rebuild');
if (pending.length === 0 && existing.reviews.length > 0 && !forceRebuild) {
  console.log('새 구매후기가 없어 파일을 변경하지 않았습니다.');
  process.exit(0);
}
const fetched = pending.length ? await mapConcurrent(pending, 8, fetchReview) : [];
for (const review of fetched.filter(Boolean)) existingById.set(review.id, review);
for (const article of pending) seen.add(Number(article.articleId));

const reviews = [...existingById.values()].sort((a, b) => b.id - a.id);
reviewsTotal = reviews.length;
const payload = {
  source: `https://cafe.naver.com/f-e/cafes/${cafeId}/menus/${menuId}`,
  cafeId,
  menuId,
  seenArticleIds: [...seen].sort((a, b) => b - a),
  reviews
};
await writeFile(dataFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

const totalPages = Math.max(1, Math.ceil(reviews.length / pageSize));
for (let page = 1; page <= totalPages; page += 1) {
  const slice = reviews.slice((page - 1) * pageSize, page * pageSize);
  const target = page === 1 ? path.join(reviewsDir, 'index.html') : path.join(pagesDir, `${page}.html`);
  await writeFile(target, listPage(slice, page, totalPages), 'utf8');
}
await mapConcurrent(reviews, 32, async (review) => {
  await writeFile(path.join(reviewsDir, `${review.id}.html`), detailPage(review), 'utf8');
});

const feedItems = reviews.slice(0, 20).map((review) => `<item><title>${xml(review.title)}</title><link>${reviewUrl(review)}</link><description>${xml(truncate(review.body || review.title, 180))}</description><pubDate>${new Date(`${review.date}T00:00:00+09:00`).toUTCString()}</pubDate><guid isPermaLink="true">${reviewUrl(review)}</guid></item>`).join('');
await writeFile(path.join(reviewsDir, 'feed.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>노리박스 구매후기</title><link>${site}/reviews/</link><description>노리박스 네이버 카페에 공개된 실제 구매후기</description><language>ko</language>${feedItems}</channel></rss>\n`, 'utf8');

await execFileAsync(process.execPath, [path.join(root, 'scripts', 'build-seo.mjs')], { cwd: root });
console.log(`구매후기 ${reviews.length}건, 목록 ${totalPages}페이지 생성 완료`);
