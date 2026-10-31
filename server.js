const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

// Accept normal JSON and also the JSON-string body produced by some Minecraft/SkJson clients.
// Parsing is done here so a doubly-encoded payload does not get rejected by express.json().
app.use(express.text({ type: ['application/json', 'text/plain'] }));
app.use((req, res, next) => {
    if (typeof req.body !== 'string') return next();

    const raw = req.body.trim();
    if (!raw) {
        req.body = {};
        return next();
    }

    try {
        let parsed = JSON.parse(raw);
        // Handle a second JSON encoding layer if the client sent a JSON string.
        if (typeof parsed === 'string') {
            try { parsed = JSON.parse(parsed); } catch (_) {}
        }
        req.body = parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        // Some SkJson versions can add one extra quote layer without valid JSON escaping.
        // Recover the inner object when the payload contains a JSON object.
        const start = raw.indexOf('{');
        const end = raw.lastIndexOf('}');
        if (start >= 0 && end > start) {
            try {
                req.body = JSON.parse(raw.slice(start, end + 1).replace(/\\\\\"/g, '\\"'));
            } catch (_) {
                return res.status(400).json({ success: false, message: 'JSON לא תקין' });
            }
        } else {
            return res.status(400).json({ success: false, message: 'JSON לא תקין' });
        }
    }

    next();
});
app.use(express.static(__dirname));

app.post('/api/login', async (req, res) => {
    const access = await checkMinecraftAdmin(req);
    if (!access.ok) return res.status(access.status).json({ success: false, message: access.message });
    return res.json({ success: true, username: access.username });
});

app.get('/api/news', async (req, res) => {
    const conn = getDatabaseConnection();

    if (conn) {
        try {
            await ensureSiteContentTable(conn);
            const rows = await conn.execute(
                'SELECT content_json FROM site_content WHERE content_key = ? LIMIT 1',
                ['news']
            );

            if (Array.isArray(rows) && rows.length) {
                let news = rows[0].content_json;
                if (typeof news === 'string') news = JSON.parse(news);
                if (Array.isArray(news)) return res.json(news);
            }
        } catch (error) {
            console.warn('Persistent news read skipped; using bundled defaults:', error?.message || error);
        }
    }

    try {
        return res.json(require('./news.json'));
    } catch (_) {
        return res.json([]);
    }
});

app.post('/api/save-news', async (req, res) => {
    const { news } = req.body || {};
    const access = await checkMinecraftAdmin(req);
    if (!access.ok) return res.status(access.status).json({ success: false, message: access.message });

    if (!Array.isArray(news)) {
        return res.status(400).json({ success: false, message: 'רשימת החדשות לא תקינה' });
    }

    const conn = getDatabaseConnection();
    if (conn) {
        try {
            await ensureSiteContentTable(conn);
            await conn.execute(
                `INSERT INTO site_content (content_key, content_json)
                 VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE
                    content_json = VALUES(content_json),
                    updated_at = CURRENT_TIMESTAMP`,
                ['news', JSON.stringify(news)]
            );
            return res.json({ success: true, persistent: true });
        } catch (error) {
            console.error('Persistent news save error:', error?.message || error);
            const message = String(error?.message || '');
            if (/usage quota|quota being exhausted|49900002/i.test(message) || error?.details?.code === 49900002) {
                return res.status(503).json({
                    success: false,
                    code: 'DATABASE_QUOTA_EXCEEDED',
                    message: 'מכסת השימוש של TiDB Cloud הסתיימה. יש להחזיר את מסד הנתונים לפעילות לפני שניתן לשמור חדשות.'
                });
            }
            return res.status(503).json({
                success: false,
                message: 'מסד הנתונים אינו זמין כרגע, ולכן החדשות לא נשמרו.'
            });
        }
    }

    if (process.env.VERCEL) {
        return res.status(503).json({
            success: false,
            message: 'TIDB_URL אינו מוגדר. לא ניתן לשמור חדשות באופן קבוע ב-Vercel.'
        });
    }

    fs.writeFile(path.join(__dirname, 'news.json'), JSON.stringify(news, null, 2), 'utf8', (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'כשל בכתיבה לקובץ' });
        }
        res.json({ success: true, persistent: false });
    });
});


