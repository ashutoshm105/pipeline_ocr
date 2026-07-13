import React, { useState, useRef } from "react";

interface Props {
  onBack: () => void;
  notify: (msg: string, type?: "success" | "error") => void;
}

type Tab = "experiments" | "pipeline" | "datasets" | "analysis" | "reports" | "collab" | "literature";

// ── Domain types ──────────────────────────────────────────────────────────────

interface Experiment {
  id: string; name: string; hypothesis: string; methodology: string;
  status: "draft" | "active" | "completed" | "archived";
  pi: string; startDate: string; endDate: string;
}

interface Dataset {
  id: string; name: string; type: "clinical" | "genomic" | "imaging" | "survey";
  records: number; dateRange: string; tags: string[];
}

interface TeamMember {
  name: string; role: "PI" | "Co-PI" | "Analyst" | "Reviewer"; avatar: string;
}

interface PubMedArticle {
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  pub_date: string;
  doi: string | null;
  url: string;
}

interface PubMedResponse {
  articles: PubMedArticle[];
  total: number;
}

// ── Static mock data (unchanged from original) ────────────────────────────────

const TABS: { key: Tab; label: string }[] = [
  { key: "experiments", label: "Experiments" },
  { key: "pipeline", label: "Pipeline Builder" },
  { key: "datasets", label: "Datasets" },
  { key: "analysis", label: "Analysis Workbench" },
  { key: "reports", label: "Reports" },
  { key: "collab", label: "Collaboration" },
  { key: "literature", label: "Literature Search" },
];

const MOCK_EXPERIMENTS: Experiment[] = [
  { id: "EXP-001", name: "BRCA2 Variant Response Study", hypothesis: "BRCA2 carriers show 40% better response to PARP inhibitors when combined with immunotherapy", methodology: "Double-blind RCT, N=480", status: "active", pi: "Dr. Sarah Chen", startDate: "2026-01-15", endDate: "2026-12-31" },
  { id: "EXP-002", name: "Gut Microbiome & IBD Correlation", hypothesis: "Specific Firmicutes/Bacteroidetes ratios predict IBD flare-ups 14 days in advance", methodology: "Longitudinal cohort, N=1200", status: "completed", pi: "Dr. James Okafor", startDate: "2025-06-01", endDate: "2026-05-30" },
  { id: "EXP-003", name: "mRNA Vaccine Thermal Stability", hypothesis: "Lipid nanoparticle formulation X maintains potency at 8C for 90 days", methodology: "Accelerated stability testing, ICH Q1A", status: "draft", pi: "Dr. Mei Lin", startDate: "2026-08-01", endDate: "2027-02-28" },
  { id: "EXP-004", name: "Alzheimer's Biomarker Panel", hypothesis: "Combined p-tau217 + GFAP panel achieves 95% sensitivity for early AD detection", methodology: "Cross-sectional diagnostic accuracy study, N=2000", status: "archived", pi: "Dr. Robert Vance", startDate: "2024-03-01", endDate: "2025-09-15" },
];

const MOCK_DATASETS: Dataset[] = [
  { id: "DS-001", name: "Phase III BRCA2 Trial Data", type: "clinical", records: 48200, dateRange: "2026-01 to 2026-06", tags: ["oncology", "PARP", "immunotherapy"] },
  { id: "DS-002", name: "WGS Tumor Profiles", type: "genomic", records: 3400, dateRange: "2025-08 to 2026-04", tags: ["WGS", "somatic", "variants"] },
  { id: "DS-003", name: "Retinal OCT Scans", type: "imaging", records: 15600, dateRange: "2025-01 to 2026-07", tags: ["ophthalmology", "OCT", "diabetic"] },
  { id: "DS-004", name: "IBD Patient Surveys", type: "survey", records: 8900, dateRange: "2025-06 to 2026-05", tags: ["IBD", "QoL", "PROMIS"] },
  { id: "DS-005", name: "Microbiome 16S rRNA Sequences", type: "genomic", records: 72000, dateRange: "2025-06 to 2026-05", tags: ["microbiome", "16S", "gut"] },
  { id: "DS-006", name: "Chest X-Ray COVID Cohort", type: "imaging", records: 42300, dateRange: "2024-01 to 2025-12", tags: ["radiology", "COVID-19", "pneumonia"] },
];

