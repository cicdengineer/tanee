const apiUrl = route => `api.php?route=${route}`;
const $ = id => document.getElementById(id);
const money = value => value == null ? 'Price not set' : new Intl.NumberFormat('en-IN', {style:'currency', currency:'INR', maximumFractionDigits:2}).format(value);
const views = ['folded', 'body', 'pallu', 'blouse'];
const skuFor = number => `SDM${String(Math.floor((number - 1) / 99) + 1).padStart(2, '0')}-${String((number - 1) % 99 + 1).padStart(2, '0')}`;
function nextSku() {
  const used = new Set(catalogue.products.map(product => product.sku));
  const highest = Math.max(0, ...catalogue.products.map(product => {
    const match = /^SDM(\d{2})-(\d{2})$/.exec(product.sku || '');
    return match ? (Number(match[1]) - 1) * 99 + Number(match[2]) : 0;
  }));
  for (let number = highest + 1; number <= 9801; number++) if (!used.has(skuFor(number))) return skuFor(number);
  for (let number = 1; number <= highest; number++) if (!used.has(skuFor(number))) return skuFor(number);
  return '';
}
let csrf = null;
let catalogue = {categories:[], products:[], banners:[]};
let savedVersion = '';
let dirty = false;
let editingId = null;
let draftImages = {};
let editingBannerIndex = null;
let bannerDraftImage = '';

async function request(route, options = {}) {
  const response = await fetch(apiUrl(route), {credentials:'same-origin', cache:'no-store', ...options, headers:{...(options.body instanceof FormData ? {} : {'Content-Type':'application/json'}), ...(csrf ? {'X-CSRF-Token':csrf} : {}), ...options.headers}});
  let data;
  try { data = await response.json(); } catch { throw new Error('This admin panel needs a PHP-enabled web server.'); }
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function message(text, error = false) {
  const target = $('workspace').hidden ? $('loginMessage') : $('workMessage');
  target.textContent = text;
  target.classList.toggle('error', error);
}

function setDirty() {
  dirty = true;
  $('saveStatus').textContent = 'Unsaved changes';
  $('saveButton').disabled = false;
  renderAll();
}

function renderAll() {
  $('designCount').textContent = catalogue.products.length;
  $('categoryCount').textContent = catalogue.categories.length;
  $('pricedCount').textContent = catalogue.products.filter(product => product.price != null).length;
  const categories = ['All categories', ...catalogue.categories];
  const selected = $('categoryFilter').value;
  $('categoryFilter').replaceChildren(...categories.map(category => option(category)));
  $('categoryFilter').value = categories.includes(selected) ? selected : 'All categories';
  for (const id of ['bulkFrom', 'bulkTo', 'codeCategory', 'productCategory']) {
    const select = $(id), current = select.value;
    const names = id === 'bulkTo' ? ['', ...catalogue.categories] : catalogue.categories;
    select.replaceChildren(...names.map(name => option(name, name || 'Keep current category')));
    if (names.includes(current)) select.value = current;
  }
  renderProducts(); renderOutOfStock(); renderCategories(); renderBanners();
}

function option(value, label = value) {
  const element = document.createElement('option'); element.value = value; element.textContent = label; return element;
}

function renderProducts() {
  const query = $('productSearch').value.trim().toLowerCase();
  const category = $('categoryFilter').value;
  const shown = catalogue.products.filter(product =>
    (category === 'All categories' || product.family === category) &&
    (product.name.toLowerCase().includes(query) || product.id.includes(query) || (product.sku || '').toLowerCase().includes(query)));
  const list = $('productList'); list.replaceChildren();
  if (!shown.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No designs match this search.'; list.append(empty); }
  for (const product of shown) {
    const row = document.createElement('article'); row.className = 'product-row';
    const image = document.createElement('img'); image.src = '../' + (product.images.folded || Object.values(product.images)[0]); image.alt = '';
    const details = document.createElement('div');
    const title = document.createElement('h3'); title.textContent = product.name;
    const meta = document.createElement('p'); meta.textContent = `${product.sku || 'Design code missing'} · ${product.family} · Qty ${product.qty ?? 'not set'}${product.qty === 0 ? ' · Off site' : ''}`;
    details.append(title, meta);
    const price = document.createElement('strong'); price.textContent = money(product.price);
    const edit = document.createElement('button'); edit.className = 'secondary'; edit.textContent = 'Edit ↗'; edit.addEventListener('click', () => openEditor(product));
    row.append(image, details, price, edit); list.append(row);
  }
}

function renderOutOfStock() {
  const products = catalogue.products.filter(product => product.qty === 0);
  $('outOfStockCount').textContent = products.length;
  const list = $('outOfStockList'); list.replaceChildren();
  if (!products.length) {
    const empty = document.createElement('p'); empty.className = 'empty';
    empty.textContent = 'No designs are out of stock.'; list.append(empty);
  }
  for (const product of products) {
    const row = document.createElement('article'); row.className = 'product-row stock-row';
    const image = document.createElement('img'); image.src = '../' + (product.images.folded || Object.values(product.images)[0]); image.alt = '';
    const details = document.createElement('div');
    const title = document.createElement('h3'); title.textContent = product.name;
    const meta = document.createElement('p'); meta.textContent = `${product.sku} · ${product.family} · Qty ${product.qty} · Off site`;
    details.append(title, meta);
    const edit = document.createElement('button'); edit.className = 'secondary'; edit.textContent = 'Update Qty ↗';
    edit.addEventListener('click', () => openEditor(product));
    row.append(image, details, edit); list.append(row);
  }
}

function renderCategories() {
  const list = $('categoryList'); list.replaceChildren();
  for (const name of catalogue.categories) {
    const count = catalogue.products.filter(product => product.family === name).length;
    const row = document.createElement('div'); row.className = 'category-row';
    const label = document.createElement('strong'); label.textContent = name;
    const number = document.createElement('span'); number.textContent = `${count} designs`;
    const rename = document.createElement('button'); rename.className = 'text-button'; rename.textContent = 'Rename';
    rename.addEventListener('click', () => {
      const replacement = prompt('New category name', name)?.trim();
      if (!replacement || replacement === name) return;
      if (!validCategory(replacement) || catalogue.categories.includes(replacement)) return message('Enter a unique category name (letters, numbers, spaces, & or -).', true);
      catalogue.categories[catalogue.categories.indexOf(name)] = replacement;
      catalogue.products.forEach(product => { if (product.family === name) product.family = replacement; });
      setDirty(); message(`${name} renamed to ${replacement}. Save to publish.`);
    });
    const remove = document.createElement('button'); remove.className = 'text-button danger'; remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      if (count) return message(`Move the ${count} designs in ${name} to another category first.`, true);
      if (!confirm(`Remove the empty category ${name}?`)) return;
      catalogue.categories = catalogue.categories.filter(category => category !== name); setDirty();
    });
    row.append(label, number, rename, remove); list.append(row);
  }
}

