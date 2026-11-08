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

    const controls = getControls();
    const button = document.getElementById('theme-toggle') || createButton();
    const languageButton = document.getElementById('lang-toggle');
    if (button.parentElement !== controls) controls.appendChild(button);
    if (languageButton && languageButton.parentElement !== controls) controls.appendChild(languageButton);
    controls.classList.add('site-preferences');
    button.classList.add('theme-floating-toggle');
    button.type = 'button';
    if (languageButton) languageButton.classList.add('language-floating-toggle');

    const he = (() => {
      try { return localStorage.getItem('eddy-language') === 'he'; }
      catch (_) { return document.documentElement.lang === 'he'; }
    })();
    const labels = he
      ? { toLight: 'החלפה למצב בהיר', toDark: 'החלפה למצב כהה' }
      : { toLight: 'Switch to light mode', toDark: 'Switch to dark mode' };

    button.innerHTML = selected === DARK
      ? '<i class="fa-solid fa-moon" aria-hidden="true"></i>'
      : '<i class="fa-solid fa-sun" aria-hidden="true"></i>';
    button.setAttribute('aria-label', selected === DARK ? labels.toLight : labels.toDark);
    button.title = selected === DARK ? labels.toLight : labels.toDark;
    button.setAttribute('aria-pressed', String(selected === DARK));
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const next = document.documentElement.dataset.theme === DARK ? LIGHT : DARK;
      try { localStorage.setItem(KEY, next); } catch (_) {}
      applyTheme(next);
    };
  }

  function getControls() {
    let controls = document.getElementById('site-preferences');
    if (!controls) {
      controls = document.createElement('div');
      controls.id = 'site-preferences';
      controls.className = 'site-preferences';
      controls.setAttribute('aria-label', 'Language and appearance settings');
      document.body.appendChild(controls);
    }
    return controls;
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

// Load the floating EddyWEB support chat on every page.
(function () {
  function load() {
    if (document.getElementById('eddy-support-widget-script')) return;
    const script = document.createElement('script');
    script.id = 'eddy-support-widget-script';
    script.src = '/support-widget.js?v=2';
    script.defer = true;
    document.body.appendChild(script);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load, { once: true });
  } else {
    load();
  }
})();