app.post('/api/improve-article', async (req, res) => {
    const { article } = req.body || {};
    const groqApiKey = process.env.GROQ_API_KEY;
    const access = await checkMinecraftAdmin(req);
    if (!access.ok) return res.status(access.status).json({ success: false, message: access.message });

    if (!groqApiKey) {
        return res.status(500).json({
            success: false,
            message: 'משתנה GROQ_API_KEY אינו מוגדר בסביבת השרת'
        });
    }

    if (!article || typeof article !== 'object') {
        return res.status(400).json({ success: false, message: 'מאמר לא תקין' });
    }

    const cleanInput = {
        title_he: String(article.title_he || ''),
        title_en: String(article.title_en || ''),
        text_he: String(article.text_he || ''),
        text_en: String(article.text_en || ''),
        content_he: String(article.content_he || ''),
        content_en: String(article.content_en || '')
    };

    const systemPrompt = [
        'אתה עורך תוכן בלבד עבור EddyWEB. אתה מקבל מאמר קיים מהמשתמש ועליך לערוך ולשפר את המאמר הקיים, לא להמציא מאמר חדש.',
        'הכלל החשוב ביותר: נשארים בדיוק באותו נושא, באותו אירוע ובאותו מוצר או פיצר שעליהם המשתמש כתב.',
        'אסור להחליף את הנושא בשום מצב. אסור להוסיף נושא חדש, אירוע חדש, פיצר חדש או סיפור חדש.',
        'שמור על כל הפרטים העובדתיים שהמשתמש כתב: שמות, מספרים, תאריכים, פקודות Minecraft, כתובות, קישורים, שמות פלאגינים, שמות מפות, שמות שחקנים ופרטים טכניים.',
        'אל תשתמש בידע חיצוני כדי להשלים פרטים. עבוד רק עם המידע שבתוך SOURCE ARTICLE.',
        'מותר לתקן שגיאות כתיב, דקדוק, ניסוח, סדר, בהירות וטון.',
        'מותר לאחד משפטים ולשפר את המבנה, אבל אסור לשנות את המשמעות.',
        'אם הטקסט קצר או כבר כתוב היטב, בצע רק שיפורים קטנים ושמור אותו קרוב מאוד למקור.',
        'אם חסר טקסט בשפה אחת, אפשר לתרגם את הטקסט הקיים מהשפה השנייה, אך ורק תוך שמירה על אותו נושא ואותם פרטים.',
        'כותרות ותקצירים חייבים לדבר בדיוק על אותו תוכן של המאמר המקורי.',
        'ב-content_he וב-content_en החזר HTML בלבד שמתאים לעורך Quill.',
        'מותר להשתמש רק בתגיות p, h2, h3, strong, em, u, ol, ul, li, blockquote, br.',
        'אל תשתמש ב-Markdown, script, style, iframe או JavaScript.',
        'אם SOURCE ARTICLE אינו מכיל מידע מספיק, השאר את המידע כפי שהוא ואל תשלים מדמיונך.',
        'החזר JSON בלבד בהתאם לסכמה שניתנה.'
    ].join(' ');

    const userPrompt = [
        'SOURCE ARTICLE — זהו המקור היחיד שמותר לערוך:',
        '--- START SOURCE ARTICLE ---',
        JSON.stringify(cleanInput, null, 2),
        '--- END SOURCE ARTICLE ---',
        '',
        'בצע עריכה ושיפור של SOURCE ARTICLE בלבד.',
        'אל תכתוב מאמר חדש ואל תעבור לנושא אחר.',
        'השווה את התוצאה למקור לפני ההחזרה וודא שכל העובדות והפרטים נשמרו.',
        'אם אין שינוי אמיתי שנדרש, מותר להחזיר את הטקסט כמעט ללא שינוי.'
    ].join('\n');

    const schema = {
        type: 'object',
        additionalProperties: false,
        properties: {
            title_he: { type: 'string' },
            title_en: { type: 'string' },
            text_he: { type: 'string' },
            text_en: { type: 'string' },
            content_he: { type: 'string' },
            content_en: { type: 'string' }
        },
        required: ['title_he', 'title_en', 'text_he', 'text_en', 'content_he', 'content_en']
    };

    try {
        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + groqApiKey
            },
            body: JSON.stringify({
                model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
                temperature: 0.2,
                reasoning_effort: 'low',
                max_completion_tokens: 5000,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'improved_eddyweb_article',
                        strict: true,
                        schema
                    }
                }
            })
        });

        const data = await groqResponse.json();

        if (!groqResponse.ok) {
            console.error('Groq API error:', data);
            return res.status(502).json({
                success: false,
                message: data?.error?.message || 'Groq API החזיר שגיאה'
            });
        }

        const rawContent = data?.choices?.[0]?.message?.content;
        if (!rawContent) {
            return res.status(502).json({ success: false, message: 'Groq לא החזיר תוכן' });
        }

        const improved = JSON.parse(rawContent);

        const sanitizeHtml = (html) => String(html || '')
            .replace(/<\/?(script|style|iframe|object|embed|form|input|button)[^>]*>/gi, '')
            .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
            .replace(/javascript\s*:/gi, '');

        improved.content_he = sanitizeHtml(improved.content_he);
        const protectedTokens = (value) => {
                    const text = String(value || '');
                    const matches = text.match(/https?:\/\/\S+|(?:^|\s)\/[a-zA-Z0-9:_-]+(?:\s|$)|\b\d+(?:\.\d+)?\b|#[A-Za-z0-9_-]+|[A-Z][A-Za-z0-9._-]{2,}/g);
                    return [...new Set((matches || []).map(token => token.trim()).filter(Boolean))];
                };
        
                const originalSource = [
                    cleanInput.title_he,
                    cleanInput.title_en,
                    cleanInput.text_he,
                    cleanInput.text_en,
                    cleanInput.content_he.replace(/<[^>]*>/g, ' '),
                    cleanInput.content_en.replace(/<[^>]*>/g, ' ')
                ].join('\n');
        
                const protected = protectedTokens(originalSource);
                const improvedSource = [
                    improved.title_he,
                    improved.title_en,
                    improved.text_he,
                    improved.text_en,
                    improved.content_he.replace(/<[^>]*>/g, ' '),
                    improved.content_en.replace(/<[^>]*>/g, ' ')
                ].join('\n');
        
                const missingProtected = protected.filter((token) => !improvedSource.includes(token));
        
                if (missingProtected.length > 0) {
                    console.warn('Rejected AI rewrite because protected details disappeared:', missingProtected);
                    return res.status(422).json({
                        success: false,
                        message: 'ה-AI שינה או השמיט פרטים מהמאמר. לא בוצע שינוי. נסה שוב.'
                    });
                }
        improved.content_en = sanitizeHtml(improved.content_en);

        return res.json({ success: true, article: improved });
    } catch (error) {
        console.error('Improve article error:', error);
        return res.status(500).json({
            success: false,
            message: 'שגיאה בעיבוד בקשת ה-AI'
        });
    }
});

let supabaseClient = null;

function getDatabaseConnection() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_ROLE;
    if (!url || !key) return null;

    if (!supabaseClient) {
        const { createClient } = require('@supabase/supabase-js');
        supabaseClient = createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false }
        });
    }

    // Translate the existing route queries to Supabase PostgREST requests.
    return {
        async execute(sql, params = []) {
            const q = String(sql).replace(/\s+/g, ' ').trim();
            let result;

            if (/^CREATE TABLE IF NOT EXISTS site_content/i.test(q) ||
                /^CREATE TABLE IF NOT EXISTS player_profiles/i.test(q)) {
                return [];
            }

            if (/^SELECT content_json FROM site_content WHERE content_key = \? LIMIT 1$/i.test(q)) {
                result = await supabaseClient.from('site_content').select('content_json')
                    .eq('content_key', params[0]).limit(1);
            } else if (/^INSERT INTO site_content/i.test(q)) {
                let json = params[1];
                if (typeof json === 'string') {
                    try { json = JSON.parse(json); } catch (_) {}
                }
                result = await supabaseClient.from('site_content')
                    .upsert({ content_key: params[0], content_json: json, updated_at: new Date().toISOString() },
                        { onConflict: 'content_key' });
                if (result.error) throw result.error;
                return [];
            } else if (/^INSERT INTO player_profiles/i.test(q)) {
                const [uuid, username, money, discord_id, discord_username, discord_tag, discord_avatar] = params;
                result = await supabaseClient.from('player_profiles').upsert({
                    uuid, username, money, discord_id, discord_username, discord_tag, discord_avatar,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'uuid' });
                if (result.error) throw result.error;
                return [];
            } else if (/^SELECT uuid, username, primary_group FROM luckperms_players WHERE LOWER\(username\) = LOWER\(\?\) LIMIT 1$/i.test(q)) {
                result = await supabaseClient.from('luckperms_players')
                    .select('uuid,username,primary_group').ilike('username', params[0]).limit(1);
            } else if (/^SELECT permission FROM [a-zA-Z0-9_]+ WHERE uuid = \? AND value = 1 AND permission LIKE \? ORDER BY id DESC$/i.test(q)) {
                const table = q.match(/^SELECT permission FROM ([a-zA-Z0-9_]+)/i)[1];
                result = await supabaseClient.from(table).select('permission')
                    .eq('uuid', params[0]).eq('value', true).like('permission', params[1]).order('id', { ascending: false });
            } else if (/^SELECT permission FROM [a-zA-Z0-9_]+ WHERE uuid = \? AND value = 1 AND LOWER\(permission\) LIKE \? ORDER BY id DESC$/i.test(q)) {
                const table = q.match(/^SELECT permission FROM ([a-zA-Z0-9_]+)/i)[1];
                result = await supabaseClient.from(table).select('permission')
                    .eq('uuid', params[0]).eq('value', true).ilike('permission', params[1]).order('id', { ascending: false });
            } else if (/^SELECT permission, value FROM [a-zA-Z0-9_]+ WHERE uuid = \? AND LOWER\(permission\) LIKE \? ORDER BY id DESC$/i.test(q)) {
                const table = q.match(/^SELECT permission, value FROM ([a-zA-Z0-9_]+)/i)[1];
                result = await supabaseClient.from(table).select('permission,value')
                    .eq('uuid', params[0]).ilike('permission', params[1]).order('id', { ascending: false });
            } else if (/^SELECT money, discord_id, discord_username, discord_tag, discord_avatar FROM player_profiles WHERE uuid = \? LIMIT 1$/i.test(q)) {
                result = await supabaseClient.from('player_profiles')
                    .select('money,discord_id,discord_username,discord_tag,discord_avatar')
                    .eq('uuid', params[0]).limit(1);
            } else {
                throw new Error('Supabase adapter does not support query: ' + q.slice(0, 120));
            }

            if (result.error) throw result.error;
            return result.data || [];
        }
    };
}

