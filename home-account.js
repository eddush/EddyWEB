(() => {
  'use strict';

  const SUPABASE_URL = 'https://vnhgkatsfpjyqpdppqrf.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_N6amZaYaWj7AdF8wQAHpEA_Qd2TAyp6';

  const avatar = document.getElementById('home-account-avatar');
  const icon = document.getElementById('account-nav-icon');
  const label = document.getElementById('account-nav-label');
  const navLink = document.getElementById('account-nav-link');
  if (!avatar || !label || !navLink) return;

  let currentUser = null;
  let currentUsername = '';

  function currentLanguage() {
    return localStorage.getItem('eddy-language') || document.documentElement.lang || 'en';
  }

  function signedOutLabel() {
    return currentLanguage() === 'he' ? 'התחברות / כניסה' : 'Sign in / Log in';
  }

  function showSignedOut() {
    currentUser = null;
    currentUsername = '';
    navLink.dataset.authenticated = 'false';
    delete navLink.dataset.minecraftUsername;
    avatar.hidden = true;
    avatar.removeAttribute('src');
    avatar.onerror = null;
    if (icon) icon.hidden = false;
    label.textContent = signedOutLabel();
  }

  function resolveMinecraftUsername(user) {
    const metadata = user?.user_metadata || {};
    const appMetadata = user?.app_metadata || {};
    const fromMetadata = String(
      metadata.minecraft_username ||
      appMetadata.minecraft_username ||
      metadata.minecraftUsername ||
      ''
    ).trim();
    if (fromMetadata) return fromMetadata;

    // Minecraft-only accounts use this internal email format.
    const email = String(user?.email || '');
    const match = email.match(/^([a-z0-9_]{3,16})@minecraft\.eddyweb\.invalid$/i);
    if (match) return match[1];

    return '';
  }

  function updateLanguageLabel() {
    const language = currentLanguage();
    if (!currentUser) {
      label.textContent = language === 'he' ? 'התחברות / כניסה' : 'Sign in / Log in';
      return;
    }
    label.textContent = currentUsername || (language === 'he' ? 'החשבון שלי' : 'My account');
  }

  function showUser(user) {
    if (!user) {
      showSignedOut();
      return;
    }

    currentUser = user;
    currentUsername = resolveMinecraftUsername(user);
    navLink.dataset.authenticated = 'true';
    if (currentUsername) navLink.dataset.minecraftUsername = currentUsername;
    else delete navLink.dataset.minecraftUsername;
    updateLanguageLabel();

    const uuid = String(
      user.user_metadata?.minecraft_uuid ||
      user.app_metadata?.minecraft_uuid ||
      ''
    ).replace(/-/g, '').trim();

    const candidates = [];
    if (currentUsername) {
      candidates.push('https://mc-heads.net/avatar/' + encodeURIComponent(currentUsername) + '/30');
      candidates.push('https://minotar.net/helm/' + encodeURIComponent(currentUsername) + '/30.png');
      candidates.push('https://minotar.net/avatar/' + encodeURIComponent(currentUsername) + '/30.png');
    }
    if (uuid) {
      candidates.push('https://mc-heads.net/avatar/' + encodeURIComponent(uuid) + '/30');
      candidates.push('https://crafatar.com/avatars/' + encodeURIComponent(uuid) + '?size=30&overlay');
    }

    if (!candidates.length) {
      avatar.hidden = true;
      avatar.removeAttribute('src');
      avatar.onerror = null;
      if (icon) icon.hidden = false;
      return;
    }

    let candidateIndex = 0;
    avatar.onerror = () => {
      candidateIndex += 1;
      if (candidateIndex < candidates.length) {
        avatar.src = candidates[candidateIndex];
        return;
      }
      avatar.hidden = true;
      avatar.removeAttribute('src');
      if (icon) icon.hidden = false;
      console.warn('[EddyWEB] Unable to load Minecraft avatar for this account.');
    };
    avatar.alt = (currentUsername || 'Minecraft') + ' Minecraft profile head';
    avatar.referrerPolicy = 'no-referrer';
    avatar.hidden = false;
    if (icon) icon.hidden = true;
    avatar.src = candidates[0];
  }

  window.eddyHomeAccount = {
    syncLanguage: updateLanguageLabel,
    refresh: () => client.auth.getSession().then(({ data }) => showUser(data.session?.user || null)).catch(showSignedOut)
  };

  if (!window.supabase?.createClient) {
    showSignedOut();
    console.error('[EddyWEB] Supabase client did not load on the homepage.');
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  client.auth.getSession()
    .then(({ data, error }) => {
      if (error) throw error;
      showUser(data.session?.user || null);
    })
    .catch((error) => {
      showSignedOut();
      console.error('[EddyWEB] Could not read the homepage sign-in session:', error);
    });

  client.auth.onAuthStateChange((_event, session) => showUser(session?.user || null));

  window.addEventListener('storage', (event) => {
    if (event.key === 'eddy-language') updateLanguageLabel();
  });
})();