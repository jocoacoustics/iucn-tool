from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import iucn_api


class FakeResponse:
    status_code = 200
    headers = {}

    def json(self):
        return {
            "taxon": {
                "scientific_name": "Panthera leo",
                "family_name": "Felidae",
                "genus_name": "Panthera",
                "species_name": "leo",
                "sis_taxon_id": 15951,
            },
            "assessments": [
                {
                    "assessment_id": 1,
                    "latest": True,
                    "year_published": 2023,
                    "red_list_category_code": "VU",
                    "scopes": [{"code": "1"}],
                    "url": "https://example.test",
                }
            ],
        }

    def raise_for_status(self):
        return None


def main():
    original = iucn_api._req
    calls = []
    progress = []

    def fake_req(*args, **kwargs):
        calls.append((args, kwargs))
        return FakeResponse()

    iucn_api._req = fake_req
    try:
        df = iucn_api.iucn_assessments_wide_fast(
            ["Panthera leo", "Panthera leo"],
            token="dummy",
            max_workers=4,
            allow_sis_fallback=False,
            progress_callback=lambda done, total, name, rec: progress.append((done, total, name)),
        )
        assert len(calls) == 1, f"esperaba 1 request único, recibí {len(calls)}"
        assert progress == [(1, 1, "Panthera leo")], progress
        assert len(df) == 2
        assert df.loc[0, "family"] == "Felidae"
        assert df.loc[1, "lastAssessmentCode"] == "VU"
        print("OK test_engine_mock")
    finally:
        iucn_api._req = original


if __name__ == "__main__":
    main()
