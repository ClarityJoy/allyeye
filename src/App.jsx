import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10);
const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "—";
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "long" }) : "—";
const uid = () => Math.random().toString(36).slice(2, 9);

const STATUS_COLORS = { green: "#22c55e", yellow: "#eab308", red: "#ef4444", none: "#6b7280" };
const STATUS_LABELS = { green: "תקין", yellow: "לבדוק", red: "דחוף", none: "ממתין" };
const STATUS_EMOJI  = { green: "🟢", yellow: "🟡", red: "🔴", none: "⏳" };

async function fetchVapiCalls(apiKey, assistantId) {
  const params = new URLSearchParams({ assistantId, limit: "20" });
  const res = await fetch(`https://api.vapi.ai/call?${params}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) throw new Error(`Vapi ${res.status}`);
  return res.json();
}

async function triggerVapiCall(apiKey, assistantId, phoneNumber, customerName) {
  const res = await fetch("https://api.vapi.ai/call/phone", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ assistantId, customer: { number: phoneNumber, name: customerName } })
  });
  if (!res.ok) throw new Error(`Vapi call failed: ${res.status}`);
  return res.json();
}

async function generateSummary(transcript, elderlyName) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514", max_tokens: 1000,
      system: `אתה מערכת שמנתחת שיחות בוקר עם קשישים. החזר JSON בלבד ללא markdown עם: summary (string), status ("green"|"yellow"|"red"), mood ("חיובי"|"ניטרלי"|"שלילי"), foodOk (boolean), medOk (boolean), painNote (string)`,
      messages: [{ role: "user", content: `שם: ${elderlyName}\n\nתמליל:\n${transcript}\n\nהחזר JSON.` }]
    })
  });
  const data = await res.json();
  const text = data.content?.find(b => b.type === "text")?.text || "{}";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

function buildWhatsApp(call, elderly) {
  return [`🌅 דיווח בוקר – ${elderly.name} 👴`, `${STATUS_EMOJI[call.status]} ${STATUS_LABELS[call.status]}`, ``, `📋 ${call.summary}`, ``, `⏱ ${call.duration} דק' | 📅 ${fmtDate(call.called_at)} ${fmtTime(call.called_at)}`, `– AllyEye`].join("\n");
}

// ─── UI ────────────────────────────────────────────────────────────────────
const Card = ({ children, style = {} }) => (
  <div style={{ background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,.08)", ...style }}>{children}</div>
);

const Btn = ({ children, onClick, variant = "primary", size = "md", disabled = false, style = {} }) => {
  const base = { border: "none", borderRadius: 10, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "all .15s", opacity: disabled ? .5 : 1 };
  const vs = {
    primary: { background: "#0f172a", color: "#fff", padding: size==="sm"?"6px 14px":"10px 22px", fontSize: size==="sm"?13:14 },
    ghost:   { background: "transparent", color: "#0f172a", padding: size==="sm"?"6px 14px":"10px 22px", fontSize: size==="sm"?13:14, border: "1.5px solid #e2e8f0" },
    green:   { background: "#22c55e", color: "#fff", padding: size==="sm"?"6px 14px":"10px 22px", fontSize: size==="sm"?13:14 },
    red:     { background: "#ef4444", color: "#fff", padding: size==="sm"?"6px 14px":"10px 22px", fontSize: size==="sm"?13:14 },
    yellow:  { background: "#eab308", color: "#fff", padding: size==="sm"?"6px 14px":"10px 22px", fontSize: size==="sm"?13:14 },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...vs[variant], ...style }}>{children}</button>;
};

const Input = ({ label, value, onChange, type = "text", placeholder = "" }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    {label && <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{label}</label>}
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", outline: "none", direction: "rtl" }} />
  </div>
);

const StatusBadge = ({ status, size = "sm" }) => {
  const bg   = { green: "#dcfce7", yellow: "#fef9c3", red: "#fee2e2", none: "#f3f4f6" };
  const text = { green: "#166534", yellow: "#854d0e", red: "#991b1b", none: "#374151" };
  return (
    <span style={{ background: bg[status], color: text[status], padding: size==="lg"?"8px 16px":"3px 10px", borderRadius: 20, fontSize: size==="lg"?14:12, fontWeight: 700 }}>
      {STATUS_EMOJI[status]} {STATUS_LABELS[status]}
    </span>
  );
};

const Modal = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:"#fff", borderRadius:20, padding:32, width:"min(540px,94vw)", maxHeight:"90vh", overflow:"auto", direction:"rtl" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
          <h2 style={{ margin:0, fontSize:20, fontWeight:800 }}>{title}</h2>
          <button onClick={onClose} style={{ border:"none", background:"none", fontSize:22, cursor:"pointer", color:"#6b7280" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!email || !password) { setError("נא למלא אימייל וסיסמה"); return; }
    setLoading(true); setError("");
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError("אימייל או סיסמה שגויים"); setLoading(false); return; }
    onLogin(data.user);
  };

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Heebo', sans-serif", direction:"rtl" }}>
      <div style={{ background:"#fff", borderRadius:24, padding:48, width:"min(420px,92vw)", boxShadow:"0 20px 60px rgba(0,0,0,.3)" }}>
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ fontSize:52, marginBottom:12 }}>🤝</div>
          <h1 style={{ fontSize:30, fontWeight:900, color:"#0f172a", margin:"0 0 6px" }}>AllyEye</h1>
          <p style={{ color:"#6b7280", fontSize:14, margin:0 }}>רשת ביטחון משפחתית לגיל השלישי</p>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <Input label="אימייל" type="email" value={email} onChange={setEmail} placeholder="your@email.com" />
          <Input label="סיסמה" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
          {error && <div style={{ background:"#fee2e2", color:"#991b1b", borderRadius:8, padding:"10px 14px", fontSize:13 }}>{error}</div>}
          <Btn onClick={handleLogin} disabled={loading} style={{ width:"100%", marginTop:8, padding:"14px" }}>
            {loading ? "מתחבר..." : "כניסה"}
          </Btn>
        </div>
        <p style={{ textAlign:"center", fontSize:12, color:"#9ca3af", marginTop:24 }}>אין לך חשבון? פנה למנהל המערכת</p>
      </div>
    </div>
  );
}

