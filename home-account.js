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
  let currentDisplayName = '';
  let currentMinecraftUsername = '';

  function currentLanguage() {
    return localStorage.getItem('eddy-language') || document.documentElement.lang || 'en';
  }

  function signedOutLabel() {
    return currentLanguage() === 'he' ? 'התחברות / כניסה' : 'Sign in / Log in';
  }

  function getInternalMinecraftUsername(user) {
    const email = String(user?.email || '');
    const match = email.match(/^([a-z0-9_]{3,16})@minecraft\.eddyweb\.invalid$/i);
    return match ? match[1] : '';
  }

  function resolveMinecraftUsername(user) {
    const metadata = user?.user_metadata || {};
    const appMetadata = user?.app_metadata || {};
    return String(
      metadata.minecraft_username ||
      appMetadata.minecraft_username ||
      metadata.minecraftUsername ||
      getInternalMinecraftUsername(user) ||
      ''
    ).trim();
  }

  function resolveDisplayName(user) {
    const metadata = user?.user_metadata || {};
    const appMetadata = user?.app_metadata || {};
    const minecraftUsername = resolveMinecraftUsername(user);
    if (minecraftUsername) return minecraftUsername;

    const displayName = String(
      metadata.display_name ||
      metadata.full_name ||
      metadata.name ||
      appMetadata.display_name ||
      ''
    ).trim();
    if (displayName) return displayName;

    const email = String(user?.email || '');
    if (email && email.includes('@')) return email.split('@')[0];
    return currentLanguage() === 'he' ? 'החשבון שלי' : 'My account';
  }

  function updateLanguageLabel() {
    if (!currentUser) {
      label.textContent = signedOutLabel();
      return;
    }
    label.textContent = currentDisplayName || (currentLanguage() === 'he' ? 'החשבון שלי' : 'My account');
  }

  function showSignedOut() {
    currentUser = null;
    currentDisplayName = '';
    currentMinecraftUsername = '';
    navLink.dataset.authenticated = 'false';
    delete navLink.dataset.minecraftUsername;
    avatar.hidden = true;
    avatar.removeAttribute('src');
    avatar.onerror = null;
    if (icon) icon.hidden = false;
    label.textContent = signedOutLabel();
  }

  function showUser(user) {
    if (!user) {
      showSignedOut();
      return;
    }

    currentUser = user;
    currentMinecraftUsername = resolveMinecraftUsername(user);
    currentDisplayName = resolveDisplayName(user);
    navLink.dataset.authenticated = 'true';
    if (currentMinecraftUsername) navLink.dataset.minecraftUsername = currentMinecraftUsername;
    else delete navLink.dataset.minecraftUsername;
    updateLanguageLabel();

    const uuid = String(
      user.user_metadata?.minecraft_uuid ||
      user.app_metadata?.minecraft_uuid ||
      ''
    ).replace(/-/g, '').trim();

    // Only request a Minecraft head for a known Minecraft name or UUID.
    // Do not mistake an email display name for a Minecraft username.
    const candidates = [];
    if (currentMinecraftUsername) {
      candidates.push('https://mc-heads.net/avatar/' + encodeURIComponent(currentMinecraftUsername) + '/30');
      candidates.push('https://minotar.net/helm/' + encodeURIComponent(currentMinecraftUsername) + '/30.png');
      candidates.push('https://minotar.net/avatar/' + encodeURIComponent(currentMinecraftUsername) + '/30.png');
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
    avatar.alt = (currentMinecraftUsername || currentDisplayName || 'Minecraft') + ' Minecraft profile head';
    avatar.referrerPolicy = 'no-referrer';
    avatar.hidden = false;
    if (icon) icon.hidden = true;
    avatar.src = candidates[0];
  }

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

  window.eddyHomeAccount = {
    syncLanguage: updateLanguageLabel,
    refresh: () => client.auth.getSession()
      .then(({ data }) => showUser(data.session?.user || null))
      .catch(showSignedOut)
  };

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