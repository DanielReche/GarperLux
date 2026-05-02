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
        at: Date.now(),
      }));
      document.querySelectorAll('[data-current-name]').forEach((el) => { el.textContent = user.fullName; });
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
    document.querySelectorAll('a[href="/pages/tienda/carrito.html"]').forEach((link) => {
      if (link.querySelector('[data-cart-count]')) return;
      link.classList.add('relative');
      const badge = document.createElement('span');
      badge.dataset.cartCount = '';
      badge.className = 'absolute -top-0.5 -right-0.5 bg-filament text-ink text-[10px] font-semibold rounded-full w-[18px] h-[18px] flex items-center justify-center';
      badge.textContent = count;
      link.appendChild(badge);
    });
  };

  async function refreshCartCount() {
    if (!api.getToken()) return;
    try {
      const cart = await api.cart();
      addCartBadge(cart.items.reduce((sum, item) => sum + item.quantity, 0));
      // update header summary and aside totals
      document.querySelectorAll('[data-cart-summary]').forEach((el) => {
        el.textContent = `${cart.items.length} productos · listo para tramitar`;
      });
      document.querySelectorAll('[data-cart-items]').forEach((el) => el.dataset.rendered = '1');
      // update summary block if present
      document.querySelectorAll('[data-cart-subtotal]').forEach((el) => { el.textContent = money(cart.subtotal); });
      document.querySelectorAll('[data-cart-total]').forEach((el) => { el.textContent = money(cart.total); });
    } catch {
      addCartBadge(Number(localStorage.getItem('garperlux_cart_count') || 0));
    }
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
    return `
  <a href="/pages/tienda/producto.html?sku=${encodeURIComponent(product.sku)}" class="card-prod group" data-sku="${product.sku}">
      <div class="aspect-square bg-paper-2 rounded-xl mb-4 flex items-center justify-center relative overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-br from-white/50 to-transparent"></div>
        <span class="relative font-serif text-4xl text-graphite/20">GL</span>
        <span class="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-paper ${stockColor}"><span class="w-1.5 h-1.5 rounded-full bg-white/60 shrink-0"></span>${stockText}</span>
      </div>
      <div class="space-y-2">
        <div class="font-mono text-[11px] text-graphite/70">SKU ${product.sku}</div>
        <h3 class="font-medium leading-tight group-hover:text-copper transition-colors">${product.name}</h3>
        <div class="flex items-end justify-between">
          <div><span class="font-serif text-xl font-medium">${money(product.price)}</span></div>
          <button type="button" data-add-cart data-sku="${product.sku}" class="w-9 h-9 rounded-full bg-ink text-paper grid place-items-center group-hover:bg-filament group-hover:text-ink transition-colors" aria-label="Añadir">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
      </div>
    </a>`;
  };

  function bindCatalogActions() {
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-add-cart], button[aria-label="Añadir"], .card-prod button');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const sku = button.dataset.sku || findSku(button);
      const qty = 1;
      if (!api.getToken()) {
        // anonymous: store in localStorage
        const items = JSON.parse(localStorage.getItem('garperlux_cart_items') || '[]');
        const existing = items.find((i) => i.sku === sku);
        if (existing) existing.quantity = (existing.quantity || 0) + qty;
        else items.push({ sku, quantity: qty, title: button.closest('.card-prod')?.querySelector('h3')?.textContent?.trim() || null });
        localStorage.setItem('garperlux_cart_items', JSON.stringify(items));
        const total = items.reduce((s, it) => s + (it.quantity || 0), 0);
        localStorage.setItem('garperlux_cart_count', String(total));
        addCartBadge(total);
        toast('Producto añadido al carrito (local).');
        // if on cart page, refresh
        if (page === '/pages/tienda/carrito.html') location.reload();
        return;
      }

      try {
        const cart = await api.addToCart(sku, qty);
        addCartBadge(cart.items.reduce((sum, item) => sum + item.quantity, 0));
        toast('Producto añadido al carrito.');
        if (page === '/pages/tienda/carrito.html') location.reload();
      } catch (error) {
        toast(error.message);
      }
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

  async function bindCatalogPages() {
    if (!['/pages/tienda/tienda.html', '/pages/tienda/categoria.html'].includes(page)) return;
    const products = await api.products(page === '/pages/tienda/categoria.html' ? { category: 'mecanismos' } : {});
    const grids = [...document.querySelectorAll('.card-prod')].map((card) => card.parentElement).filter(Boolean);
    const grid = grids.find((candidate) => candidate.querySelectorAll('.card-prod').length >= 4);
    if (grid) {
      grid.innerHTML = products.slice(0, page === '/pages/tienda/categoria.html' ? 12 : 8).map(renderProductCard).join('');
      // Notify catalog-ui.js that the grid has been re-rendered with real data
      document.dispatchEvent(new CustomEvent('glxCatalogRendered', { detail: { products } }));
    }
  }

  const SHIPPING_COST = 4.9;

  const updateCartTotals = (items) => {
    const subtotal = items.reduce((s, i) => s + ((i.price || 0) * (i.quantity || 0)), 0);
    const tax = subtotal * 0.21;
    const total = subtotal + tax + SHIPPING_COST;
    document.querySelectorAll('[data-cart-item-count]').forEach((el) => { el.textContent = items.length; });
    document.querySelectorAll('[data-cart-subtotal]').forEach((el) => { el.textContent = money(subtotal); });
    document.querySelectorAll('[data-cart-tax]').forEach((el) => { el.textContent = money(tax); });
    document.querySelectorAll('[data-cart-total]').forEach((el) => { el.textContent = money(total); });
  };

  async function bindCartPage() {
    if (page !== '/pages/tienda/carrito.html') return;
    const cartContainer = document.querySelector('[data-cart-items]');
    if (!cartContainer) return;

    console.log('[CART DEBUG] Container found:', !!cartContainer);
    console.log('[CART DEBUG] LocalStorage items:', localStorage.getItem('garperlux_cart_items'));
    console.log('[CART DEBUG] Token:', api.getToken());

    // If user not logged, render localStorage cart fallback
    if (!requireSession()) {
      try {
        const local = JSON.parse(localStorage.getItem('garperlux_cart_items') || '[]');
        console.log('[CART DEBUG] Local items to process:', local.length);
        if (local.length) {
          // Load product details from API
          const itemsWithDetails = await Promise.all(
            local.map(async (item) => {
              try {
                const product = await api.product(item.sku);
                console.log(`[CART DEBUG] Loaded product ${item.sku}:`, product.name, product.price);
                return { ...item, name: product.name, price: product.price, stock: product.stock };
              } catch (err) {
                console.error(`[CART DEBUG] Failed to load ${item.sku}:`, err.message);
                return item;
              }
            })
          );
          console.log('[CART DEBUG] Items with details:', itemsWithDetails);
          cartContainer.innerHTML = itemsWithDetails.map((item) => `
            <div class="p-5 sm:p-6 grid grid-cols-[80px_1fr] sm:grid-cols-[100px_1fr_auto] gap-5 border-b border-line last:border-0" data-sku="${item.sku}">
              <div class="aspect-square bg-paper-2 rounded-lg grid place-items-center text-graphite/40">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
              </div>
              <div class="col-span-1 sm:col-auto">
                <div class="text-[11px] font-mono text-graphite uppercase tracking-wider mb-1">${item.sku}</div>
                <h3 class="font-medium leading-snug mb-1">${item.name || item.title || 'Producto'}</h3>
                <div class="font-mono text-[11px] text-graphite mb-2">SKU ${item.sku}</div>
                <div class="flex items-center gap-3 flex-wrap">
                  <div class="flex items-center bg-paper-2 rounded-full overflow-hidden">
                    <button class="w-8 h-8 grid place-items-center hover:bg-paper-3 text-sm" data-qty-minus="${item.sku}" aria-label="-">−</button>
                    <input type="number" value="${item.quantity}" class="w-10 text-center bg-transparent font-mono text-sm font-medium outline-none" data-qty-input="${item.sku}" min="1"/>
                    <button class="w-8 h-8 grid place-items-center hover:bg-paper-3 text-sm" data-qty-plus="${item.sku}" aria-label="+">+</button>
                  </div>
                  <button class="text-xs text-graphite hover:text-warn" data-local-delete="${item.sku}">Eliminar</button>
                  <button class="text-xs text-graphite hover:text-ink">Mover a favoritos</button>
                </div>
              </div>
              <div class="col-span-2 sm:col-auto sm:text-right flex items-center justify-between sm:flex-col sm:items-end sm:justify-start gap-2">
                <span class="font-serif text-xl font-medium">${money((item.price || 0) * item.quantity)}</span>
                <span class="pill pill-stock text-[10px]">${item.stock || 0} uds</span>
              </div>
            </div>`).join('');
        } else {
          cartContainer.innerHTML = '<div class="bg-white border border-line rounded-2xl p-8 text-center">Tu carrito está vacío.</div>';
        }
        const totalQty = local.reduce((s, it) => s + (it.quantity || 0), 0);
        addCartBadge(totalQty);
        document.querySelectorAll('[data-cart-summary]').forEach((el) => {
          el.textContent = `${local.length} productos · listo para tramitar`;
        });
        updateCartTotals(itemsWithDetails);
      } catch (err) { console.error('[CART DEBUG] Error:', err); }

      // delegate local quantity and delete
      document.addEventListener('click', (ev) => {
        const delBtn = ev.target.closest('[data-local-delete]');
        if (delBtn) {
          ev.preventDefault();
          const sku = delBtn.getAttribute('data-local-delete');
          const carts = JSON.parse(localStorage.getItem('garperlux_cart_items') || '[]');
          const filtered = carts.filter((i) => i.sku !== sku);
          localStorage.setItem('garperlux_cart_items', JSON.stringify(filtered));
          localStorage.setItem('garperlux_cart_count', String(filtered.reduce((s, it) => s + (it.quantity||0), 0)));
          toast('Artículo eliminado del carrito (local).');
          location.reload();
          return;
        }

        const qtyPlus = ev.target.closest('[data-qty-plus]');
        if (qtyPlus) {
          ev.preventDefault();
          const sku = qtyPlus.getAttribute('data-qty-plus');
          const input = document.querySelector(`[data-qty-input="${sku}"]`);
          if (input) {
            input.value = Math.max(1, Number(input.value) + 1);
            updateLocalCartQuantity(sku, Number(input.value));
          }
          return;
        }

        const qtyMinus = ev.target.closest('[data-qty-minus]');
        if (qtyMinus) {
          ev.preventDefault();
          const sku = qtyMinus.getAttribute('data-qty-minus');
          const input = document.querySelector(`[data-qty-input="${sku}"]`);
          if (input) {
            input.value = Math.max(1, Number(input.value) - 1);
            updateLocalCartQuantity(sku, Number(input.value));
          }
          return;
        }

        // Mover a favoritos (por ahora solo toast)
        const favBtn = [...document.querySelectorAll('button')].find(b => 
          b.contains(ev.target) && b.textContent.includes('Mover a favoritos')
        );
        if (favBtn && ev.target === favBtn) {
          ev.preventDefault();
          toast('Función de favoritos en desarrollo.');
          return;
        }
      });

      // Actualizar cantidad cuando se edita el input directamente
      document.addEventListener('change', (ev) => {
        const input = ev.target.closest('[data-qty-input]');
        if (!input) return;
        const sku = input.getAttribute('data-qty-input');
        const qty = Math.max(1, Number(input.value));
        input.value = qty;
        updateLocalCartQuantity(sku, qty);
      });

      const updateLocalCartQuantity = (sku, newQty) => {
        const carts = JSON.parse(localStorage.getItem('garperlux_cart_items') || '[]');
        const item = carts.find((i) => i.sku === sku);
        if (item) {
          item.quantity = newQty;
          localStorage.setItem('garperlux_cart_items', JSON.stringify(carts));
          localStorage.setItem('garperlux_cart_count', String(carts.reduce((s, it) => s + (it.quantity||0), 0)));
          
          // Actualizar el precio visible
          const article = document.querySelector(`[data-sku="${sku}"]`);
          if (article) {
            const priceEl = article.querySelector('.font-serif.text-xl');
            if (priceEl && item.price) {
              priceEl.textContent = money(item.price * newQty);
            }
          }
          
          // Actualizar totales del carrito
          const local = JSON.parse(localStorage.getItem('garperlux_cart_items') || '[]');
          updateCartTotals(local);
          addCartBadge(carts.reduce((s, it) => s + it.quantity, 0));
        }
      };

      return;
    }

    try {
      const cart = await api.cart();
      console.log('[CART DEBUG] Server cart:', cart);

      // Si el servidor está vacío pero hay items en localStorage, migrarlos
      const localItems = JSON.parse(localStorage.getItem('garperlux_cart_items') || '[]');
      console.log('[CART DEBUG] Local items for migration:', localItems.length);
      if (!cart.items.length && localItems.length) {
        console.log('[CART DEBUG] Migrating local cart to server...');
        for (const item of localItems) {
          try {
            await api.addToCart(item.sku, item.quantity);
            console.log(`[CART DEBUG] Migrated ${item.sku} (qty: ${item.quantity})`);
          } catch (err) {
            console.error(`[CART DEBUG] Failed to migrate ${item.sku}:`, err.message);
          }
        }
        // Recargar carrito desde servidor
        const updatedCart = await api.cart();
        cart.items = updatedCart.items;
        cart.subtotal = updatedCart.subtotal;
        cart.tax = updatedCart.tax;
        cart.total = updatedCart.total;
        console.log('[CART DEBUG] Cart after migration:', cart);
        // Limpiar localStorage
        localStorage.removeItem('garperlux_cart_items');
      }

      if (cart.items.length) {
        cartContainer.innerHTML = cart.items.map((item) => `
          <div class="p-5 sm:p-6 grid grid-cols-[80px_1fr] sm:grid-cols-[100px_1fr_auto] gap-5 border-b border-line last:border-0" data-sku="${item.sku}">
            <div class="aspect-square bg-paper-2 rounded-lg grid place-items-center text-graphite/40">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
            </div>
            <div class="col-span-1 sm:col-auto">
              <div class="text-[11px] font-mono text-graphite uppercase tracking-wider mb-1">${item.sku}</div>
              <h3 class="font-medium leading-snug mb-1">${item.name}</h3>
              <div class="font-mono text-[11px] text-graphite mb-2">SKU ${item.sku}</div>
              <div class="flex items-center gap-3 flex-wrap">
                <div class="flex items-center bg-paper-2 rounded-full overflow-hidden">
                  <button class="w-8 h-8 grid place-items-center hover:bg-paper-3 text-sm" data-qty-minus="${item.sku}" aria-label="-">−</button>
                  <input type="number" value="${item.quantity}" class="w-10 text-center bg-transparent font-mono text-sm font-medium outline-none" data-qty-input="${item.sku}" min="1"/>
                  <button class="w-8 h-8 grid place-items-center hover:bg-paper-3 text-sm" data-qty-plus="${item.sku}" aria-label="+">+</button>
                </div>
                <button class="text-xs text-graphite hover:text-warn" data-delete-sku="${item.sku}">Eliminar</button>
                <button class="text-xs text-graphite hover:text-ink">Mover a favoritos</button>
              </div>
            </div>
            <div class="col-span-2 sm:col-auto sm:text-right flex items-center justify-between sm:flex-col sm:items-end sm:justify-start gap-2">
              <span class="font-serif text-xl font-medium">${money(item.price * item.quantity)}</span>
              <span class="pill pill-stock text-[10px]">${item.stock || 0} uds</span>
            </div>
          </div>`).join('');
      } else {
        cartContainer.innerHTML = '<div class="bg-white border border-line rounded-2xl p-8 text-center">Tu carrito está vacío.</div>';
      }
      addCartBadge(cart.items.reduce((sum, item) => sum + item.quantity, 0));
      document.querySelectorAll('[data-cart-summary]').forEach((el) => {
        el.textContent = `${cart.items.length} productos · listo para tramitar`;
      });
      updateCartTotals(cart.items);

      // delegate quantity, delete, and favorites for logged users
      document.addEventListener('click', async (ev) => {
        const delBtn = ev.target.closest('[data-delete-sku]');
        if (delBtn) {
          ev.preventDefault();
          const sku = delBtn.getAttribute('data-delete-sku');
          try {
            await api.deleteCartItem(sku);
            toast('Artículo eliminado del carrito.');
            const cart2 = await api.cart();
            addCartBadge(cart2.items.reduce((s, it) => s + it.quantity, 0));
            location.reload();
          } catch (err) {
            toast(err.message || 'No se pudo eliminar el artículo.');
          }
          return;
        }

        const qtyPlus = ev.target.closest('[data-qty-plus]');
        if (qtyPlus) {
          ev.preventDefault();
          const sku = qtyPlus.getAttribute('data-qty-plus');
          const input = document.querySelector(`[data-qty-input="${sku}"]`);
          if (input) {
            input.value = Math.max(1, Number(input.value) + 1);
            updateServerCartQuantity(sku, Number(input.value));
          }
          return;
        }

        const qtyMinus = ev.target.closest('[data-qty-minus]');
        if (qtyMinus) {
          ev.preventDefault();
          const sku = qtyMinus.getAttribute('data-qty-minus');
          const input = document.querySelector(`[data-qty-input="${sku}"]`);
          if (input) {
            input.value = Math.max(1, Number(input.value) - 1);
            updateServerCartQuantity(sku, Number(input.value));
          }
          return;
        }

        // Mover a favoritos (por ahora solo toast)
        const favBtn = [...document.querySelectorAll('button')].find(b => 
          b.contains(ev.target) && b.textContent.includes('Mover a favoritos')
        );
        if (favBtn && ev.target === favBtn) {
          ev.preventDefault();
          toast('Función de favoritos en desarrollo.');
          return;
        }
      });

      // Actualizar cantidad cuando se edita el input directamente
      document.addEventListener('change', (ev) => {
        const input = ev.target.closest('[data-qty-input]');
        if (!input) return;
        const sku = input.getAttribute('data-qty-input');
        const qty = Math.max(1, Number(input.value));
        input.value = qty;
        updateServerCartQuantity(sku, qty);
      });

      const updateServerCartQuantity = async (sku, newQty) => {
        try {
          const currentCart = await api.cart();
          const item = currentCart.items.find((i) => i.sku === sku);
          if (!item) return;
          
          const oldQty = item.quantity;
          const diffQty = newQty - oldQty;
          
          // Si es diferente, actualizar en el servidor
          if (diffQty !== 0) {
            await api.addToCart(sku, diffQty);
            const updatedCart = await api.cart();
            
            // Actualizar el precio visible
            const article = document.querySelector(`[data-sku="${sku}"]`);
            if (article) {
              const priceEl = article.querySelector('.font-serif.text-xl');
              const updatedItem = updatedCart.items.find((i) => i.sku === sku);
              if (priceEl && updatedItem) {
                priceEl.textContent = money(updatedItem.price * updatedItem.quantity);
              }
            }
            
            // Actualizar totales
            updateCartTotals(updatedCart.items);
            addCartBadge(updatedCart.items.reduce((s, it) => s + it.quantity, 0));
          }
        } catch (err) {
          console.error('[CART DEBUG] Error updating quantity:', err.message);
          toast('Error al actualizar cantidad: ' + err.message);
        }
      };
    } catch (error) {
      toast(error.message);
    }
  }

  async function bindProductPage() {
    if (page !== '/pages/tienda/producto.html') return;
    const sku = new URLSearchParams(location.search).get('sku') || '27101-31';
    try {
      const product = await api.product(sku);
      if (!product) return;
      document.title = `${product.name} · GarperLux`;
      document.querySelector('meta[name="description"]')?.setAttribute('content', product.description || product.name);
      const title = document.querySelector('section h1');
      if (title) title.textContent = product.name;
      const brand = document.querySelector('section a[href="/pages/empresa/marcas.html"]');
      if (brand) brand.textContent = product.brand.name;
      document.querySelectorAll('*').forEach((node) => {
        if (node.children.length) return;
        if (node.textContent.includes('27101-31')) node.textContent = node.textContent.replaceAll('27101-31', product.sku);
        if (node.textContent.includes('Interruptor Simón 27')) node.textContent = product.name;
      });
      const stockPill = [...document.querySelectorAll('.pill, span')].find((node) => /stock/i.test(node.textContent));
      if (stockPill) stockPill.textContent = product.stock > 0 ? `${product.stock} uds. en stock` : 'Sin stock';
      document.querySelectorAll('button').forEach((button) => {
        if (/Añadir|carrito/i.test(button.textContent) || button.getAttribute('aria-label') === 'Añadir') {
          button.dataset.addCart = '';
          button.dataset.sku = product.sku;
        }
      });
    } catch (error) {
      toast(error.message);
    }
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

          let items = [];
          if (api.getToken()) {
            // Usuarios logueados: obtener del servidor
            const cart = await api.cart();
            items = cart.items;
          } else {
            // Usuarios anónimos: obtener de localStorage con detalles
            const local = JSON.parse(localStorage.getItem('garperlux_cart_items') || '[]');
            if (local.length) {
              items = await Promise.all(
                local.map(async (item) => {
                  try {
                    const product = await api.product(item.sku);
                    return { ...item, name: product.name, price: product.price };
                  } catch {
                    return item;
                  }
                })
              );
            }
          }

          // Renderizar items
          if (items.length) {
            checkoutItemsContainer.innerHTML = items.map((item) => `
              <div class="p-4 flex gap-3 items-center">
                <div class="w-12 h-12 rounded-lg bg-paper-2 grid place-items-center text-graphite/40 shrink-0"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="4" y="4" width="16" height="16" rx="2"/></svg></div>
                <div class="flex-1 min-w-0"><div class="text-sm font-medium truncate">${item.name || item.title || 'Producto'}</div><div class="text-xs text-graphite font-mono">×${item.quantity}</div></div>
                <span class="font-mono text-sm">${money((item.price || 0) * item.quantity)}</span>
              </div>`).join('');
          } else {
            checkoutItemsContainer.innerHTML = '<div class="p-4 text-center text-graphite text-sm">El carrito está vacío</div>';
          }

          // Actualizar totales
          const subtotal = items.reduce((s, i) => s + ((i.price || 0) * (i.quantity || 0)), 0);
          const tax = subtotal * 0.21;
          const total = subtotal + tax + SHIPPING_COST;

          document.querySelectorAll('[data-order-subtotal]').forEach((el) => { el.textContent = money(subtotal); });
          document.querySelectorAll('[data-order-tax]').forEach((el) => { el.textContent = money(tax); });
          document.querySelectorAll('[data-order-total]').forEach((el) => { el.textContent = money(total); });
        } catch (err) {
          console.error('[CHECKOUT DEBUG]', err);
        }
      })();

      if (page === '/pages/tienda/checkout.html') {
        api.checkoutOptions().then((options) => {
          const defaultAddress = options.addresses?.[0];
          if (defaultAddress) {
            const addressText = document.querySelector('input[name="dir"]:checked')?.closest('.bg-white')?.querySelector('.text-sm.text-graphite');
            if (addressText) addressText.textContent = `${defaultAddress.recipient} · ${defaultAddress.line1} · ${defaultAddress.postal_code} ${defaultAddress.city} · ${defaultAddress.phone || ''}`.trim();
          }
        }).catch(() => null);
      }
    }
    const primary = [...document.querySelectorAll('a.btn-primary, button.btn-primary')].at(-1);
    primary?.addEventListener('click', async (event) => {
      if (page === '/pages/tienda/checkout.html') {
        const selectedShipping = checkedLabel('vel', 'Estándar 24-48 h').toLowerCase();
        const draft = JSON.parse(localStorage.getItem(CHECKOUT_KEY) || '{}');
        draft.shippingMethod = selectedShipping.includes('expr') ? 'express' : selectedShipping.includes('recogida') ? 'pickup' : 'standard';
        draft.addressLabel = checkedLabel('dir', 'Dirección predeterminada');
        localStorage.setItem(CHECKOUT_KEY, JSON.stringify(draft));
        return;
      }
      event.preventDefault();
      if (!requireSession()) return;
      try {
        const options = await api.checkoutOptions();
        const selectedPayment = document.querySelector('input[name="metodo"]:checked')?.closest('.pay-method')?.textContent?.replace(/\s+/g, ' ').trim() || 'Tarjeta demo';
        const draft = JSON.parse(localStorage.getItem(CHECKOUT_KEY) || '{}');
        const order = await api.checkout({
          ...draft,
          payment: selectedPayment,
          paymentMethodId: options.paymentMethods?.[0]?.id || null,
          acceptedTerms: true,
        });
        // Guardar también los items del carrito en localStorage para poder mostrar la confirmación incluso sin sesión
        const cartItems = options?.cart?.items || (JSON.parse(localStorage.getItem('garperlux_cart_items') || '[]'));
        const lastOrder = { ...order, items: cartItems, totals: order.totals || options?.totals || null };
        localStorage.setItem('garperlux_last_order', JSON.stringify(lastOrder));
        localStorage.removeItem(CHECKOUT_KEY);
        location.href = `/pages/tienda/pedido-confirmado.html?order=${encodeURIComponent(order.code)}`;
      } catch (error) {
        toast(error.message);
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
            order = await api.order(code);
          } catch (err) {
            order = orderFromStorage;
          }
          if (!order) return;

          const itemsContainer = document.querySelector('[data-confirm-order-items]');
          if (itemsContainer) {
            // Prefer payload.cart.items if API returns payload, otherwise fallback
            const items = (order.payload && order.payload.cart && order.payload.cart.items) || order.items || order.lineItems || [];
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
    const totals = payload.totals || {};
    const shippingMethod = totals.shippingMethod?.label || payload.checkout?.shippingMethod || 'Envío estándar';
    const paymentMethod = payload.paymentMethod?.label || payload.checkout?.payment || 'Pago confirmado';
    const address = payload.checkout?.addressLabel || payload.checkout?.shippingAddress || payload.checkout?.address || order.shipping_address || 'Dirección no disponible';
    const meta = orderStatusInfo(order.status);
    const firstItem = items[0];
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
              <div class="font-medium">${payload.checkout?.recipient || payload.checkout?.fullName || 'Cliente GarperLux'}</div>
              <div class="text-graphite">${typeof address === 'string' ? address : 'Dirección no disponible'}</div>
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
    if (!['/pages/servicios/solicitar-presupuesto.html', '/pages/cuenta/crear-presupuesto.html'].includes(page)) return;
    const submitQuote = async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!requireSession()) return;
      try {
        const title = document.querySelector('input[placeholder*="Título"], input[placeholder*="Razón"], input[placeholder*="Nombre"]')?.value || 'Presupuesto GarperLux';
        const quote = await api.quote({ title, source: page, items: [] });
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

  function backendPanel(title, rows, emptyText) {
    const main = document.querySelector('main');
    if (!main || document.querySelector('[data-backend-panel]')) return;
    const panel = document.createElement('section');
    panel.dataset.backendPanel = '';
    panel.className = 'container-x mt-6';
    panel.innerHTML = `
      <div class="bg-white border border-line rounded-2xl p-5 shadow-sm">
        <div class="flex items-center justify-between gap-4 mb-4">
          <h2 class="font-serif text-xl font-medium">${title}</h2>
          <span class="font-mono text-xs text-stock">Datos backend</span>
        </div>
        <div class="grid gap-2">${rows.length ? rows.join('') : `<p class="text-sm text-graphite">${emptyText}</p>`}</div>
      </div>`;
    main.prepend(panel);
  }

  async function bindAccountPages() {
    if (!api.getToken()) return;
    try {
      if (page === '/pages/cuenta/mis-pedidos.html') {
        const orders = await api.orders();
        backendPanel('Pedidos reales', orders.map((order) => `<a href="/pages/cuenta/mis-pedido.html?order=${order.code}" class="flex justify-between gap-4 rounded-xl bg-paper-2 p-3"><span>${order.code} · ${order.status}</span><strong>${money(order.total)}</strong></a>`), 'Todavía no hay pedidos en la base de datos.');
        await renderOrdersPage();
      }
      if (page === '/pages/cuenta/mis-solicitudes.html') {
        const requests = await api.serviceRequests();
        backendPanel('Solicitudes técnicas reales', requests.map((request) => `<a href="/pages/servicios/seguir-solicitud.html?code=${request.code}" class="flex justify-between gap-4 rounded-xl bg-paper-2 p-3"><span>${request.code} · ${request.service_type}</span><strong>${request.status}</strong></a>`), 'Todavía no hay solicitudes técnicas reales.');
      }
      if (page === '/pages/cuenta/mis-presupuestos.html') {
        const quotes = await api.quotes();
        backendPanel('Presupuestos reales', quotes.map((quote) => `<a href="/pages/cuenta/presupuesto.html?code=${quote.code}" class="flex justify-between gap-4 rounded-xl bg-paper-2 p-3"><span>${quote.code} · ${quote.title}</span><strong>${money(quote.total)}</strong></a>`), 'Todavía no hay presupuestos reales.');
      }
      if (page === '/pages/cuenta/facturas.html' || page === '/pages/cuenta/albaranes.html') {
        const docs = await api.documents(page === '/pages/cuenta/facturas.html' ? 'invoice' : 'delivery_note');
        backendPanel(page === '/pages/cuenta/facturas.html' ? 'Facturas reales' : 'Albaranes reales', docs.map((doc) => `<div class="flex justify-between gap-4 rounded-xl bg-paper-2 p-3"><span>${doc.code} · ${doc.type}</span><strong>${money(doc.total)}</strong></div>`), 'Todavía no hay documentos reales.');
      }
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

  async function boot() {
    bindLogin();
    bindPasswordRecovery();
    if (!publicAuthlessPages.has(page)) {
      await syncSessionToLegacyAuth();
      await refreshCartCount();
    }
    bindCatalogActions();
    bindCheckout();
    bindConfirmationPages();
    await bindTrackingPages();
    bindServiceRequest();
    bindQuoteForms();
    bindAccountForms();
    bindCommerceForms();
    bindSupportForms();
    await bindSearchPage();
    await bindCatalogPages().catch((error) => toast(error.message));
    await bindProductPage();
    await bindCartPage();
    await bindAccountPages();
    await bindAdminDashboard();
  }

  document.addEventListener('garperlux:components-ready', () => {
    if (publicAuthlessPages.has(page)) return;
    syncLegacySessionToApi();
    syncSessionToLegacyAuth();
    refreshCartCount();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