// Public staff list. Use the same LuckPerms user-permission source as the player profile lookup.
// Only a direct, enabled group.staff node counts; expired assignments are ignored.
async function getOnlineMinecraftNames() {
    const servers = ['Eddydev.ddns.net:25565', 'Eddydev.ddns.net:25566'];
    const results = await Promise.all(servers.map(async address => {
        try {
            const response = await fetch('https://api.mcstatus.io/v2/status/java/' + encodeURIComponent(address), {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(4500)
            });
            if (!response.ok) return [];
            const status = await response.json();
            if (!status.online) return [];
            return (status.players?.list || [])
                .map(player => String(player.name_clean || player.name_raw || '').trim().toLowerCase())
                .filter(Boolean);
        } catch (error) {
            console.warn('Minecraft status lookup failed for ' + address + ':', error?.message || error);
            return [];
        }
    }));
    return new Set(results.flat());
}

app.get('/api/minecraft/staff', async (req, res) => {
    const conn = getDatabaseConnection();
    if (!conn) return res.status(503).json({ success: false, message: 'Supabase server connection is not configured' });

    try {
        const { data: permissions, error: permissionError } = await supabaseClient
            .from('luckperms_user_permissions')
            .select('uuid,permission,value,expiry')
            .ilike('permission', 'group.staff')
            .eq('value', true)
            .order('id', { ascending: false });

        if (permissionError) throw permissionError;

        const now = Math.floor(Date.now() / 1000);
        const uuids = [...new Set((permissions || [])
            .filter(row => {
                const expiry = Number(row.expiry || 0);
                return !expiry || expiry === 0 || expiry > now;
            })
            .map(row => String(row.uuid || '').toLowerCase())
            .filter(uuid => /^[0-9a-f-]{36}$/.test(uuid)))];

        if (!uuids.length) {
            return res.set('Cache-Control', 'no-store').json({
                success: true,
                group: 'staff',
                members: []
            });
        }

        const [onlineMinecraftNames, playerResult] = await Promise.all([
            getOnlineMinecraftNames(),
            supabaseClient
            .from('luckperms_players')
            .select('uuid,username,primary_group')
            .in('uuid', uuids)
            .order('username', { ascending: true })
        ]);
        const { data: players, error: playersError } = playerResult;
        if (playersError) throw playersError;

        // If LuckPerms primary_group is default, resolve a directly assigned
        // non-default group so the staff page displays the player's actual rank.
        const rankByUuid = new Map((players || []).map(player => [
            String(player.uuid || '').toLowerCase(),
            String(player.primary_group || 'default').trim()
        ]));
        const defaultRankUuids = (players || [])
            .filter(player => !player.primary_group || String(player.primary_group).toLowerCase() === 'default')
            .map(player => String(player.uuid || '').toLowerCase());
        if (defaultRankUuids.length) {
            const { data: groupPermissions, error: groupPermissionsError } = await supabaseClient
                .from('luckperms_user_permissions')
                .select('uuid,permission,value,expiry,id')
                .in('uuid', defaultRankUuids)
                .ilike('permission', 'group.%')
                .eq('value', true)
                .order('id', { ascending: false });
            if (groupPermissionsError) throw groupPermissionsError;
            const now = Math.floor(Date.now() / 1000);
            for (const row of (groupPermissions || [])) {
                const uuid = String(row.uuid || '').toLowerCase();
                const permission = String(row.permission || '');
                const expiry = Number(row.expiry || 0);
                const match = permission.match(/^group\.([A-Za-z0-9_-]+)$/i);
                if (!match || match[1].toLowerCase() === 'default' || (expiry > 0 && expiry <= now)) continue;
                if (rankByUuid.get(uuid)?.toLowerCase() === 'default') rankByUuid.set(uuid, match[1]);
            }
        }

        // Attach the Discord ID saved when the Minecraft account was linked to EddyWEB.
        let linkedProfiles = [];
        try {
            const { data, error } = await supabaseClient
                .from('player_profiles')
                .select('uuid,discord_id')
                .in('uuid', uuids);
            if (error) throw error;
            linkedProfiles = data || [];
        } catch (profileError) {
            // The public staff list still works if optional account-link data is unavailable.
            console.warn('Staff Discord-link lookup skipped:', profileError?.message || profileError);
        }
        const discordByUuid = new Map(linkedProfiles.map(profile => [
            String(profile.uuid || '').toLowerCase(),
            profile.discord_id ? String(profile.discord_id) : null
        ]));

        return res.set('Cache-Control', 'no-store').json({
            success: true,
            group: 'staff',
            members: (players || []).map(player => ({
                uuid: player.uuid,
                username: player.username,
                rank: rankByUuid.get(String(player.uuid || '').toLowerCase()) || player.primary_group || 'staff',
                discordId: discordByUuid.get(String(player.uuid || '').toLowerCase()) || null,
                minecraftOnline: onlineMinecraftNames.has(String(player.username || '').toLowerCase())
            }))
        });
    } catch (error) {
        console.error('Minecraft staff list error:', error?.message || error);
        return res.status(503).json({ success: false, message: 'Unable to load Minecraft staff' });
    }
});

