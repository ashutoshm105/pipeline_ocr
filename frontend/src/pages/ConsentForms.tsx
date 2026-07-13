import { useState, useEffect, useCallback } from "react";
import * as api from "../api";

interface Props {
  onBack: () => void;
  notify: (msg: string, type?: "success" | "error") => void;
}

const TEMPLATES = [
  { id: "general", name: "General Consent", desc: "Standard medical treatment consent", fields: ["patient_name", "date", "signature"] },
  { id: "surgery", name: "Surgical Consent", desc: "Pre-operative informed consent", fields: ["patient_name", "procedure", "risks", "alternatives", "date", "signature"] },
  { id: "anesthesia", name: "Anesthesia Consent", desc: "Consent for anesthesia administration", fields: ["patient_name", "anesthesia_type", "risks", "date", "signature"] },
  { id: "hipaa", name: "HIPAA Authorization", desc: "Release of protected health information", fields: ["patient_name", "recipient", "purpose", "info_type", "expiry", "date", "signature"] },
  { id: "telehealth", name: "Telehealth Consent", desc: "Consent for telemedicine consultation", fields: ["patient_name", "platform", "limitations", "date", "signature"] },
  { id: "research", name: "Research Consent", desc: "Participation in clinical research", fields: ["patient_name", "study_name", "principal_investigator", "duration", "risks", "date", "signature"] },
  { id: "blood", name: "Blood Transfusion", desc: "Consent for blood product transfusion", fields: ["patient_name", "blood_type", "risks", "date", "signature"] },
  { id: "imaging", name: "Imaging Consent", desc: "Consent for radiological procedures", fields: ["patient_name", "procedure_type", "contrast", "date", "signature"] },
];

const FIELD_LABELS: Record<string, string> = {
  patient_name: "Patient Full Name", date: "Date", signature: "Digital Signature",
  procedure: "Procedure Name", risks: "Known Risks", alternatives: "Alternative Treatments",
  anesthesia_type: "Type of Anesthesia", recipient: "Information Recipient",
  purpose: "Purpose of Disclosure", info_type: "Type of Information", expiry: "Authorization Expiry",
  platform: "Telehealth Platform", limitations: "Known Limitations",
  study_name: "Study Name", principal_investigator: "Principal Investigator", duration: "Study Duration",
  blood_type: "Blood Product Type", procedure_type: "Imaging Procedure", contrast: "Contrast Agent (if any)",
};

