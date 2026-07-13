import { useState, useEffect, useRef } from "react";

interface Props {
  onBack: () => void;
  notify: (msg: string, type?: "success" | "error") => void;
}

type CallPhase = "pre" | "active" | "post" | "history";

interface PastCall {
  id: number;
  patient: string;
  date: string;
  duration: string;
  type: string;
  status: "completed" | "missed" | "cancelled" | "in-progress" | "scheduled";
  diagnosis: string;
}

interface RoomData {
  room_id: string;
  join_url: string;
  patient_join_url: string;
  doctor_join_url: string;
}

const MOCK_PATIENTS = [
  { id: "P-1001", name: "Aarav Sharma", mrn: "MRN-78234", allergies: ["Penicillin", "Sulfa"], meds: ["Metformin 500mg", "Lisinopril 10mg"], vitals: { bp: "128/82", hr: "74 bpm", temp: "98.4F", spo2: "97%" } },
  { id: "P-1002", name: "Priya Patel", mrn: "MRN-45891", allergies: ["Aspirin"], meds: ["Levothyroxine 50mcg"], vitals: { bp: "118/76", hr: "68 bpm", temp: "98.6F", spo2: "99%" } },
  { id: "P-1003", name: "Rahul Gupta", mrn: "MRN-33120", allergies: [], meds: ["Atorvastatin 20mg", "Amlodipine 5mg", "Metoprolol 25mg"], vitals: { bp: "142/90", hr: "82 bpm", temp: "98.2F", spo2: "96%" } },
];

const MOCK_HISTORY: PastCall[] = [
  { id: 1, patient: "Aarav Sharma", date: "2026-07-07 10:30", duration: "18:42", type: "Follow-up", status: "completed", diagnosis: "Type 2 Diabetes - stable" },
  { id: 2, patient: "Priya Patel", date: "2026-07-06 14:00", duration: "12:15", type: "Consultation", status: "completed", diagnosis: "Hypothyroidism review" },
  { id: 3, patient: "Rahul Gupta", date: "2026-07-05 09:15", duration: "—", type: "Urgent", status: "missed", diagnosis: "—" },
  { id: 4, patient: "Aarav Sharma", date: "2026-07-03 11:00", duration: "25:03", type: "Consultation", status: "completed", diagnosis: "HbA1c review, medication adjustment" },
  { id: 5, patient: "Priya Patel", date: "2026-07-08 16:00", duration: "—", type: "Follow-up", status: "scheduled", diagnosis: "—" },
];

const MOCK_FILES = [
  { name: "Blood_Report_Jul2026.pdf", size: "245 KB", date: "Jul 5" },
  { name: "ECG_Scan.png", size: "1.2 MB", date: "Jul 3" },
];

const fmtTime = (s: number): string => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

const fmtDate = (d: string) => {
  const dt = new Date(d);
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) + " " +
    dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
};

const statusColor = (s: string) =>
  s === "completed" ? "#10b981" :
  s === "missed" ? "var(--danger, #ef4444)" :
  s === "cancelled" ? "var(--text-muted, #888)" :
  s === "scheduled" ? "#4f6ef7" : "#f59e0b";

/* ─── SVG Icons (inline) ──────────────────────────── */

const IconVideo = ({ off }: { off?: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {off ? (
      <>
        <path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
      </>
    ) : (
      <>
        <polygon points="23 7 16 12 23 17 23 7"/>
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
      </>
    )}
  </svg>
);

const IconEndCall = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91"/>
    <line x1="23" y1="1" x2="1" y2="23"/>
  </svg>
);

const IconUser = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);

const IconFile = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
  </svg>
);

const IconClock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

const IconAlert = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
);

const IconExternalLink = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);

const IconShield = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

const IconSend = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);

const IconCopy = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
  </svg>
);

/* ─── Spinner ─────────────────────────────────────── */
const Spinner = () => (
  <span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
);

