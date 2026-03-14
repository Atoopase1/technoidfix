/* Technoid — Enhanced JS v2 */

// ── Hamburger nav ─────────────────────────────────────────
(function initHamburger() {
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.querySelector('.nav-hamburger');
    const nav = document.querySelector('header.nav > nav');
    if (!btn || !nav) return;
    btn.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', isOpen);
      btn.classList.toggle('is-open', isOpen);
    });
    // Close on link click
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      nav.classList.remove('open');
      btn.classList.remove('is-open');
    }));
    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('header.nav')) {
        nav.classList.remove('open');
        btn.classList.remove('is-open');
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

// ── Global toast notification ────────────────────────────
window.toast = function(msg, type) {
  const el = document.querySelector('.toast');
  if (!el) return;
  el.textContent = msg;
  el.style.background = type === 'error' ? '#991b1b' : type === 'success' ? '#166534' : 'var(--dark)';
  el.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
};

// ── Admin Settings (image swap + customers) ──────────────
(function initAdminSettings() {
  const SUPABASE_URL = 'https://xhaoerrcbnqtlzigwqjt.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_1xE8KwCC9AqRUcCGdEQbAg_yjgeM8at';
  const ADMIN_EMAILS = ['atoopase@gmail.com', 'atoopasechristopher@gmail.com'];

  const PAGE_SLOTS = {
    'index.html': [{ selector: '.hero-img img', key: 'img_home_hero', label: 'Home Hero Image' }],
    '':           [{ selector: '.hero-img img', key: 'img_home_hero', label: 'Home Hero Image' }],
    'design.html':[{ selector: '.service-hero-img img', key: 'img_design_hero', label: 'Design Hero Image' }],
    'web.html':   [{ selector: '.service-hero-img img', key: 'img_web_hero', label: 'Web Hero Image' }],
    'contact.html': [],
    'projects.html': []
  };

  const page = location.pathname.split('/').pop() || 'index.html';
  const slots = PAGE_SLOTS[page] || [];
  let _sb = null;

  function getSb() {
    if (!_sb && typeof window.supabase !== 'undefined')
      _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return _sb;
  }

  function applySavedImages() {
    slots.forEach(({ selector, key }) => {
      const saved = localStorage.getItem(key);
      if (saved) document.querySelectorAll(selector).forEach(img => { img.src = saved; });
    });
  }

  async function checkAdmin() {
    if (typeof window.supabase === 'undefined') return;
    try {
      const { data } = await getSb().auth.getSession();
      const user = data?.session?.user;
      if (user && ADMIN_EMAILS.includes(user.email)) {
        document.querySelectorAll('#nav-settings-btn').forEach(el => { el.style.display = ''; });
      }
    } catch (e) {}
  }

  document.addEventListener('DOMContentLoaded', () => { applySavedImages(); checkAdmin(); });

  /* ── Modal open ── */
  window.openSettingsModal = function(e) {
    if (e) e.preventDefault();
    const modal = document.getElementById('settings-modal');
    const panel = document.getElementById('settings-panel');
    if (!modal) return;
    // close hamburger
    const nav = document.querySelector('header.nav > nav');
    const hbtn = document.querySelector('.nav-hamburger');
    if (nav) nav.classList.remove('open');
    if (hbtn) hbtn.classList.remove('is-open');

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bg  = isDark ? '#16161f' : '#fff';
    const fg  = isDark ? '#e5e7eb' : '#111827';
    const bg2 = isDark ? '#0f0f17' : '#f8fafc';
    const bd  = isDark ? '#2a2a3a' : '#e5e7eb';

    if (panel) { panel.style.background = bg; panel.style.color = fg; }

    panel.innerHTML = `
      <button onclick="closeSettingsModal()" style="position:absolute;top:12px;right:14px;background:none;border:none;font-size:1.3rem;cursor:pointer;color:#6b7280;">×</button>
      <h3 style="font-size:1.05rem;font-weight:700;margin-bottom:16px;"><i class="fas fa-cog" style="color:var(--brand);margin-right:6px;"></i> Admin Settings</h3>

      <!-- Tabs -->
      <div style="display:flex;gap:0;border-bottom:2px solid ${bd};margin-bottom:18px;">
        <button id="stab-images" onclick="switchSettingsTab('images')"
          style="flex:1;padding:7px 0;font-size:.82rem;font-weight:700;background:none;border:none;cursor:pointer;color:var(--brand);border-bottom:2px solid var(--brand);margin-bottom:-2px;">
          <i class="fas fa-image"></i> Images
        </button>
        <button id="stab-customers" onclick="switchSettingsTab('customers')"
          style="flex:1;padding:7px 0;font-size:.82rem;font-weight:700;background:none;border:none;cursor:pointer;color:#9ca3af;border-bottom:2px solid transparent;margin-bottom:-2px;">
          <i class="fas fa-users"></i> Clients
        </button>
      </div>

      <!-- Images tab -->
      <div id="stab-images-panel">
        ${slots.length === 0
          ? '<p style="color:#9ca3af;font-size:.85rem;">No image slots on this page.</p>'
          : slots.map(({ selector, key, label }) => {
              const current = localStorage.getItem(key);
              return `<div style="margin-bottom:20px;">
                <label style="display:block;font-size:.82rem;font-weight:700;margin-bottom:8px;color:${fg};">${label}</label>
                ${current
                  ? `<img src="${current}" style="width:100%;border-radius:8px;margin-bottom:8px;max-height:120px;object-fit:contain;background:#111;" />`
                  : `<div style="width:100%;height:72px;background:${bg2};border-radius:8px;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:.78rem;margin-bottom:8px;">No custom image</div>`}
                <input type="file" accept="image/*" style="font-size:.78rem;width:100%;color:${fg};" onchange="handleSettingsUpload(event,'${key}','${selector}')" />
                ${current ? `<button onclick="resetSettingsImage('${key}','${selector}')" style="margin-top:6px;font-size:.75rem;background:none;border:1px solid ${bd};border-radius:6px;padding:4px 10px;cursor:pointer;color:#6b7280;">Reset to original</button>` : ''}
              </div>`;
            }).join('')
        }
      </div>

      <!-- Customers tab -->
      <div id="stab-customers-panel" style="display:none;">
        <div id="customers-list" style="display:flex;flex-direction:column;gap:8px;">
          <p style="color:#9ca3af;font-size:.82rem;text-align:center;padding:12px 0;"><i class="fas fa-spinner fa-spin"></i> Loading…</p>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
  };

  window.switchSettingsTab = function(tab) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bd = isDark ? '#2a2a3a' : '#e5e7eb';
    const imgBtn = document.getElementById('stab-images');
    const custBtn = document.getElementById('stab-customers');
    const imgPanel = document.getElementById('stab-images-panel');
    const custPanel = document.getElementById('stab-customers-panel');
    if (!imgBtn) return;

    if (tab === 'images') {
      imgBtn.style.color = 'var(--brand)'; imgBtn.style.borderBottom = '2px solid var(--brand)';
      custBtn.style.color = '#9ca3af'; custBtn.style.borderBottom = '2px solid transparent';
      imgPanel.style.display = ''; custPanel.style.display = 'none';
    } else {
      custBtn.style.color = 'var(--brand)'; custBtn.style.borderBottom = '2px solid var(--brand)';
      imgBtn.style.color = '#9ca3af'; imgBtn.style.borderBottom = '2px solid transparent';
      custPanel.style.display = ''; imgPanel.style.display = 'none';
      loadCustomers();
    }
  };

  async function loadCustomers() {
    const container = document.getElementById('customers-list');
    if (!container) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bg2 = isDark ? '#0f0f17' : '#f8fafc';
    const bd  = isDark ? '#2a2a3a' : '#e5e7eb';
    const fg  = isDark ? '#e5e7eb' : '#111827';
    const mut = isDark ? '#9ca3af' : '#6b7280';

    try {
      const sb = getSb();
      // Pull unique users from home_comments + project comments tables
      const { data: homeComments } = await sb
        .from('home_comments')
        .select('user_id, user_email, created_at')
        .order('created_at', { ascending: false });

      // Try project comments too if table exists
      let projComments = [];
      try {
        const { data: pc } = await sb
          .from('comments')
          .select('user_id, user_email, created_at')
          .order('created_at', { ascending: false });
        if (pc) projComments = pc;
      } catch(_) {}

      const all = [...(homeComments || []), ...projComments];

      // Deduplicate by user_id, keep latest activity
      const map = {};
      all.forEach(r => {
        if (!r.user_id) return;
        if (!map[r.user_id] || r.created_at > map[r.user_id].created_at) {
          map[r.user_id] = r;
        }
      });

      const users = Object.values(map).sort((a, b) => b.created_at.localeCompare(a.created_at));

      if (users.length === 0) {
        container.innerHTML = `<p style="color:${mut};font-size:.82rem;text-align:center;padding:16px 0;">No clients have logged in yet.</p>`;
        return;
      }

      function timeAgo(iso) {
        const s = Math.floor((Date.now() - new Date(iso)) / 1000);
        if (s < 60) return 'just now';
        if (s < 3600) return Math.floor(s/60) + 'm ago';
        if (s < 86400) return Math.floor(s/3600) + 'h ago';
        return Math.floor(s/86400) + 'd ago';
      }

      function initials(email) { return (email||'?').slice(0,2).toUpperCase(); }

      container.innerHTML = `
        <p style="font-size:.74rem;color:${mut};margin-bottom:4px;">${users.length} client${users.length!==1?'s':''} found</p>
        ${users.map(u => `
          <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:${bg2};border:1px solid ${bd};border-radius:9px;">
            <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--brand),#0088CC);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:.72rem;flex-shrink:0;">${initials(u.user_email)}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:.8rem;font-weight:700;color:${fg};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.user_email || 'Unknown'}</div>
              <div style="font-size:.72rem;color:${mut};">Last active: ${timeAgo(u.created_at)}</div>
            </div>
          </div>`).join('')}
      `;
    } catch(err) {
      container.innerHTML = `<p style="color:#f87171;font-size:.82rem;text-align:center;padding:12px 0;">Failed to load customers.</p>`;
    }
  }

  window.closeSettingsModal = function() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.style.display = 'none';
  };

  window.handleSettingsUpload = function(event, key, selector) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      const dataUrl = e.target.result;
      localStorage.setItem(key, dataUrl);
      document.querySelectorAll(selector).forEach(img => { img.src = dataUrl; });
      window.openSettingsModal(null);
    };
    reader.readAsDataURL(file);
  };

  window.resetSettingsImage = function(key, selector) {
    localStorage.removeItem(key);
    location.reload();
  };

  document.addEventListener('click', function(e) {
    const modal = document.getElementById('settings-modal');
    if (modal && e.target === modal) modal.style.display = 'none';
  });
})();
