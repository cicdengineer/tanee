const productGrid = document.getElementById('productGrid');
const search = document.getElementById('search');
const filters = document.getElementById('filters');
const selected = new Set(JSON.parse(localStorage.getItem('tanee-selection') || '[]'));
let families = ['All'];
let products = [];
let activeFamily = 'All';
let activeProduct = null;
let lastFocus = null;

const byId = id => products.find(product => product.id === id);
const imagePath = (product, view = 'folded') => product.images[view] || product.images.body || Object.values(product.images)[0];
const designCode = product => product.sku || `TANEE-${product.id.toUpperCase()}`;
const priceLabel = product => product.price == null ? null : new Intl.NumberFormat('en-IN', {style:'currency', currency:'INR', maximumFractionDigits:2}).format(product.price);

let banners = [
  {label: 'Colour in every fold', first: 'Beautiful from', second: 'every fold.', description: 'Discover striking shades, graceful folds and borders that draw the eye.', image: 'assets/banners/elegant-folds.webp', alt: 'Teal, maroon, magenta and mauve sarees folded on ivory', theme: 'light'},
  {label: 'The black and gold edit', first: 'A statement in', second: 'black & gold.', description: 'A classic contrast with a luminous finish, made for a memorable entrance.', image: 'assets/banners/black-gold.webp', alt: 'Close view of a black saree with gold woven details', theme: 'dark'},
  {label: 'The contrast edit', first: 'Contrast that', second: 'captivates.', description: 'Charcoal and mustard meet in a bold pairing with a beautiful border.', image: 'assets/banners/charcoal-mustard.webp', alt: 'Charcoal and mustard saree with a metallic border', theme: 'light'},
  {label: 'Colour stories', first: 'Colour,', second: 'beautifully paired.', description: 'Teal and magenta bring fresh energy to a timeless drape.', image: 'assets/banners/teal-magenta.webp', alt: 'Teal and magenta sarees draped together on ivory', theme: 'light'},
  {label: 'Softly expressive', first: 'Soft tones.', second: 'Lasting impression.', description: 'A quieter palette of sage and mauve, full of movement and detail.', image: 'assets/banners/sage-mauve.webp', alt: 'Sage and mauve sarees arranged in soft waves', theme: 'light'}
];
const bannerHero = document.querySelector('.banner-hero');
const bannerLayers = [...document.querySelectorAll('.banner-slide')];
const bannerPagination = document.getElementById('bannerPagination');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let bannerIndex = 0;
let bannerLayer = 0;
let bannerTimer;
let bannerRequest = 0;

function scheduleBanner() {
  clearTimeout(bannerTimer);
  if (!reduceMotion.matches && !document.hidden && !bannerHero.matches(':hover') && !bannerHero.matches(':focus-within')) {
    bannerTimer = setTimeout(() => showBanner((bannerIndex + 1) % banners.length), 6500);
  }
}

async function showBanner(index) {
  const request = ++bannerRequest;
  bannerIndex = (index + banners.length) % banners.length;
  const banner = banners[bannerIndex];
  const nextLayer = 1 - bannerLayer;
  const image = bannerLayers[nextLayer].querySelector('img');
  image.src = banner.image;
  image.alt = banner.alt;
  try { await image.decode(); } catch { return; }
  if (request !== bannerRequest) return;
  document.getElementById('bannerEyebrow').textContent = `✦  ${banner.label.toUpperCase()}`;
  const title = document.getElementById('hero-title');
  const emphasis = document.createElement('em'); emphasis.textContent = banner.second;
  title.replaceChildren(document.createTextNode(banner.first), document.createElement('br'), emphasis);
  document.getElementById('bannerDescription').textContent = banner.description;
  document.getElementById('bannerPosition').textContent = `${String(bannerIndex + 1).padStart(2, '0')} / ${String(banners.length).padStart(2, '0')}`;
  bannerHero.dataset.theme = banner.theme;
  bannerPagination.querySelectorAll('button').forEach((button, buttonIndex) => {
    button.classList.toggle('active', buttonIndex === bannerIndex);
    button.setAttribute('aria-current', String(buttonIndex === bannerIndex));
  });
  bannerLayers[nextLayer].classList.add('is-active');
  bannerLayers[bannerLayer].classList.remove('is-active');
  bannerLayers[nextLayer].setAttribute('aria-hidden', 'false');
  bannerLayers[bannerLayer].setAttribute('aria-hidden', 'true');
  bannerLayer = nextLayer;
  scheduleBanner();
}

function buildBannerPagination() {
  bannerPagination.replaceChildren();
  banners.forEach((banner, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', `Show banner ${index + 1}: ${banner.label}`);
    button.setAttribute('aria-current', String(index === 0));
    button.className = index === 0 ? 'active' : '';
    button.addEventListener('click', () => showBanner(index));
    bannerPagination.append(button);
  });
}
buildBannerPagination();
document.getElementById('bannerPrevious').addEventListener('click', () => showBanner(bannerIndex - 1));
document.getElementById('bannerNext').addEventListener('click', () => showBanner(bannerIndex + 1));
bannerHero.addEventListener('mouseenter', () => clearTimeout(bannerTimer));
bannerHero.addEventListener('mouseleave', scheduleBanner);
bannerHero.addEventListener('focusin', () => clearTimeout(bannerTimer));
bannerHero.addEventListener('focusout', () => setTimeout(scheduleBanner, 0));
document.addEventListener('visibilitychange', scheduleBanner);
scheduleBanner();

