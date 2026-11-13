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
    const languageButton = getLanguageButton();
    if (button.parentElement !== controls) controls.appendChild(button);
    if (languageButton && languageButton.parentElement !== controls) controls.appendChild(languageButton);
    controls.classList.add('site-preferences');
    controls.setAttribute('aria-label', 'Language and appearance settings');
    button.classList.add('theme-floating-toggle');
    button.type = 'button';
    if (languageButton) {
      languageButton.classList.add('language-floating-toggle');
      languageButton.type = 'button';
    }

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

  function getLanguageButton() {
    const ids = [
      'lang-toggle',
      'language-toggle',
      'staff-lang',
      'account-language',
      'rules-lang',
      'admin-language-toggle',
      'article-language',
      'support-language'
    ];
    for (const id of ids) {
      const candidate = document.getElementById(id);
      if (candidate) return candidate;
    }
    return null;
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


// Add a bilingual copyright notice to the shared footer on every page.
(function () {
  function updateCopyright() {
    let footer = document.querySelector('footer');
    if (!footer) {
      footer = document.createElement('footer');
      document.body.appendChild(footer);
    }

    let notice = footer.querySelector('.eddy-copyright');
    if (!notice) {
      notice = document.createElement('p');
      notice.className = 'eddy-copyright';
      footer.appendChild(notice);
    }

    let isHebrew = document.documentElement.lang.toLowerCase().startsWith('he');
    try {
      const savedLanguage = localStorage.getItem('eddy-language');
      if (savedLanguage === 'he') isHebrew = true;
      else if (savedLanguage === 'en') isHebrew = false;
    } catch (_) {}

    const year = new Date().getFullYear();
    notice.textContent = isHebrew
      ? '© ' + year + ' EddyDev. כל הזכויות שמורות.'
      : '© ' + year + ' EddyDev. All rights reserved.';
    notice.setAttribute('dir', isHebrew ? 'rtl' : 'ltr');
    notice.setAttribute('lang', isHebrew ? 'he' : 'en');
  }

  function initCopyright() {
    if (!document.body) return;
    updateCopyright();
    const observer = new MutationObserver(updateCopyright);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'dir'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCopyright, { once: true });
  } else {
    initCopyright();
  }
})();
