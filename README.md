# AllyEye 🤝

פלטפורמת ניטור וניהול שיחות יומיות לגיל השלישי.

## מבנה הפרויקט

```
allyeye/
├── index.html
├── package.json
├── vite.config.js
├── vercel.json
└── src/
    ├── main.jsx
    └── App.jsx
```

## העלאה ל-Vercel (מנייד)

### שלב 1 — GitHub
1. פתח [github.com](https://github.com) בדפדפן
2. לחץ **+** → **New repository**
3. שם: `allyeye` → **Create repository**
4. לחץ **uploading an existing file**
5. העלה את כל הקבצים (שמור על מבנה התיקיות)

### שלב 2 — Vercel
1. פתח [vercel.com](https://vercel.com)
2. **Add New Project** → **Import Git Repository**
3. בחר `allyeye`
4. הגדרות Build:
   - Framework: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. לחץ **Deploy**

## פיתוח מקומי (אם יש מחשב)

```bash
npm install
npm run dev
```

## חיבור Vapi

בממשק → ⚙️ הגדרות:
- Vapi API Key (מ-dashboard.vapi.ai → API Keys)
- Assistant ID (מה-URL של ה-Agent)