// Minecraft account linking. Link codes are created and owned server-side by the signed-in user.
function getBearerToken(req) {
    const header = String(req.headers.authorization || '');
    return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

async function getAuthenticatedSupabaseUser(req) {
    const conn = getDatabaseConnection();
    const token = getBearerToken(req);
    if (!conn || !token) return { conn, user: null };
    const { data, error } = await supabaseClient.auth.getUser(token);
    if (error || !data?.user) return { conn, user: null };
    return { conn, user: data.user };
}

// Admin access requires a signed-in EddyWEB account linked to a Minecraft UUID
// that has the direct LuckPerms node eddyweb.admin.
async function checkMinecraftAdmin(req) {
    try {
        const { conn, user } = await getAuthenticatedSupabaseUser(req);
        if (!conn) return { ok: false, status: 503, message: 'חיבור מסד הנתונים אינו זמין' };
        if (!user) return { ok: false, status: 401, message: 'יש להתחבר לחשבון EddyWEB' };
        const rawUuid = String(user.app_metadata?.minecraft_uuid || '').trim().toLowerCase();
        const cleanUuid = rawUuid.replace(/-/g, '');
        if (!/^[0-9a-f]{32}$/.test(cleanUuid)) {
            return { ok: false, status: 403, message: 'יש לחבר חשבון Minecraft לחשבון EddyWEB' };
        }
        const hyphenatedUuid = cleanUuid.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
        const { data: rows, error } = await supabaseClient.from('luckperms_user_permissions')
            .select('permission,value,expiry')
            .in('uuid', [...new Set([rawUuid, cleanUuid, hyphenatedUuid])])
            .eq('permission', 'eddyweb.admin').eq('value', true)
            .order('id', { ascending: false }).limit(1);
        if (error) throw error;
        const permission = rows?.[0];
        if (!permission || (Number(permission.expiry) > 0 && Number(permission.expiry) < Math.floor(Date.now() / 1000))) {
            return { ok: false, status: 403, message: 'אין לחשבון שלך הרשאת eddyweb.admin ב-Minecraft' };
        }
        return { ok: true, user, username: user.user_metadata?.minecraft_username || 'Minecraft player' };
    } catch (error) {
        console.error('Minecraft admin authorization error:', error?.message || error);
        return { ok: false, status: 503, message: 'לא ניתן לאמת הרשאות Minecraft כרגע' };
    }
}

app.post('/api/account/link-email', async (req, res) => {
    try {
        const { conn, user } = await getAuthenticatedSupabaseUser(req);
        if (!conn) return res.status(503).json({ success: false, message: 'חיבור מסד הנתונים אינו זמין' });
        if (!user) return res.status(401).json({ success: false, message: 'יש להתחבר מחדש לאתר' });

        const email = String(req.body?.email || '').trim().toLowerCase();
        const emailRedirectTo = String(req.body?.emailRedirectTo || '');
        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, message: 'כתובת דוא״ל לא תקינה' });
        }
        const isMinecraftInternalEmail = String(user.email || '').endsWith('@minecraft.eddyweb.invalid');
        const isPendingEmailRetry = String(user.email || '').toLowerCase() === email && !user.email_confirmed_at;
        if (!isMinecraftInternalEmail && !isPendingEmailRetry) {
            return res.status(409).json({ success: false, message: 'לחשבון כבר מוגדרת כתובת דוא״ל' });
        }
        let redirect;
        try {
            redirect = new URL(emailRedirectTo);
            if (redirect.protocol !== 'https:' && redirect.hostname !== 'localhost') throw new Error('Invalid protocol');
            if (!['eddy-web-seven.vercel.app', 'localhost', '127.0.0.1'].includes(redirect.hostname)) {
                throw new Error('Invalid redirect host');
            }
        } catch {
            return res.status(400).json({ success: false, message: 'כתובת אימות לא תקינה' });
        }

        // Minecraft-only accounts use an internal, undeliverable address. Replace it
        // server-side so Supabase doesn't require confirmation from that inaccessible address.
        if (isMinecraftInternalEmail) {
            const { error: updateError } = await supabaseClient.auth.admin.updateUserById(user.id, {
                email,
                email_confirm: false
            });
            if (updateError) {
                const message = String(updateError.message || '');
                if (/already registered|already been registered|email_exists/i.test(message) || updateError.code === 'email_exists') {
                    return res.status(409).json({ success: false, message: 'כתובת הדוא״ל כבר משויכת לחשבון אחר' });
                }
                throw updateError;
            }
        }

        // Send (or resend) a verification email to the new address. It stays unverified
        // until its owner opens the Supabase confirmation link.
        const { error: resendError } = await supabaseClient.auth.resend({
            type: 'signup',
            email,
            options: { emailRedirectTo: redirect.href }
        });
        if (resendError) {
            console.error('Email confirmation resend error:', resendError.message);
            return res.status(502).json({ success: false, message: 'הכתובת נשמרה כממתינה לאימות, אך שליחת המייל נכשלה. נסה שוב מאוחר יותר.' });
        }

        return res.json({ success: true, pendingVerification: true });
    } catch (error) {
        console.error('Minecraft account email linking error:', error?.message || error);
        return res.status(500).json({ success: false, message: 'לא ניתן לחבר את כתובת הדוא״ל כרגע' });
    }
});

app.post('/api/account/disconnect-minecraft', async (req, res) => {
    try {
        const { conn, user } = await getAuthenticatedSupabaseUser(req);
        if (!conn) return res.status(503).json({ success: false, message: 'חיבור מסד הנתונים אינו זמין' });
        if (!user) return res.status(401).json({ success: false, message: 'יש להתחבר מחדש לאתר' });

        // Remove only the Minecraft identity attached to this website account.
        // Minecraft/LuckPerms player data itself is not deleted or modified.
        const { error: metadataError } = await supabaseClient.auth.admin.updateUserById(user.id, {
            user_metadata: {
                ...(user.user_metadata || {}),
                minecraft_username: null,
                minecraft_uuid: null
            },
            app_metadata: {
                ...(user.app_metadata || {}),
                minecraft_uuid: null
            }
        });
        if (metadataError) throw metadataError;

        const { error: codesError } = await supabaseClient
            .from('minecraft_link_codes')
            .delete()
            .eq('user_id', user.id);
        if (codesError) throw codesError;

        return res.json({ success: true });
    } catch (error) {
        console.error('Minecraft account disconnect error:', error?.message || error);
        return res.status(500).json({ success: false, message: 'לא ניתן לנתק את חשבון Minecraft כרגע' });
    }
});