function validCategory(value) { return /^[\p{L}\p{N} &-]{1,50}$/u.test(value); }

function renderBanners() {
  const list = $('bannerList'); list.replaceChildren();
  catalogue.banners.forEach((banner, index) => {
    const row = document.createElement('article'); row.className = 'banner-row';
    const image = document.createElement('img'); image.src = '../' + banner.image; image.alt = '';
    const details = document.createElement('div');
    const label = document.createElement('small'); label.textContent = `SLIDE ${String(index + 1).padStart(2, '0')} · ${banner.label}`;
    const title = document.createElement('h3'); title.textContent = `${banner.first} ${banner.second}`;
    const description = document.createElement('p'); description.textContent = banner.description;
    details.append(label, title, description);
    const actions = document.createElement('div'); actions.className = 'banner-actions';
    const up = document.createElement('button'); up.className = 'text-button'; up.textContent = '↑'; up.title = 'Move earlier'; up.disabled = index === 0;
    up.addEventListener('click', () => { [catalogue.banners[index - 1], catalogue.banners[index]] = [catalogue.banners[index], catalogue.banners[index - 1]]; setDirty(); });
    const down = document.createElement('button'); down.className = 'text-button'; down.textContent = '↓'; down.title = 'Move later'; down.disabled = index === catalogue.banners.length - 1;
    down.addEventListener('click', () => { [catalogue.banners[index + 1], catalogue.banners[index]] = [catalogue.banners[index], catalogue.banners[index + 1]]; setDirty(); });
    const edit = document.createElement('button'); edit.className = 'secondary'; edit.textContent = 'Edit ↗'; edit.addEventListener('click', () => openBannerEditor(index));
    actions.append(up, down, edit); row.append(image, details, actions); list.append(row);
  });
}

