const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

// נקודת קצה לבדיקת הסיסמה
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
        return res.status(500).json({ success: false, message: 'משתנה הסביבה ADMIN_PASSWORD אינו מוגדר בשרת' });
    }

    if (password === adminPassword) {
        return res.json({ success: true });
    } else {
        return res.status(401).json({ success: false, message: 'סיסמה שגויה' });
    }
});

// נקודת קצה לשמירת המודעות המעודכנות ב-news.json
app.post('/api/save-news', (req, res) => {
    const { password, news } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (password !== adminPassword) {
        return res.status(401).json({ success: false, message: 'אין הרשאה מורשית' });
    }

    fs.writeFile(path.join(__dirname, 'news.json'), JSON.stringify(news, null, 2), 'utf8', (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'כשל בכתיבה לקובץ' });
        }
        res.json({ success: true });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));