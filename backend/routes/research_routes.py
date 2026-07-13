from __future__ import annotations

import time
import uuid
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Query

router = APIRouter(prefix="", tags=["research"])

# ── Simple in-process TTL cache (5-minute TTL) ─────────────────────────────

_CACHE: dict[str, tuple[float, Any]] = {}
_TTL = 300  # seconds


def _cache_get(key: str) -> Optional[Any]:
    entry = _CACHE.get(key)
    if entry is None:
        return None
    ts, value = entry
    if time.monotonic() - ts > _TTL:
        del _CACHE[key]
        return None
    return value


def _cache_set(key: str, value: Any) -> None:
    _CACHE[key] = (time.monotonic(), value)


# ── Shared HTTP constants ───────────────────────────────────────────────────

_NCBI_HEADERS = {
    "User-Agent": "MedVault/1.0 (medvault@example.com)",
    "Accept": "application/json",
}
_TIMEOUT = 15.0


# ──────────────────────────────────────────────────────────────────────────
# 1. ClinicalTrials.gov
# ──────────────────────────────────────────────────────────────────────────

@router.get("/api/clinical-trials/search")
async def search_clinical_trials(
    condition: str = Query(..., description="Disease or condition to search"),
    phase: Optional[str] = Query(None, description="PHASE1 / PHASE2 / PHASE3 / PHASE4"),
    status: Optional[str] = Query(None, description="RECRUITING / ACTIVE / COMPLETED"),
    page_size: int = Query(10, ge=1, le=100),
) -> dict:
    cache_key = f"ct:{condition}:{phase}:{status}:{page_size}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    params: dict[str, Any] = {
        "query.cond": condition,
        "pageSize": page_size,
        "format": "json",
    }
    if phase:
        params["filter.phase"] = phase
    if status:
        params["filter.overallStatus"] = status

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                "https://clinicaltrials.gov/api/v2/studies",
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()

        studies = data.get("studies", [])
        results = []
        for s in studies:
            proto = s.get("protocolSection", {})
            id_mod = proto.get("identificationModule", {})
            status_mod = proto.get("statusModule", {})
            design_mod = proto.get("designModule", {})
            desc_mod = proto.get("descriptionModule", {})
            contacts_mod = proto.get("contactsLocationsModule", {})
            results.append(
                {
                    "nct_id": id_mod.get("nctId"),
                    "title": id_mod.get("briefTitle"),
                    "status": status_mod.get("overallStatus"),
                    "phase": design_mod.get("phases", []),
                    "brief_summary": desc_mod.get("briefSummary", "")[:300],
                    "start_date": status_mod.get("startDateStruct", {}).get("date"),
                    "completion_date": status_mod.get(
                        "completionDateStruct", {}
                    ).get("date"),
                    "url": f"https://clinicaltrials.gov/study/{id_mod.get('nctId', '')}",
                }
            )

        result = {
            "query": condition,
            "total": data.get("totalCount", len(results)),
            "results": results,
        }
    except Exception as e:
        result = {
            "query": condition,
            "total": 0,
            "results": [],
            "error": str(e),
        }

    _cache_set(cache_key, result)
    return result


# ──────────────────────────────────────────────────────────────────────────
# 2. PubMed
# ──────────────────────────────────────────────────────────────────────────

