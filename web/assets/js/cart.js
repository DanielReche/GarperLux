/* GarperLux — módulo único del carrito (cliente).
 *
 * UN ÚNICO SOURCE OF TRUTH: localStorage 'garperlux_cart_items'. La cesta
 * funciona idéntica para invitado y para logueado. Si hay sesión, hacemos
 * sync best-effort al backend para tener trazabilidad cross-device, pero
 * la UI siempre lee de localStorage para que no haya divergencias.
 *
 * Forma de un item:
 *   { sku, title, price, quantity, image, brand, addedAt, options? }
 *
 * Eventos: cualquier mutación dispara `garperlux:cart-changed` con detail
 * `{ items, count, total, source }` en `window`. Cualquier vista (drawer,
 * carrito, checkout, header badge) puede engancharse para refrescarse.
 */
(function () {
  'use strict';
  if (window.GarperLuxCart) return;

  const STORAGE_KEY = 'garperlux_cart_items';
  const COUNT_KEY = 'garperlux_cart_count';

  function _safeParse(json, fallback) {
    try { return JSON.parse(json) ?? fallback; } catch { return fallback; }
  }

  function _readRaw() {
    return _safeParse(localStorage.getItem(STORAGE_KEY), []);
  }
  function _writeRaw(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    const count = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    localStorage.setItem(COUNT_KEY, String(count));
    document.querySelectorAll('[data-cart-count]').forEach((n) => { n.textContent = count; });
    window.dispatchEvent(new CustomEvent('garperlux:cart-changed', {
      detail: { items, count, total: _total(items), source: 'local' },
    }));
  }

  function _total(items) {
    return items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0);
  }

  function getItems()   { return _readRaw(); }
  function getCount()   { return getItems().reduce((s, i) => s + (Number(i.quantity) || 0), 0); }
  function getTotal()   { return _total(getItems()); }

  // Sync best-effort al backend (cuando hay sesión iniciada). No bloquea
  // nunca la UI; si falla, no hay drama porque localStorage es la verdad.
  async function _syncToServer(action, sku, qty) {
    const api = window.GarperLuxApi;
    if (!api || !api.getToken()) return;
    try {
      if (action === 'add') await api.addToCart(sku, qty);
      else if (action === 'set') {
        // El backend no tiene un endpoint setQty atómico; emulamos
        // borrando y volviendo a añadir.
        await api.deleteCartItem(sku).catch(() => null);
        if (qty > 0) await api.addToCart(sku, qty);
      } else if (action === 'remove') {
        await api.deleteCartItem(sku);
      } else if (action === 'clear') {
        // No hay endpoint clear; lo dejamos. Si el usuario inicia sesión
        // verá el carrito anterior en server, pero la UI lo ignora porque
        // siempre lee local.
      }
    } catch { /* best-effort */ }
  }

  function addItem(product, qty = 1, maxStock = null) {
    if (!product?.sku) return { capped: false, finalQty: 0 };
    const items = _readRaw();
    const existing = items.find((i) => i.sku === product.sku);
    const currentQty = existing ? (Number(existing.quantity) || 0) : 0;
    let newTotal = currentQty + qty;
    let capped = false;

    // If stock limit is known, cap at it
    if (maxStock != null && maxStock >= 0 && newTotal > maxStock) {
      newTotal = maxStock;
      capped = true;
    }

    if (newTotal <= 0) {
      return { capped: true, finalQty: currentQty };
    }

    if (existing) {
      existing.quantity = newTotal;
    } else {
      items.push({
        sku: product.sku,
        title: product.title || product.name || product.sku,
        price: Number(product.price) || 0,
        quantity: newTotal,
        image: product.image || null,
        brand: (product.brand && (product.brand.name || product.brand)) || null,
        options: product.options || null,
        addedAt: new Date().toISOString(),
      });
    }
    _writeRaw(items);
    const addedQty = newTotal - currentQty;
    if (addedQty > 0) _syncToServer('add', product.sku, addedQty);
    return { capped, finalQty: newTotal };
  }

  function setQty(sku, qty) {
    qty = Math.max(0, Number(qty) || 0);
    let items = _readRaw();
    const existing = items.find((i) => i.sku === sku);
    if (!existing) return;
    if (qty === 0) items = items.filter((i) => i.sku !== sku);
    else existing.quantity = qty;
    _writeRaw(items);
    _syncToServer('set', sku, qty);
  }

  function removeItem(sku) {
    const items = _readRaw().filter((i) => i.sku !== sku);
    _writeRaw(items);
    _syncToServer('remove', sku, 0);
  }

  function clear() {
    _writeRaw([]);
    _syncToServer('clear');
  }

  // En el caso de que un item del carrito local esté “light” (sin precio,
  // imagen o título), enriquecer con los datos del backend. Útil cuando el
  // usuario añadió desde una tarjeta sin meta completa.
  async function enrichItems() {
    const api = window.GarperLuxApi;
    if (!api) return getItems();
    const items = _readRaw();
    let dirty = false;
    for (const it of items) {
      if (it.price && it.title && it.image) continue;
      try {
        const p = await api.product(it.sku);
        if (p) {
          if (!it.title) it.title = p.name;
          if (!it.price) it.price = p.price;
          if (!it.image) it.image = p.image;
          if (!it.brand)  it.brand = p.brand?.name;
          dirty = true;
        }
      } catch { /* ignore */ }
    }
    if (dirty) _writeRaw(items);
    return _readRaw();
  }

  // Sincroniza al iniciar sesión: si el server tiene un cart anterior y
  // local está vacío, lo importa. Si local tiene items y server vacío,
  // los empuja al server. Si ambos tienen, gana local (es la última acción
  // del usuario en este dispositivo).
  async function syncOnLogin() {
    const api = window.GarperLuxApi;
    if (!api || !api.getToken()) return;
    const local = _readRaw();
    if (local.length > 0) {
      for (const it of local) {
        try { await api.addToCart(it.sku, it.quantity); } catch { /* ignore */ }
      }
      return;
    }
    try {
      const cart = await api.cart();
      if (cart?.items?.length) {
        const items = cart.items.map((it) => ({
          sku: it.sku,
          title: it.title || it.name || it.sku,
          price: Number(it.price) || 0,
          quantity: Number(it.quantity) || 1,
          image: it.image || null,
          brand: it.brand || null,
        }));
        _writeRaw(items);
      }
    } catch { /* ignore */ }
  }

  // Helper para badges del header en cualquier momento.
  function refreshBadges() {
    const count = getCount();
    document.querySelectorAll('[data-cart-count]').forEach((n) => { n.textContent = count; });
  }

  window.GarperLuxCart = {
    getItems, getCount, getTotal,
    addItem, setQty, removeItem, clear,
    enrichItems, syncOnLogin, refreshBadges,
  };

  // Refresco del badge en TODOS los momentos en los que el DOM puede tener
  // un cart-icon nuevo o stale:
  //   - DOMContentLoaded: al renderizarse la página, si los slots ya están
  //     rellenos por scripts inline (rare).
  //   - garperlux:components-ready: cuando component-loader inyecta el
  //     site-header (caso normal — el badge "0" del template se sustituye).
  //   - garperlux:cart-changed: ya disparado por nuestras propias mutaciones.
  //   - storage: si el usuario abre dos pestañas, mantener sincronía.
  //   - pageshow: con bfcache (atrás/adelante del navegador) el DOM
  //     reaparece tal y como se dejó, así que volvemos a poner la cuenta.
  //   - focus: al volver a la pestaña, asegúrate de que está al día.
  function _hookRefreshes() {
    refreshBadges();
    document.addEventListener('garperlux:components-ready', refreshBadges);
    window.addEventListener('storage', (e) => {
      if (!e.key || e.key === STORAGE_KEY || e.key === COUNT_KEY) refreshBadges();
    });
    window.addEventListener('pageshow', refreshBadges);
    window.addEventListener('focus', refreshBadges);
  }
  if (document.readyState !== 'loading') _hookRefreshes();
  else document.addEventListener('DOMContentLoaded', _hookRefreshes);
})();
