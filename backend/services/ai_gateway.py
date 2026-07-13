"""backend/services/ai_gateway.py — Unified AI Gateway.

Single entry point for every AI call in the system. Reads all configured AI
providers from the registry (local: ollama/llama.cpp/LM Studio/vLLM, cloud:
Gemini/OpenAI/Claude/Groq/Together/DeepSeek/custom), tries the default first,
and automatically falls back through every other configured provider on
failure or timeout. Every agent and route that talks to an LLM goes through
this module instead of instantiating a provider directly.
"""
from __future__ import annotations

import base64
import json
import re
import time
from typing import Optional

from loguru import logger

from database import get_db
from services.ai_service import build_ai


class AIGatewayError(RuntimeError):
    """Raised when every configured AI provider fails."""


def _load_ai_providers(preferred_id: str = "") -> list[dict]:
    """Return AI provider rows in try-order: preferred/default first, rest after."""
    conn = get_db()
    try:
        rows = [dict(r) for r in conn.execute(
            "SELECT * FROM providers WHERE kind='ai' ORDER BY is_default DESC, created_at ASC"
        ).fetchall()]
    except Exception:
        # providers table not migrated yet (e.g. isolated test DB) — no providers.
        return []
    finally:
        conn.close()
    for r in rows:
        r["config"] = json.loads(r["config"]) if isinstance(r["config"], str) else r["config"]
    if preferred_id:
        rows.sort(key=lambda r: 0 if r["id"] == preferred_id else 1)
    return rows


def has_ai_provider() -> bool:
    return len(_load_ai_providers()) > 0


def _looks_like_base64_image(s: str) -> bool:
    if not s or len(s) < 100:
        return False
    return bool(re.fullmatch(r"[A-Za-z0-9+/=]+", s[:256]))


class AIGateway:
    """Central, provider-agnostic AI orchestration point with automatic fallback."""

    def __init__(self, preferred_provider_id: str = "", max_attempts: int = 4):
        self._preferred_id = preferred_provider_id
        self._max_attempts = max_attempts

    def _providers(self) -> list[dict]:
        rows = _load_ai_providers(self._preferred_id)
        return rows[: self._max_attempts] if self._max_attempts else rows

    def analyze(self, prompt: str, text: str, images: list[bytes]) -> str:
        """Multi-modal analysis (prompt + OCR text + page images)."""
        providers = self._providers()
        if not providers:
            raise AIGatewayError("No AI provider configured. Add one in the Model Hub.")
        last_err: Optional[Exception] = None
        for row in providers:
            try:
                provider = build_ai(row["engine"], row["config"])
                started = time.perf_counter()
                result = provider.analyze(prompt, text, images)
                elapsed_ms = (time.perf_counter() - started) * 1000
                logger.info("AIGateway: {} ({}) answered in {:.0f}ms", row["name"], row["engine"], elapsed_ms)
                return result
            except Exception as e:
                logger.warning("AIGateway: provider {} ({}) failed, trying next: {}", row["name"], row["engine"], e)
                last_err = e
                continue
        raise AIGatewayError(f"All configured AI providers failed. Last error: {last_err}")

    def complete(self, prompt: str, input_text: str) -> str:
        """Text-agent interface matching ``llm_client.complete(prompt, input)`` — the
        contract expected by ExtractionAgent / ValidationAgent / DiagnosisAgent /
        SummaryAgent. ClassificationAgent passes a base64 image as ``input_text``."""
        images: list[bytes] = []
        text = input_text
        if _looks_like_base64_image(input_text):
            try:
                images = [base64.b64decode(input_text)]
                text = ""
            except Exception:
                pass
        return self.analyze(prompt, text, images)


def get_gateway(preferred_provider_id: str = "") -> AIGateway:
    """Construct an AIGateway. Cheap — only hits the DB when a call is made."""
    return AIGateway(preferred_provider_id=preferred_provider_id)
