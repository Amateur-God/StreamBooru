// Mobile hamburger menu: toggles the panel and forwards actions and tabs/search to existing controls
(function () {
  function qs(id) { return document.getElementById(id); }

  function openMenu() {
    const panel = qs('menu-panel');
    const backdrop = qs('menu-backdrop');
    const toggle = qs('menu-toggle');
    if (!panel || !backdrop || !toggle) return;
    panel.hidden = false;
    backdrop.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    // Focus the search input if present, otherwise first button
    const search = qs('mnu-tag-search');
    if (search) search.focus();
    else {
      const first = panel.querySelector('.menu-item');
      if (first) first.focus();
    }
  }

  function closeMenu() {
    const panel = qs('menu-panel');
    const backdrop = qs('menu-backdrop');
    const toggle = qs('menu-toggle');
    if (!panel || !backdrop || !toggle) return;
    panel.hidden = true;
    backdrop.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }

  function clickIf(el) { if (el) el.click(); }

  function setupForwarders() {
    // Actions
    const origDownload = qs('btn-download-all');
    const origManage = qs('btn-manage-sites');
    qs('mnu-download-all')?.addEventListener('click', () => { closeMenu(); clickIf(origDownload); });
    qs('mnu-manage-sites')?.addEventListener('click', () => { closeMenu(); clickIf(origManage); });

    // Tabs
    const tNew = qs('tab-new');
    const tPop = qs('tab-popular');
    const tSea = qs('tab-search');
    const tFav = qs('tab-faves');

    qs('mnu-tab-new')?.addEventListener('click', () => { closeMenu(); clickIf(tNew); });
    qs('mnu-tab-popular')?.addEventListener('click', () => { closeMenu(); clickIf(tPop); });
    qs('mnu-tab-search')?.addEventListener('click', () => { closeMenu(); clickIf(tSea); });
    qs('mnu-tab-faves')?.addEventListener('click', () => { closeMenu(); clickIf(tFav); });

    // Search forwarding
    const mForm = qs('mnu-search-form');
    if (mForm) {
      mForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = (qs('mnu-tag-search')?.value || '').trim();
        const mainInput = qs('tag-search');
        const mainForm = qs('search-form');
        const tabSearch = tSea;

        if (mainInput) mainInput.value = v;
        if (tabSearch) tabSearch.click(); // switch to Search tab
        // Submit the main form to trigger renderer.js logic
        if (mainForm) {
          if (typeof mainForm.requestSubmit === 'function') mainForm.requestSubmit();
          else mainForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
        closeMenu();
      });
    }
  }

  function setupToggle() {
    const toggle = qs('menu-toggle');
    const backdrop = qs('menu-backdrop');
    if (!toggle || !backdrop) return;

    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      if (expanded) closeMenu(); else openMenu();
    });

    backdrop.addEventListener('click', closeMenu);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupToggle();
      setupForwarders();
    });
  } else {
    setupToggle();
    setupForwarders();
  }
})();
