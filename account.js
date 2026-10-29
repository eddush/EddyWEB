(() => {
  'use strict';

  const SUPABASE_URL = 'https://vnhgkatsfpjyqpdppqrf.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_N6amZaYaWj7AdF8wQAHpEA_Qd2TAyp6';

  const $ = (id) => document.getElementById(id);
  const supabaseLib = window.supabase;
  const loginUrl = new URL('/account.html', window.location.origin).href;
  let mode = 'login';
  let currentUser = null;
  let language = localStorage.getItem('eddy-language') || 'he';
  let recoveryMode = new URLSearchParams(window.location.search).get('mode') === 'recovery';

  const translations = {
    he: {
      back: '← חזרה ל-EddyWEB',
      badge: 'חשבון EddyWEB',
      title: 'החשבון שלך',
      intro: 'התחברות, הרשמה וניהול פרטי החשבון שלך.',
      language: 'English',
      login: 'התחברות',
      signup: 'יצירת חשבון',
      displayName: 'שם תצוגה',
      minecraft: 'שם משתמש ב-Minecraft (לא חובה)',
      email: 'כתובת דוא״ל',
      password: 'סיסמה',
      confirmPassword: 'אימות סיסמה',
      loginButton: 'התחברות',
      signupButton: 'יצירת חשבון',
      forgot: 'שכחתי את הסיסמה',
      accountTitle: 'החשבון שלי',
      connectedAs: 'מחובר בתור:',
      saveProfile: 'שמור פרטים',
      logout: 'התנתקות',
      recoveryTitle: 'בחירת סיסמה חדשה',
      recoveryIntro: 'הזן סיסמה חדשה לחשבון שלך.',
      newPassword: 'סיסמה חדשה',
      confirmNewPassword: 'אימות הסיסמה החדשה',
      updatePassword: 'עדכון סיסמה',
      invalidMinecraft: 'שם Minecraft חייב להכיל 3–16 אותיות באנגלית, מספרים או קו תחתון.',
      passwordMismatch: 'הסיסמאות אינן תואמות.',
      passwordTooShort: 'הסיסמה חייבת להכיל לפחות 8 תווים.',
      signingIn: 'מתחבר...',
      creatingAccount: 'יוצר את החשבון...',
      sendingReset: 'שולח הודעת איפוס...',
      savingProfile: 'שומר פרטים...',
      savingPassword: 'מעדכן סיסמה...',
      signedIn: 'התחברת בהצלחה.',
      signedOut: 'התנתקת מהחשבון.',
      confirmation: 'נשלח אליך מייל לאימות. יש לפתוח את הקישור כדי להפעיל את החשבון.',
      resetSent: 'אם קיים חשבון עם הכתובת הזו, יישלח אליו קישור לאיפוס סיסמה.',
      profileSaved: 'פרטי החשבון נשמרו.',
      passwordUpdated: 'הסיסמה עודכנה בהצלחה.',
      authError: 'לא ניתן להשלים את הפעולה. בדוק את הפרטים ונסה שוב.',
      redirectConfig: 'כדי שאימות ואיפוס סיסמה יעבדו, יש להוסיף את כתובת האתר ברשימת Redirect URLs של Supabase.',
      passwordError: 'הסיסמה או כתובת הדוא״ל אינם נכונים, או שהחשבון עדיין לא אומת.',
      loadError: 'לא ניתן לטעון את מערכת החשבונות. נסה לרענן את הדף.',
      emailRequired: 'יש להזין כתובת דוא״ל תקינה.',
      verifyEmail: 'בדוק את תיבת הדוא״ל כדי לאמת את החשבון לפני ההתחברות.',
      sessionExpired: 'הקישור אינו תקף או שפג תוקפו. בקש קישור חדש.',
      accountCreated: 'החשבון נוצר.',
      fillRequired: 'יש למלא את כל השדות הנדרשים.',
      profileUpdated: 'פרטי המשתמש עודכנו.',
      linkMinecraft: 'חבר חשבון Minecraft',
      minecraftLinked: 'חשבון Minecraft מחובר:',
      minecraftLinkDescription: 'חבר את חשבון Minecraft שלך לחשבון EDDYWEB.',
      minecraftLinkInstructions: 'היכנס לשרת Minecraft וכתוב את הפקודה הבאה:',
      minecraftCopyCommand: 'העתק פקודה',
      minecraftLinkWaiting: 'ממתין שהשרת יאמת את הקוד…',
      minecraftLinkSuccess: 'חשבון Minecraft חובר בהצלחה!',
      minecraftLinkExpired: 'לא הצלחנו לאמת את הקוד. צור קוד חדש ונסה שוב.',
      minecraftLinkError: 'לא ניתן לבדוק את הקוד כרגע. נסה שוב בעוד רגע.',
      minecraftLinkCopied: 'הפקודה הועתקה.',
      minecraftAlreadyLinked: 'Minecraft מחובר לחשבון זה:'
    },
    en: {
      back: '← Back to EddyWEB',
      badge: 'EDDYWEB ACCOUNT',
      title: 'Your account',
      intro: 'Sign in, create an account, and manage your profile.',
      language: 'עברית',
      login: 'Sign in',
      signup: 'Create account',
      displayName: 'Display name',
      minecraft: 'Minecraft username (optional)',
      email: 'Email address',
      password: 'Password',
      confirmPassword: 'Confirm password',
      loginButton: 'Sign in',
      signupButton: 'Create account',
      forgot: 'Forgot password?',
      accountTitle: 'My account',
      connectedAs: 'Signed in as:',
      saveProfile: 'Save profile',
      logout: 'Sign out',
      recoveryTitle: 'Choose a new password',
      recoveryIntro: 'Enter a new password for your account.',
      newPassword: 'New password',
      confirmNewPassword: 'Confirm new password',
      updatePassword: 'Update password',
      invalidMinecraft: 'Minecraft usernames must be 3–16 English letters, numbers, or underscores.',
      passwordMismatch: 'The passwords do not match.',
      passwordTooShort: 'Password must contain at least 8 characters.',
      signingIn: 'Signing in...',
      creatingAccount: 'Creating account...',
      sendingReset: 'Sending reset email...',
      savingProfile: 'Saving profile...',
      savingPassword: 'Updating password...',
      signedIn: 'You are signed in.',
      signedOut: 'You have signed out.',
      confirmation: 'A confirmation email has been sent. Open the link to activate your account.',
      resetSent: 'If an account exists for that email, a password reset link will be sent.',
      profileSaved: 'Your profile has been saved.',
      passwordUpdated: 'Your password has been updated.',
      authError: 'The request could not be completed. Check the details and try again.',
      redirectConfig: 'Add this site to the Redirect URLs in Supabase Authentication settings so email confirmation and password reset can return to the site.',
      passwordError: 'Email or password is incorrect, or the account has not been verified.',
      loadError: 'Unable to load accounts. Please refresh the page.',
      emailRequired: 'Enter a valid email address.',
      verifyEmail: 'Check your email to verify your account before signing in.',
      sessionExpired: 'This link is invalid or expired. Request a new one.',
      accountCreated: 'Account created.',
      fillRequired: 'Please complete all required fields.',
      profileUpdated: 'Your profile has been updated.',
      linkMinecraft: 'Link Minecraft account',
      minecraftLinked: 'Minecraft account connected:',
      minecraftLinkDescription: 'Connect your Minecraft account to your EDDYWEB account.',
      minecraftLinkInstructions: 'Join the Minecraft server and enter this command:',
      minecraftCopyCommand: 'Copy command',
      minecraftLinkWaiting: 'Waiting for the server to verify the code…',
      minecraftLinkSuccess: 'Minecraft account linked successfully!',
      minecraftLinkExpired: 'We could not verify the code. Generate a new one and try again.',
      minecraftLinkError: 'Could not check the code right now. Try again shortly.',
      minecraftLinkCopied: 'Command copied.',
      minecraftAlreadyLinked: 'Minecraft connected to this account:'
    }
  };

  const t = () => translations[language] || translations.he;

  function setStatus(id, message, kind = '') {
    const el = $(id);
    if (!el) return;
    el.textContent = message;
    el.dataset.kind = kind;
  }

  function updateLanguageText() {
    const x = t();
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'he' ? 'rtl' : 'ltr';
    document.title = language === 'he' ? 'EddyWEB | חשבון' : 'EddyWEB | Account';

    const textMap = {
      'account-back': x.back,
      'account-badge': x.badge,
      'account-title': x.title,
      'account-intro': x.intro,
      'account-language': x.language,
      'tab-login': x.login,
      'tab-signup': x.signup,
      'label-signup-display-name': x.displayName,
      'label-signup-minecraft': x.minecraft,
      'label-email': x.email,
      'label-password': x.password,
      'label-confirm-password': x.confirmPassword,
      'forgot-password': x.forgot,
      'profile-heading': x.accountTitle,
      'profile-email-label': x.connectedAs,
      'label-profile-display-name': x.displayName,
      'label-profile-minecraft': x.minecraft,
      'save-profile': x.saveProfile,
      'logout-button': x.logout,
      'recovery-heading': x.recoveryTitle,
      'recovery-intro': x.recoveryIntro,
      'label-new-password': x.newPassword,
      'label-new-password-confirm': x.confirmNewPassword,
      'save-new-password': x.updatePassword
    };

    Object.entries(textMap).forEach(([id, text]) => {
      const el = $(id);
      if (el) el.textContent = text;
    });
    renderMode();
  }

  function renderMode() {
    const x = t();
    const signup = mode === 'signup';
    $('signup-fields').hidden = !signup;
    $('confirm-password-wrap').hidden = !signup;
    $('signup-display-name').required = signup;
    $('confirm-password').required = signup;
    $('signup-minecraft').required = false;
    $('account-password').autocomplete = signup ? 'new-password' : 'current-password';
    $('tab-login').classList.toggle('is-active', !signup);
    $('tab-signup').classList.toggle('is-active', signup);
    $('tab-login').setAttribute('aria-selected', String(!signup));
    $('tab-signup').setAttribute('aria-selected', String(signup));
    $('submit-auth').textContent = signup ? x.signupButton : x.loginButton;
    $('forgot-password').hidden = signup;
  }

  function showAuth() {
    $('auth-panel').hidden = false;
    $('profile-panel').hidden = true;
    $('recovery-panel').hidden = true;
    if (recoveryMode) recoveryMode = false;
  }

  function showProfile(user, statusText = '') {
    if (!user) return;
    currentUser = user;
    $('auth-panel').hidden = true;
    $('recovery-panel').hidden = true;
    $('profile-panel').hidden = false;
    $('profile-email').textContent = user.email || '';
    const metadata = user.user_metadata || {};
    $('profile-display-name').value = metadata.display_name || '';
    $('profile-minecraft').value = metadata.minecraft_username || '';
    setStatus('profile-status', statusText, statusText ? 'success' : '');
    renderMinecraftLink(user);
  }

  function showRecovery() {
    $('auth-panel').hidden = true;
    $('profile-panel').hidden = true;
    $('recovery-panel').hidden = false;
  }

  function explainError(error, fallback = t().authError) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('invalid login credentials') || message.includes('email not confirmed')) return t().passwordError;
    if (message.includes('password should be at least') || message.includes('password is too short')) return t().passwordTooShort;
    if (message.includes('redirect') && (message.includes('not allowed') || message.includes('not permitted'))) return t().redirectConfig;
    return fallback;
  }

  if (!supabaseLib || typeof supabaseLib.createClient !== 'function') {
    $('auth-panel').hidden = false;
    setStatus('auth-status', translations[language].loadError, 'error');
    return;
  }

  const client = supabaseLib.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  $('account-language').addEventListener('click', () => {
    language = language === 'he' ? 'en' : 'he';
    try { localStorage.setItem('eddy-language', language); } catch (_) {}
    updateLanguageText();
  });

  $('tab-login').addEventListener('click', () => { mode = 'login'; setStatus('auth-status', ''); renderMode(); });
  $('tab-signup').addEventListener('click', () => { mode = 'signup'; setStatus('auth-status', ''); renderMode(); });

  $('auth-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = $('account-email').value.trim();
    const password = $('account-password').value;
    const x = t();
    setStatus('auth-status', mode === 'signup' ? x.creatingAccount : x.signingIn, 'loading');
    $('submit-auth').disabled = true;
    try {
      if (!email) {
        setStatus('auth-status', x.emailRequired, 'error');
        return;
      }

      if (mode === 'signup') {
        const displayName = $('signup-display-name').value.trim();
        const minecraftUsername = $('signup-minecraft').value.trim();
        const confirmPassword = $('confirm-password').value;
        if (password.length < 8) {
          setStatus('auth-status', x.passwordTooShort, 'error');
          return;
        }
        if (password !== confirmPassword) {
          setStatus('auth-status', x.passwordMismatch, 'error');
          return;
        }
        if (minecraftUsername && !/^[A-Za-z0-9_]{3,16}$/.test(minecraftUsername)) {
          setStatus('auth-status', x.invalidMinecraft, 'error');
          return;
        }

        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName, minecraft_username: minecraftUsername },
            emailRedirectTo: loginUrl
          }
        });
        if (error) throw error;
        if (data.session && data.user) {
          recoveryMode = false;
          showProfile(data.user, x.accountCreated);
        } else {
          setStatus('auth-status', x.confirmation, 'success');
        }
      } else {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) showProfile(data.user, x.signedIn);
      }
    } catch (error) {
      setStatus('auth-status', explainError(error), 'error');
    } finally {
      $('submit-auth').disabled = false;
    }
  });

  $('forgot-password').addEventListener('click', async () => {
    const email = $('account-email').value.trim();
    if (!email) {
      setStatus('auth-status', t().emailRequired, 'error');
      $('account-email').focus();
      return;
    }
    setStatus('auth-status', t().sendingReset, 'loading');
    $('forgot-password').disabled = true;
    try {
      const redirectTo = new URL('/account.html?mode=recovery', window.location.origin).href;
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      setStatus('auth-status', t().resetSent, 'success');
    } catch (error) {
      setStatus('auth-status', explainError(error), 'error');
    } finally {
      $('forgot-password').disabled = false;
    }
  });

  let minecraftLinkPoll = null;
  let activeMinecraftCode = '';

  function renderMinecraftLink(user) {
    const metadata = user?.user_metadata || {};
    const username = String(metadata.minecraft_username || '').trim();
    const uuid = String(metadata.minecraft_uuid || '').trim();
    const startButton = $('minecraft-link-start');
    const codeWrap = $('minecraft-link-code-wrap');
    const status = $('minecraft-linked-status');
    if (!startButton || !codeWrap || !status) return;

    if (uuid && username) {
      status.textContent = `${t().minecraftAlreadyLinked} ${username}`;
      status.dataset.kind = 'success';
      startButton.textContent = language === 'he' ? 'חבר חשבון Minecraft אחר' : 'Link another Minecraft account';
    } else {
      status.textContent = t().minecraftLinkDescription;
      status.dataset.kind = '';
      startButton.textContent = t().linkMinecraft;
    }
  }

  function stopMinecraftLinkPolling() {
    if (minecraftLinkPoll) {
      clearInterval(minecraftLinkPoll);
      minecraftLinkPoll = null;
    }
  }

  async function getAccountAccessToken() {
    const { data } = await client.auth.getSession();
    return data?.session?.access_token || '';
  }

  $('minecraft-link-start').addEventListener('click', async () => {
    if (!currentUser) return;
    stopMinecraftLinkPolling();
    $('minecraft-link-start').disabled = true;
    $('minecraft-link-waiting').textContent = t().minecraftLinkWaiting;
    $('minecraft-link-code-wrap').hidden = true;

    try {
      const accessToken = await getAccountAccessToken();
      if (!accessToken) throw new Error('No active session');
      const createResponse = await fetch('/api/minecraft-link/create', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + accessToken }
      });
      const created = await createResponse.json();
      if (!createResponse.ok || !created.success || !created.code) {
        throw new Error(created.message || 'Could not create a link code');
      }

      activeMinecraftCode = created.code;
      $('minecraft-link-command').textContent = '/link ' + activeMinecraftCode;
      $('minecraft-link-code-wrap').hidden = false;
      $('minecraft-link-waiting').textContent = t().minecraftLinkWaiting;

      const checkStatus = async () => {
        if (!currentUser || !activeMinecraftCode) return;
        try {
          const token = await getAccountAccessToken();
          if (!token) throw new Error('No active session');
          const response = await fetch('/api/minecraft-link/status?code=' + encodeURIComponent(activeMinecraftCode), {
            headers: { Authorization: 'Bearer ' + token }
          });
          const result = await response.json();
          if (response.ok && result.success && result.player?.uuid && result.player?.username && result.rowId) {
            const { data, error } = await client.auth.updateUser({
              data: {
                minecraft_username: result.player.username,
                minecraft_uuid: result.player.uuid
              }
            });
            if (error) throw error;

            // The account is linked once Supabase metadata has been saved. Cleanup is best-effort:
            // a cleanup failure must not make the UI report that a successful link failed.
            stopMinecraftLinkPolling();
            activeMinecraftCode = '';
            $('minecraft-link-waiting').textContent = t().minecraftLinkSuccess;
            $('minecraft-link-waiting').dataset.kind = 'success';
            showProfile(data.user, t().minecraftLinkSuccess);
            $('minecraft-link-start').disabled = false;

            try {
              const completeResponse = await fetch('/api/minecraft-link/complete', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: 'Bearer ' + token
                },
                body: JSON.stringify({ code: activeMinecraftCode || created.code, rowId: result.rowId })
              });
              if (!completeResponse.ok) {
                console.warn('Minecraft link succeeded, but temporary-code cleanup failed:', await completeResponse.text());
              }
            } catch (cleanupError) {
              console.warn('Minecraft link succeeded, but temporary-code cleanup failed:', cleanupError);
            }
          } else if (response.status === 404) {
            // Code has not reached LuckPerms yet; keep polling until the code expires.
          } else if (!response.ok) {
            throw new Error(result.message || 'Link status request failed');
          }
        } catch (error) {
          console.warn('Minecraft link check failed:', error);
          $('minecraft-link-waiting').textContent = t().minecraftLinkError;
          $('minecraft-link-waiting').dataset.kind = 'error';
        }
      };

      await checkStatus();
      minecraftLinkPoll = setInterval(checkStatus, 3000);
    } catch (error) {
      console.warn('Minecraft link code creation failed:', error);
      $('minecraft-link-waiting').textContent = t().minecraftLinkError;
      $('minecraft-link-waiting').dataset.kind = 'error';
      $('minecraft-link-code-wrap').hidden = false;
      $('minecraft-link-start').disabled = false;
    }
  });

  $('minecraft-link-copy').addEventListener('click', async () => {
    const command = $('minecraft-link-command').textContent;
    try {
      await navigator.clipboard.writeText(command);
      $('minecraft-link-waiting').textContent = t().minecraftLinkCopied;
      $('minecraft-link-waiting').dataset.kind = 'success';
    } catch (_) {
      $('minecraft-link-waiting').textContent = command;
    }
  });

  $('profile-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const displayName = $('profile-display-name').value.trim();
    const minecraftUsername = $('profile-minecraft').value.trim();
    const x = t();
    if (!displayName) {
      setStatus('profile-status', x.fillRequired, 'error');
      return;
    }
    if (minecraftUsername && !/^[A-Za-z0-9_]{3,16}$/.test(minecraftUsername)) {
      setStatus('profile-status', x.invalidMinecraft, 'error');
      return;
    }

    $('save-profile').disabled = true;
    setStatus('profile-status', x.savingProfile, 'loading');
    try {
      const { data, error } = await client.auth.updateUser({
        data: { display_name: displayName, minecraft_username: minecraftUsername }
      });
      if (error) throw error;
      showProfile(data.user, x.profileSaved);
    } catch (error) {
      setStatus('profile-status', explainError(error), 'error');
    } finally {
      $('save-profile').disabled = false;
    }
  });

  $('logout-button').addEventListener('click', async () => {
    $('logout-button').disabled = true;
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      currentUser = null;
      showAuth();
      setStatus('auth-status', t().signedOut, 'success');
    } catch (error) {
      setStatus('profile-status', explainError(error), 'error');
    } finally {
      $('logout-button').disabled = false;
    }
  });

  $('recovery-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = $('new-password').value;
    const confirmPassword = $('new-password-confirm').value;
    const x = t();
    if (password.length < 8) {
      setStatus('recovery-status', x.passwordTooShort, 'error');
      return;
    }
    if (password !== confirmPassword) {
      setStatus('recovery-status', x.passwordMismatch, 'error');
      return;
    }
    $('save-new-password').disabled = true;
    setStatus('recovery-status', x.savingPassword, 'loading');
    try {
      const { data, error } = await client.auth.updateUser({ password });
      if (error) throw error;
      recoveryMode = false;
      try { window.history.replaceState({}, document.title, '/account.html'); } catch (_) {}
      showProfile(data.user, x.passwordUpdated);
    } catch (error) {
      setStatus('recovery-status', explainError(error, x.sessionExpired), 'error');
    } finally {
      $('save-new-password').disabled = false;
    }
  });

  client.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      recoveryMode = true;
      showRecovery();
      return;
    }
    if (recoveryMode) return;
    if (event === 'SIGNED_OUT') {
      currentUser = null;
      showAuth();
      return;
    }
    if (session?.user && ['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
      showProfile(session.user);
    }
  });

  updateLanguageText();

  client.auth.getSession().then(({ data, error }) => {
    if (recoveryMode) {
      showRecovery();
      if (error) setStatus('recovery-status', t().sessionExpired, 'error');
      return;
    }
    if (data?.session?.user) showProfile(data.session.user);
    else showAuth();
  }).catch(() => {
    setStatus('auth-status', t().loadError, 'error');
  });
})();
