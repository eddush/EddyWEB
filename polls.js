(() => {
  const $ = id => document.getElementById(id);
  const he = (localStorage.getItem('eddy-language') || 'en') === 'he';
  window.toggleLanguage = () => { localStorage.setItem('eddy-language', he ? 'en' : 'he'); window.location.reload(); };
  const voterKey = 'eddy-poll-voter-v1';
  let voterId = localStorage.getItem(voterKey);
  if (!/^[a-f0-9-]{36}$/i.test(voterId || '')) {
    voterId = crypto.randomUUID();
    localStorage.setItem(voterKey, voterId);
  }
  const votedKey = 'eddy-poll-voted-v1';
  let voted = {};
  try { voted = JSON.parse(localStorage.getItem(votedKey) || '{}'); } catch (_) {}
  const t = he ? {
    title:'סקרי הקהילה', intro:'הצביעו בסקרים של EddyDev — אין צורך בחשבון או בהתחברות.',
    open:'פתוח להצבעה', closed:'הסקר נסגר', votes:'הצבעות', vote:'הצבעה', voted:'ההצבעה שלך נשמרה!',
    results:'תוצאות', empty:'אין כרגע סקרים. כדאי לחזור בקרוב!', error:'לא ניתן לטעון את הסקרים כרגע.',
    duplicate:'כבר הצבעת בסקר הזה מהמכשיר הזה.', sending:'שולח הצבעה…', closedLabel:'הסקר הזה הסתיים.'
  } : {
    title:'Community Polls', intro:'Vote in EddyDev community polls — no account or sign-in required.',
    open:'Open for voting', closed:'Poll closed', votes:'votes', vote:'Vote', voted:'Your vote has been saved!',
    results:'Results', empty:'There are no polls right now. Check back soon!', error:'Could not load polls right now.',
    duplicate:'You have already voted in this poll on this device.', sending:'Submitting vote…', closedLabel:'This poll has ended.'
  };
  document.documentElement.lang = he ? 'he' : 'en';
  document.documentElement.dir = he ? 'rtl' : 'ltr';
  $('poll-title').textContent = t.title;
  $('poll-intro').textContent = t.intro;

  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function load() {
    const list = $('poll-list');
    list.innerHTML = '<div class="poll-loading"><span class="poll-spinner"></span></div>';
    try {
      const response = await fetch('/api/polls', { cache:'no-store' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || t.error);
      const polls = data.polls || [];
      if (!polls.length) { list.innerHTML = '<div class="poll-empty">' + esc(t.empty) + '</div>'; return; }
      list.innerHTML = polls.map(poll => {
        const hasVoted = Boolean(voted[poll.id]);
        const showResults = hasVoted || poll.status !== 'open';
        const total = Number(poll.totalVotes || 0);
        const options = poll.options.map(option => {
          const count = Number(poll.counts?.[option.id] || 0);
          const percent = total ? Math.round(count / total * 100) : 0;
          return showResults
            ? '<div class="poll-result"><div class="poll-result-top"><span>' + esc(option.label) + '</span><strong>' + percent + '%</strong></div><div class="poll-bar"><span style="width:' + percent + '%"></span></div><small>' + count + ' ' + esc(t.votes) + '</small></div>'
            : '<label class="poll-option"><input type="radio" name="poll-' + poll.id + '" value="' + option.id + '"><span>' + esc(option.label) + '</span></label>';
        }).join('');
        return '<article class="poll-card"><div class="poll-card-top"><span class="poll-status ' + (poll.status === 'open' ? 'is-open' : 'is-closed') + '">' + esc(poll.status === 'open' ? t.open : t.closed) + '</span><span class="poll-total">' + total + ' ' + esc(t.votes) + '</span></div><h2>' + esc(poll.question) + '</h2><div class="poll-options">' + options + '</div>' +
          (showResults ? '<p class="poll-feedback">' + esc(hasVoted ? t.voted : t.closedLabel) + '</p>' : '<button class="btn primary poll-vote-btn" data-poll="' + poll.id + '">' + esc(t.vote) + '</button><p class="poll-feedback" id="poll-feedback-' + poll.id + '" aria-live="polite"></p>') +
          (showResults ? '<div class="poll-results-heading">' + esc(t.results) + '</div>' : '') + '</article>';
      }).join('');
      list.querySelectorAll('.poll-vote-btn').forEach(button => button.addEventListener('click', () => castVote(button.dataset.poll, button)));
    } catch (error) {
      list.innerHTML = '<div class="poll-empty poll-error">' + esc(error.message || t.error) + '</div>';
    }
  }
  async function castVote(pollId, button) {
    const selected = document.querySelector('input[name="poll-' + pollId + '"]:checked');
    const feedback = $('poll-feedback-' + pollId);
    if (!selected) { feedback.textContent = he ? 'בחרו אפשרות לפני ההצבעה.' : 'Choose an option before voting.'; return; }
    button.disabled = true;
    feedback.textContent = t.sending;
    try {
      const response = await fetch('/api/polls', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ action:'vote', pollId, optionId:selected.value, voterId })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || t.error);
      voted[pollId] = true;
      localStorage.setItem(votedKey, JSON.stringify(voted));
      await load();
    } catch (error) {
      feedback.textContent = error.message || t.error;
      button.disabled = false;
    }
  }
  load();
})();