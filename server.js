const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());
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

app.post('/api/save-news', (req, res) => {
    const { password, news } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (password !== adminPassword) {
        return res.status(401).json({ success: false, message: 'אין הרשאה' });
    }

    fs.writeFile(path.join(__dirname, 'news.json'), JSON.stringify(news, null, 2), 'utf8', (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'כשל בכתיבה לקובץ' });
        }
        res.json({ success: true });
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
            message: 'משתנה GROQ_API_KEY אינו מוגדר ב-Render'
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
        'אתה עורך תוכן מקצועי לאתר קהילת Minecraft בשם EddyWEB.',
        'שפר את המאמר כך שיהיה ברור, טבעי, מעניין ומקצועי יותר, בלי לנפח סתם את הטקסט.',
        'שמור על העובדות והמשמעות של הטקסט המקורי. אל תמציא עדכונים, תאריכים, פיצרים, כתובות, מספרים או הבטחות שלא הופיעו במקור.',
        'אפשר לתקן שגיאות כתיב וניסוח, לשפר מבנה, ולהפוך changelog למובן וקריא.',
        'החזר גם עברית וגם אנגלית באיכות טבעית.',
        'ב-content_he וב-content_en החזר HTML בלבד שמתאים לעורך Quill.',
        'מותר להשתמש רק בתגיות: p, h2, h3, strong, em, u, ol, ul, li, blockquote, br.',
        'אל תשתמש ב-markdown, script, style, iframe או JavaScript.',
        'החזר JSON בלבד בהתאם לסכמה שניתנה.'
    ].join(' ');

    const userPrompt = [
        'זה המאמר הנוכחי:',
        JSON.stringify(cleanInput, null, 2),
        '',
        'שפר את כל השדות.',
        'אם שדה בשפה מסוימת ריק, צור אותו על בסיס השפה השנייה והתוכן הקיים.',
        'כותרות צריכות להיות קצרות וברורות.',
        'התקציר צריך להתאים לכרטיס החדשות בדף הבית.',
        'התוכן המלא צריך להיות קריא ומסודר עם פסקאות וכותרות רק כשזה באמת מועיל.'
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
                temperature: 0.55,
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));