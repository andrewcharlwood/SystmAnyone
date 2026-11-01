"""Read / verify an existing SystmOne template export (.xml)."""
import zlib
import xml.etree.ElementTree as ET
from collections import Counter
from xml.sax.saxutils import escape

from . import schema
from .model import UNMODELLED_CHILDREN, Component, Page, Template

# element name -> component kind
_TAG_KIND = {spec.get("tag", kind): kind for kind, spec in schema.COMPONENTS.items() if kind != "calculated"}
_TAG_KIND["vline"] = "hline"
_MODELLED_CHILDREN = {"comboBox": "rc", "multipleSelection": "rc", "radioPanel": "rc",
                      "qualifierComboBox": "rc", "scoredAssessment": "qst"}
_TEMPLATE_DEFAULTS = {"codes": "", "readCodesToAutoLinkDrugsTo": "", "codesToAlwaysInclude": "",
                      "keyWordLetterTemplateDefaultForPrinting": "-1"}
_PAGE_ATTRS = {"Cid", "name", "colour", "male", "female", "minage", "minageunits", "maxage", "maxageunits"}


def verify_crc(raw: bytes):
    """Return (ok, claimed, computed). The CRC is crc32 over everything after
    the first line (the `ID:` line)."""
    if b"\n" not in raw:
        return False, None, None
    first, rest = raw.split(b"\n", 1)
    if not first.startswith(b"ID:"):
        return False, None, zlib.crc32(rest) & 0xFFFFFFFF
    try:
        claimed = int(first[3:].strip() or b"-1")
    except ValueError:
        return False, None, zlib.crc32(rest) & 0xFFFFFFFF
    return claimed == (zlib.crc32(rest) & 0xFFFFFFFF), claimed, zlib.crc32(rest) & 0xFFFFFFFF


def _payload(raw: bytes):
    payload = raw.split(b"\n", 1)[1] if raw.startswith(b"ID:") else raw
    if b"<!DOCTYPE" in payload or b"<!ENTITY" in payload:
        raise ValueError("DTDs and entity declarations are not allowed")
    if payload.startswith(b"<?xml"):
        payload = payload.split(b"?>", 1)[1]
    return payload


def parse(raw: bytes):
    """Return (template, warnings); warnings describe elements that could not be
    imported and will be missing from any re-export."""
    root = ET.fromstring(_payload(raw))
    td = root.find("TemplateDefinition")
    if td is None:
        raise ValueError("no <TemplateDefinition> element")

    t = Template(
        name=(td.findtext("Name") or "Imported Template"),
        description=(td.findtext("Description") or ""),
        category=(td.findtext("Category") or "Miscellaneous"),
        icon=(td.findtext("Icon") or ""),
        male=td.get("Male", "y") == "y",
        female=td.get("Female", "y") == "y",
    )
    tmpl = td.find("template")
    if tmpl is None:
        return t, []
    t.width = int(tmpl.get("width", t.width))
    t.height = int(tmpl.get("height", t.height))
    notes = [f"template setting '{name}' was not imported" for name, default in _TEMPLATE_DEFAULTS.items()
             if tmpl.get(name, default) != default]

    dropped = Counter()
    pages = []
    for pe in tmpl:
        if pe.tag != "page":
            dropped[(pe.tag, "the template")] += 1
            continue
        p = Page(name=pe.get("name", "Page 1"),
                 colour=int(pe.get("colour", -13108)),
                 male=pe.get("male", "y") == "y",
                 female=pe.get("female", "y") == "y",
                 minage=int(pe.get("minage", -1)), minageunits=int(pe.get("minageunits", 0)),
                 maxage=int(pe.get("maxage", -1)), maxageunits=int(pe.get("maxageunits", 0)))
        p.cid = _int(pe.get("Cid"))
        notes += [f"page '{p.name}' setting '{name}' was not imported" for name in pe.attrib if name not in _PAGE_ATTRS]
        for el in pe:
            if _kind(el.tag) is None:
                dropped[(el.tag, f"page '{p.name}'")] += 1
            else:
                p.components.append(_component(el, notes))
        pages.append(p)
    if pages:
        t.pages = pages
    warnings = [
        f"{count} unsupported <{tag}> element{'s' if count > 1 else ''} in {location} "
        f"{'were' if count > 1 else 'was'} not imported"
        for (tag, location), count in dropped.items()
    ]
    return t, warnings + notes


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _kind(tag):
    return "calculated" if tag in schema.CALCULATION_TAGS else _TAG_KIND.get(tag)


def _component(el, notes):
    kind = _kind(el.tag)
    spec = schema.COMPONENTS[kind]
    x = _int(el.get("x")) or 0
    y = _int(el.get("y")) or 0
    w = _int(el.get("w")) or spec["size"][0]
    h = _int(el.get("h")) or spec["size"][1]
    c = Component(kind, x=x, y=y, w=w, h=h)
    c.cid = _int(el.get("Cid"))
    attr_types = {a["name"]: a["type"] for a in spec["attrs"]}
    for name, val in el.attrib.items():
        if name in ("Cid", "x", "y", "w", "h"):
            continue
        attr_type = attr_types.get(name)
        if attr_type == "bool":
            val = val.lower() in ("y", "yes", "true", "1")
        elif attr_type == "int":
            val = _int(val)
        c.props[name] = val
    if kind == "calculated":
        c.props["calculation"] = el.tag
    if el.tag != "formattedText":
        unmodelled = [ch for ch in el if ch.tag != _MODELLED_CHILDREN.get(kind)]
        if unmodelled:
            c.props[UNMODELLED_CHILDREN] = "".join(ET.tostring(ch, encoding="unicode") for ch in unmodelled)
    if any(option.get("desc") for option in el.findall("rc")):
        notes.append(f"option descriptions on '{el.get('text', el.tag)}' were not imported")
    if kind in ("comboBox", "multipleSelection", "radioPanel", "qualifierComboBox"):
        option_prop = "quals" if kind == "qualifierComboBox" else "codes"
        options = el.findall("rc")
        if options:
            c.props[option_prop] = ";".join(option.get("rc", "") for option in options)
    if kind == "scoredAssessment":
        questions = []
        for question in el.findall("qst"):
            question_text = question.get("text", "")
            if question.get("checkbox") == "y":
                question_text += " *"
            if question.get("mandatory") == "y":
                question_text += " !"
            answers = [
                f"{answer.text or ''}={answer.get('rc', '')}:{answer.get('score', '0')}"
                for answer in question.findall("ans")
            ]
            questions.append(f"{question_text} :: {' ; '.join(answers)}")
        if questions:
            c.props["questions"] = "\n".join(questions)
    if el.tag == "formattedText":
        c.props["textString"] = escape(el.text or "") + "".join(ET.tostring(ch, encoding="unicode") for ch in el)
    return c


def to_json(t: Template):
    return {
        "name": t.name, "description": t.description, "category": t.category, "icon": t.icon,
        "male": t.male, "female": t.female, "width": t.width, "height": t.height,
        "pages": [
            {"cid": p.cid, "name": p.name, "colour": p.colour, "male": p.male, "female": p.female,
             "minage": p.minage, "minageunits": p.minageunits,
             "maxage": p.maxage, "maxageunits": p.maxageunits,
             "components": [
                 {"cid": c.cid, "kind": c.kind, "x": c.x, "y": c.y, "w": c.w, "h": c.h,
                  "props": c.props, "_explicit": sorted(c.props.explicit)}
                 for c in p.components
             ]}
            for p in t.pages
        ],
    }
