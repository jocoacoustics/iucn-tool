# -*- coding: utf-8 -*-
# Motor basado directamente en APIv4_20260113151100.py, probado por el usuario.
# Única extensión funcional de esta copia: progress_callback opcional para la UX web.
"""
Created on Tue Jan 13 15:10:27 2026

@author: Pedro Galindo Vera
"""

from __future__ import annotations

import sys, time, re, traceback, threading
from dataclasses import dataclass
from contextlib import contextmanager
from typing import Iterable, Tuple, Dict, Any
from urllib.parse import quote
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
import pandas as pd
from tqdm.auto import tqdm

API_BASE = "https://api.iucnredlist.org/api/v4"

# ============================================================
# 0) Utils
# ============================================================

def _log_err(msg: str) -> None:
    print(f"[IUCN] {msg}", file=sys.stderr)

def _none_if_blank(s: Any) -> Any:
    return None if (s is None or (isinstance(s, str) and s.strip() == "")) else s

def _as_text(x: Any) -> str | None:
    x = _none_if_blank(x)
    return str(x).strip() if x is not None else None

def _split_binomial(name: str) -> Tuple[str|None, str|None, str|None]:
    """Divide 'Genus species [infra...]' → (genus, species, infra)."""
    if not isinstance(name, str) or not name.strip():
        return None, None, None
    parts = re.findall(r"[A-Za-z\-\.’'×]+", name.strip())
    if len(parts) < 2:
        return None, None, None
    genus, species = parts[0], parts[1]
    infra = " ".join(parts[2:]) if len(parts) > 2 else None
    return genus, species, infra

def _first_list_of_dicts(payload: Dict[str, Any]) -> list[dict]:
    """Encuentra la lista de evaluaciones en respuestas heterogéneas."""
    if not isinstance(payload, dict):
        return []
    for k in ("assessments", "results", "data"):
        v = payload.get(k)
        if isinstance(v, list) and v and isinstance(v[0], dict):
            return v
    for v in payload.values():
        if isinstance(v, list) and v and isinstance(v[0], dict):
            if any(("assessment_id" in d) or ("latest" in d) or ("red_list_category_code" in d) for d in v):
                return v
    return []

def _extract_sis_id(x: Dict[str, Any]) -> int | None:
    if not isinstance(x, dict):
        return None
    for k in ("sis_taxon_id", "taxon_id", "id", "sis_id"):
        v = x.get(k)
        if v is None:
            continue
        try:
            return int(v)
        except Exception:
            return None
    return None

def _year_from_item(x: Dict[str, Any]) -> int:
    if not isinstance(x, dict):
        return -10**9
    for k in ("year_published", "year"):
        y = x.get(k)
        if y is not None:
            try:
                return int(y)
            except Exception:
                pass
    d = x.get("assessment_date")
    if isinstance(d, str) and len(d) >= 4 and d[:4].isdigit():
        return int(d[:4])
    return -10**9

def _is_global(ass: Dict[str, Any]) -> bool:
    """En v4, 'scopes' suele indicar global. Si no existe, asumimos True."""
    if not isinstance(ass, dict):
        return False
    scopes = ass.get("scopes")
    if not isinstance(scopes, list) or not scopes:
        return True  # si no hay scopes, mejor no filtrar y tomarlo como usable
    for sc in scopes:
        if not isinstance(sc, dict):
            continue
        code = (sc.get("code") or "").strip()
        if code == "1":  # Global
            return True
    return False

def _pick_latest(assessments: list[dict]) -> dict | None:
    """Elige la evaluación más reciente (prefiere latest & global)."""
    if not assessments:
        return None

    def _is_latest(a: dict) -> bool:
        v = a.get("latest", "")
        return str(v).lower() == "true" or v is True

    pool = [a for a in assessments if _is_latest(a) and _is_global(a)]
    if not pool:
        pool = [a for a in assessments if _is_latest(a)]
    if not pool:
        glob = [a for a in assessments if _is_global(a)]
        pool = glob if glob else assessments
    return sorted(pool, key=_year_from_item, reverse=True)[0]

# ============================================================
# 1) Taxonomía (SIN llamada extra)
# ============================================================

