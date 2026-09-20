(() => {
  'use strict';

  const SELECTORS = [
    'header',
    '.hero',
    '.news-section',
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
    '.news-editor .item-card'
  ];

  const CARD_SELECTORS = [
    '.news-card',
    '.cards .card',
    '.large-news-card',
    '.article-content > *',
    '.news-editor .item-card'
  ];

  let observer;

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

      element.style.setProperty('--scroll-delay', Math.min(index, 7) * 70 + 'ms');
      index += 1;
    });
  }

  function setupRevealObserver() {
    const elements = document.querySelectorAll('.scroll-animate');

    if (!('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-visible'));
      return;
    }

    observer = new IntersectionObserver((entries, instance) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        instance.unobserve(entry.target);
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -7% 0px'
    });

    elements.forEach((element) => {
      element.dataset.observed = 'true';
      observer.observe(element);
    });
  }

  function observeNewElements() {
    if (!observer) return;

    document.querySelectorAll('.scroll-animate:not([data-observed])').forEach((element) => {
      element.dataset.observed = 'true';
      observer.observe(element);
    });
  }

  function addProgressBar() {
    if (document.querySelector('.site-scroll-progress')) return;

    const progress = document.createElement('div');
    progress.className = 'site-scroll-progress';
    progress.setAttribute('aria-hidden', 'true');
    progress.innerHTML = '<span></span>';
    document.body.appendChild(progress);

    const fill = progress.firstElementChild;

    const update = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const percentage = scrollable > 0 ? (scrollTop / scrollable) * 100 : 0;
      fill.style.width = percentage + '%';
    };

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  }

  function init() {
    document.documentElement.classList.add('animations-enabled');
    addProgressBar();
    addScrollElements();
    setupRevealObserver();

    const mutationObserver = new MutationObserver(() => {
      addScrollElements();
      observeNewElements();
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();