// ─── CALL REPORT ──────────────────────────────────────────────────────────────
function CallReport({ call, elderly, onClose, onSendWhatsApp, onStatusChange, canEdit }) {
  const [sending, setSending] = useState(false);
  const msg = buildWhatsApp(call, elderly);
  const phone = (elderly.family_phone||"").replace(/[^0-9]/g,"").replace(/^0/,"972");
  const waLink = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontSize:13, color:"#6b7280" }}>{fmtDate(call.called_at)} | {fmtTime(call.called_at)} | {call.duration} דק'</div>
        <StatusBadge status={call.status} size="lg" />
      </div>
      {canEdit && (
        <div>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>עדכן סטטוס</div>
          <div style={{ display:"flex", gap:8 }}>
            {["green","yellow","red"].map(s => (
              <Btn key={s} size="sm" variant={call.status===s?s:"ghost"} onClick={() => onStatusChange(call.id,s)}>
                {STATUS_EMOJI[s]} {STATUS_LABELS[s]}
              </Btn>
            ))}
          </div>
        </div>
      )}
      <div style={{ background:"#f8fafc", borderRadius:12, padding:16 }}>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>סיכום שיחה</div>
        <p style={{ margin:0, lineHeight:1.8, fontSize:14 }}>{call.summary || "אין סיכום"}</p>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
        {[["מצב רוח",call.mood||"—"],["תזונה",call.food_ok?"✓ תקין":"⚠ לבדוק"],["בריאות",call.med_ok?"✓ תקין":"⚠ לבדוק"]].map(([l,v]) => (
          <div key={l} style={{ textAlign:"center", background:"#f8fafc", borderRadius:10, padding:10 }}>
            <div style={{ fontSize:11, color:"#6b7280" }}>{l}</div>
            <div style={{ fontWeight:700, fontSize:13, marginTop:2 }}>{v}</div>
          </div>
        ))}
      </div>
      {call.pain_note && <div style={{ background:"#fef9c3", borderRadius:10, padding:12, fontSize:13 }}>⚠️ {call.pain_note}</div>}
      {call.transcript && (
        <details>
          <summary style={{ fontSize:13, fontWeight:600, cursor:"pointer", padding:"6px 0" }}>📝 תמליל מלא</summary>
          <div style={{ background:"#f8fafc", borderRadius:10, padding:12, fontSize:12, lineHeight:1.8, whiteSpace:"pre-wrap", marginTop:8, maxHeight:180, overflow:"auto" }}>{call.transcript}</div>
        </details>
      )}
      <div style={{ background:"#dcfce7", borderRadius:12, padding:16, fontSize:13, whiteSpace:"pre-line", lineHeight:1.8 }}>{msg}</div>
      <div style={{ display:"flex", gap:10 }}>
        <Btn variant="green" disabled={call.whatsapp_sent||sending}
          onClick={async()=>{ setSending(true); window.open(waLink,"_blank"); await new Promise(r=>setTimeout(r,800)); onSendWhatsApp(call.id); setSending(false); }}>
          {call.whatsapp_sent?"✓ נשלח":"📲 שלח וואטסאפ"}
        </Btn>
        <Btn variant="ghost" onClick={onClose}>סגור</Btn>
      </div>
    </div>
  );
}