function saveSelection() {
  localStorage.setItem('tanee-selection', JSON.stringify([...selected]));
  updateSelection();
  renderProducts();
  if (!document.getElementById('selectionOverlay').hidden) renderSelection();
  if (activeProduct) updateDetailButton();
}

function toggleSelection(id) {
  selected.has(id) ? selected.delete(id) : selected.add(id);
  saveSelection();
}

function updateSelection() {
  const count = selected.size;
  document.getElementById('headerCount').textContent = count;
  document.getElementById('floatingCount').textContent = count;
  document.getElementById('floatingSelection').hidden = count === 0;
  document.getElementById('selectionCount').textContent = `(${count})`;
}

function renderFilters() {
  filters.replaceChildren();
  for (const family of families) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `filter${activeFamily === family ? ' active' : ''}`;
    button.textContent = family;
    button.setAttribute('aria-pressed', String(activeFamily === family));
    button.addEventListener('click', () => { activeFamily = family; renderFilters(); renderProducts(); });
    filters.append(button);
  }
}

function renderProducts() {
  const query = search.value.trim().toLowerCase();
  const visible = products.filter(product =>
    (activeFamily === 'All' || product.family === activeFamily) &&
    (product.name.toLowerCase().includes(query) || product.family.toLowerCase().includes(query) || designCode(product).toLowerCase().includes(query))
  );
  const sort = document.getElementById('sortProducts').value;
  if (sort === 'oldest') visible.reverse();
  if (sort === 'price-asc' || sort === 'price-desc') visible.sort((a, b) => {
    if (a.price == null && b.price == null) return 0;
    if (a.price == null) return 1;
    if (b.price == null) return -1;
    return sort === 'price-asc' ? Number(a.price) - Number(b.price) : Number(b.price) - Number(a.price);
  });
  document.getElementById('collectionCount').textContent = `${visible.length} designs`;
  document.getElementById('emptyState').hidden = visible.length !== 0;
  productGrid.replaceChildren();
  for (const product of visible) {
    const article = document.createElement('article');
    article.className = 'product-card';
    const photo = document.createElement('div');
    photo.className = 'product-photo';
    const img = document.createElement('img');
    img.src = imagePath(product);
    img.alt = `${product.name} Tanee saree, folded view`;
    img.loading = 'lazy';
    const open = document.createElement('button');
    open.className = 'photo-open';
    open.type = 'button';
    open.setAttribute('aria-label', `View ${product.name} details`);
    open.addEventListener('click', () => openDetail(product));
    const quick = document.createElement('span');
    quick.className = 'quick-view'; quick.textContent = 'View details ↗';
    const save = document.createElement('button');
    save.className = `save-button${selected.has(product.id) ? ' saved' : ''}`;
    save.type = 'button';
    save.textContent = selected.has(product.id) ? '♥' : '♡';
    save.setAttribute('aria-label', `${selected.has(product.id) ? 'Remove' : 'Save'} ${product.name} ${selected.has(product.id) ? 'from' : 'to'} selection`);
    save.setAttribute('aria-pressed', String(selected.has(product.id)));
    save.addEventListener('click', () => toggleSelection(product.id));
    photo.append(img, open, quick, save);
    const info = document.createElement('div'); info.className = 'product-info';
    const words = document.createElement('div');
    const title = document.createElement('h3'); title.textContent = product.name;
    const category = document.createElement('p'); category.textContent = `${product.family} collection`;
    words.append(title, category);
    if (priceLabel(product)) { const price = document.createElement('strong'); price.className = 'product-price'; price.textContent = priceLabel(product); words.append(price); }
    const arrow = document.createElement('button'); arrow.type = 'button'; arrow.textContent = '↗';
    arrow.setAttribute('aria-label', `View ${product.name} details`);
    arrow.addEventListener('click', () => openDetail(product));
    info.append(words, arrow); article.append(photo, info); productGrid.append(article);
  }
}

function showOverlay(id) {
  lastFocus = document.activeElement;
  document.getElementById(id).hidden = false;
  document.body.classList.add('modal-open');
  document.getElementById(id).querySelector('.icon-close').focus();
}
function closeOverlay(id) {
  document.getElementById(id).hidden = true;
  document.body.classList.remove('modal-open');
  activeProduct = null;
  lastFocus?.focus();
}

function updateDetailButton() {
  const button = document.getElementById('detailAdd');
  button.textContent = selected.has(activeProduct.id) ? 'Remove from selection −' : 'Add to my selection +';
  button.setAttribute('aria-pressed', String(selected.has(activeProduct.id)));
}

