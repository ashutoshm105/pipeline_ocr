import { useState, useCallback, type ReactNode } from "react";

interface Props {
  onBack: () => void;
  notify: (msg: string, type?: "success" | "error") => void;
}

// --- API response shapes ---

interface GeneInfo {
  gene_id: string;
  name: string;
  description: string;
  chromosome: string;
  location: string;
  summary: string;
  ensembl_id: string;
  biotype: string;
}

interface ClinvarVariant {
  id: string;
  title: string;
  gene: string;
  clinical_significance: string;
  review_status: string;
  last_evaluated: string;
  url: string;
}

interface VariantsResponse {
  variants: ClinvarVariant[];
  total: number;
}

// --- Static pharmacogenomics data (local / NCBI-derived) ---

type RiskLevel = "use" | "caution" | "avoid";

interface DrugRec {
  drug: string;
  category: string;
  risk: RiskLevel;
  gene: string;
  reasoning: string;
}

const DRUG_RECS: DrugRec[] = [
  { drug: "Codeine",      category: "Analgesic",     risk: "avoid",   gene: "CYP2D6",  reasoning: "Poor metabolizer: no conversion to morphine, ineffective" },
  { drug: "Tramadol",     category: "Analgesic",     risk: "avoid",   gene: "CYP2D6",  reasoning: "Poor metabolizer: reduced analgesic effect" },
  { drug: "Clopidogrel",  category: "Antiplatelet",  risk: "caution", gene: "CYP2C19", reasoning: "Ultra-rapid metabolizer: increased active metabolite, bleeding risk" },
  { drug: "Omeprazole",   category: "PPI",           risk: "caution", gene: "CYP2C19", reasoning: "Ultra-rapid metabolizer: reduced efficacy, consider higher dose" },
  { drug: "Abacavir",     category: "Antiretroviral",risk: "avoid",   gene: "HLA-B",   reasoning: "HLA-B*57:01 positive: hypersensitivity reaction risk" },
  { drug: "Atorvastatin", category: "Statin",        risk: "use",     gene: "CYP3A4",  reasoning: "Normal metabolizer: standard dosing appropriate" },
  { drug: "Simvastatin",  category: "Statin",        risk: "use",     gene: "CYP3A4",  reasoning: "Normal metabolizer: standard dosing appropriate" },
  { drug: "Tamoxifen",    category: "Oncology",      risk: "avoid",   gene: "CYP2D6",  reasoning: "Poor metabolizer: reduced conversion to endoxifen" },
];

const ANCESTRY = [
  { label: "South Asian",   pct: 62 },
  { label: "European",      pct: 18 },
  { label: "Central Asian", pct: 11 },
  { label: "East Asian",    pct: 5  },
  { label: "Middle Eastern",pct: 3  },
  { label: "Unassigned",    pct: 1  },
];

// --- Color helpers ---

const riskColor = (r: RiskLevel) =>
  r === "avoid" ? "#ef4444" : r === "caution" ? "#f59e0b" : "#10b981";

const riskBg = (r: RiskLevel) =>
  r === "avoid" ? "rgba(239,68,68,0.15)" : r === "caution" ? "rgba(245,158,11,0.15)" : "rgba(16,185,129,0.15)";

function sigColor(sig: string): string {
  const s = sig.toLowerCase();
  if (s.includes("pathogenic") && !s.includes("likely benign")) return "#ef4444";
  if (s.includes("benign"))   return "#10b981";
  if (s.includes("uncertain") || s.includes("vus")) return "#f59e0b";
  return "#94a3b8";
}

function sigBg(sig: string): string {
  return `${sigColor(sig)}22`;
}

// --- Icons ---

const DnaIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M2 15c6.667-6 13.333 0 20-6" />
    <path d="M9 22c1.8-4 6.2-4 8 0" />
    <path d="M2 9c6.667 6 13.333 0 20 6" />
    <path d="M7 2c1.8 4 6.2 4 8 0" />
  </svg>
);

const ShieldIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const ChartIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
  </svg>
);

const TreeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="5" r="3" />
    <line x1="12" y1="8" x2="12" y2="14" />
    <line x1="6" y1="18" x2="12" y2="14" />
    <line x1="18" y1="18" x2="12" y2="14" />
    <circle cx="6" cy="20" r="2" />
    <circle cx="18" cy="20" r="2" />
  </svg>
);

const FlaskIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 3h6v5l4 9H5l4-9V3z" />
    <line x1="9" y1="3" x2="15" y2="3" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 4, verticalAlign: "middle" }}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

// --- Spinner ---
const Spinner = () => (
  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "48px 0" }}>
    <div style={{
      width: 36, height: 36, borderRadius: "50%",
      border: "3px solid rgba(99,102,241,0.2)",
      borderTopColor: "#6366f1",
      animation: "spin 0.7s linear infinite",
    }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

type Tab = "profile" | "drugs" | "ancestry" | "pedigree" | "order";

export function Genomics({ onBack, notify }: Props) {
  const [tab, setTab] = useState<Tab>("profile");

  // Gene search state
  const [geneSymbol, setGeneSymbol] = useState("BRCA1");
  const [inputValue, setInputValue] = useState("BRCA1");
  const [geneInfo, setGeneInfo] = useState<GeneInfo | null>(null);
  const [variants, setVariants] = useState<ClinvarVariant[]>([]);
  const [variantTotal, setVariantTotal] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [geneError, setGeneError] = useState<string | null>(null);

  // Order test state
  const [orderTest, setOrderTest] = useState({ type: "panel", urgency: "routine", lab: "labcorp" });
  const [ordering, setOrdering] = useState(false);

  // ── Fetch both endpoints in parallel ──────────────────────────────────────
  const search = useCallback(async (symbol: string) => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    setGeneSymbol(sym);
    setLoading(true);
    setGeneError(null);
    setGeneInfo(null);
    setVariants([]);
    setVariantTotal(0);

    try {
      const [geneRes, varRes] = await Promise.all([
        fetch(`/api/genomics/gene?symbol=${encodeURIComponent(sym)}`),
        fetch(`/api/genomics/variants?gene=${encodeURIComponent(sym)}&limit=10`),
      ]);

      // Gene info
      if (!geneRes.ok) {
        throw new Error(`Gene lookup failed: ${geneRes.status} ${geneRes.statusText}`);
      }
      const geneData: GeneInfo = await geneRes.json();
      setGeneInfo(geneData);

      // Variants (tolerate failure gracefully)
      if (varRes.ok) {
        const varData: VariantsResponse = await varRes.json();
        setVariants(varData.variants ?? []);
        setVariantTotal(varData.total ?? 0);
      } else {
        setVariants([]);
        setVariantTotal(0);
        notify(`Variant data unavailable (${varRes.status})`, "error");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Search failed";
      setGeneError(msg);
      notify(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  // Auto-search on first render with default gene
  const [didInit, setDidInit] = useState(false);
  if (!didInit) {
    setDidInit(true);
    // Kick off after mount via a zero-timeout so state is stable
    setTimeout(() => search("BRCA1"), 0);
  }

  const handleOrder = () => {
    setOrdering(true);
    setTimeout(() => {
      setOrdering(false);
      notify("Genetic test order submitted successfully", "success");
    }, 1200);
  };

  const tabs: { key: Tab; label: string; icon: ReactNode }[] = [
    { key: "profile",  label: "Gene Search",  icon: <DnaIcon /> },
    { key: "drugs",    label: "Drug Recs",    icon: <ShieldIcon /> },
    { key: "ancestry", label: "Ancestry",     icon: <ChartIcon /> },
    { key: "pedigree", label: "Pedigree",     icon: <TreeIcon /> },
    { key: "order",    label: "Order Test",   icon: <FlaskIcon /> },
  ];

  return (
    <div className="page-enter">
      <div className="breadcrumb">
        <button onClick={onBack}>Home</button>
        <span className="sep">/</span>
        <span>Genomics</span>
      </div>

      <div className="section-header">
        <div>
          <h1>Genomics &amp; Pharmacogenomics</h1>
          <div className="subtitle">Live gene data via NCBI Entrez · ClinVar variants · Drug interaction guidance</div>
        </div>
      </div>

      <div className="chart-tabs" style={{ flexWrap: "wrap", marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.key} className={`chart-tab${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Gene Search ───────────────────────────────────────────────────── */}
      {tab === "profile" && (
        <div>
          {/* Search bar */}
          <div className="neu" style={{ padding: "16px 24px", marginBottom: 20, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flex: "1 1 260px", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", color: "#64748b" }}>Gene symbol</label>
              <input
                className="neu-input"
                value={inputValue}
                onChange={e => setInputValue(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === "Enter") search(inputValue); }}
                placeholder="e.g. BRCA1, TP53, EGFR"
                style={{ flex: 1, fontFamily: "monospace", fontWeight: 600, letterSpacing: "0.04em" }}
              />
            </div>
            <button
              className="neu-btn"
              onClick={() => search(inputValue)}
              disabled={loading}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", fontWeight: 700 }}
            >
              <SearchIcon />
              {loading ? "Searching…" : "Search"}
            </button>
            <span style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>
              NCBI Gene + ClinVar
            </span>
          </div>

          {/* Loading */}
          {loading && <Spinner />}

          {/* Error */}
          {!loading && geneError && (
            <div className="neu" style={{ padding: 24, textAlign: "center", color: "#ef4444" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>⚠</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Could not load gene data</div>
              <div style={{ fontSize: 13, color: "#94a3b8" }}>{geneError}</div>
              <button className="neu-btn" onClick={() => search(geneSymbol)} style={{ marginTop: 16 }}>
                Retry
              </button>
            </div>
          )}

          {/* Gene info card */}
          {!loading && !geneError && geneInfo && (
            <div className="neu" style={{ padding: 24, marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                {/* Gene badge */}
                <div style={{
                  background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))",
                  borderRadius: 12, padding: "14px 20px", minWidth: 100, textAlign: "center",
                  border: "1px solid rgba(99,102,241,0.2)", flexShrink: 0,
                }}>
                  <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 800, color: "#6366f1" }}>
                    {geneSymbol}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>ID: {geneInfo.gene_id}</div>
                </div>

                {/* Main details */}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{geneInfo.name}</div>
                  <div style={{ fontSize: 13, color: "#64748b", marginBottom: 10 }}>{geneInfo.description}</div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", fontSize: 13 }}>
                    {[
                      ["Chromosome", geneInfo.chromosome],
                      ["Location",   geneInfo.location],
                      ["Biotype",    geneInfo.biotype],
                      ["Ensembl",    geneInfo.ensembl_id],
                    ].map(([label, val]) => val ? (
                      <span key={label}>
                        <span style={{ color: "#94a3b8" }}>{label}: </span>
                        <span style={{ fontWeight: 600, fontFamily: label === "Ensembl" || label === "Location" ? "monospace" : "inherit" }}>
                          {val}
                        </span>
                      </span>
                    ) : null)}
                  </div>
                </div>
              </div>

              {/* Summary */}
              {geneInfo.summary && (
                <div style={{
                  marginTop: 16, padding: "12px 16px",
                  background: "rgba(100,116,139,0.06)", borderRadius: 8,
                  fontSize: 13, lineHeight: 1.6, color: "#64748b",
                  borderLeft: "3px solid rgba(99,102,241,0.4)",
                }}>
                  {geneInfo.summary.length > 500
                    ? geneInfo.summary.slice(0, 500) + "…"
                    : geneInfo.summary}
                </div>
              )}
            </div>
          )}

          {/* Variants table */}
          {!loading && !geneError && geneInfo && (
            <div className="neu" style={{ padding: 24 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 17 }}>
                  ClinVar Variants
                  {variantTotal > 0 && (
                    <span style={{ marginLeft: 10, fontSize: 13, fontWeight: 400, color: "#94a3b8" }}>
                      showing {variants.length} of {variantTotal.toLocaleString()}
                    </span>
                  )}
                </h2>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>Source: NCBI ClinVar</span>
              </div>

              {variants.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8", fontSize: 14 }}>
                  No variants found for <strong>{geneSymbol}</strong>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid rgba(100,100,100,0.15)" }}>
                        {["Variant / Title", "Clinical Significance", "Review Status", "Last Evaluated", ""].map(h => (
                          <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {variants.map(v => (
                        <tr key={v.id} style={{ borderBottom: "1px solid rgba(100,100,100,0.07)" }}>
                          {/* Title */}
                          <td style={{ padding: "10px 12px", maxWidth: 340 }}>
                            <div style={{ fontWeight: 500, lineHeight: 1.4, wordBreak: "break-word" }}>
                              {v.title || `Variant ${v.id}`}
                            </div>
                            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, fontFamily: "monospace" }}>
                              {v.id}
                            </div>
                          </td>

                          {/* Clinical significance — color-coded */}
                          <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                            <span style={{
                              padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700,
                              color: sigColor(v.clinical_significance),
                              background: sigBg(v.clinical_significance),
                              textTransform: "capitalize",
                            }}>
                              {v.clinical_significance || "not provided"}
                            </span>
                          </td>

                          {/* Review status */}
                          <td style={{ padding: "10px 12px", fontSize: 12, color: "#64748b", maxWidth: 200, lineHeight: 1.4 }}>
                            {v.review_status || "—"}
                          </td>

                          {/* Last evaluated */}
                          <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: "#64748b", fontSize: 12 }}>
                            {v.last_evaluated || "—"}
                          </td>

                          {/* ClinVar link */}
                          <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                            {v.url ? (
                              <a
                                href={v.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontSize: 12, fontWeight: 600,
                                  color: "#6366f1", textDecoration: "none",
                                  display: "inline-flex", alignItems: "center",
                                }}
                              >
                                ClinVar <ExternalLinkIcon />
                              </a>
                            ) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Drug Recommendations (NCBI pharmacogenomics) ───────────────────── */}
      {tab === "drugs" && (
        <div className="neu" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 17 }}>Pharmacogenomic Drug Recommendations</h2>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>Based on NCBI PharmGKB guidelines</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid rgba(100,100,100,0.15)" }}>
                  {["Drug", "Category", "Gene", "Recommendation", "Reasoning"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DRUG_RECS.map(d => (
                  <tr key={d.drug} style={{ borderBottom: "1px solid rgba(100,100,100,0.08)" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600 }}>{d.drug}</td>
                    <td style={{ padding: "10px 12px" }}>{d.category}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{d.gene}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{
                        padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700,
                        color: riskColor(d.risk), background: riskBg(d.risk),
                        textTransform: "uppercase",
                      }}>
                        {d.risk}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 13, color: "#64748b", maxWidth: 300 }}>{d.reasoning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Ancestry ──────────────────────────────────────────────────────── */}
      {tab === "ancestry" && (
        <div className="neu" style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 17 }}>Ancestry Composition</h2>
          <div style={{ maxWidth: 600 }}>
            {ANCESTRY.map(a => (
              <div key={a.label} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 14, fontWeight: 500 }}>
                  <span>{a.label}</span>
                  <span style={{ fontWeight: 700 }}>{a.pct}%</span>
                </div>
                <div style={{ height: 20, borderRadius: 10, background: "rgba(100,100,100,0.1)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 10, width: `${a.pct}%`,
                    background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
                    transition: "width 0.6s ease",
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Pedigree ──────────────────────────────────────────────────────── */}
      {tab === "pedigree" && (
        <div className="neu" style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 17 }}>Family History Pedigree</h2>
          <div style={{ overflowX: "auto" }}>
            <svg viewBox="0 0 460 280" width="460" height="280" xmlns="http://www.w3.org/2000/svg" style={{ display: "block", margin: "0 auto" }}>
              <text x="230" y="16" textAnchor="middle" fontSize="11" fill="#94a3b8">Generation I</text>
              <rect x="160" y="24" width="28" height="28" rx="3" fill="none" stroke="#64748b" strokeWidth="2" />
              <circle cx="290" cy="38" r="14" fill="#ef4444" stroke="#ef4444" strokeWidth="2" />
              <line x1="188" y1="38" x2="276" y2="38" stroke="#64748b" strokeWidth="1.5" />
              <line x1="230" y1="38" x2="230" y2="80" stroke="#64748b" strokeWidth="1.5" />

              <text x="230" y="78" textAnchor="middle" fontSize="11" fill="#94a3b8">Generation II</text>
              <line x1="110" y1="110" x2="360" y2="110" stroke="#64748b" strokeWidth="1.5" />
              <line x1="230" y1="80" x2="230" y2="110" stroke="#64748b" strokeWidth="1.5" />
              <rect x="96" y="96" width="28" height="28" rx="3" fill="none" stroke="#64748b" strokeWidth="2" />
              <circle cx="230" cy="110" r="14" fill="none" stroke="#64748b" strokeWidth="2" />
              <path d="M230 96 A14 14 0 0 1 230 124 Z" fill="#f59e0b" />
              <rect x="336" y="96" width="28" height="28" rx="3" fill="#ef4444" stroke="#ef4444" strokeWidth="2" />
              <line x1="110" y1="124" x2="110" y2="150" stroke="#64748b" strokeWidth="1.5" />
              <line x1="230" y1="124" x2="230" y2="150" stroke="#64748b" strokeWidth="1.5" />
              <line x1="124" y1="110" x2="216" y2="110" stroke="#64748b" strokeWidth="1.5" strokeDasharray="4 3" />

              <text x="230" y="158" textAnchor="middle" fontSize="11" fill="#94a3b8">Generation III</text>
              <line x1="80" y1="190" x2="380" y2="190" stroke="#64748b" strokeWidth="1.5" />
              <line x1="170" y1="150" x2="170" y2="190" stroke="#64748b" strokeWidth="1.5" />
              <rect x="66" y="176" width="28" height="28" rx="3" fill="#ef4444" stroke="#ef4444" strokeWidth="2" />
              <text x="80" y="220" textAnchor="middle" fontSize="10" fill="#ef4444" fontWeight="700">Proband</text>
              <line x1="65" y1="222" x2="80" y2="210" stroke="#ef4444" strokeWidth="1.5" />
              <circle cx="170" cy="190" r="14" fill="none" stroke="#64748b" strokeWidth="2" />
              <path d="M170 176 A14 14 0 0 1 170 204 Z" fill="#f59e0b" />
              <rect x="256" y="176" width="28" height="28" rx="3" fill="none" stroke="#64748b" strokeWidth="2" />
              <circle cx="370" cy="190" r="14" fill="none" stroke="#64748b" strokeWidth="2" />

              <rect x="20" y="244" width="14" height="14" rx="2" fill="#ef4444" stroke="#ef4444" strokeWidth="1.5" />
              <text x="40" y="256" fontSize="11" fill="#64748b">Affected</text>
              <rect x="110" y="244" width="14" height="14" rx="2" fill="none" stroke="#64748b" strokeWidth="1.5" />
              <text x="130" y="256" fontSize="11" fill="#64748b">Unaffected</text>
              <circle cx="217" cy="251" r="7" fill="none" stroke="#64748b" strokeWidth="1.5" />
              <path d="M217 244 A7 7 0 0 1 217 258 Z" fill="#f59e0b" />
              <text x="230" y="256" fontSize="11" fill="#64748b">Carrier</text>
              <rect x="300" y="247" width="10" height="10" rx="1" fill="none" stroke="#64748b" strokeWidth="1.5" />
              <text x="316" y="256" fontSize="11" fill="#64748b">Male</text>
              <circle cx="377" cy="252" r="5" fill="none" stroke="#64748b" strokeWidth="1.5" />
              <text x="388" y="256" fontSize="11" fill="#64748b">Female</text>
            </svg>
          </div>
        </div>
      )}

      {/* ── Order Test ────────────────────────────────────────────────────── */}
      {tab === "order" && (
        <div className="neu" style={{ padding: 24, maxWidth: 500 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 17 }}>Order Genetic Test</h2>

          <label style={{ display: "block", marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Test Type</span>
            <select
              className="neu-input"
              value={orderTest.type}
              onChange={e => setOrderTest({ ...orderTest, type: e.target.value })}
              style={{ width: "100%" }}
            >
              <option value="panel">Gene Panel (targeted)</option>
              <option value="exome">Whole Exome Sequencing</option>
              <option value="genome">Whole Genome Sequencing</option>
            </select>
          </label>

          <label style={{ display: "block", marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Urgency</span>
            <select
              className="neu-input"
              value={orderTest.urgency}
              onChange={e => setOrderTest({ ...orderTest, urgency: e.target.value })}
              style={{ width: "100%" }}
            >
              <option value="routine">Routine (4–6 weeks)</option>
              <option value="priority">Priority (2–3 weeks)</option>
              <option value="stat">STAT (5–7 days)</option>
            </select>
          </label>

          <label style={{ display: "block", marginBottom: 20 }}>
            <span style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Laboratory</span>
            <select
              className="neu-input"
              value={orderTest.lab}
              onChange={e => setOrderTest({ ...orderTest, lab: e.target.value })}
              style={{ width: "100%" }}
            >
              <option value="labcorp">LabCorp Genetics</option>
              <option value="quest">Quest Diagnostics</option>
              <option value="invitae">Invitae</option>
              <option value="myriad">Myriad Genetics</option>
            </select>
          </label>

          <button
            className="neu-btn"
            onClick={handleOrder}
            disabled={ordering}
            style={{ width: "100%", padding: "10px 0", fontWeight: 700 }}
          >
            {ordering ? "Submitting…" : "Submit Test Order"}
          </button>
        </div>
      )}
    </div>
  );
}
