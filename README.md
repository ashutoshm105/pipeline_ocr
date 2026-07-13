# MedVault — The MedTech OS

**An open-source, agentic operating system for medical documents.** Not a single OCR
tool — a full team of specialised agents (preprocessing, classification, OCR routing,
extraction, validation, diagnosis, summary, evaluation), every one of them powered by
a **single Unified AI Gateway** that can be pointed at any model — local or cloud,
free or paid — and swapped without touching a line of application code.

Think "Ollama, but for the entire medical document pipeline": OCR engines, AI models,
preprocessing filters, diagnosis logic, and document classifiers are all
**plug-and-play providers** you register, test, and swap from one screen — the
**Model Hub**. Everything runs locally by default. Your data never has to leave your
machine.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.12-blue.svg)
![React](https://img.shields.io/badge/react-19-61dafb.svg)

---

## Why "an OS," not "an app"

An operating system schedules many independent programs against shared resources and
gives them one consistent way to reach the outside world. MedVault does the same for
medical document intelligence:

- **Independent programs** → 8 specialised agents, each with a single responsibility,
  wired into a dependency-aware DAG (`PipelineGraph`), not a monolithic script.
- **Shared resources** → the **provider registry** (SQLite `providers` table): every
  OCR engine, AI model, preprocessing filter, diagnosis mode, and classifier the
  system knows about, in one place, swappable at runtime.
- **One consistent way to reach the outside world** → the **Unified AI Gateway**
  (`backend/services/ai_gateway.py`). Every agent that needs an LLM calls the same
  `complete()` / `analyze()` interface; the gateway resolves it to whichever provider
  is configured as default, and **automatically fails over** to the next configured
  provider if that one errors, rate-limits, or times out.

That's the whole thesis: build the agent team once, then let the operator decide
*which models actually run underneath* — from the UI, without redeploying.

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                         MODEL HUB (single control point)              │
│   OCR Engines │ AI Models │ Preprocessing │ Diagnosis │ Classifiers   │
│         Add / Test / Set-Default for every provider kind              │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │  provider registry (SQLite)
                                 ▼
┌───────────────────────────────────────────────────────────────────────┐
│                    UNIFIED AI GATEWAY (single route AI)               │
│   default provider first → automatic fallback across every other      │
│   configured provider on failure/timeout/rate-limit                   │
│   Local: Ollama · llama.cpp · LM Studio · vLLM                        │
│   Cloud: Gemini · OpenAI · Claude · Groq · Together · DeepSeek        │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │  llm_client.complete(prompt, input)
                                 ▼
┌───────────────────────────────────────────────────────────────────────┐
│                    AGENT TEAM (PipelineGraph DAG)                     │
│                                                                         │
│  1 Preprocess → 2 Classify → 3 OCR Route → 4 Extract →                │
│  5 Validate → 6 Diagnose → [7 Summarise] → [8 Evaluate]                │
│                                                                         │
│  Low-confidence classification (<0.70) triggers a dual-engine OCR     │
│  race — both the predicted and the next-best route run, and the       │
│  result with more extracted content wins.                             │
└───────────────────────────────┬───────────────────────────────────────┘
                                 ▼
                     VALIDATED HEPATOLOGY JSON
              (Pydantic-enforced LabReport / DiagnosisResult)
```

### The Agent Team

| # | Agent | File | Responsibility |
|---|-------|------|-----------------|
| 1 | Preprocessing | `agents/preprocessing_agent.py` | Deskew, denoise, crop, resize. 3 pluggable modes (`default` / `simple` / `advanced`). |
| 2 | Classification | `agents/classification_agent.py` | 3-class doc-type routing (`TABLE` / `HANDWRITTEN` / `PRINTED_TEXT`) via CNN + heuristic ensemble, LLM fallback below 0.70 confidence. |
| 3 | OCR Router | `agents/ocr_router_agent.py` | Dispatches to the right OCR engine per class; below 0.70 classification confidence, races the predicted route against the next-best route and keeps whichever extracts more text. |
| 3a | Table OCR | `agents/table_ocr_agent.py` | PaddleOCR PP-Structure table recovery. |
| 3b | Handwritten OCR | `agents/handwritten_ocr_agent.py` | Qwen2.5-VL vision-language handwriting transcription. |
| 3c | Printed OCR | `agents/printed_ocr_agent.py` | PaddleOCR → Tesseract fallback chain. |
| 4 | Extraction | `agents/extraction_agent.py` | Raw OCR text/table → structured lab-result candidates, LLM-assisted via the Gateway. |
| 5 | Validation | `agents/validation_agent.py` | Pydantic-schema enforcement, unit normalisation, reference-range lookup. |
| 6 | Diagnosis | `agents/diagnosis_agent.py` | Rule-based Hepatology clinical patterns + LLM-assisted narrative (`rule_based` / `llm_assisted`, provider-registry controlled). |
| 7 | Summary | `agents/summary_agent.py` | Doctor-facing / patient-facing structured summaries. |
| 8 | Evaluation | `agents/evaluation_agent.py` | CER / WER (via `jiwer`), field-extraction accuracy, and table structure accuracy (row detection, column alignment, header mapping) against ground truth. |

All 8 stages run through `services/pipeline_service.py::PipelineGraph` — a
dependency-free, topologically-sorted DAG runner (mirrors LangGraph's
node/edge/shared-state model) so the whole system runs 100% offline when no AI
provider is configured, and LLM-assists every stage automatically the moment one is.

---

## Plug-and-Play Provider System

Five provider kinds, all managed from the **Model Hub** (`Settings.tsx`), all backed
by the same registry and CRUD API (`/api/providers/*`), all with live health/test
endpoints (`/api/hub/*`).

### OCR Engines (8)
| Engine | Type | GPU | Install |
|--------|------|-----|---------|
| **Pipeline / Auto** | Smart 3-class router (this repo's own agent team) | ✅ | Built-in |
| **PaddleOCR** | Printed + table structure | ✅ | `pip install paddleocr paddlepaddle-gpu` |
| **Qwen2.5-VL** | Handwritten (vision-language) | ✅ | Included (torch + transformers) |
| **Tesseract** | General baseline | ❌ | `pip install pytesseract` + [binary](https://github.com/tesseract-ocr/tesseract) |
| **EasyOCR** | Multi-language | ✅ | `pip install easyocr` |
| **Surya** | Transformer-based | ✅ | `pip install surya-ocr` |
| **docTR** | Document text recognition | ✅ | `pip install python-doctr[torch]` |

### AI Models (11)
| Provider | Type | Cost | Install |
|----------|------|------|---------|
| **Ollama** | Local LLM | Free | [ollama.com](https://ollama.com) |
| **llama.cpp** | Local GGUF server | Free | Local server |
| **LM Studio** | Local GUI | Free | [lmstudio.ai](https://lmstudio.ai) |
| **vLLM** | Local high-throughput server | Free | `pip install vllm` |
| **Gemini** | Cloud API | Pay | `pip install google-generativeai` |
| **OpenAI** | Cloud API | Pay | httpx (included) |
| **Claude (Anthropic)** | Cloud API | Pay | `pip install anthropic` |
| **Groq** | Cloud API | Free tier | httpx (included) |
| **Together** | Cloud API | Pay | httpx (included) |
| **DeepSeek** | Cloud API | Pay | httpx (included) |
| **Custom OpenAI-compatible** | Any endpoint | Varies | httpx (included) |

### Preprocessing (3) · Diagnosis (2) · Classifiers (3)
| Kind | Modes |
|------|-------|
| Preprocessing | `default` (EXIF+crop+enhance), `simple` (resize+grayscale), `advanced` (perspective+bilateral) |
| Diagnosis | `rule_based` (deterministic Hepatology knowledge base), `llm_assisted` (routes through the AI Gateway) |
| Classifier | `cnn` (MobileNetV3), `heuristic` (line-density/stroke-width), `auto` (CNN + heuristic ensemble) |

### How to Add a Provider
1. Open **Model Hub** in the UI.
2. Pick a category tab, click **+ Add**.
3. Choose an engine, fill in config (API key / endpoint / model name).
4. Click **Test** — for AI providers this round-trips a real prompt; for OCR it
   instantiates the engine.
5. Toggle **Set Default** — the entire pipeline picks it up on the next run, no
   restart required.

### The Unified AI Gateway, in detail

`services/ai_gateway.py` is the single choke point every LLM call passes through —
report analysis, extraction, validation, diagnosis, summary, and low-confidence
classification fallback all call it. It:

1. Loads every AI provider row from the registry, default first, then the rest in
   creation order (or a caller-specified `preferred_provider_id` first).
2. Tries each in turn; on any exception, logs the failure and moves to the next.
3. Raises `AIGatewayError` only when **every** configured provider has failed.
4. Exposes two call shapes so every agent — regardless of whether it does
   multi-modal document analysis or plain-text completion — can use it:
   - `gateway.analyze(prompt, text, images)` — full multi-modal (report analysis).
   - `gateway.complete(prompt, input)` — the `llm_client.complete()` contract every
     agent (`ExtractionAgent`, `ValidationAgent`, `DiagnosisAgent`, `SummaryAgent`,
     `ClassificationAgent`) already expects; base64 image input is auto-detected and
     routed as an image rather than text.

Check the live fallback chain and fire a one-click end-to-end test from
**Model Hub → System → Unified AI Gateway**, or hit it directly:

```bash
curl http://localhost:8000/api/hub/gateway          # current fallback order
curl -X POST http://localhost:8000/api/hub/gateway/test   # live round-trip
```

---

## Hepatology Domain Knowledge

Reference ranges (`backend/hepatology_kb.py`) sourced from *Sherlock's Diseases of
the Liver and Biliary System* (13th ed.) and AASLD practice guidelines:

| Test | Range | Unit |
|---|---|---|
| ALT (SGPT) | 7 – 56 | U/L |
| AST (SGOT) | 10 – 40 | U/L |
| ALP | 44 – 147 | U/L |
| GGT | M: 8–61, F: 5–36 | U/L |
| Total Bilirubin | 0.2 – 1.2 | mg/dL |
| Direct Bilirubin | 0.0 – 0.3 | mg/dL |
| Indirect Bilirubin | 0.2 – 0.9 | mg/dL |
| Total Protein | 6.3 – 8.2 | g/dL |
| Albumin | 3.5 – 5.0 | g/dL |
| Globulin | 2.0 – 3.5 | g/dL |
| A/G Ratio | 1.2 – 2.2 | — |
| Prothrombin Time | 11 – 13.5 | seconds |
| INR | 0.8 – 1.2 | — |
| Ammonia (NH₃) | 15 – 45 | µmol/L |

Fuzzy name matching (`lookup_reference_range`) resolves canonical names,
abbreviations, and OCR punctuation noise (`"T.Bil"`, `"total bilirubin"`,
`"Total  Bilirubin "`) to the same range.

---

## Quick Start

```bash
git clone https://github.com/ashutoshm105/pipeline_ocr.git
cd pipeline_ocr

# macOS / Linux
chmod +x start.sh && ./start.sh

# Windows
.\start.ps1
```

Backend: http://localhost:8000 | Frontend: http://localhost:5173

No AI provider configured? The pipeline still runs end-to-end — every LLM-assisted
stage degrades gracefully to its deterministic/heuristic path (rule-based diagnosis,
heuristic classification, CV-only preprocessing).

---

## Full Feature Suite

### Core (Working)
- 🔬 **OCR Workbench** — upload any medical document, see the full 8-agent pipeline output stage by stage
- 🧠 **Model Hub** — plug-and-play provider management for every OCR/AI/preprocessing/diagnosis/classifier kind, plus the Unified AI Gateway control panel
- 👨‍⚕️ **Doctor Portal** — patient list, report analysis, structured data
- 🏥 **Patient Portal** — upload reports, view history, no-auth test mode
- 📊 **Dashboard** — analytics, recent patients, appointments
- 💊 **Drug Interactions** — check multi-drug interactions
- 📋 **Patient Chart** — allergies, conditions, medications, vitals, labs
- 💬 **Messages** — doctor-patient secure messaging
- 📝 **Audit Log** — full action trail
- 📈 **Advanced Analytics** — system-wide statistics
- 🔑 **Auth** — JWT login for patients + doctors, no-auth test mode

### Specialty Pages (UI Ready, API Stubs — roadmap for full agent wiring)
- 🩺 Telemedicine · 🧬 Genomics · 🔬 Clinical Trials · 🩻 Medical Imaging ·
  🧪 Lab Interpretation · 🔬 Research Pipeline · 💊 Prescription Refills ·
  📄 Consent Forms · 📚 Patient Education · 📉 Vitals Monitor

## API Endpoints

| Category | Endpoints |
|----------|-----------|
| Auth | POST `/api/patient/register`, `/api/patient/login`, `/api/doctor/register`, `/api/doctor/login` |
| Reports | POST `/api/patient/upload`, GET `/api/patient/reports`, GET `/api/file/{id}` |
| Analysis | POST `/api/doctor/analyze`, POST `/api/doctor/ocr-structured` |
| Pipeline | POST `/api/pipeline/run`, GET `/api/gpu/status`, POST `/api/gpu/preload` |
| Providers | GET/POST `/api/providers`, PUT/DELETE `/api/providers/{id}`, GET `/api/providers/engines` |
| Model Hub | GET `/api/hub/status`, GET `/api/hub/health`, POST `/api/hub/test/{id}`, GET `/api/hub/recommendations`, GET `/api/hub/gateway`, POST `/api/hub/gateway/test` |
| Patient Data | Allergies, conditions, medications, vitals, prescriptions, notes, appointments, labs, diagnoses, referrals, invoices, insurance, export, FHIR |
| Admin | Messages, notifications, drug interactions, ICD-10, templates, audit log, analytics |
| Test (no auth) | POST `/api/test/upload`, GET `/api/test/reports` |
| System | GET `/health`, GET `/ready` |

## Prerequisites

- **Python 3.12+**
- **Node.js 20+**
- **NVIDIA GPU** (optional — recommended for PaddleOCR + Qwen-VL; everything runs on CPU too)

## Testing

```bash
pytest tests/ -v --tb=short
```

Covers preprocessing quality metrics, 3-class classifier accuracy, OCR routing
(including the dual-engine low-confidence fallback), schema validation, CER/WER/
field/table-structure evaluation metrics, and full route-layer integration
(auth → upload → analyze → admin, offline-mocked).

## Contribution Guidelines

1. Branch: `git checkout -b feature/short-description`
2. Google-style docstrings; tests for new/changed modules
3. `pytest tests/` must pass before pushing
4. Open a PR describing what changed and why
5. Never commit `.env`, model weights, or patient data — secrets live in environment variables

## License

MIT — use it, fork it, build the next MedTech OS on top of it.
