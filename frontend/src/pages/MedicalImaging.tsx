import { useState, useRef, useCallback, useEffect } from "react";

interface Props {
  onBack: () => void;
  notify: (msg: string, type?: "success" | "error") => void;
}

interface Study {
  id: string;
  title: string;
  date: string;
  modality: string;
  bodyPart: string;
  status: "reported" | "pending";
  ohifUid: string;
}

interface Annotation {
  id: string;
  type: "label" | "arrow" | "circle";
  x: number;
  y: number;
  text?: string;
  x2?: number;
  y2?: number;
  r?: number;
}

interface DicomInfo {
  valid: boolean;
  size: number;
  fileName: string;
  tags: Record<string, string>;
}

type WindowPreset = "default" | "bone" | "lung" | "soft_tissue" | "brain";
type AnnotationTool = "none" | "label" | "arrow" | "circle";
type ViewerMode = "ohif" | "image" | "dicom";

// ── Constants ────────────────────────────────────────────────────────────────

const OHIF_BASE = "https://viewer.ohif.org";
// Public TCIA CT chest study hosted on OHIF demo server
const DEMO_UID_CT =
  "1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463";
// Second public demo (MRI)
const DEMO_UID_MR =
  "2.16.840.1.114362.1.11972228.22789312658.616067305.306.2";

const STUDIES: Study[] = [
  { id: "s1", title: "Chest CT",     date: "2026-07-05", modality: "CT", bodyPart: "Chest",   status: "reported", ohifUid: DEMO_UID_CT },
  { id: "s2", title: "Brain MRI",    date: "2026-07-03", modality: "MR", bodyPart: "Brain",   status: "pending",  ohifUid: DEMO_UID_MR },
  { id: "s3", title: "Knee MRI",     date: "2026-06-28", modality: "MR", bodyPart: "Knee",    status: "reported", ohifUid: DEMO_UID_CT },
  { id: "s4", title: "Abdominal CT", date: "2026-06-20", modality: "CT", bodyPart: "Abdomen", status: "pending",  ohifUid: DEMO_UID_CT },
  { id: "s5", title: "Spine X-Ray",  date: "2026-06-15", modality: "CR", bodyPart: "Spine",   status: "reported", ohifUid: DEMO_UID_CT },
];

const WINDOW_PRESETS: Record<WindowPreset, { brightness: number; contrast: number; label: string }> = {
  default:      { brightness: 100, contrast: 100, label: "Default"     },
  bone:         { brightness: 80,  contrast: 160, label: "Bone"        },
  lung:         { brightness: 130, contrast: 140, label: "Lung"        },
  soft_tissue:  { brightness: 100, contrast: 120, label: "Soft Tissue" },
  brain:        { brightness: 110, contrast: 130, label: "Brain"       },
};

// ── DICOM Parser ─────────────────────────────────────────────────────────────

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