function openBannerEditor(index = null) {
  editingBannerIndex = index;
  const banner = index === null ? null : catalogue.banners[index];
  bannerDraftImage = banner?.image || '';
  $('bannerEditorTitle').textContent = banner ? 'Edit banner' : 'Add banner';
  $('bannerLabel').value = banner?.label || '';
  $('bannerFirst').value = banner?.first || '';
  $('bannerSecond').value = banner?.second || '';
  $('bannerDescriptionInput').value = banner?.description || '';
  $('bannerAlt').value = banner?.alt || '';
  $('bannerTheme').value = banner?.theme || 'light';
  $('bannerPreview').src = bannerDraftImage ? '../' + bannerDraftImage : '';
  $('bannerPreview').hidden = !bannerDraftImage;
  $('bannerImageStatus').textContent = bannerDraftImage ? 'Image ready' : 'Upload a landscape image, up to 8 MB.';
  $('bannerImage').value = '';
  $('deleteBanner').hidden = index === null;
  $('bannerDialog').showModal();
}

$('bannerImage').addEventListener('change', async () => {
  const file = $('bannerImage').files[0]; if (!file) return;
  const body = new FormData(); body.append('image', file);
  $('bannerImageStatus').textContent = 'Uploading…'; $('bannerImage').disabled = true;
  try { const result = await request('upload', {method:'POST', body}); bannerDraftImage = result.path; $('bannerPreview').src = '../' + result.path; $('bannerPreview').hidden = false; $('bannerImageStatus').textContent = 'Image ready'; }
  catch (error) { $('bannerImageStatus').textContent = error.message; }
  finally { $('bannerImage').disabled = false; }
});

$('bannerForm').addEventListener('submit', event => {
  event.preventDefault();
  if (!bannerDraftImage) return message('Upload a banner image.', true);
  const banner = {label:$('bannerLabel').value.trim(), first:$('bannerFirst').value.trim(), second:$('bannerSecond').value.trim(), description:$('bannerDescriptionInput').value.trim(), alt:$('bannerAlt').value.trim(), image:bannerDraftImage, theme:$('bannerTheme').value};
  if (editingBannerIndex === null) catalogue.banners.push(banner); else catalogue.banners[editingBannerIndex] = banner;
  $('bannerDialog').close(); setDirty(); message('Banner updated. Save to publish.');
});
$('deleteBanner').addEventListener('click', () => {
  if (catalogue.banners.length === 1) return message('Keep at least one banner.', true);
  if (!confirm('Delete this banner?')) return;
  catalogue.banners.splice(editingBannerIndex, 1); $('bannerDialog').close(); setDirty();
});
$('closeBannerEditor').addEventListener('click', () => $('bannerDialog').close());
$('addBanner').addEventListener('click', () => openBannerEditor());

function openEditor(product = null) {
  editingId = product?.id || null;
  draftImages = {...(product?.images || {})};
  $('editorTitle').textContent = product ? 'Edit design' : 'Add a design';
  $('productId').value = product?.id || '';
  $('productId').readOnly = !!product;
  $('productSku').value = product?.sku || nextSku();
  $('productName').value = product?.name || '';
  $('productCategory').replaceChildren(...catalogue.categories.map(name => option(name)));
  $('productCategory').value = product?.family || catalogue.categories[0] || '';
  $('productPrice').value = product?.price ?? '';
  $('productQty').value = product?.qty ?? '';
  $('deleteProduct').hidden = !product;
  renderImages(); $('productDialog').showModal();
}

function renderImages() {
  const container = $('imageFields'); container.replaceChildren();
  for (const view of views) {
    const row = document.createElement('div'); row.className = 'image-row';
    const thumbnail = document.createElement('img'); thumbnail.alt = `${view} preview`;
    if (draftImages[view]) thumbnail.src = '../' + draftImages[view]; else thumbnail.className = 'placeholder';
    const label = document.createElement('label'); label.textContent = view[0].toUpperCase() + view.slice(1);
    const file = document.createElement('input'); file.type = 'file'; file.accept = 'image/jpeg,image/png,image/webp';
    const status = document.createElement('small'); status.textContent = draftImages[view] ? 'Image ready' : 'No image';
    file.addEventListener('change', async () => {
      if (!file.files[0]) return;
      const body = new FormData(); body.append('image', file.files[0]);
      status.textContent = 'Uploading…'; file.disabled = true;
      try { const result = await request('upload', {method:'POST', body}); draftImages[view] = result.path; renderImages(); }
      catch (error) { status.textContent = error.message; file.disabled = false; }
    });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button danger'; remove.textContent = 'Remove'; remove.disabled = !draftImages[view];
    remove.addEventListener('click', () => { delete draftImages[view]; renderImages(); });
    label.append(file, status); row.append(thumbnail, label, remove); container.append(row);
  }
}