_TAXON_KEYS = {
    "kingdom": ["kingdom_name", "kingdom"],
    "phylum":  ["phylum_name", "phylum"],
    "class":   ["class_name", "class"],
    "order":   ["order_name", "order"],
    "family":  ["family_name", "family"],
    "genus":   ["genus_name", "genus"],
    "species": ["species_name", "species"],
    "infra":   ["infra_name", "infraspecies_name", "subspecies_name", "infra"],
}

_TAXON_LIST_KEYS = (
    "taxonomy", "classification", "classifications", "lineage",
    "ancestors", "taxonomic_hierarchy", "taxonomicHierarchy"
)

def _norm_rank(x: Any) -> str | None:
    if x is None:
        return None
    s = str(x).strip().lower().replace(" ", "_")
    if s in ("classis",):
        return "class"
    if s in ("infraspecies", "infraspecific", "subspecies", "sub_specie"):
        return "infra"
    return s

def _taxonomy_from_taxon(taxon: Dict[str, Any] | None) -> Dict[str, Any]:
    """
    Extrae taxonomía básica desde objeto taxon. No asume un esquema fijo.
    """
    out = {k: None for k in _TAXON_KEYS.keys()}
    meta = {
        "taxonRank": None,
        "authority": None,
        "scientificNameTaxon": None,
        "taxonId": None,
    }

    if not isinstance(taxon, dict):
        return {**out, **meta}

    meta["taxonRank"] = _as_text(taxon.get("rank") or taxon.get("taxon_rank") or taxon.get("taxonRank"))
    meta["authority"] = _as_text(taxon.get("authority") or taxon.get("scientific_name_authority"))
    meta["scientificNameTaxon"] = _as_text(taxon.get("scientific_name") or taxon.get("taxon_scientific_name"))
    meta["taxonId"] = _extract_sis_id(taxon)

    # 1) llaves directas
    for rank, keys in _TAXON_KEYS.items():
        for k in keys:
            v = _as_text(taxon.get(k))
            if v:
                out[rank] = v
                break

    # 2) listas tipo lineage/taxonomy
    for lk in _TAXON_LIST_KEYS:
        lst = taxon.get(lk)
        if isinstance(lst, list):
            for it in lst:
                if not isinstance(it, dict):
                    continue
                r = _norm_rank(it.get("rank") or it.get("taxon_rank") or it.get("level") or it.get("code"))
                nm = _as_text(it.get("scientific_name") or it.get("name") or it.get("taxon_name"))
                if r in out and not out[r] and nm:
                    out[r] = nm

    # 3) fallback binomial
    if meta["scientificNameTaxon"]:
        g, s, infra = _split_binomial(meta["scientificNameTaxon"])
        out["genus"] = out["genus"] or g
        out["species"] = out["species"] or s
        out["infra"] = out["infra"] or infra

    return {**out, **meta}

# ============================================================
# 2) TokenPool (multi-token + cooldown)
# ============================================================

@dataclass(frozen=True)
class _Lease:
    token: str
    headers: Dict[str, str]

class TokenPool:
    """
    Pool threadsafe de tokens:
    - Limita concurrencia por token (per_token_concurrency)
    - Maneja cooldown por token cuando recibe 429 (Retry-After)
    """
    def __init__(self, tokens: Iterable[str], *, use_bearer: bool = False, per_token_concurrency: int = 1):
        toks = [t.strip() for t in tokens if isinstance(t, str) and t.strip()]
        if not toks:
            raise ValueError("TokenPool: lista de tokens vacía.")
        self.tokens = list(dict.fromkeys(toks))  # unique preservando orden
        self.use_bearer = use_bearer
        self.per_token_concurrency = max(1, int(per_token_concurrency))

        self._sems = {t: threading.BoundedSemaphore(self.per_token_concurrency) for t in self.tokens}
        self._next_ok = {t: 0.0 for t in self.tokens}
        self._cond = threading.Condition()

    def _headers_for(self, token: str) -> Dict[str, str]:
        return {"Authorization": f"Bearer {token}"} if self.use_bearer else {"Authorization": token}

    def cooldown(self, token: str, seconds: float) -> None:
        seconds = float(seconds) if seconds is not None else 0.0
        seconds = max(0.0, seconds)
        with self._cond:
            self._next_ok[token] = max(self._next_ok.get(token, 0.0), time.time() + seconds)
            self._cond.notify_all()

    @contextmanager
    def lease(self):
        token = None
        sem = None
        while True:
            with self._cond:
                now = time.time()
                chosen = None
                for t in self.tokens:
                    if self._next_ok.get(t, 0.0) <= now:
                        s = self._sems[t]
                        if s.acquire(blocking=False):
                            chosen = (t, s)
                            break

                if chosen:
                    token, sem = chosen
                    break

                soonest = min(self._next_ok.values()) if self._next_ok else now + 0.25
                wait_s = max(0.05, min(0.5, soonest - now))
                self._cond.wait(timeout=wait_s)

        try:
            yield _Lease(token=token, headers=self._headers_for(token))
        finally:
            sem.release()
            with self._cond:
                self._cond.notify_all()

