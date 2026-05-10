/* GarperLux — recomendaciones para la página del CARRITO completo.
 *
 * Diferencia con el drawer (cart-drawer.js): el drawer recomienda en base a
 * UN producto recién añadido. Aquí tenemos la cesta entera, así que la
 * estrategia es agregada:
 *
 *   1. Por cada producto de la cesta, ejecuta el motor de scoring contra
 *      todo el catálogo.
 *   2. Suma los scores por candidato (un producto que es complemento de DOS
 *      items de la cesta vale más que uno que solo complementa a uno).
 *   3. Toma como razón la del item con mayor contribución.
 *   4. Excluye productos ya en la cesta.
 *   5. Aplica diversidad por categoría (máx. 2 por categoría) y devuelve
 *      los 8 mejores.
 *
 * El módulo expone una sola función `renderCartRecommendations()` que se
 * llama desde la página del carrito. Lee la cesta vía `GarperLuxCart` y
 * vuelve a renderizar al evento `garperlux:cart-changed`.
 */
(function () {
  'use strict';

  // Mismas reglas de complementariedad que cart-drawer (extraídas para
  // poder usarlas independientemente). Si en el futuro se quiere reutilizar,
  // el cart-drawer puede importar de aquí, pero los duplicamos con cuidado
  // de mantener ambos en sync — son la "tabla de combinaciones" del catálogo.
  const COMPLEMENT_RULES = [
    { whenName: /\b(interruptor|conmutador|pulsador|cruzamiento)\b/i, whenCat: /^mecanismos$/,
      complement: (p, t) => /\bmarco\b/i.test(p.name) && p.brand?.slug === t.brand?.slug,
      label: () => 'Marco compatible', boost: 110 },
    { whenName: /\bmarco\b/i, whenCat: /^mecanismos$/,
      complement: (p, t) => /\b(enchufe|interruptor|conmutador)\b/i.test(p.name) && p.brand?.slug === t.brand?.slug,
      label: () => 'Para este marco', boost: 90 },
    { whenName: /\benchufe\b/i, whenCat: /^mecanismos$/,
      complement: (p, t) => /\bmarco\b/i.test(p.name) && p.brand?.slug === t.brand?.slug,
      label: () => 'Marco compatible', boost: 95 },
    { whenName: /\bbombilla\b/i, whenCat: /^iluminacion$/,
      complement: (p) => /\bregulador|dimmer\b/i.test(p.name) || /\bplaf[oó]n\b/i.test(p.name) || /\baplique\b/i.test(p.name),
      label: (p) => /regulador|dimmer/i.test(p.name) ? 'Regulador compatible' : 'Para esta bombilla', boost: 70 },
    { whenName: /\bmagnetot[eé]rmico\b/i, whenCat: /^proteccion$/,
      complement: (p) => /\bdiferencial\b/i.test(p.name),
      label: () => 'Diferencial complementario', boost: 100 },
    { whenName: /\bdiferencial\b/i, whenCat: /^proteccion$/,
      complement: (p) => /\bmagnetot[eé]rmico\b/i.test(p.name),
      label: () => 'Para los circuitos', boost: 95 },
    { whenName: /\b(motor|kit\s+motor|automatismo)\b/i, whenCat: /^automatismos$/,
      complement: (p) => /\bmando\b/i.test(p.name) || /\bfotoc[eé]lula\b/i.test(p.name) || /\bbater[ií]a\b/i.test(p.name),
      label: (p) => /fotoc[eé]lula/i.test(p.name) ? 'Seguridad de la puerta' : (/bater/i.test(p.name) ? 'Batería de respaldo' : 'Mando emisor'), boost: 85 },
    { whenName: /\bmando\b/i, whenCat: /^automatismos$/,
      complement: (p, t) => (/\bmotor\b/i.test(p.name) || /\bkit\s+motor\b/i.test(p.name)) && p.brand?.slug === t.brand?.slug,
      label: () => 'Motor compatible', boost: 70 },
    { whenName: /\b(videoportero|telefonillo|portero|kit.*audio|kit.*v[ií]deo)\b/i, whenCat: /^porteros-videoporteros$/,
      complement: (p) => /\bplaca\b/i.test(p.name) || /\babrepuertas\b/i.test(p.name) || /\bmonitor\b/i.test(p.name),
      label: (p) => /placa/i.test(p.name) ? 'Placa de calle' : (/abrepuertas/i.test(p.name) ? 'Abrepuertas' : 'Monitor extra'), boost: 75 },
    { whenName: /\bc[aá]mara\b/i, whenCat: /^seguridad$/,
      complement: (p) => /\bdetector\b|\bsensor\b|\balarma\b|\bsirena\b/i.test(p.name),
      label: (p) => /alarma|sirena/i.test(p.name) ? 'Refuerza tu sistema' : 'Detector complementario', boost: 60 },
    { whenName: /\b(cable|manguera|hilo)\b/i, whenCat: /^cableado$/,
      complement: (p) => /\btubo\b|\bcorrugado\b|\bcanaleta\b|\bbridas?\b|\bwago\b|\bpunteras?\b|\bregleta\b/i.test(p.name),
      label: () => 'Para esta instalación', boost: 60 },
    { whenName: /\bm[oó]dulo|\brel[eé]\b|\bshelly\b|\bsonoff\b|\bzigbee\b|\bwifi\b/i, whenCat: /^domotica$/,
      complement: (p) => /\bbombilla\b|\bsensor\b|\bdetector\b|\bmando\b/i.test(p.name) && p.category?.slug === 'domotica',
      label: () => 'Mismo ecosistema', boost: 55 },
    { whenName: /\bantena\b/i, whenCat: /^antenas-telecomunicaciones$/,
      complement: (p) => /\bcoaxial\b|\bamplificador\b|\brepetidor\b/i.test(p.name),
      label: () => 'Para esta antena', boost: 65 },
  ];

  function _money(value) {
    return `${Number(value || 0).toFixed(2).replace('.', ',')} €`;
  }
  function _escape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _scoreCandidate(target, p, cartSkus) {
    if (p.sku === target.sku) return null;
    if (cartSkus.has(p.sku)) return null;

    const targetCat = target.category?.slug || '';
    const targetBrand = target.brand?.slug || '';
    const targetSpecs = target.specs || {};
    const tGama = (targetSpecs.Gama || targetSpecs.gama || '').toString().trim().toLowerCase();
    const tCasq = (targetSpecs['Tipo de casquillo'] || targetSpecs.Casquillo || '').toString().trim();
    const tIP = (targetSpecs['Protección IP'] || targetSpecs['Proteccion IP'] || '').toString().trim();
    const tColor = (targetSpecs['Familia de color'] || targetSpecs.Color || '').toString().trim();

    let score = 0;
    let reason = '';

    for (const rule of COMPLEMENT_RULES) {
      if (rule.whenCat && !rule.whenCat.test(targetCat)) continue;
      if (rule.whenName && !rule.whenName.test(target.name || '')) continue;
      if (rule.complement(p, target)) {
        score += rule.boost;
        reason = rule.label(p);
        break;
      }
    }
    const pGama = (p.specs?.Gama || p.specs?.gama || '').toString().trim().toLowerCase();
    if (tGama && pGama && pGama === tGama) {
      score += 70;
      if (!reason) reason = `Misma gama · ${(p.specs?.Gama || p.specs?.gama)}`;
    }
    if (targetBrand && p.brand?.slug === targetBrand) {
      score += (p.category?.slug === targetCat) ? 28 : 18;
      if (!reason) reason = 'Misma marca';
    }
    const pCasq = (p.specs?.['Tipo de casquillo'] || p.specs?.Casquillo || '').toString().trim();
    if (tCasq && pCasq && pCasq === tCasq) {
      score += 36; if (!reason) reason = `Casquillo ${pCasq}`;
    }
    const pIP = (p.specs?.['Protección IP'] || p.specs?.['Proteccion IP'] || '').toString().trim();
    if (tIP && pIP && pIP === tIP) {
      score += 18; if (!reason) reason = `Protección ${pIP}`;
    }
    const pColor = (p.specs?.['Familia de color'] || p.specs?.Color || '').toString().trim();
    if (tColor && pColor && pColor === tColor) {
      score += 12; if (!reason) reason = `Acabado ${pColor}`;
    }
    if (targetCat && p.category?.slug === targetCat && score === 0) {
      score += 10; reason = 'Productos similares';
    }
    if (p.stock > 0) score += 4;

    return score > 0 ? { score, reason } : null;
  }

  // Recomendación AGREGADA sobre la cesta. Para cada candidato, suma los
  // scores que recibe contra cada item del carrito; guarda la razón del
  // item que más aporta. Penaliza el solapamiento con la cesta.
  function _recommendForCart(cartProducts, allProducts, max = 8) {
    if (!cartProducts.length) return [];
    const cartSkus = new Set(cartProducts.map((p) => p.sku));
    const scoreBySku = new Map();
    const reasonBySku = new Map();
    const productBySku = new Map();
    const drivingSkuBySku = new Map();
    const drivingScoreBySku = new Map();

    for (const target of cartProducts) {
      for (const p of allProducts) {
        const r = _scoreCandidate(target, p, cartSkus);
        if (!r) continue;
        productBySku.set(p.sku, p);
        scoreBySku.set(p.sku, (scoreBySku.get(p.sku) || 0) + r.score);
        // Razón = la del cart-item que más aporta a este candidato.
        const prev = drivingScoreBySku.get(p.sku) || 0;
        if (r.score > prev) {
          drivingScoreBySku.set(p.sku, r.score);
          reasonBySku.set(p.sku, r.reason);
          drivingSkuBySku.set(p.sku, target.sku);
        }
      }
    }

    const sorted = [...scoreBySku.entries()]
      .map(([sku, score]) => ({
        product: productBySku.get(sku),
        score,
        reason: reasonBySku.get(sku),
        drivingSku: drivingSkuBySku.get(sku),
      }))
      .filter((e) => e.product)
      .sort((a, b) => b.score - a.score);

    const byCat = new Map();
    const out = [];
    for (const s of sorted) {
      const cat = s.product.category?.slug || '_';
      const seen = byCat.get(cat) || 0;
      if (seen >= 2) continue;
      byCat.set(cat, seen + 1);
      out.push(s);
      if (out.length >= max) break;
    }
    return out;
  }

  async function renderCartRecommendations() {
    const wrap = document.querySelector('[data-glx-cart-recos]');
    const grid = document.querySelector('[data-glx-cart-recos-grid]');
    if (!wrap || !grid) return;
    const cart = window.GarperLuxCart;
    const api = window.GarperLuxApi;
    if (!cart || !api) { wrap.hidden = true; return; }

    const items = cart.getItems();
    if (!items.length) { wrap.hidden = true; grid.innerHTML = ''; return; }

    let products;
    try { products = await api.products({}); } catch { wrap.hidden = true; return; }

    // Hidrata cada item del carrito con su producto del catálogo (necesitamos
    // category, brand, specs para poder scorear).
    const productBySku = new Map(products.map((p) => [p.sku, p]));
    const cartProducts = items.map((it) => productBySku.get(it.sku)).filter(Boolean);
    if (!cartProducts.length) { wrap.hidden = true; return; }

    const recos = _recommendForCart(cartProducts, products, 8);
    if (!recos.length) { wrap.hidden = true; return; }
    wrap.hidden = false;

    grid.innerHTML = recos.map(({ product: p, reason, drivingSku }) => {
      const driving = items.find((i) => i.sku === drivingSku);
      const drivingTitle = driving ? (driving.title || drivingSku) : null;
      return `
        <a href="/pages/tienda/producto.html?sku=${encodeURIComponent(p.sku)}" class="card-prod group" data-reco-sku="${_escape(p.sku)}">
          <div class="img relative">
            ${p.image
              ? `<img src="${_escape(p.image)}" alt="${_escape(p.name)}" loading="lazy" class="absolute inset-0 w-full h-full object-contain p-3"/>`
              : `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="text-graphite/30"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`}
          </div>
          <div>
            <div class="text-[11px] font-mono text-graphite">${_escape(p.brand?.name || '—')}</div>
            <h3 class="text-[14px] font-medium leading-snug">${_escape(p.name)}</h3>
            <div class="text-[10px] font-mono uppercase tracking-wider text-copper mt-1" title="${drivingTitle ? 'Sugerido por ' + _escape(drivingTitle) : ''}">${_escape(reason)}</div>
          </div>
          <div class="flex items-center justify-between mt-1">
            <div class="font-serif text-lg font-medium">${_money(p.price)}</div>
            <button type="button" class="w-8 h-8 rounded-full bg-ink text-paper grid place-items-center group-hover:bg-filament group-hover:text-ink transition-colors" data-add-cart-reco="${_escape(p.sku)}" aria-label="Añadir a la cesta"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></button>
          </div>
        </a>`;
    }).join('');

    // Bind "+": añade el reco a la cesta sin abandonar la página
    grid.querySelectorAll('[data-add-cart-reco]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const sku = btn.dataset.addCartReco;
        const p = recos.find((r) => r.product.sku === sku)?.product;
        if (!p || !window.GarperLuxCart) return;
        window.GarperLuxCart.addItem({
          sku: p.sku,
          title: p.name,
          price: p.price,
          image: p.image,
          brand: p.brand?.name,
        }, 1);
        btn.classList.add('bg-stock');
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M20 6 9 17l-5-5"/></svg>';
      });
    });
  }

  // Auto-bind a la página del carrito.
  function _init() {
    if (location.pathname !== '/pages/tienda/carrito.html') return;
    renderCartRecommendations();
    window.addEventListener('garperlux:cart-changed', () => {
      renderCartRecommendations().catch(() => null);
    });
  }
  if (document.readyState !== 'loading') _init();
  else document.addEventListener('DOMContentLoaded', _init);

  window.GarperLuxCartRecos = { render: renderCartRecommendations };
})();
