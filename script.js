const header = document.querySelector('[data-header]');
const menuButton = document.querySelector('.menu-button');
const nav = document.querySelector('.site-nav');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const closeMenu = () => {
  if (!menuButton || !nav) return;
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.querySelector('.sr-only').textContent = '메뉴 열기';
  nav.classList.remove('is-open');
  document.body.classList.remove('menu-open');
};

if (menuButton && nav) {
  menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!open));
    menuButton.querySelector('.sr-only').textContent = open ? '메뉴 열기' : '메뉴 닫기';
    nav.classList.toggle('is-open', !open);
    document.body.classList.toggle('menu-open', !open);
  });
  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
}

const updateHeader = () => {
  if (!header) return;
  const scrubHero = document.querySelector('.rd-scrub');
  const isOverScrub = scrubHero && scrubHero.getBoundingClientRect().bottom > header.offsetHeight;
  header.classList.toggle('is-scrolled', isOverScrub ? false : window.scrollY > 24);
};
updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

let revealObserver;
if (!reduceMotion && 'IntersectionObserver' in window) {
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12 });
}

const activateReveal = (elements) => {
  elements.forEach((element) => {
    if (revealObserver) revealObserver.observe(element);
    else element.classList.add('is-visible');
  });
};

window.activateReveal = activateReveal;
activateReveal(document.querySelectorAll('.reveal'));

const priceFormatter = new Intl.NumberFormat('ko-KR');

const makeElement = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

const configureCartButton = (button, product) => {
  button.setAttribute('data-cart-add', '');
  button.setAttribute('data-name', product.name);
  button.setAttribute('data-price', String(product.price));
  button.setAttribute('data-url', product.url);
};

const createHomeProduct = (product, index) => {
  const card = makeElement('article', 'product-card reveal');
  const figure = makeElement('figure');
  const image = makeElement('img');
  image.src = product.image;
  image.alt = product.name;
  image.loading = 'lazy';
  figure.append(image);

  const meta = makeElement('div', 'card-meta');
  const buyLink = makeElement('a', 'buy-button');
  buyLink.href = product.url;
  buyLink.target = '_blank';
  buyLink.rel = 'noopener';
  buyLink.setAttribute('aria-label', `${product.name} 장바구니에 담기`);
  configureCartButton(buyLink, product);
  buyLink.append(makeElement('span', '', '담기'), makeElement('span', '', '+'));
  const row = makeElement('div', 'product-card-row');
  row.append(makeElement('strong', 'product-price', `${priceFormatter.format(product.price)}원`), buyLink);
  meta.append(
    makeElement('span', '', `${String(index + 1).padStart(2, '0')} · CURATED`),
    makeElement('h3', '', product.name),
    makeElement('p', 'product-tagline', product.tagline || ''),
    row
  );
  card.append(figure, meta);
  return card;
};

const createFeaturedProduct = (product) => {
  const card = makeElement('article', 'featured-product-card reveal');
  const figure = makeElement('figure');
  const image = makeElement('img');
  image.src = product.image;
  image.alt = product.name;
  figure.append(image);

  const body = makeElement('div', 'featured-product-body');
  const buyLink = makeElement('a', 'button button-dark');
  buyLink.href = product.url;
  buyLink.target = '_blank';
  buyLink.rel = 'noopener';
  buyLink.setAttribute('aria-label', `${product.name} 장바구니에 담기`);
  configureCartButton(buyLink, product);
  buyLink.append(makeElement('span', '', '담기'), makeElement('span', '', '+'));
  body.append(
    makeElement('span', 'featured-product-label', 'NORIBOX PICK'),
    makeElement('h3', '', product.name),
    makeElement('p', 'featured-product-tagline', product.tagline || ''),
    makeElement('strong', 'featured-product-price', `${priceFormatter.format(product.price)}원`),
    buyLink
  );
  card.append(figure, body);
  return card;
};

