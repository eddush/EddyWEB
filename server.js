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

app.post('/api/login', (req, res) => {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
        return res.status(500).json({ success: false, message: 'משתנה ADMIN_PASSWORD אינו מוגדר' });
    }

    if (password === adminPassword) {
        return res.json({ success: true });
    } else {
        return res.status(401).json({ success: false, message: 'סיסמה שגויה' });
    }
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
    const { password, news } = req.body || {};
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword || password !== adminPassword) {
        return res.status(401).json({ success: false, message: 'אין הרשאה' });
    }

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
    const { password, article } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const groqApiKey = process.env.GROQ_API_KEY;

    if (password !== adminPassword) {
        return res.status(401).json({ success: false, message: 'אין הרשאה' });
    }

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

// Minecraft account linking: the website polls the same LuckPerms tables used by player lookup.
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

app.get('/api/minecraft-link/status', async (req, res) => {
    const code = String(req.query.code || '').trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
        return res.status(400).json({ success: false, message: 'קוד חיבור לא תקין' });
    }

    try {
        const { conn, user } = await getAuthenticatedSupabaseUser(req);
        if (!conn) return res.status(503).json({ success: false, message: 'חיבור מסד הנתונים אינו זמין' });
        if (!user) return res.status(401).json({ success: false, message: 'יש להתחבר מחדש לאתר' });

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
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code) || !Number.isInteger(rowId) || rowId < 1) {
        return res.status(400).json({ success: false, message: 'פרטי חיבור לא תקינים' });
    }

    try {
        const { conn, user } = await getAuthenticatedSupabaseUser(req);
        if (!conn) return res.status(503).json({ success: false, message: 'חיבור מסד הנתונים אינו זמין' });
        if (!user) return res.status(401).json({ success: false, message: 'יש להתחבר מחדש לאתר' });

        const { error } = await supabaseClient
            .from('luckperms_user_permissions')
            .delete()
            .eq('id', rowId)
            .eq('permission', 'meta.eddy_link.' + code);
        if (error) throw error;
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