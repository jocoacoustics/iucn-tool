from __future__ import annotations

import json
import os
import sys
import threading
import time
import urllib.request
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import local_server


def fake_engine(names, *, token, max_workers, progress_callback=None, **kwargs):
    unique = list(dict.fromkeys(str(x).strip() for x in names if str(x).strip()))
    by_name = {}
    for i, name in enumerate(unique, 1):
        rec = {
            "scientificNameConsulted": name,
            "scientificNameApiFound": name,
            "sisTaxonId": 1,
            "kingdom": "Animalia",
            "phylum": "Chordata",
            "class": "Mammalia",
            "order": "Carnivora",
            "family": "Felidae",
            "genus": "Panthera",
            "species": "leo",
            "infra": None,
            "taxonRank": "species",
            "authority": None,
            "taxonId": 1,
            "scientificNameTaxon": name,
            "lastAssessmentYear": 2023,
            "lastAssessmentCode": "VU",
            "lastAssessmentDesc": "Vulnerable",
            "lastAssessmentId": 1,
            "lastAssessmentUrl": "https://example.test",
            "httpStatus": 200,
            "note": None,
            "assessment2023": "VU",
        }
        by_name[name] = rec
        if progress_callback:
            progress_callback(i, len(unique), name, rec)
    return pd.DataFrame([by_name[str(x).strip()] for x in names])


def main():
    original = local_server.iucn_assessments_wide_fast
    local_server.iucn_assessments_wide_fast = fake_engine
    os.chdir(ROOT)
    server = local_server.ThreadingHTTPServer(("127.0.0.1", 0), local_server.IUCNLocalHandler)
    port = server.server_address[1]
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        data = json.dumps({"names": ["Panthera leo", "Panthera leo"], "token": "dummy", "max_workers": 8}).encode()
        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/local-api/jobs",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        created = json.load(urllib.request.urlopen(req, timeout=3))
        jid = created["job_id"]
        status = None
        for _ in range(30):
            status = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/local-api/jobs/{jid}", timeout=3))
            if status["status"] == "done":
                break
            time.sleep(0.05)
        assert status and status["status"] == "done", status
        result = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/local-api/jobs/{jid}/result", timeout=3))
        assert status["total"] == 1
        assert status["done"] == 1
        assert status["counts"]["found"] == 1
        assert len(result["results"]) == 2
        print("OK test_local_api_mock")
    finally:
        server.shutdown()
        server.server_close()
        local_server.iucn_assessments_wide_fast = original


if __name__ == "__main__":
    main()