const TEAM: TeamMember[] = [
  { name: "Dr. Sarah Chen", role: "PI", avatar: "SC" },
  { name: "Dr. James Okafor", role: "Co-PI", avatar: "JO" },
  { name: "Priya Sharma", role: "Analyst", avatar: "PS" },
  { name: "Dr. Emily Park", role: "Reviewer", avatar: "EP" },
];

const PIPELINE_STAGES = [
  { name: "Data Source", desc: "Connect to EHR, LIMS, or file uploads", status: "complete" as const },
  { name: "OCR / Extract", desc: "Parse PDFs, lab reports, and images", status: "complete" as const },
  { name: "Clean / Transform", desc: "Normalize, deduplicate, impute", status: "running" as const },
  { name: "AI Analysis", desc: "LLM-powered entity extraction & NER", status: "pending" as const },
  { name: "Validation", desc: "Statistical checks & outlier detection", status: "pending" as const },
  { name: "Export", desc: "CDISC, FHIR, CSV, or warehouse sync", status: "pending" as const },
];

const ACTIVITY_FEED = [
  { user: "Dr. Sarah Chen", action: "updated experiment EXP-001 status to Active", time: "2 hours ago" },
  { user: "Priya Sharma", action: "uploaded 3,400 genomic records to DS-002", time: "5 hours ago" },
  { user: "Dr. James Okafor", action: "completed review of IBD Correlation study", time: "1 day ago" },
  { user: "Dr. Emily Park", action: "commented on Alzheimer's Biomarker methodology", time: "2 days ago" },
  { user: "Priya Sharma", action: "ran Clean/Transform pipeline on DS-004", time: "3 days ago" },
];

const COMMENTS = [
  { user: "Dr. Emily Park", text: "The p-tau217 threshold needs recalibration based on the new Simoa assay data.", time: "2 days ago", experiment: "EXP-004" },
  { user: "Dr. Sarah Chen", text: "Agreed. Let's also re-run the sensitivity analysis with the updated cutoff.", time: "1 day ago", experiment: "EXP-004" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const statusColor = (s: string) => {
  switch (s) {
    case "active": case "running": return "var(--success)";
    case "completed": case "complete": return "var(--accent)";
    case "draft": case "pending": return "var(--text-muted, #999)";
    case "archived": return "var(--warning, #e67e22)";
    default: return "var(--text-muted, #999)";
  }
};

/** Extract the first 1-3 meaningful medical/science keywords from a hypothesis string. */
function hypothesisKeywords(hypothesis: string): string {
  // Strip common stopwords and short words, keep capitalized terms and known acronyms
  const stopwords = new Set(["the", "a", "an", "and", "or", "of", "in", "at", "to", "for", "is", "are", "show", "shows", "when", "with", "combined", "better", "days", "advance", "specific", "ratios", "predict", "maintains", "potency", "achieves", "sensitivity", "early", "detection", "combined", "carriers"]);
  const words = hypothesis.split(/[\s,;.]+/).filter(w => w.length > 3 && !stopwords.has(w.toLowerCase()));
  return words.slice(0, 4).join(" ");
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const FlaskIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6M10 3v6.5L4 20h16L14 9.5V3"/><path d="M8.5 14h7"/></svg>
);
const PipeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h4v12H4zM16 6h4v12h-4zM8 12h8"/></svg>
);
const DatabaseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
);
const BrainIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a6 6 0 0 0-6 6c0 2 1 3.5 2 4.5V20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-7.5c1-1 2-2.5 2-4.5a6 6 0 0 0-6-6z"/><path d="M10 14h4"/><path d="M10 17h4"/></svg>
);
const FileIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
);
const UsersIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
);
const BookIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
);
const ArrowIcon = () => (
  <svg width="24" height="18" viewBox="0 0 24 18" fill="none" stroke="var(--text-muted, #999)" strokeWidth="2"><path d="M0 9h20M16 4l5 5-5 5"/></svg>
);
const GearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
);
const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
);
const ExternalLinkIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
);

