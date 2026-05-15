/* GarperLux — filtros de catálogo y selector de producto. */

(function () {
  'use strict';

  const normalise = (value) => (value || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  const toast = (message) => {
    if (window.glxToast) window.glxToast(message);
    else console.info(message);
  };

  const moneyToNumber = (text) => {
    const match = (text || '').match(/(\d+(?:[.,]\d{1,2})?)\s*€/);
    return match ? Number(match[1].replace(',', '.')) : 0;
  };

  const visibleText = (element) => normalise(element?.textContent || '');

  const getControlLabel = (control) => {
    if (control.matches('.swatch, .var-sw')) return control.getAttribute('aria-label') || '';
    const label = control.closest('label');
    if (label) return label.childNodes[1]?.textContent || label.textContent || '';
    return control.textContent || control.value || control.getAttribute('aria-label') || '';
  };

  const getItemPool = () => {
    const selectors = [
      '.card-prod',
      '.card-tut',
      '.res-pane > .space-y-3 > a',
      '.res-pane > .grid > a',
      'main article',
    ];
    const items = [...document.querySelectorAll(selectors.join(','))]
      .filter((item) => !item.closest('[data-search-overlay], [data-nav-panel], header, footer'));
    return [...new Set(items)];
  };

  const getFacetName = (control) => {
    const details = control.closest('details');
    const summary = details?.querySelector('summary span');
    if (summary) return normalise(summary.textContent);
    const block = control.closest('aside > div, section');
    const title = block?.querySelector('.eyebrow, h2, h3');
    return normalise(title?.textContent || 'general');
  };

  const getActiveGroups = () => {
    const groups = new Map();
    const add = (group, term) => {
      const key = normalise(group || 'general');
      const value = normalise(term);
      if (!value) return;
      if (!groups.has(key)) groups.set(key, []);
      if (!groups.get(key).includes(value)) groups.get(key).push(value);
    };

    document.querySelectorAll('.filter-check input:checked, aside input[type="checkbox"]:checked').forEach((input) => {
      add(getFacetName(input), getControlLabel(input));
    });
    document.querySelectorAll('.swatch.is-active').forEach((swatch) => {
      add(getFacetName(swatch), getControlLabel(swatch));
    });
    document.querySelectorAll('main aside button, main section button').forEach((button) => {
      const text = normalise(button.textContent);
      const isChip = button.className.includes('font-mono') && /\d+\s*a/.test(text);
      if (isChip && button.className.includes('bg-ink')) add(getFacetName(button), button.textContent);
    });
    return [...groups.entries()].map(([name, terms]) => ({ name, terms }));
  };

  const flattenGroups = (groups) => groups.flatMap((group) => group.terms);

  const getQuery = () => {
    const search = [...document.querySelectorAll('main input[type="search"]')]
      .find((input) => !input.closest('[data-search-overlay]'));
    return normalise(search?.value || new URLSearchParams(location.search).get('q') || '');
  };

  const termMatches = (text, item, term) => {
    if (['solo en stock', 'envio en 24 h', 'recogida en almacen'].includes(term)) {
      return /\d+\s*(uds|m)\b|stock|en stock/.test(text);
    }
    if (term === 'con tutorial') return text.includes('tutorial') || item.matches('.card-tut');
    if (term === 'tarifa pro disp') return text.includes('pro') || text.includes('tarifa');
    return text.includes(term);
  };

  const itemMatches = (item, groups, query) => {
    const text = visibleText(item);
    if (query && !text.includes(query)) return false;
    return groups.every((group) => group.terms.some((term) => termMatches(text, item, term)));
  };

  const updateCount = (visible, total) => {
    const counters = [...document.querySelectorAll('main .font-mono, main h2 span')]
      .filter((node) => /resultados?|—\s*\d+/.test(node.textContent));
    counters.slice(0, 3).forEach((node) => {
      if (/mostrando/i.test(node.textContent)) {
        node.innerHTML = `Mostrando <span class="text-ink font-medium">${visible}</span> de <span class="text-ink font-medium">${total}</span> resultados`;
      } else {
        node.textContent = node.textContent.replace(/—\s*\d+\s*resultados?/i, `— ${visible} resultados`);
      }
    });
  };

  const updateActiveFilterPills = (terms) => {
    const activeBlock = [...document.querySelectorAll('main aside div')]
      .find((node) => normalise(node.textContent).includes('filtros activos'));
    const holder = activeBlock?.querySelector('.flex.flex-wrap');
    if (!holder) return;
    holder.innerHTML = terms.length
      ? terms.map((term) => `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-ink text-paper text-xs rounded-full">${term}<button type="button" data-clear-filter="${term}" class="hover:text-warn">×</button></span>`).join('')
      : '<span class="text-xs text-graphite">Sin filtros activos</span>';
  };

  const applyFilters = () => {
    // Si backend-integration.js gestiona el catálogo dinámicamente,
    // no peleamos con él — su sistema es completo (subcategorías, filtros,
    // sort, paginación). Sólo gestiona pills y limpieza de filtros UI.
    if (window._GLX_DYNAMIC_CATALOG) return;
    const items = getItemPool();
    if (!items.length) return;
    const groups = getActiveGroups();
    const terms = flattenGroups(groups);
    const query = getQuery();
    let visible = 0;

    items.forEach((item) => {
      const matches = itemMatches(item, groups, query);
      item.hidden = !matches;
      item.classList.toggle('hidden', !matches);
      if (matches) visible += 1;
    });

    updateCount(visible, items.length);
    updateActiveFilterPills(terms);
  };

  const clearFilters = () => {
    document.querySelectorAll('.filter-check input, aside input[type="checkbox"]').forEach((input) => {
      input.checked = false;
    });
    document.querySelectorAll('.swatch.is-active').forEach((swatch) => swatch.classList.remove('is-active'));
    document.querySelectorAll('main aside button, main section button').forEach((button) => {
      const text = normalise(button.textContent);
      if (button.className.includes('font-mono') && /\d+\s*a/.test(text)) {
        button.classList.remove('bg-ink', 'text-paper');
        button.classList.add('bg-paper-2');
      }
    });
    applyFilters();
  };

  const sortItems = (select) => {
    const grid = [...document.querySelectorAll('.card-prod')]
      .map((card) => card.parentElement)
      .find((parent) => parent?.querySelectorAll('.card-prod').length > 1);
    if (!grid) return;
    const items = [...grid.children].filter((child) => child.matches('.card-prod'));
    const mode = normalise(select.value);
    if (mode.includes('menor')) items.sort((a, b) => moneyToNumber(a.textContent) - moneyToNumber(b.textContent));
    if (mode.includes('mayor')) items.sort((a, b) => moneyToNumber(b.textContent) - moneyToNumber(a.textContent));
    if (mode.includes('novedad')) items.reverse();
    items.forEach((item) => grid.appendChild(item));
    applyFilters();
  };

  function bindFilters() {
    if (!getItemPool().length) return;

    document.addEventListener('change', (event) => {
      if (event.target.matches('.filter-check input, aside input[type="checkbox"], main input[type="search"]')) {
        applyFilters();
      }
      if (event.target.matches('select')) sortItems(event.target);
    });

    document.addEventListener('input', (event) => {
      if (event.target.matches('main input[type="search"]')) applyFilters();
    });

    document.addEventListener('click', (event) => {
      const swatch = event.target.closest('.swatch');
      if (swatch && !swatch.matches('.var-sw')) {
        if (window._GLX_DYNAMIC_CATALOG) return;
        event.preventDefault();
        swatch.parentElement?.querySelectorAll('.swatch').forEach((item) => item.classList.remove('is-active'));
        swatch.classList.add('is-active');
        applyFilters();
        return;
      }

      const clear = event.target.closest('button');
      if (clear && normalise(clear.textContent).includes('limpiar')) {
        if (window._GLX_DYNAMIC_CATALOG) return;
        event.preventDefault();
        clearFilters();
        return;
      }

      if (event.target.matches('[data-clear-filter]')) {
        if (window._GLX_DYNAMIC_CATALOG) return;
        event.preventDefault();
        clearFilters();
        return;
      }

      const chip = event.target.closest('main aside button, main section button');
      if (!chip || chip.matches('.swatch, .var-sw, [data-view], [data-tab], [data-nav-toggle], [data-search-close]')) return;
      const text = normalise(chip.textContent);
      if (!/\d+\s*a/.test(text) && !['mas vendidos', 'novedades', 'en oferta', 'por nombre', 'por referencia', 'por codigo de barras'].includes(text)) return;
      if (window._GLX_DYNAMIC_CATALOG) return;
      event.preventDefault();
      chip.parentElement?.querySelectorAll('button').forEach((button) => {
        button.classList.remove('bg-ink', 'text-paper', 'btn-ink');
        if (!button.className.includes('btn')) button.classList.add('bg-paper-2');
      });
      chip.classList.add(chip.className.includes('btn') ? 'btn-ink' : 'bg-ink', 'text-paper');
      if (text === 'novedades' || text === 'en oferta') {
        const grid = chip.closest('section')?.querySelector('.grid');
        if (grid) [...grid.children].reverse().forEach((item) => grid.appendChild(item));
      }
      applyFilters();
    });

    const observer = new MutationObserver(() => {
      window.clearTimeout(observer._glxTimer);
      observer._glxTimer = window.setTimeout(applyFilters, 80);
    });
    [...new Set(getItemPool().map((item) => item.parentElement).filter(Boolean))].forEach((grid) => {
      observer.observe(grid, { childList: true });
    });

    requestAnimationFrame(applyFilters);
  }

  function updateStockPill(pill, stock) {
    // Remove all previous state classes
    pill.classList.remove(
      'pill-stock', 'pill-caution', 'pill-warn',
      'bg-stock', 'bg-warn', 'bg-caution',
      'bg-white', 'border', 'border-line',
      'text-ink', 'text-paper',
      'flex', 'items-center', 'gap-1.5'
    );
    pill.classList.add('inline-flex', 'items-center', 'gap-1', 'px-2', 'py-0.5', 'rounded-full', 'text-[10px]', 'font-medium', 'text-paper');

    let bgClass = 'bg-warn';
    let text = 'Agotado';
    if (stock > 10) {
      bgClass = 'bg-stock';
      text = `${stock} uds`;
    } else if (stock > 0) {
      bgClass = 'bg-caution';
      text = `${stock} uds`;
    }
    pill.classList.add(bgClass);
    pill.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-white/60 shrink-0"></span>${text}`;
  }

  function applyStockToCards(products) {
    document.querySelectorAll('.card-prod').forEach(card => {
      const skuMatch = card.textContent.match(/SKU\s+([A-Z0-9._-]+)/i);
      if (!skuMatch) return;
      const sku = skuMatch[1];
      const product = products.find(p => p.sku === sku);
      if (product == null) return;
      const pill = card.querySelector('.pill');
      if (pill) updateStockPill(pill, product.stock);
    });
  }

  function bindDynamicStock() {
    const api = window.GarperLuxApi;
    if (!api) return;

    // Primary: listen for async catalog render event fired by backend-integration.js
    document.addEventListener('glxCatalogRendered', (e) => {
      const products = e.detail && e.detail.products;
      if (products) applyStockToCards(products);
    });

    // Fallback: update stock on any pre-rendered static pills
    if (document.querySelector('.card-prod .pill')) {
      api.products().then(products => applyStockToCards(products)).catch(() => { });
    }
  }

  const productState = {
    acabado: 'Blanco',
    amperaje: '10 A',
    skuBase: '27101',
    variants: [],
    baseStock: 0,
  };

  const variantSuffix = { blanco: '31', marfil: '32', aluminio: '39' };

  const updateProductSelection = () => {
    const acabado = normalise(productState.acabado);
    const amperaje = normalise(productState.amperaje).replace(/\s+/g, '');
    const suffix = variantSuffix[acabado] || '31';
    const ampCode = amperaje.replace('a', '');
    const matchedVariant = productState.variants.find((variant) => (
      normalise(variant.finish) === acabado && normalise(variant.amps).replace(/\s+/g, '') === amperaje
    ));
    const sku = matchedVariant?.sku || (ampCode === '10' ? `${productState.skuBase}-${suffix}` : `${productState.skuBase}-${suffix}-${ampCode}A`);
    const acabadoLabel = [...document.querySelectorAll('span')]
      .find((node) => normalise(node.parentElement?.textContent || '').startsWith('acabado:'));
    const amperajeLabel = [...document.querySelectorAll('span')]
      .find((node) => normalise(node.parentElement?.textContent || '').startsWith('amperaje:'));
    if (acabadoLabel) acabadoLabel.textContent = productState.acabado;
    if (amperajeLabel) amperajeLabel.textContent = productState.amperaje;
    document.querySelectorAll('button').forEach((button) => {
      if (/añadir|carrito/i.test(button.textContent)) button.dataset.sku = sku;
    });

    const stockToDisplay = matchedVariant ? matchedVariant.stock : productState.baseStock;
    document.querySelectorAll('*').forEach((node) => {
      if (!node.children.length && /en stock|unidades|uds/i.test(node.textContent || '')) {
        if (/● Total/i.test(node.textContent)) {
          node.textContent = `● Total: ${stockToDisplay} uds`;
        } else if (/En stock/i.test(node.textContent) && /unidades/i.test(node.textContent)) {
          node.textContent = `En stock · ${stockToDisplay} unidades`;
        } else if (node.textContent.includes('70 unidades')) {
          node.textContent = node.textContent.replace('70 unidades', `${stockToDisplay} unidades`);
        } else if (node.textContent.includes('70 uds')) {
          node.textContent = node.textContent.replace('70 uds', `${stockToDisplay} uds`);
        }
      }
    });

    document.querySelectorAll('*').forEach((node) => {
      if (node.children.length || !/SKU\s+[A-Z0-9._-]+/i.test(node.textContent)) return;
      node.textContent = node.textContent.replace(/SKU\s+[A-Z0-9._-]+/i, `SKU ${sku}`);
    });
  };

  function addProductToLocalCart(button) {
    const quantity = Math.max(1, Number(document.querySelector('input[type="number"]')?.value || 1));
    const sku = button.dataset.sku || '27101-31-10';
    const title = document.querySelector('h1')?.textContent?.trim() || 'Producto GarperLux';
    const priceMatch = (document.querySelector('[data-glx-price]')?.textContent || document.querySelector('.font-serif')?.textContent || '').match(/(\d+[.,]\d+)\s*€/);
    const price = priceMatch ? Number(priceMatch[1].replace(',', '.')) : 0;
    const image = document.querySelector('[data-glx-main-image] img')?.src;
    const brand = document.querySelector('[data-glx-brand-link]')?.textContent?.trim();

    // Read the product stock from the page to prevent exceeding it
    const stockText = document.getElementById('stock-qty')?.textContent || '';
    const stockMatch = stockText.match(/(\d+)\s*(?:unidades|uds)/i);
    const maxStock = stockMatch ? parseInt(stockMatch[1], 10) : null;

    // Único punto de escritura: el módulo `GarperLuxCart` ya replica al
    // servidor si hay sesión y dispara los eventos para refrescar todas
    // las vistas (drawer, header badge, carrito.html...).
    if (window.GarperLuxCart) {
      const result = window.GarperLuxCart.addItem({
        sku, title, price, image, brand,
        options: { acabado: productState.acabado, amperaje: productState.amperaje },
      }, quantity, maxStock);

      if (result?.capped) {
        toast(`Stock limitado: ya tienes ${result.finalQty} uds en la cesta (máximo ${maxStock}).`);
        return;
      }
    }

    if (window.GarperLuxCartDrawer && window.GarperLuxApi) {
      window.GarperLuxApi.product(sku).then((product) => {
        const info = product || { sku, name: title, price, image, brand: { name: brand || '—' } };
        window.GarperLuxCartDrawer.open(info, quantity);
      }).catch(() => window.GarperLuxCartDrawer.open({ sku, name: title, price, image, brand: { name: brand } }, quantity));
    } else {
      toast(`${quantity} ud. añadida al carrito.`);
    }
  }

  function bindProductOptions() {
    if (!document.querySelector('.var-sw')) return;
    document.addEventListener('click', (event) => {
      const variant = event.target.closest('.var-sw');
      if (variant) {
        event.preventDefault();
        variant.parentElement?.querySelectorAll('.var-sw').forEach((item) => item.classList.remove('is-active'));
        variant.classList.add('is-active');
        productState.acabado = variant.getAttribute('aria-label') || productState.acabado;
        updateProductSelection();
        return;
      }

      const ampButton = event.target.closest('button');
      if (ampButton && /^(\d+)\s*A$/i.test(ampButton.textContent.trim())) {
        event.preventDefault();
        ampButton.parentElement?.querySelectorAll('button').forEach((button) => {
          button.classList.remove('bg-ink', 'text-paper');
          button.classList.add('bg-paper-2');
        });
        ampButton.classList.add('bg-ink', 'text-paper');
        ampButton.classList.remove('bg-paper-2');
        productState.amperaje = ampButton.textContent.trim().replace(/\s*a$/i, ' A');
        updateProductSelection();
        return;
      }

      const addButton = event.target.closest('button');
      if (addButton && /añadir\s+al\s+carrito/i.test(addButton.textContent)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        addProductToLocalCart(addButton);
      }
    }, true);

    const api = window.GarperLuxApi;
    if (api) {
      const currentSku = new URLSearchParams(location.search).get('sku') || '27101-31';
      api.product(currentSku).then((product) => {
        if (product) productState.baseStock = product.stock;
        if (Array.isArray(product?.variants)) productState.variants = product.variants;
        updateProductSelection();
      }).catch(() => updateProductSelection());
    } else {
      updateProductSelection();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindFilters();
    bindProductOptions();
    bindDynamicStock();
  });
})();
