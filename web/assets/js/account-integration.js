// Client-side integration for dynamic account dashboard
(function () {
  window.initAccountPage = async function initAccountPage() {
    try {
      const api = window.GarperLuxApi;
      if (!api) return;

      // If no API token and legacy requireAuth exists, let it handle redirect
      if (!api.getToken()) {
        if (typeof glxRequireAuth === 'function') {
          const ok = glxRequireAuth();
          // If legacy session exists, ensure sidebar is rendered by legacy renderer
          if (ok && typeof glxRenderSidebar === 'function') {
            const sb = document.getElementById('glx-sidebar');
            if (sb) sb.innerHTML = glxRenderSidebar(sb.dataset.active || 'dashboard');
          }
          return;
        }
        return;
      }

      const user = await api.me().catch(() => null);
      // If legacy session is missing but API returns a user, sync legacy storage (keeps other pages working)
      const legacyUser = (typeof glxGetUser === 'function') ? glxGetUser() : null;
      if (!legacyUser && user && typeof window.glxSyncSessionToLegacyAuth === 'function') {
        try { window.glxSyncSessionToLegacyAuth(user); } catch (e) { /* ignore */ }
      }
      if (user) {
        document.body.dataset.activeView = user.role || 'particular';
        const nameLabel = document.querySelector('[data-current-name]');
        if (nameLabel) nameLabel.textContent = user.fullName || user.email || '';
        const h1 = document.querySelector('main .view-particular h1');
        if (h1) {
          const first = (user.fullName || user.email || '').split(' ')[0] || '';
          h1.textContent = first ? (first + '.') : (user.fullName || '');
        }
      }

      const [orders, serviceRequests, favorites, tutorials, invoices, albaranes, quotes] = await Promise.all([
        api.orders().catch(() => []),
        api.serviceRequests().catch(() => []),
        api.favorites().catch(() => []),
        api.savedTutorials().catch(() => []),
        api.documents('invoice').catch(() => []),
        api.documents('delivery_note').catch(() => []),
        api.quotes().catch(() => []),
      ]);

      // Update stat cards (particular view)
      const statVals = [orders.length || 0, serviceRequests.length || 0, favorites.length || 0, tutorials.length || 0];
      const statEls = document.querySelectorAll('.view-particular .stat-card');
      statEls.forEach((el, idx) => {
        const big = el.querySelector('.font-serif');
        if (big) big.textContent = String(statVals[idx] ?? '0');
      });

      // Update last order block
      const orderBlock = Array.from(document.querySelectorAll('.view-particular .bg-white.rounded-2xl')).find(el => /Pedido #|Pedido/.test(el.textContent));
      if (orders.length && orderBlock) {
        const last = orders[0];
        const codeLab = orderBlock.querySelector('.text-xs.font-mono');
        if (codeLab) codeLab.textContent = `Pedido ${last.code || ''}`;
        const title = orderBlock.querySelector('h3');
        if (title) title.textContent = last.status === 'preparing' ? 'Tu pedido está en preparación' : `Pedido ${last.status || ''}`;
        const pill = orderBlock.querySelector('.pill');
        if (pill) pill.textContent = (last.status || '').replace('_',' ');
        const dateEls = Array.from(orderBlock.querySelectorAll('.font-mono')).filter((el) => el.classList.contains('text-[10px]'));
        if (dateEls[0]) dateEls[0].textContent = last.created_at ? new Date(last.created_at).toLocaleString() : '';
        const totalEl = orderBlock.querySelector('.font-serif.text-3xl');
        if (totalEl) totalEl.textContent = last.total ? String(last.total) : '';
        const detailLink = orderBlock.querySelector('a[href*="carrito.html"]');
        if (detailLink) detailLink.href = `/pages/cuenta/mis-pedidos.html?code=${encodeURIComponent(last.code)}`;
      } else if (orderBlock) {
        orderBlock.style.display = 'none';
      }

      // Update service request block
      const srBlock = Array.from(document.querySelectorAll('.view-particular .bg-paper-2.rounded-2xl')).find(el => /Solicitud|Solicit/.test(el.textContent));
      if (serviceRequests.length && srBlock) {
        const sr = serviceRequests[0];
        const tag = srBlock.querySelector('.pill');
        if (tag) tag.textContent = sr.status || 'En revisión';
        const eyebrow = srBlock.querySelector('.font-mono.text-graphite.uppercase') || srBlock.querySelector('.eyebrow');
        if (eyebrow) eyebrow.textContent = `Solicitud ${sr.code || ''}`;
        const title = srBlock.querySelector('h3');
        if (title) title.textContent = sr.service_type || 'Solicitud técnica';
        const p = srBlock.querySelector('p');
        if (p) p.textContent = sr.created_at ? `Recibida el ${new Date(sr.created_at).toLocaleString()}` : 'Recibida recientemente';
        const btn = srBlock.querySelector('a.btn');
        if (btn) btn.href = `/pages/cuenta/mis-solicitudes.html?code=${encodeURIComponent(sr.code)}`;
      } else if (srBlock) {
        srBlock.style.display = 'none';
      }

      // Render sidebar (legacy renderer) and update counts where applicable
      const sb = document.getElementById('glx-sidebar');
      if (sb) {
        if (typeof glxRenderSidebar === 'function') {
          try {
            sb.innerHTML = glxRenderSidebar(sb.dataset.active || 'dashboard');
          } catch (e) { /* ignore render errors */ }
        }
        const map = {
          '/pages/cuenta/mis-pedidos.html': orders.length,
          '/pages/cuenta/mis-solicitudes.html': serviceRequests.length,
          '/pages/cuenta/mis-favoritos.html': favorites.length,
          '/pages/cuenta/tutoriales-guardados.html': tutorials.length,
          '/pages/cuenta/albaranes.html': albaranes.length,
          '/pages/cuenta/facturas.html': invoices.length,
          '/pages/cuenta/mis-presupuestos.html': quotes.length,
        };
        sb.querySelectorAll('a').forEach(a => {
          const href = a.getAttribute('href');
          if (!href) return;
          const val = map[href];
          if (val !== undefined) {
            const span = a.querySelector('span.ml-auto');
            if (span) span.textContent = String(val);
          }
        });
      }
    } catch (err) {
      // avoid breaking page — log for debugging
      console.error('initAccountPage error', err);
    }
  };
})();
