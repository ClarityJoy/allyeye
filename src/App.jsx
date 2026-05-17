import { useState, useEffect, useCallback } from "react";

// ─── Persistent Storage via localStorage ─────────────────────────────────────
const store = {
  async get(key) {
    try { const r = localStorage.getItem("allyeye_" + key); return r ? JSON.parse(r) : null; }
    catch { return null; }
  },
  async set(key, val) {
    try { localStorage.setItem("allyeye_" + key, JSON.stringify(val)); } catch {}
  }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10);
const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "—";
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("he-IL") : "—";
const uid = () => Math.random().toString(36).slice(2, 9);

const STATUS_COLORS = { green: "#22c55e", yellow: "#eab308", red: "#ef4444", none: "#6b7280" };
const STATUS_LABELS = { green: "תקין", yellow: "לבדוק", red: "דחוף", none: "ממתין" };
const STATUS_EMOJI  = { green: "🟢", yellow: "🟡", red: "🔴", none: "⏳" };

const SAMPLE_ELDERLY = [
  { id: "e1", name: "דבורה כהן", age: 78, phone: "052-1234567", callTime: "08:30", familyName: "יוסי כהן", familyPhone: "054-9876543", active: true },
  { id: "e2", name: "אברהם לוי", age: 82, phone: "054-2345678", callTime: "09:00", familyName: "רחל לוי",  familyPhone: "052-8765432", active: true },
];

const SAMPLE_CALLS = [
  { id: "c1", elderlyId: "e1", date: today(), calledAt: new Date(Date.now()-3600000).toISOString(), duration: 4.2, answered: true, status: "green",  mood: "חיובי", foodOk: true,  medOk: true,  painNote: "", summary: "דבורה נשמעה שמחה וחיונית. אכלה ארוחת בוקר, שתתה קפה. מתכננת לפגוש חברה בצהריים. ללא תלונות.", whatsappSent: true },
  { id: "c2", elderlyId: "e2", date: today(), calledAt: new Date(Date.now()-3000000).toISOString(), duration: 5.8, answered: true, status: "yellow", mood: "ניטרלי", foodOk: false, medOk: true,  painNote: "כאב ראש קל", summary: "אברהם נשמע עייף. לא אכל עדיין, אמר שאין תיאבון. ציין כאב ראש קל. כדאי לבדוק בהמשך היום.", whatsappSent: false },
];

// ─── WhatsApp message builder ────────────────────────────────────────────────
function buildWhatsApp(call, elderly) {
  const s = STATUS_EMOJI[call.status];
  const label = STATUS_LABELS[call.status];
  const lines = [
    `🌅 דיווח בוקר – ${elderly.name} 👴`,
    `${s} ${label}`,
    ``,
    `📋 סיכום: ${call.summary}`,
    ``,
    `⏱ משך שיחה: ${call.duration} דק'`,
    `📅 ${fmtDate(call.calledAt)} | ${fmtTime(call.calledAt)}`,
    ``,
    `– AllyEye`,
  ];
  return lines.join("\n");
}

// ─── Claude API: generate summary from transcript ────────────────────────────
async function generateSummary(transcript, elderlyName) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: `אתה מערכת שמנתחת שיחות בוקר עם קשישים ומייצרת סיכומים קצרים למשפחה.
החזר JSON בלבד (ללא markdown) עם השדות:
- summary: string (2-3 משפטים בעברית, חם ואנושי, לא רפואי)
- status: "green" | "yellow" | "red"
- mood: "חיובי" | "ניטרלי" | "שלילי"
- foodOk: boolean
- medOk: boolean
- painNote: string (ריק אם אין)
- urgentAction: string (ריק אם אין פעולה נדרשת)`,
      messages: [{
        role: "user",
        content: `שם הקשיש: ${elderlyName}\n\nתמליל השיחה:\n${transcript}\n\nנתח את השיחה והחזר JSON.`
      }]
    })
  });
  const data = await res.json();
  const text = data.content?.find(b => b.type === "text")?.text || "{}";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ─── Vapi webhook simulator (for demo — replace with real webhook URL) ────────