AuthProvider = Dict[str, str] | TokenPool

# ============================================================
# 3) HTTP robusto (keep-alive por thread + rotación tokens)
# ============================================================

def _make_session() -> requests.Session:
    # Session por thread: mejor keep-alive y menos overhead
    s = requests.Session()
    # puedes ajustar headers comunes si quieres
    s.headers.update({"Accept": "application/json"})
    return s

def _req(
    session: requests.Session,
    url: str,
    auth: AuthProvider,
    params: Dict[str, Any] | None = None,
    *,
    max_tries: int = 4,
    base_sleep: float = 0.6,
    timeout: int = 30,
    context: str = "",
) -> requests.Response:
    """
    GET con reintentos:
    - 429: respeta Retry-After; si auth es TokenPool, pone cooldown a ese token y rota
    - 5xx: backoff exponencial
    - 4xx (excepto 408/429): NO reintenta; levanta
    """
    last_exc = None

    for i in range(1, max_tries + 1):
        lease_ctx = None
        try:
            if isinstance(auth, TokenPool):
                lease_ctx = auth.lease()
                L = lease_ctx.__enter__()
                headers = L.headers
                token_used = L.token
            else:
                headers = auth
                token_used = None

            r = session.get(url, headers=headers, params=params, timeout=timeout)

            if r.status_code == 429:
                ra = r.headers.get("Retry-After")
                wait_s = float(ra) if ra else base_sleep * (2 ** (i - 1))
                wait_s = min(wait_s, 10.0)

                _log_err(f"429 Too Many Requests{f' ({context})' if context else ''}. "
                         f"{('Token cooldown '+str(wait_s)+'s. ') if token_used else ''}Reintentando…")

                if isinstance(auth, TokenPool) and token_used:
                    auth.cooldown(token_used, wait_s)

                time.sleep(wait_s)
                continue

            if 400 <= r.status_code < 500 and r.status_code not in (408, 429):
                if r.status_code in (401, 403):
                    _log_err(f"{r.status_code} {'Unauthorized' if r.status_code==401 else 'Forbidden'} "
                             f"{f'({context})' if context else ''}. Revisa token(s).")
                r.raise_for_status()

            if 500 <= r.status_code < 600:
                _log_err(f"{r.status_code} servidor IUCN{f' ({context})' if context else ''}. Reintento #{i}…")
                time.sleep(base_sleep * (2 ** (i - 1)))
                continue

            r.raise_for_status()
            return r

        except requests.HTTPError as e:
            last_exc = e
            st = getattr(e.response, "status_code", None)
            if st and st not in (408, 429) and 400 <= st < 500:
                rid = getattr(e.response, "headers", {}).get("x-request-id")
                _log_err(f"HTTP {st}{f' ({context})' if context else ''}. {('(x-request-id: '+rid+')' if rid else '')}")
                raise
            if i == max_tries:
                rid = getattr(e.response, "headers", {}).get("x-request-id") if getattr(e, "response", None) else None
                _log_err(f"HTTP error tras {max_tries} intentos{f' ({context})' if context else ''}: "
                         f"{st} - {str(e)}{(' (x-request-id: '+rid+')' if rid else '')}")
                raise
            time.sleep(base_sleep * (2 ** (i - 1)))

        except requests.RequestException as e:
            last_exc = e
            if i == max_tries:
                _log_err(f"Error de red tras {max_tries} intentos{f' ({context})' if context else ''}: {e}")
                raise
            time.sleep(base_sleep * (2 ** (i - 1)))

        finally:
            if lease_ctx is not None:
                lease_ctx.__exit__(None, None, None)

    raise RuntimeError(last_exc or "Unknown error")

