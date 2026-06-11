/* GarperLux — integración incremental con backend provisional */

(function () {
  'use strict';

  const api = window.GarperLuxApi;
  if (!api) return;

  const page = location.pathname === '/' ? '/index.html' : location.pathname;
  const money = (value) => `${Number(value || 0).toFixed(2).replace('.', ',')} €`;
  const orderStatusMeta = {
    confirmed: { label: 'Recibido', className: 'pill pill-info' },
    preparing: { label: 'En preparación', className: 'pill pill-info' },
    paid: { label: 'Pagado', className: 'pill pill-stock' },
    shipped: { label: 'Enviado', className: 'pill bg-warn/10 text-warn' },
    completed: { label: 'Entregado', className: 'pill pill-stock' },
    cancelled: { label: 'Cancelado', className: 'pill pill-warn' },
  };
  const publicAuthlessPages = new Set(['/pages/auth/recuperar-password.html', '/pages/empresa/contacto.html', '/pages/empresa/trabaja-con-nosotros.html', '/pages/servicios/seguir-solicitud.html']);
  const CHECKOUT_KEY = 'garperlux_checkout_draft';
  const DEMO_CREDENTIALS = {
    particular: { email: 'antonio.garcia@correo.com', password: 'garperlux123' },
    pro: { email: 'chispas@instaladoreseljaen.es', password: 'garperlux123' },
  };

  const toast = (message) => {
    if (window.glxToast) return window.glxToast(message);
    console.info(message);
  };

  const requireSession = () => {
    if (api.getToken()) return true;
    location.href = `/pages/auth/login.html?redirect=${encodeURIComponent(page)}`;
    return false;
  };

  async function syncSessionToLegacyAuth() {
    if (!api.getToken()) return null;
    try {
      const user = await api.me();
      localStorage.setItem('garperlux_session', JSON.stringify({
        role: user.role,
        name: user.fullName.split(' ')[0],
        fullName: user.fullName,
        nickname: user.role === 'pro' ? 'El Chispas' : null,
        email: user.email,
        phone: user.phone || null,
        fiscalId: user.fiscalId || null,
        birthDate: user.birthDate || null,
        marketingEmail: !!user.marketingEmail,
        orderNotifications: !!user.orderNotifications,
        tutorialReminders: !!user.tutorialReminders,
        smsUrgency: !!user.smsUrgency,
        initial: user.fullName.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase(),
        discount: user.proDiscount,
        cif: user.fiscalId || null,
        btCard: user.role === 'pro' ? 'BT-123456-AND' : null,
        btExpiry: user.role === 'pro' ? '2031-04' : null,
        at: Date.now(),
      }));
      document.querySelectorAll('[data-current-name]').forEach((el) => { el.textContent = user.fullName; });
      await window.glxRefreshSidebarCounts?.();
      return user;
    } catch {
      api.setToken(null);
      return null;
    }
  }

  async function syncLegacySessionToApi() {
    if (api.getToken()) return api.me().catch(() => null);
    const legacy = typeof window.glxGetSession === 'function' ? window.glxGetSession() : null;
    const creds = legacy?.role ? DEMO_CREDENTIALS[legacy.role] : null;
    if (!creds) return null;
    try {
      await api.login(creds.email, creds.password);
      return await syncSessionToLegacyAuth();
    } catch {
      return null;
    }
  }

  window.glxSyncSessionToLegacyAuth = syncSessionToLegacyAuth;
  window.glxEnsureApiSession = syncLegacySessionToApi;

  const addCartBadge = (count) => {
    document.querySelectorAll('[data-cart-count]').forEach((el) => { el.textContent = count; });
  };

  async function refreshCartCount() {
    // Localmente siempre lo más fresco posible: el cart unificado lee de
    // localStorage. Si después llega información del servidor con un total
    // distinto, NO sobreescribimos el badge — local manda.
    if (window.GarperLuxCart) { window.GarperLuxCart.refreshBadges(); return; }
    addCartBadge(Number(localStorage.getItem('garperlux_cart_count') || 0));
  }

  const findSku = (root) => {
    const text = root.closest('a, article, section, li, div')?.textContent || root.textContent || '';
    const match = text.match(/SKU\s+([A-Z0-9._-]+)/i);
    return match?.[1] || root.dataset.sku || '27101-31';
  };

  function bindLogin() {
    return;
  }

  function bindPasswordRecovery() {
    if (page !== '/pages/auth/recuperar-password.html') return;
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    const forms = [...document.querySelectorAll('form')];

    forms[0]?.addEventListener('submit', async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        const email = forms[0].querySelector('input[type="email"]')?.value.trim();
        const result = await api.forgotPassword(email);
        document.querySelector('[data-target-email]').textContent = email;
        if (result.resetUrl) {
          const helper = document.createElement('p');
          helper.className = 'mt-4 text-xs font-mono text-copper break-all';
          helper.textContent = `Enlace demo: ${result.resetUrl}`;
          forms[0].appendChild(helper);
        }
        if (window.glxShow) window.glxShow(2);
        toast('Solicitud de recuperación registrada.');
      } catch (error) {
        toast(error.message);
      }
    }, true);

    forms[1]?.addEventListener('submit', async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        const [password, repeat] = [...forms[1].querySelectorAll('input[type="password"]')].map((input) => input.value);
        if (password !== repeat) {
          toast('Las contraseñas no coinciden.');
          return;
        }
        if (!token) {
          toast('Falta el token de recuperación.');
          return;
        }
        const user = await api.resetPassword(token, password);
        await syncSessionToLegacyAuth();
        toast(`Contraseña actualizada para ${user.fullName}.`);
        if (window.glxShow) window.glxShow(4);
      } catch (error) {
        toast(error.message);
      }
    }, true);
  }

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const renderProductCard = (product) => {
    let stockColor = 'bg-warn';
    let stockText = 'Agotado';
    if (product.stock > 10) {
      stockColor = 'bg-stock';
      stockText = `${product.stock} uds`;
    } else if (product.stock > 0) {
      stockColor = 'bg-caution';
      stockText = `${product.stock} uds`;
    }
    const imageMarkup = product.image
      ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" class="absolute inset-0 w-full h-full object-contain p-3"/>`
      : `<div class="absolute inset-0 bg-gradient-to-br from-white/50 to-transparent"></div><span class="relative font-serif text-4xl text-graphite/20">GL</span>`;
    // Texto oculto que el filtro textual de catalog-ui.js usa para coincidencias
    // (marca, valores de specs, descripción): permite que los filtros del aside
    // funcionen sobre los productos renderizados desde el backend.
    const filterTokens = [];
    if (product.brand?.name) filterTokens.push(product.brand.name);
    if (product.category?.name) filterTokens.push(product.category.name);
    if (product.specs && typeof product.specs === 'object') {
      for (const [key, val] of Object.entries(product.specs)) {
        if (key.startsWith('_')) continue;
        if (val == null) continue;
        filterTokens.push(String(val));
      }
    }
    if (product.description) filterTokens.push(product.description.slice(0, 200));
    const hiddenTokens = escapeHtml(filterTokens.filter(Boolean).join(' · '));
    return `
  <a href="/pages/tienda/producto.html?sku=${encodeURIComponent(product.sku)}" class="card-prod group" data-sku="${escapeHtml(product.sku)}">
      <div class="aspect-square bg-paper-2 rounded-xl mb-4 flex items-center justify-center relative overflow-hidden">
        ${imageMarkup}
        <span class="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-paper ${stockColor}"><span class="w-1.5 h-1.5 rounded-full bg-white/60 shrink-0"></span>${stockText}</span>
      </div>
      <div class="space-y-2">
        <div class="font-mono text-[11px] text-graphite/70">SKU ${escapeHtml(product.sku)}</div>
        <h3 class="font-medium leading-tight group-hover:text-copper transition-colors">${escapeHtml(product.name)}</h3>
        <div class="flex items-end justify-between">
          <div><span class="font-serif text-xl font-medium">${money(product.price)}</span></div>
          <button type="button" data-add-cart data-sku="${escapeHtml(product.sku)}" class="w-9 h-9 rounded-full bg-ink text-paper grid place-items-center group-hover:bg-filament group-hover:text-ink transition-colors" aria-label="Añadir">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
      </div>
      <span class="sr-only" data-filter-tokens>${hiddenTokens}</span>
    </a>`;
  };

  function bindCatalogActions() {
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-add-cart], button[aria-label="Añadir"], .card-prod button');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const sku = button.dataset.sku || findSku(button);
      // Cantidad: si el botón está cerca de un input numérico (caso típico
      // del detalle del producto, donde el cliente indica X uds), usamos
      // ese valor. En tarjetas de listado / drawer no hay input → cae a 1.
      const qtyInput = document.getElementById('qty-input')
        || button.closest('section, article, div')?.querySelector('input[type="number"]')
        || (page === '/pages/tienda/producto.html' ? document.querySelector('input[type="number"]') : null);
      const qty = Math.max(1, Math.floor(Number(qtyInput?.value) || 1));
      // Lectura del producto completo (con imagen, marca, precio) para que
      // el carrito y el drawer no acaben con datos parciales.
      let productInfo = null;
      try { productInfo = await api.product(sku); } catch { /* ignore */ }
      if (!productInfo) {
        const card = button.closest('.card-prod');
        productInfo = {
          sku,
          name: card?.querySelector('h3')?.textContent?.trim() || sku,
          price: Number((card?.textContent || '').match(/(\d+[.,]\d+)\s*€/)?.[1].replace(',', '.')) || 0,
          image: card?.querySelector('img')?.src || null,
          brand: { name: card?.querySelector('.font-mono')?.textContent?.trim() || '—' },
        };
      }

      // Camino unificado: SIEMPRE escribimos en el cart local (verdad única).
      // El módulo se encarga del sync best-effort al servidor cuando hay
      // sesión iniciada — sin bloquear la UI ni depender del resultado.
      if (window.GarperLuxCart) {
        const maxStock = productInfo?.stock != null ? productInfo.stock : null;
        const result = window.GarperLuxCart.addItem({
          sku: productInfo.sku,
          title: productInfo.name,
          price: productInfo.price,
          image: productInfo.image,
          brand: productInfo.brand?.name || productInfo.brand,
        }, qty, maxStock);

        if (result?.capped) {
          toast(`Stock limitado: ya tienes ${result.finalQty} uds en la cesta (máximo ${maxStock}).`);
          return;
        }
      }
      addCartBadge((window.GarperLuxCart?.getCount() ?? 0));

      if (window.GarperLuxCartDrawer) window.GarperLuxCartDrawer.open(productInfo, qty);
      else toast('Producto añadido al carrito.');
      if (page === '/pages/tienda/carrito.html') location.reload();
    });
  }

  async function bindSearchPage() {
    if (page !== '/pages/tienda/buscador.html') return;
    const input = document.querySelector('main input[type="search"], input[type="search"]');
    const params = new URLSearchParams(location.search);
    if (params.get('q') && input) input.value = params.get('q');
    const run = async () => {
      const query = input?.value.trim() || '';
      const products = await api.products(query ? { q: query } : {});
      document.querySelectorAll('[data-pane="productos"] .grid, [data-pane="all"] .grid').forEach((grid) => {
        grid.innerHTML = products.slice(0, grid.closest('[data-pane="all"]') ? 4 : 12).map(renderProductCard).join('');
      });
    };
    input?.closest('div')?.querySelector('button')?.addEventListener('click', run);
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        run();
      }
    });
    await run().catch((error) => toast(error.message));
  }

  // Mapa de página -> categoría DB. La 'tienda.html' (hub) carga un mix.
  const CATEGORY_PAGE_MAP = {
    '/pages/tienda/tienda.html': { category: null, limit: 8 },
    '/pages/tienda/mecanismos.html': { category: 'mecanismos', limit: 12 },
    '/pages/tienda/iluminacion.html': { category: 'iluminacion', limit: 12 },
    '/pages/tienda/protecciones-electricas.html': { category: 'proteccion', limit: 12 },
    '/pages/tienda/porteros-videoporteros.html': { category: 'porteros-videoporteros', limit: 12 },
    '/pages/tienda/domotica.html': { category: 'domotica', limit: 12 },
    '/pages/tienda/automatismos.html': { category: 'automatismos', limit: 12 },
    '/pages/tienda/antenas-telecomunicaciones.html': { category: 'antenas-telecomunicaciones', limit: 12 },
    '/pages/tienda/seguridad.html': { category: 'seguridad', limit: 12 },
    '/pages/tienda/categoria-cableado.html': { category: 'cableado', limit: 12 },
  };

  // ===================================================================
  // SIDEBAR DINÁMICO — facetas por nombre del <summary> del bloque
  // ===================================================================
  const _normTxt = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

  // Paleta de colores (definida aquí porque FACET_DEFS la referencia y
  // const está sujeto a TDZ).
  const COLOR_PALETTE = {
    'blanco': '#FFFFFF', 'blanco alpino': '#FAFAF7', 'marfil': '#F0E8D8',
    'champagne': '#C9B58A', 'beige': '#E8DCC4',
    'amarillo': '#FFC878', 'oro': '#FFD700',
    'naranja': '#FF8C42', 'cobre': '#B8753A', 'madera': '#7B5638',
    'rojo': '#DC2626',
    'rosa': '#FF6FA0',
    'morado': '#7C3AED', 'violeta': '#7C3AED',
    'azul': '#1E3A8A', 'celeste': '#7DD3FC',
    'verde': '#16A34A',
    'gris': '#A8A8A8', 'gris / plata': 'linear-gradient(135deg,#E5E4E2,#A8A8A8)',
    'plata': 'linear-gradient(135deg,#E5E4E2,#A8A8A8)',
    'aluminio': 'linear-gradient(135deg,#C0C0C0,#808080)',
    'cromo': 'linear-gradient(135deg,#E5E4E2,#A8A8A8)',
    'inox': 'linear-gradient(135deg,#D5D5D5,#9A9A9A)',
    'antracita': '#2A2A2A', 'grafito': '#3A3B3C',
    'negro': '#0B0D12',
    'rgb': 'linear-gradient(135deg,#FF4D4D,#4DFF88,#4D88FF)',
    'multicolor': 'linear-gradient(135deg,#FF4D4D,#FFC878,#16A34A,#1E3A8A)',
    'amarillo/verde': 'linear-gradient(135deg,#FFC878 0%,#FFC878 50%,#16A34A 50%,#16A34A 100%)',
    'marrón': '#7B5638', 'marron': '#7B5638', 'cafe': '#7B5638',
    'transparente': 'repeating-linear-gradient(45deg,#F7F3EC 0,#F7F3EC 4px,#E5DED0 4px,#E5DED0 8px)',
  };

  function _resolveSwatch(value) {
    const norm = String(value || '').toLowerCase().trim();
    if (!norm) return null;
    if (COLOR_PALETTE[norm]) return COLOR_PALETTE[norm];
    const keys = Object.keys(COLOR_PALETTE).sort((a, b) => b.length - a.length);
    for (const k of keys) {
      if (norm.includes(k)) return COLOR_PALETTE[k];
    }
    return null;
  }

  // ---- Extractor canónico de colores ---------------------------------------
  // Reglas para mapear texto libre a una paleta cerrada. Cualquier facet de
  // tipo "Acabado", "Color del aislante", "Color del monitor", etc. debería
  // usar este extractor para evitar las inconsistencias del proveedor (a un
  // mismo color le ponen distintas etiquetas según la ficha) y para repartir
  // bien los productos entre las swatches que mostramos.
  // Reglas en ORDEN DE PRIORIDAD: la primera que encaja es la única etiqueta
  // que devolvemos para el producto. Las multi-color y compuestas van antes
  // que sus colores simples para que un cable "amarillo/verde" no caiga
  // simultáneamente en "Amarillo", "Verde" y "Amarillo/Verde".
  const _COLOR_RULES = [
    ['Multicolor', /\bmulticolor\b|\bvarios\s+colores\b|\brgb\b/i],
    ['Amarillo/Verde', /\bamarillo\s*\/\s*verde\b/i],
    ['Antracita', /\bantracita\b/i],
    ['Grafito', /\bgrafito\b/i],
    ['Marfil', /\bmarfil\b/i],
    ['Beige', /\bbeige\b|\bcrema\b/i],
    ['Champagne', /\bchampagne\b|\bchampan\b/i],
    ['Cromo', /\bcromo\b|\bcromad[oa]\b/i],
    ['Aluminio', /\baluminio\b/i],
    ['Madera', /\bmadera\b|\broble\b|\bnogal\b/i],
    ['Oro', /\bdorad[oa]\b|\boro\b/i],
    ['Negro', /\bnegr[oa]\b/i],
    ['Blanco', /\bblanc[oa]\b/i],
    ['Gris', /\bgris\b|\bplata\b|\bplateado\b/i],
    ['Azul', /\bazul\b/i],
    ['Verde', /\bverd[ea]\b/i],
    ['Rojo', /\broj[oa]\b/i],
    ['Amarillo', /\bamarill[oa]\b/i],
    ['Naranja', /\bnaranj[ae]\b/i],
    ['Marrón', /\bmarr[oó]n\b|\bcaf[eé]\b/i],
  ];
  function _canonicalColors(p, specCandidates) {
    const haystack = String(p.name || '');
    for (const [label, re] of _COLOR_RULES) {
      if (re.test(haystack)) return [label];
    }
    if (specCandidates && specCandidates.length) {
      const s = _specValue(p, ...specCandidates);
      if (s) {
        for (const [label, re] of _COLOR_RULES) {
          if (re.test(String(s))) return [label];
        }
      }
    }
    return [];
  }

  function _specValue(p, ...needles) {
    if (!p?.specs) return null;
    const norm = _normTxt;
    for (const needle of needles) {
      const wanted = norm(needle);
      for (const [k, v] of Object.entries(p.specs)) {
        if (k.startsWith('_')) continue;
        if (norm(k).includes(wanted)) return v;
      }
    }
    return null;
  }

  function _firstNumber(value) {
    const m = String(value || '').match(/-?\d+(?:[.,]\d+)?/);
    return m ? parseFloat(m[0].replace(',', '.')) : null;
  }

  function _bucketPower(p) {
    const w = _firstNumber(_specValue(p, 'potencia'));
    if (w == null) return null;
    if (w <= 5) return '≤ 5W';
    if (w <= 9) return '6-9W';
    if (w <= 14) return '10-14W';
    if (w <= 24) return '15-24W';
    if (w <= 49) return '25-49W';
    return '≥ 50W';
  }

  function _bucketTemperature(p) {
    const v = String(_specValue(p, 'temperatura de color', 'temperatura color', 'temperatura') || '').toLowerCase();
    if (!v) return null;
    if (/rgb|color cambiante|cambiante/i.test(v)) return 'RGB';
    const num = _firstNumber(v);
    if (num == null) return null;
    if (num <= 2900) return '2700K';
    if (num <= 3500) return '3000K';
    if (num <= 4500) return '4000K';
    if (num <= 5500) return '5000K';
    return '6000K';
  }

  function _bucketIP(p) {
    // Mira tanto en specs como en el nombre del producto: muchos productos
    // no exponen IP en JSON-LD pero sí en el título (e.g. Lexman Trail IP55).
    const sources = [
      _specValue(p, 'proteccion ip', 'protección ip', 'indice de proteccion', 'índice de protección', 'ip'),
      p.name,
    ].filter(Boolean).join(' ');
    const m = sources.match(/IP\s?(\d{2})/i);
    return m ? `IP${m[1]}` : null;
  }

  function _bucketAmps(p) {
    const v = String(_specValue(p, 'intensidad nominal', 'intensidad', 'amperaje') || '');
    const m = v.match(/(\d+(?:[.,]\d+)?)\s*A\b/i);
    return m ? `${m[1].replace(',', '.')}A` : null;
  }

  function _truthy(v) {
    if (v == null) return false;
    const s = String(v).toLowerCase().trim();
    return s === 'sí' || s === 'si' || s === 'yes' || s === 'true' || s === '1';
  }

  // Helper: busca en specs Y en el nombre del producto un valor por regex.
  function _matchInName(p, regex) {
    const m = (p?.name || '').match(regex);
    return m ? m[0] : null;
  }
  function _matchInNameGroup(p, regex) {
    const m = (p?.name || '').match(regex);
    return m ? (m[1] || m[0]) : null;
  }

  // Definición por nombre normalizado de bloque <summary>.
  // extractor → produce uno o varios valores por producto.
  // type: 'checkbox' | 'swatch' | 'chip' | 'price'
  const FACET_DEFS = {
    // ===== Comunes =====
    'marca': { type: 'checkbox', extract: (p) => [p.brand?.name || 'Sin marca'] },
    'gama': { type: 'checkbox', extract: (p) => [_specValue(p, 'nombre de la serie', 'serie', 'gama', 'modelo comercial')].filter(Boolean) },

    // ===== Tipos =====
    'tipo de luminaria': { type: 'checkbox', extract: (p) => [_specValue(p, 'tipo de producto')].filter(Boolean) },
    'tipo de protección': { type: 'checkbox', extract: (p) => [_specValue(p, 'tipo de interruptor diferencial', 'tipo de producto')].filter(Boolean) },
    'tipo de equipo': { type: 'checkbox', extract: (p) => [_specValue(p, 'tipo de producto')].filter(Boolean) },
    'tipo de dispositivo': { type: 'checkbox', extract: (p) => [_specValue(p, 'tipo de producto', 'forma')].filter(Boolean) },

    // ===== Iluminación =====
    'casquillo': {
      type: 'chip',
      extract: (p) => {
        const s = _specValue(p, 'tipo de casquillo', 'casquillo');
        if (s) return [s];
        const m = _matchInNameGroup(p, /\b(E27|E14|GU10|GU5\.3|G9|G4|B22|MR16|R7s)\b/i);
        return m ? [m.toUpperCase()] : [];
      },
    },
    'temperatura de color': {
      type: 'swatch',
      extract: (p) => [_bucketTemperature(p)].filter(Boolean),
      palette: { '2700K': '#FFB347', '3000K': '#FFD194', '4000K': '#FFEACC', '5000K': '#F4F8FF', '6000K': '#D6E4FF', 'RGB': 'linear-gradient(135deg,#FF4D4D,#4DFF88,#4D88FF)' },
    },
    'potencia (w)': { type: 'chip', extract: (p) => [_bucketPower(p)].filter(Boolean), order: ['≤ 5W', '6-9W', '10-14W', '15-24W', '25-49W', '≥ 50W'] },
    'protección ip': { type: 'checkbox', extract: (p) => [_bucketIP(p)].filter(Boolean) },
    'características': {
      type: 'checkbox',
      extract: (p) => {
        const out = [];
        if (_truthy(_specValue(p, 'variacion de la intensidad', 'regulable', 'dimable'))) out.push('Regulable / dimable');
        if (_truthy(_specValue(p, 'objeto conectado'))) out.push('Smart Wi-Fi');
        const proto = String((_specValue(p, 'tipo de protocolo wifi') || '') + ' ' + (p.name || '')).toLowerCase();
        if (/zigbee/.test(proto)) out.push('Compatible Zigbee');
        if (/filament|edison|vintage/i.test(p.name || '')) out.push('Filament / vintage');
        const eClase = String(_specValue(p, 'clase energetica', 'clase energética') || '').toUpperCase().trim();
        if (/^A(\+\+)?\b|^A\+/.test(eClase)) out.push('Bajo consumo A++');
        return out;
      },
    },

    // ===== Mecanismos =====
    'acabado': {
      type: 'swatch',
      // Usa el extractor canónico — name primero (más fiable), spec como
      // fallback. La spec del proveedor mete cosas como "Beige" para un
      // producto cuyo nombre dice "color blanco", o "Gris/plata" para un
      // antracita; por eso no nos fiamos.
      extract: (p) => _canonicalColors(p, ['familia de color', 'color', 'acabado del producto', 'acabado']),
      palette: COLOR_PALETTE,
    },
    'amperaje': {
      type: 'chip',
      extract: (p) => {
        const v = _bucketAmps(p);
        if (v) return [v];
        const m = _matchInNameGroup(p, /\b(\d{1,2})\s?A\b/i);
        return m ? [`${m}A`] : [];
      },
    },
    'uso': {
      type: 'checkbox',
      extract: (p) => {
        const out = [];
        const ip = _bucketIP(p) || '';
        if (/IP55|IP65|IP67|IP66/i.test(ip)) out.push('Exterior');
        else if (/IP44|IP54/i.test(ip)) out.push('Estanco IP44');
        else if (/IP2/i.test(ip) || !ip) out.push('Interior');
        const name = (p.name || '').toLowerCase();
        if (/exterior|outdoor/.test(name)) out.push('Exterior');
        return [...new Set(out)];
      },
    },
    'compatibilidad': {
      type: 'checkbox',
      extract: (p) => {
        const fij = String(_specValue(p, 'tipo de fijacion', 'tipo de fijación') || '').toLowerCase();
        const out = [];
        if (/garras|universal/.test(fij)) out.push('Caja universal estándar');
        if (_truthy(_specValue(p, 'objeto conectado'))) out.push('Compatible domótica');
        if (/modular/.test(fij)) out.push('Sistema modular');
        return out;
      },
    },

    // ===== Protección eléctrica =====
    'curva (magnetotérmico)': {
      type: 'chip',
      extract: (p) => {
        const m = _matchInNameGroup(p, /\bcurva\s+([BCDK])\b/i);
        return m ? [m.toUpperCase()] : [];
      },
    },
    'polos': {
      type: 'chip',
      extract: (p) => {
        const v = _specValue(p, 'numero de polos', 'número de polos', 'polos');
        if (v) return [String(v).match(/\d+P(\+N)?/i)?.[0] || String(v)];
        const m = _matchInNameGroup(p, /\b(\d+P(?:\+N)?|bipolar|tetrapolar|tripolar)\b/i);
        if (!m) return [];
        const txt = m.toLowerCase();
        if (txt === 'bipolar') return ['2P'];
        if (txt === 'tripolar') return ['3P'];
        if (txt === 'tetrapolar') return ['4P'];
        return [m.toUpperCase()];
      },
    },
    'intensidad nominal (a)': {
      type: 'chip',
      extract: (p) => {
        const m = _matchInNameGroup(p, /\b(\d{1,3})\s?A\b/i);
        return m ? [`${m}A`] : [];
      },
    },
    'sensibilidad diferencial (ma)': {
      type: 'chip',
      extract: (p) => {
        const v = _specValue(p, 'sensibilidad');
        if (v) {
          const num = _firstNumber(v);
          return num != null ? [`${num} mA`] : [String(v)];
        }
        const m = _matchInNameGroup(p, /\b(\d{2,3})\s?mA\b/i);
        return m ? [`${m} mA`] : [];
      },
    },
    'tipo diferencial': {
      type: 'checkbox',
      extract: (p) => {
        const v = _specValue(p, 'tipo de interruptor diferencial', 'tipo diferencial');
        return v ? [String(v).trim()] : [];
      },
    },
    'capacidad de corte (ka)': {
      type: 'chip',
      extract: (p) => {
        const v = _specValue(p, 'capacidad de corte', 'kA', 'icu', 'icn');
        if (v) return [String(v).trim()];
        const m = _matchInNameGroup(p, /\b(\d{1,2}(?:\.\d)?)\s?kA\b/i);
        return m ? [`${m} kA`] : [];
      },
    },

    // ===== Porteros y videoporteros =====
    'sistema': { type: 'checkbox', extract: (p) => [_specValue(p, 'sistema', 'tipo de instalacion', 'tipo de instalación')].filter(Boolean) },
    'sistema / instalación': { type: 'checkbox', extract: (p) => [_specValue(p, 'sistema', 'tipo de instalacion', 'tipo de instalación')].filter(Boolean) },
    'tamaño pantalla': {
      type: 'chip',
      extract: (p) => {
        const v = _specValue(p, 'diagonal pantalla', 'tamano pantalla', 'tamaño pantalla', 'pantalla');
        if (v) return [String(v).trim()];
        const m = _matchInNameGroup(p, /\b(\d{1,2}(?:[.,]\d)?)\s?(?:["”]|pulgadas|pulg)/i);
        return m ? [`${m}"`] : [];
      },
    },
    'color del monitor': {
      type: 'swatch',
      // Mismo extractor canónico que "Acabado" — name primero, spec después.
      extract: (p) => _canonicalColors(p, ['color del monitor', 'familia de color', 'color']),
      palette: COLOR_PALETTE,
    },
    'color': {
      type: 'swatch',
      extract: (p) => _canonicalColors(p, ['familia de color', 'color']),
      palette: COLOR_PALETTE,
    },
    'conectividad': {
      type: 'checkbox',
      extract: (p) => {
        const out = [];
        if (_truthy(_specValue(p, 'objeto conectado', 'visualizacion en internet', 'visualización en internet'))) {
          out.push('Wi-Fi');
        }
        const name = (p.name || '').toLowerCase();
        if (/poe/.test(name)) out.push('PoE');
        if (/wifi|wi-fi|inal[áa]mbric/.test(name)) out.push('Wi-Fi');
        if (/cabl/.test(name)) out.push('Cableado');
        if (/4g|gsm/.test(name)) out.push('GSM/4G');
        if (/jeweller/.test(name)) out.push('Jeweller');
        return [...new Set(out)];
      },
    },
    'nº de viviendas': {
      type: 'checkbox',
      extract: (p) => {
        const m = _matchInNameGroup(p, /\b(\d+)\s?(?:viviendas?|hogares?)\b/i);
        if (m) {
          const n = parseInt(m, 10);
          if (n === 1) return ['Individual'];
          if (n <= 4) return ['2-4'];
          if (n <= 12) return ['5-12'];
          return ['+12'];
        }
        return ['Individual']; // por defecto los kits son individuales
      },
    },
    'lugar de instalación': {
      type: 'checkbox',
      extract: (p) => {
        const ip = _bucketIP(p) || '';
        const out = [];
        if (/IP54|IP55|IP65|IP66|IP67/i.test(ip)) out.push('Estanco IP54+');
        const fij = (_specValue(p, 'tipo de fijacion', 'tipo de fijación') || '').toLowerCase();
        if (/empotr/.test(fij)) out.push('Empotrar');
        else if (/superficie/.test(fij)) out.push('Superficie');
        return out;
      },
    },

    // ===== Domótica =====
    'protocolo': {
      type: 'checkbox',
      extract: (p) => {
        const out = [];
        const text = `${p.name || ''} ${_specValue(p, 'tipo de protocolo wifi') || ''}`.toLowerCase();
        if (/wi-fi|wifi/.test(text)) out.push('Wi-Fi');
        if (/zigbee/.test(text)) out.push('Zigbee');
        if (/z-wave/.test(text)) out.push('Z-Wave');
        if (/matter/.test(text)) out.push('Matter');
        if (/thread/.test(text)) out.push('Thread');
        if (/knx/.test(text)) out.push('KNX');
        if (/bluetooth|bt/.test(text)) out.push('Bluetooth');
        if (/433\s?mhz|rf\s?433/.test(text)) out.push('RF 433');
        return out;
      },
    },
    'asistente compatible': {
      type: 'checkbox',
      extract: (p) => {
        const text = `${p.name || ''} ${p.description || ''}`.toLowerCase();
        const out = [];
        if (/alexa/.test(text)) out.push('Amazon Alexa');
        if (/google\s?(home|assistant)/.test(text)) out.push('Google Home');
        if (/homekit|apple/.test(text)) out.push('Apple HomeKit');
        if (/home\s?assistant|hassio/.test(text)) out.push('Home Assistant');
        if (/ifttt/.test(text)) out.push('IFTTT');
        if (/smartthings/.test(text)) out.push('SmartThings');
        return out;
      },
    },
    'función': {
      type: 'checkbox',
      extract: (p) => {
        const v = _specValue(p, 'tipo de control', 'forma', 'tipo de producto');
        return v ? [String(v).trim()] : [];
      },
    },
    'alimentación': {
      type: 'checkbox',
      extract: (p) => {
        const v = _specValue(p, 'alimentacion', 'alimentación');
        if (v) return [String(v).trim()];
        const text = (p.name || '').toLowerCase();
        const out = [];
        if (/230\s?v/.test(text)) out.push('230V AC');
        if (/12-24|24\s?v|12\s?v/.test(text)) out.push('12-24V DC');
        if (/usb/.test(text)) out.push('USB');
        if (/pila|bater[ií]a/.test(text)) out.push('Pila');
        return out;
      },
    },
    'instalación': {
      type: 'checkbox',
      extract: (p) => {
        const fij = (_specValue(p, 'tipo de fijacion', 'tipo de fijación', 'tipo de instalación') || '').toLowerCase();
        const text = (p.name || '').toLowerCase();
        const out = [];
        if (/carril|din/.test(fij + text)) out.push('Carril DIN');
        else if (/empotr|mecanism/.test(fij + text)) out.push('Detrás de mecanismo');
        else if (/enchuf|plug/.test(text)) out.push('Enchufable plug-and-play');
        else if (/adhes/.test(text)) out.push('Adhesivo / sobreponer');
        return out;
      },
    },

    // ===== Automatismos =====
    'tipo de puerta': {
      type: 'checkbox',
      extract: (p) => {
        const text = (p.name || '').toLowerCase();
        const out = [];
        if (/seccional/.test(text)) out.push('Seccional');
        if (/basculante/.test(text)) out.push('Basculante');
        if (/enrollable/.test(text)) out.push('Enrollable');
        if (/batiente/.test(text)) out.push('Batiente');
        if (/corredera/.test(text)) out.push('Corredera');
        if (/plegable/.test(text)) out.push('Plegable');
        return out;
      },
    },
    'peso máximo (kg)': {
      type: 'chip',
      extract: (p) => {
        const v = _firstNumber(_specValue(p, 'fuerza motriz', 'peso maximo', 'peso máximo') || '');
        if (v == null) return [];
        if (v <= 300) return ['≤ 300 kg'];
        if (v <= 500) return ['300-500 kg'];
        if (v <= 800) return ['500-800 kg'];
        if (v <= 1200) return ['800-1.200 kg'];
        return ['≥ 1.200 kg'];
      },
    },
    'frecuencia mando': {
      type: 'checkbox',
      extract: (p) => {
        const text = (p.name || '').toLowerCase();
        const out = [];
        if (/433/.test(text)) out.push('433 MHz');
        if (/868/.test(text)) out.push('868 MHz');
        if (/quartz|cuarzo/.test(text)) out.push('Quartz');
        if (/rolling\s?code/.test(text)) out.push('Rolling code');
        return out;
      },
    },
    'funcionalidades': {
      type: 'checkbox',
      extract: (p) => {
        const text = (p.name || '') + ' ' + (p.description || '');
        const t = text.toLowerCase();
        const out = [];
        if (/obst[áa]cul/.test(t)) out.push('Detección obstáculos');
        if (/soft.?start/.test(t)) out.push('Soft-start / soft-stop');
        if (/peatonal/.test(t)) out.push('Apertura parcial peatonal');
        if (/app|smartphone/.test(t)) out.push('Compatible app móvil');
        if (/encoder/.test(t)) out.push('Encoder absoluto');
        if (/intensiv|industrial/.test(t)) out.push('Uso intensivo / industrial');
        return out;
      },
    },

    // ===== Antenas / Telecomunicaciones =====
    'banda / aplicación': {
      type: 'checkbox',
      extract: (p) => {
        const text = (p.name || '').toLowerCase();
        const out = [];
        if (/uhf/.test(text)) out.push('UHF');
        if (/vhf/.test(text)) out.push('VHF');
        if (/\bku\b/.test(text)) out.push('Ku');
        if (/\bka\b/.test(text)) out.push('Ka');
        if (/2\.4\s?ghz|2400/.test(text)) out.push('2.4 GHz');
        if (/\b5\s?ghz/.test(text)) out.push('5 GHz');
        if (/\b6\s?ghz/.test(text)) out.push('6 GHz');
        return out;
      },
    },
    'tipo de cable': {
      type: 'checkbox',
      extract: (p) => {
        const text = (p.name || '').toLowerCase();
        const v = (_specValue(p, 'nombre del cable', 'tipo de cable') || '').toString().toLowerCase();
        const t = text + ' ' + v;
        const out = [];
        if (/rg6/.test(t)) out.push('Coaxial RG6');
        if (/t100|t200|ftth/.test(t)) out.push('Coaxial T100 / T200 (FTTH)');
        if (/cat\s?5e/.test(t)) out.push('UTP cat 5e');
        if (/cat\s?6\b/.test(t)) out.push('UTP cat 6');
        if (/cat\s?6a|cat\s?7/.test(t)) out.push('UTP cat 6a / cat 7');
        if (/monomodo|sm\b/.test(t)) out.push('Fibra óptica monomodo');
        if (/multimodo|mm\b/.test(t)) out.push('Fibra óptica multimodo');
        if (out.length === 0 && v) out.push(v.toString().slice(0, 30));
        return out;
      },
    },
    'estándar wi-fi': {
      type: 'checkbox',
      extract: (p) => {
        const text = (p.name || '').toLowerCase();
        const out = [];
        if (/wi-?fi\s?7|802\.11be/.test(text)) out.push('Wi-Fi 7');
        else if (/wi-?fi\s?6e/.test(text)) out.push('Wi-Fi 6E');
        else if (/wi-?fi\s?6|802\.11ax/.test(text)) out.push('Wi-Fi 6');
        else if (/wi-?fi\s?5|802\.11ac/.test(text)) out.push('Wi-Fi 5');
        return out;
      },
    },
    'velocidad red (ethernet)': {
      type: 'checkbox',
      extract: (p) => {
        const v = _firstNumber(_specValue(p, 'transmision de datos', 'velocidad red', 'velocidad ethernet') || '');
        if (v == null) return [];
        if (v >= 10000) return ['10 Gbps'];
        if (v >= 2500) return ['2.5 Gbps'];
        if (v >= 1000) return ['1 Gbps'];
        return ['100 Mbps'];
      },
    },

    // ===== Seguridad =====
    'resolución (cámaras)': {
      type: 'checkbox',
      extract: (p) => {
        const m = _matchInNameGroup(p, /\b(\d+)\s?MP\b/i);
        if (!m) return [];
        const n = parseInt(m, 10);
        if (n >= 8) return ['8 MP / 4K'];
        if (n >= 5) return ['5 MP'];
        if (n >= 4) return ['4 MP'];
        if (n >= 2) return ['2 MP / 1080p'];
        return [`${m} MP`];
      },
    },
    'visión nocturna': {
      type: 'checkbox',
      extract: (p) => {
        const text = (p.name || '').toLowerCase();
        const v = _specValue(p, 'vision nocturna', 'visión nocturna', 'camara con vision nocturna');
        const out = [];
        if (/colorvu|color\s?nocturna/.test(text)) out.push('ColorVu / Color de noche');
        if (/dual|smart\s?hybrid/.test(text)) out.push('Doble lente / Smart Hybrid');
        if (v && _truthy(v)) out.push('IR (infrarrojos)');
        else if (/\bir\b|infrarroj/.test(text)) out.push('IR (infrarrojos)');
        return [...new Set(out)];
      },
    },
    'almacenamiento': {
      type: 'checkbox',
      extract: (p) => {
        const text = (p.name || '').toLowerCase();
        const out = [];
        if (/microsd|tarjeta\s?sd/.test(text)) out.push('microSD integrada');
        if (/\bnvr\b|\bdvr\b/.test(text)) out.push('NVR / DVR (red local)');
        if (/cloud|nube/.test(text)) out.push('Cloud / nube');
        if (/nas|rtsp/.test(text)) out.push('NAS / RTSP');
        return out;
      },
    },
    'app / ecosistema': {
      type: 'checkbox',
      extract: (p) => {
        const text = (p.name || '').toLowerCase();
        const out = [];
        if (/hik-?connect|hikvision/.test(text)) out.push('Hik-Connect');
        if (/reolink/.test(text)) out.push('Reolink App');
        if (/ajax/.test(text)) out.push('Ajax PRO');
        if (/dmss|dahua/.test(text)) out.push('DMSS (Dahua)');
        if (/tuya|smart\s?life/.test(text)) out.push('Smart Life / Tuya');
        if (/homekit|apple/.test(text)) out.push('Compatible HomeKit');
        return out;
      },
    },

    // ===== Cableado (estructura propia con radio buttons) =====
    'familia': {
      type: 'checkbox',
      extract: (p) => {
        const v = String(_specValue(p, 'tipo de producto') || '').toLowerCase();
        if (/cable/.test(v) || /cable/i.test(p.name || '')) return ['Cables'];
        if (/tubo|canalizaci|corrugad/.test(v) || /tubo|canalizaci|corrugad/i.test(p.name || '')) return ['Canalizaciones'];
        return [];
      },
    },
    'tipo': {
      type: 'checkbox',
      extract: (p) => {
        const v = _specValue(p, 'modelo comercial', 'tipo de cable');
        if (v) return [String(v).trim()];
        const m = _matchInNameGroup(p, /\b(H07V-K|RV-K|UTP cat ?\d+\w?|FTP|coaxial|fibra)\b/i);
        return m ? [m.toUpperCase()] : [];
      },
    },
    'formato': {
      type: 'checkbox',
      extract: (p) => {
        const v = _specValue(p, 'presentacion', 'presentación');
        return v ? [String(v).trim()] : [];
      },
    },
    'sección': {
      type: 'chip',
      extract: (p) => {
        const v = _firstNumber(_specValue(p, 'seccion del cable', 'sección del cable', 'seccion', 'sección') || '');
        return v != null ? [`${v} mm²`] : [];
      },
    },
    'sección de los hilos': {
      type: 'chip',
      extract: (p) => {
        const v = _firstNumber(_specValue(p, 'seccion del cable', 'sección del cable', 'seccion', 'sección') || '');
        return v != null ? [`${v} mm²`] : [];
      },
    },
    'color del aislante': {
      type: 'swatch',
      // Mismo extractor canónico que "Acabado" pero buscando primero la
      // spec específica del aislante. Devuelve UN solo color por producto
      // (la primera regla que encaja gana), así "amarillo/verde" no genera
      // tres swatches diferentes (Amarillo, Verde y Amarillo/Verde).
      extract: (p) => _canonicalColors(p, ['color del aislante', 'familia de color', 'color']),
      palette: COLOR_PALETTE,
    },
    'número de hilos': {
      type: 'chip',
      extract: (p) => {
        const v = _firstNumber(_specValue(p, 'numero de cables', 'número de cables', 'numero de hilos', 'número de hilos') || '');
        return v != null ? [`${v} hilo${v !== 1 ? 's' : ''}`] : [];
      },
    },
    'diámetro': {
      type: 'chip',
      extract: (p) => {
        // Solo aplica a tubos/canalizaciones, no a cables (donde "X mm²" lo
        // confundiría con sección).
        if (!/tubo|canalizaci|corrugad|r[ií]gid/i.test(p.name || '')) return [];
        const m = _matchInNameGroup(p, /\b(\d+(?:[.,]\d+)?)\s?mm\b/i);
        return m ? [`${m.replace(',', '.')} mm`] : [];
      },
    },
    'longitud': {
      type: 'chip',
      extract: (p) => {
        const m = _matchInNameGroup(p, /\b(\d+)\s?(?:m|metros|metro)\b/i);
        if (!m) return [];
        const n = parseInt(m, 10);
        if (n <= 5) return ['≤ 5 m'];
        if (n <= 25) return ['6-25 m'];
        if (n <= 50) return ['26-50 m'];
        if (n <= 100) return ['51-100 m'];
        return ['≥ 100 m'];
      },
    },

    // ===== Antenas — Ganancia =====
    'ganancia (db)': {
      type: 'chip',
      extract: (p) => {
        const m = _matchInNameGroup(p, /\b(\d+(?:[.,]\d+)?)\s?dB\b/i);
        return m ? [`${m.replace(',', '.')} dB`] : [];
      },
    },

    // ===== Disponibilidad común =====
    'disponibilidad': {
      type: 'checkbox',
      extract: (p) => {
        const out = [];
        if (p.stock > 0) {
          out.push('Solo en stock');
          out.push('Envío en 24 h');
          out.push('Recogida en almacén');
        }
        return out;
      },
    },
  };

  // Pre-normaliza las keys de FACET_DEFS (sin tildes, lowercase) para que
  // la búsqueda por nombre del <summary> funcione independientemente de los
  // acentos de la key del objeto (e.g. 'sección' vs 'seccion').
  const _FACET_DEFS_NORM = (() => {
    const out = {};
    for (const [k, v] of Object.entries(FACET_DEFS)) out[_normTxt(k)] = v;
    return out;
  })();
  function _hasFacet(name) {
    return Object.prototype.hasOwnProperty.call(_FACET_DEFS_NORM, _normTxt(name));
  }
  function _facetDef(name) {
    return _FACET_DEFS_NORM[_normTxt(name)] || null;
  }

  // Cuando un <details> del sidebar no tiene FACET_DEF, intentamos construir
  // uno dinámicamente buscando una spec cuyo nombre coincida con el título
  // del filtro. Devolvemos un def válido o null si no hay datos.
  // El tipo de UI (checkbox|chip|swatch) se infiere del marcado original
  // que el HTML traía hardcoded:
  //   - Si el body contiene .swatch  → swatch
  //   - Si contiene una <button> con look chip → chip
  //   - Si no, checkbox (default)
  function _autoFacetForSummary(name, products, body) {
    const wantedNorm = _normTxt(name);
    // Cualquier facet que hable de "color" o de "acabado" lo enrutamos por
    // el extractor canónico — evita los desórdenes del proveedor (Beige vs
    // Blanco, Gris/plata vs Antracita, etc.) y muestra las swatches con
    // colores reales de la paleta.
    if (/\bcolor\b|\bacabado\b/.test(wantedNorm)) {
      const SPEC_HINTS = [wantedNorm, 'familia de color', 'color', 'acabado del producto', 'acabado'];
      return {
        type: 'swatch',
        extract: (p) => _canonicalColors(p, SPEC_HINTS),
        palette: COLOR_PALETTE,
      };
    }
    // Mapas de alias del título -> claves de spec a probar (cubre la mayoría
    // de los <details> usados en las páginas de categoría).
    const ALIAS = {
      'tipo de cable': ['tipo de cable', 'nombre del cable', 'norma o etiqueta'],
      'tipo de puerta': ['subcategoria', 'subcategoría'],
      'peso maximo (kg)': ['peso puerta max. (kg)', 'peso maximo'],
      'peso máximo (kg)': ['peso puerta max. (kg)', 'peso maximo'],
      'frecuencia mando': ['frecuencia', 'frecuencia (mhz)'],
      'alimentacion': ['funcionamiento del motor', 'alimentacion', 'alimentación'],
      'alimentación': ['funcionamiento del motor', 'alimentacion', 'alimentación'],
      'protocolo': ['tipo de protocolo wifi', 'protocolo'],
      'asistente compatible': ['compatibilidad con software', 'asistente'],
      'estandar wi-fi': ['banda de frecuencia (en mhz)', 'estandar wifi', 'wifi'],
      'estándar wi-fi': ['banda de frecuencia (en mhz)', 'estandar wifi', 'wifi'],
      'velocidad red (ethernet)': ['transmision de datos (en mbps)', 'velocidad'],
      'banda / aplicacion': ['tipo de producto', 'banda'],
      'banda / aplicación': ['tipo de producto', 'banda'],
      'familia': ['familia', 'subcategoria', 'subcategoría'],
      'tipo': ['tipo de producto', 'gama'],
      'formato': ['presentacion', 'presentación'],
      'seccion': ['seccion del cable (en mm²)', 'sección del cable (en mm²)', 'seccion mm', 'sección mm'],
      'sección': ['seccion del cable (en mm²)', 'sección del cable (en mm²)'],
      'color del aislante': ['familia de color', 'color', 'aislante'],
      'numero de hilos': ['numero de cables', 'número de cables'],
      'número de hilos': ['numero de cables', 'número de cables'],
      'sistema / instalacion': ['cableado', 'sistema'],
      'sistema / instalación': ['cableado', 'sistema'],
      'tamano pantalla': ['altura del puesto interior (en cm)', 'pantalla'],
      'tamaño pantalla': ['altura del puesto interior (en cm)', 'pantalla'],
      'color del monitor': ['familia de color'],
      'conectividad': ['objeto conectado (domotica y smarthome)', 'objeto conectado (domótica y smarthome)', 'tipo de protocolo wifi', 'conectividad'],
      'no de viviendas': ['especialidad'],
      'nº de viviendas': ['especialidad'],
      'lugar de instalacion': ['instalacion del puesto exterior', 'instalación del puesto exterior'],
      'lugar de instalación': ['instalacion del puesto exterior', 'instalación del puesto exterior'],
      'curva (magnetotermico)': ['curva', 'curva magnetotermica'],
      'curva (magnetotérmico)': ['curva', 'curva magnetotermica'],
      'polos': ['poles', 'polos', 'numero de polos', 'número de polos'],
      'intensidad nominal (a)': ['intensidad nominal', 'amperaje', 'in'],
      'sensibilidad diferencial (ma)': ['sensibilidad', 'sensibilidad diferencial'],
      'tipo diferencial': ['tipo de interruptor diferencial'],
      'capacidad de corte (ka)': ['capacidad de corte', 'pdc'],
      'resolucion (camaras)': ['resolucion', 'resolución'],
      'resolución (cámaras)': ['resolucion', 'resolución'],
      'vision nocturna': ['camara con vision nocturna', 'cámara con visión nocturna', 'vision nocturna (en m)'],
      'visión nocturna': ['camara con vision nocturna', 'cámara con visión nocturna', 'vision nocturna (en m)'],
      'almacenamiento': ['almacenamiento'],
      'app / ecosistema': ['compatibilidad con software'],
      'funcion': ['tipo de producto'],
      'función': ['tipo de producto'],
      'funcionalidades': ['antiaplastamiento', 'final de carrera', 'encoder'],
      'instalacion': ['instalacion del puesto exterior', 'tipo de fijacion', 'tipo de fijación'],
      'instalación': ['instalacion del puesto exterior', 'tipo de fijacion', 'tipo de fijación'],
      'longitud': ['longitud del cable entre pantalla y camara (en m)'],
      'diametro': ['diametro (en mm)', 'diámetro (en mm)'],
      'diámetro': ['diametro (en mm)', 'diámetro (en mm)'],
      'ganancia (db)': ['ganancia'],
    };
    const specsToTry = ALIAS[wantedNorm] || [wantedNorm];
    // Localiza la primera key que aparezca en al menos un producto.
    const findKey = () => {
      for (const cand of specsToTry) {
        for (const p of products) {
          if (!p.specs) continue;
          for (const k of Object.keys(p.specs)) {
            if (k.startsWith('_')) continue;
            if (_normTxt(k) === cand) return k;
          }
        }
      }
      // Fallback más laxo: busca contains.
      for (const cand of specsToTry) {
        for (const p of products) {
          if (!p.specs) continue;
          for (const k of Object.keys(p.specs)) {
            if (k.startsWith('_')) continue;
            if (_normTxt(k).includes(cand)) return k;
          }
        }
      }
      return null;
    };
    const specKey = findKey();
    if (!specKey) return null;
    // Detecta tipo de UI a partir del marcado existente.
    let uiType = 'checkbox';
    if (body.querySelector('.swatch')) uiType = 'swatch';
    else if (body.querySelector('.flex.flex-wrap')) uiType = 'chip';
    return {
      type: uiType,
      extract: (p) => {
        const v = p?.specs?.[specKey];
        if (v == null) return [];
        const s = String(v).trim();
        if (!s || s === '—' || s === '-') return [];
        // Normaliza booleanos típicos de la fuente: "Sí" → "Sí", "No" → no
        // aplicable (no añade valor de filtro).
        if (/^no$/i.test(s)) return [];
        return [s];
      },
    };
  }

  function _setupSidebarFacets(products, state, applyCallback) {
    const sidebar = document.querySelector('main aside, aside');
    if (!sidebar) return;
    const detailsBlocks = [...sidebar.querySelectorAll('details')];
    detailsBlocks.forEach((det) => {
      const summary = det.querySelector('summary span');
      if (!summary) return;
      const name = summary.textContent.trim();
      const body = det.querySelector('summary')?.nextElementSibling;
      if (!body) return;
      // Bloques especiales gestionados por su propio handler más abajo.
      if (/^precio$/i.test(name) || /^disponibilidad$/i.test(name)) return;
      let def = _facetDef(name);
      // Si no hay FACET_DEF explícito, intentamos resolverlo dinámicamente
      // buscando specs cuyo nombre coincida con el de la summary. Si tampoco
      // hay datos suficientes, ocultamos el bloque entero (mejor que dejarlo
      // con los valores hardcoded del demo).
      if (!def) {
        def = _autoFacetForSummary(name, products, body);
        if (!def) {
          det.style.display = 'none';
          body.innerHTML = '';
          return;
        }
      }

      // Recopilar values y counts
      const valueCounts = new Map(); // value -> count
      products.forEach((p) => {
        const vals = (def.extract(p) || []).filter(Boolean);
        vals.forEach((v) => valueCounts.set(v, (valueCounts.get(v) || 0) + 1));
      });
      // Si hay 0 ó 1 valores únicos, esconder el bloque: una faceta con un
      // solo valor no permite particionar el catálogo y solo añade ruido al
      // sidebar. También limpiamos el body para borrar cualquier resto
      // hardcoded.
      if (valueCounts.size <= 1) {
        det.style.display = 'none';
        body.innerHTML = '';
        return;
      }
      det._glxDef = def;
      // Orden
      let entries = [...valueCounts.entries()];
      if (def.order) {
        const order = def.order;
        entries.sort((a, b) => {
          const ia = order.indexOf(a[0]); const ib = order.indexOf(b[0]);
          if (ia !== -1 && ib !== -1) return ia - ib;
          if (ia !== -1) return -1; if (ib !== -1) return 1;
          return b[1] - a[1];
        });
      } else {
        entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      }
      // Render según type
      body.innerHTML = '';
      const facetKey = _normTxt(name);
      state.filters[facetKey] = state.filters[facetKey] || [];
      const stateArr = state.filters[facetKey];

      if (def.type === 'checkbox') {
        entries.forEach(([val, count]) => {
          const lbl = document.createElement('label');
          lbl.className = 'filter-check';
          lbl.innerHTML = `<input type="checkbox"/> ${val} <span class="count">${count}</span>`;
          const input = lbl.querySelector('input');
          input.dataset.facetVal = val;
          input.addEventListener('change', () => {
            const v = input.dataset.facetVal;
            const idx = stateArr.indexOf(v);
            if (input.checked && idx === -1) stateArr.push(v);
            else if (!input.checked && idx !== -1) stateArr.splice(idx, 1);
            state.page = 1;
            applyCallback();
          });
          body.appendChild(lbl);
        });
      } else if (def.type === 'chip') {
        const wrap = document.createElement('div');
        wrap.className = 'flex flex-wrap gap-1.5';
        entries.forEach(([val, count]) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'px-2.5 py-1 rounded-md text-xs bg-paper-2 hover:bg-paper-3 font-mono';
          btn.title = `${count} producto${count !== 1 ? 's' : ''}`;
          btn.textContent = val;
          btn.dataset.facetVal = val;
          btn.addEventListener('click', () => {
            const v = btn.dataset.facetVal;
            const idx = stateArr.indexOf(v);
            if (idx === -1) {
              stateArr.push(v);
              btn.classList.remove('bg-paper-2', 'hover:bg-paper-3');
              btn.classList.add('bg-ink', 'text-paper');
            } else {
              stateArr.splice(idx, 1);
              btn.classList.remove('bg-ink', 'text-paper');
              btn.classList.add('bg-paper-2', 'hover:bg-paper-3');
            }
            state.page = 1;
            applyCallback();
          });
          wrap.appendChild(btn);
        });
        body.appendChild(wrap);
      } else if (def.type === 'swatch') {
        const wrap = document.createElement('div');
        wrap.className = 'flex flex-wrap gap-2';
        const palette = def.palette || COLOR_PALETTE;
        entries.forEach(([val, count]) => {
          const sw = document.createElement('button');
          sw.type = 'button';
          sw.className = 'swatch';
          const bg = palette[val] || _resolveSwatch(val) || '#A8A8A8';
          sw.style.background = bg;
          sw.setAttribute('aria-label', val);
          sw.title = `${val} · ${count}`;
          sw.dataset.facetVal = val;
          sw.addEventListener('click', () => {
            const v = sw.dataset.facetVal;
            const idx = stateArr.indexOf(v);
            if (idx === -1) {
              stateArr.push(v);
              sw.classList.add('is-active');
            } else {
              stateArr.splice(idx, 1);
              sw.classList.remove('is-active');
            }
            state.page = 1;
            applyCallback();
          });
          wrap.appendChild(sw);
        });
        body.appendChild(wrap);
      }
    });
    // ---- Bloques especiales: Precio + Disponibilidad ----
    _setupPriceFilter(products, state, applyCallback);
    _setupAvailabilityFilter(products, state, applyCallback);
    _setupClearActiveFilters(state, applyCallback);
  }

  function _updateSidebarCounts(products, state) {
    const sidebar = document.querySelector('main aside, aside');
    if (!sidebar) return;
    const detailsBlocks = [...sidebar.querySelectorAll('details')];
    detailsBlocks.forEach((det) => {
      const def = det._glxDef;
      if (!def) return;
      
      const summary = det.querySelector('summary span');
      if (!summary) return;
      const name = summary.textContent.trim();
      const facetKey = _normTxt(name);
      
      let facetProducts = products.slice();
      if (state.subcategory) facetProducts = facetProducts.filter((p) => _matchesSubcategory(p, state.subcategory));
      if (state.search) facetProducts = facetProducts.filter((p) => _matchesSearchTerm(p, state.search));
      if (state.priceMin != null) facetProducts = facetProducts.filter((p) => Number(p.price || 0) >= state.priceMin);
      if (state.priceMax != null) facetProducts = facetProducts.filter((p) => Number(p.price || 0) <= state.priceMax);
      if (state.onlyInStock) facetProducts = facetProducts.filter((p) => Number(p.stock || 0) > 0);
      
      const otherFilters = { ...state.filters };
      delete otherFilters[facetKey];
      facetProducts = facetProducts.filter((p) => _matchesFacets(p, otherFilters));
      
      const valueCounts = new Map();
      facetProducts.forEach((p) => {
        const vals = (def.extract(p) || []).filter(Boolean);
        vals.forEach((v) => valueCounts.set(v, (valueCounts.get(v) || 0) + 1));
      });
      
      if (def.type === 'checkbox') {
        det.querySelectorAll('label.filter-check').forEach(lbl => {
          const input = lbl.querySelector('input');
          if (!input) return;
          const val = input.dataset.facetVal;
          const count = valueCounts.get(val) || 0;
          const countSpan = lbl.querySelector('.count');
          if (countSpan) countSpan.textContent = count;
          
          const isSelected = state.filters[facetKey]?.includes(val);
          if (count === 0 && !isSelected) {
            lbl.style.display = 'none';
          } else {
            lbl.style.display = 'flex';
            lbl.style.opacity = count === 0 ? '0.5' : '1';
          }
        });
      } else if (def.type === 'chip' || def.type === 'swatch') {
        const selector = def.type === 'chip' ? 'button[data-facet-val]:not(.swatch)' : 'button.swatch';
        det.querySelectorAll(selector).forEach(btn => {
          const val = btn.dataset.facetVal;
          const count = valueCounts.get(val) || 0;
          if (def.type === 'chip') {
            btn.title = `${count} producto${count !== 1 ? 's' : ''}`;
          } else {
            btn.title = `${val} · ${count}`;
          }
          
          const isSelected = state.filters[facetKey]?.includes(val);
          if (count === 0 && !isSelected) {
            btn.style.display = 'none';
          } else {
            btn.style.display = '';
            btn.style.opacity = count === 0 ? '0.5' : '1';
          }
        });
      }
    });
  }

  function _renderActiveFilterPills(state, applyCallback) {
    const block = [...document.querySelectorAll('aside div')].find((d) => /filtros activos/i.test(d.textContent || '') && d.querySelector('.flex.flex-wrap'));
    const holder = block?.querySelector('.flex.flex-wrap');
    if (!holder) return;
    const pills = [];
    if (state.subcategory) pills.push({ label: state.subcategory, onRemove: () => { state.subcategory = null; } });
    if (state.search) pills.push({ label: `“${state.search}”`, onRemove: () => {
      state.search = '';
      const inp = document.querySelector('aside input[type="search"]');
      if (inp) inp.value = '';
    }});
    if (state.onlyInStock) pills.push({ label: 'Solo en stock', onRemove: () => {
      state.onlyInStock = false;
      const cb = document.querySelector('aside [data-only-in-stock]');
      if (cb) cb.checked = false;
    }});
    for (const [facetKey, vals] of Object.entries(state.filters || {})) {
      for (const v of vals || []) {
        pills.push({ label: v, onRemove: () => {
          state.filters[facetKey] = state.filters[facetKey].filter((x) => x !== v);
          // Desmarca el checkbox/chip/swatch correspondiente.
          document.querySelectorAll(`aside [data-facet-val="${CSS.escape(v)}"]`).forEach((el) => {
            if (el.matches('input[type="checkbox"]')) el.checked = false;
            else el.classList.remove('bg-ink', 'text-paper', 'is-active');
          });
        }});
      }
    }
    if (!pills.length) {
      holder.innerHTML = '<span class="text-xs text-graphite/60 italic">Aún no hay filtros aplicados</span>';
      return;
    }
    holder.innerHTML = '';
    pills.forEach(({ label, onRemove }) => {
      const span = document.createElement('span');
      span.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 bg-ink text-paper text-xs rounded-full';
      span.innerHTML = `${escapeHtml(label)}<button type="button" class="hover:text-warn" aria-label="Quitar filtro">×</button>`;
      span.querySelector('button').addEventListener('click', () => {
        onRemove();
        state.page = 1;
        applyCallback();
      });
      holder.appendChild(span);
    });
  }

  function _setupPriceFilter(products, state, applyCallback) {
    const det = [...document.querySelectorAll('aside details')].find((d) => /^precio$/i.test(d.querySelector('summary span')?.textContent.trim() || ''));
    if (!det) return;
    const body = det.querySelector('summary')?.nextElementSibling;
    if (!body) return;
    const prices = products.map((p) => Number(p.price || 0)).filter((p) => p > 0);
    if (!prices.length) { det.style.display = 'none'; return; }
    const min = Math.floor(Math.min(...prices));
    const max = Math.ceil(Math.max(...prices));
    if (max <= min) { det.style.display = 'none'; return; }
    state.priceMin = state.priceMin ?? min;
    state.priceMax = state.priceMax ?? max;
    // Visual del demo: dos inputs numéricos arriba + barra con dos thumbs
    // arrastrables. Los thumbs son botones reales (cursor: grab) y reaccionan
    // a pointerdown/move/up — funcionan tanto con ratón como en táctil.
    body.innerHTML = `
      <div class="flex items-center gap-2 mb-3">
        <input type="number" data-price-from class="w-full px-2.5 py-1.5 bg-paper border border-line rounded-md text-sm font-mono" value="${state.priceMin}" min="${min}" max="${max}"/>
        <span class="text-graphite text-xs">a</span>
        <input type="number" data-price-to class="w-full px-2.5 py-1.5 bg-paper border border-line rounded-md text-sm font-mono" value="${state.priceMax}" min="${min}" max="${max}"/>
        <span class="text-graphite text-sm">€</span>
      </div>
      <div class="relative h-1.5 bg-paper-2 rounded-full select-none" data-price-track style="touch-action: none;">
        <div class="absolute h-full bg-ink rounded-full pointer-events-none" data-price-fill></div>
        <button type="button" aria-label="Precio mínimo"
          class="absolute -top-1.5 w-4 h-4 rounded-full bg-ink border-2 border-paper cursor-grab active:cursor-grabbing touch-none"
          data-price-thumb-left></button>
        <button type="button" aria-label="Precio máximo"
          class="absolute -top-1.5 w-4 h-4 rounded-full bg-ink border-2 border-paper cursor-grab active:cursor-grabbing touch-none"
          data-price-thumb-right></button>
      </div>
      <div class="flex justify-between mt-2 text-[11px] font-mono text-graphite">
        <span>${min}&nbsp;€</span><span>${max}&nbsp;€</span>
      </div>
    `;
    const fromInput = body.querySelector('[data-price-from]');
    const toInput = body.querySelector('[data-price-to]');
    const track = body.querySelector('[data-price-track]');
    const fill = body.querySelector('[data-price-fill]');
    const thumbL = body.querySelector('[data-price-thumb-left]');
    const thumbR = body.querySelector('[data-price-thumb-right]');
    const span = max - min;

    const clamp = (n) => Math.max(min, Math.min(max, n));
    const redrawBar = () => {
      const lo = clamp(Number(state.priceMin ?? min));
      const hi = clamp(Number(state.priceMax ?? max));
      const leftPct = ((Math.min(lo, hi) - min) / span) * 100;
      const rightPct = (1 - (Math.max(lo, hi) - min) / span) * 100;
      fill.style.left = `${leftPct}%`;
      fill.style.right = `${rightPct}%`;
      thumbL.style.left = `calc(${leftPct}% - 8px)`;
      thumbR.style.right = `calc(${rightPct}% - 8px)`;
      // Sincroniza inputs.
      if (document.activeElement !== fromInput) fromInput.value = String(Math.round(lo));
      if (document.activeElement !== toInput) toInput.value = String(Math.round(hi));
    };

    let _pendingApply = null;
    const scheduleApply = () => {
      if (_pendingApply) return;
      _pendingApply = setTimeout(() => {
        _pendingApply = null;
        state.page = 1;
        applyCallback();
      }, 60);
    };

    const onInputChange = () => {
      const a = Number(fromInput.value || min);
      const b = Number(toInput.value || max);
      state.priceMin = clamp(Math.min(a, b));
      state.priceMax = clamp(Math.max(a, b));
      redrawBar();
      state.page = 1;
      applyCallback();
    };
    fromInput.addEventListener('change', onInputChange);
    toInput.addEventListener('change', onInputChange);

    // ---- Thumb dragging ----
    const startDrag = (which, ev) => {
      ev.preventDefault();
      const targetThumb = which === 'left' ? thumbL : thumbR;
      try { targetThumb.setPointerCapture(ev.pointerId); } catch {}
      const move = (e) => {
        const rect = track.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const value = Math.round(min + ratio * span);
        if (which === 'left') {
          state.priceMin = clamp(Math.min(value, state.priceMax ?? max));
        } else {
          state.priceMax = clamp(Math.max(value, state.priceMin ?? min));
        }
        redrawBar();
        scheduleApply();
      };
      const up = (e) => {
        try { targetThumb.releasePointerCapture(ev.pointerId); } catch {}
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', up);
        // Asegura un último apply (por si el throttle dejó algo pendiente).
        state.page = 1;
        applyCallback();
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', up);
    };
    thumbL.addEventListener('pointerdown', (ev) => startDrag('left', ev));
    thumbR.addEventListener('pointerdown', (ev) => startDrag('right', ev));

    // Click directo en la pista: mueve el thumb más cercano.
    track.addEventListener('pointerdown', (ev) => {
      if (ev.target === thumbL || ev.target === thumbR) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const value = Math.round(min + ratio * span);
      const dLeft = Math.abs(value - (state.priceMin ?? min));
      const dRight = Math.abs(value - (state.priceMax ?? max));
      const which = dLeft <= dRight ? 'left' : 'right';
      if (which === 'left') state.priceMin = clamp(Math.min(value, state.priceMax ?? max));
      else state.priceMax = clamp(Math.max(value, state.priceMin ?? min));
      redrawBar();
      state.page = 1;
      applyCallback();
      // Inicia drag para que arrastrar inmediatamente desde el track funcione.
      startDrag(which, ev);
    });

    redrawBar();
  }

  function _setupAvailabilityFilter(products, state, applyCallback) {
    const det = [...document.querySelectorAll('aside details')].find((d) => /^disponibilidad$/i.test(d.querySelector('summary span')?.textContent.trim() || ''));
    if (!det) return;
    const body = det.querySelector('summary')?.nextElementSibling;
    if (!body) return;
    const inStock = products.filter((p) => Number(p.stock || 0) > 0).length;
    state.onlyInStock = false;
    body.innerHTML = `
      <label class="filter-check">
        <input type="checkbox" data-only-in-stock/> Solo en stock
        <span class="count">${inStock}</span>
      </label>
    `;
    body.querySelector('[data-only-in-stock]').addEventListener('change', (e) => {
      state.onlyInStock = e.target.checked;
      state.page = 1;
      applyCallback();
    });
  }

  // Botón "Limpiar todos" del bloque de filtros activos: borra todo el state
  // y vuelve a renderizar el sidebar.
  function _setupClearActiveFilters(state, applyCallback) {
    const buttons = [...document.querySelectorAll('aside button')]
      .filter((b) => /limpiar todos/i.test(b.textContent || ''));
    buttons.forEach((b) => {
      b.addEventListener('click', (e) => {
        e.preventDefault();
        state.filters = {};
        state.subcategory = null;
        state.search = '';
        state.priceMin = undefined;
        state.priceMax = undefined;
        state.onlyInStock = false;
        // Reset de la UI: input de búsqueda y checkbox/chips activos.
        const sidebarSearch = document.querySelector('aside input[type="search"]');
        if (sidebarSearch) sidebarSearch.value = '';
        document.querySelectorAll('aside input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
        document.querySelectorAll('aside [data-facet-val].bg-ink, aside [data-facet-val].is-active').forEach((el) => {
          el.classList.remove('bg-ink', 'text-paper', 'is-active');
          if (!el.classList.contains('swatch')) el.classList.add('bg-paper-2', 'hover:bg-paper-3');
        });
        state.page = 1;
        applyCallback();
      });
    });
  }

  function _dedupeVariants(products) {
    const groupedKeep = new Set();
    const grouped = new Map(); // gid → product to keep
    for (const p of products) {
      const gid = p?.specs?._variant_group;
      if (!gid) continue;
      const isDefault = p?.specs?._variant_is_default === '1' || p?.sku === p?.specs?._variant_default;
      const current = grouped.get(gid);
      // Preferimos el flag is_default explícito; en su defecto, el de menor precio.
      if (!current || isDefault || (p.price || 0) < (current.price || 0)) {
        grouped.set(gid, p);
      }
    }
    grouped.forEach((p) => groupedKeep.add(p.sku));
    return products.filter((p) => {
      const gid = p?.specs?._variant_group;
      if (!gid) return true;
      return groupedKeep.has(p.sku);
    });
  }

  function _matchesFacets(product, filters) {
    for (const [facetKey, selected] of Object.entries(filters || {})) {
      if (!selected || !selected.length) continue;
      const def = _FACET_DEFS_NORM[facetKey];
      if (!def) continue;
      const vals = (def.extract(product) || []).filter(Boolean);
      const hit = selected.some((v) => vals.includes(v));
      if (!hit) return false;
    }
    return true;
  }

  function _pageNumbersFor(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
    if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
    return [1, '…', current - 1, current, current + 1, '…', total];
  }

  // Coincidencia de subcategoría cuando un chip está seleccionado. Usa los
  // mismos patrones canónicos que _deriveSubcategories: si encontramos una
  // entrada con `label` exacto, aplicamos su regex. Si no (por ejemplo el
  // label vino de la spec sin pasar por nuestros patrones), buscamos como
  // contiene-en-name del label.
  function _matchesSubcategory(product, label) {
    if (!label) return true;
    const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const haystack = `${product.name || ''} ${(product.specs && (product.specs['Tipo de producto'] || product.specs['Gama'] || product.specs['Subcategoría'] || '')) || ''}`;
    const haystackNorm = norm(haystack);
    // Si el label coincide exactamente con uno de los nuestros, busca su regex.
    for (const patterns of Object.values(_SUBCAT_PATTERNS)) {
      const pat = patterns.find((x) => x.label === label);
      if (pat) return pat.re.test(haystackNorm);
    }
    // Fallback: contiene la primera palabra del label (sin acentos).
    const term = norm(label).split(/[\s·]+/)[0];
    return haystackNorm.includes(term);
  }

  function _readSortMode(value) {
    const v = (value || '').toLowerCase();
    if (/menor.*mayor/.test(v)) return 'price-asc';
    if (/mayor.*menor/.test(v)) return 'price-desc';
    if (/novedades/.test(v)) return 'novedades';
    if (/precio.*asc/.test(v)) return 'price-asc';
    if (/precio.*desc/.test(v)) return 'price-desc';
    if (/lumenes|lúmenes/.test(v)) return 'lumens';
    return 'best';
  }

  function _applySort(items, mode) {
    const arr = items.slice();
    if (mode === 'price-asc') arr.sort((a, b) => (a.price || 0) - (b.price || 0));
    else if (mode === 'price-desc') arr.sort((a, b) => (b.price || 0) - (a.price || 0));
    else if (mode === 'novedades') arr.sort((a, b) => (b.id || 0) - (a.id || 0));
    else if (mode === 'lumens') {
      arr.sort((a, b) => {
        const la = parseFloat((a.specs && (a.specs['Lúmenes'] || a.specs['Intensidad luminosa (en lumen)'])) || 0) || 0;
        const lb = parseFloat((b.specs && (b.specs['Lúmenes'] || b.specs['Intensidad luminosa (en lumen)'])) || 0) || 0;
        const ra = la / Math.max(0.5, a.price || 1);
        const rb = lb / Math.max(0.5, b.price || 1);
        return rb - ra;
      });
    } else {
      // best (mas vendidos): aproximamos con stock alto + precio bajo
      arr.sort((a, b) => (b.stock || 0) - (a.stock || 0));
    }
    return arr;
  }

  // ---- Subcategorías por categoría -----------------------------------------
  // Cada categoría tiene una forma propia de exponer la subcategoría: unas
  // tienen `specs.Subcategoría`, otras `Tipo de producto`, otras nada y hay
  // que adivinarlo a partir del nombre. Definimos un conjunto de patrones
  // canónicos por categoría con (label, regex sobre name+specs). El primer
  // patrón que encaje gana; un producto cae como mucho en una subcategoría.
  const _SUBCAT_PATTERNS = {
    iluminacion: [
      { label: 'Bombillas', re: /\bbombilla\b/i },
      { label: 'Plafones', re: /\bplaf[oó]n(es)?\b/i },
      { label: 'Downlights', re: /\bdownlight\b|\bempotrar\b/i },
      { label: 'Paneles LED', re: /\bpanel(es)?\s+led\b/i },
      { label: 'Tiras LED', re: /\btira\s+led\b|\btira\s+de\s+led\b|\bbanda\s+led\b/i },
      { label: 'Proyectores', re: /\bproyector(es)?\b|\bfoco(s)?\b/i },
      { label: 'Apliques', re: /\baplique(s)?\b/i },
      { label: 'Luminaria exterior', re: /\bbaliza\b|\bfarol(a)?\b|\bcolumna\b/i },
      { label: 'Iluminación inteligente', re: /\bzigbee|wifi|matter|alexa|google home\b/i },
    ],
    mecanismos: [
      { label: 'Enchufes', re: /\benchufe(s)?\b|\bschuko\b|\btoma\s+(de\s+)?alimentaci[oó]n\b/i },
      { label: 'Interruptores', re: /\binterruptor(es)?\b|\bpulsador(es)?\b/i },
      { label: 'Conmutadores', re: /\bconmutador(es)?\b/i },
      { label: 'Bases USB', re: /\busb\s+a\b|\busb\s+c\b|\busb-c\b/i },
      { label: 'Marcos / acabados', re: /\bmarco(s)?\b/i },
      { label: 'Tomas TV / RJ', re: /\bRJ\d{1,2}\b|\bcoaxial\b|\bantena\s+TV\b/i },
    ],
    proteccion: [
      { label: 'Diferenciales', re: /\bdiferencial(es)?\b/i },
      { label: 'Magnetotérmicos', re: /\bmagnetot[eé]rmico|\binterruptor automatico\b|\bicp\b/i },
      { label: 'Disyuntores', re: /\bdisyuntor(es)?\b/i },
      { label: 'Pararrayos', re: /\bpara\s*rayo|sobretensi[oó]n/i },
      { label: 'Cuadros / cajas', re: /\bcuadro\b|\bcaja\s+(de\s+)?(ICP|abonado|registro)/i },
      { label: 'Bases portafusibles', re: /\bportafusible|\bfusible\b/i },
      { label: 'Contactores', re: /\bcontactor(es)?\b/i },
    ],
    'porteros-videoporteros': [
      // Orden importante: Telefonillos sueltos PRIMERO para no dejarlos
      // dentro de "Kits de Audio", que también incluye placa+telefonillo.
      { label: 'Telefonillos / monitores', re: /\btelefonillos?\b|\bmonitor(es)?\b/i },
      { label: 'Kits de Vídeo', re: /\bkit\b.{0,40}\bv[ií]deo\b|videoportero|videointercom/i },
      { label: 'Kits de Audio', re: /\bkit\b.{0,40}\baudio\b|portero\s+autom[aá]tico/i },
      { label: 'Placas de calle', re: /\bplaca\s+(de\s+)?calle|\bplaca\s+exterior\b/i },
      { label: 'Repuestos', re: /\brepuesto(s)?\b/i },
    ],
    domotica: [
      { label: 'Bombillas inteligentes', re: /\bbombilla\b/i },
      { label: 'Enchufes WiFi', re: /\benchufe\b.*\b(wifi|inteligente|conectado|smart|zigbee)\b|\bsmart\s+plug/i },
      { label: 'Interruptores domóticos', re: /\binterruptor\b.*\b(wifi|inteligente|domotic|zigbee|conectado)\b|\bm[oó]dulo\s+(rel[eé]|interruptor)/i },
      { label: 'Sensores y detectores', re: /\bsensor(es)?\b|\bdetector(es)?\b/i },
      { label: 'Cámaras WiFi', re: /\bc[aá]mara\b/i },
      { label: 'Mandos a distancia', re: /\bmando\b/i },
      { label: 'Tiras / lámparas RGB', re: /\btira\s+led\b|\brgb\b|\bcct\b/i },
    ],
    automatismos: [
      { label: 'Puerta corredera', re: /\bcorredera\b/i },
      { label: 'Puerta batiente', re: /\bbatient(e|es)\b/i },
      { label: 'Puerta seccional', re: /\bseccional(es)?\b/i },
      { label: 'Puerta basculante', re: /\bbasculant(e|es)\b/i },
      { label: 'Puerta enrollable', re: /\benrrollabl|\benrollabl/i },
      { label: 'Mandos y emisores', re: /\bmando(s)?\b|\bemisor(es)?\b/i },
      { label: 'Receptores', re: /\breceptor(es)?\b/i },
      { label: 'Fotocélulas', re: /\bfotoc[eé]lula\b/i },
      { label: 'Barreras de parking', re: /\bbarrera\b/i },
      { label: 'Accesorios', re: /\baccesorio|\bcremallera|\bbater[ií]a\b/i },
    ],
    'antenas-telecomunicaciones': [
      { label: 'Antenas TDT/UHF', re: /\bantena(s)?\b|\btdt\b|\buhf\b/i },
      { label: 'Routers / WiFi', re: /\brouter\b|\bwifi\b|\bmesh\b/i },
      { label: 'PLC / repetidores', re: /\bplc\b|\brepetidor(es)?\b|powerline/i },
      { label: 'Cable coaxial', re: /\bcoaxial\b/i },
      { label: 'Cable de red', re: /\brj-?45\b|\bcat\.?\s?[5-7]\b|\blatiguillo\b|\bethernet\b/i },
      { label: 'Switches / hubs', re: /\bswitch\b|\bhub\b/i },
      { label: 'Telefonía', re: /\btel[eé]fono(s)?\b|\bvoip\b/i },
    ],
    seguridad: [
      { label: 'Cámaras IP', re: /\bc[aá]mara\b.*\bip\b|\bvideovigilancia\b|\bcctv\b/i },
      { label: 'Detectores de humo', re: /\bdetector\s+de\s+humo\b/i },
      { label: 'Detectores de gas', re: /\bdetector\s+de\s+(gas|mon[oó]xido|co)\b|\bco\b/i },
      { label: 'Sensores de presencia', re: /\bsensor.*(presencia|movimiento|puerta|ventana)\b|\bpir\b/i },
      { label: 'Alarmas', re: /\balarma\b|\bsirena\b/i },
      { label: 'Cerraduras inteligentes', re: /\bcerradura(s)?\b/i },
    ],
    cableado: [
      { label: 'Cable libre halógenos H07V-K', re: /\bh07v-?k\b|\bh07\b/i },
      { label: 'Cable RZ1-K (manguera)', re: /\brz1-?k\b/i },
      { label: 'Cables coaxiales', re: /\bcoaxial\b/i },
      { label: 'Cable de red', re: /\bcat[\s.]?\s?[5-7]e?\b|\brj-?45\b/i },
      { label: 'Tubo / canalización', re: /\btubo\b|\bcorrugado\b|\bcanaleta\b/i },
      { label: 'Bobinas de hilo', re: /\bbobina\b|\brollo\b/i },
    ],
  };

  function _deriveSubcategories(products, categorySlug) {
    if (!categorySlug) return [];
    const patterns = _SUBCAT_PATTERNS[categorySlug];
    const counts = new Map();

    if (patterns) {
      for (const p of products) {
        const subFromSpec = p?.specs?.['Subcategoría'] || p?.specs?.['Subcategoria'];
        let label = null;
        // 1) Si la spec viene rellena, intentamos mapearla a uno de nuestros
        // labels canónicos (a veces la fuente la pone como "Kits de Vídeo",
        // a veces "Puerta Corredera", etc.).
        if (subFromSpec) {
          const norm = String(subFromSpec).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
          for (const pat of patterns) {
            if (pat.re.test(norm)) { label = pat.label; break; }
          }
          if (!label) label = String(subFromSpec).trim();
        } else {
          // 2) Buscamos en name + tipo de producto + gama
          const haystack = `${p.name || ''} ${(p.specs && (p.specs['Tipo de producto'] || p.specs['Gama'] || '')) || ''}`;
          for (const pat of patterns) {
            if (pat.re.test(haystack)) { label = pat.label; break; }
          }
        }
        if (label) counts.set(label, (counts.get(label) || 0) + 1);
      }
    } else {
      // Fallback por si añaden una categoría nueva sin patrones: agrupa por
      // Subcategoría tal cual y, en su defecto, por Tipo de producto.
      for (const p of products) {
        const v = p?.specs?.['Subcategoría'] || p?.specs?.['Tipo de producto'];
        if (!v) continue;
        const lbl = String(v).trim();
        counts.set(lbl, (counts.get(lbl) || 0) + 1);
      }
    }

    // Ordena por nº de productos descendente, oculta los con <2 (poco útil
    // para particionar) excepto en categorías muy pequeñas (<20 productos).
    const minCount = products.length < 20 ? 1 : 2;
    return [...counts.entries()]
      .filter(([, n]) => n >= minCount)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count }));
  }

  // Exponemos los helpers de catálogo para que páginas como categorias.html
  // los puedan reutilizar sin duplicar el diccionario _SUBCAT_PATTERNS.
  window.GarperLuxCatalog = {
    deriveSubcategories: _deriveSubcategories,
    matchesSubcategory: _matchesSubcategory,
  };

  // Coincidencia "estilo SKU/nombre/sinónimo" para el cuadro de búsqueda del
  // sidebar de cada categoría. Tokeniza la query, normaliza, expande
  // sinónimos (rosca gorda -> casquillo e27, etc. via GarperLuxSearch) y
  // exige cobertura mínima de tokens en alguno de los campos del producto.
  function _matchesSearchTerm(product, term) {
    if (!term) return true;
    const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const specsText = product.specs && typeof product.specs === 'object'
      ? Object.entries(product.specs)
          .filter(([k]) => !k.startsWith('_'))
          .map(([k, v]) => `${k} ${v}`).join(' ')
      : '';
    const haystack = [
      product.name,
      product.sku,
      product.brand?.name,
      product.category?.name,
      specsText,
      product.description,
    ].filter(Boolean).map(norm).join(' ');

    // Si está cargado el motor unificado, usamos su expansión de sinónimos
    // para que "rosca gorda" enganche con "casquillo e27".
    let expanded = term;
    if (window.GarperLuxSearch?.expandSynonyms) {
      try { expanded = window.GarperLuxSearch.expandSynonyms(norm(term)); } catch { expanded = term; }
    }
    const rawTokens = norm(expanded).split(/[\s\-_./]+/).filter((t) => t.length >= 2);
    const STOP = new Set(['de','la','el','los','las','con','para','por','y','o','un','una','del','al']);
    const tokens = rawTokens.filter((t) => !STOP.has(t));
    if (!tokens.length) return true;
    // Cobertura: TODOS los tokens deben aparecer.
    return tokens.every((tok) => haystack.includes(tok));
  }

  async function bindCatalogPages() {
    const cfg = CATEGORY_PAGE_MAP[page];
    if (!cfg) return;
    const query = cfg.category ? { category: cfg.category } : {};
    let products = [];
    try { products = await api.products(query); } catch { return; }
    if (!products || !products.length) return;
    // Dedupe por grupo de variantes: si dos productos comparten _variant_group,
    // dejamos solo el variant_default (el más barato del grupo). Las hermanas
    // siguen accesibles vía el selector del detalle (specs._variants).
    // products = _dedupeVariants(products); // Desactivado para mostrar todas las variantes en la parrilla

    // Indica a catalog-ui.js que somos los dueños del filtrado dinámico.
    window._GLX_DYNAMIC_CATALOG = true;

    // ---- Localizar elementos relevantes en la página
    const grids = [...document.querySelectorAll('.card-prod')].map((c) => c.parentElement).filter(Boolean);
    const grid = grids.find((g) => g.querySelectorAll('.card-prod').length >= 2);
    if (!grid) return;

    // Subcategory chip container (busca el div más profundo que contenga
    // el chip "Todos · N"). Las páginas no usan <header>/<main> consistentes,
    // así que vamos por todo el body. Elegimos el de menor número de hijos
    // para no acertar el contenedor padre del bloque entero.
    let subcategoryChips = null;
    {
      const candidates = [...document.querySelectorAll('.flex.flex-wrap')]
        .filter((c) => {
          const chips = [...c.querySelectorAll('a, button')];
          return chips.length >= 3 && chips.some((x) => /todos\s*·/i.test(x.textContent));
        });
      // De los candidatos elegimos el más “interno” (el que tiene menos
      // descendientes), que es el que contiene SOLO los chips.
      candidates.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
      subcategoryChips = candidates[0] || null;
    }

    // "Mostrando X–Y de Z resultados"
    const showingNode = [...document.querySelectorAll('.font-mono')].find((n) => /mostrando/i.test(n.textContent));

    // Sort select (el que está cerca de "Ordenar:")
    const sortSelect = [...document.querySelectorAll('select')].find((s) => /precio|vendidos|novedades|l[úu]menes/i.test(s.textContent || ''));

    // Pagination block (contains "Página X de N")
    const paginationText = [...document.querySelectorAll('div')].find((d) => /^\s*Página\s+\d+\s+de\s+\d+\s*$/.test((d.textContent || '').trim()));
    const paginationContainer = paginationText?.parentElement || null;
    const pageButtonRow = paginationContainer?.querySelector('.flex.items-center.gap-1') || null;

    // Page size select ("12 por página")
    const pageSizeSelect = [...document.querySelectorAll('select')].find((s) => /por p[áa]gina/i.test(s.textContent || ''));

    // ---- Estado
    const state = {
      subcategory: null,
      filters: {},
      sort: 'best',
      page: 1,
      pageSize: 12,
      search: '',
    };

    // Caja "Buscar por referencia / SKU" del sidebar: filtrado en vivo dentro
    // de la categoría, en lugar de redirigir al buscador global.
    const sidebarSearch = (() => {
      const aside = document.querySelector('aside');
      if (!aside) return null;
      return aside.querySelector('input[type="search"]') || null;
    })();
    if (sidebarSearch) {
      // Si la página la heredó del demo, su placeholder pinta un SKU concreto
      // de iluminación; lo dejamos como está si encaja, si no, lo neutralizamos.
      sidebarSearch.removeAttribute('form');
      sidebarSearch.setAttribute('autocomplete', 'off');
      let _t;
      sidebarSearch.addEventListener('input', () => {
        clearTimeout(_t);
        _t = setTimeout(() => {
          state.search = sidebarSearch.value.trim();
          state.page = 1;
          applyAndRender();
        }, 120);
      });
      sidebarSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          // Evita que el form padre (si lo hay) navegue a /buscador.
          e.preventDefault();
          state.search = sidebarSearch.value.trim();
          state.page = 1;
          applyAndRender();
        }
        if (e.key === 'Escape') {
          sidebarSearch.value = '';
          state.search = '';
          state.page = 1;
          applyAndRender();
        }
      });
    }

    // Construye sidebar dinámico (reemplaza contenido hardcoded)
    _setupSidebarFacets(products, state, () => applyAndRender());
    if (sortSelect) state.sort = _readSortMode(sortSelect.options[sortSelect.selectedIndex]?.text);
    if (pageSizeSelect) {
      const m = pageSizeSelect.value.match(/(\d+)/);
      if (m) state.pageSize = parseInt(m[1], 10);
    }

    function applyAndRender() {
      // 1. filter por subcategory + filtros sidebar + búsqueda libre + precio + stock
      let filtered = products.slice();
      if (state.subcategory) filtered = filtered.filter((p) => _matchesSubcategory(p, state.subcategory));
      filtered = filtered.filter((p) => _matchesFacets(p, state.filters));
      if (state.search) filtered = filtered.filter((p) => _matchesSearchTerm(p, state.search));
      if (state.priceMin != null) filtered = filtered.filter((p) => Number(p.price || 0) >= state.priceMin);
      if (state.priceMax != null) filtered = filtered.filter((p) => Number(p.price || 0) <= state.priceMax);
      if (state.onlyInStock) filtered = filtered.filter((p) => Number(p.stock || 0) > 0);
      // 2. sort
      filtered = _applySort(filtered, state.sort);
      // 3. paginate
      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
      if (state.page > totalPages) state.page = totalPages;
      const start = (state.page - 1) * state.pageSize;
      const pageItems = filtered.slice(start, start + state.pageSize);

      // 4. render
      grid.innerHTML = pageItems.map(renderProductCard).join('');

      // 5. counter
      if (showingNode) {
        const from = total === 0 ? 0 : start + 1;
        const to = Math.min(start + state.pageSize, total);
        showingNode.innerHTML = `Mostrando <span class="text-ink font-medium">${from}–${to}</span> de <span class="text-ink font-medium">${total}</span> resultados`;
      }

      // 6. pagination
      if (paginationText) paginationText.innerHTML = `Página <span class="text-ink font-medium">${state.page}</span> de ${totalPages}`;
      if (pageButtonRow) {
        pageButtonRow.innerHTML = '';
        const mkBtn = (label, opts = {}) => {
          const b = document.createElement('button');
          b.className = opts.className || 'w-10 h-10 rounded-lg hover:bg-paper-2 font-mono text-sm';
          if (opts.disabled) b.disabled = true;
          if (typeof label === 'string') b.innerHTML = label; else b.textContent = label;
          if (opts.onClick) b.addEventListener('click', opts.onClick);
          return b;
        };
        const prevDisabled = state.page <= 1;
        pageButtonRow.appendChild(mkBtn(
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>',
          {
            className: `w-10 h-10 rounded-lg border border-line grid place-items-center ${prevDisabled ? 'text-graphite opacity-50' : 'hover:bg-paper-2'}`,
            disabled: prevDisabled,
            onClick: () => { state.page = Math.max(1, state.page - 1); applyAndRender(); window.scrollTo({ top: grid.getBoundingClientRect().top + window.scrollY - 100, behavior: 'smooth' }); },
          }
        ));
        const numbers = _pageNumbersFor(state.page, totalPages);
        numbers.forEach((p) => {
          if (p === '…') {
            const span = document.createElement('span');
            span.className = 'px-2 text-graphite';
            span.textContent = '…';
            pageButtonRow.appendChild(span);
          } else {
            const isActive = p === state.page;
            pageButtonRow.appendChild(mkBtn(String(p), {
              className: `w-10 h-10 rounded-lg font-mono text-sm ${isActive ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`,
              onClick: () => { state.page = p; applyAndRender(); window.scrollTo({ top: grid.getBoundingClientRect().top + window.scrollY - 100, behavior: 'smooth' }); },
            }));
          }
        });
        const nextDisabled = state.page >= totalPages;
        pageButtonRow.appendChild(mkBtn(
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>',
          {
            className: `w-10 h-10 rounded-lg border border-line grid place-items-center ${nextDisabled ? 'text-graphite opacity-50' : 'hover:bg-paper-2'}`,
            disabled: nextDisabled,
            onClick: () => { state.page = Math.min(totalPages, state.page + 1); applyAndRender(); window.scrollTo({ top: grid.getBoundingClientRect().top + window.scrollY - 100, behavior: 'smooth' }); },
          }
        ));
      }

      // 7. Render del bloque "Filtros activos": pills clicables que retiran
      // un filtro al pulsarlas. Lo localizamos como el div que contiene el
      // texto "Filtros activos" en el sidebar.
      _renderActiveFilterPills(state, applyAndRender);
      
      // 8. Update sidebar dynamic counts
      _updateSidebarCounts(products, state);

      // 9. notify catalog-ui (que reaplique filtros sidebar sobre las nuevas cards)
      document.dispatchEvent(new CustomEvent('glxCatalogRendered', { detail: { products: pageItems } }));
    }

    // ---- Subcategory chips: SE RECONSTRUYEN desde los productos reales ----
    // El HTML viene con chips hardcoded del demo (que muchas veces no se
    // corresponden con los productos del catálogo). Aquí los reemplazamos
    // por los subgrupos reales detectados en los specs y nombres.
    if (subcategoryChips) {
      const realSubcats = _deriveSubcategories(products, cfg.category);
      subcategoryChips.innerHTML = '';
      const mkChip = (label, count, isAll = false) => {
        const a = document.createElement('a');
        a.href = '#';
        const baseClass = 'px-3 py-1.5 rounded-full text-xs font-medium';
        a.className = isAll ? `${baseClass} bg-ink text-paper` : `${baseClass} bg-paper-2 hover:bg-paper-3`;
        a.textContent = isAll ? `Todos · ${count}` : `${label} · ${count}`;
        a.dataset.subcatLabel = isAll ? '' : label;
        return a;
      };
      const allChip = mkChip('Todos', products.length, true);
      subcategoryChips.appendChild(allChip);
      const chipNodes = [allChip];
      for (const { label, count } of realSubcats) {
        const node = mkChip(label, count);
        subcategoryChips.appendChild(node);
        chipNodes.push(node);
      }
      // Click handlers
      const activate = (chip) => {
        const subcatLabel = chip.dataset.subcatLabel || null;
        state.subcategory = subcatLabel;
        state.page = 1;
        chipNodes.forEach((c) => {
          c.classList.remove('bg-ink', 'text-paper');
          c.classList.add('bg-paper-2', 'hover:bg-paper-3');
        });
        chip.classList.remove('bg-paper-2', 'hover:bg-paper-3');
        chip.classList.add('bg-ink', 'text-paper');
      };
      chipNodes.forEach((chip) => {
        chip.addEventListener('click', (e) => {
          e.preventDefault();
          activate(chip);
          applyAndRender();
        });
      });
      // ?subcat=<label> en la URL (lo usa categorias.html como deeplink):
      // si encaja con uno de los chips, lo activamos al cargar.
      const initialSubcat = new URLSearchParams(location.search).get('subcat');
      if (initialSubcat) {
        const target = chipNodes.find((c) => c.dataset.subcatLabel === initialSubcat);
        if (target) activate(target);
      }
    }

    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        state.sort = _readSortMode(sortSelect.options[sortSelect.selectedIndex]?.text);
        state.page = 1;
        applyAndRender();
      });
    }

    if (pageSizeSelect) {
      pageSizeSelect.addEventListener('change', () => {
        const m = pageSizeSelect.value.match(/(\d+)/);
        if (m) state.pageSize = parseInt(m[1], 10);
        state.page = 1;
        applyAndRender();
      });
    }

    applyAndRender();
  }

  const SHIPPING_COST = 4.9;

  // Los precios del catálogo ya vienen IVA INCLUIDO (PVP final). Por eso
  // el "IVA incluido (21%)" del resumen es SOLO informativo: la porción
  // del total que es IVA, no un cargo adicional. Total = subtotal + envío
  // (ambos con IVA dentro). Antes lo sumábamos dos veces y daba un total
  // distinto al de la página de presupuesto/checkout.
  const updateCartTotals = (items) => {
    const subtotal = items.reduce((s, i) => s + ((Number(i.price) || 0) * (Number(i.quantity) || 0)), 0);
    const total = subtotal + SHIPPING_COST;
    const tax = +(total - total / 1.21).toFixed(2);
    document.querySelectorAll('[data-cart-subtotal]').forEach((el) => { el.textContent = money(subtotal); });
    document.querySelectorAll('[data-cart-tax]').forEach((el) => { el.textContent = money(tax); });
    document.querySelectorAll('[data-cart-total]').forEach((el) => { el.textContent = money(total); });
  };

  async function bindCartPage() {
    if (page !== '/pages/tienda/carrito.html') return;
    const cartContainer = document.querySelector('[data-cart-items]');
    if (!cartContainer) return;
    if (!window.GarperLuxCart) {
      // Si por alguna razón el módulo aún no se ha cargado.
      await new Promise((r) => setTimeout(r, 200));
      if (!window.GarperLuxCart) return;
    }

    // -------- Camino UNIFICADO: invitado o logueado, todo igual ----------
    // localStorage es la verdad. El módulo GarperLuxCart hace sync best-
    // effort al servidor cuando hay sesión iniciada (no bloqueante).
    const cart = window.GarperLuxCart;
    let products = [];
    try { products = await api.products({}); } catch { products = []; }
    const productBySku = new Map(products.map((p) => [p.sku, p]));

    function render() {
      const items = cart.getItems();
      // Hidrata cada item con datos del catálogo.
      const rich = items.map((it) => {
        const p = productBySku.get(it.sku);
        return {
          ...it,
          name: it.title || p?.name || it.sku,
          price: it.price || p?.price || 0,
          image: it.image || p?.image || null,
          brand: (typeof it.brand === 'string' ? it.brand : (it.brand?.name || null)) || p?.brand?.name || '—',
          stock: p?.stock ?? null,
        };
      });

      if (!rich.length) {
        cartContainer.innerHTML = `
          <div class="bg-white border border-line rounded-2xl p-12 text-center">
            <svg class="mx-auto mb-3 text-graphite/60" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            <h2 class="font-serif text-2xl font-medium mb-1">Tu cesta esta vacia</h2>
            <p class="text-graphite text-sm mb-6">Cuando anadas productos los veras aqui.</p>
            <a href="/pages/tienda/tienda.html" class="btn btn-primary">Explorar la tienda</a>
          </div>`;
      } else {
        cartContainer.innerHTML = rich.map((item) => `
          <div class="p-5 sm:p-6 grid grid-cols-[80px_1fr] sm:grid-cols-[100px_1fr_auto] gap-5 border-b border-line last:border-0" data-sku="${item.sku}">
            <div class="aspect-square bg-paper-2 rounded-lg grid place-items-center text-graphite/40 overflow-hidden">
              ${item.image ? `<img src="${item.image}" alt="${item.name}" class="w-full h-full object-contain p-2" loading="lazy"/>` : '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>'}
            </div>
            <div class="col-span-1 sm:col-auto">
              <div class="text-[11px] font-mono text-graphite uppercase tracking-wider mb-1">${item.brand}</div>
              <h3 class="font-medium leading-snug mb-1"><a href="/pages/tienda/producto.html?sku=${encodeURIComponent(item.sku)}" class="hover:underline">${item.name}</a></h3>
              <div class="font-mono text-[11px] text-graphite mb-2">SKU ${item.sku}</div>
              <div class="flex items-center gap-3 flex-wrap">
                <div class="flex items-center bg-paper-2 rounded-full overflow-hidden">
                  <button type="button" class="w-8 h-8 grid place-items-center hover:bg-paper-3 text-sm" data-cart-minus="${item.sku}" aria-label="-">-</button>
                  <input type="number" value="${item.quantity}" class="w-10 text-center bg-transparent font-mono text-sm font-medium outline-none" data-cart-qty-input="${item.sku}" min="1"${item.stock != null ? ` max="${item.stock}"` : ''} data-stock="${item.stock != null ? item.stock : ''}"/>
                  <button type="button" class="w-8 h-8 grid place-items-center hover:bg-paper-3 text-sm${item.stock != null && item.quantity >= item.stock ? ' opacity-30 cursor-not-allowed' : ''}" data-cart-plus="${item.sku}" aria-label="+"${item.stock != null && item.quantity >= item.stock ? ' disabled' : ''}>+</button>
                </div>
                <button type="button" class="text-xs text-graphite hover:text-warn" data-cart-delete="${item.sku}">Eliminar</button>
              </div>
            </div>
            <div class="col-span-2 sm:col-auto sm:text-right flex items-center justify-between sm:flex-col sm:items-end sm:justify-start gap-2">
              <span class="font-serif text-xl font-medium">${money((item.price || 0) * (item.quantity || 0))}</span>
              ${item.stock != null ? `<span class="pill pill-stock text-[10px]">${item.stock} uds</span>` : ''}
            </div>
          </div>`).join('');
      }
      addCartBadge(cart.getCount());
      const totalUnits = rich.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
      const productCount = rich.length;
      document.querySelectorAll('[data-cart-summary]').forEach((el) => {
        if (productCount === 0) {
          el.textContent = 'Tu cesta está vacía';
        } else {
          const refLabel = productCount === 1 ? '1 referencia' : `${productCount} referencias`;
          const unitLabel = totalUnits === 1 ? '1 unidad' : `${totalUnits} unidades`;
          el.textContent = `${refLabel} · ${unitLabel} · listo para tramitar`;
        }
      });
      document.querySelectorAll('[data-cart-item-count]').forEach((el) => {
        if (productCount === 0) {
          el.textContent = 'Subtotal';
        } else {
          el.textContent = `Subtotal (${productCount} ref. · ${totalUnits} uds)`;
        }
      });
      // Con la cesta vacía no se puede tramitar el pedido: desactivamos el botón.
      document.querySelectorAll('[data-cart-checkout]').forEach((el) => {
        const empty = productCount === 0;
        el.classList.toggle('opacity-40', empty);
        el.classList.toggle('pointer-events-none', empty);
        el.classList.toggle('cursor-not-allowed', empty);
        el.setAttribute('aria-disabled', empty ? 'true' : 'false');
        if (empty) el.setAttribute('tabindex', '-1'); else el.removeAttribute('tabindex');
      });
      updateCartTotals(rich.map((it) => ({ price: it.price, quantity: it.quantity })));
    }

    render();
    // Cualquier cambio (drawer, +/-, eliminar) refresca la pagina del
    // carrito sin recargar.
    window.addEventListener('garperlux:cart-changed', render);

    // Banner: si NO hay sesion, promovemos el login pero NUNCA bloqueamos
    // la pagina. La compra como invitado es 100% valida.
    if (!api.getToken()) {
      const banner = document.createElement('div');
      banner.className = 'mb-5 rounded-xl border border-copper/30 bg-paper-2 px-5 py-4 flex items-center justify-between flex-wrap gap-3';
      banner.innerHTML = `
        <div class="text-sm">
          <strong class="text-ink">Estas como invitado.</strong>
          <span class="text-graphite"> Puedes terminar la compra sin registrarte. Si entras con tu cuenta, guardamos tu cesta y tus pedidos.</span>
        </div>
        <a href="/pages/auth/login.html?redirect=carrito.html" class="btn btn-sm btn-ghost">Iniciar sesion</a>`;
      cartContainer.parentElement.insertBefore(banner, cartContainer);
    }

    // Delegacion de eventos (+, -, eliminar) usando el modulo central.
    document.addEventListener('click', (ev) => {
      const del = ev.target.closest('[data-cart-delete]');
      if (del) { ev.preventDefault(); cart.removeItem(del.dataset.cartDelete); return; }
      const plus = ev.target.closest('[data-cart-plus]');
      if (plus) {
        ev.preventDefault();
        if (plus.disabled) return;
        const sku = plus.dataset.cartPlus;
        const items = cart.getItems();
        const it = items.find((i) => i.sku === sku);
        if (!it) return;
        const p = productBySku.get(sku);
        const maxStock = p?.stock ?? null;
        const newQty = (it.quantity || 0) + 1;
        if (maxStock != null && newQty > maxStock) {
          toast(`Stock máximo alcanzado (${maxStock} uds).`);
          return;
        }
        cart.setQty(sku, newQty);
        return;
      }
      const minus = ev.target.closest('[data-cart-minus]');
      if (minus) {
        ev.preventDefault();
        const sku = minus.dataset.cartMinus;
        const items = cart.getItems();
        const it = items.find((i) => i.sku === sku);
        if (it && it.quantity > 1) cart.setQty(sku, it.quantity - 1);
        return;
      }
    });
    document.addEventListener('change', (ev) => {
      const inp = ev.target.closest('[data-cart-qty-input]');
      if (!inp) return;
      const sku = inp.dataset.cartQtyInput;
      const p = productBySku.get(sku);
      const maxStock = p?.stock ?? null;
      let q = Math.max(1, Number(inp.value) || 1);
      if (maxStock != null && q > maxStock) {
        q = maxStock;
        inp.value = q;
        toast(`Stock máximo: ${maxStock} uds.`);
      }
      cart.setQty(sku, q);
    });
  }


  // Mapeo categoría DB -> URL de página de categoría (para el breadcrumb).
  const CATEGORY_PAGE_BY_SLUG = {
    'mecanismos': { url: '/pages/tienda/mecanismos.html', name: 'Mecanismos' },
    'iluminacion': { url: '/pages/tienda/iluminacion.html', name: 'Iluminación' },
    'proteccion': { url: '/pages/tienda/protecciones-electricas.html', name: 'Protección eléctrica' },
    'porteros-videoporteros': { url: '/pages/tienda/porteros-videoporteros.html', name: 'Porteros y Videoporteros' },
    'domotica': { url: '/pages/tienda/domotica.html', name: 'Domótica' },
    'automatismos': { url: '/pages/tienda/automatismos.html', name: 'Automatismos' },
    'antenas-telecomunicaciones': { url: '/pages/tienda/antenas-telecomunicaciones.html', name: 'Antenas y Telecomunicaciones' },
    'seguridad': { url: '/pages/tienda/seguridad.html', name: 'Seguridad' },
    'cableado': { url: '/pages/tienda/categoria-cableado.html', name: 'Cableado' },
  };

  // Por categoría: lista de "facetas" relevantes (claves de spec y cómo presentarlas).
  // kind: 'auto' (intenta swatch, si no es color → chip) | 'chip' (siempre chip texto) | 'amps' (chip mono)
  const CATEGORY_FACETS = {
    'mecanismos': [
      { label: 'Acabado', keys: ['acabado', 'familia de color', 'color'], kind: 'auto' },
      { label: 'Amperaje', keys: ['intensidad', 'amperaje'], kind: 'amps' },
    ],
    'iluminacion': [
      { label: 'Casquillo', keys: ['casquillo'], kind: 'chip' },
      { label: 'Potencia', keys: ['potencia'], kind: 'chip' },
      { label: 'Temperatura color', keys: ['temperatura color', 'temperatura de color', 'temperatura'], kind: 'chip' },
      { label: 'Color de la luz', keys: ['color de la luz', 'color cambiante', 'color'], kind: 'auto' },
      { label: 'Lúmenes', keys: ['lumen', 'flujo luminoso', 'intensidad luminosa'], kind: 'chip' },
      { label: 'Protección IP', keys: ['proteccion ip', 'grado ip', 'indice de proteccion'], kind: 'chip' },
    ],
    'proteccion': [
      { label: 'Tipo', keys: ['tipo de producto', 'tipo'], kind: 'chip' },
      { label: 'Polos', keys: ['polos', 'numero de polos'], kind: 'chip' },
      { label: 'Intensidad', keys: ['intensidad nominal', 'intensidad'], kind: 'amps' },
      { label: 'Sensibilidad', keys: ['sensibilidad'], kind: 'chip' },
      { label: 'Curva', keys: ['curva'], kind: 'chip' },
    ],
    'porteros-videoporteros': [
      { label: 'Sistema', keys: ['sistema', 'tipo de instalacion'], kind: 'chip' },
      { label: 'Tamaño pantalla', keys: ['tamano pantalla', 'tamano de pantalla', 'pantalla'], kind: 'chip' },
      { label: 'Color', keys: ['color del monitor', 'color'], kind: 'auto' },
      { label: 'Conectividad', keys: ['conectividad'], kind: 'chip' },
    ],
    'domotica': [
      { label: 'Protocolo', keys: ['protocolo', 'tecnologia'], kind: 'chip' },
      { label: 'Función', keys: ['funcion', 'funcionalidad'], kind: 'chip' },
      { label: 'Alimentación', keys: ['alimentacion'], kind: 'chip' },
      { label: 'Asistente', keys: ['asistente compatible', 'asistente'], kind: 'chip' },
    ],
    'automatismos': [
      { label: 'Tipo de puerta', keys: ['tipo de puerta'], kind: 'chip' },
      { label: 'Peso máximo', keys: ['peso maximo'], kind: 'chip' },
      { label: 'Frecuencia', keys: ['frecuencia mando', 'frecuencia'], kind: 'chip' },
      { label: 'Alimentación', keys: ['alimentacion'], kind: 'chip' },
    ],
    'antenas-telecomunicaciones': [
      { label: 'Banda', keys: ['banda'], kind: 'chip' },
      { label: 'Tipo de cable', keys: ['tipo de cable'], kind: 'chip' },
      { label: 'Estándar Wi-Fi', keys: ['estandar wi-fi', 'estandar wifi', 'wi-fi'], kind: 'chip' },
      { label: 'Velocidad', keys: ['velocidad red', 'velocidad'], kind: 'chip' },
    ],
    'seguridad': [
      { label: 'Resolución', keys: ['resolucion'], kind: 'chip' },
      { label: 'Conectividad', keys: ['conectividad'], kind: 'chip' },
      { label: 'Visión nocturna', keys: ['vision nocturna', 'vision'], kind: 'chip' },
      { label: 'Protección IP', keys: ['proteccion ip'], kind: 'chip' },
      { label: 'Almacenamiento', keys: ['almacenamiento'], kind: 'chip' },
    ],
    'cableado': [
      { label: 'Tipo de cable', keys: ['tipo de cable'], kind: 'chip' },
      { label: 'Sección', keys: ['seccion', 'seccion mm'], kind: 'chip' },
      { label: 'Aislamiento', keys: ['aislamiento'], kind: 'chip' },
    ],
  };

  function _findSpec(specs, ...keys) {
    if (!specs) return null;
    const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (const k of keys) {
      const wanted = norm(k);
      // word-boundary match: 'ip' no debe matchear 'tipo'.
      const pattern = new RegExp(`(?:^|\\s|/|\\b)${wanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\s|/|\\b|\\(|s\\b)`);
      for (const [key, val] of Object.entries(specs)) {
        if (pattern.test(norm(key))) return val;
      }
    }
    return null;
  }

  function _renderImageGallery(product, ctx) {
    const main = ctx.querySelector('[data-glx-main-image]');
    const thumbs = ctx.querySelector('[data-glx-thumbs]');
    if (!main) return;
    const imgs = [];
    if (product.image) imgs.push(product.image);
    // specs._images si lo tenemos como array adicional
    const extra = product.specs?._images;
    if (Array.isArray(extra)) extra.forEach((u) => { if (u && !imgs.includes(u)) imgs.push(u); });
    const primary = imgs[0];
    if (primary) {
      // Inserta el img antes del bloque de pills (manteniendo overlays existentes)
      const old = main.querySelector('img');
      if (old) old.remove();
      const img = document.createElement('img');
      img.src = primary;
      img.alt = product.name;
      img.loading = 'lazy';
      img.className = 'absolute inset-0 w-full h-full object-contain p-6';
      main.insertBefore(img, main.firstChild);
    }
    if (thumbs) {
      thumbs.innerHTML = '';
      imgs.slice(0, 5).forEach((src, i) => {
        const btn = document.createElement('button');
        btn.className = `aspect-square rounded-lg border-2 ${i === 0 ? 'border-ink' : 'border-line'} overflow-hidden bg-paper-2 grid place-items-center hover:border-graphite`;
        btn.innerHTML = `<img src="${escapeHtml(src)}" alt="" class="w-full h-full object-contain p-1.5"/>`;
        btn.addEventListener('click', () => {
          const img = main.querySelector('img');
          if (img) img.src = src;
          thumbs.querySelectorAll('button').forEach((b) => { b.classList.remove('border-ink'); b.classList.add('border-line'); });
          btn.classList.remove('border-line');
          btn.classList.add('border-ink');
        });
        thumbs.appendChild(btn);
      });
    }
  }

  function _renderVariantSelector(product, ctx) {
    const dbVariants = product?.variants;
    const specVariants = product?.specs?._variants;
    const variants = (Array.isArray(specVariants) && specVariants.length >= 2) ? specVariants
                   : (Array.isArray(dbVariants) && dbVariants.length >= 2) ? dbVariants
                   : null;
    if (!Array.isArray(variants) || variants.length < 2) return;
    const axis = product?.specs?._variant_axis || 'Variante';
    // Anclamos el selector inmediatamente antes del bloque de facetas para
    // dejarlo a la altura del precio en la columna derecha.
    const anchor = ctx.querySelector('[data-glx-facets]');
    if (!anchor) return;
    let host = ctx.querySelector('[data-glx-variants]');
    if (!host) {
      host = document.createElement('div');
      host.setAttribute('data-glx-variants', '');
      host.className = 'space-y-2';
      anchor.parentNode.insertBefore(host, anchor);
    }
    host.innerHTML = '';
    const label = document.createElement('div');
    label.className = 'font-mono text-[10px] uppercase tracking-wider text-graphite';
    label.textContent = axis;
    host.appendChild(label);
    const grid = document.createElement('div');
    grid.className = 'flex flex-wrap gap-2';
    variants.forEach((v) => {
      const isCurrent = String(v.sku) === String(product.sku);
      const btn = document.createElement(isCurrent ? 'div' : 'a');
      btn.className = [
        'flex flex-col items-start gap-1 px-3 py-2 rounded-lg border text-left transition-colors min-w-[120px]',
        isCurrent
          ? 'border-ink bg-ink text-paper'
          : 'border-line bg-white hover:border-ink',
      ].join(' ');
      if (!isCurrent) {
        btn.setAttribute('href', `/pages/tienda/producto.html?sku=${encodeURIComponent(v.sku)}`);
      } else {
        btn.setAttribute('aria-current', 'true');
      }
      const lbl = document.createElement('span');
      lbl.className = 'text-sm font-medium leading-tight';
      
      let vLabel = v.label;
      if (!vLabel && (v.finish || v.amps)) {
        vLabel = [v.finish, v.amps].filter(Boolean).join(' · ');
      }
      lbl.textContent = vLabel || v.sku;
      
      const pr = document.createElement('span');
      pr.className = `font-mono text-xs ${isCurrent ? 'text-paper/70' : 'text-graphite'}`;
      pr.textContent = typeof v.price === 'number' ? money(v.price) : '';
      btn.appendChild(lbl);
      btn.appendChild(pr);
      grid.appendChild(btn);
    });
    host.appendChild(grid);
  }

  function _renderFacets(product, ctx) {
    const root = ctx.querySelector('[data-glx-facets]');
    if (!root) return;
    root.innerHTML = '';
    const slug = product.category?.slug;
    const facets = CATEGORY_FACETS[slug] || [];
    const usedKeys = new Set();
    const blocks = [];
    for (const facet of facets) {
      const value = _findSpec(product.specs, ...facet.keys);
      if (value == null) continue;
      const valStr = String(value).trim();
      if (!valStr || valStr === '—') continue;
      // "No" → la característica no aplica → ocultarla
      if (/^no$/i.test(valStr)) continue;
      const dedupeKey = valStr.toLowerCase();
      if (usedKeys.has(`${facet.label}::${dedupeKey}`)) continue;
      usedKeys.add(`${facet.label}::${dedupeKey}`);
      blocks.push({ ...facet, value: valStr });
    }

    // Fallback: si no hubo matches específicos de la categoría, usa las primeras
    // 6 specs no-vacías como info-tiles. Garantiza que siempre se muestre algo
    // útil sobre el producto.
    if (!blocks.length && product.specs) {
      const SKIP = /^(producto empaquetado|altura|anchura|profundidad|peso|nombre de la serie)/i;
      const fallbackKeys = Object.entries(product.specs).filter(([k, v]) => {
        if (k.startsWith('_')) return false;
        if (_isEmptySpecValue(v)) return false;
        if (/^marca( del producto)?$/i.test(k.trim())) return false;
        if (SKIP.test(k.trim())) return false;
        return true;
      }).slice(0, 6);
      for (const [k, v] of fallbackKeys) {
        const cleanKey = k.replace(/\s*\(en .*?\)/i, '').replace(/\s*del producto/i, '').trim();
        blocks.push({ label: cleanKey, value: String(v).trim(), kind: 'auto' });
      }
    }

    if (!blocks.length) return;

    // Como cada producto tiene un único valor por faceta (no es un sistema de
    // variantes con múltiples SKUs), las renderizamos como tiles informativos
    // en grid, no como selectores.
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-2 sm:grid-cols-3 gap-3';

    blocks.forEach((block) => {
      const tile = document.createElement('div');
      tile.className = 'bg-paper-2 border border-line rounded-lg p-3 flex items-center gap-3';

      const swatchBg = block.kind === 'auto' ? _resolveSwatch(block.value) : null;
      if (swatchBg) {
        const sw = document.createElement('span');
        sw.className = 'inline-block w-6 h-6 rounded-full border border-line shrink-0';
        sw.style.background = swatchBg;
        sw.title = block.value;
        tile.appendChild(sw);
      }

      const txt = document.createElement('div');
      txt.className = 'min-w-0 flex-1';
      const isYes = /^s[ií]$/i.test(block.value);
      const valueDisplay = isYes ? '<span class="text-stock font-medium">Sí</span>' : escapeHtml(block.value);
      txt.innerHTML = `
        <div class="text-[10px] uppercase tracking-wider text-graphite font-mono leading-tight mb-0.5">${escapeHtml(block.label)}</div>
        <div class="text-sm font-medium leading-tight truncate" title="${escapeHtml(block.value)}">${valueDisplay}</div>
      `;
      tile.appendChild(txt);
      grid.appendChild(tile);
    });
    root.appendChild(grid);
  }

  function _isEmptySpecValue(v) {
    if (v == null) return true;
    const s = String(v).trim();
    if (!s) return true;
    if (s === '—' || s === '-' || s === '–') return true;
    if (/^no$/i.test(s)) return true;
    return false;
  }

  function _renderSpecsAside(product, ctx) {
    const aside = ctx.querySelector('[data-glx-specs-aside]');
    const full = ctx.querySelector('[data-glx-specs-full]');
    if (!product.specs) return;
    // Filtrar specs internas (_*), claves vacías y deduplicar Marca
    const seenKeys = new Set();
    const specs = [];
    for (const [k, v] of Object.entries(product.specs)) {
      if (k.startsWith('_')) continue;
      if (_isEmptySpecValue(v)) continue;
      const norm = k.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
      if (seenKeys.has(norm)) continue;
      seenKeys.add(norm);
      specs.push([k, v]);
    }
    if (aside) {
      aside.innerHTML = '';
      // Quita la fila "Marca" de specs si ya tenemos product.brand
      const filtered = specs.filter(([k]) => !/^marca( del producto)?$/i.test(k.trim()));
      const compact = [
        ['Marca', product.brand?.name],
        ...filtered.slice(0, 13),
      ].filter(([, v]) => !_isEmptySpecValue(v));
      compact.forEach(([k, v], i) => {
        const row = document.createElement('div');
        row.className = `spec-row${i === compact.length - 1 ? ' !border-b-0' : ''}`;
        row.innerHTML = `<span>${escapeHtml(String(k))}</span><span class="dots"></span><span class="font-mono">${escapeHtml(String(v))}</span>`;
        aside.appendChild(row);
      });
    }
    if (full) {
      full.innerHTML = '';
      // Agrupar specs en columnas de 5-6
      const groups = [];
      const chunkSize = Math.ceil(specs.length / 4) || 1;
      for (let i = 0; i < specs.length; i += chunkSize) groups.push(specs.slice(i, i + chunkSize));
      const groupTitles = ['Generales', 'Eléctricas / técnicas', 'Físicas', 'Otros'];
      groups.forEach((items, idx) => {
        if (!items.length) return;
        const col = document.createElement('div');
        col.innerHTML = `<h3 class="eyebrow text-copper mb-4">${escapeHtml(groupTitles[idx] || 'Detalles')}</h3>`;
        const list = document.createElement('div');
        list.className = 'text-sm';
        items.forEach(([k, v]) => {
          const r = document.createElement('div');
          r.className = 'spec-row';
          r.innerHTML = `<span>${escapeHtml(String(k))}</span><span class="dots"></span><span class="font-mono">${escapeHtml(String(v))}</span>`;
          list.appendChild(r);
        });
        col.appendChild(list);
        full.appendChild(col);
      });
    }
  }

  async function bindProductPage() {
    if (page !== '/pages/tienda/producto.html') return;
    const sku = new URLSearchParams(location.search).get('sku') || '27101-31';
    let product;
    try {
      product = await api.product(sku);
    } catch (error) {
      toast(error.message);
      return;
    }
    if (!product) {
      toast('Producto no encontrado');
      return;
    }
    const root = document;

    // Title + meta description
    document.title = `${product.name} · Tienda · GarperLux`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', product.description || product.name);

    // Breadcrumb
    const cat = product.category?.slug ? CATEGORY_PAGE_BY_SLUG[product.category.slug] : null;
    const bcCat = root.querySelector('[data-glx-bc-category]');
    if (bcCat && cat) {
      bcCat.textContent = cat.name;
      bcCat.setAttribute('href', cat.url);
    } else if (bcCat && product.category?.name) {
      bcCat.textContent = product.category.name;
    }
    const bcName = root.querySelector('[data-glx-bc-name]');
    if (bcName) bcName.textContent = product.name;

    // Brand
    root.querySelectorAll('[data-glx-brand-pill]').forEach((el) => { el.textContent = product.brand?.name || '—'; });
    const brandLink = root.querySelector('[data-glx-brand-link]');
    if (brandLink) brandLink.textContent = product.brand?.name || '—';

    // Name
    root.querySelectorAll('[data-glx-name]').forEach((el) => { el.textContent = product.name; });

    // SKU + EAN
    root.querySelectorAll('[data-glx-sku]').forEach((el) => { el.textContent = product.sku; });
    const ean = _findSpec(product.specs, 'ean', 'codigo barras', 'código barras');
    const eanBlock = root.querySelector('[data-glx-ean-block]');
    if (ean) {
      root.querySelectorAll('[data-glx-ean]').forEach((el) => { el.textContent = ean; });
    } else if (eanBlock) {
      eanBlock.hidden = true;
    }

    // Description
    root.querySelectorAll('[data-glx-description]').forEach((el) => { el.textContent = product.description || `Producto ${product.name} disponible en GarperLux.`; });
    const descTitle = root.querySelector('[data-glx-desc-title]');
    if (descTitle) descTitle.textContent = product.name;
    const descBody = root.querySelector('[data-glx-desc-body]');
    if (descBody) {
      descBody.innerHTML = '';
      const text = product.description || `${product.name} disponible en GarperLux con stock real y envío 24-48 h.`;
      const p = document.createElement('p');
      p.className = 'text-graphite leading-relaxed text-lg';
      p.textContent = text;
      descBody.appendChild(p);
    }

    // Stock pill / row
    const stockPill = root.querySelector('[data-glx-stock-pill]');
    if (stockPill) {
      stockPill.textContent = product.stock > 0 ? `En stock · ${product.stock} uds` : 'Sin stock';
      stockPill.classList.toggle('pill-stock', product.stock > 0);
      stockPill.classList.toggle('pill-warn', !product.stock);
    }
    const stockText = root.querySelector('[data-glx-stock-text]');
    if (stockText) stockText.textContent = product.stock > 0 ? `En stock · ${product.stock} unidades` : 'Sin stock';
    
    const stockRow = root.querySelector('[data-glx-stock-row]');
    if (stockRow) {
      const dot = stockRow.querySelector('span.rounded-full');
      if (dot) {
        dot.className = `w-2.5 h-2.5 rounded-full shrink-0 ${product.stock > 0 ? 'bg-stock animate-pulse' : 'bg-warn'}`;
      }
      const subtitle = stockRow.querySelector('.text-xs.text-graphite');
      if (subtitle) {
        subtitle.textContent = product.stock > 0 ? 'Si pides antes de las 17:00, sale hoy mismo.' : 'Consulta plazo de reposición desde tu cuenta o por teléfono.';
      }
    }

    // Price
    root.querySelectorAll('[data-glx-price], [data-glx-price-pvp]').forEach((el) => { el.textContent = money(product.price); });
    const priceBase = root.querySelector('[data-glx-price-base]');
    const proPrice = +(product.price * 0.78).toFixed(2);
    root.querySelectorAll('[data-glx-price-pro]').forEach((el) => { el.textContent = money(proPrice); });
    if (priceBase) priceBase.textContent = `Base imp. ${money(+(product.price / 1.21).toFixed(2))} · IVA 21%`;
    const fin = root.querySelector('[data-glx-price-financing]');
    if (fin) {
      const cuota = +(product.price / 12).toFixed(2);
      fin.textContent = product.price > 30 ? `o desde ${money(cuota)} en 12 meses sin intereses` : '';
    }

    // Selector de variantes (Especialidad, Acabado, etc.) — solo si el
    // producto pertenece a un grupo y tiene siblings en specs._variants.
    _renderVariantSelector(product, root);

    // Facetas relevantes para la categoría (casquillo, potencia, color, polos, etc.)
    _renderFacets(product, root);

    // Specs aside + tab
    _renderSpecsAside(product, root);

    // Source link (si vino del scraper)
    const srcLink = root.querySelector('[data-glx-source-link]');
    const sourceUrl = product.specs?._source;
    if (srcLink && sourceUrl && /^https?:\/\//.test(sourceUrl)) {
      srcLink.setAttribute('href', sourceUrl);
      srcLink.hidden = false;
    }

    // Highlights dinámicos: pickear specs interesantes (Marca, Garantía, Norma, IP, Material...)
    const highlights = root.querySelector('[data-glx-highlights]');
    if (highlights) {
      const HIGHLIGHT_KEYS = [
        ['marca', 'Marca verificada', 'electric', `${product.brand?.name || 'GarperLux'}`],
        ['garantia', 'Garantía declarada', 'copper', null],
        ['norma', 'Norma / certificación', 'stock', null],
        ['proteccion ip', 'Grado de protección', 'electric', null],
        ['material', 'Material', 'copper', null],
        ['vida util', 'Vida útil', 'copper', null],
        ['frecuencia', 'Frecuencia', 'electric', null],
        ['casquillo', 'Casquillo', 'copper', null],
        ['conectividad', 'Conectividad', 'electric', null],
        ['protocolo', 'Protocolo', 'electric', null],
        ['resolucion', 'Resolución', 'electric', null],
        ['vision', 'Visión nocturna', 'copper', null],
      ];
      const ICONS = {
        electric: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        copper: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
        stock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 12l2 2 4-4M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c2.39 0 4.68.94 6.36 2.64"/></svg>',
      };
      highlights.innerHTML = '';
      const collected = [];
      const seenValues = new Set();
      for (const [key, title, color, fallback] of HIGHLIGHT_KEYS) {
        if (collected.length >= 4) break;
        const value = fallback || _findSpec(product.specs, key);
        if (!value) continue;
        const valueKey = String(value).toLowerCase().trim();
        if (seenValues.has(valueKey)) continue;
        if (collected.some((c) => c.title === title)) continue;
        seenValues.add(valueKey);
        collected.push({ title, color, value });
      }
      collected.forEach(({ title, color, value }) => {
        const card = document.createElement('div');
        card.className = 'flex gap-3 p-4 rounded-lg bg-paper-2 border border-line';
        card.innerHTML = `
          <div class="w-10 h-10 rounded-lg bg-white grid place-items-center shrink-0 text-${color}">${ICONS[color]}</div>
          <div class="text-sm">
            <div class="font-semibold mb-0.5">${escapeHtml(title)}</div>
            <div class="text-graphite text-xs">${escapeHtml(String(value))}</div>
          </div>
        `;
        highlights.appendChild(card);
      });
      if (!collected.length) highlights.hidden = true;
    }

    // Galería
    _renderImageGallery(product, root);

    // Vista pro: bloques antes hardcodeados ahora dinámicos.
    _renderProductDocs(product, root);
    _renderProductWarehouses(product, root);
    _renderProductVolumeTiers(product, root);
    _renderProductDiscount(product, root);

    // Pestañas inferiores: relacionados, Q&A, contadores.
    _renderRelatedProducts(product, root);
    _renderProductQA(product, root);
    _renderReviewMeta(product, root);

    // Bind add-to-cart buttons
    root.querySelectorAll('button').forEach((button) => {
      if (/añadir|carrito/i.test(button.textContent) || button.getAttribute('aria-label') === 'Añadir') {
        button.dataset.addCart = '';
        button.dataset.sku = product.sku;
      }
    });

    // Bind add to favorites
    root.querySelectorAll('[data-action="add-favorite"]').forEach(button => {
      button.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          if (window.GarperLuxApi) await window.GarperLuxApi.addFavorite(product.sku);
          if (typeof window.glxRefreshSidebarCounts === 'function') window.glxRefreshSidebarCounts();
          toast('Se ha añadido a Mis favoritos. Lo tienes en tu área personal.');
        } catch (err) {
          toast(err.status === 401 ? 'Debes iniciar sesión para añadir a favoritos.' : 'Añadido a Mis favoritos (modo prototipo).');
        }
      });
    });
  }

  // ============== HELPERS DE VISTA PRO Y RELACIONADOS ==============

  // Hash determinista 0-2^32 a partir de un string. Lo usamos para repartir
  // stock entre almacenes y elegir Q&A/relacionados sin aleatoriedad.
  function _hash(s) {
    let h = 2166136261;
    const str = String(s || '');
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // Devuelve los documentos disponibles para el producto.
  //   - Ficha técnica: SIEMPRE que el producto tenga specs útiles. Es un
  //     resumen propio (no inventado) generado a partir de la información
  //     real del catálogo: nombre, marca, SKU, EAN, especificaciones.
  //   - Documentos oficiales: TODOS los enlaces a PDFs reales scrapeados
  //     del proveedor original (specs._documents lo pobla
  //     scripts/scraper/import_documents.py).
  // No se inventan manuales ni declaraciones CE — sólo se enseña lo que
  // realmente existe en el catálogo o en la web original del producto.
  function _resolveProductDocuments(product) {
    if (!product) return [];
    const docs = [];
    const specs = product.specs || {};
    const usefulSpecs = Object.entries(specs).filter(([k, v]) => !k.startsWith('_') && v != null && String(v).trim() && !/^no$/i.test(String(v).trim()));

    // Tamaño aproximado de la ficha técnica generada (determinista por SKU).
    const h = _hash(product.sku || product.slug || product.name || '');
    const fmtKb = (min, max) => `${min + (h % (max - min + 1))} KB`;

    if (usefulSpecs.length >= 2) {
      docs.push({
        type: 'ficha',
        label: 'Ficha técnica',
        size: fmtKb(220, 460),
        color: 'warn',
        icon: 'doc',
      });
    }

    // Documentos oficiales scrapeados (specs._documents).
    const official = Array.isArray(specs._documents) ? specs._documents : [];
    const ICON_BY_TYPE = { manual: 'list', datasheet: 'doc', ce: 'check', catalog: 'doc', official: 'doc' };
    const COLOR_BY_TYPE = { manual: 'graphite', datasheet: 'warn', ce: 'electric', catalog: 'copper', official: 'copper' };
    for (const doc of official) {
      if (!doc || !doc.url) continue;
      const docType = (doc.type || 'official').toLowerCase();
      // Etiqueta más legible: si la del scraper viene en mayúsculas,
      // suavizamos la presentación.
      const rawLabel = (doc.label || 'Documento del fabricante').trim();
      const label = rawLabel.length > 38 ? `${rawLabel.slice(0, 36)}…` : rawLabel;
      docs.push({
        type: `official-${docType}`,
        label,
        size: doc.size || 'PDF',
        color: COLOR_BY_TYPE[docType] || 'copper',
        icon: ICON_BY_TYPE[docType] || 'doc',
        href: doc.url,
        host: doc.source_host || (() => { try { return new URL(doc.url).hostname; } catch { return ''; } })(),
        isOfficial: true,
      });
    }

    return docs;
  }

  function _renderProductDocs(product, ctx) {
    const host = ctx.querySelector('[data-glx-docs]');
    if (!host) return;
    const docs = _resolveProductDocuments(product);
    if (!docs.length) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    host.hidden = false;
    // Layout responsive: 1 botón → ancho completo; 2 → grid de 2;
    // 3 o más → grid de 3 (las filas siguientes envuelven automáticamente).
    host.className = `view-pro mt-4 grid gap-2 ${docs.length === 1 ? 'grid-cols-1' : docs.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`;

    const ICONS = {
      doc: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
      check: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12l2 2 4-4M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c2.39 0 4.68.94 6.36 2.64"/></svg>',
      list: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM16 13H8M16 17H8M10 9H8"/></svg>',
    };

    host.innerHTML = docs.map((d) => {
      const isOfficial = !!d.isOfficial;
      const href = isOfficial
        ? d.href
        : `/pages/tienda/documento.html?sku=${encodeURIComponent(product.sku)}&type=${encodeURIComponent(d.type)}`;
      // Para los oficiales mostramos un badge "OFICIAL · {host}" y el icono de
      // enlace externo, para que el usuario vea que abre la web del fabricante.
      const externalIcon = isOfficial
        ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="opacity-70 ml-1"><path d="M14 3h7v7M21 3l-9 9M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"/></svg>'
        : '';
      const badge = isOfficial
        ? `<span class="block font-mono text-[9px] text-copper uppercase tracking-wider mt-0.5">Oficial · ${escapeHtml((d.host || '').replace(/^www\./, ''))}</span>`
        : '';
      const sizeLabel = isOfficial ? (d.size || 'PDF') : `PDF · ${d.size}`;
      const wrapClass = isOfficial
        ? 'bg-paper-2 border border-copper/40 hover:border-copper'
        : 'bg-white border border-line hover:border-ink';
      return `
      <a href="${escapeHtml(href)}"
         target="_blank" rel="noopener${isOfficial ? ' nofollow external' : ''}"
         class="${wrapClass} rounded-lg p-3 transition-colors flex items-center gap-3 no-underline"
         data-doc-button="${escapeHtml(d.type)}"
         ${isOfficial ? 'data-doc-official="true"' : ''}
         aria-label="${isOfficial ? 'Abrir documento oficial' : 'Abrir'} ${escapeHtml(d.label)}">
        <span class="text-${escapeHtml(d.color)} shrink-0">${ICONS[d.icon] || ICONS.doc}</span>
        <span class="text-left text-xs min-w-0 flex-1">
          <span class="block font-medium text-ink truncate" title="${escapeHtml(d.label)}">${escapeHtml(d.label)}${externalIcon}</span>
          <span class="block font-mono text-[10px] text-graphite">${escapeHtml(sizeLabel)}</span>
          ${badge}
        </span>
      </a>`;
    }).join('');
  }

  // Disponibilidad del producto en la vista pro: un único almacén (sede
  // central de Jaén). Antes había una tabla de 2-3 almacenes ficticios, pero
  // GarperLux solo tiene un almacén físico, así que mostramos solo el total
  // y la fecha aproximada de próxima reposición.
  function _renderProductWarehouses(product, ctx) {
    const host = ctx.querySelector('[data-glx-warehouses]');
    if (!host) return;
    const total = Number(product.stock || 0);
    if (total <= 0) {
      host.hidden = false;
      host.className = 'view-pro bg-white border border-line rounded-xl overflow-hidden';
      host.innerHTML = `
        <div class="px-4 py-3 bg-paper-2 border-b border-line text-xs font-mono uppercase tracking-wider text-graphite">
          Disponibilidad
        </div>
        <div class="px-4 py-4 flex items-center gap-3">
          <span class="w-2.5 h-2.5 rounded-full bg-warn shrink-0"></span>
          <div class="flex-1">
            <div class="text-sm font-medium">Sin stock disponible</div>
            <div class="text-xs text-graphite">Consulta plazo de reposición desde tu cuenta o por teléfono.</div>
          </div>
        </div>
      `;
      return;
    }
    host.hidden = false;
    const h = _hash(product.sku || product.slug || product.name || '');
    const reposDate = new Date();
    reposDate.setDate(reposDate.getDate() + 14 + (h % 17));
    const dd = String(reposDate.getDate()).padStart(2, '0');
    const mm = String(reposDate.getMonth() + 1).padStart(2, '0');
    const yyyy = reposDate.getFullYear();
    const reposUnits = 80 + (h % 220);

    host.className = 'view-pro bg-white border border-line rounded-xl overflow-hidden';
    host.innerHTML = `
      <div class="px-4 py-3 bg-paper-2 border-b border-line text-xs font-mono uppercase tracking-wider text-graphite flex items-center justify-between">
        <span>Disponibilidad</span>
        <span class="text-stock">● ${total} uds en almacén</span>
      </div>
      <div class="px-4 py-4 flex items-center gap-3">
        <span class="w-2.5 h-2.5 rounded-full bg-stock animate-pulse shrink-0"></span>
        <div class="flex-1">
          <div class="text-sm font-medium">Jaén · Las Lagunillas</div>
          <div class="text-xs text-graphite">Sede central · Pedidos antes de las 17:00 salen el mismo día.</div>
        </div>
        <div class="font-mono text-xs text-graphite text-right shrink-0">
          <div>Próxima reposición</div>
          <div class="text-ink">+${reposUnits} uds · ${dd}-${mm}-${yyyy}</div>
        </div>
      </div>
    `;
  }

  // Escalado por volumen: 3 tramos calculados sobre el precio pro.
  function _renderProductVolumeTiers(product, ctx) {
    const host = ctx.querySelector('[data-glx-volume-tiers]');
    if (!host) return;
    const price = Number(product.price || 0);
    if (price <= 0) { host.hidden = true; host.innerHTML = ''; return; }
    const proPrice = +(price * 0.78).toFixed(2);
    const tier10 = +(proPrice * 0.94).toFixed(2);
    const tier25 = +(proPrice * 0.88).toFixed(2);
    const tier100 = +(proPrice * 0.82).toFixed(2);
    host.hidden = false;
    host.innerHTML = `
      <div class="font-medium text-ink mb-1.5">Escalado por volumen</div>
      <div class="grid grid-cols-3 gap-2 font-mono">
        <div><span class="text-graphite">10+ uds</span><br/><strong class="text-ink">${money(tier10)}</strong></div>
        <div><span class="text-graphite">25+ uds</span><br/><strong class="text-ink">${money(tier25)}</strong></div>
        <div><span class="text-graphite">100+ uds</span><br/><strong class="text-ink">${money(tier100)}</strong></div>
      </div>
    `;
  }

  // Descuento profesional: 22% sobre el PVP. Lo dejamos centralizado por si
  // en el futuro quisiéramos variarlo por categoría/marca.
  function _renderProductDiscount(product, ctx) {
    const el = ctx.querySelector('[data-glx-pro-discount]');
    if (!el) return;
    el.textContent = '−22%';
  }

  // Productos relacionados: misma categoría (excluyendo la variante actual),
  // hasta 4 elementos elegidos de forma determinista por hash.
  async function _renderRelatedProducts(product, ctx) {
    const host = ctx.querySelector('[data-glx-related]');
    if (!host) return;
    if (!product.category?.slug) { host.innerHTML = ''; return; }
    let pool;
    try {
      pool = await api.products({ category: product.category.slug });
    } catch {
      host.innerHTML = '';
      return;
    }
    const candidates = (pool || []).filter((p) => p.sku !== product.sku);
    if (!candidates.length) { host.innerHTML = '<div class="col-span-full text-sm text-graphite text-center py-6">No hay productos relacionados.</div>'; return; }
    const h = _hash(product.sku);
    const start = candidates.length > 4 ? h % (candidates.length - 4) : 0;
    const picks = candidates.slice(start, start + 4);

    host.innerHTML = picks.map((p) => `
      <a href="/pages/tienda/producto.html?sku=${encodeURIComponent(p.sku)}" class="card-prod group" data-sku="${escapeHtml(p.sku)}">
        <div class="img grid place-items-center text-graphite/30 ${p.image ? 'relative overflow-hidden' : ''}">
          ${p.image
            ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" class="absolute inset-0 w-full h-full object-contain p-3"/>`
            : '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>'}
        </div>
        <div>
          <div class="text-[11px] font-mono text-graphite">${escapeHtml(p.brand?.name || '—')}</div>
          <h3 class="text-[14px] font-medium leading-snug">${escapeHtml(p.name)}</h3>
          <div class="font-mono text-[11px] text-graphite/70">SKU ${escapeHtml(p.sku)}</div>
        </div>
        <div class="font-serif text-lg font-medium">${money(p.price)}</div>
      </a>
    `).join('');
  }

  // Q&A genera 2-3 preguntas/respuestas según categoría + algunas comunes.
  function _renderProductQA(product, ctx) {
    const host = ctx.querySelector('[data-glx-qa]');
    if (!host) return;
    const cat = (product.category && product.category.slug) || '';
    const brand = product.brand?.name || 'el fabricante';
    const QA_BY_CAT = {
      'mecanismos': [
        { q: '¿Incluye el marco?', a: `No, este producto es solo el mecanismo. El marco se vende aparte para que puedas elegir el acabado y serie compatible (${brand} u otra de la misma gama).` },
        { q: '¿Vale para sustituir un mecanismo de otra marca?', a: 'El mecanismo encaja en una caja universal estándar, pero el marco antiguo no será compatible: tendrás que cambiarlo también por uno de la misma serie.' },
        { q: '¿Sirve para zonas húmedas como un baño?', a: 'En interior con IP20 vale para baño SIEMPRE QUE estés fuera del volumen de protección de la ducha o bañera. Para zonas con agua directa necesitas un mecanismo estanco IP44/IP55.' },
      ],
      'iluminacion': [
        { q: '¿Es regulable con un dimmer estándar?', a: 'Solo si el producto está marcado como regulable. Verifica que el dimmer sea compatible con LED para evitar parpadeos o ruidos.' },
        { q: '¿Cuánta vida útil real tiene?', a: 'La vida declarada es L70 (la luminaria pierde un 30% de flujo a esa hora). En uso doméstico 3 h/día equivale a unos 20 años aproximadamente.' },
        { q: '¿Tira un calor que pueda fundir el plafón?', a: 'No, los LED apenas calientan el plafón. Sí calienta ligeramente el disipador interior, pero está dimensionado para no superar la temperatura admisible del material.' },
      ],
      'proteccion': [
        { q: '¿Puedo cambiarlo yo en el cuadro?', a: 'Solo si tienes formación eléctrica básica y trabajas con tensión cortada y verificada. En instalaciones bajo BT solo está autorizado el titular o un instalador autorizado para añadir circuitos.' },
        { q: '¿Cuántos módulos ocupa en el cuadro?', a: 'Verifica los módulos en la ficha técnica. Magnetotérmicos 1P+N suelen ocupar 1 módulo; diferenciales 2P, 2 módulos; magnetotérmicos 4P, 4 módulos.' },
        { q: '¿Cómo se prueba el diferencial?', a: 'Pulsando el botón TEST cada mes. Debe disparar inmediatamente. Si no salta, sustitúyelo: la persona pasa a estar desprotegida.' },
      ],
      'automatismos': [
        { q: '¿Es compatible con mi puerta?', a: `Verifica peso, longitud y altura de la hoja. Cada modelo tiene un máximo declarado por ${brand}; no superes ese límite o el motor sufrirá.` },
        { q: '¿Necesito una línea eléctrica nueva?', a: 'Sí: el motor debe ir a una línea independiente con magnetotérmico propio en el cuadro y, si va al exterior, con diferencial dedicado.' },
        { q: '¿Cuántos mandos puedo memorizar?', a: 'La centralita admite el número indicado en la ficha técnica (típicamente 30-450 emisores). Puedes borrar mandos perdidos sin afectar al resto.' },
        { q: '¿Funciona en caso de corte de luz?', a: 'No automáticamente. Para mantener el servicio en cortes, instala una batería de emergencia compatible con tu modelo.' },
      ],
      'porteros-videoporteros': [
        { q: '¿Es compatible con instalaciones antiguas de 4+N hilos?', a: 'Solo si el modelo está específicamente marcado como compatible con esa cableación. Modelos modernos suelen usar 2 hilos no polarizados (sistema digital).' },
        { q: '¿Puedo desviar la llamada al móvil?', a: 'Sí en los modelos WiFi. Tendrás que emparejar el monitor con la app del fabricante y tener la vivienda con buena cobertura WiFi 2.4 GHz.' },
        { q: '¿Funciona si se va la luz?', a: 'No, requiere alimentación. Si la instalación es crítica, valora añadir un SAI o un alimentador con respaldo de batería.' },
      ],
      'domotica': [
        { q: '¿Necesita un hub o cubo central?', a: 'Depende del protocolo. Wi-Fi y Matter funcionan directos al router. Zigbee/Z-Wave necesitan un hub compatible. Revisa la sección de conectividad de la ficha técnica.' },
        { q: '¿Funciona sin internet?', a: 'Las funciones locales sí (encendido manual desde el dispositivo o un mando físico asociado). Las funciones remotas y por voz sí requieren internet.' },
        { q: '¿Puedo automatizarlo con Alexa o Google Home?', a: 'La mayoría sí, vinculando la cuenta del fabricante con el asistente. Confirma compatibilidad en la ficha del producto.' },
      ],
      'seguridad': [
        { q: '¿Necesita instalación profesional?', a: 'Para sistemas conectados a CRA (Central Receptora de Alarmas) sí, por normativa. Sistemas autónomos los puedes instalar tú siguiendo el manual.' },
        { q: '¿Funciona con corte de luz?', a: 'Sí, las centralitas llevan batería interna que da autonomía durante varias horas. Las cámaras Wi-Fi pierden la transmisión si cae el router.' },
      ],
      'antenas-telecomunicaciones': [
        { q: '¿Vale para TDT y para satélite?', a: 'Verifica el rango de frecuencia indicado. Antenas UHF cubren TDT (470-790 MHz). Para satélite necesitas una parabólica con LNB universal.' },
        { q: '¿Hace falta un técnico para apuntarla?', a: 'Recomendable. Sin medidor de campo es difícil optimizar el nivel y la calidad (BER) de señal.' },
      ],
      'cableado': [
        { q: '¿Qué sección elijo?', a: 'Depende de la potencia y la longitud. Para alumbrado 1,5 mm²; para enchufes generales 2,5 mm²; cocinas/lavadoras 4 mm²; cargadores VE consulta cálculo específico.' },
        { q: '¿Puedo empalmar dos tramos?', a: 'Solo dentro de una caja registrable y con bornes homologados (no recortes con cinta aislante). Las cajas deben ser accesibles.' },
      ],
    };
    const generic = [
      { q: '¿Tiene garantía?', a: `Sí. Los productos vendidos por GarperLux tienen como mínimo 3 años de garantía legal frente al consumidor (RD-Ley 7/2021), ampliable según las condiciones que aplique ${brand}.` },
      { q: '¿Cómo lo devuelvo si no me sirve?', a: 'Tienes 30 días desde la recepción para devolverlo sin preguntas. Inicia el proceso desde tu cuenta o llama al servicio de atención al cliente.' },
    ];

    const list = (QA_BY_CAT[cat] || []).slice(0, 3).concat(generic.slice(0, 1));
    host.innerHTML = list.map((item) => `
      <details class="bg-paper-2 border border-line rounded-xl p-5 group open:border-ink">
        <summary class="flex items-start justify-between gap-4 cursor-pointer list-none">
          <h4 class="font-medium">${escapeHtml(item.q)}</h4>
          <svg class="shrink-0 mt-1 group-open:rotate-45 transition-transform" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>
        </summary>
        <p class="text-graphite text-sm mt-3">${escapeHtml(item.a)}</p>
      </details>
    `).join('');

    const counter = ctx.querySelector('[data-glx-qa-count]');
    if (counter) counter.textContent = `(${list.length})`;
  }

  // Actualiza el contador de reseñas en la pestaña a partir del hash del SKU
  // (el bloque visual de reseñas se mantiene como demo de UJA).
  function _renderReviewMeta(product, ctx) {
    const counter = ctx.querySelector('[data-glx-rev-count]');
    if (!counter) return;
    const h = _hash(product.sku || '');
    const total = 18 + (h % 220);
    counter.textContent = `(${total})`;
  }

  function bindCheckout() {
    if (!['/pages/tienda/carrito.html', '/pages/tienda/checkout.html', '/pages/tienda/pago.html'].includes(page)) return;
    if (page === '/pages/tienda/carrito.html') {
      const couponInput = document.querySelector('details input[type="text"]');
      const applyCoupon = document.querySelector('details button');
      applyCoupon?.addEventListener('click', (event) => {
        event.preventDefault();
        const couponCode = couponInput?.value?.trim().toUpperCase();
        if (!couponCode) return toast('Introduce un código de descuento.');
        const draft = JSON.parse(localStorage.getItem(CHECKOUT_KEY) || '{}');
        draft.couponCode = couponCode;
        localStorage.setItem(CHECKOUT_KEY, JSON.stringify(draft));
        toast(`Cupón ${couponCode} preparado para el checkout.`);
      });
      return;
    }
    if (page === '/pages/tienda/checkout.html' || page === '/pages/tienda/pago.html') {
      // Renderizar items del carrito dinámicamente
      (async () => {
        try {
          const checkoutItemsContainer = document.querySelector('[data-checkout-items]');
          if (!checkoutItemsContainer) return;

          if (api.getToken() && window.GarperLuxCart?.syncOnLogin) {
            try {
              const remoteCart = await api.cart();
              if (!remoteCart?.items?.length) await window.GarperLuxCart.syncOnLogin();
            } catch {
              await window.GarperLuxCart.syncOnLogin().catch(() => null);
            }
          }

          const local = JSON.parse(localStorage.getItem('garperlux_cart_items') || '[]');
          const localCheckoutItems = local.length ? await Promise.all(
            local.map(async (item) => {
              try {
                const product = await api.product(item.sku);
                return {
                  ...item,
                  name: product.name || item.name || item.title,
                  title: product.name || item.title,
                  price: Number(item.price) || Number(product.price) || 0,
                  image: product.image || item.image || (product.specs_json ? JSON.parse(product.specs_json)._images?.[0] : null) || null,
                };
              } catch {
                return item;
              }
            })
          ) : [];

          let items = localCheckoutItems;
          if (api.getToken()) {
            // Si el servidor ya tiene carrito, lo usamos para enriquecer,
            // pero no dejamos que una sincronización tardía vacíe el checkout.
            try {
              const cart = await api.cart();
              if (cart?.items?.length) {
                const serverItems = cart.items.map((item) => ({
                  sku: item.sku,
                  title: item.name || item.title || item.sku,
                  name: item.name || item.title || item.sku,
                  price: Number(item.price) || 0,
                  quantity: Number(item.quantity) || 1,
                  image: item.image || null,
                  brand: item.brand || null,
                }));
                if (items.length === 0) items = serverItems;
                else {
                  const bySku = new Map(items.map((item) => [item.sku, item]));
                  for (const serverItem of serverItems) {
                    const existing = bySku.get(serverItem.sku);
                    if (existing) {
                      existing.quantity = Number(existing.quantity) || Number(serverItem.quantity) || 1;
                      existing.name = existing.name || serverItem.name;
                      existing.title = existing.title || serverItem.title;
                      existing.price = Number(existing.price) || Number(serverItem.price) || 0;
                      existing.image = existing.image || serverItem.image;
                      existing.brand = existing.brand || serverItem.brand;
                    } else {
                      items.push(serverItem);
                    }
                  }
                }
              }
            } catch {
              // Si el backend aún no tiene cart, seguimos con localStorage.
            }
          }

          // Enriquecer imágenes si faltan (doble check)
          await Promise.all(items.map(async (item) => {
            if (!item.image) {
              try {
                const product = await api.product(item.sku);
                item.image = product.image || (product.specs_json ? JSON.parse(product.specs_json)._images?.[0] : null);
              } catch {}
            }
          }));

          // Renderizar items
          if (items.length) {
            const productCount = items.length;
            const totalUnits = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
            document.querySelectorAll('[data-order-item-count]').forEach(el => {
              el.textContent = `${productCount} ${productCount === 1 ? 'producto' : 'productos'} · ${totalUnits} ${totalUnits === 1 ? 'unidad' : 'unidades'}`;
            });

            checkoutItemsContainer.innerHTML = items.map((item) => `
              <div class="p-4 flex gap-3 items-center">
                <div class="w-12 h-12 rounded-lg bg-paper-2 grid place-items-center text-graphite/40 shrink-0 overflow-hidden">
                  ${item.image ? `<img src="${item.image}" alt="${item.name || item.title}" class="w-full h-full object-cover">` : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`}
                </div>
                <div class="flex-1 min-w-0"><div class="text-sm font-medium truncate">${item.name || item.title || 'Producto'}</div><div class="text-xs text-graphite font-mono">×${item.quantity}</div></div>
                <span class="font-mono text-sm">${money((item.price || 0) * item.quantity)}</span>
              </div>`).join('');
          } else {
            checkoutItemsContainer.innerHTML = '<div class="p-4 text-center text-graphite text-sm">El carrito está vacío</div>';
          }

          // Actualizar totales
          const subtotal = items.reduce((s, i) => s + ((i.price || 0) * (i.quantity || 0)), 0);
          const tax = subtotal * 0.21;
          
          const draft = JSON.parse(localStorage.getItem(CHECKOUT_KEY) || '{}');
          const FREE_SHIPPING_THRESHOLD = 75; // envío estándar a domicilio gratis a partir de 75 €
          const shippingMethodsMap = {
            'standard': { label: 'Envío estándar', price: 4.90 },
            'express': { label: 'Envío urgente', price: 9.90 },
            'pickup': { label: 'Recogida en almacén', price: 0 }
          };
          const method = shippingMethodsMap[draft.shippingMethod] || shippingMethodsMap.standard;
          // El envío estándar a domicilio es gratis al superar el umbral (la recogida ya es 0).
          const qualifiesFreeShipping = (draft.shippingMethod || 'standard') === 'standard' && subtotal >= FREE_SHIPPING_THRESHOLD;
          const shippingCost = qualifiesFreeShipping ? 0 : method.price;
          const total = subtotal + tax + shippingCost;

          document.querySelectorAll('[data-order-subtotal]').forEach((el) => { el.textContent = money(subtotal); });
          document.querySelectorAll('[data-order-tax]').forEach((el) => { el.textContent = money(tax); });
          document.querySelectorAll('[data-order-shipping-label]').forEach((el) => { el.textContent = method.label; });
          document.querySelectorAll('[data-order-shipping-cost]').forEach((el) => { el.textContent = shippingCost === 0 ? 'Gratis' : money(shippingCost); });
          document.querySelectorAll('[data-order-total]').forEach((el) => { el.textContent = money(total); });
          // Refleja el envío gratis en el precio de la opción "Estándar" del paso de entrega.
          document.querySelectorAll('[data-vel-standard-price]').forEach((el) => {
            const free = subtotal >= FREE_SHIPPING_THRESHOLD;
            el.textContent = free ? 'Gratis' : '4,90 €';
            el.classList.toggle('text-stock', free);
          });
          document.querySelectorAll('[data-order-pay-button]').forEach((el) => {
            el.innerHTML = `Pagar ${money(total)}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
          });
          
          // Renderizar resumen de envío si estamos en pago.html
          if (page === '/pages/tienda/pago.html') {
            const summaryContainer = document.querySelector('[data-checkout-address-summary]');
            if (summaryContainer) {
              if (draft.shippingMethod === 'pickup') {
                summaryContainer.innerHTML = `
                  <strong>Envío a:</strong> Recogida en almacén · <strong>${method.label}</strong>
                  <a href="/pages/tienda/checkout.html" class="block text-xs text-copper hover:underline mt-1">Cambiar modo de entrega</a>
                `;
              } else {
                const addressText = draft.shippingAddress || 'Dirección de envío pendiente';
                summaryContainer.innerHTML = `
                  <strong>Envío a:</strong> ${addressText} · <strong>${method.label}</strong>
                  <a href="/pages/tienda/checkout.html" class="block text-xs text-copper hover:underline mt-1">Cambiar dirección o velocidad</a>
                `;
              }
            }
          }
        } catch (err) {
          console.error('[CHECKOUT DEBUG]', err);
        }
      })();

      if (page === '/pages/tienda/checkout.html') {
        const renderAddresses = (addresses, containerId, namePrefix, checkedId = null) => {
          const container = document.getElementById(containerId);
          if (!container) return;
          if (!addresses.length) {
            container.innerHTML = `
              <div class="bg-white border border-line rounded-2xl p-6 text-center space-y-4">
                <p class="text-sm text-graphite">Todavía no tienes ninguna dirección guardada. Añade una para continuar con el envío de tu pedido.</p>
                <button onclick="location.href='/pages/cuenta/anadir-direccion.html?redirect=checkout.html'" class="btn btn-primary inline-flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                  Añadir dirección de envío
                </button>
              </div>`;
            return;
          }
          container.innerHTML = addresses.map((addr, idx) => {
            const isSelected = checkedId ? (addr.id === checkedId) : (idx === 0 || addr.is_default);
            return `
              <div class="bg-white border ${isSelected ? 'border-2 border-ink' : 'border-line'} rounded-2xl p-5 cursor-pointer hover:border-graphite transition-all" onclick="this.querySelector('input').click()">
                <div class="flex items-start gap-3">
                  <input type="radio" name="${namePrefix}" value="${addr.id}" ${isSelected ? 'checked' : ''} class="mt-1.5" onchange="document.querySelectorAll('input[name=${namePrefix}]').forEach(i => i.closest('.bg-white').classList.remove('border-2', 'border-ink')); this.closest('.bg-white').classList.add('border-2', 'border-ink');"/>
                  <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1 flex-wrap">
                      <span class="font-medium">${addr.label || 'Dirección'}</span>
                      ${addr.is_default ? '<span class="pill bg-paper-2 text-graphite text-[10px]">Predeterminada</span>' : ''}
                      ${addr.is_billing ? '<span class="pill bg-electric/10 text-electric text-[10px]">Facturación</span>' : ''}
                    </div>
                    <div class="text-sm text-graphite">${addr.recipient || ''} · ${addr.line1 || ''} · ${addr.postal_code || ''} ${addr.city || ''} · ${addr.phone || ''}</div>
                  </div>
                  <button class="text-xs text-copper hover:underline" onclick="event.stopPropagation(); location.href='/pages/cuenta/editar-direccion.html?id=${addr.id}'">Editar</button>
                </div>
              </div>`;
          }).join('') + `
            <button onclick="location.href='/pages/cuenta/anadir-direccion.html?redirect=checkout.html'" class="w-full p-4 border border-dashed border-line rounded-2xl text-sm font-medium text-graphite hover:border-ink hover:text-ink transition-all flex items-center justify-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
              Añadir nueva dirección
            </button>`;
        };

        if (!api.getToken()) {
          const gc = document.getElementById('checkout-addresses-container');
          if (gc) gc.innerHTML = `<div class="bg-white border border-line rounded-2xl p-5 space-y-4">
            <p class="text-sm text-graphite">Compra como invitado — te enviaremos la confirmación y el seguimiento del pedido por email.</p>
            <div class="grid sm:grid-cols-2 gap-3">
              <div><label class="text-xs font-mono text-graphite uppercase tracking-wider mb-1 block">Email *</label><input id="guest-email" type="email" class="field" placeholder="tu@correo.com" autocomplete="email"></div>
              <div><label class="text-xs font-mono text-graphite uppercase tracking-wider mb-1 block">Nombre y apellidos *</label><input id="guest-name" class="field" placeholder="Antonio García" autocomplete="name"></div>
              <div><label class="text-xs font-mono text-graphite uppercase tracking-wider mb-1 block">Teléfono</label><input id="guest-phone" type="tel" class="field" placeholder="600 000 000" autocomplete="tel"></div>
              <div class="sm:col-span-2"><label class="text-xs font-mono text-graphite uppercase tracking-wider mb-1 block">Dirección de envío *</label><input id="guest-address" class="field" placeholder="Calle, número, piso · CP · ciudad" autocomplete="street-address"></div>
            </div>
            <p class="text-xs text-graphite">¿Ya tienes cuenta? <a href="/pages/auth/login.html?redirect=checkout.html" class="link-underline">Inicia sesión</a> para usar tus direcciones guardadas.</p>
          </div>`;
        } else api.checkoutOptions().then((options) => {
          const allAddresses = options.addresses || [];
          renderAddresses(allAddresses, 'checkout-addresses-container', 'dir');
          
          const billingCheckbox = document.getElementById('billing-same-as-shipping');
          const billingSection = document.getElementById('billing-address-section');
          const billingContainer = document.getElementById('billing-addresses-container');

          if (billingCheckbox && billingSection) {
            billingCheckbox.addEventListener('change', () => {
              billingSection.classList.toggle('hidden', billingCheckbox.checked);
              if (!billingCheckbox.checked) {
                const billingAddrs = allAddresses.filter(a => a.is_billing);
                renderAddresses(billingAddrs, 'billing-addresses-container', 'billing_dir');
              }
            });
          }
        }).catch((err) => {
          console.error('[CHECKOUT OPTIONS ERROR]', err);
          const container = document.getElementById('checkout-addresses-container');
          if (container) container.innerHTML = '<div class="p-8 text-center text-sm text-warn bg-warn/5 border border-warn/20 rounded-2xl">Error al cargar direcciones. Por favor, intenta de nuevo.</div>';
        });

        // Toggle address section based on shipping method
        const modoRadios = document.querySelectorAll('input[name="modo"]');
        const addressWrapper = document.getElementById('shipping-address-section-wrapper');
        if (modoRadios.length && addressWrapper) {
          modoRadios.forEach(radio => {
            radio.addEventListener('change', () => {
              const isPickup = document.getElementById('modo-pickup')?.checked;
              addressWrapper.classList.toggle('hidden', isPickup);
              
              // Also sync with the velocity radios if needed
              const pickupVel = document.querySelector('input[name="vel"][value="pickup"]');
              const standardVel = document.querySelector('input[name="vel"][value="standard"]');
              if (isPickup && pickupVel) {
                pickupVel.checked = true;
              } else if (!isPickup && pickupVel?.checked && standardVel) {
                standardVel.checked = true;
              }
            });
          });
        }
      }
    }
    const primary = [...document.querySelectorAll('a.btn-primary, button.btn-primary')].at(-1);
    primary?.addEventListener('click', async (event) => {
      if (page === '/pages/tienda/checkout.html') {
        if (api.getToken() && window.GarperLuxCart?.syncOnLogin) {
          try {
            const remoteCart = await api.cart();
            if (!remoteCart?.items?.length) await window.GarperLuxCart.syncOnLogin();
          } catch {
            await window.GarperLuxCart.syncOnLogin().catch(() => null);
          }
        }
        const selectedShipping = checkedLabel('vel', 'Estándar 24-48 h').toLowerCase();
        const draft = JSON.parse(localStorage.getItem(CHECKOUT_KEY) || '{}');
        draft.shippingMethod = selectedShipping.includes('expr') ? 'express' : selectedShipping.includes('recogida') ? 'pickup' : 'standard';

        // Invitado: capturamos contacto + dirección del formulario antes de pasar al pago.
        if (!api.getToken()) {
          const email = (document.getElementById('guest-email')?.value || '').trim();
          const name = (document.getElementById('guest-name')?.value || '').trim();
          const phone = (document.getElementById('guest-phone')?.value || '').trim();
          const address = (document.getElementById('guest-address')?.value || '').trim();
          const needsAddress = draft.shippingMethod !== 'pickup';
          if (!/.+@.+\..+/.test(email) || (needsAddress && !address)) {
            event.preventDefault();
            toast('Para continuar como invitado necesitamos tu email' + (needsAddress ? ' y tu dirección de envío.' : '.'));
            return;
          }
          draft.contact = { email, name, phone };
          draft.shippingAddress = needsAddress ? address : 'Recogida en almacén (Jaén)';
          localStorage.setItem(CHECKOUT_KEY, JSON.stringify(draft));
          return;
        }
        
        // Direcciones
        const selectedDirRadio = document.querySelector('input[name="dir"]:checked');
        if (selectedDirRadio) {
          const card = selectedDirRadio.closest('.bg-white');
          draft.addressLabel = card.querySelector('.font-medium')?.textContent || 'Mi dirección';
          draft.shippingAddress = card.querySelector('.text-sm.text-graphite')?.textContent || '';
          draft.shippingAddressId = selectedDirRadio.value;
        }

        const billingCheckbox = document.getElementById('billing-same-as-shipping');
        if (billingCheckbox && !billingCheckbox.checked) {
          const selectedBillingRadio = document.querySelector('input[name="billing_dir"]:checked');
          if (selectedBillingRadio) {
            const card = selectedBillingRadio.closest('.bg-white');
            draft.billingAddress = card.querySelector('.text-sm.text-graphite')?.textContent || '';
            draft.billingAddressId = selectedBillingRadio.value;
          }
        } else {
          draft.billingAddress = draft.shippingAddress;
          draft.billingAddressId = draft.shippingAddressId;
        }

        localStorage.setItem(CHECKOUT_KEY, JSON.stringify(draft));
        return;
      }
      event.preventDefault();
      
      const draft = JSON.parse(localStorage.getItem(CHECKOUT_KEY) || '{}');
      const selectedPayment = document.querySelector('input[name="metodo"]:checked')?.closest('.pay-method')?.textContent?.replace(/\s+/g, ' ').trim() || 'Tarjeta demo';
      
      // Validación de términos si estamos en pago.html
      if (page === '/pages/tienda/pago.html') {
        const termsCheckbox = document.getElementById('terms-checkbox');
        if (termsCheckbox && !termsCheckbox.checked) {
          toast('Debes aceptar los términos y condiciones para continuar.');
          return;
        }
      }

      // Modo INVITADO
      if (!api.getToken()) {
        const items = (window.GarperLuxCart?.getItems()) || [];
        if (!items.length) { toast('Tu cesta está vacía.'); return; }
        if (!draft.contact?.email) {
          toast('Falta tu email de contacto. Te llevamos al paso de entrega.');
          location.href = '/pages/tienda/checkout.html';
          return;
        }
        try {
          // Pedido REAL de invitado: el backend recalcula precios/stock y persiste (user_id NULL).
          const order = await api.guestCheckout({
            items: items.map((i) => ({ sku: i.sku, quantity: i.quantity })),
            contact: draft.contact,
            shippingAddress: draft.shippingAddress || '',
            shippingMethod: draft.shippingMethod || 'standard',
            payment: selectedPayment,
          });
          const lastOrder = { ...order, guest: true, contact: draft.contact, items, payment: selectedPayment };
          localStorage.setItem('garperlux_last_order', JSON.stringify(lastOrder));
          localStorage.removeItem(CHECKOUT_KEY);
          if (window.GarperLuxCart) window.GarperLuxCart.clear();
          location.href = `/pages/tienda/pedido-confirmado.html?order=${encodeURIComponent(order.code)}`;
        } catch (error) {
          toast(error.message || 'No se pudo tramitar el pedido. Inténtalo de nuevo.');
        }
        return;
      }

      // Modo LOGUEADO
      try {
        const options = await api.checkoutOptions();
        const order = await api.checkout({
          ...draft,
          payment: selectedPayment,
          paymentMethodId: options.paymentMethods?.[0]?.id || null,
          acceptedTerms: true,
        });
        
        // Guardar items en localStorage para mostrar confirmación incluso si la sesión expira
        const cartItems = options?.cart?.items || (JSON.parse(localStorage.getItem('garperlux_cart_items') || '[]'));
        const lastOrder = { ...order, items: cartItems, totals: order.totals || options?.totals || null };
        localStorage.setItem('garperlux_last_order', JSON.stringify(lastOrder));
        localStorage.removeItem(CHECKOUT_KEY);
        if (window.GarperLuxCart) window.GarperLuxCart.clear();
        location.href = `/pages/tienda/pedido-confirmado.html?order=${encodeURIComponent(order.code)}`;
      } catch (error) {
        toast(error.message || 'Error al procesar el pedido');
      }
    });
  }

  function bindConfirmationPages() {
    if (page === '/pages/tienda/pedido-confirmado.html') {
      const orderFromStorage = JSON.parse(localStorage.getItem('garperlux_last_order') || 'null');
      const code = new URLSearchParams(location.search).get('order') || orderFromStorage?.code;
      if (!code) return;

      // Reemplazar el número de pedido en texto plano
      document.querySelectorAll('*').forEach((node) => {
        if (!node.children.length && /GLX-[A-Z0-9-]+/.test(node.textContent)) {
          node.textContent = node.textContent.replace(/GLX-[A-Z0-9-]+/, code);
        }
      });

      // Renderizar items y totales: intentar obtener del API, fallback a localStorage
      (async () => {
        try {
          let order = null;
          try {
            order = api.getToken()
              ? await api.order(code)
              : await api.publicOrder(code, orderFromStorage?.contact?.email || '');
          } catch (err) {
            order = orderFromStorage;
          }
          if (!order) return;

          const itemsContainer = document.querySelector('[data-confirm-order-items]');
          if (itemsContainer) {
            // Prefer payload.cart.items if API returns payload, otherwise fallback
            const items = (order.payload && order.payload.cart && order.payload.cart.items) || (order.payload && order.payload.items) || order.items || order.lineItems || [];
            if (items && items.length) {
              itemsContainer.innerHTML = items.map((it) => `\n                <div class="p-5 flex gap-4 items-center">\n                  <div class="w-14 h-14 rounded-lg bg-paper-2 grid place-items-center text-graphite/40 shrink-0">${it.image ? `<img src="${it.image}" alt="" class="object-cover w-full h-full"/>` : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`}</div>\n                  <div class="flex-1"><div class="font-medium">${it.name || it.title || it.productName || 'Producto'}</div><div class="text-xs text-graphite font-mono">SKU ${it.sku || it.productSku || ''} · cantidad: ${it.quantity || it.qty || 1}</div></div>\n                  <div class="font-mono font-medium">${money((it.price || it.unitPrice || it.amount || 0) * (it.quantity || it.qty || 1))}</div>\n                </div>`).join('');
            } else {
              itemsContainer.innerHTML = '<div class="p-4 text-center text-graphite text-sm">No hay items en este pedido.</div>';
            }
          }

          // Totales
          // Totals: prefer payload.totals when available
          const payloadCart = order.payload && order.payload.cart ? order.payload.cart : null;
          const subtotal = (order.payload && order.payload.totals && order.payload.totals.subtotal != null) ? order.payload.totals.subtotal :
            (payloadCart ? payloadCart.subtotal : ((order.items || []).reduce((s,i)=> s + ((i.price||i.unitPrice||i.amount||0) * (i.quantity||i.qty||1)), 0)));
          const tax = (order.payload && order.payload.totals && order.payload.totals.tax != null) ? order.payload.totals.tax : (subtotal * 0.21);
          const total = (order.payload && order.payload.totals && order.payload.totals.total != null) ? order.payload.totals.total : subtotal + tax + (order.payload && order.payload.totals && order.payload.totals.shipping ? order.payload.totals.shipping : (order.shipping || SHIPPING_COST));

          document.querySelectorAll('[data-confirm-item-count]').forEach((el) => {
            const itemsForCount = (order.payload && order.payload.cart && order.payload.cart.items) || (order.items || []);
            const count = itemsForCount.reduce((s,i)=> s + (i.quantity||i.qty||1), 0) || itemsForCount.length || 0;
            el.textContent = `${count} producto${count !== 1 ? 's' : ''}`;
          });
          document.querySelectorAll('[data-confirm-total]').forEach((el) => { el.textContent = money(total); });

          // Rellenar Nombre y Email
          let glxEmail = null;
          try {
            if (typeof glxGetUser === 'function') glxEmail = glxGetUser()?.email;
          } catch (e) {}
          const recipientName = order.payload?.checkout?.recipient || order.payload?.checkout?.fullName || 'Cliente';
          const recipientEmail = order.payload?.checkout?.email || order.user_email || glxEmail || 'correo@garperlux.com';
          const userNameEl = document.getElementById('glx-user-name');
          if (userNameEl) userNameEl.textContent = recipientName;
          document.querySelectorAll('[data-confirm-email]').forEach(el => { el.textContent = recipientEmail; });

          // Dirección de entrega
          const deliveryContainer = document.querySelector('[data-confirm-delivery-container]');
          const addressNameEl = document.querySelector('[data-confirm-address-name]');
          const addressTextEl = document.querySelector('[data-confirm-address-text]');
          const shippingMethodEl = document.querySelector('[data-confirm-shipping-method]');
          
          if (deliveryContainer) {
            const addressLabel = order.payload?.checkout?.addressLabel;
            if (addressLabel && addressLabel !== 'Mi dirección' && addressLabel !== 'Recogida en almacén' && !addressLabel.includes('Dirección de entrega')) {
              const titleEl = deliveryContainer.querySelector('.text-\\[10px\\]');
              if (titleEl) titleEl.textContent = `Envío a: ${addressLabel}`;
            }
          }
          
          if (order.payload?.checkout?.shippingMethod === 'pickup' || order.payload?.totals?.shippingMethod?.label?.toLowerCase().includes('recogida')) {
            if (addressNameEl) addressNameEl.textContent = 'Recogida en almacén';
            if (addressTextEl) addressTextEl.innerHTML = 'Polígono Los Olivares<br/>23009 Jaén';
            if (shippingMethodEl) shippingMethodEl.innerHTML = 'Recogida en persona';
          } else {
            if (addressTextEl) {
              const addr = order.payload?.checkout?.shippingAddress || order.payload?.checkout?.address || order.shipping_address || 'Dirección pendiente';
              const parts = addr.split('·').map(s => s.trim());
              
              if (parts.length >= 3) {
                const extractedName = parts[0];
                if (addressNameEl) addressNameEl.textContent = extractedName;
                
                // Update hero name if fallback was used
                if (userNameEl && (userNameEl.textContent === 'Cliente' || userNameEl.textContent === recipientName)) {
                  userNameEl.textContent = extractedName.split(' ')[0];
                }
                
                const phone = parts.length >= 4 ? `<br/><br/><span class="text-graphite">${parts[parts.length - 1]}</span>` : '';
                const city = parts.length >= 4 ? parts[parts.length - 2] : parts[parts.length - 1];
                const addressLines = parts.slice(1, parts.length >= 4 ? -2 : -1).join('<br/>');
                
                addressTextEl.innerHTML = `${addressLines}<br/>${city}${phone}`;
              } else {
                if (addressNameEl) addressNameEl.textContent = recipientName;
                addressTextEl.innerHTML = addr.replace(/,\s*/g, '<br/>').replace(/·/g, '<br/>');
              }
            }
            if (shippingMethodEl) shippingMethodEl.innerHTML = `${order.payload?.checkout?.carrier || order.payload?.totals?.shippingMethod?.label || 'SEUR'} · seguimiento <a href="/pages/servicios/seguir-solicitud.html?code=${code}" class="text-copper">${code}</a>`;
          }

          // Fechas del timeline (Simulado basado en created_at)
          const orderDate = new Date(order.created_at || Date.now());
          const dateStr = (d) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
          const timeStr = (d) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
          const tomorrow = new Date(orderDate); tomorrow.setDate(tomorrow.getDate() + 1);
          const afterTomorrow = new Date(orderDate); afterTomorrow.setDate(afterTomorrow.getDate() + 2);
          
          document.querySelectorAll('[data-confirm-date-1]').forEach(el => { el.textContent = `${dateStr(orderDate)} · ${timeStr(orderDate)}`; });
          document.querySelectorAll('[data-confirm-date-2]').forEach(el => { el.textContent = 'Ahora'; });
          document.querySelectorAll('[data-confirm-date-3]').forEach(el => { el.textContent = `est. ${dateStr(tomorrow)}`; });
          document.querySelectorAll('[data-confirm-date-4]').forEach(el => { el.textContent = `est. ${dateStr(afterTomorrow)}`; });
          
          // Actualizar botón "Ver detalle"
          const detailLink = document.querySelector('a[href="/pages/cuenta/mis-pedido.html"]');
          if (detailLink) detailLink.href = `/pages/cuenta/mis-pedido.html?order=${code}`;

        } catch (err) {
          console.error('[CONFIRMATION DEBUG]', err);
        }
      })();
    }
    if (page === '/pages/servicios/solicitud-confirmacion.html') {
      const request = JSON.parse(localStorage.getItem('garperlux_last_service_request') || 'null');
      const code = new URLSearchParams(location.search).get('code') || request?.code;
      if (!code) return;
      document.querySelectorAll('*').forEach((node) => {
        if (!node.children.length && /(GLX|SAT)-[A-Z0-9-]+/.test(node.textContent)) {
          node.textContent = node.textContent.replace(/(GLX|SAT)-[A-Z0-9-]+/, code);
        }
      });
    }
  }

  function renderTimeline(events = []) {
    if (!events.length) return '';
    return events.map((event, index) => `
      <li class="relative pl-10 ${index < events.length - 1 ? '' : ''}">
        <span class="absolute left-0 top-1 w-6 h-6 rounded-full ${index === events.length - 1 ? 'bg-filament text-ink' : 'bg-stock text-paper'} grid place-items-center">
          ${index === events.length - 1 ? '•' : '✓'}
        </span>
        <div class="font-medium">${event.title}</div>
        <div class="text-xs text-graphite font-mono mt-0.5">${new Date(event.happened_at).toLocaleString('es-ES')}</div>
        ${event.description ? `<p class="text-sm text-graphite mt-2">${event.description}</p>` : ''}
      </li>`).join('');
  }

  const orderStatusInfo = (status) => orderStatusMeta[status] || orderStatusMeta.preparing;

  const formatOrderDate = (value) => new Date(value).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const formatOrderDateTime = (value) => new Date(value).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const formatOrderItemQuantity = (item) => Number(item?.quantity || item?.qty || 0);
  const formatOrderItemPrice = (item) => Number(item?.price ?? item?.unitPrice ?? item?.amount ?? 0);
  const orderItemTotal = (item) => formatOrderItemPrice(item) * Math.max(1, formatOrderItemQuantity(item));

  function orderCardStatus(status) {
    const meta = orderStatusInfo(status);
    return `<span class="${meta.className} text-[10px]">${meta.label}</span>`;
  }

  function renderOrderItems(items = []) {
    if (!items.length) {
      return '<div class="p-5 text-sm text-graphite">Este pedido no contiene líneas visibles.</div>';
    }
    return items.map((item) => `
      <div class="p-5 grid grid-cols-[60px_1fr_auto] gap-4 items-center">
        <div class="w-14 h-14 rounded-lg bg-paper-2 grid place-items-center text-graphite/40 overflow-hidden">
          ${item.image ? `<img src="${item.image}" alt="${item.name || item.sku || 'Producto'}" class="w-full h-full object-cover">` : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>'}
        </div>
        <div>
          <div class="font-medium">${item.name || item.title || 'Producto'}</div>
          <div class="text-xs text-graphite font-mono">SKU ${item.sku || item.code || '—'} · cantidad: ${formatOrderItemQuantity(item) || 1}</div>
        </div>
        <div class="font-mono font-medium">${money(orderItemTotal(item))}</div>
      </div>`).join('');
  }

  async function renderOrdersPage() {
    const main = document.querySelector('main');
    if (!main) return;
    const orders = await api.orders();
    const enriched = await Promise.all(orders.map(async (order) => {
      try {
        return { ...order, detail: await api.order(order.code) };
      } catch {
        return { ...order, detail: null };
      }
    }));

    const totalSpent = enriched.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const activeOrders = enriched.filter((order) => !['completed', 'cancelled'].includes(order.status)).length;
    const lastOrder = enriched[0] || null;
    const orderRows = enriched.length ? enriched.map((order) => {
      const items = order.detail?.payload?.cart?.items || [];
      const itemCount = items.reduce((sum, item) => sum + Math.max(1, formatOrderItemQuantity(item)), 0);
      const preview = items.slice(0, 2).map((item) => item.name || item.title).filter(Boolean).join(' · ');
      return `
        <a href="/pages/cuenta/mis-pedido.html?order=${encodeURIComponent(order.code)}" class="px-5 py-4 grid grid-cols-[88px_1fr_160px_120px_100px_70px] gap-3 items-center text-sm hover:bg-paper-2/50">
          <div class="font-mono text-xs text-graphite">${formatOrderDate(order.created_at || new Date())}</div>
          <div>
            <div class="font-mono font-medium">${order.code}</div>
            <div class="text-xs text-graphite">${itemCount || 'Pedido'} producto${itemCount === 1 ? '' : 's'}${preview ? ` · ${preview}` : ''}</div>
          </div>
          <div>${orderCardStatus(order.status)}</div>
          <div class="font-mono font-medium">${money(order.total)}</div>
          <div class="font-mono text-xs text-graphite">${order.detail?.payload?.checkout?.shippingMethod || order.detail?.payload?.totals?.shippingMethod?.label || 'Pedido'}</div>
          <div class="text-graphite hover:text-ink"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg></div>
        </a>`;
    }).join('') : '<div class="px-5 py-10 text-center text-sm text-graphite">Todavía no tienes pedidos.</div>';

    main.innerHTML = `
      <div class="view-particular space-y-7">
        <div class="flex items-end justify-between flex-wrap gap-4 mb-8">
          <div>
            <div class="eyebrow text-copper mb-2">Historial</div>
            <h1 class="font-serif font-medium leading-[0.96]" style="font-size: clamp(2rem, 4.5vw, 3rem);">Mis pedidos.</h1>
          </div>
          <div class="view-pro flex gap-2">
            <button class="btn btn-sm btn-ghost">Exportar mes en CSV</button>
            <a href="/pages/tienda/tienda.html" class="btn btn-sm btn-ink">+ Nuevo pedido</a>
          </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="stat-card"><div class="text-xs font-mono text-graphite uppercase tracking-wider mb-2">Pedidos totales</div><div class="font-serif text-3xl font-medium">${enriched.length}</div><div class="text-xs text-graphite mt-1">Desde la base de datos</div></div>
          <div class="stat-card"><div class="text-xs font-mono text-graphite uppercase tracking-wider mb-2">Pedidos en curso</div><div class="font-serif text-3xl font-medium">${activeOrders}</div><div class="text-xs text-stock mt-1">Pendientes o en preparación</div></div>
          <div class="stat-card"><div class="text-xs font-mono text-graphite uppercase tracking-wider mb-2">Gastado total</div><div class="font-serif text-3xl font-medium">${money(totalSpent)}</div><div class="text-xs text-graphite mt-1">Histórico acumulado</div></div>
          <div class="stat-card"><div class="text-xs font-mono text-graphite uppercase tracking-wider mb-2">Último pedido</div><div class="font-serif text-3xl font-medium">${lastOrder ? formatOrderDate(lastOrder.created_at || new Date()) : '—'}</div><div class="text-xs text-graphite mt-1">${lastOrder?.code || 'Sin pedidos'}</div></div>
        </div>

        <div class="bg-white border border-line rounded-2xl overflow-hidden">
          <div class="px-5 py-3 bg-paper-2 border-b border-line text-xs font-mono uppercase tracking-wider text-graphite grid grid-cols-[88px_1fr_160px_120px_100px_70px] gap-3">
            <span>Fecha</span><span>Pedido</span><span>Estado</span><span>Total</span><span>Envío</span><span>Detalle</span>
          </div>
          <div class="divide-y divide-line">${orderRows}</div>
          <div class="px-5 py-3 bg-paper-2 border-t border-line text-xs font-mono text-graphite flex justify-between gap-3 flex-wrap">
            <span>Mostrando ${enriched.length} pedido${enriched.length === 1 ? '' : 's'} · <strong class="text-ink">Total histórico: ${money(totalSpent)}</strong></span>
            <a href="/pages/tienda/tienda.html" class="text-copper hover:underline">Seguir comprando →</a>
          </div>
        </div>
      </div>`;
  }

  async function renderOrderDetailPage() {
    const main = document.querySelector('main');
    if (!main) return;
    const params = new URLSearchParams(location.search);
    const orders = await api.orders().catch(() => []);
    const storedOrder = JSON.parse(localStorage.getItem('garperlux_last_order') || 'null');
    const code = params.get('order') || orders[0]?.code || storedOrder?.code;
    if (!code) {
      main.innerHTML = '<div class="bg-white border border-line rounded-2xl p-8 text-center text-sm text-graphite">No hay un pedido seleccionado.</div>';
      return;
    }

    const order = await api.order(code);
    const payload = order.payload || {};
    const items = payload.cart?.items || order.items || [];
    
    // Enriquecer imágenes si faltan para que salgan en el pedido
    await Promise.all(items.map(async (item) => {
      if (!item.image && item.sku) {
        try {
          const product = await api.product(item.sku);
          item.image = product.image || (product.specs_json ? JSON.parse(product.specs_json)._images?.[0] : null);
        } catch {}
      }
    }));

    const totals = payload.totals || {};
    const shippingMethod = totals.shippingMethod?.label || payload.checkout?.shippingMethod || 'Envío estándar';
    const paymentMethod = payload.paymentMethod?.label || payload.checkout?.payment || 'Pago confirmado';
    const address = payload.checkout?.addressLabel || payload.checkout?.shippingAddress || payload.checkout?.address || order.shipping_address || 'Dirección no disponible';
    const meta = orderStatusInfo(order.status);
    const firstItem = items[0];
    let deliveryName = payload.checkout?.recipient || payload.checkout?.fullName || 'Cliente';
    let deliveryAddressHtml = 'Dirección no disponible';
    const rawAddress = payload.checkout?.shippingAddress || payload.checkout?.address || order.shipping_address || '';

    if (payload.checkout?.shippingMethod === 'pickup' || totals.shippingMethod?.label?.toLowerCase().includes('recogida')) {
      deliveryName = 'Recogida en almacén';
      deliveryAddressHtml = 'Polígono Los Olivares<br/>23009 Jaén';
    } else if (typeof rawAddress === 'string' && rawAddress) {
      const parts = rawAddress.split('·').map(s => s.trim());
      if (parts.length >= 3) {
        deliveryName = parts[0];
        const phone = parts.length >= 4 ? `<br/><br/><span class="text-graphite">${parts[parts.length - 1]}</span>` : '';
        const city = parts.length >= 4 ? parts[parts.length - 2] : parts[parts.length - 1];
        const lines = parts.slice(1, parts.length >= 4 ? -2 : -1).join('<br/>');
        deliveryAddressHtml = `${lines}<br/>${city}${phone}`;
      } else {
        deliveryAddressHtml = rawAddress.replace(/,\s*/g, '<br/>').replace(/·/g, '<br/>');
      }
    }

    const addressLabel = payload.checkout?.addressLabel;
    const hasAddressLabel = addressLabel && addressLabel !== 'Mi dirección' && addressLabel !== 'Recogida en almacén' && !addressLabel.includes('Dirección de entrega');
    const addressLabelHtml = hasAddressLabel ? `<div class="text-[10px] font-mono uppercase tracking-wider text-graphite mb-2">${addressLabel}</div>` : '';

    const title = payload.checkout?.summary || (firstItem ? `${firstItem.name || firstItem.title}` : `Pedido ${order.code}`);

    main.innerHTML = `
      <div class="space-y-6">
        <div class="flex items-end justify-between flex-wrap gap-4">
          <div>
            <a href="/pages/cuenta/mis-pedidos.html" class="text-sm text-graphite hover:text-ink flex items-center gap-2 mb-3"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>Volver a mis pedidos</a>
            <div class="flex items-center gap-3 mb-2"><span class="font-mono text-sm text-graphite">Pedido</span><span class="font-mono font-medium text-ink">${order.code}</span><span class="${meta.className}">${meta.label}</span></div>
            <h1 class="font-serif font-medium leading-[0.96]" style="font-size: clamp(1.75rem, 4vw, 2.75rem);">${title}</h1>
            <p class="text-graphite mt-2">Realizado el ${formatOrderDateTime(order.created_at || new Date())}${totals?.shippingMethod?.eta ? ` · entrega estimada ${totals.shippingMethod.eta}` : ''}</p>
          </div>
          <div class="flex gap-2 flex-wrap">
            <a href="/pages/cuenta/factura.html" class="btn btn-sm btn-ghost"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Ver factura</a>
            <a href="/pages/tienda/escribir-resena.html?order=${encodeURIComponent(order.code)}" class="btn btn-sm btn-ghost">Escribir reseña</a>
            <a href="/pages/cuenta/repetir-compra.html?order=${encodeURIComponent(order.code)}" class="btn btn-sm btn-ink">Repetir pedido</a>
          </div>
        </div>

        <div class="bg-white border border-line rounded-2xl p-6">
          <h2 class="font-serif text-xl font-medium mb-6">Tracking real del pedido</h2>
          <ol class="space-y-5 relative">${renderTimeline(order.events || [])}</ol>
        </div>

        <div class="bg-white border border-line rounded-2xl overflow-hidden">
          <div class="px-6 py-4 border-b border-line flex items-center justify-between gap-4 flex-wrap"><h2 class="font-serif text-xl font-medium">${items.length} producto${items.length === 1 ? '' : 's'}</h2><span class="font-mono text-xs text-graphite">${shippingMethod}</span></div>
          <div class="divide-y divide-line">${renderOrderItems(items)}</div>
        </div>

        <div class="grid md:grid-cols-2 gap-5">
          <div class="bg-paper-2 border border-line rounded-2xl p-6">
            <h3 class="font-serif text-lg font-medium mb-4">Resumen</h3>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between"><span class="text-graphite">Subtotal</span><span class="font-mono">${money(totals.subtotal ?? order.total / 1.21)}</span></div>
              <div class="flex justify-between"><span class="text-graphite">${shippingMethod}</span><span class="font-mono">${money(totals.shipping ?? 0)}</span></div>
              <div class="flex justify-between"><span class="text-graphite">IVA (21%)</span><span class="font-mono">${money(totals.tax ?? 0)}</span></div>
              <div class="border-t border-line pt-3 flex justify-between font-medium"><span>Total pagado</span><span class="font-serif text-xl">${money(order.total)}</span></div>
              <div class="text-xs text-graphite mt-2">${paymentMethod}</div>
            </div>
          </div>
          <div class="bg-paper-2 border border-line rounded-2xl p-6">
            <h3 class="font-serif text-lg font-medium mb-4">Entrega</h3>
            <div class="text-sm space-y-1">
              ${addressLabelHtml}
              <div class="font-medium">${deliveryName}</div>
              <div class="text-graphite">${deliveryAddressHtml}</div>
            </div>
            <div class="mt-5 pt-5 border-t border-line">
              <div class="text-xs font-mono uppercase tracking-wider text-graphite mb-1">Transportista</div>
              <div class="text-sm">${payload.checkout?.carrier || 'SEUR Estándar'} · seguimiento <a href="/pages/servicios/seguir-solicitud.html" class="link-underline font-mono text-xs">${payload.checkout?.trackingCode || order.code}</a></div>
            </div>
          </div>
        </div>

        <div class="bg-white border border-line rounded-2xl p-6 flex items-center justify-between flex-wrap gap-3">
          <div class="text-sm text-graphite">¿Algo no encaja con tu pedido? Tienes 30 días para solicitar devolución.</div>
          <div class="flex gap-2"><a href="/pages/tienda/devolucion.html?order=${encodeURIComponent(order.code)}" class="btn btn-sm btn-ghost">Solicitar devolución</a><a href="/pages/empresa/contacto.html" class="btn btn-sm btn-ghost">Contactar soporte</a></div>
        </div>
      </div>`;
  }

  async function bindTrackingPages() {
    if (page === '/pages/servicios/seguir-solicitud.html') {
      const form = document.querySelector('form');
      const showRequest = async (code, email) => {
        const request = await api.publicServiceRequest(code, email);
        document.querySelectorAll('*').forEach((node) => {
          if (node.children.length) return;
          node.textContent = node.textContent
            .replace(/(GLX|SAT)-[A-Z0-9-]+/g, request.code)
            .replace(/Salta el automático al enchufar el microondas\./g, request.description || request.service_type)
            .replace(/Avería eléctrica/g, request.service_type || 'Servicio técnico')
            .replace(/Calle Bernabé Soriano 12, 3ºB · 23001 Jaén/g, request.address || 'Dirección de la solicitud');
        });
        const timeline = document.querySelector('ol.space-y-6');
        if (timeline && request.events?.length) {
          timeline.innerHTML = '<div class="absolute left-3 top-3 bottom-3 w-px bg-line"></div>' + renderTimeline(request.events);
        }
        if (window.glxShow) window.glxShow(2);
      };

      form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        try {
          const code = form.querySelector('input[type="text"]')?.value.trim();
          const email = form.querySelector('input[type="email"]')?.value.trim();
          await showRequest(code, email);
        } catch (error) {
          toast(error.message);
        }
      }, true);

      const code = new URLSearchParams(location.search).get('code') || new URLSearchParams(location.search).get('codigo');
      if (code) {
        showRequest(code, new URLSearchParams(location.search).get('email') || '').catch((error) => toast(error.message));
      }
    }

    if (page === '/pages/cuenta/mis-pedido.html') {
      if (!api.getToken()) return;
      try {
        await renderOrderDetailPage();
      } catch (error) {
        toast(error.message);
      }
    }
  }

  function bindServiceRequest() {
    if (page !== '/pages/servicios/solicitar-tecnico.html') return;
    document.getElementById('btn-submit')?.addEventListener('click', async (event) => {
      event.preventDefault();
      if (!requireSession()) return;
      try {
        const payload = {
          serviceType: document.querySelector('input[name="tipo"]:checked')?.value || 'averia',
          area: document.querySelector('input[name="area"]:checked')?.value || 'electricidad',
          urgency: document.querySelector('input[name="urgencia"]:checked')?.value || 'normal',
          address: [...document.querySelectorAll('[data-step="4"] input[type="text"]')].map((input) => input.value).filter(Boolean).join(', ') || 'Dirección pendiente',
          description: document.getElementById('descripcion')?.value || 'Solicitud creada desde el prototipo GarperLux.',
        };
        const request = await api.serviceRequest(payload);
        localStorage.setItem('garperlux_last_service_request', JSON.stringify(request));
        location.href = `/pages/servicios/solicitud-confirmacion.html?code=${encodeURIComponent(request.code)}`;
      } catch (error) {
        toast(error.message);
      }
    }, true);
  }

  function bindQuoteForms() {
    // crear-presupuesto.html ahora gestiona su propio submit con estructura completa.
    if (page === '/pages/cuenta/crear-presupuesto.html') return;
    if (page !== '/pages/servicios/solicitar-presupuesto.html') return;
    const submitQuote = async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!requireSession()) return;
      try {
        const title = document.querySelector('input[placeholder*="Título"], input[placeholder*="Razón"], input[placeholder*="Nombre"]')?.value || 'Presupuesto GarperLux';
        const quote = await api.createQuote({ title, source: page, items: [] });
        toast(`Presupuesto ${quote.code} guardado.`);
        location.href = `/pages/cuenta/presupuesto.html?code=${encodeURIComponent(quote.code)}`;
      } catch (error) {
        toast(error.message);
      }
    };
    document.querySelector('form')?.addEventListener('submit', submitQuote, true);
    document.querySelectorAll('button').forEach((button) => {
      if (/Enviar|Guardar borrador/i.test(button.textContent)) button.addEventListener('click', submitQuote, true);
    });
  }

  const inputValue = (selector, fallback = '') => document.querySelector(selector)?.value?.trim() || fallback;
  const selectedText = (selector, fallback = '') => document.querySelector(selector)?.selectedOptions?.[0]?.textContent?.trim() || fallback;
  const checkedLabel = (name, fallback = '') => {
    const checked = document.querySelector(`input[name="${name}"]:checked`);
    return checked?.closest('label')?.textContent?.replace(/\s+/g, ' ').trim() || fallback;
  };

  function bindAccountForms() {
    if (page === '/pages/cuenta/datos-personales.html') {
      document.querySelector('button.btn-primary')?.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!requireSession()) return;
        try {
          const fields = [...document.querySelectorAll('main input')];
          const [firstName, lastName, fiscalId, birthDate, email, phone] = fields;
          await api.updateProfile({
            firstName: firstName?.value,
            lastName: lastName?.value,
            fiscalId: fiscalId?.value,
            birthDate: birthDate?.value,
            email: email?.value,
            phone: phone?.value,
            communications: [...document.querySelectorAll('main input[type="checkbox"]')].map((input) => input.checked),
          });
          toast('Datos personales guardados en backend.');
        } catch (error) {
          toast(error.message);
        }
      }, true);
    }

    if (page === '/pages/cuenta/datos-fiscales.html') {
      document.querySelector('button.btn-primary')?.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!requireSession()) return;
        try {
          const fields = [...document.querySelectorAll('main input, main select')];
          const payload = {
            legalName: fields[0]?.value,
            taxId: fields[1]?.value,
            legalForm: fields[2]?.value,
            vatRegime: fields[3]?.value,
            cnae: fields[4]?.value,
            licenseNumber: fields[5]?.value,
            licenseExpires: fields[6]?.value,
            licenseRegion: fields[7]?.value,
            fiscalAddress: fields[8]?.value,
            postalCode: fields[9]?.value,
            city: fields[10]?.value,
            province: fields[11]?.value,
            country: fields[12]?.value,
            iban: fields[13]?.value,
          };
          await api.saveFiscalProfile(payload);
          toast('Datos fiscales guardados en backend.');
        } catch (error) {
          toast(error.message);
        }
      }, true);
    }

    if (page === '/pages/cuenta/anadir-tarjeta.html') {
      document.querySelector('form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!requireSession()) return;
        try {
          const number = inputValue('[data-input-num]');
          const exp = inputValue('[data-input-exp]');
          const [expMonth, expYear] = exp.split('/');
          const method = await api.addPaymentMethod({
            type: 'card',
            label: `Tarjeta ${number.slice(-4) || 'nueva'}`,
            last4: number.replace(/\D/g, '').slice(-4),
            brand: number.startsWith('4') ? 'Visa' : 'Card',
            expMonth,
            expYear,
            holder: inputValue('[data-input-name]'),
            isDefault: document.querySelectorAll('form input[type="checkbox"]')[0]?.checked,
            allowRecurring: document.querySelectorAll('form input[type="checkbox"]')[1]?.checked,
          });
          toast(`Método de pago ${method.label} guardado.`);
          location.href = '/pages/cuenta/metodos-pago.html';
        } catch (error) {
          toast(error.message);
        }
      }, true);
    }
  }

  function bindCommerceForms() {
    if (page === '/pages/tienda/escribir-resena.html') {
      document.querySelector('form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!requireSession()) return;
        try {
          const rating = document.querySelector('input[name="rating"]:checked')?.value || '5';
          const tags = [...document.querySelectorAll('.tag-pill input:checked')].map((input) => input.closest('label').textContent.replace(/\s+/g, ' ').trim());
          const textInputs = [...document.querySelectorAll('main input[type="text"]')];
          const review = await api.addReview({
            sku: new URLSearchParams(location.search).get('sku') || '27101-31',
            orderCode: new URLSearchParams(location.search).get('order') || 'GLX-04-1098',
            rating,
            title: textInputs[0]?.value || 'Reseña GarperLux',
            body: document.querySelector('textarea')?.value || 'Reseña creada desde la web.',
            displayName: textInputs[1]?.value || 'Cliente GarperLux',
            tags,
            verifiedPurchase: true,
          });
          toast(`Reseña guardada para moderación (#${review.id}).`);
          location.href = '/pages/cuenta/mis-pedido.html';
        } catch (error) {
          toast(error.message);
        }
      }, true);
    }

    if (page === '/pages/tienda/devolucion.html') {
      document.querySelector('.btn.btn-primary')?.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!requireSession()) return;
        try {
          const selected = [...document.querySelectorAll('.product-pick input[type="checkbox"]:checked')].map((input) => {
            const row = input.closest('.product-pick');
            return { text: row.textContent.replace(/\s+/g, ' ').trim(), quantity: Number(row.querySelector('input[type="number"]')?.value || 1) };
          });
          const result = await api.createReturn({
            orderCode: new URLSearchParams(location.search).get('order') || 'GLX-04-1184',
            reason: document.querySelector('input[name="motivo"]:checked')?.closest('label')?.querySelector('.font-medium')?.textContent?.trim() || 'No es lo que esperaba',
            shippingMethod: checkedLabel('envio', 'Recogida en casa'),
            refundMethod: checkedLabel('reemb', 'Misma tarjeta del pedido'),
            amount: 5.9,
            items: selected,
            notes: document.querySelector('textarea')?.value || '',
          });
          toast(`Devolución ${result.code} registrada.`);
        } catch (error) {
          toast(error.message);
        }
      }, true);
    }

    if (page === '/pages/cuenta/pedido-recurrente.html') {
      document.querySelector('form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!requireSession()) return;
        try {
          const result = await api.createRecurringOrder({
            name: inputValue('input[type="text"]', 'Pedido recurrente GarperLux'),
            frequency: selectedText('select', 'Mensual'),
            source: page,
          });
          toast(`Pedido recurrente ${result.code} activado.`);
        } catch (error) {
          toast(error.message);
        }
      }, true);
    }
  }

  function bindSupportForms() {
    if (page === '/pages/empresa/contacto.html') {
      document.querySelector('form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        try {
          const form = event.currentTarget;
          const fields = [...form.querySelectorAll('input, textarea')];
          const reason = checkedLabel('motivo', 'Otro');
          const result = await api.contactMessage({
            reason,
            name: fields.find((field) => field.type === 'text' && field.required)?.value || 'Cliente GarperLux',
            email: fields.find((field) => field.type === 'email')?.value || 'cliente@example.com',
            phone: fields.find((field) => field.type === 'tel')?.value || '',
            reference: fields.find((field) => field.placeholder?.includes('GLX'))?.value || '',
            subject: fields.find((field) => field.placeholder?.includes('Resumen'))?.value || 'Contacto web',
            message: form.querySelector('textarea')?.value || 'Mensaje desde formulario de contacto.',
          });
          toast(`Mensaje ${result.code} enviado.`);
          form.reset();
        } catch (error) {
          toast(error.message);
        }
      }, true);
    }

    if (page === '/pages/empresa/trabaja-con-nosotros.html') {
      document.querySelector('form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        try {
          const fields = [...event.currentTarget.querySelectorAll('input, textarea, select')];
          const result = await api.jobApplication({
            name: fields.find((field) => field.type === 'text')?.value || 'Candidato GarperLux',
            email: fields.find((field) => field.type === 'email')?.value || 'candidato@example.com',
            phone: fields.find((field) => field.type === 'tel')?.value || '',
            role: selectedText('select', inputValue('input[name="role"]', 'Candidatura espontánea')),
            message: event.currentTarget.querySelector('textarea')?.value || '',
          });
          toast(`Candidatura ${result.code} recibida.`);
        } catch (error) {
          toast(error.message);
        }
      }, true);
    }
  }

  async function bindAccountPages() {
    if (!api.getToken()) return;
    try {
      if (page === '/pages/cuenta/mis-pedidos.html') {
        await renderOrdersPage();
      }
      if (page === '/pages/cuenta/mis-solicitudes.html') {
        // La página renderiza por sí misma desde /api/service-requests.
      }
      if (page === '/pages/cuenta/mis-presupuestos.html') {
        // Esta página ya renderiza su listado completo desde /api/quotes.
      }
      if (page === '/pages/cuenta/facturas.html' || page === '/pages/cuenta/albaranes.html') {
        // Estas páginas ya renderizan sus documentos completos desde /api/documents.
      }
      await window.glxRefreshSidebarCounts?.();
    } catch (error) {
      toast(error.message);
    }
  }

  async function bindAdminDashboard() {
    if (page !== '/pages/sistema/admin.html') return;
    if (!requireSession()) return;
    const user = await syncSessionToLegacyAuth();
    if (user?.role !== 'admin') {
      toast('Solo administración puede acceder a este panel.');
      location.href = '/pages/cuenta/area-personal.html';
      return;
    }

    const setText = (selector, value) => {
      const node = document.querySelector(selector);
      if (node) node.textContent = value;
    };
    const badge = (status) => `<span class="rounded-full bg-paper-2 px-2 py-1 text-[11px] font-mono text-graphite">${status}</span>`;
    const empty = (text) => `<p class="rounded-xl bg-paper-2 p-4 text-sm text-graphite">${text}</p>`;
    const mount = (name, html) => {
      const node = document.querySelector(`[data-admin-list="${name}"]`);
      if (node) node.innerHTML = html;
    };
    const action = (kind, id, status, label) => `<button class="btn btn-sm btn-ghost" data-admin-action="${kind}" data-id="${id}" data-status="${status}">${label}</button>`;

    async function load() {
      const [summary, products, orders, services, reviews, returns, messages, applications, auditRows] = await Promise.all([
        api.adminSummary(),
        api.adminProducts({ limit: 12 }),
        api.adminOrders(),
        api.adminServiceRequests(),
        api.adminReviews(),
        api.adminReturns(),
        api.adminContactMessages(),
        api.adminJobApplications(),
        api.adminAudit(),
      ]);

      setText('[data-admin-stat="orders"]', summary.pendingOrders);
      setText('[data-admin-stat="services"]', summary.openServiceRequests);
      setText('[data-admin-stat="reviews"]', summary.pendingReviews);
      setText('[data-admin-stat="support"]', summary.newMessages + summary.newApplications);

      mount('products', products.length ? products.map((product) => `
        <article class="admin-row">
          <div><strong>${product.sku} · ${product.name}</strong><p>${product.category_name} · ${product.brand_name} · ${money(product.price)}</p></div>
          <div class="admin-actions">${badge(`${product.stock} uds`)}${action('product-stock', product.sku, '10', '+10 stock')}${action('product-stock', product.sku, '-1', '-1 stock')}</div>
        </article>`).join('') : empty('No hay productos.'));
      mount('orders', orders.length ? orders.map((order) => `
        <article class="admin-row">
          <div><strong>${order.code}</strong><p>${order.customer_name || 'Cliente'} · ${money(order.total)}</p></div>
          <div class="admin-actions">${badge(order.status)}${action('order', order.code, 'shipped', 'Marcar enviado')}${action('order', order.code, 'completed', 'Cerrar')}</div>
        </article>`).join('') : empty('No hay pedidos.'));
      mount('services', services.length ? services.map((request) => `
        <article class="admin-row">
          <div><strong>${request.code}</strong><p>${request.service_type} · ${request.address}</p></div>
          <div class="admin-actions">${badge(request.status)}${action('service', request.code, 'scheduled', 'Programar')}${action('service', request.code, 'resolved', 'Resolver')}</div>
        </article>`).join('') : empty('No hay solicitudes técnicas.'));
      mount('reviews', reviews.length ? reviews.map((review) => `
        <article class="admin-row">
          <div><strong>${review.rating}/5 · ${review.title}</strong><p>${review.product_name} · ${review.display_name}</p></div>
          <div class="admin-actions">${badge(review.status)}${action('review', review.id, 'published', 'Publicar')}${action('review', review.id, 'rejected', 'Rechazar')}</div>
        </article>`).join('') : empty('No hay reseñas.'));
      mount('returns', returns.length ? returns.map((item) => `
        <article class="admin-row">
          <div><strong>${item.code}</strong><p>${item.order_code} · ${item.reason}</p></div>
          <div class="admin-actions">${badge(item.status)}${action('return', item.code, 'approved', 'Aprobar')}${action('return', item.code, 'refunded', 'Reembolsar')}</div>
        </article>`).join('') : empty('No hay devoluciones.'));
      mount('messages', messages.length ? messages.map((message) => `
        <article class="admin-row">
          <div><strong>${message.code} · ${message.subject}</strong><p>${message.name} · ${message.email}</p></div>
          <div class="admin-actions">${badge(message.status)}${action('message', message.code, 'in_progress', 'En curso')}${action('message', message.code, 'closed', 'Cerrar')}</div>
        </article>`).join('') : empty('No hay mensajes.'));
      mount('applications', applications.length ? applications.map((application) => `
        <article class="admin-row">
          <div><strong>${application.code} · ${application.role}</strong><p>${application.name} · ${application.email}</p></div>
          <div class="admin-actions">${badge(application.status)}${action('application', application.code, 'shortlisted', 'Preseleccionar')}${action('application', application.code, 'rejected', 'Descartar')}</div>
        </article>`).join('') : empty('No hay candidaturas.'));
      mount('audit', auditRows.length ? auditRows.map((row) => `
        <article class="admin-row">
          <div><strong>${row.action} · ${row.entity_type} · ${row.entity_id}</strong><p>${row.admin_name || 'Admin'} · ${row.created_at}</p></div>
          <div class="admin-actions">${badge(row.id)}</div>
        </article>`).join('') : empty('No hay auditoría registrada.'));
    }

    async function createAdminProduct(event) {
      event.preventDefault();
      const form = document.querySelector('[data-admin-product-form]');
      if (!form) return;
      try {
        const field = (name) => form.querySelector(`[name="${name}"]`)?.value?.trim() || '';
        const payload = {
          sku: field('sku'),
          name: field('name'),
          price: Number(field('price')),
          stock: Number(field('stock')),
          categorySlug: 'mecanismos',
          brandSlug: 'garperlux',
          description: 'Producto creado desde administración.',
          specs: { source: 'admin' },
        };
        await api.adminCreateProduct(payload);
        form.reset();
        toast(`Producto ${payload.sku} creado.`);
        await load();
      } catch (error) {
        toast(error.message);
      }
    }

    document.querySelector('[data-admin-product-form]')?.addEventListener('submit', createAdminProduct);
    document.querySelector('[data-admin-product-create]')?.addEventListener('click', createAdminProduct);

    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-admin-action]');
      if (!button) return;
      event.preventDefault();
      const kind = button.dataset.adminAction;
      const id = button.dataset.id;
      const status = button.dataset.status;
      try {
        if (kind === 'order') await api.adminUpdateOrderStatus(id, { status });
        if (kind === 'service') await api.adminUpdateServiceRequestStatus(id, { status });
        if (kind === 'review') await api.adminUpdateReviewStatus(id, { status });
        if (kind === 'return') await api.adminUpdateReturnStatus(id, { status });
        if (kind === 'message') await api.adminUpdateContactMessageStatus(id, { status });
        if (kind === 'application') await api.adminUpdateJobApplicationStatus(id, { status });
        if (kind === 'product-stock') await api.adminUpdateProductStock(id, { delta: Number(status) });
        toast(`Estado actualizado a ${status}.`);
        await load();
      } catch (error) {
        toast(error.message);
      }
    });

    await load().catch((error) => toast(error.message));
  }

  // Cifras globales que aparecen en topbars y descripciones: total de
  // referencias del catálogo y total de marcas. Se rellenan en cuanto la
  // app arranca, sin pegar al backend si no hay marcadores en la página.
  async function bindGlobalStats() {
    const refTargets = document.querySelectorAll('[data-glx-stat-references-inline], [data-glx-stat-references]');
    const brandTargets = document.querySelectorAll('[data-glx-stat-brands]');
    if (!refTargets.length && !brandTargets.length) return;
    const fmt = (n) => Number(n || 0).toLocaleString('es-ES');
    try {
      const [products, brands] = await Promise.all([
        refTargets.length ? api.products({}).catch(() => []) : [],
        brandTargets.length ? api.brands().catch(() => []) : [],
      ]);
      refTargets.forEach((el) => { el.textContent = fmt((products || []).length); });
      brandTargets.forEach((el) => { el.textContent = fmt((brands || []).length); });
    } catch { /* noop */ }
  }

  // Carga perezosa del módulo del cart-drawer: cualquier página que tenga
  // backend-integration.js (todas) podrá usar GarperLuxCartDrawer sin que
  // toquemos el HTML.
  function _ensureCartDrawer() {
    if (window.GarperLuxCartDrawer) return;
    if (document.querySelector('script[data-glx-cart-drawer]')) return;
    const s = document.createElement('script');
    s.src = '/assets/js/cart-drawer.js?v=20260611';
    s.dataset.glxCartDrawer = '1';
    s.async = true;
    document.head.appendChild(s);
  }
  function _ensureCartModule() {
    if (window.GarperLuxCart) return;
    if (document.querySelector('script[data-glx-cart]')) return;
    const s = document.createElement('script');
    s.src = '/assets/js/cart.js?v=20260611';
    s.dataset.glxCart = '1';
    // No-async: necesitamos que esté listo antes de procesar clicks.
    document.head.appendChild(s);
  }
  function _ensureCartRecos() {
    if (window.GarperLuxCartRecos) return;
    if (document.querySelector('script[data-glx-cart-recos-loader]')) return;
    // Solo en la página del carrito tiene sentido cargarlo.
    if (page !== '/pages/tienda/carrito.html') return;
    const s = document.createElement('script');
    s.src = '/assets/js/cart-recos.js?v=20260611';
    // OJO: usamos un atributo DIFERENTE al data-glx-cart-recos del marcado
    // (el contenedor en carrito.html lleva ese mismo dataset). Si fueran
    // iguales, querySelector('[data-glx-cart-recos]') matchearía el script
    // en <head> antes que el div del carrito y romperíamos el render.
    s.dataset.glxCartRecosLoader = '1';
    s.async = true;
    document.head.appendChild(s);
  }

  async function boot() {
    _ensureCartModule();
    _ensureCartDrawer();
    _ensureCartRecos();
    bindLogin();
    bindPasswordRecovery();
    if (!publicAuthlessPages.has(page)) {
      await syncSessionToLegacyAuth();
      await refreshCartCount();
    }
    bindGlobalStats();
    bindCatalogActions();
    bindCheckout();
    bindConfirmationPages();
    await bindTrackingPages();
    bindServiceRequest();
    bindQuoteForms();
    bindAccountForms();
    bindCommerceForms();
    bindSupportForms();
    await window.glxRefreshSidebarCounts?.();
    await bindSearchPage();
    await bindCatalogPages().catch((error) => toast(error.message));
    await bindProductPage();
    await bindCartPage();
    await bindAccountPages();
    await bindAdminDashboard();
  }

  document.addEventListener('garperlux:components-ready', () => {
    // Hidrata el badge del header incluso si el usuario es invitado: la
    // verdad sale de localStorage / GarperLuxCart, no del server.
    if (window.GarperLuxCart) window.GarperLuxCart.refreshBadges();
    else addCartBadge(Number(localStorage.getItem('garperlux_cart_count') || 0));
    if (publicAuthlessPages.has(page)) return;
    syncLegacySessionToApi().finally(() => window.glxRefreshSidebarCounts?.());
    syncSessionToLegacyAuth().finally(() => window.glxRefreshSidebarCounts?.());
    refreshCartCount();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
