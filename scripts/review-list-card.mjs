const esc = (s = '') => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
export function reviewListCard(review, pageRoot) {
  const image = review.images[0];
  const excerpt = (review.body || review.title).split(/\n\s*\n/)[0];
  return `<article class="review-card${image ? '' : ' review-card-text'}"><a class="review-card-link" href="${pageRoot}${review.id}.html">${image ? `<div class="review-card-media"><img src="${esc(image.url)}" alt="${esc(review.title)} 구매후기 사진" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="${image.width || 740}" height="${image.height || 555}"><span class="review-photo-count">사진 ${review.images.length}장</span></div>` : '<div class="review-text-label"><span aria-hidden="true">“</span> 고객의 이야기</div>'}<div class="review-card-body"><div class="review-card-meta"><time datetime="${esc(review.date)}">${review.date.replaceAll('-','.')}</time><span>#${review.id}</span></div><h2>${esc(review.title)}</h2><p>${esc(excerpt)}</p><span class="review-card-more">후기 읽기 <span aria-hidden="true">↗</span></span></div></a></article>`;
}
