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

const updateHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 24);
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

activateReveal(document.querySelectorAll('.reveal'));

const priceFormatter = new Intl.NumberFormat('ko-KR');

const makeElement = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

const createHomeProduct = (product, index) => {
  const card = makeElement('article', `product-card reveal${index === 2 ? ' product-card-wide' : ''}`);
  const link = makeElement('a');
  link.href = product.url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.setAttribute('aria-label', `${product.name} 구매하기`);

  const figure = makeElement('figure');
  const image = makeElement('img');
  image.src = product.image;
  image.alt = product.name;
  image.loading = 'lazy';
  figure.append(image);

  const meta = makeElement('div', 'card-meta');
  meta.append(
    makeElement('span', '', `${String(index + 1).padStart(2, '0')} · SMARTSTORE`),
    makeElement('h3', '', product.name),
    makeElement('p', 'product-price', `${priceFormatter.format(product.price)}원`),
    makeElement('i', '', '↗')
  );
  meta.lastElementChild.setAttribute('aria-hidden', 'true');
  link.append(figure, meta);
  card.append(link);
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
  buyLink.setAttribute('aria-label', `${product.name} 구매하기`);
  buyLink.append(makeElement('span', '', '구매하기'), makeElement('span', '', '↗'));
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
const catalogProducts = document.querySelector('[data-products]');
if (homeProducts || catalogProducts) {
  fetch('products.json')
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      if (!Array.isArray(data.products)) throw new Error('Invalid product data');

      if (homeProducts) {
        const cards = data.products.slice(0, 3).map(createHomeProduct);
        homeProducts.replaceChildren(...cards);
        activateReveal(cards);
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
      if (catalogProducts) showProductError(catalogProducts);
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