@router.get("/api/pubmed/search")
async def search_pubmed(
    query: str = Query(..., description="Search term"),
    max_results: int = Query(10, ge=1, le=50, alias="maxResults"),
) -> dict:
    cache_key = f"pm:{query}:{max_results}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_NCBI_HEADERS) as client:
            # Step 1 — esearch
            search_resp = await client.get(
                "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
                params={
                    "db": "pubmed",
                    "term": query,
                    "retmax": max_results,
                    "retmode": "json",
                    "tool": "MedVault",
                    "email": "medvault@example.com",
                },
            )
            search_resp.raise_for_status()
            search_data = search_resp.json()
            ids: list[str] = search_data.get("esearchresult", {}).get("idlist", [])

            articles: list[dict] = []
            if ids:
                # Step 2 — esummary
                summary_resp = await client.get(
                    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
                    params={
                        "db": "pubmed",
                        "id": ",".join(ids),
                        "retmode": "json",
                        "tool": "MedVault",
                        "email": "medvault@example.com",
                    },
                )
                summary_resp.raise_for_status()
                summary_data = summary_resp.json()
                result_map = summary_data.get("result", {})

                for pmid in ids:
                    item = result_map.get(pmid, {})
                    if not item:
                        continue

                    raw_authors = item.get("authors", [])
                    authors = [
                        a.get("name", "") for a in raw_authors[:3]
                    ]
                    if len(raw_authors) > 3:
                        authors.append("et al.")

                    # Extract DOI from articleids list
                    doi = None
                    for aid in item.get("articleids", []):
                        if aid.get("idtype") == "doi":
                            doi = aid.get("value")
                            break

                    articles.append(
                        {
                            "pmid": pmid,
                            "title": item.get("title", ""),
                            "authors": authors,
                            "journal": item.get("fulljournalname", item.get("source", "")),
                            "pub_date": item.get("pubdate", ""),
                            "doi": doi,
                            "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                        }
                    )

        result = {
            "query": query,
            "total": int(
                search_data.get("esearchresult", {}).get("count", len(articles))
            ),
            "results": articles,
        }
    except Exception as e:
        result = {
            "query": query,
            "total": 0,
            "results": [],
            "error": str(e),
        }

    _cache_set(cache_key, result)
    return result


# ──────────────────────────────────────────────────────────────────────────
# 3. Gene info (NCBI Gene + Ensembl)
# ──────────────────────────────────────────────────────────────────────────

@router.get("/api/genomics/gene")
async def get_gene_info(
    symbol: str = Query(..., description="HGNC gene symbol, e.g. BRCA1"),
) -> dict:
    cache_key = f"gene:{symbol.upper()}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    gene_id = None
    ncbi_info: dict = {}
    ensembl_info: dict = {}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_NCBI_HEADERS) as client:
            # Step 1 — resolve gene_id from symbol
            search_resp = await client.get(
                "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
                params={
                    "db": "gene",
                    "term": f"{symbol}[gene_name] AND Homo sapiens[organism]",
                    "retmax": 1,
                    "retmode": "json",
                    "tool": "MedVault",
                    "email": "medvault@example.com",
                },
            )
            search_resp.raise_for_status()
            ids = (
                search_resp.json().get("esearchresult", {}).get("idlist", [])
            )
            if ids:
                gene_id = ids[0]
                # Step 2 — fetch gene summary
                sum_resp = await client.get(
                    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
                    params={
                        "db": "gene",
                        "id": gene_id,
                        "retmode": "json",
                        "tool": "MedVault",
                        "email": "medvault@example.com",
                    },
                )
                sum_resp.raise_for_status()
                result_map = sum_resp.json().get("result", {})
                ncbi_info = result_map.get(gene_id, {})
    except Exception as e:
        ncbi_info = {"_error": str(e)}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            ens_resp = await client.get(
                f"https://rest.ensembl.org/lookup/symbol/homo_sapiens/{symbol}",
                params={"content-type": "application/json", "expand": "1"},
                headers={"Accept": "application/json"},
            )
            ens_resp.raise_for_status()
            ensembl_info = ens_resp.json()
    except Exception as e:
        ensembl_info = {"_error": str(e)}

    # Build unified response
    location = ""
    if ensembl_info.get("start") and ensembl_info.get("end"):
        location = (
            f"{ensembl_info.get('seq_region_name', '')}:"
            f"{ensembl_info['start']}-{ensembl_info['end']}"
            f" ({ensembl_info.get('strand', '')})"
        )

    result: dict = {
        "symbol": symbol.upper(),
        "gene_id": gene_id,
        "name": ncbi_info.get("name") or ensembl_info.get("display_name", ""),
        "description": ncbi_info.get("description", ""),
        "chromosome": (
            ncbi_info.get("chromosome")
            or ensembl_info.get("seq_region_name", "")
        ),
        "location": location,
        "summary": ncbi_info.get("summary", ""),
        "ensembl_id": ensembl_info.get("id", ""),
        "biotype": ensembl_info.get("biotype", ""),
    }
    if "_error" in ncbi_info:
        result["ncbi_error"] = ncbi_info["_error"]
    if "_error" in ensembl_info:
        result["ensembl_error"] = ensembl_info["_error"]

    _cache_set(cache_key, result)
    return result


