import xml.etree.ElementTree as ET
import zlib

import pytest

from systmanyone.model import Component, Page, Template
from systmanyone.sample import build_deprescribing_smr


def _payload(fb: bytes) -> bytes:
    return fb.split(b"\n", 1)[1].split(b"?>", 1)[-1]


def test_crc_matches_content():
    fb = build_deprescribing_smr().file_bytes()
    first, rest = fb.split(b"\n", 1)
    assert first.startswith(b"ID:")
    assert int(first[3:].strip()) == (zlib.crc32(rest) & 0xFFFFFFFF)


def test_structure_tags_present():
    tags = {e.tag for e in ET.fromstring(_payload(build_deprescribing_smr().file_bytes())).iter()}
    assert {"SystmOneTemplates", "TemplateDefinition", "template", "page",
            "checkBox", "comboBox", "title", "textarea", "rc"} <= tags


def test_component_tags_are_authoritative():
    t = Template(name="t")
    t.pages[0].components.append(Component("textArea"))
    t.pages[0].components.append(Component("numeric"))
    t.pages[0].components.append(Component("date"))
    xml = t.body_xml()
    assert "<textarea" in xml
    assert "<number" in xml
    assert "<dateOf" in xml


def test_scored_assessment_and_bp_shapes():
    t = Template(name="t")
    p = t.pages[0]
    p.components.append(Component("scoredAssessment", text="Q",
                                  questions="Little interest * :: Not at all=38P70:0 ; Nearly every day=38P73:3"))
    p.components.append(Component("bp", BpType="Systolic"))
    xml = t.body_xml()
    assert "<qst" in xml and "<ans" in xml and 'checkbox="y"' in xml
    assert 'rc="38P73"' in xml and 'score="3"' in xml
    assert "<bp" in xml and 'BpType="Systolic"' in xml


def test_hline_length():
    t = Template(name="t")
    t.pages[0].components.append(Component("hline", x=12, y=40, length=200))
    assert 'length="200"' in t.body_xml()


def test_explicit_false_is_emitted_but_implicit_default_false_is_omitted():
    t = Template(name="t")
    implicit = Component("checkBox")
    explicit = Component("checkBox", default=False)
    changed = Component("checkBox")
    changed.props["default"] = False
    t.pages[0].components.extend((implicit, explicit, changed))

    checkboxes = ET.fromstring(t.body_xml()).findall(".//checkBox")

    assert "default" not in checkboxes[0].attrib
    assert checkboxes[1].get("default") == "n"
    assert checkboxes[2].get("default") == "n"


def test_assign_ids_preserves_existing_ids_and_starts_new_ids_above_maximum():
    t = Template(name="t")
    new_before = Component("title")
    existing_high = Component("title")
    existing_high.cid = 8
    new_middle = Component("title")
    existing_low = Component("title")
    existing_low.cid = 2
    new_after = Component("title")
    t.pages[0].components.extend(
        (new_before, existing_high, new_middle, existing_low, new_after)
    )

    t._assign_ids()

    assert existing_high.cid == 8
    assert existing_low.cid == 2
    assert t.pages[0].cid == 9
    assert [new_before.cid, new_middle.cid, new_after.cid] == [10, 11, 12]


def _parse_export(t):
    return ET.fromstring(t.file_bytes().split(b"\n", 1)[1])


def test_formatted_text_plain_text_with_markup_characters_is_escaped():
    t = Template(name="t")
    t.pages[0].components.append(Component("formattedText", textString="BP < 140 & HR"))
    assert _parse_export(t).find(".//formattedText").text == "BP < 140 & HR"


def test_formatted_text_well_formed_markup_is_kept():
    t = Template(name="t")
    t.pages[0].components.append(Component("formattedText", textString='<p><t b="b">Bold</t> &amp; plain</p>'))
    paragraph = _parse_export(t).find(".//formattedText/p")
    assert paragraph.find("t").get("b") == "b"
    assert paragraph.find("t").tail == " & plain"


@pytest.mark.parametrize("component", [
    Component("comboBox", text="Options", codes='XaF8d;B<2'),
    Component("checkBox", text="Tick", code="1239511000000100"),
    Component("scoredAssessment", text="Score", questions='Q :: Yes=C"&3:1'),
])
def test_codes_that_are_not_ctv3_are_rejected(component):
    t = Template(name="t")
    t.pages[0].components.append(component)
    with pytest.raises(ValueError, match="not a CTV3 code"):
        t.file_bytes()


def test_ctv3_codes_with_dot_padding_are_accepted():
    t = Template(name="t")
    t.pages[0].components.append(Component("comboBox", codes="XaF8d;8B3V.;13X..;Y1307"))
    assert [rc.get("rc") for rc in _parse_export(t).iter("rc")] == ["XaF8d", "8B3V.", "13X..", "Y1307"]


def test_unknown_calculation_is_rejected():
    t = Template(name="t")
    t.pages[0].components.append(Component("calculated", calculation='bmi foo="x"'))
    with pytest.raises(ValueError, match="calculation"):
        t.file_bytes()


def test_page_and_component_cids_are_unique_across_the_template():
    t = Template(name="t")
    t.pages.append(Page(name="Page 2"))
    t.pages[0].components.append(Component("title"))
    t.pages[1].components.append(Component("title"))
    cids = [int(e.get("Cid")) for e in _parse_export(t).iter() if e.get("Cid") is not None]
    assert len(cids) == len(set(cids)) == 5


def test_duplicate_existing_cids_are_reassigned():
    t = Template(name="t")
    first, duplicate = Component("title"), Component("title")
    first.cid = duplicate.cid = 4
    t.pages[0].cid = 4
    t.pages[0].components.extend((first, duplicate))
    t._assign_ids()
    assert t.pages[0].cid == 4
    assert {first.cid, duplicate.cid} == {5, 6}


def test_control_characters_are_stripped_from_export():
    t = Template(name="Bad\x01name", description="tab\tkept\x0bgone")
    t.pages[0].components.append(Component("title", text="x\x1fy"))
    root = _parse_export(t)
    assert root.findtext(".//Name") == "Badname"
    assert root.findtext(".//Description") == "tab\tkeptgone"
    assert root.find(".//title").get("text") == "xy"


def test_file_bytes_rejects_malformed_xml():
    t = Template(name="t")
    t.pages[0].components.append(Component("title"))
    t.pages[0].components[0].to_xml = lambda: "<title>"
    with pytest.raises(ValueError, match="not well-formed"):
        t.file_bytes()


def test_scored_question_flags_are_only_trailing_markers():
    t = Template(name="t")
    t.pages[0].components.append(Component(
        "scoredAssessment",
        questions="Any chest pain! :: Yes=XaA01:1\nRate 5* scale * ! :: Yes=XaB01:1"))
    first, second = _parse_export(t).iter("qst")
    assert first.get("text") == "Any chest pain!"
    assert first.get("mandatory") is None and first.get("checkbox") is None
    assert second.get("text") == "Rate 5* scale"
    assert second.get("mandatory") == "y" and second.get("checkbox") == "y"
