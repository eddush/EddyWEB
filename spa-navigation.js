(() => {
  'use strict';

  // Keep long-lived UI nodes (especially the audio player) alive while Turbo
  // replaces the page body. Moving the actual nodes preserves their listeners
  // and the Audio instance created by music-player.js.
  document.addEventListener('turbo:before-render', (event) => {
    const nextBody = event.detail?.newBody;
    if (!nextBody) return;

    ['site-preferences', 'eddy-music-player', 'eddy-support-widget'].forEach((id) => {
      const persistent = document.getElementById(id);
      if (persistent && !nextBody.querySelector('#' + id)) {
        persistent.setAttribute('data-turbo-permanent', '');
        nextBody.appendChild(persistent);
      }
    });
  });

  // Preserve native browser behavior for downloads, external links, new tabs,
  // hash-only links and links explicitly opting out of Turbo.
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.target && link.target !== '_self') return;
    if (link.hasAttribute('download') || link.hasAttribute('data-turbo="false"')) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
  });
})();
