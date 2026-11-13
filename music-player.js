(() => {
  'use strict';

  // Turbo may revisit a page while its scripts are evaluated again.
  // The soundtrack must have exactly one controller and one Audio instance
  // for the lifetime of this browser document.
  if (window.__eddyMusicPlayerInitialized || document.getElementById('eddy-music-player')) {
    return;
  }
  window.__eddyMusicPlayerInitialized = true;

  const SUPABASE_URL = 'https://vnhgkatsfpjyqpdppqrf.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_N6amZaYaWj7AdF8wQAHpEA_Qd2TAyp6';
  const BUCKET = 'music';
  const PREF_KEY = 'eddydev.music-player.v1';
  const SESSION_KEY = 'eddydev.music-session.v1';

  const style = document.createElement('style');
  style.textContent = `
    #eddy-music-player{display:none!important}
    #eddy-music-player .emp-panel{display:none;position:absolute;left:0;bottom:0;width:min(340px,calc(100vw - 32px));padding:13px 14px;border:1px solid rgba(116,192,252,.24);border-radius:17px;background:rgba(8,18,25,.96);backdrop-filter:blur(18px);box-shadow:0 12px 38px rgba(0,0,0,.32);pointer-events:auto}
    #eddy-music-player.is-open .emp-panel{display:block}
    html[data-theme="light"] #eddy-music-player .emp-panel{background:rgba(250,254,255,.94);color:#17363b;border-color:rgba(20,100,110,.18)}
    #eddy-music-player .emp-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}
    #eddy-music-player .emp-brand{display:flex;align-items:center;gap:8px;font-weight:800;font-size:12px;letter-spacing:.04em}
    #eddy-music-player .emp-brand i{color:#74c0fc}
    #eddy-music-player .emp-status{font-size:10px;opacity:.65}
    #eddy-music-player .emp-track{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #eddy-music-player .emp-artist{font-size:11px;opacity:.65;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #eddy-music-player .emp-progress{width:100%;height:4px;margin:12px 0 8px;accent-color:#74c0fc;cursor:pointer}
    #eddy-music-player .emp-times{display:flex;justify-content:space-between;font-size:10px;opacity:.58;font-variant-numeric:tabular-nums}
    #eddy-music-player .emp-controls{display:flex;align-items:center;justify-content:center;gap:9px;margin-top:8px}
    #eddy-music-player button{border:0;cursor:pointer;color:inherit;background:transparent;display:grid;place-items:center;border-radius:10px;min-width:32px;height:32px;transition:background .18s,transform .18s}
    #eddy-music-player button:hover{background:rgba(116,192,252,.15);transform:translateY(-1px)}
    #eddy-music-player .emp-play{width:40px;height:40px;border-radius:50%;background:#74c0fc;color:#07151d;font-size:15px}
    #eddy-music-player .emp-toggle.active{color:#74c0fc}
    #eddy-music-player .emp-bottom{display:flex;align-items:center;justify-content:space-between;margin-top:8px}
    #eddy-music-player .emp-volume{width:82px;accent-color:#74c0fc}
    #eddy-music-player .emp-message{font-size:10px;opacity:.6}
    @media(max-width:600px){#eddy-music-player{left:12px;bottom:12px;width:min(320px,calc(100vw - 24px))}#eddy-music-player .emp-panel{width:min(320px,calc(100vw - 24px))}}
    @media(prefers-reduced-motion:reduce){#eddy-music-player button{transition:none}}
  `;
  document.head.appendChild(style);

  const root = document.createElement('aside');
  root.id = 'eddy-music-player';
  root.setAttribute('data-turbo-permanent', '');
  root.setAttribute('aria-label', 'EddyDev background music player');
  root.innerHTML = `
    <div class="emp-panel">
      <div class="emp-top">
        <div class="emp-brand"><i class="fa-solid fa-music"></i><span>EddyDev Music</span></div>
        <span class="emp-status" id="emp-status">Loading tracks…</span>
      </div>
      <div class="emp-track" id="emp-track">Minecraft Soundtrack</div>
      <div class="emp-artist" id="emp-artist">Background music</div>
      <input class="emp-progress" id="emp-progress" type="range" min="0" max="1000" value="0" aria-label="Track progress">
      <div class="emp-times"><span id="emp-current">0:00</span><span id="emp-duration">0:00</span></div>
      <div class="emp-controls">
        <button id="emp-shuffle" class="emp-toggle active" title="Shuffle" aria-label="Shuffle"><i class="fa-solid fa-shuffle"></i></button>
        <button id="emp-prev" title="Previous track" aria-label="Previous track"><i class="fa-solid fa-backward-step"></i></button>
        <button id="emp-play" class="emp-play" title="Play music" aria-label="Play music"><i class="fa-solid fa-play"></i></button>
        <button id="emp-next" title="Next track" aria-label="Next track"><i class="fa-solid fa-forward-step"></i></button>
        <button id="emp-mute" class="emp-toggle" title="Mute" aria-label="Mute"><i class="fa-solid fa-volume-high"></i></button>
      </div>
      <div class="emp-bottom">
        <span class="emp-message" id="emp-message">Click play to start</span>
        <input class="emp-volume" id="emp-volume" type="range" min="0" max="1" step="0.01" value="0.28" aria-label="Volume">
      </div>
    </div>`;
  document.body.appendChild(root);

  // The floating button is a simple music on/off switch; no player window is shown.
  const launcher = document.getElementById('eddy-music-launcher');
  const nextButton = document.getElementById('eddy-music-next');
  // Put both music controls inside the same floating dock as language/theme.
  const preferencesDock = document.getElementById('site-preferences');
  if (preferencesDock) {
    if (launcher) preferencesDock.appendChild(launcher);
    if (nextButton) preferencesDock.appendChild(nextButton);
  }

  const $ = (id) => root.querySelector('#' + id);
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.volume = 0.28;
  let tracks = [];
  let current = -1;
  let shuffle = true;
  let history = [];
  let historyIndex = -1;
  let seeking = false;

  function formatTime(value) {
    if (!Number.isFinite(value)) return '0:00';
    const m = Math.floor(value / 60);
    const s = Math.floor(value % 60).toString().padStart(2, '0');
    return m + ':' + s;
  }
  function setStatus(message) { $('emp-status').textContent = message; }
  function displayTrack(track) {
    const title = track.name.replace(/\.(ogg|mp3|wav|m4a)$/i, '');
    const split = title.indexOf(' - ');
    $('emp-track').textContent = split >= 0 ? title.slice(split + 2) : title;
    $('emp-artist').textContent = split >= 0 ? title.slice(0, split) : 'Minecraft Soundtrack';
  }
  function savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ volume: audio.volume, muted: audio.muted, shuffle })); } catch (_) {}
  }
  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      if (Number.isFinite(p.volume)) audio.volume = Math.max(0, Math.min(1, p.volume));
      audio.muted = !!p.muted;
      shuffle = p.shuffle !== false;
    } catch (_) {}
    $('emp-volume').value = String(audio.volume);
    $('emp-shuffle').classList.toggle('active', shuffle);
    updateMuteButton();
  }
  function updateMuteButton() {
    const muted = audio.muted || audio.volume === 0;
    $('emp-mute').innerHTML = muted ? '<i class="fa-solid fa-volume-xmark"></i>' : '<i class="fa-solid fa-volume-high"></i>';
    $('emp-mute').classList.toggle('active', muted);
  }
  function updatePlayButton() {
    $('emp-play').innerHTML = audio.paused ? '<i class="fa-solid fa-play"></i>' : '<i class="fa-solid fa-pause"></i>';
    $('emp-play').setAttribute('aria-label', audio.paused ? 'Play music' : 'Pause music');
  }

  function updateLauncher() {
    if (!launcher) return;
    launcher.innerHTML = audio.paused
      ? '<i class="fa-solid fa-play" aria-hidden="true"></i>'
      : '<i class="fa-solid fa-pause" aria-hidden="true"></i>';
    launcher.title = audio.paused ? 'Turn music on' : 'Turn music off';
    launcher.setAttribute('aria-label', audio.paused ? 'Turn music on' : 'Turn music off');
    launcher.setAttribute('aria-pressed', String(!audio.paused));
  }
  async function toggleMusic() {
    if (audio.paused) {
      if (!tracks.length) {
        $('emp-message').textContent = 'Music is still loading';
        return;
      }
      if (!audio.src) await playIndex(current < 0 ? Math.floor(Math.random() * tracks.length) : current, false);
      try {
        await audio.play();
        $('emp-message').textContent = 'Now playing';
      } catch (_) {
        $('emp-message').textContent = 'Could not start music';
      }
    } else {
      audio.pause();
    }
    updatePlayButton();
    updateLauncher();
  }
  if (launcher) launcher.addEventListener('click', toggleMusic);
  if (nextButton) nextButton.addEventListener('click', () => {
    if (tracks.length) next();
  });
  function chooseNext() {
    if (!tracks.length) return -1;
    if (!shuffle) return (current + 1) % tracks.length;
    if (tracks.length === 1) return 0;
    let next = current;
    while (next === current) next = Math.floor(Math.random() * tracks.length);
    return next;
  }
  async function playIndex(index, autoplay = true, addHistory = true) {
    if (!tracks.length) return;
    current = (index + tracks.length) % tracks.length;
    if (addHistory) {
      history = history.slice(0, historyIndex + 1);
      history.push(current);
      historyIndex = history.length - 1;
    }
    const track = tracks[current];
    audio.src = track.url;
    displayTrack(track);
    $('emp-progress').value = '0';
    $('emp-current').textContent = '0:00';
    $('emp-duration').textContent = '0:00';
    if (autoplay) {
      try { await audio.play(); $('emp-message').textContent = 'Now playing'; }
      catch (_) { $('emp-message').textContent = 'Press play to start'; }
    } else {
      $('emp-message').textContent = 'Ready to play';
    }
    updatePlayButton();
  }
  function next() { if (tracks.length) playIndex(chooseNext()); }
  function previous() {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    if (historyIndex > 0) {
      historyIndex--;
      playIndex(history[historyIndex], true, false);
    } else if (tracks.length) {
      playIndex((current - 1 + tracks.length) % tracks.length);
    }
  }


  $('emp-play').addEventListener('click', async () => {
    if (!tracks.length) return;
    if (audio.paused) {
      if (!audio.src) await playIndex(current < 0 ? Math.floor(Math.random() * tracks.length) : current, false);
      try { await audio.play(); $('emp-message').textContent = 'Now playing'; }
      catch (_) { $('emp-message').textContent = 'Playback was blocked. Press play again.'; }
    } else audio.pause();
    updatePlayButton();
  });
  $('emp-next').addEventListener('click', next);
  $('emp-prev').addEventListener('click', previous);
  $('emp-shuffle').addEventListener('click', () => {
    shuffle = !shuffle;
    $('emp-shuffle').classList.toggle('active', shuffle);
    savePrefs();
  });
  $('emp-mute').addEventListener('click', () => {
    audio.muted = !audio.muted;
    updateMuteButton();
    savePrefs();
  });
  $('emp-volume').addEventListener('input', (event) => {
    audio.volume = Number(event.target.value);
    if (audio.volume > 0) audio.muted = false;
    updateMuteButton();
    savePrefs();
  });
  $('emp-progress').addEventListener('input', () => {
    seeking = true;
    if (Number.isFinite(audio.duration)) audio.currentTime = (Number($('emp-progress').value) / 1000) * audio.duration;
  });
  $('emp-progress').addEventListener('change', () => { seeking = false; });
  audio.addEventListener('timeupdate', () => {
    if (!seeking && Number.isFinite(audio.duration) && audio.duration > 0) $('emp-progress').value = String(Math.round(audio.currentTime / audio.duration * 1000));
    $('emp-current').textContent = formatTime(audio.currentTime);
  });
  audio.addEventListener('loadedmetadata', () => { $('emp-duration').textContent = formatTime(audio.duration); });
  audio.addEventListener('ended', next);
  audio.addEventListener('play', () => {
    updatePlayButton();
    updateLauncher();
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ playing: true, track: tracks[current]?.name || '', time: audio.currentTime || 0 })); } catch (_) {}
  });
  audio.addEventListener('pause', () => {
    updatePlayButton();
    updateLauncher();
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...saved, playing: false, track: tracks[current]?.name || saved.track || '', time: audio.currentTime || 0 }));
    } catch (_) {}
  });
  // Keep the soundtrack state across normal page navigation in the same tab.
  window.addEventListener('pagehide', () => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        playing: !audio.paused,
        track: tracks[current]?.name || '',
        time: Number.isFinite(audio.currentTime) ? audio.currentTime : 0
      }));
    } catch (_) {}
  });
  audio.addEventListener('error', () => {
    $('emp-message').textContent = 'Could not load this track';
    setStatus('Track error');
  });

  async function loadTracks() {
    try {
      if (!window.supabase?.createClient) throw new Error('Supabase library unavailable');
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      const { data, error } = await client.storage.from(BUCKET).list('', {
        limit: 100,
        sortBy: { column: 'name', order: 'asc' }
      });
      if (error) throw error;
      tracks = (data || [])
        .filter(item => item.name && /\.(ogg|mp3|wav|m4a)$/i.test(item.name))
        .map(item => {
          const { data: publicData } = client.storage.from(BUCKET).getPublicUrl(item.name);
          return { name: item.name, url: publicData.publicUrl };
        });
      if (!tracks.length) throw new Error('No audio files found in the music bucket');
      loadPrefs();
      let savedSession = null;
      try { savedSession = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (_) {}
      const savedIndex = savedSession?.track ? tracks.findIndex(track => track.name === savedSession.track) : -1;
      current = savedIndex >= 0 ? savedIndex : Math.floor(Math.random() * tracks.length);
      displayTrack(tracks[current]);
      setStatus(tracks.length + ' tracks');
      $('emp-message').textContent = 'Click the music button to turn music on';

      // Restore the same song and position after the next page has loaded.
      if (savedSession?.playing && savedIndex >= 0) {
        audio.src = tracks[current].url;
        audio.addEventListener('loadedmetadata', async function restorePlayback() {
          const savedTime = Number(savedSession.time);
          if (Number.isFinite(savedTime) && savedTime > 0 && savedTime < audio.duration) audio.currentTime = savedTime;
          try {
            await audio.play();
            $('emp-message').textContent = 'Now playing';
          } catch (_) {
            $('emp-message').textContent = 'Press the music button to resume';
            try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...savedSession, playing: false, time: audio.currentTime || 0 })); } catch (_) {}
          }
        }, { once: true });
        audio.load();
      }
    } catch (error) {
      console.error('[EddyDev Music]', error);
      setStatus('Unavailable');
      $('emp-message').textContent = 'Music could not be loaded';
    }
  }

  updateLauncher();
  loadTracks();
})();