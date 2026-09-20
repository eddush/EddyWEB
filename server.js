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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));