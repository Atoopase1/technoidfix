/* Technoid — Motion JS  (motion.js)
   Works alongside motion.css. Zero dependencies. */

(function TechnoidMotion() {
  'use strict';

  /* ── Helpers ──────────────────────────────────────────────── */
  const prefersReduced = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 1. Scroll-reveal via IntersectionObserver ────────────── */
  function initReveal() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    // Auto-tag key semantic elements
    const selectors = [
      '.card', '.testi-card', '.case-study', '.stats',
      '.section-header', '.hero', '.skill-tag',
      '.footer-col-brand', '.footer-col-title',
      'h2', 'h3',
    ];
    document.querySelectorAll(selectors.join(',')).forEach(el => {
      if (!el.closest('#post-reader') && !el.closest('.modal-overlay')) {
        el.classList.add('tf-reveal');
        io.observe(el);
      }
    });

    // Stagger grid children
    document.querySelectorAll('.grid, .footer-grid, .cols-3, .cols-2').forEach(grid => {
      grid.classList.add('tf-reveal-stagger');
      io.observe(grid);
    });
  }

  /* ── 2. Button ripple ────────────────────────────────────── */
  function initRipple() {
    document.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('.btn');
      if (!btn || prefersReduced()) return;

      // Make sure position is relative so ripple is contained
      const pos = getComputedStyle(btn).position;
      if (pos === 'static') btn.style.position = 'relative';

      const rect   = btn.getBoundingClientRect();
      const size   = Math.max(rect.width, rect.height) * 2;
      const ripple = document.createElement('span');
      ripple.className = 'tf-ripple';
      ripple.style.cssText = `
        width:${size}px; height:${size}px;
        left:${e.clientX - rect.left - size/2}px;
        top:${e.clientY  - rect.top  - size/2}px;
      `;
      btn.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
  }

  /* ── 3. Theme toggle icon spin ───────────────────────────── */
  function initThemeSpin() {
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        if (prefersReduced()) return;
        btn.classList.add('tf-spin');
        btn.addEventListener('animationend', () => btn.classList.remove('tf-spin'), { once: true });
      });
    });
  }

  /* ── 4. Page-leave crossfade ─────────────────────────────── */
  function initPageLeave() {
    if (prefersReduced()) return;
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');
      // Only same-origin internal navigation, not anchors or JS
      if (
        !href ||
        href.startsWith('#') ||
        href.startsWith('javascript') ||
        href.startsWith('mailto') ||
        href.startsWith('tel') ||
        a.target === '_blank' ||
        e.ctrlKey || e.metaKey || e.shiftKey
      ) return;

      e.preventDefault();
      document.body.classList.add('tf-leaving');
      const dest = href;
      setTimeout(() => { window.location.href = dest; }, 240);
    });
  }

  /* ── 5. Stat number count-up ─────────────────────────────── */
  function initCountUp() {
    if (prefersReduced()) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        io.unobserve(el);
        const raw   = el.textContent.trim();
        const num   = parseFloat(raw.replace(/[^0-9.]/g, ''));
        const suffix = raw.replace(/[0-9.]/g, '');
        if (isNaN(num) || num === 0) return;

        const dur  = 1200;
        const start = performance.now();
        el.classList.add('tf-counting');

        function tick(now) {
          const t = Math.min((now - start) / dur, 1);
          // Ease out cubic
          const eased = 1 - Math.pow(1 - t, 3);
          const cur   = Math.round(eased * num);
          el.textContent = cur + suffix;
          if (t < 1) requestAnimationFrame(tick);
          else { el.textContent = raw; el.classList.remove('tf-counting'); }
        }
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.5 });

    document.querySelectorAll('.stat-num').forEach(el => io.observe(el));
  }

  /* ── 6. Subtle card tilt on mouse move ───────────────────── */
  function initCardTilt() {
    if (prefersReduced()) return;
    // Only desktop
    if (!window.matchMedia('(pointer: fine)').matches) return;

    document.querySelectorAll('.card, .testi-card').forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const cx   = rect.left + rect.width  / 2;
        const cy   = rect.top  + rect.height / 2;
        const dx   = (e.clientX - cx) / (rect.width  / 2);
        const dy   = (e.clientY - cy) / (rect.height / 2);
        const rx   = -dy * 4;   // max 4deg tilt
        const ry   =  dx * 4;
        card.style.transform = `translateY(-6px) rotateX(${rx}deg) rotateY(${ry}deg)`;
        card.style.transition = 'transform 80ms linear, box-shadow 80ms linear';
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
        card.style.transition = '';
      });
    });
  }

  /* ── 7. Smooth focus ring on interactive elements ─────────── */
  function initFocusRing() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        document.body.classList.add('tf-using-keyboard');
      }
    });
    document.addEventListener('mousedown', () => {
      document.body.classList.remove('tf-using-keyboard');
    });
  }

  /* ── 8. Magnetic footer social icons ─────────────────────── */
  function initMagneticIcons() {
    if (prefersReduced()) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;

    document.querySelectorAll('.footer-socials a').forEach(icon => {
      icon.addEventListener('mousemove', (e) => {
        const rect = icon.getBoundingClientRect();
        const cx   = rect.left + rect.width  / 2;
        const cy   = rect.top  + rect.height / 2;
        const dx   = (e.clientX - cx) * 0.3;
        const dy   = (e.clientY - cy) * 0.3;
        icon.style.transform = `translate(${dx}px, ${dy - 4}px) scale(1.15)`;
        icon.style.transition = 'transform 60ms linear';
      });
      icon.addEventListener('mouseleave', () => {
        icon.style.transform = '';
        icon.style.transition = '';
      });
    });
  }

  /* ── 9. Typing cursor on hero h1 ─────────────────────────── */
  // Subtle blinking cursor appended temporarily to hero h1 on load
  function initHeroCursor() {
    if (prefersReduced()) return;
    const h1 = document.querySelector('.hero h1, .tx-hero__heading');
    if (!h1) return;
    const cursor = document.createElement('span');
    cursor.style.cssText = 'display:inline-block;width:3px;height:.85em;background:var(--brand);margin-left:4px;vertical-align:middle;border-radius:2px;animation:tfBlink 1s step-start infinite;';
    document.head.insertAdjacentHTML('beforeend','<style>@keyframes tfBlink{0%,100%{opacity:1}50%{opacity:0}}</style>');
    h1.appendChild(cursor);
    // Remove after 2.4s — just an entrance flourish
    setTimeout(() => cursor.remove(), 2400);
  }

  /* ── 10. Button loading shimmer ──────────────────────────── */
  // When a button has the fa-spinner class it gets a subtle glow
  const _btnObs = new MutationObserver(() => {
    document.querySelectorAll('.btn .fa-spin').forEach(icon => {
      const btn = icon.closest('.btn');
      if (btn) btn.style.opacity = '0.78';
    });
    document.querySelectorAll('.btn:not(:has(.fa-spin))').forEach(btn => {
      btn.style.opacity = '';
    });
  });
  _btnObs.observe(document.documentElement, { subtree: true, childList: true });

  /* ── Init ─────────────────────────────────────────────────── */
  function init() {
    initReveal();
    initRipple();
    initThemeSpin();
    initPageLeave();
    initCountUp();
    initCardTilt();
    initFocusRing();
    initMagneticIcons();
    initHeroCursor();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