$('productForm').addEventListener('submit', event => {
  event.preventDefault();
  const id = $('productId').value.trim(), name = $('productName').value.trim(), sku = $('productSku').value.trim().toUpperCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return message('Use lowercase letters, numbers and hyphens in the internal link ID.', true);
  if (!/^SDM(?:0[1-9]|[1-9][0-9])-(?:0[1-9]|[1-9][0-9])$/.test(sku)) return message('Use a design code such as SDM01-01.', true);
  if (catalogue.products.some(product => product.sku === sku && product.id !== editingId)) return message('That design code already exists.', true);
  if (!editingId && catalogue.products.some(product => product.id === id)) return message('That internal link ID already exists.', true);
  if (!Object.keys(draftImages).length) return message('Add at least one image.', true);
  const product = {id, sku, name, family:$('productCategory').value, price:$('productPrice').value === '' ? null : Number($('productPrice').value), qty:$('productQty').value === '' ? null : Number($('productQty').value), images:{...draftImages}};
  if (editingId) catalogue.products[catalogue.products.findIndex(item => item.id === editingId)] = product;
  else catalogue.products.unshift(product);
  $('productDialog').close(); setDirty(); message(`${name} updated. Save to publish.`);
});

$('deleteProduct').addEventListener('click', () => {
  if (!editingId || !confirm(`Delete ${$('productName').value} from the catalogue?`)) return;
  catalogue.products = catalogue.products.filter(product => product.id !== editingId);
  $('productDialog').close(); setDirty(); message('Design removed. Save to publish.');
});
$('closeEditor').addEventListener('click', () => $('productDialog').close());
$('addProduct').addEventListener('click', () => openEditor());
$('productSearch').addEventListener('input', renderProducts);
$('categoryFilter').addEventListener('change', renderProducts);

$('categoryForm').addEventListener('submit', event => {
  event.preventDefault(); const name = $('newCategory').value.trim();
  if (!validCategory(name) || catalogue.categories.includes(name)) return message('Enter a unique category name (letters, numbers, spaces, & or -).', true);
  catalogue.categories.push(name); $('newCategory').value = ''; setDirty();
});

$('bulkForm').addEventListener('submit', event => {
  event.preventDefault(); const from = $('bulkFrom').value, to = $('bulkTo').value, price = $('bulkPrice').value, qty = $('bulkQty').value;
  if (!to && price === '' && qty === '') return message('Choose a new category, enter a price, or enter a quantity.', true);
  const matching = catalogue.products.filter(product => product.family === from);
  if (!matching.length) return message(`There are no designs in ${from}.`, true);
  for (const product of matching) { if (to) product.family = to; if (price !== '') product.price = Number(price); if (qty !== '') product.qty = Number(qty); }
  setDirty(); message(`Updated ${matching.length} designs. Save to publish.`);
});

$('categoryCodesForm').addEventListener('submit', event => {
  event.preventDefault();
  const category = $('codeCategory').value;
  const start = $('codeStart').value.trim().toUpperCase();
  if (!/^SDM(?:0[1-9]|[1-9][0-9])-(?:0[1-9]|[1-9][0-9])$/.test(start)) return message('Enter a first design code such as SDM02-01.', true);
  const matching = catalogue.products.filter(product => product.family === category);
  if (!matching.length) return message(`There are no designs in ${category}.`, true);
  const first = (Number(start.slice(3, 5)) - 1) * 99 + Number(start.slice(6));
  if (first + matching.length - 1 > 9801) return message('The sequence exceeds SDM99-99.', true);
  const proposed = matching.map((product, index) => skuFor(first + index));
  const outside = new Set(catalogue.products.filter(product => product.family !== category).map(product => product.sku));
  const conflict = proposed.find(code => outside.has(code));
  if (conflict) return message(`${conflict} is used by another category. Choose another first design code.`, true);
  matching.forEach((product, index) => { product.sku = proposed[index]; });
  setDirty(); message(`Renumbered ${matching.length} design codes in ${category}. Review and save to publish.`);
});

