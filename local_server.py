from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

try:
    import pandas as pd
    from iucn_api import iucn_assessments_wide_fast
except Exception as exc:
    print("\nNo pude cargar el motor Python de IUCN Tool.")
    print("Ejecuta este archivo desde Anaconda Prompt (entorno base o uno con pandas/requests).")
    print(f"Detalle: {exc}\n")
    raise

ROOT = Path(__file__).resolve().parent
JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()
JOB_TTL_SECONDS = 60 * 30


def _json_safe_records(df: pd.DataFrame) -> list[dict]:
    # pandas.to_json convierte NaN/NA a null de forma segura.
    return json.loads(df.to_json(orient="records", force_ascii=False))


def _classify_record(rec: dict) -> str:
    status = rec.get("httpStatus")
    found_name = rec.get("scientificNameApiFound")
    found = bool(found_name and str(found_name).strip() and str(found_name).strip() != "Not found")
    note = str(rec.get("note") or "")
    if status == 404 or (status in (None, 200) and not found):
        return "notFound"
    if status not in (None, 200) or note.startswith("exception:"):
        return "error"
    return "found" if found else "notFound"


def _cleanup_jobs() -> None:
    now = time.time()
    with JOBS_LOCK:
        stale = [jid for jid, job in JOBS.items() if now - job.get("updated_at", now) > JOB_TTL_SECONDS]
        for jid in stale:
            JOBS.pop(jid, None)


def _update_job(job_id: str, **values) -> None:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job:
            return
        job.update(values)
        job["updated_at"] = time.time()


def _run_job(job_id: str, names: list[str], token: str, max_workers: int) -> None:
    # El token vive solo en este stack/closure durante la consulta; nunca se guarda en JOBS.
    counts = {"found": 0, "notFound": 0, "error": 0}

    def on_progress(done: int, total: int, name: str, rec: dict) -> None:
        kind = _classify_record(rec)
        counts[kind] += 1
        _update_job(
            job_id,
            status="running",
            done=done,
            total=total,
            counts=dict(counts),
            current=name,
        )

    try:
        _update_job(job_id, status="running")
        df = iucn_assessments_wide_fast(
            names,
            token=token,
            use_bearer=False,
            max_workers=max_workers,
            timeout=25,
            max_tries=4,
            include_diagnostics=True,
            include_taxonomy=True,
            per_token_concurrency=1,
            pause_between=0.0,
            allow_sis_fallback=True,
            progress_callback=on_progress,
        )
        records = _json_safe_records(df)
        _update_job(
            job_id,
            status="done",
            done=len({str(n).strip() for n in names if str(n).strip()}),
            results=records,
            counts=dict(counts),
            finished_at=time.time(),
        )
    except Exception as exc:
        _update_job(
            job_id,
            status="error",
            error=str(exc),
            finished_at=time.time(),
        )


class IUCNLocalHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def _send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > 5_000_000:
            raise ValueError("Cuerpo JSON vacío o demasiado grande")
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def do_POST(self):
        parsed = urlsplit(self.path)
        if parsed.path != "/local-api/jobs":
            return self._send_json({"error": "Not found"}, 404)

        try:
            payload = self._read_json()
            names = payload.get("names") or []
            token = str(payload.get("token") or "").strip()
            requested_workers = int(payload.get("max_workers") or 8)
        except Exception as exc:
            return self._send_json({"error": f"Solicitud inválida: {exc}"}, 400)

        if not token:
            return self._send_json({"error": "Falta token IUCN"}, 400)
        if not isinstance(names, list):
            return self._send_json({"error": "names debe ser una lista"}, 400)

        names = [str(x).strip() for x in names if str(x).strip()]
        if not names:
            return self._send_json({"error": "No hay nombres científicos"}, 400)

        max_workers = max(1, min(16, requested_workers))
        unique_count = len(dict.fromkeys(names))
        job_id = uuid.uuid4().hex
        now = time.time()
        with JOBS_LOCK:
            JOBS[job_id] = {
                "id": job_id,
                "status": "queued",
                "done": 0,
                "total": unique_count,
                "counts": {"found": 0, "notFound": 0, "error": 0},
                "max_workers": max_workers,
                "created_at": now,
                "updated_at": now,
                "results": None,
                "error": None,
            }

        thread = threading.Thread(
            target=_run_job,
            args=(job_id, names, token, max_workers),
            daemon=True,
            name=f"iucn-job-{job_id[:8]}",
        )
        thread.start()
        self._send_json({"job_id": job_id, "total": unique_count, "max_workers": max_workers}, 202)

    def do_GET(self):
        parsed = urlsplit(self.path)
        path = parsed.path

        if path.startswith("/local-api/jobs/"):
            _cleanup_jobs()
            parts = [p for p in path.split("/") if p]
            if len(parts) not in (3, 4):
                return self._send_json({"error": "Not found"}, 404)
            job_id = parts[2]
            with JOBS_LOCK:
                job = JOBS.get(job_id)
                if not job:
                    return self._send_json({"error": "Job no encontrado"}, 404)
                snapshot = dict(job)

            if len(parts) == 4 and parts[3] == "result":
                if snapshot["status"] == "error":
                    return self._send_json({"error": snapshot.get("error") or "Consulta fallida"}, 500)
                if snapshot["status"] != "done":
                    return self._send_json({"error": "Resultado aún no disponible"}, 409)
                return self._send_json({"results": snapshot.get("results") or []})

            snapshot.pop("results", None)
            self._send_json(snapshot)
            return

        return super().do_GET()

    def do_DELETE(self):
        parsed = urlsplit(self.path)
        parts = [p for p in parsed.path.split("/") if p]
        if len(parts) == 3 and parts[:2] == ["local-api", "jobs"]:
            with JOBS_LOCK:
                existed = JOBS.pop(parts[2], None) is not None
            return self._send_json({"deleted": existed})
        return self._send_json({"error": "Not found"}, 404)

    def log_message(self, fmt, *args):
        sys.stdout.write("[IUCN Tool] " + (fmt % args) + "\n")
        sys.stdout.flush()


def main():
    parser = argparse.ArgumentParser(description="IUCN Tool: web local + motor Python API v4")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    os.chdir(ROOT)
    cpu = os.cpu_count() or 4
    suggested = max(4, min(10, cpu))

    server = ThreadingHTTPServer(("127.0.0.1", args.port), IUCNLocalHandler)
    print("\nIUCN Tool - motor Python API v4")
    print("=" * 40)
    print(f"Abre en tu navegador: http://127.0.0.1:{args.port}")
    print("La web usa directamente iucn_api.py (requests + pandas + ThreadPoolExecutor).")
    print(f"Concurrencia sugerida para este equipo: {suggested}")
    print("El token solo se mantiene en memoria durante cada consulta.")
    print("Para detenerlo: Ctrl+C\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