# ============================================================
# 4) Descripción de categoría SIN endpoint /assessment/{id}
#    (para que sea 1 sola llamada por nombre)
# ============================================================

IUCN_CAT_DESC_EN = {
    "EX": "Extinct",
    "EW": "Extinct in the Wild",
    "CR": "Critically Endangered",
    "EN": "Endangered",
    "VU": "Vulnerable",
    "NT": "Near Threatened",
    "LC": "Least Concern",
    "DD": "Data Deficient",
    "NE": "Not Evaluated",
    # a veces aparecen:
    "RE": "Regionally Extinct",
    "NA": "Not Applicable",
}

# ============================================================
# 5) Llamada única por nombre: /taxa/scientific_name
#    (con fallback raro a /taxa/sis solo si lo necesitas)
# ============================================================

def _taxa_scientific_name_onecall(
    session: requests.Session,
    name: str,
    auth: AuthProvider,
    *,
    timeout: int,
    max_tries: int,
    allow_sis_fallback: bool = True,  # fallback raro (solo si items vacíos y hay sis_id)
) -> Dict[str, Any]:
    """
    Retorna:
      {
        "items": list[dict],
        "taxon": dict|None,
        "sis_id": int|None,
        "api_sci_name": str|None
      }
    """
    genus, species, infra = _split_binomial(name)

    req_kw = dict(timeout=timeout, max_tries=max_tries)

    # preferido: genus/species (más estable)
    if genus and species:
        params = {"genus_name": genus, "species_name": species}
        if infra:
            params["infra_name"] = infra

        payload = _req(
            session,
            f"{API_BASE}/taxa/scientific_name",
            auth,
            params=params,
            context=f"genus/species={genus} {species}",
            **req_kw
        ).json()

        items = _first_list_of_dicts(payload)
        taxon = payload.get("taxon") if isinstance(payload, dict) else None
        sis_id = (_extract_sis_id(taxon or {}) or _extract_sis_id(payload) or (items and _extract_sis_id(items[0])))
        api_sci_name = _none_if_blank((taxon or {}).get("scientific_name")) if isinstance(taxon, dict) else None

        # fallback raro: si no vino lista pero sí sis_id
        if allow_sis_fallback and (not items) and sis_id:
            payload2 = _req(
                session,
                f"{API_BASE}/taxa/sis/{int(sis_id)}",
                auth,
                context=f"sis={sis_id}",
                **req_kw
            ).json()
            items2 = _first_list_of_dicts(payload2)
            taxon2 = payload2.get("taxon") if isinstance(payload2, dict) else None
            return {
                "items": items2,
                "taxon": taxon or taxon2,
                "sis_id": sis_id,
                "api_sci_name": api_sci_name or _none_if_blank((taxon2 or {}).get("scientific_name")) if isinstance(taxon2, dict) else api_sci_name,
            }

        return {"items": items, "taxon": taxon, "sis_id": sis_id, "api_sci_name": api_sci_name}

    # último recurso: path (puede 404)
    try:
        payload = _req(
            session,
            f"{API_BASE}/taxa/scientific_name/{quote(name)}",
            auth,
            context=f"name={name}",
            **req_kw
        ).json()
        items = _first_list_of_dicts(payload)
        taxon = payload.get("taxon") if isinstance(payload, dict) else None
        sis_id = _extract_sis_id(taxon or {}) or _extract_sis_id(payload) or (items and _extract_sis_id(items[0]))
        api_sci_name = _none_if_blank((taxon or {}).get("scientific_name")) if isinstance(taxon, dict) else None
        return {"items": items, "taxon": taxon, "sis_id": sis_id, "api_sci_name": api_sci_name}
    except requests.HTTPError as e:
        if getattr(e.response, "status_code", None) in (404, 400):
            return {"items": [], "taxon": None, "sis_id": None, "api_sci_name": None}
        raise