function simulateVapiWebhook(elderlyId, elderlyName) {
  return {
    call_id: uid(),
    assistant_id: "your-vapi-assistant-id",
    ended_at: new Date().toISOString(),
    duration: +(3 + Math.random() * 4).toFixed(1),
    transcript: `אבי: שלום! כאן אבי משירות AllyEye. איך אתה מרגיש הבוקר?\n${elderlyName}: בוקר טוב אבי, תודה שהתקשרת. אני מרגיש סבבה, ישנתי טוב.\nאבי: נהדר לשמוע! מה אכלת הבוקר?\n${elderlyName}: שתיתי קפה ואכלתי טוסט עם גבינה.\nאבי: מצוין. יש משהו שמציק לך הגוף?\n${elderlyName}: לא, הכל בסדר. קצת עייף אבל זה עובר.\nאבי: שמח לשמוע. יש תוכניות להיום?\n${elderlyName}: כן, הנכדה קופצת אחה"צ. מחכה לה.\nאבי: איזה נעים! שיהיה לך יום נפלא, נשתמע מחר.`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function StatusBadge({ status, size = "sm" }) {
  const colors = { green: "#dcfce7", yellow: "#fef9c3", red: "#fee2e2", none: "#f3f4f6" };
  const text   = { green: "#166534", yellow: "#854d0e", red: "#991b1b", none: "#374151" };
  const pad = size === "lg" ? "8px 16px" : "3px 10px";
  const fs  = size === "lg" ? 14 : 12;
  return (
    <span style={{ background: colors[status], color: text[status], padding: pad, borderRadius: 20, fontSize: fs, fontWeight: 700, fontFamily: "inherit" }}>
      {STATUS_EMOJI[status]} {STATUS_LABELS[status]}
    </span>
  );
}

function Card({ children, style = {} }) {
  return <div style={{ background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,.08)", ...style }}>{children}</div>;
}

function Btn({ children, onClick, variant = "primary", size = "md", disabled = false, style = {} }) {
  const base = { border: "none", borderRadius: 10, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "all .15s", opacity: disabled ? .5 : 1 };
  const variants = {
    primary:  { background: "#0f172a", color: "#fff", padding: size === "sm" ? "6px 14px" : "10px 22px", fontSize: size === "sm" ? 13 : 14 },
    ghost:    { background: "transparent", color: "#0f172a", padding: size === "sm" ? "6px 14px" : "10px 22px", fontSize: size === "sm" ? 13 : 14, border: "1.5px solid #e2e8f0" },
    green:    { background: "#22c55e", color: "#fff", padding: size === "sm" ? "6px 14px" : "10px 22px", fontSize: size === "sm" ? 13 : 14 },
    red:      { background: "#ef4444", color: "#fff", padding: size === "sm" ? "6px 14px" : "10px 22px", fontSize: size === "sm" ? 13 : 14 },
    yellow:   { background: "#eab308", color: "#fff", padding: size === "sm" ? "6px 14px" : "10px 22px", fontSize: size === "sm" ? 13 : 14 },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...style }}>{children}</button>;
}

function Input({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{label}</label>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", outline: "none", direction: "rtl" }} />
    </div>
  );
}

// ─── MODAL ───────────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 32, width: "min(520px,92vw)", maxHeight: "90vh", overflow: "auto", direction: "rtl" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{title}</h2>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", color: "#6b7280" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── ELDERLY FORM ─────────────────────────────────────────────────────────────
function ElderlyForm({ initial, onSave, onClose }) {
  const empty = { name: "", age: "", phone: "", callTime: "08:30", familyName: "", familyPhone: "", active: true };
  const [form, setForm] = useState(initial || empty);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Input label="שם הקשיש/ה" value={form.name} onChange={v => set("name", v)} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="גיל" type="number" value={form.age} onChange={v => set("age", v)} />
        <Input label="שעת שיחה" type="time" value={form.callTime} onChange={v => set("callTime", v)} />
      </div>
      <Input label="טלפון קשיש/ה" value={form.phone} onChange={v => set("phone", v)} placeholder="05X-XXXXXXX" />
      <div style={{ height: 1, background: "#f1f5f9", margin: "4px 0" }} />
      <Input label="שם בן/בת המשפחה" value={form.familyName} onChange={v => set("familyName", v)} />
      <Input label="טלפון בן/בת המשפחה" value={form.familyPhone} onChange={v => set("familyPhone", v)} placeholder="05X-XXXXXXX" />
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-start", marginTop: 8 }}>
        <Btn onClick={() => onSave({ ...form, id: form.id || uid(), age: +form.age })}>שמור</Btn>
        <Btn variant="ghost" onClick={onClose}>ביטול</Btn>
      </div>
    </div>
  );
}

// ─── CALL DETAIL MODAL ────────────────────────────────────────────────────────
function CallDetail({ call, elderly, onClose, onSendWhatsApp, onStatusChange }) {
  const [sending, setSending] = useState(false);
  const msg = buildWhatsApp(call, elderly);
  const waLink = `https://wa.me/972${elderly.familyPhone.replace(/[^0-9]/g,"").slice(1)}?text=${encodeURIComponent(msg)}`;

  const handleSend = async () => {
    setSending(true);
    window.open(waLink, "_blank");
    await new Promise(r => setTimeout(r, 800));
    onSendWhatsApp(call.id);
    setSending(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>{fmtDate(call.calledAt)} | {fmtTime(call.calledAt)} | {call.duration} דק'</div>
        </div>
        <StatusBadge status={call.status} size="lg" />
      </div>

      {/* Status override */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#374151" }}>עדכן סטטוס</div>
        <div style={{ display: "flex", gap: 8 }}>
          {["green","yellow","red"].map(s => (
            <Btn key={s} variant={call.status === s ? s : "ghost"} size="sm"
              onClick={() => onStatusChange(call.id, s)}>
              {STATUS_EMOJI[s]} {STATUS_LABELS[s]}
            </Btn>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div style={{ background: "#f8fafc", borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#374151" }}>סיכום שיחה</div>
        <p style={{ margin: 0, lineHeight: 1.7, fontSize: 14 }}>{call.summary}</p>
      </div>

      {/* Details */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {[
          ["מצב רוח", call.mood],
          ["תזונה", call.foodOk ? "✓ תקין" : "⚠ לבדוק"],
          ["תרופות/רפואי", call.medOk ? "✓ תקין" : "⚠ לבדוק"],
        ].map(([label, val]) => (
          <div key={label} style={{ background: "#f8fafc", borderRadius: 10, padding: 12, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{val}</div>
          </div>
        ))}
      </div>

      {call.painNote && (
        <div style={{ background: "#fef9c3", borderRadius: 10, padding: 12, fontSize: 13 }}>
          ⚠️ הערה: {call.painNote}
        </div>
      )}

      {/* WhatsApp preview */}
      <div style={{ background: "#dcfce7", borderRadius: 12, padding: 16, fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-line", lineHeight: 1.7, direction: "rtl" }}>
        {msg}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="green" onClick={handleSend} disabled={sending || call.whatsappSent}>
          {call.whatsappSent ? "✓ נשלח" : sending ? "פותח וואטסאפ..." : "📲 שלח וואטסאפ"}
        </Btn>
        <Btn variant="ghost" onClick={onClose}>סגור</Btn>
      </div>
    </div>
  );
}

// ─── MANUAL CALL ENTRY ────────────────────────────────────────────────────────
function ManualCallEntry({ elderly, onSave, onClose }) {
  const [form, setForm] = useState({ duration: "", mood: "חיובי", foodOk: true, medOk: true, painNote: "", summary: "", status: "green" });
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const analyze = async () => {
    if (!transcript.trim()) return;
    setLoading(true);
    try {
      const result = await generateSummary(transcript, elderly.name);
      setForm(f => ({ ...f, ...result }));
    } catch (e) {
      alert("שגיאה בניתוח. בדוק API key.");
    } finally {
      setLoading(false);
    }
  };

  const save = () => {
    onSave({
      id: uid(), elderlyId: elderly.id, date: today(),
      calledAt: new Date().toISOString(),
      duration: +form.duration || 0,
      answered: true,
      status: form.status, mood: form.mood,
      foodOk: form.foodOk, medOk: form.medOk,
      painNote: form.painNote, summary: form.summary,
      whatsappSent: false,
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 13, color: "#6b7280" }}>עבור: <strong>{elderly.name}</strong></div>

      <div>
        <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>תמליל שיחה (אופציונלי — לניתוח AI)</label>
        <textarea value={transcript} onChange={e => setTranscript(e.target.value)}
          placeholder="הדבק את תמליל השיחה מ-Vapi..."
          style={{ width: "100%", minHeight: 100, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", direction: "rtl", boxSizing: "border-box" }} />
        <Btn size="sm" onClick={analyze} disabled={loading || !transcript.trim()} style={{ marginTop: 8 }}>
          {loading ? "מנתח..." : "🤖 נתח עם AI"}
        </Btn>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="משך שיחה (דקות)" type="number" value={form.duration} onChange={v => set("duration", v)} />
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>סטטוס</label>
          <select value={form.status} onChange={e => set("status", e.target.value)}
            style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 14, fontFamily: "inherit" }}>
            <option value="green">🟢 תקין</option>
            <option value="yellow">🟡 לבדוק</option>
            <option value="red">🔴 דחוף</option>
          </select>
        </div>
      </div>

      <div>
        <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>סיכום</label>
        <textarea value={form.summary} onChange={e => set("summary", e.target.value)}
          placeholder="תיאור קצר של השיחה..."
          style={{ width: "100%", minHeight: 80, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", direction: "rtl", boxSizing: "border-box" }} />
      </div>

      <Input label="הערת כאב/בעיה (אם יש)" value={form.painNote} onChange={v => set("painNote", v)} />

      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <Btn onClick={save}>💾 שמור שיחה</Btn>
        <Btn variant="ghost" onClick={onClose}>ביטול</Btn>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// VIEWS
// ═══════════════════════════════════════════════════════════════════════════

// ─── ADMIN DASHBOARD ─────────────────────────────────────────────────────────
function AdminDashboard({ elderly, calls, onAddCall, onSendWhatsApp, onStatusChange }) {
  const [selected, setSelected] = useState(null);
  const [addingFor, setAddingFor] = useState(null);

  const todayCalls = calls.filter(c => c.date === today());
  const answeredToday = todayCalls.filter(c => c.answered);
  const redToday = todayCalls.filter(c => c.status === "red");
  const yellowToday = todayCalls.filter(c => c.status === "yellow");

  const getCall = (el) => todayCalls.find(c => c.elderlyId === el.id);

  const selectedCall = calls.find(c => c.id === selected);
  const selectedElderly = selectedCall ? elderly.find(e => e.id === selectedCall.elderlyId) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
        {[
          ["שיחות היום", `${answeredToday.length}/${elderly.filter(e=>e.active).length}`, "#0f172a"],
          ["ממתינים", `${elderly.filter(e=>e.active).length - answeredToday.length}`, "#6b7280"],
          ["🟡 לבדוק", yellowToday.length, "#854d0e"],
          ["🔴 דחוף", redToday.length, "#991b1b"],
        ].map(([label, val, color]) => (
          <Card key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, fontWeight: 900, color, fontFamily: "Georgia, serif" }}>{val}</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{label}</div>
          </Card>
        ))}
      </div>

      {/* Elderly list */}
      <Card>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800 }}>לוח בקרה יומי — {new Date().toLocaleDateString("he-IL", { weekday:"long", day:"numeric", month:"long" })}</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {elderly.filter(e => e.active).map(el => {
            const call = getCall(el);
            return (
              <div key={el.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: 12, background: "#f8fafc", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1 }}>
                  <div style={{ width: 42, height: 42, borderRadius: "50%", background: call ? STATUS_COLORS[call.status] : "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                    {call ? STATUS_EMOJI[call.status] : "⏳"}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{el.name}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>גיל {el.age} · {el.phone} · שיחה ב-{el.callTime}</div>
                    {call && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{call.summary?.slice(0, 60)}...</div>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  {call ? (
                    <>
                      <Btn size="sm" variant="ghost" onClick={() => setSelected(call.id)}>פרטים</Btn>
                      {!call.whatsappSent && (
                        <Btn size="sm" variant="green" onClick={() => setSelected(call.id)}>📲</Btn>
                      )}
                    </>
                  ) : (
                    <Btn size="sm" variant="primary" onClick={() => setAddingFor(el)}>+ הוסף שיחה</Btn>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Red alerts */}
      {redToday.length > 0 && (
        <div style={{ background: "#fee2e2", borderRadius: 16, padding: 20, border: "2px solid #fca5a5" }}>
          <div style={{ fontWeight: 800, color: "#991b1b", marginBottom: 12 }}>🔴 התראות דחופות</div>
          {redToday.map(call => {
            const el = elderly.find(e => e.id === call.elderlyId);
            return (
              <div key={call.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", borderRadius: 10, padding: "10px 14px", marginBottom: 8 }}>
                <div>
                  <strong>{el?.name}</strong>
                  <div style={{ fontSize: 13, color: "#374151" }}>{call.summary?.slice(0, 80)}...</div>
                </div>
                <Btn size="sm" variant="red" onClick={() => setSelected(call.id)}>פעולה נדרשת</Btn>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <Modal open={!!selected && !!selectedCall} onClose={() => setSelected(null)}
        title={`שיחה עם ${selectedElderly?.name}`}>
        {selectedCall && selectedElderly && (
          <CallDetail call={selectedCall} elderly={selectedElderly} onClose={() => setSelected(null)}
            onSendWhatsApp={onSendWhatsApp} onStatusChange={onStatusChange} />
        )}
      </Modal>

      <Modal open={!!addingFor} onClose={() => setAddingFor(null)}
        title={`תיעוד שיחה — ${addingFor?.name}`}>
        {addingFor && (
          <ManualCallEntry elderly={addingFor}
            onSave={(call) => { onAddCall(call); setAddingFor(null); }}
            onClose={() => setAddingFor(null)} />
        )}
      </Modal>
    </div>
  );
}

// ─── ELDERLY MANAGEMENT ───────────────────────────────────────────────────────
function ElderlyManagement({ elderly, onAdd, onEdit, onToggle }) {
  const [modal, setModal] = useState(null); // null | "add" | {elderly obj}

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>ניהול קשישים</h2>
        <Btn onClick={() => setModal("add")}>+ הוסף קשיש/ה</Btn>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {elderly.map(el => (
          <Card key={el.id} style={{ opacity: el.active ? 1 : 0.55 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 18, fontWeight: 800 }}>{el.name}</span>
                  <span style={{ fontSize: 12, color: "#6b7280", background: "#f1f5f9", padding: "2px 8px", borderRadius: 10 }}>גיל {el.age}</span>
                  {!el.active && <span style={{ fontSize: 11, color: "#ef4444", background: "#fee2e2", padding: "2px 8px", borderRadius: 10 }}>לא פעיל</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 20px", fontSize: 13, color: "#374151" }}>
                  <span>📞 {el.phone}</span>
                  <span>⏰ שיחה ב-{el.callTime}</span>
                  <span>👨‍👩‍👧 {el.familyName}</span>
                  <span>📱 {el.familyPhone}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <Btn size="sm" variant="ghost" onClick={() => setModal(el)}>עריכה</Btn>
                <Btn size="sm" variant={el.active ? "ghost" : "primary"} onClick={() => onToggle(el.id)}>
                  {el.active ? "השבת" : "הפעל"}
                </Btn>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)}
        title={modal === "add" ? "הוסף קשיש/ה חדש/ה" : `עריכת ${modal?.name}`}>
        <ElderlyForm initial={modal === "add" ? null : modal}
          onSave={(data) => { modal === "add" ? onAdd(data) : onEdit(data); setModal(null); }}
          onClose={() => setModal(null)} />
      </Modal>
    </div>
  );
}

// ─── CALL HISTORY ─────────────────────────────────────────────────────────────
function CallHistory({ calls, elderly, onSendWhatsApp, onStatusChange }) {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);

  const filtered = calls
    .filter(c => filter === "all" || c.status === filter)
    .sort((a, b) => b.calledAt?.localeCompare(a.calledAt));

  const selectedCall = calls.find(c => c.id === selected);
  const selectedElderly = selectedCall ? elderly.find(e => e.id === selectedCall.elderlyId) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>היסטוריית שיחות</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {[["all","הכל"],["green","תקין"],["yellow","לבדוק"],["red","דחוף"]].map(([v,l]) => (
            <Btn key={v} size="sm" variant={filter === v ? "primary" : "ghost"} onClick={() => setFilter(v)}>{l}</Btn>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.length === 0 && <div style={{ textAlign: "center", color: "#6b7280", padding: 40 }}>אין שיחות להצגה</div>}
        {filtered.map(call => {
          const el = elderly.find(e => e.id === call.elderlyId);
          return (
            <Card key={call.id} style={{ cursor: "pointer", transition: "box-shadow .15s" }}
              onClick={() => setSelected(call.id)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <strong>{el?.name}</strong>
                    <StatusBadge status={call.status} />
                    {call.whatsappSent && <span style={{ fontSize: 11, color: "#22c55e" }}>✓ וואטסאפ נשלח</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{fmtDate(call.calledAt)} · {fmtTime(call.calledAt)} · {call.duration} דק'</div>
                  <div style={{ fontSize: 13, color: "#374151", marginTop: 4 }}>{call.summary?.slice(0, 90)}...</div>
                </div>
                <span style={{ color: "#9ca3af", fontSize: 18 }}>›</span>
              </div>
            </Card>
          );
        })}
      </div>

      <Modal open={!!selected && !!selectedCall} onClose={() => setSelected(null)}
        title={`שיחה עם ${selectedElderly?.name}`}>
        {selectedCall && selectedElderly && (
          <CallDetail call={selectedCall} elderly={selectedElderly} onClose={() => setSelected(null)}
            onSendWhatsApp={onSendWhatsApp} onStatusChange={onStatusChange} />
        )}
      </Modal>
    </div>
  );
}

// ─── FAMILY VIEW ──────────────────────────────────────────────────────────────
function FamilyView({ elderly, calls }) {
  const [selectedId, setSelectedId] = useState(elderly[0]?.id || null);
  const el = elderly.find(e => e.id === selectedId);
  if (!el) return <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>אין קשישים פעילים</div>;

  const elCalls = calls.filter(c => c.elderlyId === el.id).sort((a,b) => b.calledAt?.localeCompare(a.calledAt));
  const todayCall = elCalls.find(c => c.date === today());
  const last7 = elCalls.slice(0, 7);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Person selector */}
      {elderly.length > 1 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {elderly.map(e => (
            <Btn key={e.id} size="sm" variant={selectedId === e.id ? "primary" : "ghost"} onClick={() => setSelectedId(e.id)}>
              {e.name}
            </Btn>
          ))}
        </div>
      )}

      {/* Today's report */}
      <Card style={{ borderRight: `4px solid ${todayCall ? STATUS_COLORS[todayCall.status] : "#e2e8f0"}` }}>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>דיווח היום</div>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
          {el.name} {el.age ? `· גיל ${el.age}` : ""}
        </div>
        {todayCall ? (
          <>
            <StatusBadge status={todayCall.status} size="lg" />
            <p style={{ marginTop: 16, lineHeight: 1.8, fontSize: 15 }}>{todayCall.summary}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: 12 }}>
              {[["מצב רוח", todayCall.mood], ["תזונה", todayCall.foodOk ? "✓ תקין" : "⚠ לבדוק"], ["בריאות", todayCall.medOk ? "✓ תקין" : "⚠ לבדוק"]].map(([l,v]) => (
                <div key={l} style={{ textAlign: "center", background: "#f8fafc", borderRadius: 10, padding: 10 }}>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>{l}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>
            {todayCall.painNote && (
              <div style={{ background: "#fef9c3", borderRadius: 10, padding: 12, marginTop: 12, fontSize: 13 }}>
                ⚠️ {todayCall.painNote}
              </div>
            )}
          </>
        ) : (
          <div style={{ color: "#6b7280", fontSize: 14, marginTop: 8 }}>השיחה היומית טרם התקיימה</div>
        )}
      </Card>

      {/* Last 7 days */}
      <Card>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>7 ימים אחרונים</div>
        <div style={{ display: "flex", gap: 8 }}>
          {Array.from({ length: 7 }).map((_, i) => {
            const d = new Date(); d.setDate(d.getDate() - i);
            const ds = d.toISOString().slice(0, 10);
            const call = elCalls.find(c => c.date === ds);
            const color = call ? STATUS_COLORS[call.status] : "#e2e8f0";
            return (
              <div key={ds} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ width: "100%", aspectRatio: "1", borderRadius: 10, background: color, marginBottom: 4 }} />
                <div style={{ fontSize: 10, color: "#6b7280" }}>
                  {d.toLocaleDateString("he-IL", { weekday: "short" })}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 12, color: "#6b7280" }}>
          {[["🟢","תקין"],["🟡","לבדוק"],["🔴","דחוף"],["⬜","ללא שיחה"]].map(([e,l]) => (
            <span key={l}>{e} {l}</span>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Vapi API helpers ─────────────────────────────────────────────────────────
async function fetchVapiCalls(apiKey, assistantId) {
  const params = new URLSearchParams({ assistantId, limit: "20" });
  const res = await fetch(`https://api.vapi.ai/call?${params}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) throw new Error(`Vapi error ${res.status}`);
  return res.json(); // array of call objects
}

async function fetchVapiCallDetail(apiKey, callId) {
  const res = await fetch(`https://api.vapi.ai/call/${callId}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) throw new Error(`Vapi error ${res.status}`);
  return res.json();
}

// ─── VAPI SYNC PANEL ──────────────────────────────────────────────────────────
function VapiSyncPanel({ vapiKey, assistantId, elderly, existingCallIds, onImport }) {
  const [vapiCalls, setVapiCalls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(null); // callId being analyzed
  const [error, setError] = useState("");
  const [lastSync, setLastSync] = useState(null);

  const fetchCalls = async () => {
    if (!vapiKey || !assistantId) { setError("הכנס API Key ו-Assistant ID תחילה"); return; }
    setLoading(true); setError("");
    try {
      const data = await fetchVapiCalls(vapiKey, assistantId);
      setVapiCalls(Array.isArray(data) ? data : data.calls || []);
      setLastSync(new Date().toLocaleTimeString("he-IL"));
    } catch(e) { setError("שגיאה בחיבור ל-Vapi: " + e.message); }
    finally { setLoading(false); }
  };

  const importCall = async (vapiCall) => {
    setAnalyzing(vapiCall.id);
    try {
      // Match by phone number to find elderly
      const phone = vapiCall.customer?.number?.replace(/[^0-9]/g,"") || "";
      const matched = elderly.find(e => e.phone.replace(/[^0-9]/g,"").endsWith(phone.slice(-8)));

      const transcript = vapiCall.transcript || vapiCall.messages?.map(m=>`${m.role}: ${m.content}`).join("\n") || "";
      const duration = vapiCall.duration ? +(vapiCall.duration/60).toFixed(1) : 0;

      let analysis = { summary: "שיחה יובאה מ-Vapi.", status: "green", mood: "ניטרלי", foodOk: true, medOk: true, painNote: "" };
      if (transcript.length > 20) {
        analysis = await generateSummary(transcript, matched?.name || "קשיש");
      }

      onImport({
        id: "vapi_" + vapiCall.id,
        elderlyId: matched?.id || null,
        date: vapiCall.endedAt?.slice(0,10) || today(),
        calledAt: vapiCall.endedAt || new Date().toISOString(),
        duration,
        answered: vapiCall.status === "ended",
        vapiCallId: vapiCall.id,
        transcript,
        whatsappSent: false,
        ...analysis,
      });
    } catch(e) { setError("שגיאה בייבוא: " + e.message); }
    finally { setAnalyzing(null); }
  };

  const isImported = (id) => existingCallIds.includes("vapi_" + id);

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>📡 שיחות מ-Vapi</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {lastSync && <span style={{ fontSize: 12, color: "#6b7280" }}>עודכן: {lastSync}</span>}
          <Btn size="sm" onClick={fetchCalls} disabled={loading}>{loading ? "טוען..." : "🔄 רענן"}</Btn>
        </div>
      </div>

      {error && <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {vapiCalls.length === 0 && !loading && (
        <div style={{ textAlign: "center", color: "#6b7280", padding: "24px 0", fontSize: 14 }}>
          לחץ "רענן" כדי לטעון שיחות מ-Vapi
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {vapiCalls.map(vc => {
          const imported = isImported(vc.id);
          const dur = vc.duration ? +(vc.duration/60).toFixed(1) : "?";
          const phone = vc.customer?.number || "לא ידוע";
          const matched = elderly.find(e => e.phone.replace(/[^0-9]/g,"").endsWith((vc.customer?.number||"").replace(/[^0-9]/g,"").slice(-8)));
          const isAnalyzing = analyzing === vc.id;

          return (
            <div key={vc.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, background: imported ? "#f0fdf4" : "#f8fafc", border: `1px solid ${imported ? "#bbf7d0" : "#e2e8f0"}` }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {matched ? matched.name : phone}
                  {!matched && <span style={{ fontSize: 11, color: "#ef4444", marginRight: 6 }}>לא משויך</span>}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {vc.endedAt ? fmtDate(vc.endedAt) + " · " + fmtTime(vc.endedAt) : "—"} · {dur} דק' · {vc.status}
                </div>
              </div>
              {imported
                ? <span style={{ fontSize:12, color: "#22c55e", fontWeight: 600 }}>✓ יובא</span>
                : <Btn size="sm" variant="primary" disabled={isAnalyzing} onClick={() => importCall(vc)}>
                    {isAnalyzing ? "מנתח..." : "⬇ ייבא + AI"}
                  </Btn>
              }
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── SETTINGS / VAPI ─────────────────────────────────────────────────────────
function Settings({ vapiKey, assistantId, onSaveVapi, elderly, callIds, onImport }) {
  const [key, setKey] = useState(vapiKey || "");
  const [aId, setAId] = useState(assistantId || "");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>הגדרות</h2>

      <Card>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>🔑 חיבור Vapi</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input label="Vapi API Key" value={key} onChange={setKey} placeholder="vapi_..." />
          <Input label="Assistant ID" value={aId} onChange={setAId} placeholder="מה-Vapi Dashboard → Assistant" />
          <div style={{ background: "#eff6ff", borderRadius: 10, padding: 14, fontSize: 13, lineHeight: 1.9, color: "#1e40af" }}>
            <strong>איך מוצאים את ה-Assistant ID:</strong><br />
            Vapi Dashboard → Assistants → לוחצים על ה-Agent שלך → בURL יש את ה-ID, למשל:<br />
            <code style={{ background: "#dbeafe", padding: "2px 6px", borderRadius: 4 }}>app.vapi.ai/assistant/<strong>abc-123-xyz</strong></code>
          </div>
          <Btn onClick={() => onSaveVapi(key, aId)}>שמור הגדרות</Btn>
        </div>
      </Card>

      {vapiKey && assistantId && (
        <VapiSyncPanel vapiKey={vapiKey} assistantId={assistantId} elderly={elderly} existingCallIds={callIds} onImport={onImport} />
      )}

      <Card>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>💰 עלויות משוערות</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 14 }}>
          {[
            ["Vapi (שיחה של 5 דק')", "$0.50-0.75"],
            ["Claude API (סיכום)", "$0.01-0.02"],
            ["WhatsApp (דרך wa.me)", "חינם בפיילוט"],
            ["סה\"כ לשיחה", "~$0.60"],
            ["7 קשישים × 14 יום", "~$60"],
          ].map(([l, v]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ color: "#374151" }}>{l}</span>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════════════════

const VIEWS = [
  { id: "dashboard", label: "לוח בקרה", icon: "📊" },
  { id: "elderly",   label: "קשישים",   icon: "👴" },
  { id: "history",   label: "שיחות",    icon: "📋" },
  { id: "family",    label: "דשבורד משפחה", icon: "👨‍👩‍👧" },
  { id: "settings",  label: "הגדרות",   icon: "⚙️" },
];

export default function App() {
  const [view, setView] = useState("dashboard");
  const [elderly, setElderly] = useState(SAMPLE_ELDERLY);
  const [calls, setCalls] = useState(SAMPLE_CALLS);
  const [vapiKey, setVapiKey] = useState("");
  const [assistantId, setAssistantId] = useState("");
  const [loaded, setLoaded] = useState(false);

  // Load from storage on mount
  useEffect(() => {
    (async () => {
      const e = await store.get("elderly");
      const c = await store.get("calls");
      const v = await store.get("vapiKey");
      const a = await store.get("assistantId");
      if (e) setElderly(e);
      if (c) setCalls(c);
      if (v) setVapiKey(v);
      if (a) setAssistantId(a);
      setLoaded(true);
    })();
  }, []);

  // Persist on change
  useEffect(() => { if (loaded) store.set("elderly", elderly); }, [elderly, loaded]);
  useEffect(() => { if (loaded) store.set("calls", calls); }, [calls, loaded]);

  const addElderly   = (el) => setElderly(prev => [...prev, el]);
  const editElderly  = (el) => setElderly(prev => prev.map(e => e.id === el.id ? el : e));
  const toggleActive = (id) => setElderly(prev => prev.map(e => e.id === id ? { ...e, active: !e.active } : e));
  const addCall      = (call) => setCalls(prev => prev.find(c => c.id === call.id) ? prev : [call, ...prev]);
  const sendWA       = (id) => setCalls(prev => prev.map(c => c.id === id ? { ...c, whatsappSent: true } : c));
  const changeStatus = (id, status) => setCalls(prev => prev.map(c => c.id === id ? { ...c, status } : c));
  const saveVapi     = async (key, aId) => {
    setVapiKey(key); setAssistantId(aId);
    await store.set("vapiKey", key);
    await store.set("assistantId", aId);
    alert("הגדרות נשמרו ✓ כעת עבור ל-Vapi Sync לייבוא שיחות");
  };

  const redCount = calls.filter(c => c.date === today() && c.status === "red").length;

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Heebo', 'Assistant', 'Rubik', sans-serif", direction: "rtl" }}>

      {/* Top nav */}
      <div style={{ background: "#0f172a", color: "#fff", padding: "0 24px", display: "flex", alignItems: "center", gap: 0, height: 60, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ fontWeight: 900, fontSize: 18, marginLeft: 32, letterSpacing: -0.5 }}>🤝 AllyEye</div>
        <div style={{ display: "flex", flex: 1, gap: 4 }}>
          {VIEWS.map(v => (
            <button key={v.id} onClick={() => setView(v.id)}
              style={{ background: view === v.id ? "rgba(255,255,255,.15)" : "transparent", color: "#fff", border: "none", cursor: "pointer", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontFamily: "inherit", fontWeight: view === v.id ? 700 : 400, display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
              {v.icon} {v.label}
              {v.id === "dashboard" && redCount > 0 && (
                <span style={{ background: "#ef4444", color: "#fff", borderRadius: "50%", width: 18, height: 18, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", position: "absolute", top: 4, right: 4 }}>{redCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 16px" }}>
        {view === "dashboard" && <AdminDashboard elderly={elderly} calls={calls} onAddCall={addCall} onSendWhatsApp={sendWA} onStatusChange={changeStatus} />}
        {view === "elderly"   && <ElderlyManagement elderly={elderly} onAdd={addElderly} onEdit={editElderly} onToggle={toggleActive} />}
        {view === "history"   && <CallHistory calls={calls} elderly={elderly} onSendWhatsApp={sendWA} onStatusChange={changeStatus} />}
        {view === "family"    && <FamilyView elderly={elderly.filter(e=>e.active)} calls={calls} />}
        {view === "settings"  && <Settings vapiKey={vapiKey} assistantId={assistantId} onSaveVapi={saveVapi} elderly={elderly} callIds={calls.map(c=>c.id)} onImport={addCall} />}
      </div>
    </div>
  );
}