app.post('/api/account/delete', async (req, res) => {
    try {
        const { conn, user } = await getAuthenticatedSupabaseUser(req);
        if (!conn) return res.status(503).json({ success: false, message: 'חיבור מסד הנתונים אינו זמין' });
        if (!user) return res.status(401).json({ success: false, message: 'יש להתחבר מחדש לאתר' });

        // The service-role key never leaves the server. Supabase cascades deletion
        // to the user's temporary Minecraft link-code rows via the foreign key.
        const { error } = await supabaseClient.auth.admin.deleteUser(user.id);
        if (error) throw error;

        return res.json({ success: true });
    } catch (error) {
        console.error('EddyWEB account deletion error:', error?.message || error);
        return res.status(500).json({ success: false, message: 'לא ניתן למחוק את החשבון כרגע' });
    }
});

// Minecraft-first sign-in. The browser receives a short-lived code, and the server
// only issues a Supabase magic-link token after LuckPerms proves control of the Minecraft account.
app.post('/api/minecraft-auth/create', async (req, res) => {
    try {
        const conn = getDatabaseConnection();
        if (!conn) return res.status(503).json({ success: false, message: 'חיבור מסד הנתונים אינו זמין' });
        await supabaseClient.from('minecraft_login_codes').delete().lt('expires_at', new Date().toISOString());

        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ2346789';
        const crypto = require('crypto');
        for (let attempt = 0; attempt < 6; attempt++) {
            const code = Array.from(crypto.randomBytes(8), byte => alphabet[byte % alphabet.length]).join('');
            const { error } = await supabaseClient.from('minecraft_login_codes').insert({
                code,
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
            });
            if (!error) return res.json({ success: true, code, expiresInSeconds: 600 });
            if (error.code !== '23505') throw error;
        }
        return res.status(503).json({ success: false, message: 'לא ניתן ליצור קוד התחברות' });
    } catch (error) {
        console.error('Minecraft login code creation error:', error?.message || error);
        return res.status(500).json({ success: false, message: 'לא ניתן ליצור קוד התחברות כרגע' });
    }
});

async function findAuthUserByMinecraftUuid(uuid) {
    const normalized = String(uuid || '').replace(/-/g, '').toLowerCase();
    const legacyMatches = [];
    for (let page = 1; page <= 10; page++) {
        const { data, error } = await supabaseClient.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        const users = data?.users || [];
        const trusted = users.find(user =>
            String(user.app_metadata?.minecraft_uuid || '').replace(/-/g, '').toLowerCase() === normalized
        );
        if (trusted) return trusted;

        // Existing EDDYWEB accounts predate protected app_metadata. Only accept a unique legacy
        // metadata match; the Minecraft server proof is required before it is promoted to app_metadata.
        legacyMatches.push(...users.filter(user =>
            String(user.user_metadata?.minecraft_uuid || '').replace(/-/g, '').toLowerCase() === normalized
        ));
        if (users.length < 1000) break;
    }
    if (legacyMatches.length > 1) {
        throw new Error('More than one account claims this Minecraft UUID; sign in with email and reconnect Minecraft.');
    }
    return legacyMatches[0] || null;
}

app.get('/api/minecraft-auth/status', async (req, res) => {
    const code = String(req.query.code || '').trim().toUpperCase();
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ2346789]{8}$/.test(code)) {
        return res.status(400).json({ success: false, message: 'קוד התחברות לא תקין' });
    }

    try {
        const conn = getDatabaseConnection();
        if (!conn) return res.status(503).json({ success: false, message: 'חיבור מסד הנתונים אינו זמין' });
        const { data: loginCode, error: codeError } = await supabaseClient
            .from('minecraft_login_codes')
            .select('code,expires_at')
            .eq('code', code)
            .gt('expires_at', new Date().toISOString())
            .maybeSingle();
        if (codeError) throw codeError;
        if (!loginCode) return res.status(404).json({ success: false, pending: true });

        const { data: rows, error: permissionError } = await supabaseClient
            .from('luckperms_user_permissions')
            .select('id,uuid,permission,value,expiry')
            .eq('permission', 'meta.eddy_link.' + code)
            .eq('value', true)
            .order('id', { ascending: false })
            .limit(1);
        if (permissionError) throw permissionError;
        if (!rows?.length) return res.status(404).json({ success: false, pending: true });

        const row = rows[0];
        if (row.expiry && Number(row.expiry) > 0 && Number(row.expiry) < Math.floor(Date.now() / 1000)) {
            return res.status(404).json({ success: false, pending: true });
        }

        const { data: players, error: playerError } = await supabaseClient
            .from('luckperms_players')
            .select('uuid,username')
            .eq('uuid', row.uuid)
            .limit(1);
        if (playerError) throw playerError;
        const player = players?.[0];
        if (!player?.username || !player?.uuid) return res.status(404).json({ success: false, pending: true });

        let user = await findAuthUserByMinecraftUuid(player.uuid);
        if (!user) {
            const crypto = require('crypto');
            const cleanUuid = String(player.uuid).replace(/-/g, '').toLowerCase();
            const email = 'mc_' + cleanUuid + '@minecraft.eddyweb.invalid';
            const password = crypto.randomBytes(48).toString('base64url') + 'aA1!';
            const { data: created, error: createError } = await supabaseClient.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: {
                    display_name: player.username,
                    minecraft_username: player.username,
                    minecraft_uuid: player.uuid
                },
                app_metadata: {
                    minecraft_uuid: player.uuid
                }
            });
            if (createError) {
                // A concurrent login may have created the user after the first lookup.
                if (createError.code === 'email_exists' || /already been registered|already exists/i.test(createError.message || '')) {
                    user = await findAuthUserByMinecraftUuid(player.uuid);
                    if (!user) throw createError;
                } else {
                    throw createError;
                }
            } else {
                user = created.user;
            }
        } else {
            // Refresh the displayed Minecraft name without overwriting a real email or other profile fields.
            const { data: updated, error: updateError } = await supabaseClient.auth.admin.updateUserById(user.id, {
                user_metadata: {
                    ...(user.user_metadata || {}),
                    minecraft_username: player.username,
                    minecraft_uuid: player.uuid
                },
                app_metadata: {
                    ...(user.app_metadata || {}),
                    minecraft_uuid: player.uuid
                }
            });
            if (updateError) throw updateError;
            user = updated.user;
        }

        if (!user?.email) throw new Error('Minecraft account has no associated auth identity');
        const { data: magicLink, error: magicError } = await supabaseClient.auth.admin.generateLink({
            type: 'magiclink',
            email: user.email
        });
        if (magicError) throw magicError;
        const tokenHash = magicLink?.properties?.hashed_token;
        if (!tokenHash) throw new Error('Supabase did not return a magic-link token');

        // Consume the code and temporary LuckPerms marker before returning the one-time login token.
        const { error: deleteCodeError } = await supabaseClient.from('minecraft_login_codes').delete().eq('code', code);
        if (deleteCodeError) throw deleteCodeError;
        const { error: deletePermissionError } = await supabaseClient.from('luckperms_user_permissions').delete().eq('id', row.id);
        if (deletePermissionError) console.warn('Could not remove consumed Minecraft login marker:', deletePermissionError.message);

        return res.json({ success: true, tokenHash });
    } catch (error) {
        console.error('Minecraft login status error:', error?.message || error);
        return res.status(500).json({ success: false, message: 'שגיאה בהתחברות דרך Minecraft' });
    }
});

