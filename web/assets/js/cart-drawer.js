/* GarperLux — Cart drawer + motor de recomendaciones.
 *
 * Reemplaza la doble notificación toast ("Añadido al prototipo." + "(local).")
 * por un drawer lateral derecho con la estética del sitio. Cuando el usuario
 * añade un producto al carrito:
 *
 *   1. Se inyecta el drawer (la primera vez) y se desliza desde la derecha.
 *   2. Muestra el producto recién añadido (imagen, marca, nombre, qty, total).
 *   3. Resumen de la cesta entera (recuento + total).
 *   4. Sección "Te puede interesar" con 4 productos recomendados por un
 *      motor con varias señales (ver _scoreCandidate más abajo).
 *   5. CTAs: "Ver mi cesta" (primary) y "Seguir comprando" (ghost).
 *
 * El motor de recomendaciones combina:
 *   · Reglas de complementariedad codificadas (ej. interruptor → marco
 *     mismo brand, magnetotérmico → diferencial, motor garaje → mando,
 *     cable → tubo corrugado, bombilla → regulador/plafón, videoportero
 *     → placa/abrepuertas, cámara → detectores de seguridad).
 *   · Misma gama (specs.Gama) — fortísima señal en mecanismos.
 *   · Misma marca, misma categoría, mismo casquillo, misma protección IP.
 *   · Bonificación pequeña por stock disponible.
 *   · Penalización a productos ya en la cesta.
 *   · Filtro de diversidad: máximo 2 productos de la misma sub-categoría
 *     entre los recomendados, para no monotonizar la lista.
 */