export function ConsentForms({ onBack, notify }: Props) {
  const [patientId, setPatientId] = useState("");
  const [selected, setSelected] = useState<typeof TEMPLATES[0] | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [signed, setSigned] = useState<any[]>([]);
  const [tab, setTab] = useState<"create" | "signed">("create");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadConsents = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      setSigned(await api.listConsents(patientId));
    } catch (e: any) {
      notify(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [patientId, notify]);

  useEffect(() => {
    loadConsents();
  }, [loadConsents]);

  const handleSign = async () => {
    if (!patientId) return notify("Patient ID is required", "error");
    if (!formData.patient_name || !formData.signature) return notify("Patient name and signature required", "error");
    setSaving(true);
    try {
      const { id } = await api.createConsent({
        patient_id: patientId,
        form_type: selected!.id,
        title: selected!.name,
        content: JSON.stringify(formData),
      });
      await api.signConsent(id, formData.signature);
      notify(`${selected!.name} signed successfully`);
      setSelected(null);
      setFormData({});
      setTab("signed");
      loadConsents();
    } catch (e: any) {
      notify(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-enter">
      <div className="breadcrumb">
        <button onClick={onBack}>Home</button>
        <span className="sep">/</span>
        <span>Consent Forms</span>
      </div>
      <div className="section-header">
        <div>
          <h1>Digital Consent Forms</h1>
          <div className="subtitle">Create, sign, and manage patient consent documents</div>
        </div>
      </div>

      <div className="neu" style={{ padding: 16, marginBottom: 20, maxWidth: 400 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
          Patient ID
        </label>
        <input className="neu-input" placeholder="Enter patient ID" value={patientId} onChange={e => setPatientId(e.target.value)} />
      </div>

      <div className="chart-tabs" style={{ maxWidth: 400, marginBottom: 20 }}>
        <button className={`chart-tab${tab === "create" ? " active" : ""}`} onClick={() => setTab("create")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          Templates ({TEMPLATES.length})
        </button>
        <button className={`chart-tab${tab === "signed" ? " active" : ""}`} onClick={() => setTab("signed")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          Signed ({signed.length})
        </button>
      </div>

      {tab === "create" && !selected && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {TEMPLATES.map(t => (
            <div key={t.id} className="neu" style={{ padding: 20, cursor: "pointer", transition: "transform 0.2s" }} onClick={() => { setSelected(t); setFormData({}); }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <h4 style={{ fontSize: 14, fontWeight: 700 }}>{t.name}</h4>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{t.desc}</p>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>{t.fields.length} fields</div>
            </div>
          ))}
        </div>
      )}

      {tab === "create" && selected && (
        <div className="neu" style={{ padding: 24, maxWidth: 600 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>{selected.name}</h3>
            <button className="neu-btn sm ghost" onClick={() => { setSelected(null); setFormData({}); }}>← Back</button>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>{selected.desc}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {selected.fields.map(field => (
              <div key={field}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                  {FIELD_LABELS[field] || field}
                </label>
                {field === "risks" || field === "alternatives" || field === "limitations" ? (
                  <textarea className="neu-input" value={formData[field] || ""} onChange={e => setFormData({ ...formData, [field]: e.target.value })} rows={3} style={{ resize: "vertical", minHeight: 60 }} />
                ) : field === "signature" ? (
                  <div>
                    <input className="neu-input" placeholder="Type full name as digital signature" value={formData[field] || ""} onChange={e => setFormData({ ...formData, [field]: e.target.value })} style={{ fontStyle: "italic", fontFamily: "Georgia, serif", fontSize: 16 }} />
                    {formData[field] && (
                      <div style={{ marginTop: 8, padding: "12px 16px", background: "var(--bg-alt)", borderRadius: 8, borderBottom: "2px solid var(--accent)" }}>
                        <span style={{ fontFamily: "Georgia, serif", fontSize: 20, fontStyle: "italic", color: "var(--accent)" }}>{formData[field]}</span>
                      </div>
                    )}
                  </div>
                ) : field === "date" ? (
                  <input className="neu-input" type="date" value={formData[field] || new Date().toISOString().slice(0, 10)} onChange={e => setFormData({ ...formData, [field]: e.target.value })} />
                ) : (
                  <input className="neu-input" value={formData[field] || ""} onChange={e => setFormData({ ...formData, [field]: e.target.value })} />
                )}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
            <button className="neu-btn ghost" onClick={() => { setSelected(null); setFormData({}); }}>Cancel</button>
            <button className="neu-btn primary" onClick={handleSign} disabled={saving}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              {saving ? "Saving…" : "Sign & Submit"}
            </button>
          </div>
        </div>
      )}

      {tab === "signed" && (
        <div>
          {!patientId ? (
            <div className="chart-empty">Enter a patient ID to view signed consent forms</div>
          ) : loading ? (
            <div className="chart-empty">Loading…</div>
          ) : signed.length === 0 ? (
            <div className="chart-empty">No signed consent forms yet</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {signed.map(s => {
                const data = (() => { try { return JSON.parse(s.content || "{}"); } catch { return {}; } })();
                return (
                  <div key={s.id} className="neu" style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{s.title}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        Patient: {data.patient_name || s.patient_id} · Signed: {s.signed_at ? new Date(s.signed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", padding: "2px 8px", borderRadius: 4, background: s.signed ? "rgba(16,185,129,0.15)" : "rgba(148,163,184,0.15)", color: s.signed ? "#10b981" : "var(--text-muted)" }}>
                        {s.signed ? "Signed" : "Pending"}
                      </span>
                      <button className="neu-btn sm ghost" onClick={() => {
                        const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `consent_${s.title.replace(/\s/g, "_")}_${data.patient_name || s.patient_id}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
