(() => {
  'use strict';
  const path = window.location.pathname.split('/').pop() || 'index.html';
  if (path === 'index.html' || path === 'account.html') return;

  const lang = () => {
    try { return localStorage.getItem('eddy-language') || document.documentElement.lang || 'en'; }
    catch (_) { return document.documentElement.lang || 'en'; }
  };

  const link = document.createElement('a');
  link.className = 'account-site-link';
  link.href = 'account.html';
  link.innerHTML = '<i class="fa-regular fa-user" aria-hidden="true"></i><span></span>';
  const label = link.querySelector('span');

  function updateLabel() {
    const isHebrew = lang() === 'he';
    label.textContent = isHebrew ? 'החשבון שלי' : 'My account';
    link.setAttribute('aria-label', label.textContent);
  }
  updateLabel();

  const anchor = document.querySelector('.player-back, .info-back, .back-btn');
  if (anchor) {
    anchor.insertAdjacentElement('afterend', link);
  } else {
    const admin = document.querySelector('.admin-container');
    if (admin) admin.insertAdjacentElement('beforebegin', link);
    else document.body.appendChild(link);
  }

  ['staff-lang', 'rules-lang'].forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.addEventListener('click', () => window.setTimeout(updateLabel, 0));
  });
})();
