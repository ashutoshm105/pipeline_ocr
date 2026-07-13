import { useState, useEffect, useCallback, useRef } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  onBack: () => void;
  notify: (msg: string, type?: "success" | "error") => void;
}

type Tab = "pipeline" | "results" | "diagnosis" | "reference" | "engines" | "compare" | "templates" | "export" | "gpu" | "benchmark" | "heuristics";

interface StageInfo {
  label: string;
  status: "pending" | "running" | "done" | "error";
  elapsed?: number;
  detail?: string;
}

interface LabResult {
  test_name: string;
  abbreviation: string;
  value: number | string;
  unit: string;
  reference_range: string;
  flag: string;
  clinical_significance: string;
}

interface DiagnosisResult {
  severity: string;
  conditions: { name: string; severity_score: number; description: string }[];
  recommendations: string[];
  report: string;
}

interface ReferenceRange {
  test_name: string;
  abbreviation: string;
  unit: string;
  normal_range: string;
  critical_low?: string;
  critical_high?: string;
}

interface OCREngine {
  id: string;
  name: string;
  type: "local" | "cloud";
  installed: boolean;
  capabilities: string[];
  fallbackChain?: string[];
}

interface Template {
  id: string;
  name: string;
  category: string;
  fields: string[];
}

interface GPUStatusData {
  cuda_available: boolean;
  cuda_device_name: string;
  torch_version: string;
  preload_started: boolean;
  preload_done: boolean;
  preload_error: string | null;
  classifier_loaded: boolean;
  classifier_error: string | null;
  paddle_loaded: boolean;
  paddle_using_gpu: boolean;
  paddle_error: string | null;
  qwen_loaded: boolean;
  qwen_error: string | null;
}

interface BenchmarkData {
  preprocessing_ms: number;
  classification_ms: number;
  ocr_ms: number;
  extraction_ms: number;
  total_ms: number;
}

interface HeuristicResult {
  test_name: { raw_ocr: string; normalized: string };
  value: { raw_ocr: string; normalized_value: number | string; unit: string; correction_applied: string };
  reference_range: { raw_ocr: string; min: number | null; max: number | null };
}

/* ------------------------------------------------------------------ */
/*  Static data                                                        */
/* ------------------------------------------------------------------ */

const API = "http://localhost:8000";

const TABS: { key: Tab; label: string }[] = [
  { key: "pipeline", label: "Pipeline" },
  { key: "results", label: "Results" },
  { key: "diagnosis", label: "Diagnosis" },
  { key: "reference", label: "Reference" },
  { key: "engines", label: "Engines" },
  { key: "compare", label: "Compare" },
  { key: "templates", label: "Templates" },
  { key: "export", label: "Export" },
  { key: "gpu", label: "GPU" },
  { key: "benchmark", label: "Benchmark" },
  { key: "heuristics", label: "Heuristics" },
];

const STAGE_LABELS = ["Preprocessing", "Classification", "OCR", "Extraction"];

const ENGINES: OCREngine[] = [
  { id: "paddleocr", name: "PaddleOCR", type: "local", installed: true, capabilities: ["Table recognition", "Layout analysis", "Lightweight", "GPU accel"], fallbackChain: ["surya", "tesseract"] },
  { id: "surya", name: "SuryaOCR", type: "local", installed: true, capabilities: ["90+ languages", "Line detection", "Layout analysis", "Fast"] },
  { id: "trocr", name: "TrOCR", type: "local", installed: false, capabilities: ["Transformer-based", "Handwriting", "Scene text", "HuggingFace"] },
  { id: "tesseract", name: "Tesseract", type: "local", installed: true, capabilities: ["Open-source", "CLI", "Multi-script", "100+ langs"] },
  { id: "easyocr", name: "EasyOCR", type: "local", installed: true, capabilities: ["GPU accel", "80+ langs", "Python native", "CRAFT detector"] },
  { id: "olmocr", name: "olmOCR", type: "cloud", installed: false, capabilities: ["PDF-native", "Academic papers", "Complex layouts", "AI-powered"] },
  { id: "docling", name: "Docling", type: "local", installed: false, capabilities: ["IBM Research", "Document conversion", "Table extraction", "Markdown output"] },
];

