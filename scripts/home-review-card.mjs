// Keep the generated card and the SEO audit's exact-title boundary in sync.
export const escapeReviewTitle = (value = '') => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function homeReviewCard(review) {
  const date = String(review.date).split('-').join('.');
  return `<article class="home-review-card reveal"><a href="reviews/${review.id}.html"><div class="home-review-card-body"><time datetime="${review.date}">${date}</time><h3>${escapeReviewTitle(review.title)}</h3><span class="home-review-arrow">후기 읽기 →</span></div></a></article>`;
}