// ─── MANUAL CALL ENTRY ────────────────────────────────────────────────────────
function ManualCallEntry({ elderly, onSave, onClose }) {
  const [transcript, setTranscript] = useState("");
  const [form, setForm] = useState({ duration:"", status:"green", mood:"חיובי", food_ok:true, med_ok:true, pain_note:"", summary:"" });
  const [loading, setLoading] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const analyze = async () => {
    if (!transcript.trim()) return;
    setLoading(true);
    try {
      const r = await generateSummary(transcript, elderly.name);
      setForm(f=>({...f, status:r.status||"green", mood:r.mood||"ניטרלי", food_ok:r.foodOk??true, med_ok:r.medOk??true, pain_note:r.painNote||"", summary:r.summary||""}));
    } catch { alert("שגיאה בניתוח AI"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ fontSize:13, color:"#6b7280" }}>עבור: <strong>{elderly.name}</strong></div>
      <div>
        <label style={{ fontSize:13, fontWeight:600, display:"block", marginBottom:6 }}>תמליל (לניתוח AI)</label>
        <textarea value={transcript} onChange={e=>setTranscript(e.target.value)} placeholder="הדבק תמליל מ-Vapi..."
          style={{ width:"100%", minHeight:90, border:"1.5px solid #e2e8f0", borderRadius:8, padding:10, fontSize:13, fontFamily:"inherit", direction:"rtl", boxSizing:"border-box" }} />
        <Btn size="sm" onClick={analyze} disabled={loading||!transcript.trim()} style={{ marginTop:8 }}>
          {loading?"מנתח...":"🤖 נתח עם AI"}
        </Btn>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Input label="משך (דקות)" type="number" value={form.duration} onChange={v=>set("duration",v)} />
        <div>
          <label style={{ fontSize:13, fontWeight:600, display:"block", marginBottom:6 }}>סטטוס</label>
          <select value={form.status} onChange={e=>set("status",e.target.value)}
            style={{ width:"100%", border:"1.5px solid #e2e8f0", borderRadius:8, padding:"9px 12px", fontSize:14, fontFamily:"inherit" }}>
            <option value="green">🟢 תקין</option><option value="yellow">🟡 לבדוק</option><option value="red">🔴 דחוף</option>
          </select>
        </div>
      </div>
      <div>
        <label style={{ fontSize:13, fontWeight:600, display:"block", marginBottom:6 }}>סיכום</label>
        <textarea value={form.summary} onChange={e=>set("summary",e.target.value)}
          style={{ width:"100%", minHeight:70, border:"1.5px solid #e2e8f0", borderRadius:8, padding:10, fontSize:13, fontFamily:"inherit", direction:"rtl", boxSizing:"border-box" }} />
      </div>
      <Input label="הערת כאב/בעיה" value={form.pain_note} onChange={v=>set("pain_note",v)} />
      <div style={{ display:"flex", gap:10 }}>
        <Btn onClick={()=>onSave({id:uid(), elderly_id:elderly.id, date:today(), called_at:new Date().toISOString(), duration:+form.duration||0, answered:true, whatsapp_sent:false, transcript, ...form})}>שמור</Btn>
        <Btn variant="ghost" onClick={onClose}>ביטול</Btn>
      </div>
    </div>
  );
}