const TAB_ICONS: Record<Tab, () => React.JSX.Element> = {
  experiments: FlaskIcon, pipeline: PipeIcon, datasets: DatabaseIcon,
  analysis: BrainIcon, reports: FileIcon, collab: UsersIcon, literature: BookIcon,
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ResearchPipeline({ onBack, notify }: Props) {
  const [tab, setTab] = useState<Tab>("experiments");

  // Datasets tab state
  const [dsSearch, setDsSearch] = useState("");
  const [dsFilter, setDsFilter] = useState<string>("all");

  // Analysis tab state
  const [model, setModel] = useState("claude");
  const [temperature, setTemperature] = useState("0.3");
  const [maxTokens, setMaxTokens] = useState("4096");
  const [systemPrompt, setSystemPrompt] = useState("You are a biomedical research assistant. Analyze the provided data and return structured findings with confidence scores.");
  const [analysisRun, setAnalysisRun] = useState(false);

  // Reports tab state
  const [reportTemplate, setReportTemplate] = useState("research-summary");

  // Experiments tab state
  const [newExpName, setNewExpName] = useState("");
  const [newExpHypo, setNewExpHypo] = useState("");

  // Literature / PubMed state
  const [litQuery, setLitQuery] = useState("");
  const [litLoading, setLitLoading] = useState(false);
  const [litError, setLitError] = useState<string | null>(null);
  const [litResults, setLitResults] = useState<PubMedResponse | null>(null);
  const litInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── PubMed API call ──────────────────────────────────────────────────────────

  const searchPubMed = async (query: string) => {
    const q = query.trim();
    if (!q) return;

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLitLoading(true);
    setLitError(null);
    setLitResults(null);

    try {
      const url = `/api/pubmed/search?query=${encodeURIComponent(q)}&limit=10`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`Server error ${res.status}: ${text}`);
      }
      const data: PubMedResponse = await res.json();
      setLitResults(data);
      notify(`Found ${data.total.toLocaleString()} articles for "${q}"`, "success");
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Unknown error";
      setLitError(msg);
      notify("PubMed search failed: " + msg, "error");
    } finally {
      setLitLoading(false);
    }
  };

  /** Switch to literature tab and pre-fill query from an experiment hypothesis. */
  const searchLiteratureForExp = (exp: Experiment) => {
    const kw = hypothesisKeywords(exp.hypothesis);
    setLitQuery(kw);
    setTab("literature");
    // Kick off the search after the tab renders
    setTimeout(() => searchPubMed(kw), 50);
  };

  // ── Datasets tab ─────────────────────────────────────────────────────────────

  const filteredDatasets = MOCK_DATASETS.filter(d => {
    const matchSearch = !dsSearch || d.name.toLowerCase().includes(dsSearch.toLowerCase()) || d.tags.some(t => t.toLowerCase().includes(dsSearch.toLowerCase()));
    const matchFilter = dsFilter === "all" || d.type === dsFilter;
    return matchSearch && matchFilter;
  });

  // ── Tab renderers ─────────────────────────────────────────────────────────────

  const renderExperiments = () => (
    <div>
      <div className="section-header"><div><h2>Experiment Manager</h2><div className="subtitle">Create and track research experiments</div></div></div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input className="neu-input" placeholder="Experiment name" value={newExpName} onChange={e => setNewExpName(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        <input className="neu-input" placeholder="Hypothesis" value={newExpHypo} onChange={e => setNewExpHypo(e.target.value)} style={{ flex: 2, minWidth: 220 }} />
        <button className="neu-btn" onClick={() => {
          if (!newExpName.trim()) return;
          notify("Experiment created: " + newExpName, "success");
          setNewExpName("");
          setNewExpHypo("");
        }}>+ Create</button>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {MOCK_EXPERIMENTS.map(exp => (
          <div key={exp.id} className="neu" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>{exp.name}</span>
                  <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 12, background: statusColor(exp.status) + "22", color: statusColor(exp.status), fontWeight: 600, textTransform: "capitalize" }}>{exp.status}</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary, #666)", marginTop: 4 }}>{exp.id} &middot; PI: {exp.pi}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted, #999)" }}>{exp.startDate} &rarr; {exp.endDate}</div>
                <button
                  className="neu-btn"
                  style={{ fontSize: 11, padding: "3px 10px", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}
                  onClick={() => searchLiteratureForExp(exp)}
                  title="Search PubMed for related literature"
                >
                  <BookIcon /> Search Literature
                </button>
              </div>
            </div>
            <div style={{ fontSize: 13, marginTop: 8, color: "var(--text-secondary, #666)" }}>
              <strong>H:</strong> {exp.hypothesis}
            </div>
            <div style={{ fontSize: 12, marginTop: 4, color: "var(--text-muted, #999)" }}>{exp.methodology}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderPipeline = () => (
    <div>
      <div className="section-header"><div><h2>Data Pipeline Builder</h2><div className="subtitle">Visual pipeline stages with status tracking</div></div></div>
      <div style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto", padding: "8px 0" }}>
        {PIPELINE_STAGES.map((stage, i) => (
          <div key={stage.name} style={{ display: "flex", alignItems: "center" }}>
            <div className="neu" style={{ padding: 16, minWidth: 150, position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: statusColor(stage.status), display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontWeight: 600, fontSize: 13 }}>{stage.name}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary, #666)" }}>{stage.desc}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <span style={{ fontSize: 11, textTransform: "capitalize", color: statusColor(stage.status) }}>{stage.status}</span>
                <button className="neu-btn" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => notify(`Configuring ${stage.name}`, "success")}><GearIcon /> Config</button>
              </div>
            </div>
            {i < PIPELINE_STAGES.length - 1 && <ArrowIcon />}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button className="neu-btn" onClick={() => notify("Pipeline execution started", "success")}>Run Pipeline</button>
        <button className="neu-btn" onClick={() => notify("Pipeline saved as template", "success")}>Save Template</button>
      </div>
    </div>
  );

  const renderDatasets = () => (
    <div>
      <div className="section-header"><div><h2>Dataset Browser</h2><div className="subtitle">Browse and filter research datasets</div></div></div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input className="neu-input" placeholder="Search datasets or tags..." value={dsSearch} onChange={e => setDsSearch(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <select className="neu-input" value={dsFilter} onChange={e => setDsFilter(e.target.value)} style={{ minWidth: 130 }}>
          <option value="all">All Types</option>
          <option value="clinical">Clinical</option>
          <option value="genomic">Genomic</option>
          <option value="imaging">Imaging</option>
          <option value="survey">Survey</option>
        </select>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {filteredDatasets.map(ds => (
          <div key={ds.id} className="neu" style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{ds.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted, #999)", marginTop: 2 }}>{ds.id} &middot; {ds.records.toLocaleString()} records &middot; {ds.dateRange}</div>
              <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                {ds.tags.map(t => <span key={t} style={{ fontSize: 11, padding: "1px 7px", borderRadius: 10, background: "var(--accent-soft, #e8f0fe)", color: "var(--accent, #1a73e8)" }}>{t}</span>)}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 10, background: statusColor(ds.type === "clinical" ? "active" : ds.type === "genomic" ? "completed" : "draft") + "22", color: statusColor(ds.type === "clinical" ? "active" : ds.type === "genomic" ? "completed" : "draft"), textTransform: "capitalize" }}>{ds.type}</span>
              <button className="neu-btn" style={{ fontSize: 11, padding: "2px 10px" }} onClick={() => notify(`Opening ${ds.name}`, "success")}>View</button>
            </div>
          </div>
        ))}
        {filteredDatasets.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted, #999)" }}>No datasets match your search.</div>}
      </div>
    </div>
  );

  const renderAnalysis = () => (
    <div>
      <div className="section-header"><div><h2>Analysis Workbench</h2><div className="subtitle">Configure and run AI-powered analysis</div></div></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="neu" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Parameters</h3>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Model</label>
          <select className="neu-input" value={model} onChange={e => setModel(e.target.value)} style={{ width: "100%", marginBottom: 10 }}>
            <option value="gpt-4">GPT-4</option>
            <option value="gemini">Gemini</option>
            <option value="claude">Claude</option>
            <option value="llama">Llama</option>
            <option value="custom">Custom</option>
          </select>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Temperature: {temperature}</label>
          <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={e => setTemperature(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />
          <label style={{ fontSize: 12, fontWeight: 600 }}>Max Tokens</label>
          <input className="neu-input" type="number" value={maxTokens} onChange={e => setMaxTokens(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />
          <label style={{ fontSize: 12, fontWeight: 600 }}>System Prompt</label>
          <textarea className="neu-input" rows={4} value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} style={{ width: "100%", resize: "vertical", marginBottom: 10 }} />
          <button className="neu-btn" onClick={() => { setAnalysisRun(true); notify("Analysis started with " + model, "success"); }}>Run Analysis</button>
        </div>
        <div className="neu" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Results</h3>
          {!analysisRun ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted, #999)" }}>Configure parameters and run analysis to see results.</div>
          ) : (
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              <div style={{ padding: 8, marginBottom: 8, borderRadius: 8, background: "var(--success-soft, #e6f9e6)" }}>
                <strong>Status:</strong> Complete &middot; 3.2s &middot; 2,847 tokens
              </div>
              <div style={{ marginBottom: 8 }}><strong>Entities Extracted:</strong> 47 drug compounds, 12 gene targets, 8 adverse events</div>
              <div style={{ marginBottom: 8 }}><strong>Key Finding:</strong> Compound AZD-4573 shows statistically significant (p&lt;0.01) inhibition of CDK9 phosphorylation in 78% of tested cell lines. Cross-referencing with genomic dataset DS-002 confirms BRCA2-mutant lines show 2.3x enhanced sensitivity.</div>
              <div style={{ marginBottom: 8 }}><strong>Confidence:</strong> 0.92</div>
              <div><strong>Recommendations:</strong> Expand cohort to validate CDK9 pathway interaction. Consider combination therapy arm in next trial phase.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderReports = () => {
    const templates = [
      { key: "research-summary", label: "Research Summary" },
      { key: "safety-report", label: "Safety Report" },
      { key: "efficacy-analysis", label: "Efficacy Analysis" },
      { key: "regulatory-submission", label: "Regulatory Submission" },
    ];
    const sectionsByTemplate: Record<string, { title: string; content: string }[]> = {
      "research-summary": [
        { title: "Executive Summary", content: "The BRCA2 Variant Response Study (EXP-001) has completed enrollment of 480 participants across 12 sites. Interim analysis at 6 months shows promising efficacy signals in the combination therapy arm." },
        { title: "Methodology", content: "Double-blind, randomized controlled trial comparing PARP inhibitor monotherapy vs. PARP inhibitor + anti-PD-L1 immunotherapy in BRCA2 mutation carriers with advanced ovarian cancer." },
        { title: "Preliminary Results", content: "Objective response rate: 62% (combination) vs. 41% (monotherapy), p=0.003. Median PFS not yet reached in combination arm. Grade 3+ AEs: 28% vs. 22%." },
      ],
      "safety-report": [
        { title: "Safety Overview", content: "Total adverse events reported: 847. Serious adverse events: 34 (7.1%). No treatment-related deaths. Most common AE: fatigue (45%), nausea (38%), anemia (31%)." },
        { title: "Signal Detection", content: "No new safety signals identified. Hepatotoxicity monitoring shows all ALT/AST values within 3x ULN. Cardiac monitoring (QTc) shows no prolongation." },
      ],
      "efficacy-analysis": [
        { title: "Primary Endpoint", content: "Progression-free survival (PFS) at 12 months: 71.2% (95% CI: 64.8-77.6) in combination arm vs. 52.1% (95% CI: 45.3-58.9) in monotherapy arm. HR=0.58 (p<0.001)." },
        { title: "Biomarker Correlation", content: "PD-L1 expression (CPS >= 10) correlates with enhanced combination benefit (HR=0.41 vs. HR=0.72 for CPS < 10). HRD score > 42 also predicts benefit." },
      ],
      "regulatory-submission": [
        { title: "Regulatory Context", content: "This submission supports a supplemental NDA for the combination indication. The application includes data from the pivotal Phase III trial (EXP-001) and supportive Phase II data." },
        { title: "CMC Summary", content: "No changes to the active substance manufacturing process. Updated stability data confirms 36-month shelf life under recommended storage conditions." },
      ],
    };
    const sections = sectionsByTemplate[reportTemplate] || [];
    return (
      <div>
        <div className="section-header"><div><h2>Report Generator</h2><div className="subtitle">Generate regulatory and research reports</div></div></div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {templates.map(t => (
            <button key={t.key} className={`chart-tab${reportTemplate === t.key ? " active" : ""}`} onClick={() => setReportTemplate(t.key)}>{t.label}</button>
          ))}
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          {sections.map((s, i) => (
            <div key={i} className="neu" style={{ padding: 16 }}>
              <h3 style={{ fontSize: 14, marginBottom: 8 }}>{s.title}</h3>
              <div style={{ fontSize: 13, color: "var(--text-secondary, #666)", lineHeight: 1.6 }}>{s.content}</div>
              <button className="neu-btn" style={{ marginTop: 8, fontSize: 11, padding: "2px 10px" }} onClick={() => notify(`Editing: ${s.title}`, "success")}>Edit</button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="neu-btn" onClick={() => notify("Exported as PDF", "success")}>Export PDF</button>
          <button className="neu-btn" onClick={() => notify("Exported as CSV", "success")}>Export CSV</button>
        </div>
      </div>
    );
  };

  const renderCollab = () => (
    <div>
      <div className="section-header"><div><h2>Collaboration</h2><div className="subtitle">Team members, activity, and discussions</div></div></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Team Members</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {TEAM.map(m => (
              <div key={m.name} className="neu" style={{ padding: 12, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--accent-soft, #e8f0fe)", color: "var(--accent, #1a73e8)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{m.avatar}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted, #999)" }}>{m.role}</div>
                </div>
              </div>
            ))}
          </div>
          <h3 style={{ fontSize: 14, marginTop: 16, marginBottom: 10 }}>Comments</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {COMMENTS.map((c, i) => (
              <div key={i} className="neu" style={{ padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <strong>{c.user}</strong>
                  <span style={{ color: "var(--text-muted, #999)" }}>{c.time} &middot; {c.experiment}</span>
                </div>
                <div style={{ fontSize: 13, marginTop: 4, color: "var(--text-secondary, #666)" }}>{c.text}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Activity Feed</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {ACTIVITY_FEED.map((a, i) => (
              <div key={i} className="neu" style={{ padding: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent, #1a73e8)", marginTop: 5, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13 }}><strong>{a.user}</strong> {a.action}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted, #999)", marginTop: 2 }}>{a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ── Literature Search tab ──────────────────────────────────────────────────────

  const renderLiterature = () => {
    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      searchPubMed(litQuery);
    };

    return (
      <div>
        {/* Header */}
        <div className="section-header">
          <div>
            <h2>Literature Search</h2>
            <div className="subtitle">
              Search PubMed for peer-reviewed biomedical literature
            </div>
          </div>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted, #999)", pointerEvents: "none" }}>
              <SearchIcon />
            </span>
            <input
              ref={litInputRef}
              className="neu-input"
              placeholder="e.g. BRCA2 PARP inhibitor immunotherapy"
              value={litQuery}
              onChange={e => setLitQuery(e.target.value)}
              style={{ width: "100%", paddingLeft: 38, boxSizing: "border-box" }}
              autoFocus
            />
          </div>
          <button
            type="submit"
            className="neu-btn"
            disabled={litLoading || !litQuery.trim()}
            style={{ minWidth: 100, display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}
          >
            {litLoading
              ? <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid var(--accent, #1a73e8)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              : <SearchIcon />}
            {litLoading ? "Searching…" : "Search"}
          </button>
        </form>

        {/* Quick-search chips from experiments */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted, #999)", marginBottom: 6 }}>Quick search from experiments:</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {MOCK_EXPERIMENTS.map(exp => {
              const kw = hypothesisKeywords(exp.hypothesis);
              return (
                <button
                  key={exp.id}
                  className="neu-btn"
                  style={{ fontSize: 11, padding: "3px 10px" }}
                  onClick={() => { setLitQuery(kw); searchPubMed(kw); }}
                >
                  {exp.id}: {kw}
                </button>
              );
            })}
          </div>
        </div>

        {/* Error state */}
        {litError && (
          <div className="neu" style={{ padding: 16, borderLeft: "3px solid var(--error, #e74c3c)", marginBottom: 16 }}>
            <div style={{ fontWeight: 600, color: "var(--error, #e74c3c)", marginBottom: 4 }}>Search failed</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary, #666)" }}>{litError}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted, #999)", marginTop: 8 }}>
              Make sure the backend is running and <code>/api/pubmed/search</code> is reachable.
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {litLoading && (
          <div style={{ display: "grid", gap: 12 }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="neu" style={{ padding: 18 }}>
                <div style={{ height: 14, background: "var(--border, #e0e0e0)", borderRadius: 6, marginBottom: 10, width: "70%", animation: "pulse 1.2s ease-in-out infinite" }} />
                <div style={{ height: 11, background: "var(--border, #e0e0e0)", borderRadius: 6, marginBottom: 6, width: "50%", animation: "pulse 1.2s ease-in-out infinite" }} />
                <div style={{ height: 11, background: "var(--border, #e0e0e0)", borderRadius: 6, width: "40%", animation: "pulse 1.2s ease-in-out infinite" }} />
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {!litLoading && litResults && (
          <>
            <div style={{ fontSize: 13, color: "var(--text-muted, #999)", marginBottom: 12 }}>
              Showing {litResults.articles.length} of <strong>{litResults.total.toLocaleString()}</strong> articles for <em>"{litQuery}"</em>
            </div>
            {litResults.articles.length === 0 ? (
              <div className="neu" style={{ padding: 32, textAlign: "center", color: "var(--text-muted, #999)" }}>
                No articles found for this query. Try broader terms.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {litResults.articles.map(article => (
                  <ArticleCard key={article.pmid} article={article} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Empty / idle state */}
        {!litLoading && !litResults && !litError && (
          <div className="neu" style={{ padding: 40, textAlign: "center", color: "var(--text-muted, #999)" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>
              <BookIcon />
            </div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Search PubMed</div>
            <div style={{ fontSize: 13 }}>Enter a query above or click a quick-search chip from your experiments.</div>
          </div>
        )}

        {/* CSS animations */}
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        `}</style>
      </div>
    );
  };

  // ── Article card sub-component ────────────────────────────────────────────────

  const ArticleCard = ({ article }: { article: PubMedArticle }) => {
    const authorList = article.authors.length > 0
      ? article.authors.slice(0, 3).join(", ") + (article.authors.length > 3 ? ` +${article.authors.length - 3} more` : "")
      : "Authors unavailable";

    return (
      <div className="neu" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Title */}
            <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.4, marginBottom: 6 }}>
              {article.title}
            </div>
            {/* Authors */}
            <div style={{ fontSize: 12, color: "var(--text-secondary, #666)", marginBottom: 4 }}>
              {authorList}
            </div>
            {/* Journal + date */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: "var(--text-muted, #999)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 10 }}>&#128240;</span> {article.journal}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 10 }}>&#128197;</span> {article.pub_date}
              </span>
              {article.doi && (
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 10 }}>DOI:</span>
                  <span style={{ fontFamily: "monospace", fontSize: 11 }}>{article.doi}</span>
                </span>
              )}
            </div>
          </div>
          {/* Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted, #999)", background: "var(--bg-secondary, #f5f5f5)", padding: "2px 8px", borderRadius: 10 }}>
              PMID {article.pmid}
            </span>
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 12, padding: "4px 12px", borderRadius: 8,
                background: "var(--accent-soft, #e8f0fe)", color: "var(--accent, #1a73e8)",
                textDecoration: "none", fontWeight: 600,
              }}
            >
              Read on PubMed <ExternalLinkIcon />
            </a>
          </div>
        </div>
      </div>
    );
  };

  // ── Route tabs to renderers ───────────────────────────────────────────────────

  const RENDERERS: Record<Tab, () => React.JSX.Element> = {
    experiments: renderExperiments,
    pipeline: renderPipeline,
    datasets: renderDatasets,
    analysis: renderAnalysis,
    reports: renderReports,
    collab: renderCollab,
    literature: renderLiterature,
  };

  return (
    <div className="page-enter">
      <div className="breadcrumb">
        <button onClick={onBack}>Home</button>
        <span className="sep">/</span>
        <span>Research Pipeline</span>
      </div>

      <div className="section-header">
        <div>
          <h1>Research Pipeline</h1>
          <div className="subtitle">Experiment management, data pipelines, and AI-powered analysis</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
        {TABS.map(t => {
          const Icon = TAB_ICONS[t.key];
          return (
            <button
              key={t.key}
              className={`chart-tab${tab === t.key ? " active" : ""}`}
              onClick={() => setTab(t.key)}
              style={{ display: "flex", alignItems: "center", gap: 5 }}
            >
              <Icon /> {t.label}
            </button>
          );
        })}
      </div>

      {RENDERERS[tab]()}
    </div>
  );
}
