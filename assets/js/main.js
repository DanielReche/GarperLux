/* GarperLux — interacciones ligeras (vanilla JS) */

(function () {
  'use strict';

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

  // ---------- Year in footer ----------
  const yearEl = document.querySelector('[data-year]');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