# ──────────────────────────────────────────────────────────────────────────
# 4. ClinVar variants
# ──────────────────────────────────────────────────────────────────────────

@router.get("/api/genomics/variants")
async def get_gene_variants(
    gene: str = Query(..., description="Gene symbol, e.g. BRCA1"),
    max_results: int = Query(10, ge=1, le=50, alias="maxResults"),
) -> dict:
    cache_key = f"cv:{gene.upper()}:{max_results}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_NCBI_HEADERS) as client:
            # Step 1 — esearch ClinVar
            search_resp = await client.get(
                "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
                params={
                    "db": "clinvar",
                    "term": gene,
                    "retmax": max_results,
                    "retmode": "json",
                    "tool": "MedVault",
                    "email": "medvault@example.com",
                },
            )
            search_resp.raise_for_status()
            search_data = search_resp.json()
            ids: list[str] = search_data.get("esearchresult", {}).get("idlist", [])

            variants: list[dict] = []
            if ids:
                # Step 2 — esummary
                sum_resp = await client.get(
                    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
                    params={
                        "db": "clinvar",
                        "id": ",".join(ids),
                        "retmode": "json",
                        "tool": "MedVault",
                        "email": "medvault@example.com",
                    },
                )
                sum_resp.raise_for_status()
                result_map = sum_resp.json().get("result", {})

                for vid in ids:
                    item = result_map.get(vid, {})
                    if not item:
                        continue

                    # Clinical significance may be nested
                    germline = item.get("germline_classification", {})
                    clinical_sig = germline.get("description", "") or item.get(
                        "clinical_significance", {},
                    )
                    if isinstance(clinical_sig, dict):
                        clinical_sig = clinical_sig.get("description", "")

                    review_status = germline.get("review_status", "") or item.get(
                        "review_status", ""
                    )
                    last_evaluated = germline.get("last_evaluated", "") or item.get(
                        "last_evaluated", ""
                    )

                    # Gene info
                    gene_list = item.get("genes", [])
                    gene_name = (
                        gene_list[0].get("symbol", gene) if gene_list else gene
                    )

                    variants.append(
                        {
                            "id": vid,
                            "title": item.get("title", ""),
                            "gene": gene_name,
                            "clinical_significance": clinical_sig,
                            "review_status": review_status,
                            "last_evaluated": last_evaluated,
                            "url": f"https://www.ncbi.nlm.nih.gov/clinvar/variation/{vid}/",
                        }
                    )

        result = {
            "gene": gene.upper(),
            "total": int(
                search_data.get("esearchresult", {}).get("count", len(variants))
            ),
            "results": variants,
        }
    except Exception as e:
        result = {
            "gene": gene.upper(),
            "total": 0,
            "results": [],
            "error": str(e),
        }

    _cache_set(cache_key, result)
    return result


# ──────────────────────────────────────────────────────────────────────────
# 5. Telemedicine — Jitsi Meet room generation
# ──────────────────────────────────────────────────────────────────────────

@router.post("/api/telemedicine/room")
async def create_telemedicine_room(
    patient_name: str = Query("Patient", description="Patient display name"),
    doctor_name: str = Query("Doctor", description="Doctor display name"),
) -> dict:
    room_id = f"medvault-{uuid.uuid4().hex[:10]}"
    base_url = f"https://meet.jit.si/{room_id}"

    import urllib.parse

    patient_params = urllib.parse.urlencode({"userInfo.displayName": patient_name})
    doctor_params = urllib.parse.urlencode({"userInfo.displayName": doctor_name})

    return {
        "room_id": room_id,
        "join_url": base_url,
        "patient_join_url": f"{base_url}?{patient_params}",
        "doctor_join_url": f"{base_url}?{doctor_params}",
    }
