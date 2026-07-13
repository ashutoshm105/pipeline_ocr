import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import * as api from "../api";
import { GpuStatusPanel } from "../components/GpuStatusPanel";

interface Props {
  onBack: () => void;
  notify: (msg: string, type?: "success" | "error") => void;
}

type HubTab = "ocr" | "ai" | "preprocessing" | "diagnosis" | "classifier" | "system";

const TAB_META: { key: HubTab; label: string; icon: string }[] = [
  { key: "ocr", label: "OCR Engines", icon: "📝" },
  { key: "ai", label: "AI Models", icon: "🧠" },
  { key: "preprocessing", label: "Preprocessing", icon: "🔧" },
  { key: "diagnosis", label: "Diagnosis", icon: "🩺" },
  { key: "classifier", label: "Classifiers", icon: "🏷" },
  { key: "system", label: "System", icon: "🖥️" },
];

const ENGINE_ICONS: Record<string, string> = {
  auto: "🔀", paddleocr: "📝", qwen_vl: "👁", pipeline: "🔄",
  gemini: "✦", openai: "◐", ollama: "🦙", custom_openai: "🔌",
  rule_based: "📏", heuristic: "📊", cnn: "🧬", transformer: "🤖",
};

const KIND_TO_TAB: Record<string, HubTab> = {
  ocr: "ocr", ai: "ai", preprocessing: "preprocessing",
  diagnosis: "diagnosis", classifier: "classifier",
};