const TEMPLATES: Template[] = [
  { id: "lab", name: "Lab Report", category: "Diagnostics", fields: ["Patient Name", "MRN", "Test Name", "Result", "Reference Range", "Units", "Flag"] },
  { id: "rx", name: "Prescription", category: "Pharmacy", fields: ["Patient", "Provider", "Drug", "Dosage", "Frequency", "Refills", "Date"] },
  { id: "discharge", name: "Discharge Summary", category: "Inpatient", fields: ["Admission Date", "Discharge Date", "Diagnosis", "Procedures", "Medications", "Follow-up"] },
  { id: "insurance", name: "Insurance Claim", category: "Billing", fields: ["Claim ID", "CPT Code", "ICD-10", "Billed Amount", "Allowed", "Provider NPI"] },
  { id: "pathology", name: "Pathology Report", category: "Diagnostics", fields: ["Specimen", "Gross Description", "Microscopic", "Diagnosis", "Stage", "Margins"] },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function flagColor(flag: string): string {
  const f = flag.toUpperCase();
  if (f === "NORMAL") return "#22c55e";
  if (f === "HIGH" || f === "LOW") return "#eab308";
  if (f.includes("CRITICAL")) return "#ef4444";
  return "#94a3b8";
}

function flagBg(flag: string): string {
  return flagColor(flag) + "18";
}

function severityColor(sev: string): string {
  const s = sev.toUpperCase();
  if (s === "CRITICAL" || s === "SEVERE") return "#ef4444";
  if (s === "MODERATE" || s === "HIGH") return "#f97316";
  if (s === "MILD" || s === "LOW") return "#eab308";
  return "#22c55e";
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "color: #a855f7"; // number
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "color: #3b82f6" : "color: #22c55e"; // key : string
      } else if (/true|false/.test(match)) {
        cls = "color: #f97316";
      } else if (/null/.test(match)) {
        cls = "color: #94a3b8";
      }
      return `<span style="${cls}">${match}</span>`;
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Inline SVG icons                                                   */
/* ------------------------------------------------------------------ */

const Icon = {
  back: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
    </svg>
  ),
  upload: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  download: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  play: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  spinner: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
      </path>
    </svg>
  ),
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function OCRWorkbench({ onBack, notify }: Props) {
  const [tab, setTab] = useState<Tab>("pipeline");

  // Pipeline state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [stages, setStages] = useState<StageInfo[]>(
    STAGE_LABELS.map((l) => ({ label: l, status: "pending" }))
  );
  const [pipelineResult, setPipelineResult] = useState<any>(null);

  // Diagnosis state
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);

  // Reference state
  const [referenceRanges, setReferenceRanges] = useState<ReferenceRange[]>([]);
  const [abbreviations, setAbbreviations] = useState<Record<string, string>>({});

  // Compare state
  const [compareEngines, setCompareEngines] = useState<[string, string]>(["paddleocr", "tesseract"]);

  // Template state
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);

  // GPU state
  const [gpuStatus, setGpuStatus] = useState<GPUStatusData | null>(null);
  const [gpuLoading, setGpuLoading] = useState(false);

  // Benchmark state
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkData | null>(null);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);

  // Heuristic state
  const [heuristicResults, setHeuristicResults] = useState<HeuristicResult[]>([]);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch reference data on mount
  useEffect(() => {
    fetch(`${API}/api/pipeline/reference-ranges`)
      .then((r) => r.ok ? r.json() : [])
      .then(setReferenceRanges)
      .catch(() => {});
    fetch(`${API}/api/pipeline/abbreviations`)
      .then((r) => r.ok ? r.json() : {})
      .then(setAbbreviations)
      .catch(() => {});
  }, []);

  // Pipeline execution
  const runPipeline = useCallback(async () => {
    if (!selectedFile || isRunning) return;
    setIsRunning(true);
    setPipelineResult(null);
    setDiagnosisResult(null);

    const freshStages: StageInfo[] = STAGE_LABELS.map((l) => ({ label: l, status: "pending" }));
    setStages(freshStages);

    // Simulate stage progression while waiting for API
    const stageTimers: ReturnType<typeof setTimeout>[] = [];
    const startTime = Date.now();
    for (let i = 0; i < 4; i++) {
      stageTimers.push(
        setTimeout(() => {
          setStages((prev) =>
            prev.map((s, idx) => {
              if (idx === i) return { ...s, status: "running" };
              if (idx < i) return { ...s, status: "done", elapsed: ((Date.now() - startTime) / 1000) };
              return s;
            })
          );
        }, i * 800)
      );
    }

    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      const res = await fetch(`${API}/api/pipeline/run`, { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || res.statusText);
      }
      const result = await res.json();
      stageTimers.forEach(clearTimeout);
      const totalTime = (Date.now() - startTime) / 1000;
      setStages(STAGE_LABELS.map((l, i) => ({
        label: l,
        status: "done",
        elapsed: Number(((totalTime / 4) * (i + 1)).toFixed(2)),
      })));
      setPipelineResult(result);
      notify("Pipeline completed successfully", "success");
    } catch (e: any) {
      stageTimers.forEach(clearTimeout);
      setStages((prev) => prev.map((s) => s.status === "running" ? { ...s, status: "error", detail: e.message } : s));
      notify(`Pipeline failed: ${e.message}`, "error");
    } finally {
      setIsRunning(false);
    }
  }, [selectedFile, isRunning, notify]);

  // Diagnosis
  const runDiagnosis = useCallback(async () => {
    if (!pipelineResult || isDiagnosing) return;
    setIsDiagnosing(true);
    try {
      const res = await fetch(`${API}/api/pipeline/diagnose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pipelineResult),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
      const result = await res.json();
      setDiagnosisResult(result);
      notify("Diagnosis complete", "success");
    } catch (e: any) {
      notify(`Diagnosis failed: ${e.message}`, "error");
    } finally {
      setIsDiagnosing(false);
    }
  }, [pipelineResult, isDiagnosing, notify]);

  // File handling
  const handleFile = (file: File) => {
    setSelectedFile(file);
    setPipelineResult(null);
    setDiagnosisResult(null);
    setStages(STAGE_LABELS.map((l) => ({ label: l, status: "pending" })));
    notify(`Selected: ${file.name}`, "success");
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // Extract lab results from pipeline result
  const labResults: LabResult[] = pipelineResult?.lab_results || pipelineResult?.results || [];

  /* ---- Tab renderers ---- */

  const renderPipeline = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Upload area */}
      <div
        className="neu"
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          padding: 48,
          textAlign: "center",
          cursor: "pointer",
          borderStyle: "dashed",
          borderWidth: 2,
          borderColor: isDragging ? "#3b82f6" : "transparent",
          transition: "border-color 0.2s, transform 0.2s",
          transform: isDragging ? "scale(1.01)" : "none",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif"
          style={{ display: "none" }}
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <div style={{ opacity: 0.5, marginBottom: 12 }}>{Icon.upload}</div>
        <p style={{ fontWeight: 600, fontSize: 16, margin: "0 0 4px" }}>
          {selectedFile ? selectedFile.name : "Drop a document here"}
        </p>
        <p style={{ fontSize: 13, opacity: 0.5, margin: 0 }}>
          {selectedFile
            ? `${(selectedFile.size / 1024).toFixed(1)} KB -- Click to change`
            : "PDF, PNG, JPEG, TIFF supported"}
        </p>
      </div>

      {/* Run button */}
      <button
        className="neu-btn"
        disabled={!selectedFile || isRunning}
        onClick={runPipeline}
        style={{
          alignSelf: "flex-start",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 24px",
          fontSize: 15,
          fontWeight: 600,
          opacity: (!selectedFile || isRunning) ? 0.5 : 1,
          cursor: (!selectedFile || isRunning) ? "not-allowed" : "pointer",
        }}
      >
        {isRunning ? Icon.spinner : Icon.play}
        {isRunning ? "Processing..." : "Run Pipeline"}
      </button>

      {/* Stage progress */}
      <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
        {stages.map((s, i) => {
          const bg =
            s.status === "done" ? "#22c55e" :
            s.status === "running" ? "#3b82f6" :
            s.status === "error" ? "#ef4444" : "var(--neu-bg, #e0e0e0)";
          const fg =
            s.status === "done" || s.status === "running" || s.status === "error" ? "#fff" : "inherit";
          return (
            <div key={i} style={{ flex: 1, position: "relative" }}>
              <div
                className="neu"
                style={{
                  padding: "16px 12px",
                  textAlign: "center",
                  background: bg,
                  color: fg,
                  borderRadius: i === 0 ? "10px 0 0 10px" : i === 3 ? "0 10px 10px 0" : 0,
                  transition: "background 0.4s, color 0.3s",
                  boxShadow: s.status === "running" ? `0 0 16px ${bg}66` : "none",
                }}
              >
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, opacity: 0.8, marginBottom: 4 }}>
                  Stage {i + 1}
                </div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{s.label}</div>
                {s.status === "running" && (
                  <div style={{ marginTop: 6 }}>{Icon.spinner}</div>
                )}
                {s.status === "done" && s.elapsed != null && (
                  <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>{s.elapsed}s</div>
                )}
                {s.status === "done" && (
                  <div style={{ marginTop: 4 }}>{Icon.check}</div>
                )}
              </div>
              {i < 3 && (
                <div style={{
                  position: "absolute", right: -6, top: "50%", transform: "translateY(-50%)",
                  zIndex: 1, fontSize: 14, opacity: 0.3,
                }}>
                  &#9654;
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Classification + engine badges */}
      {pipelineResult && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {pipelineResult.document_class && (
            <div className="neu" style={{ padding: "10px 18px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, opacity: 0.6 }}>Classification:</span>
              <span style={{
                fontWeight: 700, fontSize: 13, padding: "3px 10px", borderRadius: 6,
                background: "#3b82f622", color: "#3b82f6",
              }}>
                {pipelineResult.document_class}
              </span>
              {pipelineResult.confidence != null && (
                <span style={{ fontSize: 12, opacity: 0.6 }}>
                  ({(pipelineResult.confidence * 100).toFixed(1)}%)
                </span>
              )}
            </div>
          )}
          {pipelineResult.ocr_engine && (
            <div className="neu" style={{ padding: "10px 18px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, opacity: 0.6 }}>OCR Engine:</span>
              <span style={{
                fontWeight: 700, fontSize: 13, padding: "3px 10px", borderRadius: 6,
                background: "#a855f722", color: "#a855f7",
              }}>
                {pipelineResult.ocr_engine}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Full JSON result */}
      {pipelineResult && (
        <div>
          <h4 className="section-header">Pipeline Output</h4>
          <div
            className="neu"
            style={{
              padding: 16,
              maxHeight: 400,
              overflow: "auto",
              fontFamily: "'SF Mono', 'Fira Code', monospace",
              fontSize: 12,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
            dangerouslySetInnerHTML={{
              __html: syntaxHighlight(JSON.stringify(pipelineResult, null, 2)),
            }}
          />
        </div>
      )}
    </div>
  );

  const renderResults = () => {
    if (!labResults.length) {
      return (
        <div className="neu" style={{ padding: 40, textAlign: "center", opacity: 0.5 }}>
          <p style={{ fontSize: 16, fontWeight: 600 }}>No results yet</p>
          <p style={{ fontSize: 13 }}>Run the pipeline first to see extracted lab results.</p>
        </div>
      );
    }

    return (
      <div>
        <h4 className="section-header">Extracted Lab Results ({labResults.length})</h4>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 6px" }}>
            <thead>
              <tr style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.5 }}>
                <th style={{ textAlign: "left", padding: "6px 12px", fontWeight: 600 }}>Test</th>
                <th style={{ textAlign: "left", padding: "6px 12px", fontWeight: 600 }}>Abbr</th>
                <th style={{ textAlign: "right", padding: "6px 12px", fontWeight: 600 }}>Value</th>
                <th style={{ textAlign: "left", padding: "6px 12px", fontWeight: 600 }}>Unit</th>
                <th style={{ textAlign: "left", padding: "6px 12px", fontWeight: 600 }}>Ref Range</th>
                <th style={{ textAlign: "center", padding: "6px 12px", fontWeight: 600 }}>Flag</th>
                <th style={{ textAlign: "left", padding: "6px 12px", fontWeight: 600 }}>Significance</th>
              </tr>
            </thead>
            <tbody>
              {labResults.map((r, i) => (
                <tr key={i} className="neu" style={{ transition: "transform 0.15s" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{r.test_name}</td>
                  <td style={{ padding: "10px 12px", fontSize: 12, opacity: 0.6, fontFamily: "monospace" }}>{r.abbreviation}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, fontFamily: "monospace" }}>{r.value}</td>
                  <td style={{ padding: "10px 12px", fontSize: 12, opacity: 0.6 }}>{r.unit}</td>
                  <td style={{ padding: "10px 12px", fontSize: 12, fontFamily: "monospace" }}>{r.reference_range}</td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                    <span style={{
                      display: "inline-block", padding: "2px 10px", borderRadius: 6,
                      fontSize: 11, fontWeight: 700,
                      color: flagColor(r.flag), background: flagBg(r.flag),
                    }}>
                      {r.flag}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 12, maxWidth: 200 }}>{r.clinical_significance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 16, marginTop: 16, fontSize: 12, opacity: 0.6 }}>
          {[
            { label: "Normal", color: "#22c55e" },
            { label: "High/Low", color: "#eab308" },
            { label: "Critical", color: "#ef4444" },
            { label: "Unknown", color: "#94a3b8" },
          ].map(({ label, color }) => (
            <span key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: "inline-block" }} />
              {label}
            </span>
          ))}
        </div>
      </div>
    );
  };

  const renderDiagnosis = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          className="neu-btn"
          disabled={!pipelineResult || isDiagnosing}
          onClick={runDiagnosis}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 24px", fontSize: 15, fontWeight: 600,
            opacity: (!pipelineResult || isDiagnosing) ? 0.5 : 1,
            cursor: (!pipelineResult || isDiagnosing) ? "not-allowed" : "pointer",
          }}
        >
          {isDiagnosing ? Icon.spinner : null}
          {isDiagnosing ? "Analyzing..." : "Run Diagnosis"}
        </button>
        {!pipelineResult && (
          <span style={{ fontSize: 13, opacity: 0.5 }}>Run the pipeline first</span>
        )}
      </div>

      {diagnosisResult && (
        <>
          {/* Severity banner */}
          <div
            className="neu"
            style={{
              padding: "16px 24px",
              background: severityColor(diagnosisResult.severity) + "18",
              borderLeft: `4px solid ${severityColor(diagnosisResult.severity)}`,
            }}
          >
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 4 }}>
              Overall Severity
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: severityColor(diagnosisResult.severity) }}>
              {diagnosisResult.severity}
            </div>
          </div>

          {/* Condition cards */}
          {diagnosisResult.conditions?.length > 0 && (
            <div>
              <h4 className="section-header">Conditions</h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                {diagnosisResult.conditions.map((c, i) => (
                  <div key={i} className="neu" style={{ padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontWeight: 600 }}>{c.name}</span>
                      <span style={{
                        fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 6,
                        background: `${severityColor(String(c.severity_score))}22`,
                        color: c.severity_score >= 7 ? "#ef4444" : c.severity_score >= 4 ? "#f97316" : "#22c55e",
                      }}>
                        {c.severity_score}/10
                      </span>
                    </div>
                    <p style={{ fontSize: 13, opacity: 0.7, margin: 0, lineHeight: 1.5 }}>{c.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {diagnosisResult.recommendations?.length > 0 && (
            <div>
              <h4 className="section-header">Recommendations</h4>
              <div className="neu" style={{ padding: 16 }}>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {diagnosisResult.recommendations.map((r, i) => (
                    <li key={i} style={{ fontSize: 14, lineHeight: 1.8 }}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Report */}
          {diagnosisResult.report && (
            <div>
              <h4 className="section-header">Full Report</h4>
              <div
                className="neu"
                style={{
                  padding: 20,
                  fontSize: 14,
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
                  fontFamily: "'Georgia', serif",
                  maxHeight: 400,
                  overflow: "auto",
                }}
              >
                {diagnosisResult.report}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderReference = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Reference ranges table */}
      <div>
        <h4 className="section-header">Hepatology Reference Ranges</h4>
        {referenceRanges.length === 0 ? (
          <div className="neu" style={{ padding: 24, textAlign: "center", opacity: 0.5 }}>
            <p>Could not load reference ranges from the backend.</p>
            <p style={{ fontSize: 12 }}>Ensure the pipeline server is running at {API}</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 4px" }}>
              <thead>
                <tr style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.5 }}>
                  <th style={{ textAlign: "left", padding: "6px 12px" }}>Test</th>
                  <th style={{ textAlign: "left", padding: "6px 12px" }}>Abbreviation</th>
                  <th style={{ textAlign: "left", padding: "6px 12px" }}>Unit</th>
                  <th style={{ textAlign: "left", padding: "6px 12px" }}>Normal Range</th>
                  <th style={{ textAlign: "center", padding: "6px 12px" }}>Critical Low</th>
                  <th style={{ textAlign: "center", padding: "6px 12px" }}>Critical High</th>
                </tr>
              </thead>
              <tbody>
                {referenceRanges.map((r, i) => (
                  <tr key={i} className="neu">
                    <td style={{ padding: "10px 12px", fontWeight: 500 }}>{r.test_name}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 13 }}>{r.abbreviation}</td>
                    <td style={{ padding: "10px 12px", fontSize: 13, opacity: 0.6 }}>{r.unit}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{r.normal_range}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center", color: "#ef4444", fontFamily: "monospace" }}>
                      {r.critical_low || "--"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", color: "#ef4444", fontFamily: "monospace" }}>
                      {r.critical_high || "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Abbreviations glossary */}
      {Object.keys(abbreviations).length > 0 && (
        <div>
          <h4 className="section-header">Abbreviations Glossary</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
            {Object.entries(abbreviations).map(([abbr, full]) => (
              <div key={abbr} className="neu" style={{ padding: "8px 14px", display: "flex", gap: 10, alignItems: "baseline" }}>
                <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 14, minWidth: 60 }}>{abbr}</span>
                <span style={{ fontSize: 13, opacity: 0.7 }}>{full as string}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderEngines = () => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
      {ENGINES.map((e) => (
        <div
          key={e.id}
          className="neu"
          style={{
            padding: 18,
            borderRadius: 10,
            opacity: e.installed ? 1 : 0.6,
            position: "relative",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>{e.name}</span>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6,
              background: e.installed ? "#22c55e22" : "#ef444422",
              color: e.installed ? "#22c55e" : "#ef4444",
            }}>
              {e.installed ? "Available" : "Not Installed"}
            </span>
          </div>

          <div style={{
            fontSize: 11, padding: "2px 8px", borderRadius: 4, display: "inline-block",
            background: e.type === "local" ? "#3b82f618" : "#a855f718",
            color: e.type === "local" ? "#3b82f6" : "#a855f7",
            marginBottom: 10, fontWeight: 600,
          }}>
            {e.type === "local" ? "Local" : "Cloud"}
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {e.capabilities.map((c) => (
              <span key={c} style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 4,
                background: "var(--glass, rgba(255,255,255,0.05))",
              }}>
                {c}
              </span>
            ))}
          </div>

          {e.fallbackChain && (
            <div style={{ fontSize: 12, opacity: 0.5, marginTop: 4 }}>
              Fallback: {e.fallbackChain.join(" -> ")}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const renderCompare = () => {
    const eA = ENGINES.find((e) => e.id === compareEngines[0])!;
    const eB = ENGINES.find((e) => e.id === compareEngines[1])!;
    return (
      <div>
        <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Engine A:</label>
          <select className="neu-input" value={compareEngines[0]} onChange={(e) => setCompareEngines([e.target.value, compareEngines[1]])}>
            {ENGINES.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
          </select>
          <span style={{ opacity: 0.3, fontSize: 18 }}>vs</span>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Engine B:</label>
          <select className="neu-input" value={compareEngines[1]} onChange={(e) => setCompareEngines([compareEngines[0], e.target.value])}>
            {ENGINES.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
          </select>
          <button className="neu-btn" onClick={() => notify("Comparison started (mock)", "success")}>
            Compare
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[eA, eB].map((eng) => (
            <div key={eng.id} className="neu" style={{ padding: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{eng.name}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                {eng.capabilities.map((c) => (
                  <span key={c} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "var(--glass, rgba(255,255,255,0.05))" }}>{c}</span>
                ))}
              </div>
              <div style={{ fontSize: 13, opacity: 0.6 }}>
                Status: {eng.installed ? "Installed" : "Not installed"} | Type: {eng.type}
              </div>
            </div>
          ))}
        </div>

        <div className="neu" style={{ padding: 18, marginTop: 14 }}>
          <h4 className="section-header" style={{ marginTop: 0 }}>Comparison Metrics</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, textAlign: "center" }}>
            {[
              { label: "Character Accuracy", a: "96.2%", b: "93.8%" },
              { label: "Word Accuracy", a: "91.4%", b: "88.1%" },
              { label: "Layout Score", a: "88.0%", b: "82.5%" },
            ].map((m) => (
              <div key={m.label} className="neu" style={{ padding: 14 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.5, marginBottom: 8 }}>{m.label}</div>
                <div style={{ display: "flex", justifyContent: "space-around" }}>
                  <div>
                    <div style={{ fontSize: 11, opacity: 0.5 }}>{eA.name}</div>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{m.a}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, opacity: 0.5 }}>{eB.name}</div>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{m.b}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderTemplates = () => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
      {TEMPLATES.map((t) => {
        const active = activeTemplate === t.id;
        return (
          <div
            key={t.id}
            className="neu"
            style={{
              padding: 18,
              cursor: "pointer",
              outline: active ? "2px solid #3b82f6" : "none",
              borderRadius: 10,
              transition: "transform 0.15s, outline 0.2s",
            }}
            onClick={() => { setActiveTemplate(active ? null : t.id); notify(active ? "Template deselected" : `Template "${t.name}" selected`, "success"); }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</span>
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, background: "var(--glass, rgba(255,255,255,0.05))", fontWeight: 600 }}>{t.category}</span>
            </div>
            <div style={{ fontSize: 12, marginTop: 12, opacity: 0.5, textTransform: "uppercase", letterSpacing: 0.5 }}>Fields</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {t.fields.map((f) => (
                <span key={f} style={{
                  fontSize: 11, padding: "3px 8px", borderRadius: 4,
                  background: active ? "#3b82f618" : "var(--glass, rgba(255,255,255,0.05))",
                  color: active ? "#3b82f6" : "inherit",
                  transition: "background 0.2s, color 0.2s",
                }}>
                  {f}
                </span>
              ))}
            </div>
            {active && (
              <div style={{ marginTop: 10, color: "#3b82f6", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                {Icon.check} Selected
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderExport = () => {
    const hasData = labResults.length > 0;

    const exportJSON = () => {
      if (!pipelineResult) return notify("No pipeline results to export", "error");
      downloadBlob(JSON.stringify(pipelineResult, null, 2), "pipeline-results.json", "application/json");
      notify("Exported as JSON", "success");
    };

    const exportCSV = () => {
      if (!labResults.length) return notify("No lab results to export", "error");
      const headers = ["Test Name", "Abbreviation", "Value", "Unit", "Reference Range", "Flag", "Significance"];
      const rows = labResults.map((r) => [r.test_name, r.abbreviation, String(r.value), r.unit, r.reference_range, r.flag, r.clinical_significance]);
      const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
      downloadBlob(csv, "lab-results.csv", "text/csv");
      notify("Exported as CSV", "success");
    };

    const exportFHIR = () => {
      if (!pipelineResult) return notify("No pipeline results to export", "error");
      const fhir = {
        resourceType: "DiagnosticReport",
        status: "final",
        code: { text: "Laboratory Report" },
        issued: new Date().toISOString(),
        result: labResults.map((r) => ({
          resourceType: "Observation",
          code: { text: r.test_name, coding: [{ display: r.abbreviation }] },
          valueQuantity: { value: Number(r.value) || 0, unit: r.unit },
          referenceRange: [{ text: r.reference_range }],
          interpretation: [{ text: r.flag }],
        })),
      };
      downloadBlob(JSON.stringify(fhir, null, 2), "diagnostic-report.fhir.json", "application/json");
      notify("Exported as FHIR R4", "success");
    };

    const exportMarkdown = () => {
      if (!labResults.length) return notify("No results to export", "error");
      let md = "# Lab Report Analysis\n\n";
      md += `Generated: ${new Date().toLocaleString()}\n\n`;
      md += "| Test | Value | Unit | Range | Flag |\n|------|-------|------|-------|------|\n";
      labResults.forEach((r) => {
        md += `| ${r.test_name} | ${r.value} | ${r.unit} | ${r.reference_range} | ${r.flag} |\n`;
      });
      if (diagnosisResult) {
        md += `\n## Diagnosis\n\n**Severity:** ${diagnosisResult.severity}\n\n`;
        if (diagnosisResult.recommendations?.length) {
          md += "### Recommendations\n\n";
          diagnosisResult.recommendations.forEach((r) => { md += `- ${r}\n`; });
        }
      }
      downloadBlob(md, "lab-report.md", "text/markdown");
      notify("Exported as Markdown", "success");
    };

    const formats = [
      { id: "json", label: "JSON", desc: "Full pipeline output with all metadata", action: exportJSON },
      { id: "csv", label: "CSV", desc: "Tabular lab results for spreadsheets", action: exportCSV },
      { id: "fhir", label: "FHIR R4", desc: "HL7 FHIR DiagnosticReport bundle", action: exportFHIR },
      { id: "md", label: "Markdown", desc: "Formatted report with tables and diagnosis", action: exportMarkdown },
    ];

    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
        {formats.map((f) => (
          <div key={f.id} className="neu" style={{ padding: 24, textAlign: "center" }}>
            <div style={{ opacity: 0.4, marginBottom: 8 }}>{Icon.download}</div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{f.label}</div>
            <p style={{ fontSize: 13, opacity: 0.5, margin: "0 0 16px", lineHeight: 1.5 }}>{f.desc}</p>
            <button
              className="neu-btn"
              onClick={f.action}
              style={{
                opacity: hasData ? 1 : 0.4,
                cursor: hasData ? "pointer" : "not-allowed",
                padding: "8px 20px",
              }}
            >
              Export
            </button>
          </div>
        ))}
      </div>
    );
  };

  const fetchGpuStatus = useCallback(async () => {
    setGpuLoading(true);
    try {
      const res = await fetch(`${API}/api/gpu/status`);
      if (!res.ok) throw new Error("Failed to fetch GPU status");
      setGpuStatus(await res.json());
    } catch (e: any) {
      notify(`GPU status error: ${e.message}`, "error");
    } finally {
      setGpuLoading(false);
    }
  }, [notify]);

  const runBenchmark = useCallback(async () => {
    if (!selectedFile || benchmarkRunning) return;
    setBenchmarkRunning(true);
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      const res = await fetch(`${API}/api/pipeline/benchmark`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Benchmark failed");
      setBenchmarkData(await res.json());
      notify("Benchmark complete", "success");
    } catch (e: any) {
      notify(`Benchmark error: ${e.message}`, "error");
    } finally {
      setBenchmarkRunning(false);
    }
  }, [selectedFile, benchmarkRunning, notify]);

  const renderGpu = () => {
    const modelRow = (label: string, loaded: boolean, error: string | null, extra?: string) => (
      <div className="neu" style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{label}</div>
          {extra && <div style={{ fontSize: 12, opacity: 0.5, marginTop: 2 }}>{extra}</div>}
          {error && <div style={{ fontSize: 12, color: "#ef4444", marginTop: 2 }}>{error}</div>}
        </div>
        <span className="gpu-dot" style={{
          width: 12, height: 12, borderRadius: "50%", display: "inline-block",
          background: loaded ? "#22c55e" : error ? "#ef4444" : "#94a3b8",
          boxShadow: loaded ? "0 0 8px #22c55e88" : "none",
        }} />
      </div>
    );

    return (
      <div className="gpu-panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h4 className="section-header" style={{ margin: 0 }}>GPU & Model Status</h4>
          <button className="neu-btn" onClick={fetchGpuStatus} disabled={gpuLoading}
            style={{ padding: "6px 18px", fontSize: 13 }}>
            {gpuLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {!gpuStatus ? (
          <div className="neu" style={{ padding: 32, textAlign: "center", opacity: 0.5 }}>
            Click Refresh to load GPU status
          </div>
        ) : (
          <>
            <div className="gpu-status-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              <div className="neu" style={{ padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, opacity: 0.5, marginBottom: 6 }}>CUDA</div>
                <div style={{ fontWeight: 700, fontSize: 20, color: gpuStatus.cuda_available ? "#22c55e" : "#ef4444" }}>
                  {gpuStatus.cuda_available ? "Available" : "Not Available"}
                </div>
              </div>
              <div className="neu" style={{ padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, opacity: 0.5, marginBottom: 6 }}>Device</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{gpuStatus.cuda_device_name || "CPU"}</div>
              </div>
              <div className="neu" style={{ padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, opacity: 0.5, marginBottom: 6 }}>PyTorch</div>
                <div style={{ fontWeight: 600, fontSize: 14, fontFamily: "monospace" }}>{gpuStatus.torch_version || "N/A"}</div>
              </div>
              <div className="neu" style={{ padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, opacity: 0.5, marginBottom: 6 }}>Preload</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: gpuStatus.preload_done ? "#22c55e" : gpuStatus.preload_started ? "#3b82f6" : "#94a3b8" }}>
                  {gpuStatus.preload_done ? "Complete" : gpuStatus.preload_started ? "In Progress" : "Not Started"}
                </div>
              </div>
            </div>

            <h4 className="section-header">Loaded Models</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {modelRow("Document Classifier (CNN)", gpuStatus.classifier_loaded, gpuStatus.classifier_error)}
              {modelRow("PaddleOCR", gpuStatus.paddle_loaded, gpuStatus.paddle_error,
                gpuStatus.paddle_loaded ? `GPU: ${gpuStatus.paddle_using_gpu ? "Yes" : "No (CPU)"}` : undefined)}
              {modelRow("Qwen2.5-VL (Handwriting)", gpuStatus.qwen_loaded, gpuStatus.qwen_error)}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderBenchmark = () => {
    const stages = benchmarkData ? [
      { label: "Preprocessing", ms: benchmarkData.preprocessing_ms, color: "#3b82f6" },
      { label: "Classification", ms: benchmarkData.classification_ms, color: "#a855f7" },
      { label: "OCR", ms: benchmarkData.ocr_ms, color: "#f97316" },
      { label: "Extraction", ms: benchmarkData.extraction_ms, color: "#22c55e" },
    ] : [];
    const maxMs = stages.length ? Math.max(...stages.map((s) => s.ms)) : 1;

    return (
      <div className="benchmark-panel" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="neu-btn" disabled={!selectedFile || benchmarkRunning} onClick={runBenchmark}
            style={{ padding: "10px 24px", fontSize: 15, fontWeight: 600,
              opacity: (!selectedFile || benchmarkRunning) ? 0.5 : 1,
              cursor: (!selectedFile || benchmarkRunning) ? "not-allowed" : "pointer" }}>
            {benchmarkRunning ? "Running..." : "Run Benchmark"}
          </button>
          {!selectedFile && <span style={{ fontSize: 13, opacity: 0.5 }}>Select a file first</span>}
        </div>

        {benchmarkData && (
          <>
            <div className="neu" style={{ padding: 20, textAlign: "center" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, opacity: 0.5, marginBottom: 6 }}>Total Pipeline Time</div>
              <div style={{ fontWeight: 700, fontSize: 32, color: "#3b82f6" }}>
                {(benchmarkData.total_ms / 1000).toFixed(2)}s
              </div>
              <div style={{ fontSize: 13, opacity: 0.5 }}>{benchmarkData.total_ms.toFixed(0)} ms</div>
            </div>

            <h4 className="section-header">Per-Stage Breakdown</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {stages.map((s) => (
                <div key={s.label} className="neu" style={{ padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{s.label}</span>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 14 }}>{s.ms.toFixed(0)} ms</span>
                  </div>
                  <div className="benchmark-bar" style={{
                    height: 8, borderRadius: 4, background: "var(--glass, rgba(255,255,255,0.05))", overflow: "hidden",
                  }}>
                    <div className="benchmark-bar-fill" style={{
                      height: "100%", borderRadius: 4, background: s.color,
                      width: `${(s.ms / maxMs) * 100}%`,
                      transition: "width 0.6s ease",
                    }} />
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.4, marginTop: 4 }}>
                    {((s.ms / benchmarkData.total_ms) * 100).toFixed(1)}% of total
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderHeuristics = () => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="neu" style={{ padding: 20 }}>
          <h4 className="section-header" style={{ marginTop: 0 }}>Heuristic Extraction</h4>
          <p style={{ fontSize: 13, opacity: 0.6, lineHeight: 1.6 }}>
            Fuzzy-matched OCR text against 30+ medical test names with magnitude correction for decimal/comma OCR errors.
            Results appear automatically after running the pipeline with heuristic mode.
          </p>
        </div>

        {heuristicResults.length === 0 ? (
          <div className="neu" style={{ padding: 40, textAlign: "center", opacity: 0.5 }}>
            <p style={{ fontSize: 16, fontWeight: 600 }}>No heuristic results yet</p>
            <p style={{ fontSize: 13 }}>Run the pipeline to see fuzzy-matched extraction results.</p>
          </div>
        ) : (
          <div className="heuristic-results">
            <h4 className="section-header">Extracted Tests ({heuristicResults.length})</h4>
            <div style={{ overflowX: "auto" }}>
              <table className="heuristic-table" style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 6px" }}>
                <thead>
                  <tr style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.5 }}>
                    <th style={{ textAlign: "left", padding: "6px 12px" }}>Raw OCR</th>
                    <th style={{ textAlign: "left", padding: "6px 12px" }}>Normalized</th>
                    <th style={{ textAlign: "right", padding: "6px 12px" }}>Value</th>
                    <th style={{ textAlign: "left", padding: "6px 12px" }}>Unit</th>
                    <th style={{ textAlign: "left", padding: "6px 12px" }}>Ref Range</th>
                    <th style={{ textAlign: "center", padding: "6px 12px" }}>Correction</th>
                  </tr>
                </thead>
                <tbody>
                  {heuristicResults.map((r, i) => (
                    <tr key={i} className="neu">
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12, opacity: 0.6 }}>
                        {r.test_name.raw_ocr}
                      </td>
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>{r.test_name.normalized}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, fontFamily: "monospace" }}>
                        {r.value.normalized_value ?? r.value.raw_ocr}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, opacity: 0.6 }}>{r.value.unit}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12, fontFamily: "monospace" }}>
                        {r.reference_range.min != null && r.reference_range.max != null
                          ? `${r.reference_range.min} - ${r.reference_range.max}`
                          : r.reference_range.raw_ocr || "--"}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        {r.value.correction_applied && r.value.correction_applied !== "none" ? (
                          <span className="correction-badge" style={{
                            display: "inline-block", padding: "2px 10px", borderRadius: 6,
                            fontSize: 11, fontWeight: 700,
                            background: "#f9731622", color: "#f97316",
                          }}>
                            {r.value.correction_applied}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, opacity: 0.3 }}>--</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const RENDERERS: Record<Tab, () => React.JSX.Element> = {
    pipeline: renderPipeline,
    results: renderResults,
    diagnosis: renderDiagnosis,
    reference: renderReference,
    engines: renderEngines,
    compare: renderCompare,
    templates: renderTemplates,
    export: renderExport,
    gpu: renderGpu,
    benchmark: renderBenchmark,
    heuristics: renderHeuristics,
  };

  /* ---- Main render ---- */

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 20 }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontSize: 13 }}>
        <span style={{ cursor: "pointer", opacity: 0.5, display: "flex" }} onClick={onBack}>{Icon.back}</span>
        <span style={{ opacity: 0.3 }}>/</span>
        <span style={{ opacity: 0.5, cursor: "pointer" }} onClick={onBack}>Home</span>
        <span style={{ opacity: 0.3 }}>/</span>
        <span style={{ fontWeight: 600 }}>OCR Workbench</span>
      </div>

      <h2 style={{ marginBottom: 4 }}>OCR Workbench</h2>
      <p style={{ fontSize: 14, opacity: 0.5, marginBottom: 24 }}>
        Medical document OCR pipeline with intelligent classification and extraction
      </p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`chart-tab${tab === t.key ? " active" : ""}`}
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: tab === t.key ? 700 : 400,
              fontSize: 13,
              background: tab === t.key ? "#3b82f6" : "var(--glass, rgba(255,255,255,0.05))",
              color: tab === t.key ? "#fff" : "var(--fg, inherit)",
              border: tab === t.key ? "none" : "1px solid var(--glass-border, rgba(255,255,255,0.08))",
              transition: "background 0.2s, color 0.2s, transform 0.15s",
            }}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      {RENDERERS[tab]()}
    </div>
  );
}
