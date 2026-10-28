(() => {
  'use strict';
  const KEY = 'eddy-theme';
  const DARK = 'dark';
  const LIGHT = 'light';

  function readTheme() {
    try { return localStorage.getItem(KEY) === DARK ? DARK : LIGHT; }
    catch (_) { return document.documentElement.dataset.theme === DARK ? DARK : LIGHT; }
  }

  function applyTheme(theme) {
    const selected = theme === DARK ? DARK : LIGHT;
    document.documentElement.dataset.theme = selected;
    document.body.dataset.theme = selected;
    document.documentElement.style.colorScheme = selected;
    const button = document.getElementById('theme-toggle') || createButton();
    button.classList.add('theme-floating-toggle');
    button.type = 'button';
    button.textContent = selected === DARK ? '🌙 מצב כהה' : '☀️ מצב בהיר';
    button.setAttribute('aria-label', selected === DARK ? 'החלפה למצב בהיר' : 'החלפה למצב כהה');
    button.setAttribute('aria-pressed', String(selected === DARK));
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const next = document.documentElement.dataset.theme === DARK ? LIGHT : DARK;
      try { localStorage.setItem(KEY, next); } catch (_) {}
      applyTheme(next);
    };
  }

  function createButton() {
    const button = document.createElement('button');
    button.id = 'theme-toggle';
    button.className = 'lang-btn theme-btn theme-floating-toggle';
    button.type = 'button';
    button.setAttribute('aria-label', 'החלפת מצב תצוגה');
    document.body.appendChild(button);
    return button;
  }

  function init() {
    if (!document.body) return;
    applyTheme(readTheme());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();