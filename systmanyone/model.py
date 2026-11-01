"""In-memory model for a SystmOne clinical template + XML export.

The export file format (validated against a real export) is:

    ID:<crc32-decimal padded to 20>\n
    <?xml version="1.0" encoding="UTF-8" ?><SystmOneTemplates>... </SystmOneTemplates>

where the CRC is `zlib.crc32(xml_bytes)` over everything after the first line.
On import SystmOne recomputes exactly that and refuses the file on mismatch.
"""
import re
import zlib
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

from . import schema

_XML_ILLEGAL_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
_TRAILING_QUESTION_FLAGS = re.compile(r"(?:\s+[*!])+$")


def _bool(v):
    return "y" if v else "n"


def _legal_chars(value):
    return _XML_ILLEGAL_CONTROL_CHARS.sub("", str(value))


def _text(value):
    return escape(_legal_chars(value))


def _attrs_to_xml(attrs):
    out = []
    for name, value in attrs:
        if value is None:
            continue
        if isinstance(value, bool):
            out.append(f'{name}="{_bool(value)}"')
        else:
            out.append(f'{name}="{escape(_legal_chars(value), {chr(34): "&quot;"})}"')
    return (" " + " ".join(out)) if out else ""


def _well_formed_markup(markup):
    markup = _legal_chars(markup)
    try:
        ET.fromstring(f"<x>{markup}</x>")
    except ET.ParseError:
        return escape(markup)
    return markup


def split_question_flags(question):
    """Split trailing ' *' (check boxes) / ' !' (mandatory) markers off a question."""
    question = question.strip()
    match = _TRAILING_QUESTION_FLAGS.search(question)
    flags = match.group() if match else ""
    return question[:len(question) - len(flags)].strip(), "*" in flags, "!" in flags


CTV3_CODE = re.compile(r"[0-9A-Za-z]{5}|[0-9A-Za-z]{4}\.|[0-9A-Za-z]{3}\.\.|[0-9A-Za-z]{2}\.\.\.")
_CODE_PROPS = ("code", "qual", "standard", "codes", "quals")
UNMODELLED_CHILDREN = "unmodelledXml"
_ELEMENT_ATTRS = {"Cid", "x", "y", "w", "h"}
_OPTION_KINDS = ("comboBox", "multipleSelection", "radioPanel", "qualifierComboBox")


class _ComponentProps(dict):
    def __init__(self):
        super().__init__()
        self.explicit = set()

    def __setitem__(self, key, value):
        super().__setitem__(key, value)
        self.explicit.add(key)


