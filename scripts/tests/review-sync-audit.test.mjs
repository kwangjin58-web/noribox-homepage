import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('offline sync → SEO/footer audit preserves customer originals and fails closed', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'noribox-review-audit-'));
  try {
    // Isolated copy: never fetch live reviews or modify the working tree.
    for (const item of ['scripts', 'story', 'reviews', 'index.html', 'about.html', 'products.html', 'contact.html', 'products.json', 'robots.txt', 'sitemap.xml', 'feed.xml', 'llms.txt']) {
      await cp(path.join(root, item), path.join(temp, item), { recursive: true });
    }
    const title = '최고! 아이들과 즐겁게 쓰고 있어요';
    const body = '고객이 남긴 실제 원문을 바꾸지 않습니다.';
    const id = 4000000000;
    const mock = path.join(temp, 'mock-naver.mjs');
    await writeFile(mock, `globalThis.fetch = async (input) => {
      const url = new URL(input);
      let data;
      if (url.hostname === 'apis.naver.com' && url.pathname.endsWith('/ArticleListV2dot1.json')) {
        data = { message: { result: { hasNext: false, articleList: [{ articleId: ${id}, menuId: 9 }] } } };
      } else if (url.hostname === 'article.cafe.naver.com' && url.pathname === '/gw/v4/cafes/31425115/articles/${id}') {
        data = { result: { article: { isReadable: true, isOpen: true, menu: { id: 9 }, subject: ${JSON.stringify(title)}, contentHtml: ${JSON.stringify(`<p>${body}</p>`)}, writeDate: Date.parse('2026-10-08T00:00:00+09:00'), contentElements: [] } } };
      } else throw new Error('Unexpected network request: ' + url);
      return { ok: true, json: async () => data };
    };`);
    const run = (script, args = []) => execFileSync(process.execPath, [...args, `scripts/${script}`], { cwd: temp, encoding: 'utf8', stdio: 'pipe' });
    const before = JSON.parse(await readFile(path.join(temp, 'reviews/reviews.json'), 'utf8'));
    run('sync-reviews.mjs', ['--import', mock]);
    const synced = JSON.parse(await readFile(path.join(temp, 'reviews/reviews.json'), 'utf8'));
    assert.deepEqual(synced.reviews.filter((review) => review.id !== id), before.reviews);
    assert.equal(synced.reviews[0].title, title);
    assert.equal(synced.reviews[0].body, body);
    const homePath = path.join(temp, 'index.html');
    const html = await readFile(homePath, 'utf8');
    assert.ok(html.includes(`<h3>${title}</h3>`));
    // This generated input reproduces the old guard's false positive.
    assert.match(html, /국내\s*1위|최고|지어낸 후기/);
    assert.ok(!run('audit-seo.mjs').includes("'실패'"));
    assert.match(run('check-footers.mjs'), /푸터 보호 검사 통과/);
    for (const phrase of ['최고', '국내 1위']) {
      await writeFile(homePath, html.replace('직접 사용한 분들의 이야기', phrase));
      assert.throws(() => run('audit-seo.mjs'), (error) => error.status === 1 && error.stderr.includes(`index.html: 금지 표현 "${phrase}"`));
    }
    await writeFile(homePath, html);
    synced.reviews[0].originalUrl = 'https://example.com/forged-source';
    await writeFile(path.join(temp, 'reviews/reviews.json'), JSON.stringify(synced));
    assert.throws(() => run('audit-seo.mjs'), (error) => error.status === 1 && error.stderr.includes('출처 불일치') && error.stderr.includes('index.html: 금지 표현 "최고"'));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
