"""backend/routes/hub_routes.py — Model Hub endpoints for provider ecosystem."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from database import get_db

router = APIRouter()


def _get_providers_by_kind():
    """Return providers grouped by kind with active defaults."""
    conn = get_db()
    rows = conn.execute("SELECT * FROM providers ORDER BY kind, name").fetchall()
    conn.close()
    grouped: dict[str, list[dict]] = {}
    for r in rows:
        d = dict(r)
        d["config"] = json.loads(d["config"]) if isinstance(d["config"], str) else d["config"]
        grouped.setdefault(d["kind"], []).append(d)
    return grouped


@router.get("/api/hub/status")
def hub_status():
    """Returns status of all provider categories with counts and active defaults."""
    grouped = _get_providers_by_kind()
    all_kinds = ["ocr", "ai", "preprocessing", "diagnosis", "classifier"]
    result = {}
    for kind in all_kinds:
        providers = grouped.get(kind, [])
        default = next((p for p in providers if p.get("is_default")), None)
        result[kind] = {
            "count": len(providers),
            "active_default": {
                "id": default["id"],
                "name": default["name"],
                "engine": default["engine"],
            } if default else None,
            "providers": [
                {"id": p["id"], "name": p["name"], "engine": p["engine"], "is_default": bool(p.get("is_default"))}
                for p in providers
            ],
        }
    return result


@router.get("/api/hub/health")
def hub_health():
    """Checks connectivity of each configured provider."""
    grouped = _get_providers_by_kind()
    results: dict[str, list[dict]] = {}

    for kind, providers in grouped.items():
        kind_results = []
        for p in providers:
            status = _check_provider_health(kind, p["engine"], p.get("config", {}))
            kind_results.append({
                "id": p["id"],
                "name": p["name"],
                "engine": p["engine"],
                "status": status["status"],
                "message": status["message"],
            })
        results[kind] = kind_results

    return results


@router.post("/api/hub/test/{provider_id}")
def hub_test_provider(provider_id: str):
    """Test a specific provider with a sample input."""
    conn = get_db()
    row = conn.execute("SELECT * FROM providers WHERE id=?", (provider_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Provider not found")
    p = dict(row)
    p["config"] = json.loads(p["config"]) if isinstance(p["config"], str) else p["config"]

    kind = p["kind"]
    engine = p["engine"]
    config = p["config"]

    if kind == "ai":
        return _test_ai_provider(engine, config)
    elif kind == "ocr":
        return _test_ocr_provider(engine, config)
    else:
        return {"status": "ok", "message": f"No active test available for kind={kind}, engine={engine}"}


@router.get("/api/hub/recommendations")
def hub_recommendations():
    """Returns recommended providers based on available hardware (GPU/CPU)."""
    gpu_available = False
    gpu_name = "none"
    try:
        import torch
        gpu_available = torch.cuda.is_available()
        if gpu_available:
            gpu_name = torch.cuda.get_device_name(0)
    except ImportError:
        pass

    recs: dict[str, list[dict]] = {"ocr": [], "ai": []}

    if gpu_available:
        recs["ocr"].extend([
            {"engine": "paddleocr", "name": "PaddleOCR (GPU)", "reason": f"GPU detected ({gpu_name}); fast printed-text OCR"},
            {"engine": "qwen_vl", "name": "Qwen-VL", "reason": "GPU available; best for handwritten documents"},
            {"engine": "easyocr", "name": "EasyOCR (GPU)", "reason": "Good multi-language support with GPU acceleration"},
            {"engine": "surya", "name": "Surya OCR", "reason": "High-quality OCR, benefits from GPU"},
            {"engine": "pipeline", "name": "MedVault Pipeline", "reason": "Auto-routes printed/handwritten with classifier"},
        ])
        recs["ai"].extend([
            {"engine": "ollama", "name": "Ollama (Local)", "reason": "Run models locally on GPU"},
            {"engine": "vllm", "name": "vLLM", "reason": "High-throughput local inference with GPU"},
        ])
    else:
        recs["ocr"].extend([
            {"engine": "tesseract", "name": "Tesseract", "reason": "CPU-only, no GPU required; good baseline"},
            {"engine": "doctr", "name": "docTR", "reason": "Works on CPU; good accuracy"},
            {"engine": "easyocr", "name": "EasyOCR (CPU)", "reason": "Multi-language OCR, works without GPU"},
        ])
        recs["ai"].extend([
            {"engine": "llama_cpp", "name": "llama.cpp", "reason": "Optimized CPU inference for local models"},
            {"engine": "lmstudio", "name": "LM Studio", "reason": "Easy local model management, CPU-friendly"},
        ])

    # Cloud AI options are always recommended
    recs["ai"].extend([
        {"engine": "gemini", "name": "Google Gemini", "reason": "Fast, cost-effective cloud AI with vision"},
        {"engine": "openai", "name": "OpenAI", "reason": "GPT-4o for high-accuracy medical analysis"},
        {"engine": "anthropic", "name": "Anthropic Claude", "reason": "Strong reasoning for complex reports"},
        {"engine": "groq", "name": "Groq", "reason": "Ultra-fast inference for quick turnaround"},
        {"engine": "deepseek", "name": "DeepSeek", "reason": "Cost-effective cloud AI"},
    ])

    return {
        "hardware": {"gpu_available": gpu_available, "gpu_name": gpu_name},
        "recommendations": recs,
    }


# ── Internal helpers ──────────────────────────────────────────


def _check_provider_health(kind: str, engine: str, config: dict) -> dict:
    """Check health of a single provider. Returns {status, message}."""
    if kind == "ocr":
        return _check_ocr_health(engine, config)
    elif kind == "ai":
        return _check_ai_health(engine, config)
    return {"status": "unknown", "message": f"No health check for kind={kind}"}


def _check_ocr_health(engine: str, config: dict) -> dict:
    """Check OCR provider health by verifying imports."""
    import_map = {
        "tesseract": "pytesseract",
        "easyocr": "easyocr",
        "surya": "surya",
        "paddleocr": "paddleocr",
        "qwen_vl": "transformers",
        "doctr": "doctr",
        "pipeline": "paddleocr",
        "auto": "paddleocr",
    }
    pkg = import_map.get(engine)
    if not pkg:
        return {"status": "unknown", "message": f"No import check for engine={engine}"}
    try:
        __import__(pkg)
        return {"status": "ok", "message": f"{pkg} is installed"}
    except ImportError:
        return {"status": "error", "message": f"{pkg} is not installed"}


def _check_ai_health(engine: str, config: dict) -> dict:
    """Check AI provider health by verifying API key presence or local connectivity."""
    local_engines = {"ollama", "llama_cpp", "lmstudio", "vllm"}
    if engine in local_engines:
        base_url = config.get("base_url", "")
        if not base_url:
            defaults = {
                "ollama": "http://localhost:11434",
                "llama_cpp": "http://localhost:8080",
                "lmstudio": "http://localhost:1234",
                "vllm": "http://localhost:8000",
            }
            base_url = defaults.get(engine, "")
        try:
            import httpx
            resp = httpx.get(f"{base_url}/v1/models", timeout=5)
            if resp.status_code == 200:
                return {"status": "ok", "message": f"Server reachable at {base_url}"}
            return {"status": "warning", "message": f"Server returned {resp.status_code}"}
        except Exception as e:
            return {"status": "error", "message": f"Cannot reach {base_url}: {e}"}
    else:
        api_key = config.get("api_key", "")
        if api_key and len(api_key) > 5:
            return {"status": "ok", "message": "API key configured"}
        return {"status": "warning", "message": "No API key configured"}


def _test_ai_provider(engine: str, config: dict) -> dict:
    """Test an AI provider with a simple prompt."""
    try:
        from services.ai_service import build_ai
        provider = build_ai(engine, config)
        result = provider.analyze("Say 'hello' in one word.", "", [])
        return {"status": "ok", "response": result[:200]}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def _test_ocr_provider(engine: str, config: dict) -> dict:
    """Test an OCR provider by checking if it can be instantiated."""
    try:
        from services.ocr_service import build_ocr
        _provider = build_ocr(engine, config)
        return {"status": "ok", "message": f"Engine '{engine}' instantiated successfully"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
