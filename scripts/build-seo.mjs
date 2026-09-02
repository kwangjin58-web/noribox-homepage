import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const storyDir = path.join(root, 'story');
const site = 'https://noribox.org';
const posts = JSON.parse(await readFile(path.join(storyDir, 'posts.json'), 'utf8'));
const targetUrl = process.argv.find((argument) => argument.startsWith('--post='))?.slice('--post='.length);
if (!targetUrl) throw new Error('새 글만 생성하려면 --post=<slug>.html 인수를 지정하세요.');
if (!posts.some((post) => post.url === targetUrl)) throw new Error(`posts.json에서 ${targetUrl} 글을 찾을 수 없습니다.`);
const esc = (value = '') => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const xml = esc;
const jsonLd = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
const inline = (value = '') => {
  let out = '', last = 0;
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  for (const match of String(value).matchAll(pattern)) {
    out += esc(value.slice(last, match.index));
    const href = match[2].trim();
    if (/^(https?:\/\/|\.\.?\/|#)/.test(href)) {
      const external = /^https?:\/\//.test(href);
      out += `<a href="${esc(href)}"${external ? ' target="_blank" rel="noopener"' : ''}>${esc(match[1])}</a>`;
    } else out += esc(match[0]);
    last = match.index + match[0].length;
  }
  return out + esc(value.slice(last));
};
const bodyHtml = (body = '', images = []) => String(body).replace(/\r\n/g, '\n').split(/\n\s*\n/).map((block) => {
  const value = block.trim();
  if (!value) return '';
  const lines = value.split('\n');
  if (lines.every((line) => /^- /.test(line.trim()))) return `<ul>${lines.map((line) => `<li>${inline(line.trim().slice(2))}</li>`).join('')}</ul>`;
  if (/^## /.test(value)) {
    const heading = value.slice(3).trim();
    const media = images.filter((image) => image.beforeHeading === heading).map((image) => `<figure class="post-image"><img src="${esc(image.src)}" alt="${esc(image.alt)}"><figcaption>${esc(image.caption)}</figcaption></figure>`).join('');
    return `${media}<h2>${esc(heading)}</h2>`;
  }
  return `<p>${inline(value)}</p>`;
}).join('\n');
const formatDate = (date) => {
  const [y, m, d] = String(date).split('-').map(Number);
  return `${y}. ${m}. ${d}.`;
};
const href = (post) => post.url || `post.html?id=${encodeURIComponent(post.id)}`;

await mkdir(path.join(root, 'scripts'), { recursive: true });
for (let index = 0; index < posts.length; index += 1) {
  const post = posts[index];
  if (post.url !== targetUrl) continue;
  const canonical = `${site}/story/${post.url}`;
  const faq = post.faq || [];
  const sources = post.sources || [];
  const images = post.images || [];
  const ogImage = images[0] ? new URL(images[0].src, `${site}/story/`).href : null;
  const articleLd = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: post.description, datePublished: post.date, dateModified: post.updated || post.date, author: { '@type': 'Person', name: post.author }, mainEntityOfPage: canonical, keywords: post.tags.join(', '), ...(ogImage ? { image: ogImage } : {}) };
  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((item) => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })) };
  const breadcrumbLd = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: '홈', item: `${site}/` },
    { '@type': 'ListItem', position: 2, name: '이야기', item: `${site}/story/` },
    { '@type': 'ListItem', position: 3, name: post.title, item: canonical }
  ] };
  const previous = posts[index + 1];
  const next = posts[index - 1];
  const navCell = (item, label, cls) => item ? `<a class="${cls}" href="${esc(href(item))}"><span class="post-nav-dir">${label}</span><strong>${esc(item.title)}</strong></a>` : '<span></span>';
  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${esc(post.description)}">
  <meta name="author" content="${esc(post.author)}">
  <meta name="theme-color" content="#FFFFFF">
  <title>${esc(post.title)} | 노리박스</title>
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${esc(post.title)}">
  <meta property="og:description" content="${esc(post.description)}">
  <meta property="og:url" content="${canonical}">${ogImage ? `\r
  <meta property="og:image" content="${esc(ogImage)}">` : ''}
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%232F6FED'/%3E%3Cpath d='M17 43V21h8l14 14V21h8v22h-8L25 29v14z' fill='white'/%3E%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../styles.css"><link rel="stylesheet" href="story.css">
  <script type="application/ld+json">${jsonLd(articleLd)}</script>
  <script type="application/ld+json">${jsonLd(faqLd)}</script>
  <script type="application/ld+json">${jsonLd(breadcrumbLd)}</script>