# ============================================================
# 6) FUNCIÓN PRINCIPAL ULTRA-RÁPIDA (1 llamada por especie)
# ============================================================

def iucn_assessments_wide_fast(
    names: Iterable[str] | pd.Series | pd.DataFrame,
    *,
    token: str | Iterable[str],
    column_names: str | None = None,  # si pasas DataFrame, nombre de la columna con nombres científicos
    use_bearer: bool = False,
    max_workers: int = 8,
    timeout: int = 25,
    max_tries: int = 4,
    include_diagnostics: bool = True,
    include_taxonomy: bool = True,
    per_token_concurrency: int = 1,
    pause_between: float = 0.0,
    allow_sis_fallback: bool = True,  # fallback raro (puede hacer 2da llamada solo en casos especiales)
    progress_callback=None,  # callback opcional: (done, total, name, record)
) -> pd.DataFrame:
    """
    MODO ACELERADO AL MÁXIMO:
    - Por defecto NO llama /assessment/{id} (evita 2da llamada)
    - Categoría y año salen del summary del endpoint /taxa/scientific_name
    - Taxonomía sale del objeto 'taxon' del mismo payload (sin costo extra)

    Devuelve DataFrame ancho con:
      scientificNameConsulted, scientificNameApiFound, sisTaxonId,
      lastAssessmentYear, lastAssessmentCode, lastAssessmentDesc,
      lastAssessmentId, lastAssessmentUrl,
      (taxonomía si include_taxonomy=True),
      assessmentYYYY ... (código por año)
    """

    # ---- preparar entrada ----
    if isinstance(names, pd.DataFrame):
        assert column_names, "If you pass a DataFrame, provide column_names with the scientific names column."
        series = names[column_names].astype(str)
    elif isinstance(names, pd.Series):
        series = names.astype(str)
    else:
        series = pd.Series(list(names), dtype="string")

    series = series.fillna("").astype(str)
    original_idx = series.index.tolist()
    normalized = series.str.strip()

    # ---- auth ----
    if isinstance(token, str):
        auth: AuthProvider = {"Authorization": f"Bearer {token}"} if use_bearer else {"Authorization": token}
        n_tokens = 1
        pool_mode = False
    else:
        auth = TokenPool(token, use_bearer=use_bearer, per_token_concurrency=per_token_concurrency)
        n_tokens = len(auth.tokens)
        pool_mode = True

    # ---- únicos ----
    unique_names = pd.Index(normalized.unique())

    # ---- workers efectivos (cap razonable) ----
    max_workers_eff = max(1, int(max_workers))
    if pool_mode:
        # solo 1 request por nombre (casi siempre), así que no inflar demasiado
        max_workers_eff = min(max_workers_eff, n_tokens * per_token_concurrency * 4)
        max_workers_eff = max(1, int(max_workers_eff))

    # ---- salidas ----
    results_by_name: Dict[str, Dict[str, Any]] = {}
    all_years: set[int] = set()

    # ---- worker ----
    def _work(nm: str) -> Dict[str, Any]:
        nm = (nm or "").strip()

        base = dict(
            scientificNameConsulted=nm,
            scientificNameApiFound=None,
            sisTaxonId=float("nan"),
            lastAssessmentYear=float("nan"),
            lastAssessmentCode=None,
            lastAssessmentDesc=None,
            lastAssessmentId=float("nan"),
            lastAssessmentUrl=None,
            _year_map={},
        )
        if include_taxonomy:
            base.update({
                "kingdom": None, "phylum": None, "class": None, "order": None,
                "family": None, "genus": None, "species": None, "infra": None,
                "taxonRank": None, "authority": None, "taxonId": float("nan"),
                "scientificNameTaxon": None,
            })
        if include_diagnostics:
            base.update(httpStatus=None, note=None)

        if not nm:
            if include_diagnostics:
                base["note"] = "empty name"
            return base

        session = _make_session()
        try:
            payload = _taxa_scientific_name_onecall(
                session,
                nm,
                auth,
                timeout=timeout,
                max_tries=max_tries,
                allow_sis_fallback=allow_sis_fallback
            )

            items = payload.get("items") or []
            taxon = payload.get("taxon")
            sis_id = payload.get("sis_id")
            api_sci_name = payload.get("api_sci_name")

            # taxonomía (0 llamadas extra)
            if include_taxonomy:
                tx = _taxonomy_from_taxon(taxon if isinstance(taxon, dict) else None)
                base.update({
                    "kingdom": tx["kingdom"],
                    "phylum": tx["phylum"],
                    "class": tx["class"],
                    "order": tx["order"],
                    "family": tx["family"],
                    "genus": tx["genus"],
                    "species": tx["species"],
                    "infra": tx["infra"],
                    "taxonRank": tx["taxonRank"],
                    "authority": tx["authority"],
                    "taxonId": float(tx["taxonId"]) if tx["taxonId"] is not None else float("nan"),
                    "scientificNameTaxon": tx["scientificNameTaxon"],
                })

            base["scientificNameApiFound"] = _none_if_blank(api_sci_name) or _none_if_blank((tx.get("scientificNameTaxon") if include_taxonomy else None))
            base["sisTaxonId"] = float(sis_id) if sis_id is not None else float("nan")

            if include_diagnostics:
                base["httpStatus"] = 200  # si llegamos aquí sin exception, fue ok
                base["note"] = None

            if not items:
                if include_diagnostics:
                    base["note"] = "no assessments found for this name"
                return base

            # filtrar global si existe, si no usar todo
            items_use = [a for a in items if _is_global(a)] or items

            # mapa año -> categoría (código)
            year_map: Dict[int, str | None] = {}
            for a in items_use:
                y = _year_from_item(a)
                if y < -10**8:
                    continue
                code = _none_if_blank(a.get("red_list_category_code"))
                if code:
                    year_map[int(y)] = str(code).strip()
                    all_years.add(int(y))

            base["_year_map"] = year_map

            # best/latest
            best = _pick_latest(items_use)
            if not best:
                return base

            code = _none_if_blank(best.get("red_list_category_code"))
            year_latest = _year_from_item(best)
            aid = best.get("assessment_id") or best.get("id")
            url = _none_if_blank(best.get("url"))

            try:
                aid_int = int(aid) if aid is not None else None
            except Exception:
                aid_int = None

            base["lastAssessmentYear"] = float(year_latest) if year_latest and year_latest > -10**8 else float("nan")
            base["lastAssessmentCode"] = code
            base["lastAssessmentDesc"] = IUCN_CAT_DESC_EN.get(str(code).strip(), None) if code else None
            base["lastAssessmentId"] = float(aid_int) if aid_int is not None else float("nan")
            base["lastAssessmentUrl"] = url

            return base

        except requests.HTTPError as e:
            st = getattr(e.response, "status_code", None)
            rid = getattr(e.response, "headers", {}).get("x-request-id")
            _log_err(f"HTTP {st} for '{nm}'{(' (x-request-id: '+rid+')' if rid else '')}")
            if include_diagnostics:
                base.update(httpStatus=st, note=f"HTTP {st}")
            return base

        except Exception as e:
            _log_err(f"Exception for '{nm}': {e}\n{traceback.format_exc(limit=2)}")
            if include_diagnostics:
                base.update(note=f"exception: {e}")
            return base

        finally:
            session.close()
            if pause_between and pause_between > 0:
                time.sleep(pause_between)

    # ---- ejecutar con progreso ----
    total_unique = len(unique_names)
    completed = 0
    if max_workers_eff > 1:
        with ThreadPoolExecutor(max_workers=max_workers_eff) as ex:
            fut2name = {ex.submit(_work, nm): nm for nm in unique_names}
            for fut in tqdm(as_completed(fut2name), total=total_unique, desc=f"IUCN v4 fast (workers={max_workers_eff})"):
                nm = fut2name[fut]
                rec = fut.result()
                results_by_name[nm] = rec
                completed += 1
                if progress_callback is not None:
                    progress_callback(completed, total_unique, nm, rec)
    else:
        for nm in tqdm(unique_names, desc="IUCN v4 fast"):
            rec = _work(nm)
            results_by_name[nm] = rec
            completed += 1
            if progress_callback is not None:
                progress_callback(completed, total_unique, nm, rec)

    # ---- ordenar años (desc) ----
    years_sorted = sorted([y for y in all_years if isinstance(y, int)], reverse=True)
    year_cols = [f"assessment{y}" for y in years_sorted]

    # ---- ensamblar filas en orden original ----
    rows = []
    for idx in original_idx:
        nm = normalized.loc[idx]
        rec = results_by_name.get(nm, {})

        base_cols = {
            "scientificNameConsulted": rec.get("scientificNameConsulted", nm),
            "scientificNameApiFound": rec.get("scientificNameApiFound", None),
            "sisTaxonId": rec.get("sisTaxonId", float("nan")),
        }

        if include_taxonomy:
            base_cols.update({
                "kingdom": rec.get("kingdom", None),
                "phylum": rec.get("phylum", None),
                "class": rec.get("class", None),
                "order": rec.get("order", None),
                "family": rec.get("family", None),
                "genus": rec.get("genus", None),
                "species": rec.get("species", None),
                "infra": rec.get("infra", None),
                "taxonRank": rec.get("taxonRank", None),
                "authority": rec.get("authority", None),
                "taxonId": rec.get("taxonId", float("nan")),
                "scientificNameTaxon": rec.get("scientificNameTaxon", None),
            })

        base_cols.update({
            "lastAssessmentYear": rec.get("lastAssessmentYear", float("nan")),
            "lastAssessmentCode": rec.get("lastAssessmentCode", None),
            "lastAssessmentDesc": rec.get("lastAssessmentDesc", None),
            "lastAssessmentId": rec.get("lastAssessmentId", float("nan")),
            "lastAssessmentUrl": rec.get("lastAssessmentUrl", None),
        })

        if include_diagnostics:
            base_cols["httpStatus"] = rec.get("httpStatus", None)
            base_cols["note"] = rec.get("note", None)

        year_map = rec.get("_year_map", {}) or {}
        for y in years_sorted:
            base_cols[f"assessment{y}"] = year_map.get(y, None)

        rows.append(base_cols)

    # ---- orden de columnas ----
    base_order = ["scientificNameConsulted", "scientificNameApiFound", "sisTaxonId"]

    if include_taxonomy:
        base_order += [
            "kingdom","phylum","class","order","family","genus","species","infra",
            "taxonRank","authority","taxonId","scientificNameTaxon"
        ]

    base_order += [
        "lastAssessmentYear", "lastAssessmentCode", "lastAssessmentDesc",
        "lastAssessmentId", "lastAssessmentUrl",
    ]

    if include_diagnostics:
        base_order += ["httpStatus", "note"]

    final_cols = base_order + year_cols

    # ---- dataframe final ----
    df = pd.DataFrame(rows, columns=final_cols)

    df["lastAssessmentYear"] = pd.to_numeric(df["lastAssessmentYear"], errors="coerce").astype("Int64")
    df["sisTaxonId"] = pd.to_numeric(df["sisTaxonId"], errors="coerce").astype("Int64")
    df["lastAssessmentId"] = pd.to_numeric(df["lastAssessmentId"], errors="coerce").astype("Int64")

    if include_taxonomy:
        df["taxonId"] = pd.to_numeric(df["taxonId"], errors="coerce").astype("Int64")

    df["scientificNameApiFound"] = (
        df["scientificNameApiFound"]
        .astype("string")
        .str.strip()
        .replace({"": pd.NA})
        .fillna("Not found")
    )

    return df


# ============================================================
# 7) Chequeo rápido de token
# ============================================================

def iucn_check_token(token: str, use_bearer: bool = False) -> int:
    headers = {"Authorization": f"Bearer {token}"} if use_bearer else {"Authorization": token}
    r = requests.get(f"{API_BASE}/biogeographical_realms/", headers=headers, timeout=15)
    _log_err(f"Check token → HTTP {r.status_code}")
    return r.status_code