function download(name, content, type) {
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], {type})); link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
$('downloadCsv').addEventListener('click', () => download('tanee-prices.csv', 'id,price\n' + catalogue.products.map(p => `${p.id},${p.price ?? ''}`).join('\n'), 'text/csv'));
$('downloadJson').addEventListener('click', () => download('tanee-catalogue.json', JSON.stringify(catalogue, null, 2), 'application/json'));

function csvRows(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  row.push(cell); if (row.some(Boolean)) rows.push(row);
  if (quoted) throw new Error('CSV has an unclosed quote.');
  return rows;
}

$('importCsv').addEventListener('click', async () => {
  const file = $('csvFile').files[0]; if (!file) return message('Choose a CSV file first.', true);
  try {
    const rows = csvRows((await file.text()).replace(/^\uFEFF/, ''));
    if (rows.length < 2 || rows[0][0].trim().toLowerCase() !== 'id' || rows[0][1].trim().toLowerCase() !== 'price') throw new Error('CSV must start with id,price.');
    const updates = new Map();
    for (const row of rows.slice(1)) {
      const id = row[0]?.trim(), raw = row[1]?.trim();
      if (!id || !catalogue.products.some(product => product.id === id)) throw new Error(`Unknown design code: ${id || '(blank)'}`);
      if (raw === undefined) throw new Error(`Missing price column for ${id}.`);
      if (raw && (!/^\d+(?:\.\d{1,2})?$/.test(raw) || Number(raw) > 10000000)) throw new Error(`Invalid price for ${id}.`);
      updates.set(id, raw === '' ? null : Number(raw));
    }
    for (const product of catalogue.products) if (updates.has(product.id)) product.price = updates.get(product.id);
    setDirty(); message(`Applied ${updates.size} prices. Save to publish.`);
  } catch (error) { message(error.message, true); }
});

$('importJson').addEventListener('click', async () => {
  const file = $('jsonFile').files[0]; if (!file) return message('Choose a JSON file first.', true);
  try {
    const incoming = JSON.parse(await file.text());
    if (!Array.isArray(incoming.categories) || !Array.isArray(incoming.products) || !Array.isArray(incoming.banners)) throw new Error('JSON needs categories, products and banners arrays.');
    if (!confirm(`Replace your working catalogue with ${incoming.products.length} designs? You can still cancel before saving.`)) return;
    catalogue = incoming; setDirty(); message('JSON applied. Save to publish.');
  } catch (error) { message(error.message, true); }
});

$('saveButton').addEventListener('click', async () => {
  $('saveButton').disabled = true; $('saveStatus').textContent = 'Saving…';
  try { const result = await request('save', {method:'POST', body:JSON.stringify({version:savedVersion, catalogue})}); savedVersion = result.version; dirty = false; $('saveStatus').textContent = 'All changes saved'; message('Catalogue published successfully.'); }
  catch (error) { $('saveButton').disabled = false; $('saveStatus').textContent = 'Unsaved changes'; message(error.message, true); }
});

for (const button of document.querySelectorAll('[data-tab]')) button.addEventListener('click', () => {
  for (const tab of document.querySelectorAll('[data-tab]')) tab.classList.toggle('active', tab === button);
  for (const panel of document.querySelectorAll('.tab-panel')) panel.hidden = panel.id !== button.dataset.tab + 'Tab';
});

async function loadCatalogue() {
  const data = await request('admin'); catalogue = data.catalogue; savedVersion = data.version; dirty = false;
  $('loginView').hidden = true; $('workspace').hidden = false; $('logout').hidden = false;
  $('saveStatus').textContent = 'All changes saved'; $('saveButton').disabled = true;
  renderAll();
}

$('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('loginForm').querySelector('button'); button.disabled = true;
  try { const data = await request('login', {method:'POST', body:JSON.stringify({username:$('username').value, password:$('password').value})}); csrf = data.csrf; $('password').value = ''; await loadCatalogue(); }
  catch (error) { message(error.message, true); }
  finally { button.disabled = false; }
});

$('logout').addEventListener('click', async () => {
  if (dirty && !confirm('Discard unsaved changes and sign out?')) return;
  try { await request('logout', {method:'POST', body:'{}'}); } catch {}
  csrf = null; catalogue = {categories:[],products:[],banners:[]}; $('workspace').hidden = true; $('loginView').hidden = false; $('logout').hidden = true;
});

window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
request('session').then(data => { if (data.authenticated) { csrf = data.csrf; return loadCatalogue(); } }).catch(error => message(error.message, true));
