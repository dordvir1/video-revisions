const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'revisions.json');

// ─── Config — שנה כאן את פרטי המייל שלך ───────────────────────────────────
const CONFIG = {
  YOUR_EMAIL: 'dordvir0604@gmail.com',
  SMTP_USER: 'dordvir0604@gmail.com',
  SMTP_PASS: 'bnoq sdcm ogiq mfoi',
};
// ───────────────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Load/save DB
function loadDB() {
  if (!fs.existsSync(DB_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return []; }
}
function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: CONFIG.SMTP_USER, pass: CONFIG.SMTP_PASS }
});

// ─── API: הגשת בקשת תיקון ────────────────────────────────────────────────
app.post('/api/revisions', async (req, res) => {
  const { clientName, clientEmail, driveLink, videoName, revisions, priority, notes } = req.body;

  if (!clientName || !driveLink || !revisions?.length) {
    return res.status(400).json({ error: 'חסרים פרטים חובה' });
  }

  const newRevision = {
    id: uuidv4(),
    clientName,
    clientEmail: clientEmail || '',
    driveLink,
    videoName: videoName || 'לא צוין',
    revisions,
    priority: priority || 'רגיל',
    notes: notes || '',
    status: 'ממתין',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const db = loadDB();
  db.unshift(newRevision);
  saveDB(db);

  // שלח מייל
  try {
    await transporter.sendMail({
      from: `"מערכת תיקונים" <${CONFIG.SMTP_USER}>`,
      to: CONFIG.YOUR_EMAIL,
      subject: `🎬 בקשת תיקון חדשה — ${clientName}`,
      html: buildEmailHTML(newRevision)
    });

    // מייל אישור ללקוח
    if (clientEmail) {
      await transporter.sendMail({
        from: `"מערכת תיקונים" <${CONFIG.SMTP_USER}>`,
        to: clientEmail,
        subject: `✅ בקשת התיקון שלך התקבלה`,
        html: buildClientConfirmHTML(newRevision)
      });
    }
  } catch (err) {
    console.error('שגיאת מייל:', err.message);
    // לא נכשל — הבקשה נשמרה בכל מקרה
  }

  res.json({ success: true, id: newRevision.id });
});

// ─── API: קבלת כל הבקשות (לדשבורד) ─────────────────────────────────────
app.get('/api/revisions', (req, res) => {
  const db = loadDB();
  res.json(db);
});

// ─── API: עדכון סטטוס ────────────────────────────────────────────────────
app.patch('/api/revisions/:id', (req, res) => {
  const db = loadDB();
  const idx = db.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'לא נמצא' });
  db[idx] = { ...db[idx], ...req.body, updatedAt: new Date().toISOString() };
  saveDB(db);
  res.json(db[idx]);
});

// ─── API: מחיקת בקשה ─────────────────────────────────────────────────────
app.delete('/api/revisions/:id', (req, res) => {
  let db = loadDB();
  db = db.filter(r => r.id !== req.params.id);
  saveDB(db);
  res.json({ success: true });
});

// ─── Email templates ──────────────────────────────────────────────────────
function buildEmailHTML(r) {
  const revList = r.revisions.map((rev, i) =>
    `<tr>
      <td style="padding:10px;border-bottom:1px solid #f0f0f0;color:#555;">${i + 1}</td>
      <td style="padding:10px;border-bottom:1px solid #f0f0f0;">${rev.timecode || '—'}</td>
      <td style="padding:10px;border-bottom:1px solid #f0f0f0;">${rev.description}</td>
    </tr>`
  ).join('');

  return `
  <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
    <div style="background:linear-gradient(135deg,#667eea,#764ba2);padding:30px;text-align:center;border-radius:12px 12px 0 0;">
      <h1 style="color:#fff;margin:0;font-size:24px;">🎬 בקשת תיקון חדשה</h1>
    </div>
    <div style="padding:25px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 12px 12px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:8px;color:#888;width:140px;">לקוח:</td><td style="padding:8px;font-weight:bold;">${r.clientName}</td></tr>
        <tr><td style="padding:8px;color:#888;">מייל לקוח:</td><td style="padding:8px;">${r.clientEmail || '—'}</td></tr>
        <tr><td style="padding:8px;color:#888;">שם סרטון:</td><td style="padding:8px;">${r.videoName}</td></tr>
        <tr><td style="padding:8px;color:#888;">עדיפות:</td><td style="padding:8px;"><span style="background:${r.priority === 'דחוף' ? '#ffe0e0' : r.priority === 'גבוה' ? '#fff3cd' : '#e8f5e9'};padding:3px 10px;border-radius:20px;font-size:13px;">${r.priority}</span></td></tr>
        <tr><td style="padding:8px;color:#888;">קישור Drive:</td><td style="padding:8px;"><a href="${r.driveLink}" style="color:#667eea;">פתח תיקייה ↗</a></td></tr>
      </table>

      <h3 style="color:#333;border-bottom:2px solid #667eea;padding-bottom:8px;">רשימת תיקונים (${r.revisions.length})</h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:#f8f9ff;">
          <th style="padding:10px;text-align:right;color:#667eea;">#</th>
          <th style="padding:10px;text-align:right;color:#667eea;">טיים-קוד</th>
          <th style="padding:10px;text-align:right;color:#667eea;">תיאור התיקון</th>
        </tr></thead>
        <tbody>${revList}</tbody>
      </table>

      ${r.notes ? `<div style="margin-top:20px;padding:15px;background:#f8f9ff;border-radius:8px;border-right:4px solid #667eea;"><strong>הערות:</strong> ${r.notes}</div>` : ''}
      <p style="margin-top:25px;color:#888;font-size:13px;">זמן הגשה: ${new Date(r.createdAt).toLocaleString('he-IL')}</p>
    </div>
  </div>`;
}

function buildClientConfirmHTML(r) {
  return `
  <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#667eea,#764ba2);padding:30px;text-align:center;border-radius:12px 12px 0 0;">
      <h1 style="color:#fff;margin:0;">✅ בקשתך התקבלה!</h1>
    </div>
    <div style="padding:25px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 12px 12px;">
      <p>שלום <strong>${r.clientName}</strong>,</p>
      <p>קיבלנו את בקשת התיקון שלך עבור הסרטון: <strong>${r.videoName}</strong></p>
      <p>מספר תיקונים שהוגשו: <strong>${r.revisions.length}</strong></p>
      <p>נחזור אליך בהקדם עם עדכון. תודה! 🙏</p>
    </div>
  </div>`;
}

app.listen(PORT, () => {
  console.log(`\n🚀 השרת רץ על http://localhost:${PORT}`);
  console.log(`📋 דשבורד ניהול: http://localhost:${PORT}/admin.html`);
  console.log(`📝 טופס לקוח:    http://localhost:${PORT}/index.html\n`);
});
