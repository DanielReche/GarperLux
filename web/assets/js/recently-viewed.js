/* GarperLux — historial de productos vistos recientemente (cliente).
 *
 * localStorage ('garperlux_recent_products') como única fuente de verdad: se
 * registra el SKU al abrir una ficha de producto y se pinta una tira tanto en
 * la propia ficha (excluyendo el producto actual) como en la home. Los datos
 * de cada producto (nombre, precio, imagen, marca) se piden al catálogo real
 * vía la API, así que la tira es 100 % dinámica desde MySQL.
 *
 * API pública: window.GarperLuxRecent = { record, getSkus, render }.
 */
(function () {
  'use strict';
  const KEY = 'garperlux_recent_products';
  const MAX = 12;

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
  const write = (arr) => localStorage.setItem(KEY, JSON.stringify(arr.slice(0, MAX)));

  function record(sku) {
    if (!sku) return;
    const arr = read().filter((s) => s !== sku);
    arr.unshift(sku);
    write(arr);
  }
  function getSkus(exclude) { return read().filter((s) => s !== exclude); }

  const money = (n) => (Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  const esc = (s) => String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  function card(p) {
    const img = p.image
      ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" class="w-full h-full object-contain p-3 transition-transform duration-500 group-hover:scale-105" onerror="this.style.display='none'">`
      : `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="text-graphite/30"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`;
    return `<a href="/pages/tienda/producto.html?sku=${encodeURIComponent(p.sku)}" class="group bg-white border border-line rounded-xl overflow-hidden hover:border-ink transition-all">
      <div class="aspect-square bg-paper-2 grid place-items-center overflow-hidden">${img}</div>
      <div class="p-3">
        <div class="text-[11px] font-mono text-graphite uppercase tracking-wider truncate">${esc(p.brand && p.brand.name ? p.brand.name : '')}</div>
        <div class="text-sm font-medium leading-snug mb-1" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(p.name)}</div>
        <div class="font-mono text-sm">${money(p.price)}</div>
      </div>
    </a>`;
  }

  async function render(excludeSku) {
    const grid = document.querySelector('[data-recently-viewed]');
    const section = document.querySelector('[data-recently-viewed-section]');
    if (!grid || !window.GarperLuxApi) return;
    const skus = getSkus(excludeSku).slice(0, 5);
    const hide = () => { if (section) section.style.display = 'none'; };
    if (!skus.length) return hide();
    const products = (await Promise.all(skus.map((s) => window.GarperLuxApi.product(s).catch(() => null)))).filter(Boolean);
    if (!products.length) return hide();
    if (section) section.style.display = '';
    grid.innerHTML = products.map(card).join('');
  }

  function init() {
    const isProduct = /\/producto\.html$/.test(location.pathname);
    if (isProduct && window.GarperLuxApi) {
      const params = new URLSearchParams(location.search);
      const ref = params.get('sku') || params.get('slug');
      if (ref) {
        window.GarperLuxApi.product(ref)
          .then((p) => { if (p && p.sku) { record(p.sku); render(p.sku); } else { render(ref); } })
          .catch(() => render(ref));
        return;
      }
    }
    render(null);
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
  // La API y los componentes pueden cargar después; reintenta cuando estén listos.
  document.addEventListener('garperlux:components-ready', () => {
    const grid = document.querySelector('[data-recently-viewed]');
    if (grid && !grid.children.length) init();
  });

  window.GarperLuxRecent = { record, getSkus, render };
})();
