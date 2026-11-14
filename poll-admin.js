(() => {
  const $ = id => document.getElementById(id);
  const supabase = window.supabase.createClient(
    'https://vnhgkatsfpjyqpdppqrf.supabase.co',
    'sb_publishable_N6amZaYaWj7AdF8wQAHpEA_Qd2TAyp6'
  );
  const status = (message, error = false) => {
    $('poll-admin-status').textContent = message;
    $('poll-admin-status').style.color = error ? '#ff6b8a' : '#5fffe4';
  };
  async function token() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || '';
  }
  async function request(action, extra = {}) {
    const accessToken = action === 'list' ? '' : await token();
    if (action !== 'list' && !accessToken) throw new Error('יש להתחבר לחשבון המנהל מחדש.');
    const response = await fetch('/api/polls', {
      method: action === 'list' ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(action === 'list' ? {} : { Authorization: 'Bearer ' + accessToken }) },
      body: action === 'list' ? undefined : JSON.stringify({ action, ...extra })
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'הפעולה נכשלה.');
    return data;
  }
  function addOption(value = '') {
    const row = document.createElement('div');
    row.className = 'poll-admin-option';
    const input = document.createElement('input');
    input.type = 'text'; input.maxLength = 100; input.placeholder = 'אפשרות נוספת'; input.value = value;
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'btn-danger poll-remove-option'; remove.textContent = 'הסר';
    remove.addEventListener('click', () => {
      if ($('poll-admin-options').children.length <= 2) return status('חייבות להישאר לפחות שתי אפשרויות.', true);
      row.remove();
    });
    row.append(input, remove);
    $('poll-admin-options').append(row);
  }
  $('poll-admin-options').querySelectorAll('.poll-remove-option').forEach(button => button.addEventListener('click', () => {
    if ($('poll-admin-options').children.length <= 2) return status('חייבות להישאר לפחות שתי אפשרויות.', true);
    button.parentElement.remove();
  }));
  $('poll-add-option').addEventListener('click', () => {
    if ($('poll-admin-options').children.length >= 10) return status('אפשר להוסיף עד 10 אפשרויות.', true);
    addOption();
  });
  $('poll-create-button').addEventListener('click', async () => {
    const question = $('poll-admin-question').value.trim();
    const options = [...$('poll-admin-options').querySelectorAll('input')].map(input => input.value.trim()).filter(Boolean);
    $('poll-create-button').disabled = true;
    status('יוצר סקר…');
    try {
      await request('create', { question, options });
      $('poll-admin-question').value = '';
      $('poll-admin-options').innerHTML = '';
      addOption(); addOption();
      status('✓ הסקר נוצר ופתוח להצבעה!');
      await load();
    } catch (error) { status(error.message, true); }
    finally { $('poll-create-button').disabled = false; }
  });
  async function act(action, pollId) {
    if (action === 'delete' && !confirm('למחוק את הסקר ואת כל ההצבעות שלו?')) return;
    try {
      await request(action, { pollId });
      await load();
    } catch (error) { status(error.message, true); }
  }
  async function load() {
    const list = $('poll-admin-list');
    list.innerHTML = '<p>טוען סקרים…</p>';
    try {
      const data = await request('list');
      if (!data.polls.length) { list.innerHTML = '<p>עדיין לא נוצרו סקרים.</p>'; return; }
      list.innerHTML = '';
      data.polls.forEach(poll => {
        const card = document.createElement('div');
        card.className = 'poll-admin-card';
        const title = document.createElement('strong');
        title.textContent = poll.question;
        const summary = document.createElement('p');
        summary.textContent = (poll.status === 'open' ? 'פתוח' : 'סגור') + ' · ' + poll.totalVotes + ' הצבעות';
        const actions = document.createElement('div');
        actions.className = 'poll-admin-actions';
        const toggle = document.createElement('button');
        toggle.className = 'btn'; toggle.textContent = poll.status === 'open' ? 'סגור סקר' : 'פתח מחדש';
        toggle.addEventListener('click', () => act(poll.status === 'open' ? 'close' : 'reopen', poll.id));
        const remove = document.createElement('button');
        remove.className = 'btn-danger'; remove.textContent = 'מחק';
        remove.addEventListener('click', () => act('delete', poll.id));
        actions.append(toggle, remove);
        card.append(title, summary, actions);
        poll.options.forEach(option => {
          const count = Number(poll.counts?.[option.id] || 0);
          const line = document.createElement('small');
          line.textContent = option.label + ': ' + count;
          card.append(line);
        });
        list.append(card);
      });
    } catch (error) { list.textContent = error.message; }
  }
  load();
})();