class Component:
    """A single template component (checkBox, comboBox, hline, ...)."""

    def __init__(self, kind, x=12, y=12, w=None, h=None, **props):
        if kind not in schema.COMPONENTS:
            raise ValueError(f"unknown component kind: {kind}")
        self.kind = kind
        spec = schema.COMPONENTS[kind]
        self.x, self.y = int(x), int(y)
        self.w = int(w if w is not None else spec["size"][0])
        self.h = int(h if h is not None else spec["size"][1])
        self.props = _ComponentProps()
        for a in spec["attrs"]:
            dict.__setitem__(self.props, a["name"], props.get(a["name"], a.get("default")))
        for k, v in props.items():
            self.props[k] = v
        self.cid = None  # assigned by the template

    @property
    def tag(self):
        return schema.COMPONENTS[self.kind].get("tag", self.kind)

    def _unmodelled_attrs(self):
        modelled = {a["name"] for a in schema.COMPONENTS[self.kind]["attrs"]} | _ELEMENT_ATTRS | {UNMODELLED_CHILDREN}
        return [(name, value) for name, value in self.props.items()
                if name not in modelled and isinstance(value, (str, int, bool))]

    def _element(self, tag, attrs, inner=""):
        inner = (self.props.get(UNMODELLED_CHILDREN) or "") + inner
        attrs_xml = _attrs_to_xml(attrs + self._unmodelled_attrs())
        return f"<{tag}{attrs_xml}>{inner}</{tag}>" if inner else f"<{tag}{attrs_xml}/>"

    def _property_attrs(self, exclude=()):
        attrs = []
        for a in schema.COMPONENTS[self.kind]["attrs"]:
            name = a["name"]
            if name in exclude:
                continue
            v = self.props.get(name)
            if v is None:
                continue
            if name not in self.props.explicit and v == a.get("default", False if a["type"] == "bool" else None):
                continue
            attrs.append((name, v))
        return attrs

    def _check_codes(self, codes):
        for code in codes:
            if not CTV3_CODE.fullmatch(code):
                label = self.props.get("text") or self.props.get("label") or schema.COMPONENTS[self.kind]["label"]
                raise ValueError(f"'{code}' on '{label}' is not a CTV3 code (5 characters, e.g. XaF8d or 8B3V.)")

    def to_xml(self):
        self._check_codes(code for name in _CODE_PROPS for code in str(self.props.get(name) or "").split(";") if code)
        if self.tag == "hline":
            attrs = [("Cid", self.cid), ("x", self.x), ("y", self.y),
                     ("length", self.props.get("length", 384))]
            vertical = bool(self.props.get("vertical"))
            if vertical or "vertical" in self.props.explicit:
                attrs.append(("vertical", vertical))
            return self._element("vline" if vertical else "hline", attrs)
        if self.tag == "formattedText":
            attrs = [("Cid", self.cid), ("x", self.x), ("y", self.y), ("w", self.w), ("h", self.h)]
            body = _well_formed_markup(self.props.get("textString") or "")
            return f"<formattedText{_attrs_to_xml(attrs)}>{body}</formattedText>"
        if self.kind in _OPTION_KINDS:
            option_prop = "quals" if self.kind == "qualifierComboBox" else "codes"
            option_codes = [c for c in (self.props.get(option_prop) or "").split(";") if c]
            attrs = [("Cid", self.cid), ("x", self.x), ("y", self.y), ("w", self.w)]
            if self.kind in ("multipleSelection", "radioPanel"):
                attrs.append(("h", self.h))
            attrs.extend(self._property_attrs(exclude=(option_prop,)))
            if option_prop == "codes":
                attrs.append(("codes", ";".join(option_codes)))
            inner = "".join(f"<rc{_attrs_to_xml([('rc', c), ('desc', '')])}/>" for c in option_codes)
            return self._element(self.tag, attrs, inner)
        if self.tag == "scoredAssessment":
            return self._xml_scored()
        if self.tag == "calculated":
            calc = self.props.get("calculation")
            if calc not in schema.CALCULATION_TAGS:
                raise ValueError(f"unknown calculation: {calc!r}")
            attrs = [("Cid", self.cid), ("x", self.x), ("y", self.y), ("w", self.w),
                     ("text", self.props.get("text")), ("code", self.props.get("code"))]
            return self._element(calc, attrs)
        geometry = schema.COMPONENTS[self.kind].get("geometry", ("w", "h"))
        attrs = [("Cid", self.cid), ("x", self.x), ("y", self.y)] + [(name, getattr(self, name)) for name in geometry]
        attrs.extend(self._property_attrs())
        return self._element(self.tag, attrs)

    def _xml_scored(self):
        """Scored assessment writes nested <qst>/<ans> children.

        `questions` format, one question per line:
            Question text [*][!] :: Answer text=CODE:SCORE ; Answer text=CODE:SCORE
        A trailing ' *' = show answers as check boxes, a trailing ' !' = question
        is mandatory; '*' or '!' anywhere else is part of the question text.
        """
        head = [("Cid", self.cid), ("x", self.x), ("y", self.y), ("w", self.w), ("h", self.h),
                ("text", self.props.get("text")), ("code", self.props.get("code")),
                ("repopulateDays", self.props.get("repopulateDays") or 0)]
        rows = []
        for qi, line in enumerate((self.props.get("questions") or "").splitlines()):
            line = line.strip()
            if not line:
                continue
            qtext, _, ansspec = line.partition("::")
            qtext, checkbox, mandatory = split_question_flags(qtext)
            qattr = [("id", qi), ("text", qtext)]
            if checkbox:
                qattr.append(("checkbox", True))
            if mandatory:
                qattr.append(("mandatory", True))
            answers = []
            for ai, part in enumerate(ansspec.split(";")):
                part = part.strip()
                if not part or "=" not in part:
                    continue
                atext, _, code_score = part.rpartition("=")
                code, _, score = code_score.partition(":")
                if code.strip():
                    self._check_codes([code.strip()])
                ans_attrs = [("id", ai), ("score", score.strip() or 0), ("rc", code.strip())]
                answers.append(f"<ans{_attrs_to_xml(ans_attrs)}>{_text(atext.strip())}</ans>")
            rows.append(f"<qst{_attrs_to_xml(qattr)}>{''.join(answers)}</qst>")
        return self._element("scoredAssessment", head, "".join(rows))


