(() => {
  'use strict';

  // Preserve the live audio instance, shared controls and support chat while
  // Turbo replaces the page body. Moving the actual nodes keeps their event
  // listeners and the Audio object created by music-player.js alive.
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
})();
