import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { auditBrandClaims } from '../audit-brand-claims.mjs';
import { homeReviewCard } from '../home-review-card.mjs';

const review = {
  id: 42, title: '아이들과 놀기 최고! & <즐거움> "좋아요"', date: '2026-10-08',
  body: '원문 보존', originalUrl: 'https://cafe.naver.com/f-e/cafes/31425115/articles/42?menuid=9'
};
const data = {
  source: 'https://cafe.naver.com/f-e/cafes/31425115/menus/9', cafeId: 31425115, menuId: 9,
  reviews: [review]
};
const block = (content) => `<!-- PURCHASE_REVIEWS_START --><section><h2>고객 이야기</h2>${content}</section><!-- PURCHASE_REVIEWS_END -->`;
const check = (html, source = data, file = 'index.html') => auditBrandClaims(file, html, source);

test('only a source-matched customer title is exempt, with entities and originals preserved', () => {
  const before = JSON.stringify(data);
  const html = block(homeReviewCard(review));
  assert.match(html, /최고! &amp; &lt;즐거움&gt; &quot;좋아요&quot;/);
  assert.deepEqual(check(html), []);
  assert.equal(JSON.stringify(data), before);
});

for (const phrase of ['최고', '국내 1위', '국내\n1위', '지어낸 후기']) {
  test(`adjacent brand claim remains blocked: ${JSON.stringify(phrase)}`, () => {
    const errors = check(block(homeReviewCard(review) + `<p>${phrase}</p>`));
    assert.deepEqual(errors, [`index.html: 금지 표현 ${JSON.stringify(phrase)}`]);
  });
}

test('brand heading, card arrow, attributes, and content outside the block are audited', () => {
  for (const html of [
    block(homeReviewCard(review)).replace('고객 이야기', '최고'),
    block(homeReviewCard(review).replace('후기 읽기 →', '최고')),
    block(homeReviewCard(review).replace('<h3>', '<h3 title="최고">')),
    block(homeReviewCard(review)) + '<h3>최고</h3>',
    '<meta name="description" content="최고">' + block(homeReviewCard(review))
  ]) assert.ok(check(html).some((error) => error.includes('금지 표현 "최고"')));
});

test('forged title, unknown ID, mismatched ID and duplicate ID fail closed', () => {
  for (const [html, source] of [
    [block(homeReviewCard({ ...review, title: '최고로 좋은 제품' })), data],
    [block(homeReviewCard({ ...review, id: 43 })), data],
    [block(homeReviewCard(review)), { ...data, reviews: [{ ...review, id: 43 }] }],
    [block(homeReviewCard(review)), { ...data, reviews: [review, review] }]
  ]) {
    const errors = check(html, source);
    assert.ok(errors.some((error) => error.includes('출처 불일치')));
    assert.ok(errors.some((error) => error.includes('금지 표현 "최고"')));
  }
});

test('wrong or missing source provenance is rejected even for an ordinary title', () => {
  const plain = { ...review, title: '잘 쓰고 있어요' };
  const valid = { ...data, reviews: [plain] };
  for (const source of [
    { ...valid, source: 'https://example.com' },
    { ...valid, cafeId: 1 }, { ...valid, menuId: 2 },
    { reviews: [plain] }, undefined,
    { ...valid, reviews: [{ ...plain, originalUrl: 'https://example.com/42' }] },
    { ...valid, reviews: [{ ...plain, originalUrl: review.originalUrl.replace('/42?', '/43?') }] },
    { ...valid, reviews: [{ ...plain, originalUrl: review.originalUrl + '&forged=1' }] }
  ]) assert.ok(auditBrandClaims('index.html', block(homeReviewCard(plain)), source).some((error) => error.includes('출처 불일치')));
});

test('a sourced title outside its generated block or on another page is not exempt', () => {
  assert.ok(check(block('') + homeReviewCard(review)).some((error) => error.includes('금지 표현')));
  assert.deepEqual(check(block(homeReviewCard(review)), data, 'about.html'), ['about.html: 금지 표현 "최고"']);
});

test('missing or duplicated boundaries cannot create an exemption', () => {
  for (const html of [
    homeReviewCard(review), block(homeReviewCard(review)) + block(''),
    '<!-- PURCHASE_REVIEWS_START -->' + block(homeReviewCard(review)),
    block(homeReviewCard(review)) + '<!-- PURCHASE_REVIEWS_END -->',
    '<!-- PURCHASE_REVIEWS_END -->' + homeReviewCard(review) + '<!-- PURCHASE_REVIEWS_START -->'
  ]) {
    assert.ok(check(html).some((error) => error.includes('표시자')));
    assert.ok(check(html).some((error) => error.includes('금지 표현')));
  }
});

test('checked-in homepage cards still match the generator byte for byte', async () => {
  const source = JSON.parse(await readFile(new URL('../../reviews/reviews.json', import.meta.url), 'utf8'));
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  for (const item of source.reviews.slice(0, 6)) assert.ok(html.includes(homeReviewCard(item)));
  assert.deepEqual(check(html, source), []);
});
