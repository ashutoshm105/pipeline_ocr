import { useEffect, useState } from "react";
import { testLabInterpretation, type LabInterpretationResult } from "../api";

interface Props {
  onBack: () => void;
  notify: (msg: string, type?: "success" | "error") => void;
}

interface CustomTest {
  name: string;
  value: string;
  unit: string;
  refLow: string;
  refHigh: string;
}

const emptyCustom: CustomTest = { name: "", value: "", unit: "", refLow: "", refHigh: "" };

function flagLabel(flag: string): { label: string; color: string; critical: boolean } {
  switch (flag) {
    case "CRITICAL_HIGH":
    case "CRITICAL_LOW":
      return { label: "CRITICAL", color: "var(--danger, #e53e3e)", critical: true };
    case "HIGH":
      return { label: "High", color: "var(--warning, #dd6b20)", critical: false };
    case "LOW":
      return { label: "Low", color: "var(--warning, #dd6b20)", critical: false };
    case "NORMAL":
      return { label: "Normal", color: "var(--success, #38a169)", critical: false };
    default:
      return { label: "Unknown", color: "var(--text-muted, #888)", critical: false };
  }
}

export function LabInterpretation({ onBack, notify }: Props) {
  const [results, setResults] = useState<LabInterpretationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customTests, setCustomTests] = useState<LabInterpretationResult[]>([]);
  const [form, setForm] = useState<CustomTest>({ ...emptyCustom });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    testLabInterpretation()
      .then(data => {
        if (!cancelled) setResults(data);
      })
      .catch(e => {
        if (!cancelled) {
          setError(e.message || "Failed to load lab interpretation");
          notify(e.message || "Failed to load lab interpretation", "error");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allTests = [...results, ...customTests];
  const criticals = allTests.filter(t => flagLabel(t.flag).critical);

  const handleAddCustom = () => {
    const { name, value, unit, refLow, refHigh } = form;
    if (!name.trim() || !value.trim()) {
      notify("Test name and value are required", "error");
      return;
    }
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      notify("Value must be a number", "error");
      return;
    }
    const low = parseFloat(refLow);
    const high = parseFloat(refHigh);
    let flag = "UNKNOWN";
    if (!isNaN(high) && numValue > high) flag = "HIGH";
    else if (!isNaN(low) && numValue < low) flag = "LOW";
    else if (!isNaN(low) && !isNaN(high)) flag = "NORMAL";
    const parsed: LabInterpretationResult = {
      id: `custom-${Date.now()}`,
      patient_id: "",
      test_name: name.trim(),
      value: numValue,
      unit: unit.trim(),
      reference_low: isNaN(low) ? null : low,
      reference_high: isNaN(high) ? null : high,
      status: null,
      flag,
      report_id: null,
      tested_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    setCustomTests(prev => [...prev, parsed]);
    setForm({ ...emptyCustom });
    notify("Custom test added", "success");
  };

  const handlePrint = () => {
    window.print();
    notify("Print dialog opened", "success");
  };

  return (
    <div className="page-enter">
      <div className="breadcrumb">
        <button onClick={onBack}>Home</button>
        <span className="sep">/</span>
        <span>Lab Interpretation</span>
      </div>

      <div className="section-header">
        <div>
          <h1>Lab Result Interpretation</h1>
          <div className="subtitle">Reference-range analysis of laboratory results</div>
        </div>
        <button className="neu-btn" onClick={handlePrint}>Export / Print</button>
      </div>

      {loading && <div className="neu" style={{ padding: "20px", marginBottom: "20px" }}>Loading lab results…</div>}

      {!loading && error && (
        <div className="neu" style={{ padding: "20px", marginBottom: "20px", color: "var(--danger, #e53e3e)" }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Critical Alerts */}
          {criticals.length > 0 && (
            <div className="neu" style={{ background: "var(--danger-soft, #fff5f5)", border: "2px solid var(--danger, #e53e3e)", padding: "16px", marginBottom: "20px", borderRadius: "14px" }}>
              <div style={{ fontWeight: 700, color: "var(--danger, #e53e3e)", marginBottom: "8px", fontSize: "0.95rem" }}>
                CRITICAL VALUE ALERT
              </div>
              {criticals.map((t, i) => (
                <div key={i} style={{ color: "var(--danger, #e53e3e)", fontSize: "0.9rem", marginBottom: "4px" }}>
                  {t.test_name}: {t.value} {t.unit} (reference: {t.reference_low ?? "--"} - {t.reference_high ?? "--"})
                </div>
              ))}
            </div>
          )}

          {/* Results Table */}
          <div className="neu" style={{ overflowX: "auto", marginBottom: "20px" }}>
            <table className="vitals-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Value</th>
                  <th>Unit</th>
                  <th>Reference</th>
                  <th>Status</th>
                  <th>Tested</th>
                </tr>
              </thead>
              <tbody>
                {allTests.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted, #888)", padding: "16px" }}>
                      No lab results on file yet.
                    </td>
                  </tr>
                )}
                {allTests.map((t, i) => {
                  const s = flagLabel(t.flag);
                  return (
                    <tr key={t.id ?? i}>
                      <td style={{ fontWeight: 600 }}>{t.test_name}</td>
                      <td style={{ fontWeight: 700, color: s.label === "Normal" ? "var(--text)" : s.color }}>{t.value ?? "--"}</td>
                      <td style={{ color: "var(--text-muted, #888)" }}>{t.unit}</td>
                      <td>{t.reference_low ?? "N/A"} - {t.reference_high ?? "N/A"}</td>
                      <td>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: "6px", padding: "2px 10px",
                          borderRadius: "20px", fontSize: "0.8rem", fontWeight: 600,
                          background: s.label === "Normal" ? "var(--success-soft, #f0fff4)" : s.label === "CRITICAL" ? "var(--danger-soft, #fff5f5)" : "var(--warning-soft, #fffaf0)",
                          color: s.color,
                        }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, display: "inline-block" }} />
                          {s.label}
                        </span>
                      </td>
                      <td style={{ color: "var(--text-muted, #888)", fontSize: "0.85rem" }}>
                        {t.tested_at ? new Date(t.tested_at).toLocaleDateString() : "--"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Add Custom Test */}
      <div className="neu" style={{ padding: "20px", marginBottom: "20px" }}>
        <h3 className="section-header" style={{ fontSize: "1rem", marginBottom: "12px" }}>Add Custom Test Result</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "10px", marginBottom: "12px" }}>
          <input className="neu-input" placeholder="Test name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input className="neu-input" placeholder="Value" type="number" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} />
          <input className="neu-input" placeholder="Unit" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
          <input className="neu-input" placeholder="Ref Low" type="number" value={form.refLow} onChange={e => setForm({ ...form, refLow: e.target.value })} />
          <input className="neu-input" placeholder="Ref High" type="number" value={form.refHigh} onChange={e => setForm({ ...form, refHigh: e.target.value })} />
        </div>
        <button className="neu-btn" onClick={handleAddCustom}>Add Test</button>
      </div>
    </div>
  );
}
