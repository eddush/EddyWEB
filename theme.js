(() => {
  const KEY = 'eddy-theme';
  function applyTheme() {
    const theme = localStorage.getItem(KEY) || 'light';
    document.body.dataset.theme = theme;
    let button = document.getElementById('theme-toggle');
    if (!button) {
      button = document.createElement('button');
      button.id = 'theme-toggle';
      button.type = 'button';
      button.className = 'lang-btn theme-btn theme-floating-toggle';
      button.style.cssText = 'position:fixed;z-index:10001;top:16px;right:16px;';
      button.setAttribute('aria-label', 'Switch color theme');
      document.body.appendChild(button);
    }
    const dark = theme === 'dark';
    button.textContent = dark ? '🌙 Dark' : '☀️ Light';
    button.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    button.setAttribute('aria-pressed', String(dark));
    button.onclick = () => {
      localStorage.setItem(KEY, document.body.dataset.theme === 'dark' ? 'light' : 'dark');
      applyTheme();
    };
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyTheme, { once: true });
  } else {
    applyTheme();
  }
})();