class Page:
    def __init__(self, name="Page 1", colour=-13108, male=True, female=True,
                 minage=-1, minageunits=0, maxage=-1, maxageunits=0):
        self.name = name
        self.colour = colour
        self.male = male
        self.female = female
        self.minage = minage
        self.minageunits = minageunits
        self.maxage = maxage
        self.maxageunits = maxageunits
        self.components = []
        self.cid = None

    def to_xml(self):
        attrs = [("Cid", self.cid), ("name", self.name), ("colour", self.colour)]
        for n, v in (("male", self.male), ("female", self.female)):
            if not v:
                attrs.append((n, False))
        for n, v, d in (("minage", self.minage, -1), ("minageunits", self.minageunits, 0),
                        ("maxage", self.maxage, -1), ("maxageunits", self.maxageunits, 0)):
            if v != d:
                attrs.append((n, v))
        inner = "".join(c.to_xml() for c in self.components)
        return f"<page{_attrs_to_xml(attrs)}>{inner}</page>"


class Template:
    def __init__(self, name="New Template", description="", category="Miscellaneous",
                 icon="", male=True, female=True, width=396, height=636):
        self.name = name
        self.description = description
        self.category = category
        self.icon = icon
        self.male = male
        self.female = female
        self.width = width
        self.height = height
        self.pages = [Page()]

    def _assign_ids(self):
        """Give every page and component a Cid unique within the template (0 is the
        template itself). Existing unique ids are kept; new ids go above the maximum."""
        nodes = [node for page in self.pages for node in (page, *page.components)]
        used = {0}
        needs_id = []
        for node in nodes:
            try:
                cid = int(node.cid)
            except (TypeError, ValueError):
                cid = None
            if cid is None or cid in used or cid < 0:
                needs_id.append(node)
            else:
                node.cid = cid
                used.add(cid)
        next_cid = max(used)
        for node in needs_id:
            next_cid += 1
            node.cid = next_cid

    def body_xml(self):
        self._assign_ids()
        pages = "".join(p.to_xml() for p in self.pages)
        template_attrs = [("Cid", 0), ("width", self.width), ("height", self.height), ("codes", ""),
                          ("readCodesToAutoLinkDrugsTo", ""), ("codesToAlwaysInclude", ""),
                          ("keyWordLetterTemplateDefaultForPrinting", -1)]
        template = f"<template{_attrs_to_xml(template_attrs)}>{pages}</template>"
        return (f'<TemplateDefinition Male="{_bool(self.male)}" Female="{_bool(self.female)}" Type="0">'
                f'{template}'
                f'<Name>{_text(self.name)}</Name>'
                f'<Description>{_text(self.description)}</Description>'
                f'<Category>{_text(self.category)}</Category>'
                f'<Icon>{_text(self.icon)}</Icon>'
                f'<Source>0</Source><SourceGroup>-1</SourceGroup>'
                f'<Position></Position>'
                f'</TemplateDefinition>')

    def xml(self):
        from datetime import datetime
        stamp = datetime.now().strftime("%d %b %Y %H:%M")
        return ('<?xml version="1.0" encoding="UTF-8" ?><SystmOneTemplates>'
                f'<!--Exported on {stamp}--><!--Exported by SystmAnyone (unofficial)-->'
                + self.body_xml() + '</SystmOneTemplates>')

    def file_bytes(self):
        xml = self.xml().encode("utf-8")
        try:
            ET.fromstring(xml)
        except ET.ParseError as error:
            raise ValueError(f"the exported XML is not well-formed: {error}") from error
        crc = zlib.crc32(xml) & 0xFFFFFFFF
        first = ("ID:" + str(crc)).ljust(23)[:23]
        return first.encode("ascii") + b"\n" + xml