export function Settings({ onBack, notify }: Props) {
  const [providers, setProviders] = useState<api.Provider[]>([]);
  const [engines, setEngines] = useState<{ ocr: api.EngineInfo[]; ai: api.EngineInfo[] }>({ ocr: [], ai: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<HubTab>("ocr");

  // Hub status
  const [hubStatusData, setHubStatusData] = useState<any>(null);
  const [healthData, setHealthData] = useState<any>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<any>(null);
  const [recsLoading, setRecsLoading] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formEngine, setFormEngine] = useState("");
  const [formConfig, setFormConfig] = useState<Record<string, string>>({});
  const [formDefault, setFormDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  // Test state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, e] = await Promise.all([api.listProviders(), api.listEngines()]);
      setProviders(p);
      setEngines(e);
    } catch (e: any) {
      notify(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const loadHubStatus = useCallback(async () => {
    try {
      const s = await api.hubStatus();
      setHubStatusData(s);
    } catch {
      // hub status endpoint may not exist yet -- silent
    }
  }, []);

  useEffect(() => { load(); loadHubStatus(); }, [load, loadHubStatus]);

  // Derived counts
  const countByKind = (kind: string) => {
    const items = providers.filter(p => p.kind === kind);
    const active = items.filter(p => !!p.is_default).length;
    return { total: items.length, active };
  };

  const filteredProviders = providers.filter(p => {
    const mapped = KIND_TO_TAB[p.kind] || p.kind;
    return mapped === tab;
  });

  const engineOptionsForKind = (kind: string): api.EngineInfo[] => {
    if (kind === "ocr") return engines.ocr;
    if (kind === "ai") return engines.ai;
    // For other kinds, return combined or empty
    return [...engines.ocr, ...engines.ai];
  };

  const openAdd = (kind: string) => {
    setShowForm(kind);
    setEditId(null);
    setFormName("");
    const opts = engineOptionsForKind(kind);
    setFormEngine(opts.length > 0 ? opts[0].id : "");
    setFormConfig({});
    setFormDefault(false);
  };

  const openEdit = (p: api.Provider) => {
    setShowForm(p.kind);
    setEditId(p.id);
    setFormName(p.name);
    setFormEngine(p.engine);
    setFormConfig({ ...p.config });
    setFormDefault(!!p.is_default);
  };

  const handleSave = async () => {
    if (!formName.trim()) return notify("Name is required", "error");
    setSaving(true);
    try {
      const data = { kind: showForm!, name: formName, engine: formEngine, config: formConfig, is_default: formDefault };
      if (editId) {
        await api.updateProvider(editId, data);
        notify("Provider updated!");
      } else {
        await api.createProvider(data);
        notify("Provider added!");
      }
      setShowForm(null);
      await load();
      loadHubStatus();
    } catch (e: any) {
      notify(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteProvider(id);
      notify("Provider removed");
      await load();
      loadHubStatus();
    } catch (e: any) {
      notify(e.message, "error");
    }
  };

  const handleSetDefault = async (p: api.Provider) => {
    try {
      await api.updateProvider(p.id, { ...p, is_default: !p.is_default });
      notify(p.is_default ? "Default cleared" : "Set as default!");
      await load();
    } catch (e: any) {
      notify(e.message, "error");
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await api.hubTest(id);
      setTestResult({ id, ok: true, msg: res.message || res.status || "OK" });
      notify("Test passed!");
    } catch (e: any) {
      setTestResult({ id, ok: false, msg: e.message });
      notify("Test failed: " + e.message, "error");
    } finally {
      setTestingId(null);
    }
  };

  const handleHealthCheck = async () => {
    setHealthLoading(true);
    try {
      const h = await api.hubHealth();
      setHealthData(h);
    } catch (e: any) {
      notify("Health check failed: " + e.message, "error");
    } finally {
      setHealthLoading(false);
    }
  };

  const handleRecommendations = async () => {
    setRecsLoading(true);
    try {
      const r = await api.hubRecommendations();
      setRecommendations(r);
    } catch (e: any) {
      notify("Could not fetch recommendations: " + e.message, "error");
    } finally {
      setRecsLoading(false);
    }
  };

  const currentEngineFields = () => {
    if (!showForm) return [];
    const list = engineOptionsForKind(showForm);
    return list.find(e => e.id === formEngine)?.fields || [];
  };

  const tabLabel = (kind: string) => {
    const meta = TAB_META.find(t => t.key === kind);
    return meta ? `${meta.icon} ${meta.label}` : kind;
  };

  return (
    <div className="page-enter">
      <div className="breadcrumb">
        <button onClick={onBack}>Home</button>
        <span className="sep">/</span>
        <span>Model Hub</span>
      </div>

      <div className="section-header">
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 28 }}>🧩</span> Model Hub
          </h1>
          <div className="subtitle">Ollama for medtech -- plug-and-play engines, models, and pipelines</div>
        </div>
      </div>

      {/* ── Hub Status Bar ──────────────────────────────────────── */}
      <div className="neu" style={{
        display: "flex", flexWrap: "wrap", gap: 16, padding: "14px 20px",
        marginBottom: 24, borderRadius: 12,
        background: "var(--glass)", border: "1px solid var(--glass-border)",
      }}>
        {TAB_META.filter(t => t.key !== "system").map(t => {
          const c = countByKind(t.key);
          return (
            <div key={t.key} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 12px", borderRadius: 8,
              background: tab === t.key ? "var(--primary)" : "transparent",
              color: tab === t.key ? "#fff" : "var(--text-secondary)",
              cursor: "pointer", transition: "all 0.2s",
              fontSize: 13, fontWeight: 500,
            }} onClick={() => setTab(t.key)}>
              <span>{t.icon}</span>
              <span>{t.label}</span>
              <span style={{
                background: c.active > 0 ? "#00d4aa22" : "var(--glass-border)",
                color: c.active > 0 ? "#00d4aa" : "var(--text-secondary)",
                padding: "1px 7px", borderRadius: 10, fontSize: 11, fontWeight: 600,
              }}>
                {c.active}/{c.total}
              </span>
            </div>
          );
        })}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 12px", borderRadius: 8,
          background: tab === "system" ? "var(--primary)" : "transparent",
          color: tab === "system" ? "#fff" : "var(--text-secondary)",
          cursor: "pointer", transition: "all 0.2s",
          fontSize: 13, fontWeight: 500,
        }} onClick={() => setTab("system")}>
          <span>🖥️</span><span>System</span>
        </div>
      </div>

      {loading ? (
        <div>{[1, 2, 3].map(i => <div key={i} className="skeleton skeleton-card" />)}</div>
      ) : tab === "system" ? (
        /* ── System Tab ──────────────────────────────────────────── */
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <GpuStatusPanel />

          <div className="neu" style={{ padding: 20, borderRadius: 12 }}>
            <h3 style={{ margin: "0 0 12px", color: "var(--text)" }}>Health Check</h3>
            <button className="neu-btn primary" onClick={handleHealthCheck} disabled={healthLoading}
              style={{ marginBottom: 12 }}>
              {healthLoading ? <span className="spinner white" /> : "Run Health Check"}
            </button>
            {healthData && (
              <pre style={{
                background: "var(--glass)", border: "1px solid var(--glass-border)",
                borderRadius: 8, padding: 14, fontSize: 12, color: "var(--text)",
                overflowX: "auto", maxHeight: 300,
              }}>{JSON.stringify(healthData, null, 2)}</pre>
            )}
          </div>

          <div className="neu" style={{ padding: 20, borderRadius: 12 }}>
            <h3 style={{ margin: "0 0 12px", color: "var(--text)" }}>Hardware Recommendations</h3>
            <button className="neu-btn primary" onClick={handleRecommendations} disabled={recsLoading}
              style={{ marginBottom: 12 }}>
              {recsLoading ? <span className="spinner white" /> : "Get Recommendations"}
            </button>
            {recommendations && (
              <pre style={{
                background: "var(--glass)", border: "1px solid var(--glass-border)",
                borderRadius: 8, padding: 14, fontSize: 12, color: "var(--text)",
                overflowX: "auto", maxHeight: 300,
              }}>{JSON.stringify(recommendations, null, 2)}</pre>
            )}
          </div>
        </div>
      ) : (
        /* ── Provider Tab ────────────────────────────────────────── */
        <div className="provider-section">
          <div className="provider-section-header">
            <div>
              <h3>{tabLabel(tab)}</h3>
              <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: 13 }}>
                {tab === "ocr" && "Text extraction from documents and images"}
                {tab === "ai" && "Language models for medical report analysis"}
                {tab === "preprocessing" && "Image preprocessing and enhancement"}
                {tab === "diagnosis" && "Clinical decision support engines"}
                {tab === "classifier" && "Document type classifiers"}
              </p>
            </div>
            <button className="neu-btn sm primary" onClick={() => openAdd(tab)}>+ Add</button>
          </div>

          {filteredProviders.length === 0 ? (
            <div className="provider-empty neu-inset">
              <span>No {tab} providers configured.</span>
              <span className="provider-empty-hint">
                {tab === "ocr" && "The MedVault Dual Pipeline (PaddleOCR + Qwen2.5-VL) is used by default."}
                {tab === "ai" && "Add a Gemini, OpenAI, or Ollama provider to start analyzing."}
                {tab === "preprocessing" && "Add preprocessing filters for image enhancement."}
                {tab === "diagnosis" && "Add a diagnosis engine for clinical decision support."}
                {tab === "classifier" && "Add a classifier for automatic document categorization."}
              </span>
            </div>
          ) : (
            <div className="provider-list">
              {filteredProviders.map(p => (
                <ProviderCard
                  key={p.id}
                  provider={p}
                  onEdit={() => openEdit(p)}
                  onDelete={() => handleDelete(p.id)}
                  onTest={() => handleTest(p.id)}
                  onSetDefault={() => handleSetDefault(p)}
                  testing={testingId === p.id}
                  testResult={testResult?.id === p.id ? testResult : null}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Add/Edit Form Modal ──────────────────────────────────── */}
      {showForm && createPortal(
        <div className="modal-overlay" onClick={() => setShowForm(null)}>
          <div className="modal-card neu" onClick={e => e.stopPropagation()}>
            <h3>{editId ? "Edit" : "Add"} {tabLabel(showForm)}</h3>

            <div className="form-group">
              <label>Name</label>
              <input className="neu-input" placeholder="e.g. My Gemini Key" value={formName}
                onChange={e => setFormName(e.target.value)} />
            </div>

            <div className="form-group">
              <label>Engine</label>
              <select className="neu-input" value={formEngine}
                onChange={e => { setFormEngine(e.target.value); setFormConfig({}); }}>
                {engineOptionsForKind(showForm).map(eng => (
                  <option key={eng.id} value={eng.id}>{eng.name}</option>
                ))}
              </select>
            </div>

            {currentEngineFields().map(field => (
              <div className="form-group" key={field.key}>
                <label>{field.label} {field.required && <span style={{ color: "var(--danger)" }}>*</span>}</label>
                <input
                  className="neu-input"
                  type={field.secret ? "password" : "text"}
                  placeholder={field.placeholder}
                  value={formConfig[field.key] || ""}
                  onChange={e => setFormConfig(prev => ({ ...prev, [field.key]: e.target.value }))}
                />
              </div>
            ))}

            <label className="checkbox-row">
              <input type="checkbox" checked={formDefault} onChange={e => setFormDefault(e.target.checked)} />
              <span>Set as default</span>
            </label>

            <div className="form-actions">
              <button className="neu-btn ghost" onClick={() => setShowForm(null)}>Cancel</button>
              <button className="neu-btn primary" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner white" /> : editId ? "Update" : "Add"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ── Provider Card ───────────────────────────────────────────── */
function ProviderCard({ provider, onEdit, onDelete, onTest, onSetDefault, testing, testResult }: {
  provider: api.Provider;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  onSetDefault: () => void;
  testing: boolean;
  testResult: { ok: boolean; msg: string } | null;
}) {
  const icon = ENGINE_ICONS[provider.engine] || "⚙";
  const configSummary = Object.entries(provider.config || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v.length > 20 ? v.slice(0, 18) + "..." : v}`)
    .join(" | ");

  return (
    <div className="provider-card neu" style={{ position: "relative", transition: "all 0.2s" }}>
      {/* Status dot */}
      <div style={{
        position: "absolute", top: 12, right: 12,
        width: 10, height: 10, borderRadius: "50%",
        background: provider.is_default ? "#00d4aa" : "#666",
        boxShadow: provider.is_default ? "0 0 6px #00d4aa88" : "none",
        transition: "all 0.3s",
      }} title={provider.is_default ? "Default" : "Inactive"} />

      <div className="provider-card-icon" style={{ fontSize: 28 }}>{icon}</div>
      <div className="provider-card-body">
        <div className="provider-card-name">
          {provider.name}
          {!!provider.is_default && <span className="tag analyzed" style={{ marginLeft: 8 }}>Default</span>}
        </div>
        <div className="provider-card-engine" style={{ color: "var(--text-secondary)", fontSize: 12 }}>
          {provider.engine} &middot; {provider.kind}
        </div>
        {configSummary && (
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4, opacity: 0.7 }}>
            {configSummary}
          </div>
        )}

        {/* Test result inline */}
        {testResult && (
          <div style={{
            marginTop: 6, fontSize: 12, padding: "4px 8px", borderRadius: 6,
            background: testResult.ok ? "#00d4aa18" : "#ff525218",
            color: testResult.ok ? "#00d4aa" : "#ff5252",
            display: "inline-block",
          }}>
            {testResult.ok ? "✓ " : "✕ "}{testResult.msg}
          </div>
        )}
      </div>
      <div className="provider-card-actions" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button className="neu-btn sm ghost" onClick={onTest} disabled={testing}
          title="Test connection" style={{ minWidth: 52 }}>
          {testing ? <span className="spinner" /> : "Test"}
        </button>
        <button className="neu-btn sm ghost" onClick={onSetDefault}
          title={provider.is_default ? "Clear default" : "Set as default"}>
          {provider.is_default ? "★" : "☆"}
        </button>
        <button className="neu-btn sm ghost" onClick={onEdit}>Edit</button>
        <button className="neu-btn sm danger" onClick={onDelete}>Remove</button>
      </div>
    </div>
  );
}