function openDetail(product) {
  activeProduct = product;
  document.getElementById('detailTitle').textContent = product.name;
  document.querySelector('.detail-copy > p').textContent = `Explore ${Object.keys(product.images).length} available views of this design.`;
  document.getElementById('detailCode').textContent = designCode(product);
  document.getElementById('detailPrice').textContent = priceLabel(product) || 'Ask us for the price';
  const detailImage = document.getElementById('detailImage');
  const thumbs = document.getElementById('detailThumbs');
  thumbs.replaceChildren();
  for (const [view, path] of Object.entries(product.images)) {
    const button = document.createElement('button'); button.type = 'button';
    button.setAttribute('aria-label', `Show ${view} view`);
    const image = document.createElement('img'); image.src = path; image.alt = '';
    button.append(image);
    button.addEventListener('click', () => {
      detailImage.src = path;
      detailImage.alt = `${product.name} saree, ${view} view`;
      thumbs.querySelectorAll('button').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
    });
    thumbs.append(button);
  }
  thumbs.firstElementChild?.click();
  updateDetailButton();
  showOverlay('detailOverlay');
  history.replaceState(null, '', `#product=${encodeURIComponent(product.id)}`);
}

function renderSelection() {
  const items = document.getElementById('selectionItems');
  items.replaceChildren();
  const chosen = [...selected].map(byId).filter(Boolean);
  if (!chosen.length) {
    const empty = document.createElement('p');
    empty.className = 'selection-empty';
    empty.textContent = 'Your selection is empty. Tap the heart on any design to save it here.';
    items.append(empty);
  }
  for (const product of chosen) {
    const row = document.createElement('div'); row.className = 'selection-item';
    const image = document.createElement('img'); image.src = imagePath(product); image.alt = '';
    const details = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = product.name;
    const code = document.createElement('small'); code.textContent = designCode(product);
    details.append(name, code);
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove ${product.name}`);
    remove.addEventListener('click', () => toggleSelection(product.id));
    row.append(image, details, remove); items.append(row);
  }
  const link = document.getElementById('whatsappLink');
  const lines = chosen.map((product, index) => `${index + 1}. ${product.name} (${designCode(product)})${priceLabel(product) ? ` — ${priceLabel(product)}` : ''}`);
  const message = `Hello Tanee, I'm interested in these sarees:\n\n${lines.join('\n')}\n\nPlease share price and availability. Thank you!`;
  link.href = chosen.length ? `https://wa.me/918073324411?text=${encodeURIComponent(message)}` : '#';
  link.classList.toggle('disabled', chosen.length === 0);
  link.setAttribute('aria-disabled', String(chosen.length === 0));
}

function openSelection() { renderSelection(); showOverlay('selectionOverlay'); }

document.querySelectorAll('#headerSelection,#floatingSelection,#closingSelection').forEach(button => button.addEventListener('click', openSelection));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => {
  closeOverlay(button.dataset.close === 'detail' ? 'detailOverlay' : 'selectionOverlay');
  if (location.hash.startsWith('#product=')) history.replaceState(null, '', '#collection');
}));
document.getElementById('detailAdd').addEventListener('click', () => toggleSelection(activeProduct.id));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (!document.getElementById('detailOverlay').hidden) closeOverlay('detailOverlay');
    if (!document.getElementById('selectionOverlay').hidden) closeOverlay('selectionOverlay');
  }
});
search.addEventListener('input', renderProducts);
document.getElementById('sortProducts').addEventListener('change', renderProducts);

async function loadCatalogue() {
  const response = await fetch('admin/api.php?route=public', {cache:'no-store'});
  let data;
  if (response.ok && (response.headers.get('content-type') || '').includes('application/json')) data = await response.json();
  else if (response.status === 404 || !(response.headers.get('content-type') || '').includes('application/json')) {
    const fallback = await fetch('catalogue.json');
    if (!fallback.ok) throw new Error('Catalogue unavailable');
    data = await fallback.json();
  } else throw new Error('Catalogue unavailable');
  return data;
}

loadCatalogue().then(data => {
  products = (Array.isArray(data) ? data : data.products).filter(product => product.qty == null || product.qty > 0);
  for (const id of selected) if (!products.some(product => product.id === id)) selected.delete(id);
  localStorage.setItem('tanee-selection', JSON.stringify([...selected]));
  const categoryNames = [...new Set(products.map(product => product.family))];
  const categoryOrder = ['Vaibhava', 'Aabharana', 'Saumya', 'Pallava', 'Shikha', 'Alankara', 'Mudra - Slim Border', 'Tarang - Medium Border', 'Virasat - Broad Border'];
  families = ['All', ...categoryOrder.filter(name => categoryNames.includes(name)), ...categoryNames.filter(name => !categoryOrder.includes(name))];
  if (Array.isArray(data.banners) && data.banners.length) { banners = data.banners; bannerIndex = 0; buildBannerPagination(); showBanner(0); }
  renderFilters(); updateSelection(); renderProducts();
  if (location.hash.startsWith('#product=')) {
    const product = byId(decodeURIComponent(location.hash.slice(9)));
    if (product) openDetail(product);
  }
}).catch(() => {
  document.getElementById('emptyState').hidden = false;
  document.getElementById('emptyState').textContent = 'The catalogue could not load. Please refresh the page.';
});
