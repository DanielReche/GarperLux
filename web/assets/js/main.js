/* GarperLux — interacciones ligeras (vanilla JS) */

(function () {
  'use strict';

  const toast = (message) => {
    let wrap = document.querySelector('[data-toast-wrap]');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.setAttribute('data-toast-wrap', '');
      wrap.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:9999;display:grid;gap:10px;max-width:min(360px,calc(100vw - 32px));';
      document.body.appendChild(wrap);
    }

    const item = document.createElement('div');
    item.textContent = message;
    item.style.cssText = 'background:#0B0D12;color:#F7F3EC;border:1px solid rgba(245,241,234,.16);border-radius:12px;padding:12px 14px;font:500 14px/1.4 Inter,system-ui,sans-serif;box-shadow:0 18px 36px -18px rgba(11,13,18,.45);transform:translateY(8px);opacity:0;transition:all .2s ease;';
    wrap.appendChild(item);
    requestAnimationFrame(() => {
      item.style.opacity = '1';
      item.style.transform = 'translateY(0)';
    });
    setTimeout(() => {
      item.style.opacity = '0';
      item.style.transform = 'translateY(8px)';
      setTimeout(() => item.remove(), 220);
    }, 2600);
  };
  window.glxToast = toast;

  const buttonText = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();

  const bumpCart = (amount = 1) => {
    const next = Number(localStorage.getItem('garperlux_cart_count') || '0') + amount;
    localStorage.setItem('garperlux_cart_count', String(next));
    document.querySelectorAll('[data-cart-count]').forEach((el) => { el.textContent = next; });
  };

  // ---------- Header sticky shrink on scroll ----------
  const header = document.querySelector('[data-header]');
  if (header) {
    const onScroll = () => {
      if (window.scrollY > 10) header.classList.add('is-scrolled');
      else header.classList.remove('is-scrolled');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ---------- Mobile nav toggle ----------
  const navToggle = document.querySelector('[data-nav-toggle]');
  const navPanel = document.querySelector('[data-nav-panel]');
  if (navToggle && navPanel) {
    navToggle.addEventListener('click', () => {
      const open = navPanel.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.style.overflow = open ? 'hidden' : '';
    });
  }

  // ---------- Marquee clone (seamless loop) ----------
  document.querySelectorAll('.marquee__track').forEach((track) => {
    const clone = track.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    track.parentNode.appendChild(clone);
  });

  // ---------- Reveal on scroll ----------
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('fade-up');
          io.unobserve(e.target);
        }
      });
    },
    { rootMargin: '0px 0px -80px 0px' }
  );
  document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));

  // ---------- Search overlay ----------
  const searchOpen = document.querySelector('[data-search-open]');
  const searchOverlay = document.querySelector('[data-search-overlay]');
  const searchClose = document.querySelector('[data-search-close]');
  if (searchOpen && searchOverlay) {
    searchOpen.addEventListener('click', () => {
      searchOverlay.classList.add('is-open');
      setTimeout(() => searchOverlay.querySelector('input')?.focus(), 80);
    });
    searchClose?.addEventListener('click', () => searchOverlay.classList.remove('is-open'));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') searchOverlay.classList.remove('is-open');
    });
  }

  // ---------- Search inputs redirect to results ----------
  document.querySelectorAll('input[type="search"], input[placeholder*="Buscar"], input[placeholder*="busca"], input[placeholder*="referencia"]').forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const query = input.value.trim();
      if (!query) return;
      e.preventDefault();
      // Use absolute path to ensure correct resolution regardless of <base> or current URL
      window.location.href = '/pages/tienda/buscador.html?q=' + encodeURIComponent(query);
    });
  });

  // ---------- Quantity steppers ----------
  document.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    const text = buttonText(button);
    const control = button.closest('.flex, .inline-flex, .grid');
    const input = control?.querySelector('input[type="number"]');
    if (!input) return;

    if (button.getAttribute('aria-label') === 'Restar' || text === '−' || text === '-') {
      input.value = Math.max(Number(input.min || 1), Number(input.value || 1) - 1);
    }
    if (button.getAttribute('aria-label') === 'Sumar' || text === '+') {
      input.value = Number(input.value || 0) + 1;
    }
  });

  // ---------- Prototype action feedback ----------
  document.addEventListener('click', (e) => {
    const action = e.target.closest('button, a');
    if (!action || action.matches('[href]:not([href="#"])')) return;
    if (action.getAttribute('href') === '#') e.preventDefault();
    const text = buttonText(action);
    if (!text) return;

    if (text.includes('añadir') && (text.includes('carrito') || text.includes('kit') || text.includes('todo'))) {
      // El drawer (cart-drawer.js + backend-integration.js) ya gestiona su propio
      // feedback con animación lateral; aquí sólo bumpeamos el contador. Si aún
      // así no se ha abierto el drawer (por ejemplo en una página sin catálogo
      // dinámico), caemos a un mini toast como respaldo.
      bumpCart(text.includes('todo') ? 4 : 1);
      if (!window.GarperLuxCartDrawer) toast('Añadido al carrito del prototipo.');
    } else if (text.includes('favorito') || text.includes('guardar para luego') || text === 'guardar') {
      toast('Guardado en tu área personal.');
    } else if (text.includes('pdf') || text.includes('descargar') || text.includes('exportar')) {
      toast('Descarga simulada para el prototipo.');
    } else if (text.includes('aplicar')) {
      toast('Cupón aplicado en modo demo.');
    } else if (text.includes('cancelar solicitud')) {
      toast('Solicitud marcada como cancelada en modo demo.');
    } else if (text.includes('modificar datos')) {
      window.location.href = '/assets/js/solicitar-tecnico.html';
    }
  });

  // ---------- Static form feedback ----------
  document.querySelectorAll('form').forEach((form) => {
    if (form.hasAttribute('onsubmit') || form.closest('[data-pane]')) return;
    if (['add-address-form', 'profile-form'].includes(form.id)) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      toast('Solicitud enviada en modo prototipo.');
      form.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]), textarea').forEach((field) => {
        if (!field.defaultValue) field.value = '';
      });
    });
  });

  // ---------- Year in footer ----------
  const yearEl = document.querySelector('[data-year]');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