// ─── ELDERLY FORM ─────────────────────────────────────────────────────────────
function ElderlyForm({ initial, users, vapiKey, assistantId, onSave, onClose }) {
  const empty = { name:"", age:"", phone:"", call_time:"08:30", family_user_id:"", family_name:"", family_phone:"", active:true };
  const [form, setForm] = useState(initial ? {...initial, age:initial.age||""} : empty);
  const [calling, setCalling] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const testCall = async () => {
    if (!form.phone) { alert("הכנס מספר טלפון"); return; }
    setCalling(true);
    try { await triggerVapiCall(vapiKey, assistantId, form.phone, form.name); alert(`✅ שיחה יצאה ל-${form.name}`); }
    catch(e) { alert("שגיאה: "+e.message); }
    finally { setCalling(false); }
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Input label="שם הקשיש/ה *" value={form.name} onChange={v=>set("name",v)} />
        <Input label="גיל" type="number" value={form.age} onChange={v=>set("age",v)} />
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Input label="טלפון *" value={form.phone} onChange={v=>set("phone",v)} placeholder="+9725XXXXXXXX" />
        <Input label="שעת שיחה יומית" type="time" value={form.call_time} onChange={v=>set("call_time",v)} />
      </div>
      <div style={{ background:"#eff6ff", borderRadius:8, padding:10, fontSize:12, color:"#1e40af" }}>
        💡 פורמט: <strong>+972501234567</strong> (ללא אפס ראשון)
      </div>
      {vapiKey && assistantId && (
        <Btn variant="ghost" size="sm" onClick={testCall} disabled={calling}>{calling?"מתקשר...":"📞 בדוק שיחה עכשיו"}</Btn>
      )}
      <div style={{ height:1, background:"#f1f5f9" }} />
      <div style={{ fontSize:13, fontWeight:700 }}>פרטי בן/בת המשפחה</div>
      <div>
        <label style={{ fontSize:13, fontWeight:600, display:"block", marginBottom:6 }}>משתמש משפחה</label>
        <select value={form.family_user_id} onChange={e=>set("family_user_id",e.target.value)}
          style={{ width:"100%", border:"1.5px solid #e2e8f0", borderRadius:8, padding:"9px 12px", fontSize:14, fontFamily:"inherit" }}>
          <option value="">— בחר משתמש —</option>
          {users.filter(u=>u.role==="family").map(u=><option key={u.id} value={u.id}>{u.email}</option>)}
        </select>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Input label="שם בן/בת המשפחה" value={form.family_name} onChange={v=>set("family_name",v)} />
        <Input label="טלפון בן/בת המשפחה" value={form.family_phone} onChange={v=>set("family_phone",v)} />
      </div>
      <div style={{ display:"flex", gap:10, marginTop:4 }}>
        <Btn onClick={()=>onSave({...form, age:+form.age||null})}>שמור</Btn>
        <Btn variant="ghost" onClick={onClose}>ביטול</Btn>
      </div>
    </div>
  );
}

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────
function AdminDashboard({ elderly, calls, users, vapiKey, assistantId, onRefresh }) {
  const [selectedCall, setSelectedCall] = useState(null);
  const [addingFor, setAddingFor] = useState(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [callingNow, setCallingNow] = useState(null);

  const todayCalls = calls.filter(c=>c.date===today());
  const redToday = todayCalls.filter(c=>c.status==="red");
  const getCall = (el) => todayCalls.find(c=>c.elderly_id===el.id);
  const selCall = calls.find(c=>c.id===selectedCall);
  const selElderly = selCall ? elderly.find(e=>e.id===selCall.elderly_id) : null;

  const syncVapi = async () => {
    if (!vapiKey||!assistantId) { alert("הגדר Vapi Key בהגדרות"); return; }
    setSyncLoading(true);
    try {
      const data = await fetchVapiCalls(vapiKey, assistantId);
      const vapiCalls = Array.isArray(data)?data:data.calls||[];
      let imported = 0;
      for (const vc of vapiCalls) {
        const callId = "vapi_"+vc.id;
        if (calls.find(c=>c.id===callId)) continue;
        const phone = (vc.customer?.number||"").replace(/[^0-9]/g,"");
        const matched = elderly.find(e=>e.phone.replace(/[^0-9]/g,"").endsWith(phone.slice(-8)));
        if (!matched) continue;
        const transcript = vc.transcript||"";
        const duration = vc.duration?+(vc.duration/60).toFixed(1):0;
        let analysis = { summary:"שיחה יובאה מ-Vapi.", status:"green", mood:"ניטרלי", food_ok:true, med_ok:true, pain_note:"" };
        if (transcript.length>20) {
          try { const r=await generateSummary(transcript,matched.name); analysis={summary:r.summary,status:r.status,mood:r.mood,food_ok:r.foodOk??true,med_ok:r.medOk??true,pain_note:r.painNote||""}; } catch {}
        }
        const {error} = await supabase.from("calls").insert({id:callId,elderly_id:matched.id,date:vc.endedAt?.slice(0,10)||today(),called_at:vc.endedAt||new Date().toISOString(),duration,answered:true,whatsapp_sent:false,transcript,vapi_call_id:vc.id,...analysis});
        if (!error) imported++;
      }
      alert(`✅ יובאו ${imported} שיחות חדשות`);
      onRefresh();
    } catch(e) { alert("שגיאה: "+e.message); }
    finally { setSyncLoading(false); }
  };

  const callNow = async (el) => {
    if (!vapiKey||!assistantId) { alert("הגדר Vapi Key בהגדרות"); return; }
    setCallingNow(el.id);
    try { await triggerVapiCall(vapiKey,assistantId,el.phone,el.name); alert(`📞 שיחה יצאה ל-${el.name}!`); }
    catch(e) { alert("שגיאה: "+e.message); }
    finally { setCallingNow(null); }
  };

  const saveCall = async (call) => { await supabase.from("calls").insert(call); setAddingFor(null); onRefresh(); };
  const updateStatus = async (id,status) => { await supabase.from("calls").update({status}).eq("id",id); onRefresh(); };
  const markWaSent = async (id) => { await supabase.from("calls").update({whatsapp_sent:true}).eq("id",id); onRefresh(); };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:22 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
        {[["שיחות היום",`${todayCalls.filter(c=>c.answered).length}/${elderly.filter(e=>e.active).length}`,"#0f172a"],
          ["ממתינים",elderly.filter(e=>e.active).length-todayCalls.length,"#6b7280"],
          ["🟡 לבדוק",todayCalls.filter(c=>c.status==="yellow").length,"#854d0e"],
          ["🔴 דחוף",redToday.length,"#991b1b"]].map(([l,v,c])=>(
          <Card key={l} style={{ textAlign:"center", padding:16 }}>
            <div style={{ fontSize:28, fontWeight:900, color:c }}>{v}</div>
            <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>{l}</div>
          </Card>
        ))}
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <Btn onClick={syncVapi} disabled={syncLoading} variant="ghost">{syncLoading?"מסנכרן...":"🔄 סנכרן מ-Vapi"}</Btn>
      </div>

      {redToday.length>0 && (
        <div style={{ background:"#fee2e2", borderRadius:16, padding:20, border:"2px solid #fca5a5" }}>
          <div style={{ fontWeight:800, color:"#991b1b", marginBottom:12 }}>🔴 התראות דחופות</div>
          {redToday.map(call=>{
            const el=elderly.find(e=>e.id===call.elderly_id);
            return (
              <div key={call.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:"#fff", borderRadius:10, padding:"10px 14px", marginBottom:8 }}>
                <div><strong>{el?.name}</strong><div style={{ fontSize:13 }}>{call.summary?.slice(0,70)}...</div></div>
                <Btn size="sm" variant="red" onClick={()=>setSelectedCall(call.id)}>פעולה</Btn>
              </div>
            );
          })}
        </div>
      )}

      <Card>
        <h3 style={{ margin:"0 0 14px", fontSize:16, fontWeight:800 }}>
          לוח בקרה — {new Date().toLocaleDateString("he-IL",{weekday:"long",day:"numeric",month:"long"})}
        </h3>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {elderly.filter(e=>e.active).map(el=>{
            const call=getCall(el); const isCalling=callingNow===el.id;
            return (
              <div key={el.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", borderRadius:12, background:"#f8fafc", gap:10 }}>
                <div style={{ display:"flex", alignItems:"center", gap:12, flex:1, minWidth:0 }}>
                  <div style={{ width:40, height:40, borderRadius:"50%", background:call?STATUS_COLORS[call.status]:"#e2e8f0", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
                    {call?STATUS_EMOJI[call.status]:"⏳"}
                  </div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontWeight:700 }}>{el.name}</div>
                    <div style={{ fontSize:12, color:"#6b7280" }}>גיל {el.age} · {el.phone} · ⏰ {el.call_time}</div>
                    {call&&<div style={{ fontSize:12, color:"#374151", marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{call.summary?.slice(0,55)}...</div>}
                  </div>
                </div>
                <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                  <Btn size="sm" variant="ghost" disabled={isCalling} onClick={()=>callNow(el)}>{isCalling?"...":"📞"}</Btn>
                  {call?<Btn size="sm" variant="ghost" onClick={()=>setSelectedCall(call.id)}>דוח</Btn>
                       :<Btn size="sm" onClick={()=>setAddingFor(el)}>+ שיחה</Btn>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Modal open={!!selectedCall&&!!selCall} onClose={()=>setSelectedCall(null)} title={`דוח — ${selElderly?.name}`}>
        {selCall&&selElderly&&<CallReport call={selCall} elderly={selElderly} onClose={()=>setSelectedCall(null)} onSendWhatsApp={markWaSent} onStatusChange={updateStatus} canEdit={true} />}
      </Modal>
      <Modal open={!!addingFor} onClose={()=>setAddingFor(null)} title={`שיחה ידנית — ${addingFor?.name}`}>
        {addingFor&&<ManualCallEntry elderly={addingFor} onSave={saveCall} onClose={()=>setAddingFor(null)} />}
      </Modal>
    </div>
  );
}

// ─── ELDERLY MANAGEMENT ───────────────────────────────────────────────────────
function ElderlyManagement({ elderly, users, vapiKey, assistantId, onRefresh }) {
  const [modal, setModal] = useState(null);

  const save = async (data) => {
    if (modal==="add") { await supabase.from("elderly").insert({...data,id:undefined}); }
    else { await supabase.from("elderly").update(data).eq("id",data.id); }
    setModal(null); onRefresh();
  };
  const toggle = async (el) => { await supabase.from("elderly").update({active:!el.active}).eq("id",el.id); onRefresh(); };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <h2 style={{ margin:0, fontSize:20, fontWeight:800 }}>ניהול קשישים</h2>
        <Btn onClick={()=>setModal("add")}>+ הוסף קשיש/ה</Btn>
      </div>
      {elderly.map(el=>(
        <Card key={el.id} style={{ opacity:el.active?1:.55 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                <span style={{ fontSize:16, fontWeight:800 }}>{el.name}</span>
                <span style={{ fontSize:12, color:"#6b7280", background:"#f1f5f9", padding:"2px 8px", borderRadius:10 }}>גיל {el.age}</span>
                {!el.active&&<span style={{ fontSize:11, color:"#ef4444", background:"#fee2e2", padding:"2px 8px", borderRadius:10 }}>לא פעיל</span>}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"4px 20px", fontSize:13, color:"#374151" }}>
                <span>📞 {el.phone}</span><span>⏰ {el.call_time}</span>
                <span>👨‍👩‍👧 {el.family_name||"—"}</span><span>📱 {el.family_phone||"—"}</span>
              </div>
              {el.family_user_id&&<div style={{ fontSize:12, color:"#6b7280", marginTop:4 }}>👤 {users.find(u=>u.id===el.family_user_id)?.email}</div>}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <Btn size="sm" variant="ghost" onClick={()=>setModal(el)}>עריכה</Btn>
              <Btn size="sm" variant={el.active?"ghost":"primary"} onClick={()=>toggle(el)}>{el.active?"השבת":"הפעל"}</Btn>
            </div>
          </div>
        </Card>
      ))}
      <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==="add"?"הוסף קשיש/ה":`עריכת ${modal?.name}`}>
        <ElderlyForm initial={modal==="add"?null:modal} users={users} vapiKey={vapiKey} assistantId={assistantId} onSave={save} onClose={()=>setModal(null)} />
      </Modal>
    </div>
  );
}

// ─── CALL HISTORY ─────────────────────────────────────────────────────────────
function CallHistory({ calls, elderly, isAdmin, onRefresh }) {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const filtered = calls.filter(c=>filter==="all"||c.status===filter).sort((a,b)=>(b.called_at||"").localeCompare(a.called_at||""));
  const selCall = calls.find(c=>c.id===selected);
  const selElderly = selCall?elderly.find(e=>e.id===selCall.elderly_id):null;
  const updateStatus = async (id,status) => { await supabase.from("calls").update({status}).eq("id",id); onRefresh(); };
  const markWaSent = async (id) => { await supabase.from("calls").update({whatsapp_sent:true}).eq("id",id); onRefresh(); };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
        <h2 style={{ margin:0, fontSize:20, fontWeight:800 }}>דוחות שיחות</h2>
        <div style={{ display:"flex", gap:8 }}>
          {[["all","הכל"],["green","תקין"],["yellow","לבדוק"],["red","דחוף"]].map(([v,l])=>(
            <Btn key={v} size="sm" variant={filter===v?"primary":"ghost"} onClick={()=>setFilter(v)}>{l}</Btn>
          ))}
        </div>
      </div>
      {filtered.length===0&&<div style={{ textAlign:"center", color:"#6b7280", padding:48 }}>אין שיחות להצגה</div>}
      {filtered.map(call=>{
        const el=elderly.find(e=>e.id===call.elderly_id);
        return (
          <Card key={call.id} style={{ cursor:"pointer" }} onClick={()=>setSelected(call.id)}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
                  <strong>{el?.name||"—"}</strong>
                  <StatusBadge status={call.status} />
                  {call.whatsapp_sent&&<span style={{ fontSize:11, color:"#22c55e" }}>✓ וואטסאפ</span>}
                </div>
                <div style={{ fontSize:12, color:"#6b7280" }}>{fmtDate(call.called_at)} · {fmtTime(call.called_at)} · {call.duration} דק'</div>
                <div style={{ fontSize:13, color:"#374151", marginTop:4, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{call.summary?.slice(0,85)||"אין סיכום"}</div>
              </div>
              <span style={{ color:"#9ca3af", fontSize:20, flexShrink:0 }}>›</span>
            </div>
          </Card>
        );
      })}
      <Modal open={!!selected&&!!selCall} onClose={()=>setSelected(null)} title={`דוח — ${selElderly?.name}`}>
        {selCall&&selElderly&&<CallReport call={selCall} elderly={selElderly} onClose={()=>setSelected(null)} onSendWhatsApp={markWaSent} onStatusChange={isAdmin?updateStatus:()=>{}} canEdit={isAdmin} />}
      </Modal>
    </div>
  );
}

// ─── FAMILY DASHBOARD ─────────────────────────────────────────────────────────
function FamilyDashboard({ elderly, calls, onRefresh }) {
  const [selectedId, setSelectedId] = useState(elderly[0]?.id||null);
  const [selected, setSelected] = useState(null);
  const el = elderly.find(e=>e.id===selectedId);
  if (!el) return (
    <div style={{ textAlign:"center", padding:60, color:"#6b7280" }}>
      <div style={{ fontSize:48, marginBottom:16 }}>👴</div>
      <div style={{ fontSize:16 }}>אין קשישים משויכים לחשבון שלך</div>
      <div style={{ fontSize:13, marginTop:8 }}>פנה למנהל המערכת</div>
    </div>
  );
  const elCalls = calls.filter(c=>c.elderly_id===el.id).sort((a,b)=>(b.called_at||"").localeCompare(a.called_at||""));
  const todayCall = elCalls.find(c=>c.date===today());
  const selCall = calls.find(c=>c.id===selected);
  const markWaSent = async (id) => { await supabase.from("calls").update({whatsapp_sent:true}).eq("id",id); onRefresh(); };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      {elderly.length>1&&(
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {elderly.map(e=><Btn key={e.id} size="sm" variant={selectedId===e.id?"primary":"ghost"} onClick={()=>setSelectedId(e.id)}>{e.name}</Btn>)}
        </div>
      )}
      <Card style={{ borderRight:`5px solid ${todayCall?STATUS_COLORS[todayCall.status]:"#e2e8f0"}` }}>
        <div style={{ fontSize:13, color:"#6b7280", marginBottom:4 }}>דיווח היום</div>
        <div style={{ fontSize:22, fontWeight:900, marginBottom:12 }}>{el.name}</div>
        {todayCall?(
          <>
            <StatusBadge status={todayCall.status} size="lg" />
            <p style={{ marginTop:14, lineHeight:1.8, fontSize:15 }}>{todayCall.summary}</p>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginTop:12 }}>
              {[["מצב רוח",todayCall.mood||"—"],["תזונה",todayCall.food_ok?"✓ תקין":"⚠ לבדוק"],["בריאות",todayCall.med_ok?"✓ תקין":"⚠ לבדוק"]].map(([l,v])=>(
                <div key={l} style={{ textAlign:"center", background:"#f8fafc", borderRadius:10, padding:10 }}>
                  <div style={{ fontSize:11, color:"#6b7280" }}>{l}</div>
                  <div style={{ fontWeight:700, fontSize:13, marginTop:2 }}>{v}</div>
                </div>
              ))}
            </div>
            {todayCall.pain_note&&<div style={{ background:"#fef9c3", borderRadius:10, padding:12, marginTop:12, fontSize:13 }}>⚠️ {todayCall.pain_note}</div>}
            <Btn size="sm" variant="ghost" style={{ marginTop:12 }} onClick={()=>setSelected(todayCall.id)}>דוח מלא</Btn>
          </>
        ):(
          <div style={{ color:"#6b7280", fontSize:14, marginTop:8 }}>השיחה היומית טרם התקיימה · מתוכנן ל-{el.call_time}</div>
        )}
      </Card>
      <Card>
        <div style={{ fontSize:15, fontWeight:700, marginBottom:12 }}>7 ימים אחרונים</div>
        <div style={{ display:"flex", gap:8 }}>
          {Array.from({length:7}).map((_,i)=>{
            const d=new Date(); d.setDate(d.getDate()-i);
            const ds=d.toISOString().slice(0,10);
            const c=elCalls.find(c=>c.date===ds);
            return (
              <div key={ds} style={{ flex:1, textAlign:"center", cursor:c?"pointer":"default" }} onClick={()=>c&&setSelected(c.id)}>
                <div style={{ width:"100%", aspectRatio:"1", borderRadius:10, background:c?STATUS_COLORS[c.status]:"#e2e8f0", marginBottom:4 }} />
                <div style={{ fontSize:10, color:"#6b7280" }}>{d.toLocaleDateString("he-IL",{weekday:"short"})}</div>
              </div>
            );
          })}
        </div>
      </Card>
      <Card>
        <div style={{ fontSize:15, fontWeight:700, marginBottom:12 }}>שיחות אחרונות</div>
        {elCalls.slice(0,8).map(call=>(
          <div key={call.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #f1f5f9", cursor:"pointer" }} onClick={()=>setSelected(call.id)}>
            <div>
              <div style={{ fontSize:13, fontWeight:600 }}>{fmtDate(call.called_at)}</div>
              <div style={{ fontSize:12, color:"#6b7280" }}>{call.summary?.slice(0,50)||"—"}</div>
            </div>
            <StatusBadge status={call.status} />
          </div>
        ))}
      </Card>
      <Modal open={!!selected&&!!selCall} onClose={()=>setSelected(null)} title="דוח שיחה">
        {selCall&&el&&<CallReport call={selCall} elderly={el} onClose={()=>setSelected(null)} onSendWhatsApp={markWaSent} onStatusChange={()=>{}} canEdit={false} />}
      </Modal>
    </div>
  );
}

// ─── USERS MANAGEMENT ─────────────────────────────────────────────────────────
function UsersManagement({ users, onRefresh }) {
  const setRole = async (id,role) => { await supabase.from("profiles").update({role}).eq("id",id); onRefresh(); };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
      <h2 style={{ margin:0, fontSize:20, fontWeight:800 }}>ניהול משתמשים</h2>
      <Card>
        <div style={{ fontSize:13, color:"#374151", background:"#f8fafc", borderRadius:10, padding:14, lineHeight:1.8 }}>
          💡 <strong>להוסיף משתמש:</strong><br/>
          Supabase Dashboard → Authentication → Users → Invite User<br/>
          אחרי שהמשתמש נרשם — שנה את התפקיד שלו כאן.
        </div>
      </Card>
      <Card>
        <div style={{ fontSize:15, fontWeight:700, marginBottom:14 }}>משתמשים ({users.length})</div>
        {users.map(u=>(
          <div key={u.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #f1f5f9" }}>
            <div>
              <div style={{ fontWeight:600, fontSize:14 }}>{u.email}</div>
              <div style={{ fontSize:12, color:"#6b7280" }}>{u.role==="admin"?"מנהל מערכת":"בן/בת משפחה"}</div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <Btn size="sm" variant={u.role==="admin"?"primary":"ghost"} onClick={()=>setRole(u.id,"admin")}>אדמין</Btn>
              <Btn size="sm" variant={u.role==="family"?"primary":"ghost"} onClick={()=>setRole(u.id,"family")}>משפחה</Btn>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
function SettingsView({ vapiKey, assistantId, onSave }) {
  const [key, setKey] = useState(vapiKey||"");
  const [aId, setAId] = useState(assistantId||"");
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
      <h2 style={{ margin:0, fontSize:20, fontWeight:800 }}>הגדרות</h2>
      <Card>
        <div style={{ fontSize:15, fontWeight:700, marginBottom:14 }}>🔑 חיבור Vapi</div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Input label="Vapi Private API Key" value={key} onChange={setKey} placeholder="vapi_..." />
          <Input label="Assistant ID" value={aId} onChange={setAId} placeholder="מה-URL ב-Vapi Dashboard" />
          <div style={{ background:"#eff6ff", borderRadius:10, padding:12, fontSize:13, color:"#1e40af" }}>
            <strong>Assistant ID:</strong> app.vapi.ai/assistant/<strong>הID-כאן</strong>
          </div>
          <Btn onClick={()=>onSave(key,aId)}>שמור הגדרות</Btn>
        </div>
      </Card>
      <Card>
        <div style={{ fontSize:15, fontWeight:700, marginBottom:12 }}>💰 עלויות משוערות</div>
        {[["Vapi (5 דק')","$0.50-0.75"],["Claude API","$0.01-0.02"],["WhatsApp","חינם"],["סה\"כ לשיחה","~$0.60"],["7 קשישים × 14 יום","~$60"]].map(([l,v])=>(
          <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #f1f5f9", fontSize:14 }}>
            <span style={{ color:"#374151" }}>{l}</span><strong>{v}</strong>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [elderly, setElderly] = useState([]);
  const [calls, setCalls] = useState([]);
  const [users, setUsers] = useState([]);
  const [vapiKey, setVapiKey] = useState(()=>localStorage.getItem("allyeye_vapiKey")||"");
  const [assistantId, setAssistantId] = useState(()=>localStorage.getItem("allyeye_assistantId")||"");
  const [view, setView] = useState("dashboard");
  const [authLoading, setAuthLoading] = useState(true);

  const isAdmin = profile?.role==="admin";

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{ setUser(session?.user??null); setAuthLoading(false); });
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_e,session)=>{ setUser(session?.user??null); });
    return ()=>subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    if (!user) { setProfile(null); return; }
    supabase.from("profiles").select("*").eq("id",user.id).single().then(({data})=>setProfile(data));
  },[user]);

  const loadData = useCallback(async()=>{
    if (!profile) return;
    if (profile.role==="admin") {
      const [e,c,u] = await Promise.all([
        supabase.from("elderly").select("*").order("name"),
        supabase.from("calls").select("*").order("called_at",{ascending:false}).limit(200),
        supabase.from("profiles").select("*").order("email"),
      ]);
      setElderly(e.data||[]); setCalls(c.data||[]); setUsers(u.data||[]);
    } else {
      const {data:myElderly}=await supabase.from("elderly").select("*").eq("family_user_id",user.id);
      const ids=(myElderly||[]).map(e=>e.id);
      setElderly(myElderly||[]);
      if (ids.length>0) {
        const {data:myCalls}=await supabase.from("calls").select("*").in("elderly_id",ids).order("called_at",{ascending:false}).limit(100);
        setCalls(myCalls||[]);
      }
    }
  },[profile,user]);

  useEffect(()=>{ loadData(); },[loadData]);

  const saveVapi = (key,aId) => {
    setVapiKey(key); setAssistantId(aId);
    localStorage.setItem("allyeye_vapiKey",key);
    localStorage.setItem("allyeye_assistantId",aId);
    alert("הגדרות נשמרו ✓");
  };

  const logout = async()=>{ await supabase.auth.signOut(); setView("dashboard"); };

  if (authLoading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#f8fafc", fontFamily:"Heebo,sans-serif" }}>
      <div style={{ textAlign:"center", color:"#6b7280" }}>
        <div style={{ fontSize:48, marginBottom:12 }}>🤝</div><div>טוען...</div>
      </div>
    </div>
  );

  if (!user) return <LoginScreen onLogin={setUser} />;
  if (!profile) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Heebo,sans-serif", color:"#6b7280" }}>
      <div>טוען פרופיל...</div>
    </div>
  );

  const redCount = calls.filter(c=>c.date===today()&&c.status==="red").length;
  const ADMIN_VIEWS = [{id:"dashboard",label:"לוח בקרה",icon:"📊"},{id:"elderly",label:"קשישים",icon:"👴"},{id:"reports",label:"דוחות",icon:"📋"},{id:"users",label:"משתמשים",icon:"👥"},{id:"settings",label:"הגדרות",icon:"⚙️"}];
  const FAMILY_VIEWS = [{id:"dashboard",label:"הדשבורד שלי",icon:"🏠"},{id:"reports",label:"דוחות",icon:"📋"}];
  const VIEWS = isAdmin?ADMIN_VIEWS:FAMILY_VIEWS;

  return (
    <div style={{ minHeight:"100vh", background:"#f8fafc", fontFamily:"'Heebo','Assistant',sans-serif", direction:"rtl" }}>
      <div style={{ background:"#0f172a", color:"#fff", padding:"0 16px", display:"flex", alignItems:"center", height:56, position:"sticky", top:0, zIndex:100, gap:6 }}>
        <div style={{ fontWeight:900, fontSize:16, marginLeft:20, flexShrink:0 }}>🤝 AllyEye</div>
        <div style={{ display:"flex", flex:1, gap:2, overflowX:"auto" }}>
          {VIEWS.map(v=>(
            <button key={v.id} onClick={()=>setView(v.id)}
              style={{ background:view===v.id?"rgba(255,255,255,.15)":"transparent", color:"#fff", border:"none", cursor:"pointer", padding:"7px 11px", borderRadius:8, fontSize:13, fontFamily:"inherit", fontWeight:view===v.id?700:400, display:"flex", alignItems:"center", gap:4, flexShrink:0, position:"relative" }}>
              {v.icon} {v.label}
              {v.id==="dashboard"&&redCount>0&&(
                <span style={{ background:"#ef4444", color:"#fff", borderRadius:"50%", width:16, height:16, fontSize:10, display:"flex", alignItems:"center", justifyContent:"center", position:"absolute", top:2, right:2 }}>{redCount}</span>
              )}
            </button>
          ))}
        </div>
        <button onClick={logout} style={{ background:"rgba(255,255,255,.1)", color:"#fff", border:"none", cursor:"pointer", padding:"6px 12px", borderRadius:8, fontSize:12, fontFamily:"inherit", flexShrink:0 }}>יציאה</button>
      </div>
      <div style={{ maxWidth:920, margin:"0 auto", padding:"22px 12px" }}>
        {isAdmin?(
          <>
            {view==="dashboard"&&<AdminDashboard elderly={elderly} calls={calls} users={users} vapiKey={vapiKey} assistantId={assistantId} onRefresh={loadData} />}
            {view==="elderly"&&<ElderlyManagement elderly={elderly} users={users} vapiKey={vapiKey} assistantId={assistantId} onRefresh={loadData} />}
            {view==="reports"&&<CallHistory calls={calls} elderly={elderly} isAdmin={true} onRefresh={loadData} />}
            {view==="users"&&<UsersManagement users={users} onRefresh={loadData} />}
            {view==="settings"&&<SettingsView vapiKey={vapiKey} assistantId={assistantId} onSave={saveVapi} />}
          </>
        ):(
          <>
            {view==="dashboard"&&<FamilyDashboard elderly={elderly} calls={calls} onRefresh={loadData} />}
            {view==="reports"&&<CallHistory calls={calls} elderly={elderly} isAdmin={false} onRefresh={loadData} />}
          </>
        )}
      </div>
    </div>
  );
}