(function () {
  'use strict';

  if (window.GarperLuxCartDrawer) return; // singleton

  const CART_KEY = 'garperlux_cart_items';
  const COUNT_KEY = 'garperlux_cart_count';

  // ---- Cache de productos para evitar hits repetidos ------------------------
  let _allProducts = null;
  async function _loadCatalog() {
    if (_allProducts) return _allProducts;
    const api = window.GarperLuxApi;
    if (!api) return [];
    try { _allProducts = await api.products({}); } catch { _allProducts = []; }
    return _allProducts;
  }

  function _money(value) {
    return `${Number(value || 0).toFixed(2).replace('.', ',')} €`;
  }
  function _escape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // Puente al módulo unificado del carrito. Si todavía no se ha cargado
  // (race del primer click) caemos a localStorage directo para no perder
  // contexto.
  function _readCart() {
    return window.GarperLuxCart
      ? window.GarperLuxCart.getItems()
      : (() => { try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch { return []; } })();
  }
  function _cartTotal() {
    return window.GarperLuxCart
      ? window.GarperLuxCart.getTotal()
      : _readCart().reduce((s, i) => s + ((Number(i.price) || 0) * (Number(i.quantity) || 0)), 0);
  }

  // ---- Inyección de markup + estilos (una sola vez) -------------------------

  function _ensureMarkup() {
    if (document.getElementById('glx-cart-drawer')) return;
    const style = document.createElement('style');
    style.id = 'glx-cart-drawer-style';
    style.textContent = `
      .glx-drawer-backdrop {
        position: fixed; inset: 0; z-index: 90;
        background: rgba(11,13,18,0.45);
        backdrop-filter: blur(2px);
        opacity: 0; pointer-events: none;
        transition: opacity .25s ease;
      }
      .glx-drawer-backdrop.is-open { opacity: 1; pointer-events: auto; }

      .glx-drawer {
        position: fixed; right: 0; top: 0; bottom: 0;
        width: min(100%, 420px); z-index: 91;
        background: var(--paper, #F7F3EC);
        color: var(--ink, #0B0D12);
        display: flex; flex-direction: column;
        transform: translateX(100%); transition: transform .3s cubic-bezier(.2,.7,.2,1);
        box-shadow: -24px 0 60px -12px rgba(11,13,18,0.30);
      }
      .glx-drawer.is-open { transform: translateX(0); }

      .glx-drawer-head {
        background: var(--ink, #0B0D12); color: var(--paper, #F7F3EC);
        padding: 22px 22px 18px; position: relative;
      }
      .glx-drawer-head .eyebrow {
        font-family: 'JetBrains Mono', monospace; font-size: 10.5px;
        letter-spacing: .14em; text-transform: uppercase;
        color: var(--filament, #E8A545);
      }
      .glx-drawer-head h2 {
        font-family: 'Fraunces', Georgia, serif; font-weight: 500;
        font-size: 22px; line-height: 1.1; margin-top: 6px;
      }
      .glx-drawer-close {
        position: absolute; top: 14px; right: 14px;
        width: 36px; height: 36px; border-radius: 999px;
        display: grid; place-items: center;
        background: rgba(247,243,236,0.10); color: var(--paper, #F7F3EC);
        cursor: pointer; transition: background .15s;
      }
      .glx-drawer-close:hover { background: rgba(247,243,236,0.20); }

      .glx-drawer-body {
        flex: 1; overflow-y: auto; padding: 18px 20px 22px;
      }

      .glx-just-added {
        display: grid; grid-template-columns: 80px 1fr;
        gap: 14px; padding: 14px;
        background: white; border: 1px solid var(--line, #E5DED0);
        border-radius: 12px; align-items: center;
      }
      .glx-just-added .img {
        width: 80px; height: 80px; border-radius: 8px;
        background: var(--paper-2, #EFE9DE); display: grid; place-items: center;
        overflow: hidden;
      }
      .glx-just-added img { width: 100%; height: 100%; object-fit: contain; padding: 6px; }
      .glx-just-added .brand {
        font-family: 'JetBrains Mono', monospace; font-size: 10px;
        text-transform: uppercase; letter-spacing: .1em;
        color: var(--graphite, #40454F);
      }
      .glx-just-added .name {
        font-size: 14px; font-weight: 500; line-height: 1.25;
        color: var(--ink, #0B0D12); margin-top: 2px;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .glx-just-added .meta {
        font-family: 'JetBrains Mono', monospace; font-size: 11px;
        color: var(--graphite, #40454F); margin-top: 6px;
      }
      .glx-just-added .meta strong { color: var(--ink, #0B0D12); font-weight: 500; }

      .glx-cart-summary {
        margin: 18px 0 6px; padding: 12px 14px;
        background: var(--paper-2, #EFE9DE); border-radius: 10px;
        font-size: 13px; display: flex; align-items: center; justify-content: space-between;
      }
      .glx-cart-summary .total {
        font-family: 'Fraunces', Georgia, serif; font-size: 18px; font-weight: 500;
      }
      .glx-cart-summary .count {
        font-family: 'JetBrains Mono', monospace; font-size: 11px;
        color: var(--graphite, #40454F);
      }

      .glx-recos h4 {
        font-family: 'Fraunces', Georgia, serif; font-weight: 500;
        font-size: 18px; margin: 22px 0 4px;
      }
      .glx-recos-sub {
        font-size: 12px; color: var(--graphite, #40454F);
        margin-bottom: 14px; line-height: 1.5;
      }
      .glx-recos-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
      }
      .glx-reco-card {
        position: relative; display: flex; flex-direction: column;
        background: white; border: 1px solid var(--line, #E5DED0);
        border-radius: 10px; padding: 10px; gap: 6px;
        text-decoration: none; color: var(--ink, #0B0D12);
        transition: border-color .15s, transform .15s;
      }
      .glx-reco-card:hover { border-color: var(--ink, #0B0D12); transform: translateY(-1px); }
      .glx-reco-card .img {
        aspect-ratio: 1; background: var(--paper-2, #EFE9DE);
        border-radius: 6px; overflow: hidden; display: grid; place-items: center;
      }
      .glx-reco-card .img img { width: 100%; height: 100%; object-fit: contain; padding: 8px; }
      .glx-reco-card .brand {
        font-family: 'JetBrains Mono', monospace; font-size: 9px;
        text-transform: uppercase; letter-spacing: .1em;
        color: var(--graphite, #40454F);
      }
      .glx-reco-card .name {
        font-size: 12.5px; font-weight: 500; line-height: 1.25;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        overflow: hidden; min-height: 32px;
      }
      .glx-reco-card .reason {
        font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
        text-transform: uppercase; letter-spacing: .08em;
        color: var(--copper, #B8753A);
      }
      .glx-reco-card .row {
        display: flex; align-items: center; justify-content: space-between;
        margin-top: auto;
      }
      .glx-reco-card .price {
        font-family: 'Fraunces', Georgia, serif; font-size: 15px; font-weight: 500;
      }
      .glx-reco-card .add-mini {
        width: 28px; height: 28px; border-radius: 999px;
        background: var(--ink, #0B0D12); color: var(--paper, #F7F3EC);
        display: grid; place-items: center; font-size: 16px; font-weight: 500;
        cursor: pointer; transition: background .15s;
      }
      .glx-reco-card .add-mini:hover { background: var(--filament, #E8A545); color: var(--ink, #0B0D12); }
      .glx-reco-card.is-added .add-mini { background: var(--stock, #16A34A); pointer-events: none; }

      .glx-drawer-foot {
        padding: 16px 20px;
        border-top: 1px solid var(--line, #E5DED0);
        background: var(--paper-2, #EFE9DE);
        display: flex; flex-direction: column; gap: 8px;
      }
      .glx-drawer-foot .btn { justify-content: center; }

      @media (max-width: 480px) {
        .glx-drawer { width: 100%; }
        .glx-recos-grid { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);

    const wrap = document.createElement('div');
    wrap.id = 'glx-cart-drawer';
    wrap.innerHTML = `
      <div class="glx-drawer-backdrop" data-glx-close></div>
      <aside class="glx-drawer" role="dialog" aria-label="Producto añadido a la cesta">
        <header class="glx-drawer-head">
          <div class="eyebrow">Añadido a tu cesta</div>
          <h2 data-glx-head>¡Bien!</h2>
          <button type="button" class="glx-drawer-close" data-glx-close aria-label="Cerrar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </header>
        <div class="glx-drawer-body">
          <div class="glx-just-added" data-glx-just></div>
          <div class="glx-cart-summary">
            <span class="count" data-glx-cart-count>—</span>
            <span class="total" data-glx-cart-total>—</span>
          </div>
          <section class="glx-recos">
            <h4>Te puede interesar</h4>
            <p class="glx-recos-sub" data-glx-reco-sub>Productos que combinan con lo que acabas de añadir.</p>
            <div class="glx-recos-grid" data-glx-reco-grid></div>
          </section>
        </div>
        <footer class="glx-drawer-foot">
          <a href="/pages/tienda/carrito.html" class="btn btn-primary">Ver mi cesta</a>
          <button type="button" class="btn btn-ghost" data-glx-close>Seguir comprando</button>
        </footer>
      </aside>
    `;
    document.body.appendChild(wrap);

    wrap.querySelectorAll('[data-glx-close]').forEach((el) => {
      el.addEventListener('click', close);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.body.dataset.glxDrawerOpen === '1') close();
    });
  }

  // ---- Motor de recomendaciones --------------------------------------------

  function _matchesAny(text, regexes) {
    return regexes.some((r) => r.test(text));
  }

  // Reglas de complementariedad: cuando se añade un producto con cierto perfil,
  // boost a los candidatos que cumplen el predicado. Pares "lo que se compra
  // junto" — codificado a mano porque no tenemos histórico de pedidos real.
  const COMPLEMENT_RULES = [
    {
      // Mecanismo (interruptor/conmutador/pulsador) → marco compatible
      whenName: /\b(interruptor|conmutador|pulsador|cruzamiento)\b/i,
      whenCat:  /^mecanismos$/,
      complement: (p, t) => /\bmarco\b/i.test(p.name) && p.brand?.slug === t.brand?.slug,
      label: () => 'Marco compatible',
      boost: 110,
    },
    {
      // Marco → enchufes/interruptores de la misma gama
      whenName: /\bmarco\b/i,
      whenCat:  /^mecanismos$/,
      complement: (p, t) => /\b(enchufe|interruptor|conmutador)\b/i.test(p.name)
                            && p.brand?.slug === t.brand?.slug,
      label: () => 'Para este marco',
      boost: 90,
    },
    {
      // Enchufe → marco compatible
      whenName: /\benchufe\b/i,
      whenCat:  /^mecanismos$/,
      complement: (p, t) => /\bmarco\b/i.test(p.name) && p.brand?.slug === t.brand?.slug,
      label: () => 'Marco compatible',
      boost: 95,
    },
    {
      // Bombilla → reguladores y plafones (donde se monta)
      whenName: /\bbombilla\b/i,
      whenCat:  /^iluminacion$/,
      complement: (p) => /\bregulador|dimmer\b/i.test(p.name)
                         || /\bplaf[oó]n\b/i.test(p.name)
                         || /\baplique\b/i.test(p.name),
      label: (p) => /regulador|dimmer/i.test(p.name) ? 'Regulador compatible' : 'Para esta bombilla',
      boost: 70,
    },
    {
      // Magnetotérmico → diferencial complementario
      whenName: /\bmagnetot[eé]rmico\b/i,
      whenCat:  /^proteccion$/,
      complement: (p) => /\bdiferencial\b/i.test(p.name),
      label: () => 'Diferencial complementario',
      boost: 100,
    },
    {
      // Diferencial → magnetotérmicos para repartir circuitos
      whenName: /\bdiferencial\b/i,
      whenCat:  /^proteccion$/,
      complement: (p) => /\bmagnetot[eé]rmico\b/i.test(p.name),
      label: () => 'Para los circuitos',
      boost: 95,
    },
    {
      // Motor de garaje / kit motor → mando emisor + fotocélula
      whenName: /\b(motor|kit\s+motor|automatismo)\b/i,
      whenCat:  /^automatismos$/,
      complement: (p) => /\bmando\b/i.test(p.name) || /\bfotoc[eé]lula\b/i.test(p.name) || /\bbater[ií]a\b/i.test(p.name),
      label: (p) => /fotoc[eé]lula/i.test(p.name) ? 'Seguridad de la puerta' : (/bater/i.test(p.name) ? 'Batería de respaldo' : 'Mando emisor'),
      boost: 85,
    },
    {
      // Mando garaje → motor de la misma marca
      whenName: /\bmando\b/i,
      whenCat:  /^automatismos$/,
      complement: (p, t) => (/\bmotor\b/i.test(p.name) || /\bkit\s+motor\b/i.test(p.name))
                            && p.brand?.slug === t.brand?.slug,
      label: () => 'Motor compatible',
      boost: 70,
    },
    {
      // Videoportero / telefonillo → placa de calle, abrepuertas, monitor extra
      whenName: /\b(videoportero|telefonillo|portero|kit.*audio|kit.*v[ií]deo)\b/i,
      whenCat:  /^porteros-videoporteros$/,
      complement: (p) => /\bplaca\b/i.test(p.name) || /\babrepuertas\b/i.test(p.name) || /\bmonitor\b/i.test(p.name),
      label: (p) => /placa/i.test(p.name) ? 'Placa de calle' : (/abrepuertas/i.test(p.name) ? 'Abrepuertas' : 'Monitor extra'),
      boost: 75,
    },
    {
      // Cámara IP → otra cámara, detector, sirena
      whenName: /\bc[aá]mara\b/i,
      whenCat:  /^seguridad$/,
      complement: (p) => /\bdetector\b|\bsensor\b|\balarma\b|\bsirena\b/i.test(p.name),
      label: (p) => /alarma|sirena/i.test(p.name) ? 'Refuerza tu sistema' : 'Detector complementario',
      boost: 60,
    },
    {
      // Cable / manguera → tubo corrugado, regletas, bridas
      whenName: /\b(cable|manguera|hilo)\b/i,
      whenCat:  /^cableado$/,
      complement: (p) => /\btubo\b|\bcorrugado\b|\bcanaleta\b|\bbridas?\b|\bwago\b|\bpunteras?\b|\bregleta\b/i.test(p.name),
      label: () => 'Para esta instalación',
      boost: 60,
    },
    {
      // Domótica (relé / módulo) → otro Shelly/Sonoff complementario
      whenName: /\bm[oó]dulo|\brel[eé]\b|\bshelly\b|\bsonoff\b|\bzigbee\b|\bwifi\b/i,
      whenCat:  /^domotica$/,
      complement: (p) => /\bbombilla\b|\bsensor\b|\bdetector\b|\bmando\b/i.test(p.name) && p.category?.slug === 'domotica',
      label: () => 'Mismo ecosistema',
      boost: 55,
    },
    {
      // Antena → cable coaxial, amplificador
      whenName: /\bantena\b/i,
      whenCat:  /^antenas-telecomunicaciones$/,
      complement: (p) => /\bcoaxial\b|\bamplificador\b|\brepetidor\b/i.test(p.name),
      label: () => 'Para esta antena',
      boost: 65,
    },
  ];

  function _scoreCandidate(target, p, cartSkus) {
    if (p.sku === target.sku) return null;
    if (cartSkus.has(p.sku)) return null; // ya en carrito

    const targetCat = target.category?.slug || '';
    const targetBrand = target.brand?.slug || '';
    const targetSpecs = target.specs || {};
    const tGama = (targetSpecs.Gama || targetSpecs.gama || '').toString().trim().toLowerCase();
    const tCasq = (targetSpecs['Tipo de casquillo'] || targetSpecs.Casquillo || '').toString().trim();
    const tIP = (targetSpecs['Protección IP'] || targetSpecs['Proteccion IP'] || '').toString().trim();
    const tColor = (targetSpecs['Familia de color'] || targetSpecs.Color || '').toString().trim();

    let score = 0;
    let reason = '';

    // 1. Reglas de complementariedad
    for (const rule of COMPLEMENT_RULES) {
      if (rule.whenCat && !rule.whenCat.test(targetCat)) continue;
      if (rule.whenName && !rule.whenName.test(target.name || '')) continue;
      if (rule.complement(p, target)) {
        score += rule.boost;
        reason = rule.label(p);
        break;
      }
    }

    // 2. Misma gama
    const pGama = (p.specs?.Gama || p.specs?.gama || '').toString().trim().toLowerCase();
    if (tGama && pGama && pGama === tGama) {
      score += 70;
      if (!reason) reason = `Misma gama · ${(p.specs?.Gama || p.specs?.gama)}`;
    }

    // 3. Misma marca (más fuerte si misma categoría)
    if (targetBrand && p.brand?.slug === targetBrand) {
      score += (p.category?.slug === targetCat) ? 28 : 18;
      if (!reason) reason = `Misma marca`;
    }

    // 4. Mismo casquillo
    const pCasq = (p.specs?.['Tipo de casquillo'] || p.specs?.Casquillo || '').toString().trim();
    if (tCasq && pCasq && pCasq === tCasq) {
      score += 36;
      if (!reason) reason = `Casquillo ${pCasq}`;
    }

    // 5. Misma protección IP
    const pIP = (p.specs?.['Protección IP'] || p.specs?.['Proteccion IP'] || '').toString().trim();
    if (tIP && pIP && pIP === tIP) {
      score += 18;
      if (!reason) reason = `Protección ${pIP}`;
    }

    // 6. Mismo color/acabado (estética coherente para mecanismos/iluminación)
    const pColor = (p.specs?.['Familia de color'] || p.specs?.Color || '').toString().trim();
    if (tColor && pColor && pColor === tColor) {
      score += 12;
      if (!reason) reason = `Acabado ${pColor}`;
    }

    // 7. Misma categoría (sustitutos)
    if (targetCat && p.category?.slug === targetCat && score === 0) {
      score += 10;
      reason = 'Productos similares';
    }

    // 8. Stock disponible (pequeña preferencia)
    if (p.stock > 0) score += 4;

    return score > 0 ? { product: p, score, reason } : null;
  }

  function _recommendForProduct(target, allProducts, max = 4) {
    const cartSkus = new Set(_readCart().map((c) => c.sku));
    const scored = [];
    for (const p of allProducts) {
      const r = _scoreCandidate(target, p, cartSkus);
      if (r) scored.push(r);
    }
    scored.sort((a, b) => b.score - a.score);
    // Diversidad: como mucho 2 con la misma categoría → fuerza variedad
    const byCat = new Map();
    const result = [];
    for (const s of scored) {
      const cat = s.product.category?.slug || '_';
      const seen = byCat.get(cat) || 0;
      if (seen >= 2) continue;
      byCat.set(cat, seen + 1);
      result.push(s);
      if (result.length >= max) break;
    }
    return result;
  }

  // ---- Apertura/cierre + render --------------------------------------------

  function close() {
    const wrap = document.getElementById('glx-cart-drawer');
    if (!wrap) return;
    wrap.querySelector('.glx-drawer').classList.remove('is-open');
    wrap.querySelector('.glx-drawer-backdrop').classList.remove('is-open');
    document.body.dataset.glxDrawerOpen = '0';
    document.body.style.overflow = '';
  }

  async function open(product, qty = 1) {
    _ensureMarkup();
    const wrap = document.getElementById('glx-cart-drawer');
    if (!wrap || !product) return;

    document.body.dataset.glxDrawerOpen = '1';
    document.body.style.overflow = 'hidden';

    // Header dinámico (frase corta amigable)
    const FRASES = [
      '¡Una buena elección!',
      '¡Listo para tu instalación!',
      '¡Ya está en tu cesta!',
      '¡Apuntado!',
    ];
    wrap.querySelector('[data-glx-head]').textContent = FRASES[Math.floor(Math.random() * FRASES.length)];

    // Bloque "producto recién añadido"
    const justEl = wrap.querySelector('[data-glx-just]');
    const totalLine = product.price ? `<strong>${qty}</strong> · ${_money(product.price)} · Total <strong>${_money(qty * product.price)}</strong>` : `<strong>${qty}</strong> ud.`;
    justEl.innerHTML = `
      <div class="img">
        ${product.image
          ? `<img src="${_escape(product.image)}" alt="${_escape(product.name)}" loading="lazy"/>`
          : `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#A8A8A8" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`
        }
      </div>
      <div>
        <div class="brand">${_escape(product.brand?.name || '—')}</div>
        <div class="name">${_escape(product.name || 'Producto')}</div>
        <div class="meta">${totalLine}</div>
      </div>
    `;

    // Resumen de la cesta — se calcula DESPUÉS del addItem, así que ya
    // refleja el producto recién metido (incluye todas las cantidades).
    const updateCartSummary = () => {
      const cart = _readCart();
      const cartCount = cart.reduce((s, c) => s + (Number(c.quantity) || 0), 0);
      const cartTotal = _cartTotal();
      wrap.querySelector('[data-glx-cart-count]').textContent = `${cartCount} producto${cartCount === 1 ? '' : 's'} en tu cesta`;
      wrap.querySelector('[data-glx-cart-total]').textContent = _money(cartTotal);
    };
    updateCartSummary();
    // Si añaden algo desde dentro del propio drawer (botón "+" del reco),
    // refrescamos la línea de resumen en vivo.
    window.addEventListener('garperlux:cart-changed', updateCartSummary);

    // Recomendaciones
    const grid = wrap.querySelector('[data-glx-reco-grid]');
    grid.innerHTML = '<div style="grid-column:1/-1;font-size:12px;color:var(--graphite,#40454F);">Buscando combinaciones…</div>';

    // Animar entrada
    requestAnimationFrame(() => {
      wrap.querySelector('.glx-drawer').classList.add('is-open');
      wrap.querySelector('.glx-drawer-backdrop').classList.add('is-open');
    });

    const all = await _loadCatalog();
    const recos = _recommendForProduct(product, all, 4);
    const reasonStats = {};
    recos.forEach((r) => { reasonStats[r.reason] = (reasonStats[r.reason] || 0) + 1; });
    const sub = recos.length
      ? `Combinaciones reales según ${recos.length === 1 ? 'la afinidad' : 'afinidad de marca, gama y complementos'} con tu producto.`
      : 'No encontramos productos relacionados — explora el catálogo completo.';
    wrap.querySelector('[data-glx-reco-sub]').textContent = sub;

    if (!recos.length) {
      grid.innerHTML = '';
      return;
    }
    grid.innerHTML = recos.map(({ product: p, reason }) => `
      <a href="/pages/tienda/producto.html?sku=${encodeURIComponent(p.sku)}" class="glx-reco-card" data-reco-sku="${_escape(p.sku)}">
        <div class="img">
          ${p.image
            ? `<img src="${_escape(p.image)}" alt="${_escape(p.name)}" loading="lazy"/>`
            : `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#A8A8A8" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`
          }
        </div>
        <div class="brand">${_escape(p.brand?.name || '—')}</div>
        <div class="name">${_escape(p.name)}</div>
        <div class="reason">${_escape(reason)}</div>
        <div class="row">
          <div class="price">${_money(p.price)}</div>
          <button type="button" class="add-mini" data-add-reco="${_escape(p.sku)}" aria-label="Añadir a la cesta">+</button>
        </div>
      </a>
    `).join('');

    // Bind del botón "+" del reco — usa el módulo central para que el
    // contador del header, el server-sync y el resumen se actualicen
    // automáticamente.
    grid.querySelectorAll('[data-add-reco]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const sku = btn.dataset.addReco;
        const reco = recos.find((r) => r.product.sku === sku);
        if (!reco) return;
        if (window.GarperLuxCart) {
          window.GarperLuxCart.addItem({
            sku,
            title: reco.product.name,
            price: reco.product.price,
            image: reco.product.image,
            brand: reco.product.brand?.name,
          }, 1);
        }
        btn.closest('.glx-reco-card').classList.add('is-added');
        btn.textContent = '✓';
      });
    });
  }

  window.GarperLuxCartDrawer = { open, close };
})();
