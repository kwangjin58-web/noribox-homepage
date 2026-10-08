import { escapeReviewTitle, homeReviewCard } from './home-review-card.mjs';

const cafeId = 31425115;
const menuId = 9;
const boardUrl = `https://cafe.naver.com/f-e/cafes/${cafeId}/menus/${menuId}`;
const originalUrl = (id) => `https://cafe.naver.com/f-e/cafes/${cafeId}/articles/${id}?menuid=${menuId}`;

// The checked-in/imported review data is the source of truth, not HTML markers.
// Fail closed: only the exact generated title text of a source-matched card is
// masked. Headings, arrows, attributes and every other byte remain audited.
export function auditBrandClaims(file, html, reviewData) {
  const errors = [];
  let auditedHtml = html;
  if (file === 'index.html') {
    const blocks = [...html.matchAll(/<!-- PURCHASE_REVIEWS_START -->([\s\S]*?)<!-- PURCHASE_REVIEWS_END -->/g)];
    const starts = html.split('<!-- PURCHASE_REVIEWS_START -->').length - 1;
    const ends = html.split('<!-- PURCHASE_REVIEWS_END -->').length - 1;
    if (starts !== 1 || ends !== 1 || blocks.length !== 1) {
      errors.push(`${file}: 구매후기 영역 표시자는 정확히 한 쌍이어야 합니다.`);
    } else {
      const block = blocks[0][0];
      const sourceOk = reviewData?.source === boardUrl && reviewData.cafeId === cafeId && reviewData.menuId === menuId;
      const reviews = Array.isArray(reviewData?.reviews) ? reviewData.reviews : [];
      const maskedBlock = block.replace(/<article\b[^>]*\bclass="[^"]*\bhome-review-card\b[^"]*"[^>]*>[\s\S]*?<\/article>/g, (card) => {
        const id = Number(card.match(/<a href="reviews\/(\d+)\.html">/)?.[1]);
        const matches = reviews.filter((review) => review.id === id);
        const review = matches[0];
        if (!sourceOk || matches.length !== 1 || !Number.isSafeInteger(id) || id <= 0 ||
            typeof review?.title !== 'string' || review.originalUrl !== originalUrl(id) ||
            !/^\d{4}-\d{2}-\d{2}$/.test(review.date) || card !== homeReviewCard(review)) {
          errors.push(`${file}: 구매후기 #${id || '?'} 제목·카드·원문 출처 불일치`);
          return card;
        }
        return card.replace(`<h3>${escapeReviewTitle(review.title)}</h3>`, '<h3></h3>');
      });
      auditedHtml = html.slice(0, blocks[0].index) + maskedBlock + html.slice(blocks[0].index + block.length);
    }
  }
  for (const match of auditedHtml.matchAll(/국내\s*1위|최고|지어낸 후기/g)) {
    errors.push(`${file}: 금지 표현 ${JSON.stringify(match[0])}`);
  }
  return errors;
}
