(() => {
  'use strict';

  const SELECTORS = [
    'header',
    '.hero',
    '.news-section',
    '.section-heading',
    '.news-card',
    '.cards .card',
    '.large-news-container',
    '.large-news-card',
    'footer',
    '.article-container',
    '.article-header',
    '.article-content > *',
    '.admin-container > .login-box',
    '.admin-container > .news-editor',
    '.news-editor .item-card',
    '.player-search-panel',
    '.player-hero-card',
    '.player-info-card',
    '.player-stat-card',
    '.staff-card',
    '.staff-member',
    '.rule-item',
    '.rules-section',
    '.info-card',
    '.login-box',
    '.account-container',
    '.account-card',
    '.connect-container',
    '.connect-card',
    '.server-card',
    '.profile-card',
    'main > section',
    '.staff-grid > *',
    '.staff-list > *',
    '.rules-list > *',
    '.rule-group',
    '.support-container > *',
    '.support-page > *',
    '.account-layout > *',
    '.account-form',
    '.connect-panel',
    '.connect-steps > *',
    '.page-content > *',
    '.content-card',
    '.settings-card',
    '.dashboard-card',
    '.form-section',
    '.section-card',
    '.faq-item',
    'main > article',
    'main > .container',
    'main > .page-content',
    'main > .content-wrapper'
  ];

  const CARD_SELECTORS = [
    '.news-card',
    '.cards .card',
    '.large-news-card',
    '.article-content > *',
    '.news-editor .item-card',
    '.player-info-card',
    '.player-stat-card',
    '.staff-card',
    '.staff-member',
    '.rule-item',
    '.info-card',
    '.account-card',
    '.connect-card',
    '.server-card',
    '.profile-card',
    '.rule-group',
    '.faq-item',
    '.content-card',
    '.settings-card',
    '.dashboard-card',
    '.section-card'
  ];

  let revealObserver = null;
  let mutationObserver = null;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function addScrollElements(root = document) {
    const nodes = root.querySelectorAll(SELECTORS.join(','));
    let index = 0;

    nodes.forEach((element) => {
      if (!(element instanceof HTMLElement) || element.dataset.scrollAnimated === 'true') return;
      element.dataset.scrollAnimated = 'true';
      element.classList.add('scroll-animate');

      if (CARD_SELECTORS.some((selector) => element.matches(selector))) {
        element.classList.add('scroll-animate--card');
      }

      element.style.setProperty('--scroll-delay', Math.min(index, 5) * 65 + 'ms');
      index += 1;
    });
  }

  function revealAll() {
    document.querySelectorAll('.scroll-animate').forEach((element) => {
      element.classList.add('is-visible');
      element.dataset.observed = 'true';
    });
  }

  function observeElements(root = document) {
    if (!revealObserver) return;
    root.querySelectorAll('.scroll-animate:not([data-observed])').forEach((element) => {
      element.dataset.observed = 'true';
      revealObserver.observe(element);
    });
  }

  function setupRevealObserver() {
    if (reducedMotion || !('IntersectionObserver' in window)) {
      revealAll();
      return;
    }

    revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, {
      threshold: 0.08,
      rootMargin: '0px 0px -5% 0px'
    });

    observeElements();
  }

  function addProgressBar() {
    if (reducedMotion || document.querySelector('.site-scroll-progress')) return;

    const progress = document.createElement('div');
    progress.className = 'site-scroll-progress';
    progress.setAttribute('aria-hidden', 'true');
    progress.innerHTML = '<span></span>';
    document.body.appendChild(progress);

    const fill = progress.firstElementChild;
    let scheduled = false;

    const update = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        const percentage = scrollable > 0 ? Math.min(100, Math.max(0, scrollTop / scrollable * 100)) : 0;
        fill.style.width = percentage + '%';
        scheduled = false;
      });
    };

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  }

  function init() {
    if (document.documentElement.dataset.motionReady === 'true') return;

    addScrollElements();
    setupRevealObserver();
    addProgressBar();

    // Enable reveal styles only after every initial element is observed.
    // This avoids leaving content invisible if a script fails part-way through.
    document.documentElement.classList.add('animations-enabled');
    document.documentElement.dataset.motionReady = 'true';

    mutationObserver = new MutationObserver((records) => {
      let hasAddedNodes = false;
      records.forEach((record) => {
        if (record.addedNodes.length) hasAddedNodes = true;
      });
      if (!hasAddedNodes) return;
      addScrollElements();
      observeElements();
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();