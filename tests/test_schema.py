from systmanyone import schema

KNOWN_TYPES = {"str", "int", "bool", "code", "codemulti", "richtext", "choice", "questions"}


def test_components_have_tag_and_wellformed_attrs():
    for kind, spec in schema.COMPONENTS.items():
        assert isinstance(spec.get("tag", kind), str) and spec.get("tag", kind)
        for a in spec["attrs"]:
            assert a["name"]
            assert a["type"] in KNOWN_TYPES, f"{kind}.{a['name']} has unknown type {a['type']}"
            if a["type"] == "choice":
                assert a.get("choices")


def test_tag_overrides_applied():
    assert schema.COMPONENTS["textArea"]["tag"] == "textarea"
    assert schema.COMPONENTS["numeric"]["tag"] == "number"
    assert schema.COMPONENTS["date"]["tag"] == "dateOf"
    assert schema.COMPONENTS["hyperlink"]["tag"] == "hyperLink"
    assert schema.COMPONENTS["radioPanel"]["tag"] == "radio"


def test_groups_cover_all_components():
    for kind, spec in schema.COMPONENTS.items():
        assert spec["group"] in schema.GROUP_ORDER, kind