</head>
<body>
  <a class="skip-link" href="#main">본문으로 바로가기</a>
  <header class="site-header" data-header><a class="brand" href="../index.html" aria-label="노리박스 홈"><img class="brand-logo" src="../assets/images/noribox-logo.png" alt="노리박스"></a><button class="menu-button" type="button" aria-expanded="false" aria-controls="site-nav"><span class="sr-only">메뉴 열기</span><span></span><span></span></button><nav class="site-nav" id="site-nav" aria-label="주요 메뉴"><a href="../index.html#home">홈</a><a href="../about.html">브랜드소개</a><a href="../products.html">제품</a><a href="./" aria-current="page">이야기</a><a href="../contact.html">연락하기</a></nav></header>
  <div class="post-wrap"><a class="back-link" href="./">← 이야기 목록</a><main id="main"><article class="post-article reveal is-visible"><header class="post-head"><time datetime="${esc(post.date)}">${formatDate(post.date)}</time><h1>${esc(post.title)}</h1><p class="post-author">글 · ${esc(post.author)}</p><div class="post-tags">${post.tags.map((tag) => `<span class="post-tag">${esc(tag)}</span>`).join('')}</div></header><div class="post-body">${bodyHtml(post.body, post.images || [])}</div><section class="faq"><h2>자주 묻는 질문</h2>${faq.map((item) => `<details><summary>${esc(item.q)}</summary><p>${esc(item.a)}</p></details>`).join('')}</section><section class="sources"><h2>출처</h2><ul>${sources.map((item) => `<li><a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.title)}</a></li>`).join('')}</ul></section><nav class="post-navigation" aria-label="이전 글과 다음 글">${navCell(previous, '이전 글', 'prev')}${navCell(next, '다음 글', 'next')}</nav></article></main></div>
  <footer class="site-footer"><a class="brand" href="../index.html" aria-label="노리박스 홈"><img class="brand-logo" src="../assets/images/noribox-logo.png" alt="노리박스"></a><p>즐거웠던 추억과 새로운 추억을 잇습니다.</p><div class="footer-business" aria-label="사업자 및 고객 안내"><section class="footer-company"><h2 class="sr-only">사업자 정보</h2><p><strong>상호명</strong> : (주)노리박스게임연구소　 <strong>대표</strong> : 양광진</p><p><strong>주소</strong> : 서울특별시 송파구 충민로 66 가든파이브라이프 T9121호</p><p><strong>사업자등록번호</strong> : 157-81-02792　 <strong>통신판매업신고</strong> : 2022-서울송파-2207호 <a href="https://www.ftc.go.kr/www/selectBizCommList.do?key=254" target="_blank" rel="noopener">[사업자정보확인]</a></p><p><strong>개인정보보호책임자</strong> : 김병석 (noribox@kakao.com)　 <strong>E-mail</strong> : <a href="mailto:noribox@kakao.com">noribox@kakao.com</a></p></section><section><h2>고객센터</h2><strong class="footer-phone">02-404-1404</strong><p>평일 09:00~18:00</p><p>주말, 공휴일도 상담하오니 부담 없이 연락주세요.</p></section><section><h2>입금 계좌안내</h2><p class="footer-account">KB국민은행 029401-00-015170</p><p>예금주 : (주)노리박스게임연구소</p><p class="footer-deposit-note">입금 시 주문자 성함 기재</p></section></div><nav class="footer-links" aria-label="연락처와 SNS"><a href="mailto:noribox@kakao.com" target="_blank" rel="noopener">noribox@kakao.com</a><a href="http://pf.kakao.com/_yxeGFC/chat" target="_blank" rel="noopener">카카오톡</a><a href="https://www.instagram.com/noribox58/" target="_blank" rel="noopener">인스타그램</a><a href="https://cafe.naver.com/noribox" target="_blank" rel="noopener">네이버카페</a><a href="https://www.youtube.com/@noribox" target="_blank" rel="noopener">유튜브</a></nav><div class="footer-bottom"><span>© <span data-year></span> 노리박스. All rights reserved.</span><a href="#main">맨 위로 ↑</a></div></footer>
  <script src="../script.js"></script>
</body>
</html>
`;
  await writeFile(path.join(storyDir, post.url), html, 'utf8');
}

const sorted = posts.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
const today = new Date().toISOString().slice(0, 10);
const sitemapUrls = [
  { url: `${site}/`, date: today }, { url: `${site}/about.html`, date: today }, { url: `${site}/products.html`, date: today }, { url: `${site}/contact.html`, date: today }, { url: `${site}/story/`, date: today },
  ...sorted.map((post) => ({ url: `${site}/story/${post.url}`, date: post.updated || post.date }))
];
await writeFile(path.join(root, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map((item) => `  <url><loc>${xml(item.url)}</loc><lastmod>${item.date}</lastmod></url>`).join('\n')}\n</urlset>\n`);
await writeFile(path.join(root, 'feed.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>노리박스 이야기</title><link>${site}/story/</link><description>오락실게임기와 노리박스의 제품·사용 이야기</description><language>ko</language>${sorted.slice(0, 20).map((post) => `<item><title>${xml(post.title)}</title><link>${site}/story/${post.url}</link><description>${xml(post.description)}</description><pubDate>${new Date(`${post.date}T00:00:00+09:00`).toUTCString()}</pubDate><guid isPermaLink="true">${site}/story/${post.url}</guid></item>`).join('')}</channel></rss>\n`);
await writeFile(path.join(root, 'llms.txt'), `# 노리박스\n\n노리박스는 즐거웠던 오락실의 추억과 새로운 가족의 추억을 잇는 브랜드입니다.\n\n## 파는 것\n\n가정용·업소용 오락실게임기와 관련 제품을 소개합니다.\n\n## 페이지 안내\n\n- [홈](${site}/): 브랜드와 대표 제품\n- [브랜드소개](${site}/about.html): 시작 이야기와 제품 원칙\n- [제품](${site}/products.html): 현재 제품 목록과 구매 링크\n- [연락하기](${site}/contact.html): 이메일과 공식 SNS\n- [이야기](${site}/story/): 오락실게임기 사용·선택 가이드\n\n## 이야기(블로그)\n\n${sorted.slice(0, 30).map((post) => `- [${post.title}](${site}/story/${post.url}): ${post.summary}`).join('\n')}\n`);
