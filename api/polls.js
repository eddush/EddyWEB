const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
const db = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } }) : null;

function cleanPoll(row) {
  const poll = row?.content_json;
  if (!poll || typeof poll !== 'object' || !poll.id || !Array.isArray(poll.options)) return null;
  return poll;
}

async function requireAdmin(req) {
  const auth = req.headers.authorization || '';
  if (!/^Bearer\s+\S+/i.test(auth)) return false;
  const origin = `https://${req.headers.host}`;
  const response = await fetch(origin + '/api/login', {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(7000)
  });
  return response.ok && (await response.json().catch(() => ({}))).success === true;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!db) return res.status(503).json({ success: false, message: 'מסד הנתונים אינו מוגדר ב-Vercel.' });
  if (req.method === 'GET') {
    try {
      const { data: rows, error } = await db.from('site_content')
        .select('content_key,content_json').gte('content_key', 'poll_').lt('content_key', 'poll_\\uffff').order('updated_at', { ascending: false });
      if (error) throw error;
      const polls = (rows || []).filter(row => /^poll_[a-f0-9]{12}$/.test(row.content_key))
        .map(row => cleanPoll(row)).filter(Boolean);
      const results = await Promise.all(polls.map(async poll => {
        const prefix = 'pv_' + poll.id + '_';
        const { data: votes, error: voteError } = await db.from('site_content')
          .select('content_json').gte('content_key', prefix).lt('content_key', prefix + '\\uffff');
        if (voteError) throw voteError;
        const counts = Object.fromEntries(poll.options.map(option => [option.id, 0]));
        for (const row of votes || []) {
          const optionId = row.content_json?.optionId;
          if (Object.prototype.hasOwnProperty.call(counts, optionId)) counts[optionId]++;
        }
        return { ...poll, counts, totalVotes: (votes || []).length };
      }));
      return res.status(200).json({ success: true, polls: results });
    } catch (error) {
      console.error('Poll list error:', error?.message || error);
      return res.status(503).json({ success: false, message: 'לא ניתן לטעון סקרים כרגע.' });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (_) { return {}; } })() : (req.body || {});
  const action = String(body.action || '');
  try {
    if (action === 'vote') {
      const pollId = String(body.pollId || '');
      const optionId = String(body.optionId || '');
      const voterId = String(body.voterId || '');
      if (!/^[a-f0-9]{12}$/.test(pollId) || !/^[a-f0-9]{12}$/.test(optionId) || !/^[a-f0-9-]{36}$/i.test(voterId)) {
        return res.status(400).json({ success: false, message: 'פרטי ההצבעה אינם תקינים.' });
      }
      const { data: pollRow, error: pollError } = await db.from('site_content').select('content_json')
        .eq('content_key', 'poll_' + pollId).maybeSingle();
      if (pollError) throw pollError;
      const poll = cleanPoll(pollRow);
      if (!poll || poll.status !== 'open') return res.status(409).json({ success: false, message: 'הסקר סגור או לא קיים.' });
      if (!poll.options.some(option => option.id === optionId)) return res.status(400).json({ success: false, message: 'אפשרות ההצבעה אינה תקינה.' });

      const voterHash = crypto.createHash('sha256').update(voterId).digest('hex').slice(0, 32);
      const key = 'pv_' + pollId + '_' + voterHash;
      const { error: insertError } = await db.from('site_content').insert({
        content_key: key,
        content_json: { optionId, createdAt: new Date().toISOString() },
        updated_at: new Date().toISOString()
      });
      if (insertError?.code === '23505') return res.status(409).json({ success: false, code: 'ALREADY_VOTED', message: 'כבר הצבעת בסקר הזה מהמכשיר הזה.' });
      if (insertError) throw insertError;
      return res.status(201).json({ success: true });
    }

    if (!['create', 'close', 'reopen', 'delete'].includes(action)) {
      return res.status(400).json({ success: false, message: 'פעולה לא מוכרת.' });
    }
    if (!(await requireAdmin(req))) return res.status(403).json({ success: false, message: 'אין הרשאת מנהל.' });

    const pollId = String(body.pollId || '');
    if (action === 'create') {
      const question = String(body.question || '').trim().slice(0, 180);
      const options = Array.isArray(body.options) ? body.options.map(value => String(value || '').trim().slice(0, 100)).filter(Boolean) : [];
      if (question.length < 3 || options.length < 2 || options.length > 10 || new Set(options.map(value => value.toLowerCase())).size !== options.length) {
        return res.status(400).json({ success: false, message: 'יש להזין שאלה (3 תווים לפחות) ו-2 עד 10 אפשרויות שונות.' });
      }
      const id = crypto.randomBytes(6).toString('hex');
      const poll = {
        id, question, options: options.map(label => ({ id: crypto.randomBytes(6).toString('hex'), label })),
        status: 'open', createdAt: new Date().toISOString()
      };
      const { error } = await db.from('site_content').insert({
        content_key: 'poll_' + id, content_json: poll, updated_at: new Date().toISOString()
      });
      if (error) throw error;
      return res.status(201).json({ success: true, poll });
    }

    if (!/^[a-f0-9]{12}$/.test(pollId)) return res.status(400).json({ success: false, message: 'מזהה סקר לא תקין.' });
    if (action === 'delete') {
      const { error } = await db.from('site_content').delete().gte('content_key', 'pv_' + pollId + '_').lt('content_key', 'pv_' + pollId + '_\\uffff');
      if (error) throw error;
      const { error: pollDeleteError } = await db.from('site_content').delete().eq('content_key', 'poll_' + pollId);
      if (pollDeleteError) throw pollDeleteError;
      return res.json({ success: true });
    }

    const { data: row, error: readError } = await db.from('site_content').select('content_json')
      .eq('content_key', 'poll_' + pollId).maybeSingle();
    if (readError) throw readError;
    const poll = cleanPoll(row);
    if (!poll) return res.status(404).json({ success: false, message: 'הסקר לא נמצא.' });
    poll.status = action === 'close' ? 'closed' : 'open';
    const { error: updateError } = await db.from('site_content').upsert({
      content_key: 'poll_' + pollId, content_json: poll, updated_at: new Date().toISOString()
    }, { onConflict: 'content_key' });
    if (updateError) throw updateError;
    return res.json({ success: true });
  } catch (error) {
    console.error('Poll API error:', error?.message || error);
    return res.status(503).json({ success: false, message: 'שגיאה בשמירת הסקר. בדוק את מסד הנתונים.' });
  }
};
