(() => {
  'use strict';

  const SUPABASE_URL = 'https://vnhgkatsfpjyqpdppqrf.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_N6amZaYaWj7AdF8wQAHpEA_Qd2TAyp6';

  const avatar = document.getElementById('home-account-avatar');
  const icon = document.getElementById('account-nav-icon');
  const label = document.getElementById('account-nav-label');
  if (!avatar || !window.supabase?.createClient) return;

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  function showSignedOut() {
    avatar.hidden = true;
    avatar.removeAttribute('src');
    if (icon) icon.hidden = false;
    if (label) label.textContent = (localStorage.getItem('eddy-language') || 'en') === 'he' ? 'חשבון' : 'Account';
  }

  function showUser(user) {
    if (!user) {
      showSignedOut();
      return;
    }

    const metadata = user.user_metadata || {};
    const minecraftUsername = String(metadata.minecraft_username || metadata.display_name || '').trim();
    const uuid = String(metadata.minecraft_uuid || user.app_metadata?.minecraft_uuid || '').replace(/-/g, '').trim();

    if (label) {
      const language = localStorage.getItem('eddy-language') || 'en';
      label.textContent = minecraftUsername || (language === 'he' ? 'החשבון שלי' : 'My account');
    }

    if (!minecraftUsername && !uuid) {
      avatar.hidden = true;
      if (icon) icon.hidden = false;
      return;
    }

    avatar.onerror = () => {
      if (uuid && avatar.dataset.fallbackTried !== 'uuid') {
        avatar.dataset.fallbackTried = 'uuid';
        avatar.src = 'https://mc-heads.net/avatar/' + encodeURIComponent(uuid) + '/30';
        return;
      }
      avatar.hidden = true;
      if (icon) icon.hidden = false;
    };

    avatar.dataset.fallbackTried = '';
    avatar.alt = (minecraftUsername || 'Minecraft') + ' Minecraft profile head';
    avatar.src = 'https://mc-heads.net/avatar/' + encodeURIComponent(minecraftUsername || uuid) + '/30';
    avatar.hidden = false;
    if (icon) icon.hidden = true;
  }

  client.auth.getSession().then(({ data, error }) => {
    if (error) {
      showSignedOut();
      return;
    }
    showUser(data.session?.user || null);
  }).catch(showSignedOut);

  client.auth.onAuthStateChange((_event, session) => showUser(session?.user || null));

  window.addEventListener('storage', (event) => {
    if (event.key === 'eddy-language') {
      client.auth.getSession().then(({ data }) => showUser(data.session?.user || null)).catch(() => {});
    }
  });
})();