app.post('/api/minecraft-link/create', async (req, res) => {
    try {
        const { conn, user } = await getAuthenticatedSupabaseUser(req);
        if (!conn) return res.status(503).json({ success: false, message: 'חיבור מסד הנתונים אינו זמין. בדוק את SUPABASE_URL ואת מפתח השרת ב-Vercel.' });
        if (!user) return res.status(401).json({ success: false, message: 'יש להתחבר מחדש לאתר' });

        // One active code per website account; each code expires after 10 minutes.
        await supabaseClient.from('minecraft_link_codes').delete().eq('user_id', user.id);
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ2346789';
        const crypto = require('crypto');
        let code = '';
        let saved = false;
        for (let attempt = 0; attempt < 5 && !saved; attempt++) {
            code = Array.from(crypto.randomBytes(8), byte => alphabet[byte % alphabet.length]).join('');
            const { error } = await supabaseClient.from('minecraft_link_codes').insert({
                code,
                user_id: user.id,
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
            });
            if (!error) saved = true;
            else if (error.code !== '23505') throw error;
        }
        if (!saved) throw new Error('Could not generate a unique code');
        return res.json({ success: true, code, expiresInSeconds: 600 });
    } catch (error) {
        console.error('Minecraft link code creation error:', error?.message || error);
        return res.status(500).json({ success: false, message: 'לא ניתן ליצור קוד חיבור כרגע' });
    }
});

app.get('/api/minecraft-link/status', async (req, res) => {
    const code = String(req.query.code || '').trim().toUpperCase();
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ2346789]{8}$/.test(code)) {
        return res.status(400).json({ success: false, message: 'קוד חיבור לא תקין' });
    }

    try {
        const { conn, user } = await getAuthenticatedSupabaseUser(req);
        if (!conn) return res.status(503).json({ success: false, message: 'חיבור מסד הנתונים אינו זמין' });
        if (!user) return res.status(401).json({ success: false, message: 'יש להתחבר מחדש לאתר' });

        const { data: link, error: linkError } = await supabaseClient
            .from('minecraft_link_codes')
            .select('code,user_id,expires_at')
            .eq('code', code)
            .eq('user_id', user.id)
            .gt('expires_at', new Date().toISOString())
            .maybeSingle();
        if (linkError) throw linkError;
        if (!link) return res.status(404).json({ success: false, pending: true });

        const { data: rows, error } = await supabaseClient
            .from('luckperms_user_permissions')
            .select('id,uuid,permission,value,expiry')
            .eq('permission', 'meta.eddy_link.' + code)
            .eq('value', true)
            .order('id', { ascending: false })
            .limit(1);
        if (error) throw error;
        if (!rows || !rows.length) return res.status(404).json({ success: false, pending: true });

        const row = rows[0];
        if (row.expiry && Number(row.expiry) > 0 && Number(row.expiry) < Math.floor(Date.now() / 1000)) {
            return res.status(404).json({ success: false, pending: true });
        }
        const { data: players, error: playerError } = await supabaseClient
            .from('luckperms_players')
            .select('uuid,username')
            .eq('uuid', row.uuid)
            .limit(1);
        if (playerError) throw playerError;
        const player = players?.[0];
        if (!player?.username) return res.status(404).json({ success: false, pending: true });
        return res.json({ success: true, rowId: row.id, player: { uuid: player.uuid, username: player.username } });
    } catch (error) {
        console.error('Minecraft link status error:', error?.message || error);
        return res.status(500).json({ success: false, message: 'שגיאה בבדיקת חיבור Minecraft' });
    }
});

app.post('/api/minecraft-link/complete', async (req, res) => {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const rowId = Number(req.body?.rowId);
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ2346789]{8}$/.test(code) || !Number.isInteger(rowId) || rowId < 1) {
        return res.status(400).json({ success: false, message: 'פרטי חיבור לא תקינים' });
    }

    try {
        const { conn, user } = await getAuthenticatedSupabaseUser(req);
        if (!conn) return res.status(503).json({ success: false, message: 'חיבור מסד הנתונים אינו זמין' });
        if (!user) return res.status(401).json({ success: false, message: 'יש להתחבר מחדש לאתר' });

        const { data: link, error: linkError } = await supabaseClient
            .from('minecraft_link_codes')
            .select('code,user_id')
            .eq('code', code)
            .eq('user_id', user.id)
            .gt('expires_at', new Date().toISOString())
            .maybeSingle();
        if (linkError) throw linkError;
        if (!link) return res.status(404).json({ success: false, message: 'קוד החיבור פג תוקף או אינו שייך לחשבון זה' });

        const { data: verifiedRows, error: verifyPermissionError } = await supabaseClient
            .from('luckperms_user_permissions')
            .select('id,uuid,permission,value')
            .eq('id', rowId)
            .eq('permission', 'meta.eddy_link.' + code)
            .eq('value', true)
            .limit(1);
        if (verifyPermissionError) throw verifyPermissionError;
        const verifiedRow = verifiedRows?.[0];
        if (!verifiedRow?.uuid) return res.status(404).json({ success: false, message: 'קוד החיבור כבר אינו תקף' });

        const { error: trustedIdentityError } = await supabaseClient.auth.admin.updateUserById(user.id, {
            app_metadata: {
                ...(user.app_metadata || {}),
                minecraft_uuid: verifiedRow.uuid
            }
        });
        if (trustedIdentityError) throw trustedIdentityError;

        const { error: deletePermissionError } = await supabaseClient
            .from('luckperms_user_permissions')
            .delete()
            .eq('id', rowId)
            .eq('permission', 'meta.eddy_link.' + code);
        if (deletePermissionError) throw deletePermissionError;

        const { error: deleteCodeError } = await supabaseClient
            .from('minecraft_link_codes')
            .delete()
            .eq('code', code)
            .eq('user_id', user.id);
        if (deleteCodeError) throw deleteCodeError;
        return res.json({ success: true });
    } catch (error) {
        console.error('Minecraft link cleanup error:', error?.message || error);
        return res.status(500).json({ success: false, message: 'החשבון חובר, אך לא הצלחנו לנקות את קוד החיבור' });
    }
});

