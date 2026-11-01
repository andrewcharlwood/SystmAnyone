"""systmanyone web GUI.

    python3 -m systmanyone.server            # http://127.0.0.1:8801
"""
import base64
import ipaddress
import re
import xml.etree.ElementTree as ET

from flask import Flask, jsonify, request

from . import read as _read
from . import schema
from . import terminology
from .model import Component, Page, Template
from .sample import build_deprescribing_smr

app = Flask(__name__)

MAX_CODE_SEARCH_RESULTS = 100
MAX_TERM_LOOKUPS = 500


def _json_object():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def _bad_request(message):
    return jsonify({"error": message}), 400


def template_from_json(data):
    template = Template(
        name=data.get("name", "New Template"),
        description=data.get("description", ""),
        category=data.get("category", "Miscellaneous"),
        icon=data.get("icon", ""),
        male=data.get("male", True),
        female=data.get("female", True),
        width=int(data.get("width", 396)),
        height=int(data.get("height", 636)),
    )
    pages = []
    for page_data in data.get("pages", []):
        page = Page(
            name=page_data.get("name", "Page 1"),
            colour=int(page_data.get("colour", -13108)),
            male=page_data.get("male", True),
            female=page_data.get("female", True),
            minage=int(page_data.get("minage", -1)),
            minageunits=int(page_data.get("minageunits", 0)),
            maxage=int(page_data.get("maxage", -1)),
            maxageunits=int(page_data.get("maxageunits", 0)),
        )
        page.cid = page_data.get("cid")
        for component_data in page_data.get("components", []):
            component = Component(
                component_data["kind"],
                x=int(component_data.get("x", 12)),
                y=int(component_data.get("y", 12)),
                w=int(component_data["w"]) if component_data.get("w") is not None else None,
                h=int(component_data["h"]) if component_data.get("h") is not None else None,
                **component_data.get("props", {}),
            )
            component.cid = component_data.get("cid")
            if "_explicit" in component_data:
                component.props.explicit = set(component_data["_explicit"])
            page.components.append(component)
        pages.append(page)
    if pages:
        template.pages = pages
    return template


@app.get("/")
def index():
    return app.send_static_file("index.html")


@app.get("/api/schema")
def api_schema():
    components = {
        kind: {key: spec[key] for key in ("label", "group", "size", "attrs") if key in spec}
        for kind, spec in schema.COMPONENTS.items()
    }
    return jsonify({"components": components, "groups": schema.GROUP_ORDER, "terminology": terminology.count()})


@app.get("/api/terms")
def api_terms():
    codes = [code for code in request.args.get("codes", "").split(";") if code][:MAX_TERM_LOOKUPS]
    return jsonify({"terms": terminology.terms(codes)})


@app.get("/api/codes")
def api_codes():
    try:
        limit = int(request.args.get("limit", 20))
    except ValueError:
        return _bad_request("limit must be a whole number")
    limit = max(1, min(limit, MAX_CODE_SEARCH_RESULTS))
    return jsonify({
        "results": terminology.search(request.args.get("q", ""), limit),
        "total": terminology.count(),
    })


@app.post("/api/export")
def api_export():
    data = _json_object()
    if data is None:
        return _bad_request("Expected a JSON object describing the template.")
    try:
        template = template_from_json(data)
        file_bytes = template.file_bytes()
    except (AttributeError, KeyError, TypeError, ValueError) as error:
        return _bad_request(f"The template could not be exported: {error}")
    return jsonify({
        "xml": file_bytes.split(b"\n", 1)[1].decode("utf-8"),
        "bytes": len(file_bytes),
        "base64": base64.b64encode(file_bytes).decode("ascii"),
        "filename": re.sub(r"[^A-Za-z0-9_-]", "_", template.name or "Template") + ".xml",
    })


@app.post("/api/import")
def api_import():
    data = _json_object()
    if data is None or not isinstance(data.get("xml"), str):
        return _bad_request("Expected a JSON object with the template XML in an \"xml\" field.")
    raw = data["xml"].encode("utf-8")
    try:
        ok, _, _ = _read.verify_crc(raw)
        template, warnings = _read.parse(raw)
    except (ET.ParseError, IndexError, TypeError, ValueError) as error:
        return _bad_request(f"This is not a valid SystmOne template export: {error}")
    output = _read.to_json(template)
    output["_crc_ok"] = ok
    output["_warnings"] = warnings
    return jsonify(output)


@app.get("/api/sample")
def api_sample():
    template = build_deprescribing_smr()
    pages = []
    for page in template.pages:
        pages.append({
            "name": page.name,
            "colour": page.colour,
            "male": page.male,
            "female": page.female,
            "minage": page.minage,
            "minageunits": page.minageunits,
            "maxage": page.maxage,
            "maxageunits": page.maxageunits,
            "components": [
                {"kind": component.kind, "x": component.x, "y": component.y, "w": component.w, "h": component.h, "props": component.props}
                for component in page.components
            ],
        })
    return jsonify({
        "name": template.name,
        "description": template.description,
        "category": template.category,
        "icon": template.icon,
        "male": template.male,
        "female": template.female,
        "width": template.width,
        "height": template.height,
        "pages": pages,
    })


def _is_loopback(host):
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def main():
    import argparse
    parser = argparse.ArgumentParser(prog="systmanyone", description="Unofficial SystmOne clinical template builder")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8801)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()
    if args.debug and not _is_loopback(args.host):
        parser.error("--debug exposes an interactive debugger; it is only allowed with a loopback --host")
    print(f"open http://{args.host}:{args.port}")
    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == "__main__":
    main()
