/* Technoid — Enhanced JS v2 */

// ── Hamburger nav ─────────────────────────────────────────
(function initHamburger() {
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.querySelector('.nav-hamburger');
    const nav = document.querySelector('header.nav > nav');
    if (!btn || !nav) return;
    btn.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('open');
      btn.innerHTML = isOpen ? '✕' : '☰';
      btn.setAttribute('aria-expanded', isOpen);
    });
    // Close on link click
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      nav.classList.remove('open');
      btn.innerHTML = '☰';
    }));
    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('header.nav')) {
        nav.classList.remove('open');
        btn.innerHTML = '☰';
      }
    });
  });
})();


(function initTheme() {
  const saved = localStorage.getItem('technoid-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
})();

window.toggleTheme = function() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('technoid-theme', next);
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.innerHTML = next === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    btn.title = next === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  });
};

(function setToggleIcon() {
  document.addEventListener('DOMContentLoaded', () => {
    const theme = document.documentElement.getAttribute('data-theme');
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
      btn.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    });
  });
})();

// ── Nav active state ──────────────────────────────────────
(function highlightNav() {
  const page = (location.pathname.split('/').pop() || 'index.html').replace('.html', '') || 'index';
  document.querySelectorAll('header.nav a[data-page]').forEach(a => {
    if (a.classList.contains('nav-cta')) return; // never mark Book a Repair as active
    const match = a.getAttribute('data-page');
    if ((page === 'index' && match === 'home') || match === page) a.classList.add('active');
  });
})();

// ── Footer year ───────────────────────────────────────────
(function setYear() {
  document.querySelectorAll('.year').forEach(el => el.textContent = new Date().getFullYear());
})();

// ── CV Download & Viewer ─────────────────────────────────────────
(function initCVButtons() {
  document.addEventListener('DOMContentLoaded', () => {
    const cvPath = 'assets/CV.JPG';

    // View CV Modal Logic
    const viewBtn = document.getElementById('view-cv-btn');
    const cvModal = document.getElementById('cv-modal');
    if (viewBtn && cvModal) {
      const closeBtn = cvModal.querySelector('.cv-modal-close');
      
      viewBtn.addEventListener('click', (e) => {
        e.preventDefault();
        cvModal.classList.add('open');
      });

      const closeModal = () => cvModal.classList.remove('open');

      if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
      }

      // Close on clicking outside the content
      cvModal.addEventListener('click', (e) => {
        if (e.target === cvModal) {
          closeModal();
        }
      });
      
      // Close on escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && cvModal.classList.contains('open')) {
          closeModal();
        }
      });
    }

    // Download button — fetch as blob so all browsers trigger save dialog
    const dlBtn = document.getElementById('download-cv-btn');
    if (dlBtn) {
      dlBtn.addEventListener('click', async () => {
        try {
          dlBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading...';
          dlBtn.disabled = true;
          const res = await fetch(cvPath);
          if (!res.ok) throw new Error('File not found');
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'Technoid-CV.jpg';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (e) {
          // Fallback: open in new tab
          window.open(cvPath, '_blank');
        } finally {
          dlBtn.innerHTML = '<i class="fas fa-download"></i> Download CV';
          dlBtn.disabled = false;
        }
      });
    }
  });
})();
