import base64
import sys

import pytest

from systmanyone import read, terminology
from systmanyone.server import MAX_CODE_SEARCH_RESULTS, app, main


def test_gui_and_static_assets_are_served():
    client = app.test_client()

    index = client.get("/")
    script = client.get("/static/js/app.js")
    styles = client.get("/static/styles.css")

    assert index.status_code == 200
    assert b'<script type="module" src="/static/js/app.js"></script>' in index.data
    assert script.status_code == 200
    assert styles.status_code == 200


def test_export_uses_each_supplied_document_and_generates_valid_crc():
    client = app.test_client()
    document = client.get("/api/sample").get_json()
    document["pages"][0]["components"][0]["props"]["text"] = "First edit"
    first = client.post("/api/export", json=document).get_json()
    document["pages"][0]["components"][0]["props"]["text"] = "Latest edit"
    second = client.post("/api/export", json=document).get_json()

    assert "First edit" in first["xml"]
    assert "Latest edit" in second["xml"]
    assert "First edit" not in second["xml"]
    assert read.verify_crc(base64.b64decode(second["base64"]))[0]


def test_invalid_import_returns_a_gui_friendly_error():
    response = app.test_client().post("/api/import", json={"xml": "not xml"})

    assert response.status_code == 400
    assert "not a valid SystmOne template export" in response.get_json()["error"]


def test_export_xml_and_download_come_from_the_same_file():
    document = app.test_client().get("/api/sample").get_json()
    document["name"] = "Review: 2/3 <draft>"
    result = app.test_client().post("/api/export", json=document).get_json()

    file_bytes = base64.b64decode(result["base64"])
    assert file_bytes.split(b"\n", 1)[1].decode("utf-8") == result["xml"]
    assert result["filename"] == "Review__2_3__draft_.xml"


def test_export_rejects_unknown_calculation():
    document = {"pages": [{"components": [{"kind": "calculated", "props": {"calculation": 'bmi foo="x"'}}]}]}
    response = app.test_client().post("/api/export", json=document)
    assert response.status_code == 400
    assert "calculation" in response.get_json()["error"]


def test_non_object_json_bodies_are_rejected():
    client = app.test_client()
    for url in ("/api/export", "/api/import"):
        assert client.post(url, json=[1, 2]).status_code == 400
        assert client.post(url, data="xml", content_type="text/plain").status_code == 400
    assert client.post("/api/import", json={"xml": 5}).status_code == 400


def test_code_search_limit_is_validated_and_capped(monkeypatch):
    requested_limits = []
    monkeypatch.setattr(terminology, "search", lambda query, limit: requested_limits.append(limit) or [])
    client = app.test_client()

    assert client.get("/api/codes?q=a&limit=abc").status_code == 400
    assert client.get("/api/codes?q=a&limit=999999").status_code == 200
    assert requested_limits == [MAX_CODE_SEARCH_RESULTS]


def test_import_reports_dropped_elements():
    xml = ('<SystmOneTemplates><TemplateDefinition><template><page name="P"><view/></page></template>'
           '<Name>n</Name></TemplateDefinition></SystmOneTemplates>')
    data = app.test_client().post("/api/import", json={"xml": xml}).get_json()
    assert data["_warnings"] == ["1 unsupported <view> element in page 'P' was not imported"]


def test_debug_refuses_non_loopback_host(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["systmanyone", "--debug", "--host", "0.0.0.0"])
    monkeypatch.setattr(app, "run", lambda **kwargs: pytest.fail("server should not start"))
    with pytest.raises(SystemExit):
        main()


def test_debug_allowed_on_loopback(monkeypatch):
    started = {}
    monkeypatch.setattr(sys, "argv", ["systmanyone", "--debug", "--host", "127.0.0.1"])
    monkeypatch.setattr(app, "run", lambda **kwargs: started.update(kwargs))
    main()
    assert started["debug"] is True


def test_terms_endpoint_returns_known_ctv3_terms_only():
    response = app.test_client().get("/api/terms?codes=XaF8d;NOPE1")
    assert response.get_json() == {"terms": {"XaF8d": "Medication review done"}}