function parseDicomInfo(file: File, buffer: ArrayBuffer): DicomInfo {
  const bytes = new Uint8Array(buffer);
  // DICOM Part 10 starts with 128-byte preamble then "DICM"
  const valid =
    buffer.byteLength >= 132 &&
    bytes[128] === 0x44 && bytes[129] === 0x49 &&
    bytes[130] === 0x43 && bytes[131] === 0x4d;

  const tags: Record<string, string> = {};

  if (valid) {
    const view = new DataView(buffer);
    const dec = new TextDecoder("latin1");

    const TAG_NAMES: Record<number, string> = {
      0x00080060: "Modality",
      0x00100010: "Patient Name",
      0x00080020: "Study Date",
      0x00081030: "Study Description",
      0x00180015: "Body Part",
      0x00280010: "Rows",
      0x00280011: "Columns",
      0x00280100: "Bits Allocated",
      0x00080050: "Accession Number",
    };

    let offset = 132;
    let iterations = 0;
    const limit = Math.min(buffer.byteLength - 8, 65536);

    while (offset < limit && iterations < 600) {
      iterations++;
      try {
        const group = view.getUint16(offset, true);
        const elem  = view.getUint16(offset + 2, true);
        if (group === 0x7fe0) break; // pixel data — stop

        const tagKey = (group << 16) | elem;
        const vr = String.fromCharCode(bytes[offset + 4], bytes[offset + 5]);
        const isLong = ["OB","OD","OF","OL","OW","SQ","UC","UN","UR","UT"].includes(vr);
        const isExplicit = /^[A-Z]{2}$/.test(vr);

        let dataLen: number, dataOffset: number;
        if (isLong) {
          dataLen = view.getUint32(offset + 8, true);
          dataOffset = offset + 12;
        } else if (isExplicit) {
          dataLen = view.getUint16(offset + 6, true);
          dataOffset = offset + 8;
        } else {
          // Implicit VR
          dataLen = view.getUint32(offset + 4, true);
          dataOffset = offset + 8;
        }

        if (dataLen === 0xffffffff) { offset = dataOffset; continue; }
        if (dataOffset + dataLen > buffer.byteLength) break;

        if (TAG_NAMES[tagKey] && dataLen > 0 && dataLen <= 256) {
          const val = dec
            .decode(bytes.slice(dataOffset, dataOffset + dataLen))
            .replace(/\x00/g, "")
            .trim();
          if (val) tags[TAG_NAMES[tagKey]] = val;
        }

        offset = dataOffset + dataLen;
        if (offset % 2 !== 0) offset++;
      } catch {
        break;
      }
    }
  }

  return { valid, size: file.size, fileName: file.name, tags };
}

// ── Icons ────────────────────────────────────────────────────────────────────

const ZoomInIcon  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><line x1="16" y1="16" x2="22" y2="22"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="11" y1="8" x2="11" y2="14"/></svg>;
const ZoomOutIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><line x1="16" y1="16" x2="22" y2="22"/><line x1="8" y1="11" x2="14" y2="11"/></svg>;
const RotateIcon  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>;
const FlipIcon    = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="2" x2="12" y2="22" strokeDasharray="2 2"/><polygon points="5 8 1 12 5 16"/><polygon points="19 8 23 12 19 16"/></svg>;
const RulerIcon   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 18L18 2l4 4L6 22z"/><line x1="8" y1="12" x2="10" y2="14"/><line x1="12" y1="8" x2="14" y2="10"/></svg>;
const SplitIcon   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>;
const LabelIcon   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V4h16v3"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/></svg>;
const ArrowIcon   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="19" x2="19" y2="5"/><polyline points="12 5 19 5 19 12"/></svg>;
const CircleIcon  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/></svg>;
const UploadIcon  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>;
const ExtLinkIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>;
const CheckIcon   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>;
const XCircleIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>;

// ── Component ─────────────────────────────────────────────────────────────────

