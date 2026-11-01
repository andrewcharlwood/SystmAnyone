import xml.etree.ElementTree as ET

import pytest

from systmanyone import read
from systmanyone.model import Component, Template
from systmanyone.sample import build_deprescribing_smr


def _parsed(raw: bytes):
    template, warnings = read.parse(raw)
    assert warnings == []
    return template


def _tags(fb: bytes):
    return {e.tag for e in ET.fromstring(fb.split(b"\n", 1)[1].split(b"?>", 1)[-1]).iter()}


def test_verify_crc_ok():
    ok, claimed, computed = read.verify_crc(build_deprescribing_smr().file_bytes())
    assert ok and claimed == computed


def test_verify_crc_detects_tampering():
    fb = bytearray(build_deprescribing_smr().file_bytes())
    fb[-3] ^= 0x01
    ok, _, _ = read.verify_crc(bytes(fb))
    assert not ok


def test_roundtrip_preserves_structure():
    fb = build_deprescribing_smr().file_bytes()
    t = _parsed(fb)
    assert t.name == "Deprescribing SMR"
    assert len(t.pages[0].components) == len(build_deprescribing_smr().pages[0].components)
    fb2 = t.file_bytes()
    assert read.verify_crc(fb2)[0]
    assert _tags(fb) == _tags(fb2)


def test_parse_without_id_line():
    fb = build_deprescribing_smr().file_bytes()
    body = fb.split(b"\n", 1)[1]
    t = _parsed(body)  # tolerate a file with no ID: header
    assert t.name == "Deprescribing SMR"


def test_page_false_gender_flags_roundtrip():
    t = Template(name="t")
    t.pages[0].male = False
    t.pages[0].female = False

    raw = t.file_bytes()
    page_element = ET.fromstring(raw.split(b"\n", 1)[1].split(b"?>", 1)[-1]).find(".//page")
    parsed_page = _parsed(raw).pages[0]

    assert page_element.get("male") == "n"
    assert page_element.get("female") == "n"
    assert parsed_page.male is False
    assert parsed_page.female is False


def test_selection_components_roundtrip_all_schema_properties_and_nested_options():
    common = {
        "amendNotes": True,
        "date": False,
        "future": True,
        "showTimeComponent": False,
        "problem": True,
        "journal": False,
        "summary": True,
        "level": 7,
    }
    components = [
        Component("comboBox", text="Combo", codes="XaA10;XaA20", bias=40, reqStat=2, **common),
        Component("multipleSelection", text="Multiple", codes="XaB10;XaB20", horizontal=False, **common),
        Component("radioPanel", text="Radio", codes="XaC10;XaC20", **common),
        Component("qualifierComboBox", text="Qualified", code="XaD00", quals="XaD10;XaD20", standard="XaD10"),
    ]
    t = Template(name="t")
    t.pages[0].components.extend(components)

    raw = t.file_bytes()
    root = ET.fromstring(raw.split(b"\n", 1)[1].split(b"?>", 1)[-1])
    parsed_components = _parsed(raw).pages[0].components

    assert [c.kind for c in parsed_components] == [c.kind for c in components]
    for parsed, original in zip(parsed_components, components):
        assert parsed.props == original.props
    assert parsed_components[0].props["date"] is False
    assert type(parsed_components[0].props["level"]) is int

    for tag, option_prop, codes in (
        ("comboBox", "codes", ["XaA10", "XaA20"]),
        ("multiple", "codes", ["XaB10", "XaB20"]),
        ("radio", "codes", ["XaC10", "XaC20"]),
        ("qualifiedComboBox", "quals", ["XaD10", "XaD20"]),
    ):
        element = root.find(f".//{tag}")
        assert element.get("codes") == (";".join(codes) if option_prop == "codes" else None)
        assert [rc.get("rc") for rc in element.findall("rc")] == codes


def test_calculated_elements_roundtrip_kind_and_calculation():
    components = [
        Component("calculated", calculation="bmi", text="BMI", code="XaE10"),
        Component("calculated", calculation="abpi", text="ABPI", code="XaE20"),
    ]
    t = Template(name="t")
    t.pages[0].components.extend(components)

    parsed_components = _parsed(t.file_bytes()).pages[0].components

    assert [c.kind for c in parsed_components] == ["calculated", "calculated"]
    assert [c.props["calculation"] for c in parsed_components] == ["bmi", "abpi"]
    for parsed, original in zip(parsed_components, components):
        assert parsed.props == original.props


def test_scored_assessment_questions_roundtrip_through_nested_xml():
    questions = (
        "Little interest * ! :: Not at all=38P70:0 ; Nearly every day=38P73:3\n"
        "Trouble sleeping ! :: Not at all=XaF10:0 ; Nearly every day=XaF20:3"
    )
    original = Component(
        "scoredAssessment", text="PHQ", code="XaG00", repopulateDays=14, questions=questions
    )
    t = Template(name="t")
    t.pages[0].components.append(original)

    raw = t.file_bytes()
    root = ET.fromstring(raw.split(b"\n", 1)[1].split(b"?>", 1)[-1])
    parsed = _parsed(raw).pages[0].components[0]

    assert parsed.kind == "scoredAssessment"
    assert parsed.props == original.props
    assert type(parsed.props["repopulateDays"]) is int
    first_question = root.find(".//qst")
    assert first_question.get("checkbox") == "y"
    assert first_question.get("mandatory") == "y"
    assert [(a.text, a.get("rc"), a.get("score")) for a in first_question.findall("ans")] == [
        ("Not at all", "38P70", "0"),
        ("Nearly every day", "38P73", "3"),
    ]


