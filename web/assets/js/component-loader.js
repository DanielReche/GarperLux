/* GarperLux — carga de componentes HTML reutilizables */

(function () {
  'use strict';

  const currentPath = location.pathname.replace(/\\/g, '/');
  // Calcula el depth contando los segmentos que hay después de "/pages/" en la URL.
  // Ejemplo: /pages/tienda//assets/js/categoria.html -> ['pages','tienda','/assets/js/categoria.html'] -> depth = '../../'
  const depth = (() => {
    const segments = currentPath.split('/').filter(Boolean);
    const idx = segments.indexOf('pages');
    if (idx === -1) return '';
    const levels = segments.length - idx - 1;
    return levels > 0 ? '../'.repeat(levels) : '';
  })();
  const componentMap = {
    'site-header': '/components/site-header.html',
    'site-footer': '/components/site-footer.html',
  };

  const resolveComponentUrl = (url) => {
    if (!url) return url;
    return url.startsWith('/') ? url : `${depth}${url}`;
  };

  const localizeUrl = (url) => {
    if (!url || /^(https:|mailto:|tel:|#)/.test(url)) return url;
    if (url.startsWith('/')) return url;
    return `${depth}${url}`;
  };

  const localizeFragment = (root) => {
    root.querySelectorAll('[href]').forEach((node) => {
      node.setAttribute('href', localizeUrl(node.getAttribute('href')));
    });
    root.querySelectorAll('[src]').forEach((node) => {
      node.setAttribute('src', localizeUrl(node.getAttribute('src')));
    });
  };

  const markActiveNav = (root) => {
    // Obtener el nombre del archivo
    const page = currentPath.split('/').pop().replace('.html', '');
    
    // Obtener la sección principal
    const pathSegments = currentPath.split('/').filter(s => s && s !== 'pages');
    const mainSection = pathSegments[0] || '';
    
    root.querySelectorAll('[data-nav-match]').forEach((link) => {
      const matches = link.dataset.navMatch.split(',').map(m => m.trim());
      
      let isMatched = false;
      
      // Estrategia 1: Buscar coincidencia exacta o muy específica con el nombre del archivo
      isMatched = matches.some(match => page === match || page.startsWith(match + '-') || page.startsWith(match + '.'));
      
      // Estrategia 2: Si no hay coincidencia exacta con el archivo, comprobar sección principal
      // PERO solo si la sección NO es "servicios" (para evitar conflicto entre Servicios y Solicitar técnico)
      if (!isMatched && mainSection !== 'servicios') {
        isMatched = matches.some(match => mainSection === match || mainSection.startsWith(match));
      }
      
      if (isMatched) {
        link.classList.add('is-active');
        link.setAttribute('aria-current', 'page');
      }
    });
  };

  const updateBreadcrumbs = (root = document) => {
    try {
      root.querySelectorAll('nav.text-xs').forEach((nav) => {
        nav.querySelectorAll('.opacity-50').forEach((sep) => {
          if (sep.textContent.trim() === '/') sep.textContent = '»';
        });
        nav.querySelectorAll('a').forEach((a) => a.classList.add('underline'));
      });
    } catch (e) {
      // ignore
    }
  };

  const notifyReady = () => {
    document.querySelectorAll('[data-year]').forEach((node) => {
      node.textContent = new Date().getFullYear();
    });
    // Ensure breadcrumbs in the final document are transformed
    try { updateBreadcrumbs(document); } catch (e) {}
    document.dispatchEvent(new CustomEvent('garperlux:components-ready'));
  };

  const bindComponentInteractions = () => {
    const panels = [...document.querySelectorAll('[data-nav-panel]')];
    panels.slice(1).forEach((panel) => panel.remove());
    const overlays = [...document.querySelectorAll('[data-search-overlay]')];
    overlays.slice(1).forEach((overlay) => overlay.remove());

    const header = document.querySelector('[data-header]');
    if (header) {
      const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 10);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    document.querySelectorAll('[data-nav-toggle]').forEach((toggle) => {
      toggle.addEventListener('click', () => {
        const panel = document.querySelector('[data-nav-panel]');
        if (!panel) return;
        const open = panel.classList.toggle('is-open');
        document.querySelectorAll('[data-nav-toggle]').forEach((item) => {
          item.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        document.body.style.overflow = open ? 'hidden' : '';
      });
    });

    const searchOverlay = document.querySelector('[data-search-overlay]');
    document.querySelectorAll('[data-search-open]').forEach((button) => {
      button.addEventListener('click', () => {
        searchOverlay?.classList.add('is-open');
        setTimeout(() => searchOverlay?.querySelector('input')?.focus(), 80);
      });
    });
    document.querySelectorAll('[data-search-close]').forEach((button) => {
      button.addEventListener('click', () => searchOverlay?.classList.remove('is-open'));
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') searchOverlay?.classList.remove('is-open');
    });

    document.querySelectorAll('input[type="search"]').forEach((input) => {
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        const query = input.value.trim();
        if (!query) return;
        event.preventDefault();
        // Redirect to the canonical tienda search page using absolute path
        location.href = `/pages/tienda/buscador.html?q=${encodeURIComponent(query)}`;
      });
    });
  };

  const load = async () => {
    const slots = [...document.querySelectorAll('[data-component]')];
    if (!slots.length) {
      notifyReady();
      return;
    }

    await Promise.all(slots.map(async (slot) => {
      const name = slot.dataset.component;
      const file = componentMap[name];
      if (!file) return;
      try {
        const response = await fetch(resolveComponentUrl(file));
        if (!response.ok) throw new Error(`No se pudo cargar ${file}`);
        const template = document.createElement('template');
        template.innerHTML = await response.text();
        localizeFragment(template.content);
        markActiveNav(template.content);
        // Update breadcrumbs inside loaded fragment
        try { updateBreadcrumbs(template.content); } catch (e) {}
        slot.replaceWith(template.content.cloneNode(true));
      } catch (error) {
        console.warn(error.message);
        slot.hidden = true;
      }
    }));

    bindComponentInteractions();
    notifyReady();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
