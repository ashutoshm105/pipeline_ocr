# MedVault — The Open-Source Medical Intelligence Platform

**The Ollama of MedTech** — a fully plug-and-play, locally-running medical OCR + AI analysis ecosystem. Swap OCR engines, AI models, preprocessing pipelines, and diagnosis modules like building blocks.

Built with FastAPI + React + TypeScript + SQLite. Runs entirely on your machine. Your data never leaves your device.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.12-blue.svg)
![React](https://img.shields.io/badge/react-19-61dafb.svg)

## What Makes This Different

| Feature | MedVault | Traditional EMR |
|---------|----------|-----------------|
| **OCR Engines** | 7 swappable (PaddleOCR, Tesseract, EasyOCR, Surya, Qwen-VL, docTR, auto-router) | 1 locked vendor |
| **AI Models** | 10+ plug-and-play (Gemini, OpenAI, Claude, Ollama, Groq, Together, DeepSeek, llama.cpp, LM Studio, vLLM) | Cloud-only, 1 provider |
| **Preprocessing** | 3 pipelines (simple, default, advanced with EXIF/perspective/bilateral) | Fixed |
| **Diagnosis** | Rule-based (34 conditions) + LLM-assisted | None |
| **Data** | 100% local SQLite, your machine | Cloud vendor lock-in |
| **Cost** | Free + your compute | $$$/month |

## Quick Start

```bash
# Clone
git clone https://github.com/ashutoshm105/pipeline_ocr.git
cd pipeline_ocr

# macOS / Linux
chmod +x start.sh && ./start.sh

# Windows
.\start.ps1
```

Backend: http://localhost:8000 | Frontend: http://localhost:5173

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Model Hub UI                      │
│  OCR Engines │ AI Models │ Preprocessing │ Diagnosis │
├─────────────────────────────────────────────────────┤
│                  FastAPI Backend                     │
│  7 Route Modules │ 12 Pipeline Agents │ 3 Services  │
├─────────────────────────────────────────────────────┤
│              Provider Registry (SQLite)              │
│  Plug & Play: add/remove/swap any engine from UI    │
├─────────────────────────────────────────────────────┤
│                  Processing Pipeline                 │
│  Preprocess → Classify → OCR Route → Extract →      │
│  Validate → Diagnose → [Summary] → [Evaluate]       │
└─────────────────────────────────────────────────────┘
```

## Plug-and-Play Provider System

### OCR Engines
| Engine | Type | GPU | Install |
|--------|------|-----|---------|
| **PaddleOCR** | Printed text | ✅ | `pip install paddleocr paddlepaddle-gpu` |
| **Qwen2.5-VL** | Handwritten | ✅ | Included (torch + transformers) |
| **Tesseract** | General | ❌ | `pip install pytesseract` + [binary](https://github.com/tesseract-ocr/tesseract) |
| **EasyOCR** | Multi-language | ✅ | `pip install easyocr` |
| **Surya** | Transformer | ✅ | `pip install surya-ocr` |
| **docTR** | Document | ✅ | `pip install python-doctr[torch]` |
| **Auto Router** | Smart routing | ✅ | Built-in (classifies → routes to best engine) |

### AI Models
| Provider | Type | Cost | Install |
|----------|------|------|---------|
| **Ollama** | Local LLM | Free | [ollama.com](https://ollama.com) |
| **llama.cpp** | Local GGUF | Free | Local server |
| **LM Studio** | Local GUI | Free | [lmstudio.ai](https://lmstudio.ai) |
| **vLLM** | Local server | Free | `pip install vllm` |
| **Gemini** | Cloud API | Pay | `pip install google-generativeai` |
| **OpenAI** | Cloud API | Pay | httpx (included) |
| **Claude** | Cloud API | Pay | `pip install anthropic` |
| **Groq** | Cloud API | Free tier | httpx (included) |
| **Together** | Cloud API | Pay | httpx (included) |
| **DeepSeek** | Cloud API | Pay | httpx (included) |

### How to Add a Provider
1. Go to **Model Hub** in the UI
2. Click **+ Add** under the category you want
3. Select an engine, fill in config (API key, model name, endpoint)
4. Click **Test** to verify connectivity
5. Set as **Default** to use it in the pipeline

## Full Feature Suite

### Core (Working)
- 🔬 **OCR Workbench** — upload any medical document, see full pipeline output
- 👨‍⚕️ **Doctor Portal** — patient list, report analysis, structured data
- 🏥 **Patient Portal** — upload reports, view history, no-auth test mode
- 📊 **Dashboard** — analytics, recent patients, appointments
- ⚙️ **Model Hub** — plug-and-play provider management
- 💊 **Drug Interactions** — check multi-drug interactions
- 📋 **Patient Chart** — allergies, conditions, medications, vitals, labs
- 💬 **Messages** — doctor-patient secure messaging
- 📝 **Audit Log** — full action trail
- 📈 **Advanced Analytics** — system-wide statistics
- 🔑 **Auth** — JWT login for patients + doctors, no-auth test mode

### Specialty Pages (UI Ready, API Stubs)
- 🩺 Telemedicine (video consult UI)
- 🧬 Genomics (gene variant viewer)
- 🔬 Clinical Trials (trial search/enrollment)
- 🩻 Medical Imaging (DICOM viewer placeholder)
- 🧪 Lab Interpretation (reference range panels)
- 🔬 Research Pipeline (experiment tracker)
- 💊 Prescription Refills (refill request flow)
- 📄 Consent Forms (template builder)
- 📚 Patient Education (article library)
- 📉 Vitals Monitor (real-time vital simulation)

## API Endpoints

| Category | Endpoints |
|----------|-----------|
| Auth | POST `/api/patient/register`, `/api/patient/login`, `/api/doctor/register`, `/api/doctor/login` |
| Reports | POST `/api/patient/upload`, GET `/api/patient/reports`, GET `/api/file/{id}` |
| Analysis | POST `/api/doctor/analyze`, POST `/api/doctor/ocr-structured` |
| Pipeline | POST `/api/pipeline/run`, GET `/api/gpu/status`, POST `/api/gpu/preload` |
| Hub | GET `/api/hub/status`, GET `/api/hub/health`, POST `/api/hub/test/{id}`, GET `/api/hub/recommendations` |
| Providers | GET/POST `/api/providers`, PUT/DELETE `/api/providers/{id}`, GET `/api/providers/engines` |
| Patient Data | Allergies, conditions, medications, vitals, prescriptions, notes, appointments, labs, diagnoses, referrals, invoices, insurance, export, FHIR |
| Admin | Messages, notifications, drug interactions, ICD-10, templates, audit log, analytics |
| Test (no auth) | POST `/api/test/upload`, GET `/api/test/reports` |
| System | GET `/health`, GET `/ready` |

## Prerequisites

- **Python 3.12+**
- **Node.js 20+**
- **NVIDIA GPU** (optional — recommended for PaddleOCR + Qwen-VL; everything runs on CPU too)

## License

MIT — use it, fork it, build on it.