export function Telemedicine({ onBack, notify }: Props) {
  const [phase, setPhase] = useState<CallPhase>("pre");

  /* ── Pre-call state ── */
  const [selectedPatient, setSelectedPatient] = useState("");
  const [appointmentType, setAppointmentType] = useState<"follow-up" | "consultation" | "urgent">("consultation");
  const [preNotes, setPreNotes] = useState("");
  const [callLoading, setCallLoading] = useState(false);

  /* ── Active call state ── */
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [callNotes, setCallNotes] = useState("");
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Post-call state ── */
  const [postForm, setPostForm] = useState({ diagnosis: "", followUp: "", prescriptions: "", nextAppt: "" });

  const patient = MOCK_PATIENTS.find(p => p.id === selectedPatient);

  /* Timer */
  useEffect(() => {
    if (phase === "active") {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  /* ── Create Jitsi room via backend, fall back to direct Jitsi ── */
  const startCall = async () => {
    if (!selectedPatient) return notify("Select a patient first", "error");
    const patientName = patient?.name ?? "Patient";
    setCallLoading(true);
    try {
      const params = new URLSearchParams({
        patient_name: patientName,
        doctor_name: "Doctor",
      });
      const res = await fetch(`/api/telemedicine/room?${params.toString()}`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: RoomData = await res.json();
      setRoomData(data);
      setElapsed(0);
      setPhase("active");
      notify("Secure video room created");
    } catch {
      /* Fallback: build a deterministic room name without the backend */
      const safeName = patientName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const roomId = `clinic-${safeName}-${Date.now().toString(36)}`;
      const joinUrl = `https://meet.jit.si/${roomId}`;
      setRoomData({ room_id: roomId, join_url: joinUrl, patient_join_url: joinUrl, doctor_join_url: joinUrl });
      setElapsed(0);
      setPhase("active");
      notify("Room ready (direct Jitsi — backend unreachable)");
    } finally {
      setCallLoading(false);
    }
  };

  const endCall = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase("post");
    notify("Call ended — " + fmtTime(elapsed));
  };

  const submitSummary = () => {
    if (!postForm.diagnosis.trim()) return notify("Diagnosis is required", "error");
    notify("Consultation summary saved", "success");
    setPhase("history");
  };

  const copyRoomLink = () => {
    if (!roomData) return;
    navigator.clipboard.writeText(roomData.patient_join_url).then(() => {
      setCopied(true);
      notify("Patient link copied");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const openInTab = () => {
    if (roomData?.join_url) window.open(roomData.join_url, "_blank", "noopener,noreferrer");
  };

  const resetPreCall = () => {
    setPhase("pre");
    setSelectedPatient("");
    setPreNotes("");
    setRoomData(null);
    setPostForm({ diagnosis: "", followUp: "", prescriptions: "", nextAppt: "" });
  };

  /* ─────────────────────── PRE-CALL ─────────────────────── */
  if (phase === "pre") {
    return (
      <div className="page-enter">
        <div className="breadcrumb">
          <button onClick={onBack}>Home</button>
          <span className="sep">/</span>
          <button onClick={() => setPhase("history")}>Telemedicine</button>
          <span className="sep">/</span>
          <span>New Consultation</span>
        </div>

        <div className="section-header">
          <div>
            <h1>Start Video Consultation</h1>
            <div className="subtitle">Set up the call parameters before connecting</div>
          </div>
          <button className="neu-btn ghost" onClick={() => setPhase("history")}>
            <IconClock /> Call History
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 900 }}>
          <div className="neu" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Call Setup</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Patient</label>
                <select className="neu-input" value={selectedPatient} onChange={e => setSelectedPatient(e.target.value)} style={{ width: "100%" }}>
                  <option value="">Select patient...</option>
                  {MOCK_PATIENTS.map(p => <option key={p.id} value={p.id}>{p.name} ({p.mrn})</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Appointment Type</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["follow-up", "consultation", "urgent"] as const).map(t => (
                    <button
                      key={t}
                      className={`neu-btn${appointmentType === t ? " primary" : " ghost"}`}
                      onClick={() => setAppointmentType(t)}
                      style={{ flex: 1, fontSize: 12, textTransform: "capitalize" }}
                    >
                      {t === "urgent" && <IconAlert />} {t.replace("-", " ")}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Pre-call Notes</label>
                <textarea
                  className="neu-input"
                  placeholder="Reason for consultation, symptoms to discuss..."
                  rows={4}
                  value={preNotes}
                  onChange={e => setPreNotes(e.target.value)}
                  style={{ width: "100%", resize: "vertical", minHeight: 80 }}
                />
              </div>

              {/* Info banner */}
              <div style={{
                padding: "10px 14px", borderRadius: 10,
                background: "rgba(79,110,247,0.08)", border: "1px solid rgba(79,110,247,0.2)",
                display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "var(--text-muted)",
              }}>
                <IconShield />
                <span>Calls are end-to-end encrypted via <strong style={{ color: "inherit" }}>Jitsi Meet</strong>. No account or plugin required — runs directly in the browser.</span>
              </div>

              <button
                className="neu-btn primary"
                onClick={startCall}
                disabled={callLoading}
                style={{ marginTop: 8, padding: "12px 24px", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                {callLoading ? <Spinner /> : <IconVideo off={false} />}
                {callLoading ? "Creating secure room…" : "Start Secure Video Call"}
              </button>
            </div>
          </div>

          {patient ? (
            <div className="neu" style={{ padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Patient Preview</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, #4f6ef7, #a78bfa)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 16 }}>
                  {patient.name.split(" ").map(n => n[0]).join("")}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{patient.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{patient.mrn}</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Allergies</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {patient.allergies.length > 0 ? patient.allergies.map(a => (
                      <span key={a} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 8, background: "rgba(239,68,68,0.1)", color: "#ef4444", fontWeight: 600 }}>{a}</span>
                    )) : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>None known</span>}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Current Medications</div>
                  {patient.meds.map(m => <div key={m} style={{ fontSize: 12, marginBottom: 2 }}>{m}</div>)}
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Last Vitals</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {Object.entries(patient.vitals).map(([k, v]) => (
                      <div key={k} style={{ fontSize: 12 }}><span style={{ fontWeight: 600, textTransform: "uppercase", fontSize: 10, color: "var(--text-muted)" }}>{k}: </span>{v}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="neu" style={{ padding: 24, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
              <div style={{ textAlign: "center" }}>
                <IconUser />
                <div style={{ marginTop: 8 }}>Select a patient to see their details</div>
              </div>
            </div>
          )}
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  /* ─────────────────────── ACTIVE CALL ─────────────────────── */
  if (phase === "active" && roomData) {
    return (
      <div className="page-enter" style={{ display: "flex", gap: 16, height: "calc(100vh - 120px)", minHeight: 560 }}>

        {/* Main video column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>

          {/* Status bar */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 16px", borderRadius: 12,
            background: "var(--bg-alt, #f8f8f8)", border: "1px solid var(--border, #e5e5e5)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", animation: "pulse 1.5s infinite" }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Live — {patient?.name ?? "Patient"}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{fmtTime(elapsed)}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {roomData.room_id}
              </span>
              <button
                className="neu-btn ghost"
                onClick={copyRoomLink}
                style={{ padding: "4px 10px", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}
                title="Copy patient link"
              >
                <IconCopy /> {copied ? "Copied!" : "Share with patient"}
              </button>
              <button
                className="neu-btn ghost"
                onClick={openInTab}
                style={{ padding: "4px 10px", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}
                title="Open in new tab"
              >
                <IconExternalLink /> New tab
              </button>
            </div>
          </div>

          {/* Jitsi iframe */}
          <div style={{ flex: 1, borderRadius: 16, overflow: "hidden", border: "1px solid var(--border, #e5e5e5)", minHeight: 340, position: "relative" }}>
            <iframe
              src={roomData.join_url}
              style={{ width: "100%", height: "100%", border: "none", display: "block", minHeight: 340 }}
              allow="camera; microphone; fullscreen; display-capture; autoplay"
              title="Jitsi Meet video call"
            />
          </div>

          {/* End call controls */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "8px 0" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Camera, mic and screen-share controls are inside the video window above.
            </div>
            <button
              className="neu-btn"
              onClick={endCall}
              style={{
                padding: "10px 28px", borderRadius: 24, fontSize: 13, fontWeight: 700,
                background: "#ef4444", color: "#fff", border: "none",
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <IconEndCall /> End Session
            </button>
          </div>
        </div>

        {/* Side panel */}
        <div style={{ width: 300, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", flexShrink: 0 }}>

          {/* Call notes toggle */}
          <div className="neu" style={{ padding: 16, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: notesOpen ? 10 : 0 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700 }}>Call Notes</h4>
              <button className={`neu-btn${notesOpen ? " primary" : " ghost"}`} onClick={() => setNotesOpen(!notesOpen)} style={{ padding: "3px 10px", fontSize: 11 }}>
                {notesOpen ? "Collapse" : "Open"}
              </button>
            </div>
            {notesOpen && (
              <>
                <textarea
                  className="neu-input"
                  placeholder="Type notes during the call..."
                  rows={5}
                  value={callNotes}
                  onChange={e => setCallNotes(e.target.value)}
                  style={{ width: "100%", resize: "vertical", fontSize: 12 }}
                />
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>Notes will auto-fill the summary form</div>
              </>
            )}
          </div>

          {/* Patient quick-view */}
          {patient && (
            <div className="neu" style={{ padding: 16, flexShrink: 0 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Patient Info</h4>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #4f6ef7, #a78bfa)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13 }}>
                  {patient.name.split(" ").map(n => n[0]).join("")}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{patient.name}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{patient.mrn}</div>
                </div>
              </div>

              {patient.allergies.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Allergies</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {patient.allergies.map(a => (
                      <span key={a} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 6, background: "rgba(239,68,68,0.1)", color: "#ef4444", fontWeight: 600 }}>{a}</span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Medications</div>
                {patient.meds.map(m => <div key={m} style={{ fontSize: 11, marginBottom: 1 }}>{m}</div>)}
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Vitals</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  {Object.entries(patient.vitals).map(([k, v]) => (
                    <div key={k} style={{ fontSize: 11 }}>
                      <span style={{ fontWeight: 600, textTransform: "uppercase", fontSize: 9, color: "var(--text-muted)" }}>{k}: </span>{v}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Shared files */}
          <div className="neu" style={{ padding: 16 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Shared Files</h4>
            {MOCK_FILES.map(f => (
              <div key={f.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border, #eee)" }}>
                <IconFile />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{f.name}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{f.size} - {f.date}</div>
                </div>
              </div>
            ))}
            <button className="neu-btn ghost" style={{ marginTop: 8, fontSize: 11, width: "100%" }}>
              <IconPlus /> Share File
            </button>
          </div>
        </div>

        <style>{`
          @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
          @keyframes spin  { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  /* ─────────────────────── POST-CALL ─────────────────────── */
  if (phase === "post") {
    return (
      <div className="page-enter">
        <div className="breadcrumb">
          <button onClick={onBack}>Home</button>
          <span className="sep">/</span>
          <span>Telemedicine</span>
          <span className="sep">/</span>
          <span>Consultation Summary</span>
        </div>

        <div className="section-header">
          <div>
            <h1>Consultation Summary</h1>
            <div className="subtitle">
              {patient?.name ?? "Patient"} — {appointmentType.replace("-", " ")} — Duration: {fmtTime(elapsed)}
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 700 }}>
          <div className="neu" style={{ padding: 24 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {callNotes.trim() && (
                <div style={{
                  padding: "10px 14px", borderRadius: 10,
                  background: "rgba(79,110,247,0.06)", border: "1px solid rgba(79,110,247,0.15)",
                  fontSize: 12, color: "var(--text-muted)",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Call notes (for reference)</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{callNotes}</div>
                </div>
              )}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Diagnosis / Assessment *</label>
                <textarea
                  className="neu-input"
                  placeholder="Primary diagnosis and clinical assessment..."
                  rows={3}
                  value={postForm.diagnosis}
                  onChange={e => setPostForm({ ...postForm, diagnosis: e.target.value })}
                  style={{ width: "100%", resize: "vertical" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Follow-up Instructions</label>
                <textarea
                  className="neu-input"
                  placeholder="Patient instructions, lifestyle changes, warning signs..."
                  rows={2}
                  value={postForm.followUp}
                  onChange={e => setPostForm({ ...postForm, followUp: e.target.value })}
                  style={{ width: "100%", resize: "vertical" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Prescriptions Written</label>
                <textarea
                  className="neu-input"
                  placeholder="Medications prescribed during this consultation..."
                  rows={2}
                  value={postForm.prescriptions}
                  onChange={e => setPostForm({ ...postForm, prescriptions: e.target.value })}
                  style={{ width: "100%", resize: "vertical" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Next Appointment</label>
                <input
                  className="neu-input"
                  type="date"
                  value={postForm.nextAppt}
                  onChange={e => setPostForm({ ...postForm, nextAppt: e.target.value })}
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
                <button className="neu-btn ghost" onClick={() => setPhase("history")}>Skip</button>
                <button className="neu-btn primary" onClick={submitSummary}>
                  <IconSend /> Save Summary
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ─────────────────────── HISTORY ─────────────────────── */
  return (
    <div className="page-enter">
      <div className="breadcrumb">
        <button onClick={onBack}>Home</button>
        <span className="sep">/</span>
        <span>Telemedicine</span>
      </div>

      <div className="section-header">
        <div>
          <h1>Telemedicine</h1>
          <div className="subtitle">Video consultations and call history</div>
        </div>
        <button className="neu-btn primary" onClick={resetPreCall}>
          <IconVideo off={false} /> New Consultation
        </button>
      </div>

      <div className="vitals-table-wrap">
        <table className="vitals-table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Date</th>
              <th>Type</th>
              <th>Duration</th>
              <th>Status</th>
              <th>Diagnosis</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_HISTORY.map(h => (
              <tr key={h.id}>
                <td style={{ fontWeight: 600 }}>{h.patient}</td>
                <td>{fmtDate(h.date)}</td>
                <td>
                  <span style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 8, fontWeight: 600,
                    background: h.type === "Urgent" ? "rgba(239,68,68,0.1)" : h.type === "Follow-up" ? "rgba(79,110,247,0.1)" : "rgba(16,185,129,0.1)",
                    color: h.type === "Urgent" ? "#ef4444" : h.type === "Follow-up" ? "#4f6ef7" : "#10b981",
                  }}>
                    {h.type}
                  </span>
                </td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{h.duration}</td>
                <td>
                  <span style={{ fontSize: 11, fontWeight: 600, color: statusColor(h.status), textTransform: "capitalize" }}>
                    {h.status}
                  </span>
                </td>
                <td style={{ color: h.diagnosis === "—" ? "var(--text-muted)" : "inherit", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {h.diagnosis}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