async function ensureSiteContentTable(conn) {
    await conn.execute(`
        CREATE TABLE IF NOT EXISTS site_content (
            content_key VARCHAR(64) PRIMARY KEY,
            content_json JSON NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
}

async function ensurePlayerSyncTable(conn) {
    await conn.execute(`
        CREATE TABLE IF NOT EXISTS player_profiles (
            uuid VARCHAR(36) PRIMARY KEY,
            username VARCHAR(16) NOT NULL,
            money DECIMAL(30, 2) NULL,
            discord_id VARCHAR(32) NULL,
            discord_username VARCHAR(100) NULL,
            discord_tag VARCHAR(100) NULL,
            discord_avatar VARCHAR(500) NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
}

app.post('/api/player-sync', async (req, res) => {
    const expectedToken = process.env.PLAYER_SYNC_TOKEN;
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (!expectedToken) {
        return res.status(503).json({ success: false, message: 'PLAYER_SYNC_TOKEN אינו מוגדר ב-Vercel' });
    }

    if (!token || token !== expectedToken) {
        return res.status(401).json({ success: false, message: 'אין הרשאה' });
    }

    const username = String(req.body?.username || '').trim();
    const uuid = String(req.body?.uuid || '').trim();
    const money = req.body?.money;
    const discord = req.body?.discord && typeof req.body.discord === 'object' ? req.body.discord : null;

    if (!/^[A-Za-z0-9_]{3,16}$/.test(username) || !/^[0-9a-fA-F-]{36}$/.test(uuid)) {
        return res.status(400).json({ success: false, message: 'פרטי שחקן לא תקינים' });
    }

    if (money !== null && money !== undefined && !Number.isFinite(Number(money))) {
        return res.status(400).json({ success: false, message: 'סכום כסף לא תקין' });
    }

    const conn = getDatabaseConnection();
    if (!conn) {
        return res.status(503).json({ success: false, message: 'SUPABASE_URL או SUPABASE_SECRET_KEY אינם מוגדרים ב-Vercel' });
    }

    try {
        await ensurePlayerSyncTable(conn);

        const discordId = discord ? String(discord.id ?? discord.discord_id ?? '').trim() || null : null;
        const discordUsername = discord ? String(discord.username ?? discord.discord_username ?? '').trim() || null : null;
        const discordTag = discord ? String(discord.tag ?? discord.discord_tag ?? '').trim() || null : null;
        const discordAvatar = discord ? String(discord.avatar ?? discord.discord_avatar ?? discord.avatar_url ?? '').trim() || null : null;
        const numericMoney = money === null || money === undefined ? null : Number(money);

        await conn.execute(
            `INSERT INTO player_profiles
                (uuid, username, money, discord_id, discord_username, discord_tag, discord_avatar)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                username = VALUES(username),
                money = COALESCE(VALUES(money), money),
                discord_id = COALESCE(VALUES(discord_id), discord_id),
                discord_username = COALESCE(VALUES(discord_username), discord_username),
                discord_tag = COALESCE(VALUES(discord_tag), discord_tag),
                discord_avatar = COALESCE(VALUES(discord_avatar), discord_avatar),
                updated_at = CURRENT_TIMESTAMP`,
            [uuid, username, numericMoney, discordId, discordUsername, discordTag, discordAvatar]
        );

        return res.json({ success: true });
    } catch (error) {
        console.error('Player sync error:', error);
        return res.status(500).json({ success: false, message: 'שגיאה בשמירת נתוני השחקן' });
    }
});

function getRankLabel(group) {
    try {
        const labels = JSON.parse(process.env.RANK_LABELS_JSON || '{}');
        return labels[group] || group || 'default';
    } catch {
        return group || 'default';
    }
}

async function runOptionalPlayerQuery(query, value) {
    return null; // Optional custom SQL queries are disabled after the migration to Supabase.
}

app.get('/api/player-profile', async (req, res) => {
    const username = String(req.query.username || '').trim();

    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) {
        return res.status(400).json({ success: false, message: 'שם Minecraft לא תקין' });
    }

    const conn = getDatabaseConnection();
    if (!conn) {
        return res.status(503).json({ success: false, message: 'TIDB_URL אינו מוגדר ב-Render' });
    }

    try {
        const prefix = (process.env.TIDB_LP_PREFIX || 'luckperms_').replace(/[^A-Za-z0-9_]/g, '');
        const rows = await conn.execute(
            'SELECT uuid, username, primary_group FROM ' + prefix + 'players WHERE LOWER(username) = LOWER(?) LIMIT 1',
            [username]
        );

        const player = Array.isArray(rows) && rows.length ? rows[0] : null;
        if (!player) {
            return res.status(404).json({ success: false, message: 'השחקן לא נמצא במסד הנתונים של LuckPerms' });
        }

        const uuid = String(player.uuid || '');
        const playerName = String(player.username || username);
        let group = String(player.primary_group || 'default').trim();

        // LuckPerms can leave primary_group as "default" while assigning
        // another group directly (for example: group.owner) in user permissions.
        // Prefer a non-default direct group assignment when primary_group is default.
        if (!group || group.toLowerCase() === 'default') {
            const permissionRows = await conn.execute(
                'SELECT permission FROM ' + prefix + 'user_permissions WHERE uuid = ? AND value = 1 AND permission LIKE ? ORDER BY id DESC',
                [uuid, 'group.%']
            );

            const assignedGroups = (Array.isArray(permissionRows) ? permissionRows : [])
                .map(row => String(row.permission || '').trim())
                .filter(permission => /^group\.[A-Za-z0-9_-]+$/i.test(permission))
                .map(permission => permission.slice('group.'.length))
                .filter(name => name && name.toLowerCase() !== 'default');

            if (assignedGroups.length) {
                group = assignedGroups[0];
            }
        }

        let money = null;
        let playtime = null;
        let discord = null;

        // Read the live balance directly from LuckPerms first.
        // LuckPerms stores normal user meta nodes in the user_permissions table.
        // A meta node such as "eddy_money = $6,429,884.93" is serialized as:
        //   meta.eddy_money.$6,429,884\\.93
        // (the dot in the value is escaped because "." separates node parts).
        try {
            // Read ALL direct meta nodes for this UUID from the same table used by
            // the working rank lookup, then find the eddy_money node in JavaScript.
            // This avoids relying on SQL LIKE semantics for the underscore in eddy_money.
            const metaRows = await conn.execute(
                'SELECT permission FROM ' + prefix + 'user_permissions ' +
                'WHERE uuid = ? AND value = 1 AND LOWER(permission) LIKE ? ' +
                'ORDER BY id DESC',
                [uuid, 'meta.%']
            );

            const candidates = (Array.isArray(metaRows) ? metaRows : [])
                .map(row => String(row.permission || ''))
                .filter(permission => permission.toLowerCase().startsWith('meta.'));

            const moneyNode = candidates.find(permission => {
                const rest = permission.slice(5);
                const separator = rest.indexOf('.');
                if (separator < 1) return false;
                const metaKey = rest.slice(0, separator);
                return metaKey.toLowerCase() === 'eddy_money';
            });

            console.log('Player money meta lookup', {
                username: playerName,
                metaNodeCount: candidates.length,
                moneyNodeFound: Boolean(moneyNode)
            });

            if (moneyNode) {
                const rawValue = moneyNode.slice('meta.eddy_money.'.length);
                const decodedValue = rawValue
                    .replace(/\\([.])/g, '$1')
                    .replace(/\\([/\\$-])/g, '$1')
                    .trim();

                if (decodedValue) {
                    money = decodedValue;
                }
            }

            // LuckPerms playtime is stored in Supabase in the same user_permissions
            // table, as a meta node beginning with "meta.eddy_playtime".
            // Example:
            // meta.eddy_playtime.3 days and 2 hours and 2 minutes and 20.4 seconds
            const playtimeRows = await conn.execute(
                'SELECT permission, value FROM ' + prefix + 'user_permissions ' +
                'WHERE uuid = ? AND LOWER(permission) LIKE ? ' +
                'ORDER BY id DESC',
                [uuid, 'meta.eddy_playtime%']
            );

            const playtimeNode = Array.isArray(playtimeRows) && playtimeRows.length
                ? playtimeRows[0]
                : null;

            if (playtimeNode) {
                const permission = String(playtimeNode.permission || '');
                const match = permission.match(/^meta\.eddy_playtime(?:\.|\\\.)(.+)$/i);

                if (match && match[1]) {
                    playtime = match[1]
                        .replace(/\\([.])/g, '$1')
                        .replace(/\\([/\\$-])/g, '$1')
                        .trim();
                }

                // Also support a schema where the metadata value itself is
                // stored in the value column instead of the permission suffix.
                if (!playtime && playtimeNode.value !== undefined && playtimeNode.value !== null) {
                    const value = String(playtimeNode.value).trim();
                    if (value && value.toLowerCase() !== 'true' && value.toLowerCase() !== 'false') {
                        playtime = value;
                    }
                }
            }

            console.log('Player playtime Supabase lookup', {
                username: playerName,
                uuid,
                playtimeNodeFound: Boolean(playtimeNode),
                playtime
            });
        } catch (lpMoneyError) {
            console.warn('LuckPerms money meta read skipped:', lpMoneyError?.message || lpMoneyError);
        }

        // Keep the synced player profile as a fallback for older data.
        try {
            await ensurePlayerSyncTable(conn);
            const profileRows = await conn.execute(
                'SELECT money, discord_id, discord_username, discord_tag, discord_avatar FROM player_profiles WHERE uuid = ? LIMIT 1',
                [uuid]
            );
            const synced = Array.isArray(profileRows) && profileRows.length ? profileRows[0] : null;

            if (synced) {
                if (money === null && synced.money != null) {
                    money = synced.money;
                }
                if (synced.discord_id) {
                    discord = synced;
                }
            }
        } catch (syncReadError) {
            console.warn('Player sync table read skipped:', syncReadError?.message || syncReadError);
        }

        // Optional fallback for other economy databases.
        if (money === null && process.env.PLAYER_MONEY_QUERY) {
            const by = String(process.env.PLAYER_MONEY_LOOKUP || 'username').toLowerCase();
            const optionalMoney = await runOptionalPlayerQuery(
                process.env.PLAYER_MONEY_QUERY,
                by === 'uuid' ? uuid : playerName
            );

            if (optionalMoney) {
                money = optionalMoney.balance ?? optionalMoney.money ?? optionalMoney.amount ?? optionalMoney.coins ?? null;
            }
        }

        if (!discord && process.env.PLAYER_DISCORD_QUERY) {
            const by = String(process.env.PLAYER_DISCORD_LOOKUP || 'uuid').toLowerCase();
            discord = await runOptionalPlayerQuery(process.env.PLAYER_DISCORD_QUERY, by === 'username' ? playerName : uuid);
        }

        const normalizedMoney = money !== null && money !== undefined
            ? (typeof money === 'object'
                ? (money.balance ?? money.money ?? money.amount ?? money.coins ?? null)
                : money)
            : null;

        return res.json({
            success: true,
            player: {
                username: playerName,
                uuid,
                rank: group,
                rank_label: getRankLabel(group),
                money: normalizedMoney,
                playtime: playtime,
                discord: discord ? {
                    id: discord.discord_id ?? discord.id ?? null,
                    username: discord.discord_username ?? discord.username ?? null,
                    tag: discord.discord_tag ?? discord.tag ?? null,
                    avatar: discord.discord_avatar ?? discord.avatar_url ?? discord.avatar ?? null
                } : null
            }
        });
    } catch (error) {
        const message = String(error?.message || '');
        if (/usage quota|quota being exhausted|49900002/i.test(message) || error?.details?.code === 49900002) {
            return res.status(503).json({
                success: false,
                code: 'DATABASE_QUOTA_EXCEEDED',
                message: 'מסד הנתונים אינו זמין כרגע. יש לבדוק את הגדרות Supabase ב-Vercel.'
            });
        }

        console.error('Player profile error:', error);
        return res.status(503).json({
            success: false,
            message: 'מסד הנתונים אינו זמין כרגע. נסה שוב מאוחר יותר.'
        });
    }
});

// Vercel imports the Express app as a serverless function. Keep local/Render support too.
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;