def test_to_json_includes_page_and_component_cids():
    t = Template(name="t")
    component = Component("title")
    component.cid = 19
    t.pages[0].cid = 6
    t.pages[0].components.append(component)

    data = read.to_json(t)

    assert data["pages"][0]["cid"] == 6
    assert data["pages"][0]["components"][0]["cid"] == 19


def test_to_json_marks_explicitly_imported_default_values():
    original = Component("checkBox", default=False)
    template = Template(name="t")
    template.pages[0].components.append(original)

    data = read.to_json(_parsed(template.file_bytes()))

    component = data["pages"][0]["components"][0]
    assert component["props"]["default"] is False
    assert "default" in component["_explicit"]


def _export_xml(template_inner: str) -> bytes:
    return ("<SystmOneTemplates><TemplateDefinition Male=\"y\" Female=\"y\" Type=\"0\">"
            f"<template Cid=\"0\" width=\"396\" height=\"636\">{template_inner}</template>"
            "<Name>Imported</Name></TemplateDefinition></SystmOneTemplates>").encode("utf-8")


def test_formatted_text_roundtrip_is_lossless():
    markup = 'BP &lt; 140 &amp; <t b="b">HR &gt; 100</t> tail &lt;x&gt;<p>para</p>'
    raw = _export_xml(f'<page Cid="1" name="P"><formattedText Cid="2" x="0" y="0" w="10" h="10">{markup}</formattedText></page>')

    imported = _parsed(raw)
    reexported = imported.file_bytes().split(b"\n", 1)[1].decode("utf-8")

    assert imported.pages[0].components[0].props["textString"] == markup
    assert f">{markup}</formattedText>" in reexported


def test_nested_containers_and_unknown_elements_are_reported_not_flattened():
    raw = _export_xml(
        '<page Cid="1" name="Main"><title Cid="2" x="0" y="0" text="Kept"/>'
        '<view Cid="3"/><view Cid="4"/><checkBoxReport Cid="5"/></page>'
        '<tabGroup Cid="6"><page Cid="7" name="Nested"><title Cid="8" text="Hidden"/></page></tabGroup>'
    )

    template, warnings = read.parse(raw)

    assert [p.name for p in template.pages] == ["Main"]
    assert [c.kind for c in template.pages[0].components] == ["title"]
    assert sorted(warnings) == sorted([
        "2 unsupported <view> elements in page 'Main' were not imported",
        "1 unsupported <checkBoxReport> element in page 'Main' was not imported",
        "1 unsupported <tabGroup> element in the template was not imported",
    ])


def test_parse_without_declaration_keeps_text_containing_declaration_end():
    raw = _export_xml('<page Cid="1" name="Is it ?> ok"/>')
    assert _parsed(raw).pages[0].name == "Is it ?> ok"


def test_parse_rejects_dtd_and_entity_declarations():
    raw = b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]>' + _export_xml("")
    with pytest.raises(ValueError, match="not allowed"):
        read.parse(raw)


UNMODELLED_FIXTURE = (
    '<?xml version="1.0" encoding="UTF-8" ?><SystmOneTemplates><TemplateDefinition Male="y" Female="y" Type="0">'
    '<template Cid="0" width="972" height="636" codes="" readCodesToAutoLinkDrugsTo="" codesToAlwaysInclude="" '
    'keyWordLetterTemplateDefaultForPrinting="-1"><page Cid="1" name="P" colour="-13108">'
    '<number Cid="2" x="24" y="180" w="444" h="24" text="Frailty score" code="XaQik" pvlimit="Last" pvtime="12" pvunit="Wks"/>'
    '<comboBox Cid="3" x="12" y="516" w="444" text="Conclusion" blank="n" codes="XabdY;Xabdb">'
    '<dependency cid="2" comparison="7" value="0.0" keyReport="-1"/><dependencyMode mode="0"/>'
    '<rc rc="XabdY" desc=""/><rc rc="Xabdb" desc=""/></comboBox>'
    '<vline Cid="4" x="816" y="204" length="84" vertical="y"/>'
    '</page></template><Name>t</Name></TemplateDefinition></SystmOneTemplates>'
).encode()


def test_unmodelled_attributes_and_children_survive_roundtrip():
    template = _parsed(UNMODELLED_FIXTURE)
    root = ET.fromstring(template.file_bytes().split(b"\n", 1)[1].split(b"?>", 1)[-1])

    number = root.find(".//number")
    assert (number.get("pvlimit"), number.get("pvtime"), number.get("pvunit")) == ("Last", "12", "Wks")
    combo = root.find(".//comboBox")
    assert combo.get("blank") == "n"
    assert [child.tag for child in combo] == ["dependency", "dependencyMode", "rc", "rc"]
    assert combo.find("dependency").attrib == {"cid": "2", "comparison": "7", "value": "0.0", "keyReport": "-1"}
    assert root.find(".//vline").attrib == {"Cid": "4", "x": "816", "y": "204", "length": "84", "vertical": "y"}


def test_settings_that_cannot_be_kept_are_reported():
    raw = (UNMODELLED_FIXTURE
           .replace(b'codesToAlwaysInclude=""', b'codesToAlwaysInclude="X1"')
           .replace(b'<rc rc="XabdY" desc=""/>', b'<rc rc="XabdY" desc="Robust"/>'))
    _, warnings = read.parse(raw)
    assert any("codesToAlwaysInclude" in warning for warning in warnings)
    assert any("option descriptions" in warning for warning in warnings)
