import importlib

from systmanyone import terminology


def test_bundled_ctv3_loaded():
    assert terminology.count() > 200000


def test_search_by_code():
    assert terminology.search("XaF8d")[0] == {"code": "XaF8d", "term": "Medication review done", "system": "CTV3"}


def test_term_start_matches_rank_before_substring_matches():
    results = terminology.search("medication review", limit=5)
    assert results and all(r["term"].lower().startswith("medication review") for r in results)


def test_search_empty_query():
    assert terminology.search("") == []


def test_local_files_override_bundled_and_load_tsv_and_cp1252(tmp_path, monkeypatch):
    (tmp_path / "local.tsv").write_text("code\tterm\nYLOC1\tLocal practice code\n", encoding="utf-8")
    (tmp_path / "legacy.csv").write_bytes("code,term\nXaF8d,Medication review – local\n".encode("cp1252"))
    monkeypatch.setenv("SYSTMANYONE_TERMS", str(tmp_path))
    reloaded = importlib.reload(terminology)
    try:
        assert reloaded.search("YLOC1")[0]["term"] == "Local practice code"
        assert reloaded.search("XaF8d")[0] == {"code": "XaF8d", "term": "Medication review – local", "system": "Local"}
    finally:
        monkeypatch.delenv("SYSTMANYONE_TERMS")
        importlib.reload(terminology)