const createCatalogProduct = (product, index) => {
  const card = makeElement('article', 'catalog-card reveal');
  const figure = makeElement('figure');
  const image = makeElement('img');
  image.src = product.image;
  image.alt = product.name;
  image.loading = 'lazy';
  figure.append(image);

  const body = makeElement('div', 'catalog-card-body');
  const title = makeElement('h2', '', product.name);
  const row = makeElement('div', 'catalog-card-row');
  const buyLink = makeElement('a', 'buy-button');
  buyLink.href = product.url;
  buyLink.target = '_blank';
  buyLink.rel = 'noopener';
  buyLink.setAttribute('aria-label', `${product.name} 장바구니에 담기`);
  configureCartButton(buyLink, product);
  buyLink.append(makeElement('span', '', '담기'), makeElement('span', '', '+'));
  row.append(makeElement('strong', 'catalog-card-price', `${priceFormatter.format(product.price)}원`), buyLink);
  body.append(makeElement('span', 'catalog-card-index', `PRODUCT · ${String(index + 1).padStart(2, '0')}`), title, row);
  card.append(figure, body);
  return card;
};

const showProductError = (container) => {
  const error = makeElement('div', 'products-error');
  error.append(
    makeElement('strong', '', '제품 정보를 불러오지 못했습니다.'),
    makeElement('p', '', '잠시 후 다시 시도하거나 공식 스마트스토어를 이용해 주세요.')
  );
  container.replaceChildren(error);
};

const homeProducts = document.querySelector('[data-home-products]');
const featuredProduct = document.querySelector('[data-featured-product]');
const catalogProducts = document.querySelector('[data-products]');
if (homeProducts || featuredProduct || catalogProducts) {
  fetch('products.json')
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      if (!Array.isArray(data.products)) throw new Error('Invalid product data');

      if (homeProducts && featuredProduct) {
        const featured = data.products.find((product) => product.name === '노리박스 신형HX 32+ 강화유리 아크릴튜닝 스탠드형 오락실게임기') || data.products[0];
        const featuredCard = createFeaturedProduct(featured);
        const cards = data.products.filter((product) => product !== featured).slice(0, 5).map(createHomeProduct);
        featuredProduct.replaceChildren(featuredCard);
        homeProducts.replaceChildren(...cards);
        activateReveal([featuredCard, ...cards]);
      }

      if (catalogProducts) {
        const cards = data.products.map(createCatalogProduct);
        catalogProducts.replaceChildren(...cards);
        activateReveal(cards);
        const productCount = document.querySelector('[data-product-count]');
        if (productCount) productCount.textContent = `전체 ${data.products.length}개 제품 · ${data.collectedAt} 기준`;
      }
    })
    .catch(() => {
      if (homeProducts) showProductError(homeProducts);
      if (featuredProduct) showProductError(featuredProduct);
      if (catalogProducts) showProductError(catalogProducts);
    });
}

const formatStoryDate = (value) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value || '';
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
};

const homeStories = document.querySelector('[data-home-stories]');
if (homeStories) {
  fetch('story/posts.json', { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((posts) => {
      if (!Array.isArray(posts)) throw new Error('Invalid story data');
      const latest = posts
        .slice()
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
        .slice(0, 3);
      const cards = latest.map((post) => {
        const card = makeElement('article', 'story-card reveal');
        const href = post.url
          ? `story/${String(post.url).replace(/^\.\//, '')}`
          : `story/post.html?id=${encodeURIComponent(post.id || '')}`;
        card.append(
          makeElement('span', '', formatStoryDate(post.date)),
          makeElement('h3', '', post.title || '(제목 없음)'),
          makeElement('p', '', post.summary || '')
        );
        const link = makeElement('a', '', '이야기 읽기 ');
        link.href = href;
        const arrow = makeElement('span', '', '→');
        arrow.setAttribute('aria-hidden', 'true');
        link.append(arrow);
        card.append(link);
        return card;
      });
      homeStories.replaceChildren(...cards);
      activateReveal(cards);
    })
    .catch(() => {
      const error = makeElement('p', 'stories-loading', '이야기를 불러오지 못했습니다.');
      homeStories.replaceChildren(error);
    });
}

const form = document.querySelector('[data-contact-form]');
const formNote = document.querySelector('[data-form-note]');
if (form && formNote) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    formNote.textContent = '문의가 입력되었습니다. 실제 운영 전 전송 기능을 연결해 주세요.';
    formNote.classList.add('is-success');
  });
}

document.querySelectorAll('[data-year]').forEach((element) => {
  element.textContent = new Date().getFullYear();
});
