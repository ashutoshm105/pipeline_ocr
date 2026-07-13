import { useState, useEffect } from "react";
import { listEducation } from "../api";

interface Props {
  onBack: () => void;
}

interface Article {
  id: string;
  title: string;
  content: string;
  category: string;
  url: string;
  condition_tag: string;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  articles: Article[];
}

const CATEGORY_ICONS: Record<string, string> = {
  "Chronic Conditions": "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z",
  "Preventive Care": "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  "Nutrition & Diet": "M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z",
  "Mental Health": "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm3 8H9v-1c0-1 2-1.5 3-1.5s3 .5 3 1.5z",
  "Medication Safety": "M10.5 1.5H8A6.5 6.5 0 0 0 8 14.5h8A6.5 6.5 0 0 0 16 1.5h-2.5",
};
const DEFAULT_ICON = "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z";

export function PatientEducation({ onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listEducation()
      .then((rows: Article[]) => {
        if (cancelled) return;
        const byCategory = new Map<string, Article[]>();
        for (const row of rows) {
          const cat = row.category || "General";
          if (!byCategory.has(cat)) byCategory.set(cat, []);
          byCategory.get(cat)!.push(row);
        }
        const cats: Category[] = Array.from(byCategory.entries()).map(([name, articles]) => ({
          id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          name,
          icon: CATEGORY_ICONS[name] || DEFAULT_ICON,
          articles,
        }));
        setCategories(cats);
      })
      .catch((e) => { if (!cancelled) setError(e.message || "Failed to load education library"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const cat = categories.find(c => c.id === selectedCat);

  return (
    <div className="page-enter">
      <div className="breadcrumb">
        <button onClick={onBack}>Home</button>
        <span className="sep">/</span>
        {selectedCat && <><button onClick={() => { setSelectedCat(null); setSelectedArticle(null); }}>Education</button><span className="sep">/</span></>}
        <span>{selectedArticle ? selectedArticle.title : selectedCat ? cat?.name : "Patient Education"}</span>
      </div>
      <div className="section-header">
        <div>
          <h1>{selectedArticle ? selectedArticle.title : "Patient Education Library"}</h1>
          <div className="subtitle">{selectedArticle ? cat?.name : "Evidence-based health information for patients and families"}</div>
        </div>
      </div>

      {loading && <div className="neu" style={{ padding: 24, color: "var(--text-muted)" }}>Loading education library...</div>}
      {!loading && error && <div className="neu" style={{ padding: 24, color: "var(--danger, #e5484d)" }}>{error}</div>}

      {!loading && !error && !selectedCat && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {categories.map(c => (
            <div key={c.id} className="neu" style={{ padding: 24, cursor: "pointer" }} onClick={() => setSelectedCat(c.id)}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={c.icon}/></svg>
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{c.name}</h3>
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{c.articles.length} article{c.articles.length > 1 ? "s" : ""}</p>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && selectedCat && !selectedArticle && cat && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button className="neu-btn sm ghost" onClick={() => setSelectedCat(null)} style={{ alignSelf: "flex-start", marginBottom: 8 }}>← All Categories</button>
          {cat.articles.map((article) => (
            <div key={article.id} className="neu" style={{ padding: 20, cursor: "pointer" }} onClick={() => setSelectedArticle(article)}>
              <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{article.title}</h4>
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{article.content.slice(0, 100)}...</p>
            </div>
          ))}
        </div>
      )}

      {selectedArticle && (
        <div>
          <button className="neu-btn sm ghost" onClick={() => setSelectedArticle(null)} style={{ marginBottom: 16 }}>← Back to {cat?.name}</button>
          <div className="neu" style={{ padding: 28 }}>
            <div style={{ fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-wrap", color: "var(--text-secondary)" }}>
              {selectedArticle.content}
            </div>
            <div style={{ marginTop: 20, padding: "12px 16px", background: "var(--bg-alt)", borderRadius: 8, fontSize: 11, color: "var(--text-muted)" }}>
              This information is for educational purposes only and does not replace professional medical advice. Always consult your healthcare provider for personalized guidance.
            </div>
          </div>
          <button className="neu-btn sm ghost" style={{ marginTop: 12 }} onClick={() => {
            const blob = new Blob([`${selectedArticle.title}\n\n${selectedArticle.content}`], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `${selectedArticle.title.replace(/\s/g, "_")}.txt`; a.click();
            URL.revokeObjectURL(url);
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download as Text
          </button>
        </div>
      )}
    </div>
  );
}
