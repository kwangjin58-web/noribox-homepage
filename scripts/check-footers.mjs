import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const publicPages = ['index.html', 'about.html', 'products.html', 'contact.html'];
const storyRoot = join(projectRoot, 'story');

if (existsSync(storyRoot)) {
  for (const entry of readdirSync(storyRoot, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.html') && entry.name !== 'admin.html') {
      publicPages.push(join('story', entry.name));
    }
  }
}

const requiredFooterContent = [
  '<footer class="site-footer">',
  'class="footer-business"',
  '(주)노리박스게임연구소',
  '157-81-02792',
  '02-404-1404',
  '029401-00-015170',
  'noribox@kakao.com',
  'pf.kakao.com/_yxeGFC/chat',
  'instagram.com/noribox58',
  'cafe.naver.com/noribox',
  'youtube.com/@noribox',
  '노리박스. All rights reserved.'
];

const failures = [];

for (const page of publicPages) {
  const absolutePath = join(projectRoot, page);
  if (!existsSync(absolutePath)) {
    failures.push(page + ': 파일 없음');
    continue;
  }

  const html = readFileSync(absolutePath, 'utf8');
  const missing = requiredFooterContent.filter((content) => !html.includes(content));
  if (missing.length > 0) {
    failures.push(relative(projectRoot, absolutePath) + ': ' + missing.join(', ') + ' 누락');
  }
}

if (failures.length > 0) {
  console.error('푸터 보호 검사 실패');
  failures.forEach((failure) => console.error('- ' + failure));
  process.exit(1);
}

console.log('푸터 보호 검사 통과: 공개 페이지 ' + publicPages.length + '개');

