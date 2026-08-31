import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const site = 'https://noribox.org';
const posts = JSON.parse(await readFile(path.join(root, 'story/posts.json'), 'utf8'));
const baseFiles = ['index.html', 'about.html', 'products.html', 'contact.html', 'story/index.html'];
const publicPostUrl = (post) => String(post.url || '').replace(/\.html$/, '');
const postFiles = posts.map((post) => `story/${post.url}`);
const publicFiles = [...baseFiles, ...postFiles];
const htmlByFile = new Map(await Promise.all(publicFiles.map(async (file) => [file, await readFile(path.join(root, file), 'utf8')])));
const results = [];
const add = (number, pass, detail) => results.push({ number, status: pass ? '통과' : '실패', detail });
const attr = (html, pattern) => html.match(pattern)?.[1]?.trim() || '';

const titles = publicFiles.map((file) => attr(htmlByFile.get(file), /<title>([^<]+)<\/title>/i));
const descriptions = publicFiles.map((file) => attr(htmlByFile.get(file), /<meta name="description" content="([^"]+)"/i));
add(1, titles.every((title) => title && title.length <= 60) && new Set(titles).size === titles.length && descriptions.every(Boolean), `공개 HTML ${publicFiles.length}개 title 고유·60자 이하·description 확인`);
add(2, publicFiles.every((file) => attr(htmlByFile.get(file), /<link rel="canonical" href="([^"]+)"/i).startsWith(site)), '공개 HTML canonical 도메인 확인');
add(3, publicFiles.every((file) => ['og:title','og:description','og:url'].every((key) => new RegExp(`<meta property="${key}" content="[^"]+"`, 'i').test(htmlByFile.get(file)))), '공개 HTML OG 필수값 확인');
add(4, publicFiles.every((file) => (htmlByFile.get(file).match(/<h1\b/gi) || []).length === 1), '공개 HTML h1 각 1개 확인');
add(5, publicFiles.every((file) => [...htmlByFile.get(file).matchAll(/<img\b[^>]*>/gi)].every((match) => /\balt="[^"]*"/i.test(match[0]))), '이미지 alt 누락 없음');
let ldOk = true;
for (const file of publicFiles) {
  const scripts = [...htmlByFile.get(file).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)].map((match) => JSON.parse(match[1]));
  if (file === 'index.html') ldOk &&= scripts.some((item) => JSON.stringify(item).includes('Organization') && JSON.stringify(item).includes('WebSite'));
  else if (file === 'products.html') ldOk &&= scripts.some((item) => JSON.stringify(item).includes('Product'));
  else if (file.startsWith('story/') && file !== 'story/index.html') ldOk &&= ['BlogPosting','FAQPage','BreadcrumbList'].every((type) => scripts.some((item) => item['@type'] === type));
}
add(6, ldOk, 'JSON-LD 파싱 및 요구 유형 확인');
const sitemap = await readFile(path.join(root, 'sitemap.xml'), 'utf8');
add(7, publicFiles.every((file) => sitemap.includes(file === 'index.html' ? `${site}/` : file === 'story/index.html' ? `${site}/story/` : file.startsWith('story/') ? `${site}/${file.replace(/\.html$/, '')}` : `${site}/${file}`)) && !/admin\.html|\?id=/.test(sitemap), '공개 페이지 포함, admin·동적 주소 제외');
const robots = await readFile(path.join(root, 'robots.txt'), 'utf8');
add(8, robots.includes('Disallow: /story/admin.html') && robots.includes(`Sitemap: ${site}/sitemap.xml`) && !/GPTBot|ClaudeBot|PerplexityBot/.test(robots), 'admin만 차단하고 sitemap 안내');
const llms = await readFile(path.join(root, 'llms.txt'), 'utf8');
add(9, llms.indexOf('# 노리박스') < llms.indexOf('## 파는 것') && llms.indexOf('## 파는 것') < llms.indexOf('## 페이지 안내') && llms.indexOf('## 페이지 안내') < llms.indexOf('## 이야기(블로그)') && !/\]\((?!https:\/\/)/.test(llms), '브랜드→상품→페이지→글 순서와 절대 링크 확인');
let linksOk = true;
for (const [file, html] of htmlByFile) {
  for (const match of html.matchAll(/<a\b([^>]*)href="([^"]+)"[^>]*>/gi)) {
    const attrs = match[0], href = match[2];
    if (/^https?:\/\//.test(href)) linksOk &&= /rel="[^"]*noopener[^"]*"/i.test(attrs) || !/target="_blank"/i.test(attrs);
    else if (!href.startsWith('#') && !href.startsWith('mailto:')) {
      const clean = href.split(/[?#]/)[0];
      if (clean) {
        const target = path.resolve(path.dirname(path.join(root, file)), clean.endsWith('/') ? `${clean}index.html` : clean);
        try { linksOk &&= (await stat(target)).isFile(); }
        catch {
          try { linksOk &&= path.extname(clean) ? false : (await stat(`${target}.html`)).isFile(); }
          catch { linksOk = false; }
        }
      }
    }
  }
}
add(10, linksOk, '정적 내부 링크 존재 및 새 탭 외부 링크 noopener 확인');
add(11, posts.every((post) => post.author && post.date && post.url && htmlByFile.has(`story/${post.url}`)), '모든 글 작성자·발행일·url·정적 파일 일치');
const banned = /국내\s*1위|최고|지어낸 후기/;
add(12, publicFiles.every((file) => !banned.test(htmlByFile.get(file))), '금지 표현 검색 결과 없음');
add(13, publicFiles.every((file) => /<meta name="viewport" content="width=device-width, initial-scale=1">/i.test(htmlByFile.get(file))), 'viewport 존재 확인; 가로 스크롤은 브라우저에서 별도 확인');

console.table(results);
if (results.some((result) => result.status === '실패')) process.exitCode = 1;