export function MedicalImaging({ onBack, notify }: Props) {
  const [selectedStudy, setSelectedStudy] = useState<Study>(STUDIES[0]);
  const [viewerMode, setViewerMode]       = useState<ViewerMode>("ohif");
  const [iframeKey, setIframeKey]         = useState(0);
  const [iframeLoading, setIframeLoading] = useState(true);

  // Uploaded file
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [dicomInfo, setDicomInfo]               = useState<DicomInfo | null>(null);

  // Image controls (active in "image" mode)
  const [zoom,         setZoom]         = useState(1);
  const [rotation,     setRotation]     = useState(0);
  const [flipped,      setFlipped]      = useState(false);
  const [brightness,   setBrightness]   = useState(100);
  const [contrast,     setContrast]     = useState(100);
  const [windowPreset, setWindowPreset] = useState<WindowPreset>("default");

  // Annotations (active in "image" mode)
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeTool,  setActiveTool]  = useState<AnnotationTool>("none");
  const [measuring,   setMeasuring]   = useState(false);
  const [measureStart, setMeasureStart] = useState<{ x: number; y: number } | null>(null);
  const [measureEnd,   setMeasureEnd]   = useState<{ x: number; y: number } | null>(null);

  const [findings,        setFindings]        = useState("");
  const [comparisonMode,  setComparisonMode]  = useState(false);
  const [comparisonStudy, setComparisonStudy] = useState<Study>(STUDIES[1]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const overlayRef   = useRef<SVGSVGElement>(null);
  const annotIdRef   = useRef(0);

  // Revoke object URLs on unmount or when a new one is created
  useEffect(() => {
    return () => { if (uploadedImageUrl) URL.revokeObjectURL(uploadedImageUrl); };
  }, [uploadedImageUrl]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const resetAnnotations = () => {
    setAnnotations([]);
    setMeasureStart(null);
    setMeasureEnd(null);
    setActiveTool("none");
    setMeasuring(false);
  };

  const selectStudy = (study: Study) => {
    if (uploadedImageUrl) URL.revokeObjectURL(uploadedImageUrl);
    setUploadedImageUrl(null);
    setDicomInfo(null);
    setSelectedStudy(study);
    setViewerMode("ohif");
    setIframeKey(k => k + 1);
    setIframeLoading(true);
    resetAnnotations();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const name = file.name.toLowerCase();
    const isImg = /\.(jpg|jpeg|png)$/.test(name);
    const isDcm = /\.(dcm|dicom|dcm\.gz)$/.test(name);

    if (!isImg && !isDcm) {
      notify("Unsupported format. Use .dcm, .jpg, or .png", "error");
      e.target.value = "";
      return;
    }

    if (uploadedImageUrl) URL.revokeObjectURL(uploadedImageUrl);
    setUploadedImageUrl(null);
    resetAnnotations();
    setZoom(1);
    setRotation(0);
    setFlipped(false);
    setBrightness(100);
    setContrast(100);
    setWindowPreset("default");

    if (isImg) {
      const url = URL.createObjectURL(file);
      setUploadedImageUrl(url);
      setViewerMode("image");
      notify(`Loaded: ${file.name}`, "success");
    } else {
      const reader = new FileReader();
      reader.onload = ev => {
        const buf = ev.target?.result as ArrayBuffer;
        const info = parseDicomInfo(file, buf);
        setDicomInfo(info);
        setViewerMode("dicom");
        notify(
          info.valid ? `DICOM loaded: ${file.name}` : `Not a valid DICOM file: ${file.name}`,
          info.valid ? "success" : "error",
        );
      };
      reader.readAsArrayBuffer(file);
    }
    e.target.value = "";
  };

  const applyPreset = useCallback((preset: WindowPreset) => {
    setWindowPreset(preset);
    setBrightness(WINDOW_PRESETS[preset].brightness);
    setContrast(WINDOW_PRESETS[preset].contrast);
  }, []);

  const getOverlayCoords = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = overlayRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 400,
      y: ((e.clientY - rect.top) / rect.height) * 400,
    };
  }, []);

  const handleOverlayClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const coords = getOverlayCoords(e);

    if (measuring) {
      if (!measureStart) {
        setMeasureStart(coords);
      } else {
        setMeasureEnd(coords);
        setMeasuring(false);
        const dx = coords.x - measureStart.x;
        const dy = coords.y - measureStart.y;
        notify(`Measurement: ${(Math.sqrt(dx * dx + dy * dy) * 0.25).toFixed(1)} mm`, "success");
      }
      return;
    }

    if (activeTool === "none") return;

    const id = `a${++annotIdRef.current}`;
    if (activeTool === "label") {
      const text = prompt("Enter label text:");
      if (!text) return;
      setAnnotations(prev => [...prev, { id, type: "label", x: coords.x, y: coords.y, text }]);
    } else if (activeTool === "circle") {
      setAnnotations(prev => [...prev, { id, type: "circle", x: coords.x, y: coords.y, r: 30 }]);
    } else if (activeTool === "arrow") {
      setAnnotations(prev => [...prev, {
        id, type: "arrow",
        x: coords.x, y: coords.y,
        x2: coords.x + 50, y2: coords.y - 40,
      }]);
    }
    notify(`${activeTool} annotation added`, "success");
  }, [activeTool, measuring, measureStart, getOverlayCoords, notify]);

  const clearAnnotations = () => {
    resetAnnotations();
    notify("Annotations cleared", "success");
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const isOhif  = viewerMode === "ohif";
  const isImage = viewerMode === "image";
  const isDicom = viewerMode === "dicom";

  const ohifUrl = `${OHIF_BASE}/viewer?StudyInstanceUIDs=${selectedStudy.ohifUid}`;
  const cmpUrl  = `${OHIF_BASE}/viewer?StudyInstanceUIDs=${comparisonStudy.ohifUid}`;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="page-enter">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .dcm-tag { background: var(--bg-alt); border-radius: 8px; padding: 8px 10px; }
        .dcm-tag-key { font-size: 10px; color: var(--text-muted); margin-bottom: 2px; }
        .dcm-tag-val { font-size: 12px; font-weight: 500; }
      `}</style>

      <div className="breadcrumb">
        <button onClick={onBack}>Home</button>
        <span className="sep">/</span>
        <span>Medical Imaging</span>
      </div>

      <div className="section-header">
        <div>
          <h1>DICOM Viewer</h1>
          <div className="subtitle">Medical imaging studies · Powered by OHIF open-source viewer</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr 280px", gap: 16 }}>

        {/* ── Left: Study List ───────────────────────────────────────────────── */}
        <div className="neu" style={{ padding: 16, borderRadius: 16, overflow: "auto", maxHeight: "80vh" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "var(--text-secondary)" }}>
            Studies
          </div>

          {STUDIES.map(s => (
            <div
              key={s.id}
              className={s.id === selectedStudy.id && isOhif ? "neu-inset" : "neu-flat"}
              onClick={() => selectStudy(s)}
              style={{
                padding: 12, borderRadius: 10, marginBottom: 8, cursor: "pointer",
                border: s.id === selectedStudy.id && isOhif
                  ? "1px solid var(--accent)"
                  : "1px solid transparent",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13 }}>{s.title}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                {s.date} · {s.modality}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.bodyPart}</span>
                <span style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 8, fontWeight: 600,
                  background: s.status === "reported" ? "var(--success-soft,#e6f9ed)" : "var(--warning-soft,#fff8e6)",
                  color: s.status === "reported" ? "var(--success,#22c55e)" : "var(--warning,#f59e0b)",
                }}>
                  {s.status === "reported" ? "Reported" : "Pending"}
                </span>
              </div>
            </div>
          ))}

          {/* File upload section */}
          <div style={{ marginTop: 16, borderTop: "1px solid var(--border,rgba(0,0,0,0.08))", paddingTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: "var(--text-secondary)" }}>
              Local File
            </div>
            <button
              className="neu-btn"
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, justifyContent: "center", fontSize: 12 }}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadIcon /> Upload DICOM / Image
            </button>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6, textAlign: "center" }}>
              .dcm · .dicom · .jpg · .png
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".dcm,.dicom,.dcm.gz,.jpg,.jpeg,.png"
              style={{ display: "none" }}
              onChange={handleFileUpload}
            />
          </div>

          {/* Comparison study picker (OHIF mode only) */}
          {isOhif && comparisonMode && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 16, marginBottom: 8, color: "var(--text-secondary)" }}>
                Compare With
              </div>
              {STUDIES.filter(s => s.id !== selectedStudy.id).map(s => (
                <div
                  key={s.id}
                  className={s.id === comparisonStudy.id ? "neu-inset" : "neu-flat"}
                  onClick={() => setComparisonStudy(s)}
                  style={{
                    padding: 10, borderRadius: 8, marginBottom: 6, cursor: "pointer", fontSize: 12,
                    border: s.id === comparisonStudy.id ? "1px solid var(--accent)" : "1px solid transparent",
                  }}
                >
                  {s.title} · {s.modality}
                </div>
              ))}
            </>
          )}
        </div>

        {/* ── Main Viewer ────────────────────────────────────────────────────── */}
        <div>

          {/* Toolbar */}
          <div className="neu" style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 10, borderRadius: 12, marginBottom: 12, alignItems: "center" }}>

            {isImage && (
              <>
                <button className="neu-btn sm" onClick={() => setZoom(z => Math.min(z + 0.2, 4))} title="Zoom In"><ZoomInIcon /></button>
                <button className="neu-btn sm" onClick={() => setZoom(z => Math.max(z - 0.2, 0.3))} title="Zoom Out"><ZoomOutIcon /></button>
                <button className="neu-btn sm" onClick={() => setZoom(1)} style={{ fontSize: 11 }} title="Reset Zoom">1:1</button>
                <span style={{ width: 1, height: 20, background: "var(--text-muted)", opacity: 0.3 }} />
                <button className="neu-btn sm" onClick={() => setRotation(r => r + 90)} title="Rotate 90°"><RotateIcon /></button>
                <button className="neu-btn sm" onClick={() => setFlipped(f => !f)} title="Flip Horizontal"><FlipIcon /></button>
                <span style={{ width: 1, height: 20, background: "var(--text-muted)", opacity: 0.3 }} />
                <button
                  className={`neu-btn sm${measuring ? " primary" : ""}`}
                  onClick={() => { setMeasuring(!measuring); setMeasureStart(null); setMeasureEnd(null); setActiveTool("none"); }}
                  title="Measure distance"
                >
                  <RulerIcon />
                </button>
                <span style={{ width: 1, height: 20, background: "var(--text-muted)", opacity: 0.3 }} />
                <button
                  className={`neu-btn sm${activeTool === "label" ? " primary" : ""}`}
                  onClick={() => { setActiveTool(activeTool === "label" ? "none" : "label"); setMeasuring(false); }}
                  title="Text Label"
                >
                  <LabelIcon />
                </button>
                <button
                  className={`neu-btn sm${activeTool === "arrow" ? " primary" : ""}`}
                  onClick={() => { setActiveTool(activeTool === "arrow" ? "none" : "arrow"); setMeasuring(false); }}
                  title="Arrow"
                >
                  <ArrowIcon />
                </button>
                <button
                  className={`neu-btn sm${activeTool === "circle" ? " primary" : ""}`}
                  onClick={() => { setActiveTool(activeTool === "circle" ? "none" : "circle"); setMeasuring(false); }}
                  title="Circle ROI"
                >
                  <CircleIcon />
                </button>
                {annotations.length > 0 && (
                  <button className="neu-btn sm danger" onClick={clearAnnotations} style={{ marginLeft: "auto" }}>
                    Clear All
                  </button>
                )}
              </>
            )}

            {isOhif && (
              <>
                <button
                  className={`neu-btn sm${comparisonMode ? " primary" : ""}`}
                  onClick={() => setComparisonMode(c => !c)}
                  title="Side-by-side comparison"
                >
                  <SplitIcon />
                </button>
                <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4 }}>
                  OHIF has built-in annotation tools
                </span>
                <a
                  href={ohifUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="neu-btn sm primary"
                  style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, textDecoration: "none", fontSize: 12 }}
                >
                  <ExtLinkIcon /> Open in OHIF
                </a>
              </>
            )}

            {isDicom && (
              <>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {dicomInfo?.fileName}
                </span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  <button className="neu-btn sm" onClick={() => fileInputRef.current?.click()} style={{ fontSize: 11 }}>
                    <UploadIcon /> Load Another
                  </button>
                  <a
                    href={ohifUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="neu-btn sm primary"
                    style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none", fontSize: 12 }}
                  >
                    <ExtLinkIcon /> Open OHIF Demo
                  </a>
                </div>
              </>
            )}
          </div>

          {/* Viewer area */}
          <div
            className="neu-inset"
            style={{ borderRadius: 16, overflow: "hidden", minHeight: "60vh" }}
          >

            {/* OHIF iframe viewer */}
            {isOhif && (
              <div style={{ display: "flex", height: comparisonMode ? "62vh" : "65vh" }}>
                {/* Primary */}
                <div style={{ flex: 1, position: "relative" }}>
                  {iframeLoading && (
                    <div style={{
                      position: "absolute", inset: 0, zIndex: 2,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      background: "var(--bg-alt)", gap: 14,
                    }}>
                      <div style={{
                        width: 34, height: 34,
                        border: "3px solid var(--accent)", borderTopColor: "transparent",
                        borderRadius: "50%", animation: "spin 0.8s linear infinite",
                      }} />
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading OHIF Viewer…</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", maxWidth: 260, textAlign: "center" }}>
                        If the viewer doesn't appear, click "Open in OHIF" above to view in a new tab.
                      </div>
                    </div>
                  )}
                  <iframe
                    key={`ohif-${iframeKey}-${selectedStudy.id}`}
                    src={ohifUrl}
                    style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                    title={`OHIF Viewer — ${selectedStudy.title}`}
                    allow="fullscreen"
                    sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads allow-pointer-lock"
                    onLoad={() => setIframeLoading(false)}
                  />
                </div>
                {/* Comparison */}
                {comparisonMode && (
                  <div style={{ flex: 1, borderLeft: "2px solid var(--accent)", position: "relative" }}>
                    <iframe
                      key={`ohif-cmp-${comparisonStudy.id}`}
                      src={cmpUrl}
                      style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                      title={`OHIF Viewer — ${comparisonStudy.title}`}
                      allow="fullscreen"
                      sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads allow-pointer-lock"
                    />
                    <div style={{
                      position: "absolute", top: 8, left: 10,
                      fontSize: 11, color: "#fff",
                      background: "rgba(0,0,0,0.5)", borderRadius: 6, padding: "2px 8px",
                    }}>
                      {comparisonStudy.title}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Standard image viewer with annotation overlay */}
            {isImage && uploadedImageUrl && (
              <div style={{
                position: "relative",
                width: "100%", height: "65vh",
                background: "#000",
                display: "flex", alignItems: "center", justifyContent: "center",
                overflow: "hidden",
              }}>
                <img
                  src={uploadedImageUrl}
                  alt="Uploaded medical image"
                  style={{
                    maxWidth: "100%", maxHeight: "100%",
                    objectFit: "contain",
                    transform: `scale(${zoom}) rotate(${rotation}deg) scaleX(${flipped ? -1 : 1})`,
                    filter: `brightness(${brightness}%) contrast(${contrast}%)`,
                    transition: "transform 0.15s ease, filter 0.15s ease",
                    userSelect: "none",
                    pointerEvents: "none",
                  }}
                />
                {/* Annotation SVG overlay */}
                <svg
                  ref={overlayRef}
                  viewBox="0 0 400 400"
                  style={{
                    position: "absolute", inset: 0,
                    width: "100%", height: "100%",
                    cursor: activeTool !== "none" || measuring ? "crosshair" : "default",
                  }}
                  onClick={handleOverlayClick}
                >
                  {annotations.map(a => {
                    if (a.type === "label") return (
                      <g key={a.id}>
                        <rect x={a.x - 2} y={a.y - 12} width={(a.text?.length ?? 3) * 7 + 8} height="16" rx="3" fill="var(--accent)" opacity="0.9" />
                        <text x={a.x + 2} y={a.y} fontSize="11" fill="#fff" fontFamily="sans-serif">{a.text}</text>
                      </g>
                    );
                    if (a.type === "circle") return (
                      <circle key={a.id} cx={a.x} cy={a.y} r={a.r} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 2" />
                    );
                    if (a.type === "arrow") return (
                      <g key={a.id}>
                        <defs>
                          <marker id={`ah-${a.id}`} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                            <polygon points="0 0,8 3,0 6" fill="var(--accent)" />
                          </marker>
                        </defs>
                        <line x1={a.x} y1={a.y} x2={a.x2} y2={a.y2} stroke="var(--accent)" strokeWidth="2" markerEnd={`url(#ah-${a.id})`} />
                      </g>
                    );
                    return null;
                  })}

                  {measureStart && measureEnd && (
                    <g>
                      <line x1={measureStart.x} y1={measureStart.y} x2={measureEnd.x} y2={measureEnd.y} stroke="#f59e0b" strokeWidth="2" strokeDasharray="6 3" />
                      <circle cx={measureStart.x} cy={measureStart.y} r="3" fill="#f59e0b" />
                      <circle cx={measureEnd.x}   cy={measureEnd.y}   r="3" fill="#f59e0b" />
                    </g>
                  )}
                  {measureStart && !measureEnd && (
                    <circle cx={measureStart.x} cy={measureStart.y} r="4" fill="#f59e0b" />
                  )}
                </svg>

                {/* HUD: filename + pixel info */}
                <div style={{
                  position: "absolute", bottom: 8, left: 10,
                  fontSize: 10, color: "rgba(255,255,255,0.7)", fontFamily: "monospace",
                  pointerEvents: "none",
                }}>
                  {dicomInfo?.fileName ?? "uploaded image"} &nbsp;|&nbsp;
                  W/L: {brightness}/{contrast} &nbsp;|&nbsp;
                  {Math.round(zoom * 100)}% &nbsp;{rotation ? `| ${rotation}°` : ""}{flipped ? " | Flipped" : ""}
                </div>
              </div>
            )}

            {/* DICOM metadata panel */}
            {isDicom && dicomInfo && (
              <div style={{
                minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center",
                padding: 24,
              }}>
                <div style={{ maxWidth: 540, width: "100%" }}>
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                      background: dicomInfo.valid ? "var(--success-soft,#e6f9ed)" : "var(--error-soft,#fee2e2)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: dicomInfo.valid ? "var(--success,#22c55e)" : "var(--danger,#ef4444)",
                    }}>
                      {dicomInfo.valid ? <CheckIcon /> : <XCircleIcon />}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>
                        {dicomInfo.valid ? "Valid DICOM File (Part 10)" : "Not a Valid DICOM File"}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                        {dicomInfo.fileName} &nbsp;·&nbsp; {fmtBytes(dicomInfo.size)}
                      </div>
                    </div>
                  </div>

                  {/* Tags grid */}
                  {Object.keys(dicomInfo.tags).length > 0 ? (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: "var(--text-secondary)" }}>
                        Extracted DICOM Tags
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
                        {Object.entries(dicomInfo.tags).map(([k, v]) => (
                          <div className="dcm-tag" key={k}>
                            <div className="dcm-tag-key">{k}</div>
                            <div className="dcm-tag-val">{v}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : dicomInfo.valid ? (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>
                      No readable string tags found in the first 64 KB (file may use compressed transfer syntax or private tags).
                    </div>
                  ) : null}

                  {/* Canvas note */}
                  <div style={{
                    background: "var(--bg-alt)", borderRadius: 12, padding: 16, marginBottom: 16,
                    fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6,
                  }}>
                    <strong style={{ color: "var(--text)" }}>Why can't pixels be shown locally?</strong>
                    <br />
                    DICOM pixel data often uses transfer syntaxes (JPEG 2000, RLE, JPEG-LS) that require a WADO-RS server to decompress and serve. The OHIF demo viewer streams from a public DICOMweb server. To view your local file's pixels, use a desktop app like <a href="https://www.itksnap.org" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>ITK-SNAP</a> or <a href="https://www.slicer.org" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>3D Slicer</a>.
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <a
                      href={ohifUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="neu-btn primary"
                      style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", fontSize: 13 }}
                    >
                      <ExtLinkIcon /> Open OHIF Demo Viewer
                    </a>
                    <button
                      className="neu-btn"
                      style={{ fontSize: 13 }}
                      onClick={() => selectStudy(selectedStudy)}
                    >
                      Back to Demo Study
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Status bar */}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 4px", fontSize: 11, color: "var(--text-muted)" }}>
            {isImage && (
              <>
                <span>
                  Zoom: {Math.round(zoom * 100)}% &nbsp;|&nbsp; Rotation: {rotation}°
                  {flipped ? " | Flipped" : ""}
                </span>
                <span>
                  {activeTool !== "none"
                    ? `Tool active: ${activeTool} — click on image`
                    : measuring
                    ? "Click two points to measure"
                    : "Ready — select a tool above"}
                </span>
              </>
            )}
            {isOhif && (
              <>
                <span>{selectedStudy.title} · {selectedStudy.modality} · {selectedStudy.bodyPart}</span>
                <span>
                  OHIF Viewer ·&nbsp;
                  <a href="https://ohif.org" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>
                    ohif.org
                  </a>
                  &nbsp;· Apache 2.0
                </span>
              </>
            )}
            {isDicom && (
              <span>{dicomInfo?.fileName} · {dicomInfo && fmtBytes(dicomInfo.size)}</span>
            )}
          </div>
        </div>

        {/* ── Right Panel ────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Window Presets */}
          <div className="neu" style={{ padding: 14, borderRadius: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: "var(--text-secondary)" }}>
              Window Presets
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(Object.keys(WINDOW_PRESETS) as WindowPreset[]).map(key => (
                <button
                  key={key}
                  className={`neu-btn sm${windowPreset === key ? " primary" : ""}`}
                  onClick={() => applyPreset(key)}
                  disabled={!isImage}
                  style={{ fontSize: 11 }}
                  title={!isImage ? "Upload a .jpg or .png to use presets" : WINDOW_PRESETS[key].label}
                >
                  {WINDOW_PRESETS[key].label}
                </button>
              ))}
            </div>
            {!isImage && (
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>
                Upload a .jpg or .png to enable windowing
              </div>
            )}
          </div>

          {/* Brightness / Contrast */}
          <div className="neu" style={{ padding: 14, borderRadius: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: "var(--text-secondary)" }}>
              Adjustments
            </div>
            <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
              Brightness: {brightness}%
            </label>
            <input
              type="range" min="20" max="200" value={brightness}
              onChange={e => { setBrightness(Number(e.target.value)); setWindowPreset("default"); }}
              disabled={!isImage}
              style={{ width: "100%", accentColor: "var(--accent)" }}
            />
            <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4, marginTop: 8 }}>
              Contrast: {contrast}%
            </label>
            <input
              type="range" min="20" max="200" value={contrast}
              onChange={e => { setContrast(Number(e.target.value)); setWindowPreset("default"); }}
              disabled={!isImage}
              style={{ width: "100%", accentColor: "var(--accent)" }}
            />
          </div>

          {/* Study / File Info */}
          <div className="neu" style={{ padding: 14, borderRadius: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: "var(--text-secondary)" }}>
              {isDicom ? "DICOM Summary" : "Study Info"}
            </div>

            {isOhif && (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {([
                  ["Study",     selectedStudy.title],
                  ["Date",      selectedStudy.date],
                  ["Modality",  selectedStudy.modality],
                  ["Body Part", selectedStudy.bodyPart],
                  ["Status",    selectedStudy.status],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span style={{ color: "var(--text-muted)" }}>{k}</span>
                    <span style={{ fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
                <div style={{ marginTop: 6, paddingTop: 8, borderTop: "1px solid var(--border,rgba(0,0,0,0.08))" }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>Study UID (demo)</div>
                  <div style={{ fontSize: 9, fontFamily: "monospace", color: "var(--text-muted)", wordBreak: "break-all", lineHeight: 1.4 }}>
                    {selectedStudy.ohifUid}
                  </div>
                </div>
              </div>
            )}

            {isImage && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                Uploaded image (JPEG/PNG)<br />
                Annotations: {annotations.length}<br />
                Applying CSS <code style={{ fontSize: 10 }}>filter: brightness/contrast</code> for windowing.
              </div>
            )}

            {isDicom && dicomInfo && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
                <span style={{ color: dicomInfo.valid ? "var(--success,#22c55e)" : "var(--danger,#ef4444)", fontWeight: 600 }}>
                  {dicomInfo.valid ? "Valid DICOM" : "Invalid DICOM"}
                </span><br />
                Size: {fmtBytes(dicomInfo.size)}<br />
                Tags extracted: {Object.keys(dicomInfo.tags).length}
              </div>
            )}
          </div>

          {/* Findings */}
          <div className="neu" style={{ padding: 14, borderRadius: 14, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: "var(--text-secondary)" }}>
              Findings
            </div>
            <textarea
              className="neu-inset"
              placeholder="Document observations and findings here…"
              value={findings}
              onChange={e => setFindings(e.target.value)}
              style={{
                width: "100%", minHeight: 120, resize: "vertical", border: "none",
                borderRadius: 10, padding: 10, fontSize: 12, fontFamily: "inherit",
                color: "var(--text)", background: "transparent", boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                className="neu-btn sm primary"
                style={{ flex: 1 }}
                onClick={() => {
                  if (!findings.trim()) { notify("No findings to save", "error"); return; }
                  notify("Findings saved", "success");
                }}
              >
                Save
              </button>
              <button className="neu-btn sm" style={{ flex: 1 }} onClick={() => setFindings("")}>
                Clear
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
