"""Component catalogue for SystmOne clinical templates (type 0).

Validated against a real exported template ("SystmOneTemplates First Contact
Physio.xml").  This drives both the GUI palette/inspector and the XML writer.

Each component descriptor:
    tag        XML element name written into the template structure
    label      human name shown in the UI
    group      palette grouping
    size       (w, h) default size in template units
    attrs      list of attribute descriptors (see ATTR below)

Attribute descriptor keys:
    name       XML attribute name
    label      human label
    type       str | int | bool | code | codemulti | richtext | choice
    default    default value (omitted from XML when equal, as in real exports)
    choices    for `choice`
    help       tooltip
"""

# Calculated values are written as their own element (e.g. <bmi/>, <abpi/>).
CALCULATIONS = [
    ("bmi", "BMI"),
    ("targetbmi", "Target BMI"),
    ("idealweightdevineformula", "Ideal weight (Devine)"),
    ("idealweightlemmensformula", "Ideal weight (Lemmens)"),
    ("leanmass", "Lean body mass"),
    ("bodyarea", "Body surface area"),
    ("waisthip", "Waist:hip ratio"),
    ("weightloss", "Percentage weight loss"),
    ("abpi", "ABPI"),
    ("percentfev1", "% expected FEV1"),
    ("percentFvc", "% expected FVC"),
    ("percentfev1fvc", "FEV1/FVC ratio"),
    ("peakflow", "Predicted peak flow"),
    ("peakflowEU", "Predicted peak flow (EU)"),
    ("packyears", "Smoking pack years"),
    ("percentSerumChol", "Serum cholesterol:HDL ratio"),
    ("percentPlasmaChol", "Plasma cholesterol:HDL ratio"),
]
CALCULATION_TAGS = {tag for tag, _label in CALCULATIONS}

# Read-code fields shared by every coded component
_READCODE_COMMON = [
    {"name": "amendNotes", "label": "Amend notes button", "type": "bool", "default": False},
    {"name": "date", "label": "Record a date", "type": "bool", "default": False},
    {"name": "future", "label": "Allow future date", "type": "bool", "default": False},
    {"name": "showTimeComponent", "label": "Show time field", "type": "bool", "default": False},
    {"name": "problem", "label": "Link to a problem", "type": "bool", "default": False},
    {"name": "journal", "label": "Allow journal entry", "type": "bool", "default": False},
    {"name": "summary", "label": "Add to summary", "type": "bool", "default": False},
    {"name": "level", "label": "Priority / severity", "type": "int", "default": 0},
]

COMPONENTS = {
    # ---- layout --------------------------------------------------------------
    "hline": {
        "label": "Divider line", "group": "Layout", "size": (384, 0),
        "attrs": [
            {"name": "length", "label": "Length", "type": "int", "default": 384},
            {"name": "vertical", "label": "Vertical", "type": "bool", "default": False},
        ],
    },
    "title": {
        "label": "Heading", "group": "Layout", "size": (264, 24), "geometry": (),
        "attrs": [
            {"name": "text", "label": "Heading text", "type": "str", "default": ""},
            {"name": "colour", "label": "Text colour (RGB int)", "type": "int", "default": 0},
            {"name": "width", "label": "Width", "type": "int", "default": 264},
        ],
    },
    "formattedText": {
        "label": "Formatted text", "group": "Layout", "size": (264, 24),
        "attrs": [
            {"name": "textString", "label": "Rich text", "type": "richtext", "default": ""},
        ],
    },
    "textArea": {
        "label": "Free text box", "group": "Free text", "size": (360, 96),
        "attrs": [{"name": "text", "label": "Default text", "type": "str", "default": ""}],
    },
    "hyperlink": {
        "label": "Hyperlink", "group": "Layout", "size": (160, 20),
        "attrs": [
            {"name": "DisplayText", "label": "Link text", "type": "str", "default": ""},
            {"name": "URL", "label": "URL", "type": "str", "default": "http://"},
        ],
    },
    "pageLink": {
        "label": "Page link", "group": "Layout", "size": (160, 20),
        "attrs": [
            {"name": "DisplayText", "label": "Link text", "type": "str", "default": ""},
            {"name": "PageNumber", "label": "Target page", "type": "int", "default": 0},
        ],
    },
    "image": {
        "label": "Image", "group": "Layout", "size": (160, 120),
        "attrs": [
            {"name": "KeyImage", "label": "Image id", "type": "int", "default": 0},
            {"name": "Ratio", "label": "Keep aspect ratio", "type": "bool", "default": True},
        ],
    },
    "drawing": {
        "label": "Medical drawing", "group": "Layout", "size": (200, 200),
        "attrs": [
            {"name": "image", "label": "Drawing id", "type": "int", "default": 0},
            {"name": "legend", "label": "Show legend", "type": "bool", "default": True},
            {"name": "fix", "label": "Fixed", "type": "bool", "default": False},
        ],
    },

    # ---- read-coded ----------------------------------------------------------
    "checkBox": {
        "label": "Check box (code on tick)", "group": "Read-coded", "size": (360, 24), "geometry": ("w",),
        "attrs": [
            {"name": "text", "label": "Label text", "type": "str", "default": ""},
            {"name": "code", "label": "Read/CTV3 code recorded", "type": "code", "default": ""},
            {"name": "qual", "label": "Qualifier code", "type": "code", "default": ""},
            {"name": "default", "label": "Ticked by default", "type": "bool", "default": False},
            {"name": "reportDefault", "label": "Report default (-1 = none)", "type": "int", "default": -1},
            *_READCODE_COMMON,
        ],
    },
    "comboBox": {
        "label": "Single selection (code)", "group": "Read-coded", "size": (360, 24),
        "attrs": [
            {"name": "text", "label": "Label text", "type": "str", "default": ""},
            {"name": "codes", "label": "Options (code;code;...)", "type": "codemulti", "default": ""},
            {"name": "bias", "label": "Box width bias", "type": "int", "default": 25},
            {"name": "reqStat", "label": "Recording status", "type": "int", "default": 0},
            *_READCODE_COMMON,
        ],
    },
    "multipleSelection": {
        "label": "Multiple selection (codes)", "group": "Read-coded", "size": (360, 96),
        "attrs": [
            {"name": "text", "label": "Label text", "type": "str", "default": ""},
            {"name": "codes", "label": "Options (code;code;...)", "type": "codemulti", "default": ""},
            {"name": "horizontal", "label": "Lay out horizontally", "type": "bool", "default": False},
            *_READCODE_COMMON,
        ],
    },
    "radioPanel": {
        "label": "Radio buttons (codes)", "group": "Read-coded", "size": (360, 96),
        "attrs": [
            {"name": "text", "label": "Label text", "type": "str", "default": ""},
            {"name": "codes", "label": "Options (code;code;...)", "type": "codemulti", "default": ""},
            *_READCODE_COMMON,
        ],
    },
    "qualifierComboBox": {
        "label": "Qualified selection", "group": "Read-coded", "size": (360, 24),
        "attrs": [
            {"name": "text", "label": "Label text", "type": "str", "default": ""},
            {"name": "code", "label": "Read code", "type": "code", "default": ""},
            {"name": "quals", "label": "Qualifiers (code;...)", "type": "codemulti", "default": ""},
            {"name": "standard", "label": "Standard qualifier", "type": "code", "default": ""},
        ],
    },
    "date": {
        "label": "Date entry", "group": "Read-coded", "size": (360, 24),
        "attrs": [
            {"name": "text", "label": "Label text", "type": "str", "default": ""},
            {"name": "code", "label": "Read code recorded", "type": "code", "default": ""},
            *_READCODE_COMMON,
        ],
    },
    "notes": {
        "label": "Coded notes", "group": "Read-coded", "size": (360, 72),
        "attrs": [
            {"name": "text", "label": "Label text", "type": "str", "default": ""},
            {"name": "code", "label": "Read code recorded", "type": "code", "default": ""},
            {"name": "presetNotes", "label": "Preset text", "type": "str", "default": ""},
            {"name": "orientation", "label": "Label position (e.g. Top)", "type": "str", "default": ""},
            {"name": "reevaluate", "label": "Re-evaluate", "type": "bool", "default": False},
            {"name": "report", "label": "Report", "type": "bool", "default": False},
            *_READCODE_COMMON,
        ],
    },
    "patientNote": {
        "label": "Patient note", "group": "Free text", "size": (360, 96),
        "attrs": [
            {"name": "text", "label": "Label text", "type": "str", "default": ""},
            {"name": "presetNotes", "label": "Preset text", "type": "str", "default": ""},
            {"name": "dataEntryStyle", "label": "Entry style", "type": "int", "default": 0},
            {"name": "patientNoteType", "label": "Note type", "type": "int", "default": 0},
            {"name": "backDate", "label": "Allow back-dating", "type": "bool", "default": False},
            {"name": "futureDate", "label": "Allow future-dating", "type": "bool", "default": False},
            {"name": "bias", "label": "Width bias", "type": "int", "default": 25},
            {"name": "orientation", "label": "Label position (e.g. Top)", "type": "str", "default": ""},
        ],
    },
    "readCode": {
        "label": "Read code box", "group": "Read-coded", "size": (360, 24),
        "attrs": [
            {"name": "text", "label": "Label text", "type": "str", "default": ""},
            {"name": "code", "label": "Read code recorded", "type": "code", "default": ""},
            {"name": "restrictToSnomed", "label": "Restrict to SNOMED", "type": "bool", "default": False},
        ],
    },
    "bp": {
        "label": "Blood pressure", "group": "Read-coded", "size": (360, 48),
        "attrs": [
            {"name": "text", "label": "Label text", "type": "str", "default": "BP"},
            {"name": "BpType", "label": "BP type", "type": "choice", "default": "Systolic",
             "choices": [("Systolic", "Systolic"), ("Diastolic", "Diastolic"),
                         ("Standing", "Standing"), ("Sitting", "Sitting"),
                         ("Lying", "Lying"), ("Random", "Random")]},
            {"name": "BpTextMode", "label": "Text mode", "type": "int", "default": 0},
            {"name": "BodyRegion", "label": "Body region code", "type": "code", "default": ""},
            {"name": "Laterality", "label": "Laterality code", "type": "code", "default": ""},
            {"name": "ShowDetailBtn", "label": "Show detail button", "type": "bool", "default": True},
            {"name": "showArrow", "label": "Show trend arrow", "type": "bool", "default": True},
        ],
    },

    # ---- numeric / calculated ------------------------------------------------
    "numeric": {
        "label": "Numeric entry", "group": "Numeric", "size": (360, 24), "geometry": ("w",),
        "attrs": [
            {"name": "text", "label": "Label text", "type": "str", "default": ""},
            {"name": "code", "label": "Read code recorded", "type": "code", "default": ""},
            {"name": "units", "label": "Units", "type": "str", "default": ""},
            {"name": "factor", "label": "Conversion factor", "type": "int", "default": 1},
            {"name": "bounds", "label": "Bounds", "type": "str", "default": ""},
            {"name": "default", "label": "Default value", "type": "str", "default": ""},
        ],
    },
    "scoredAssessment": {
        "label": "Scored assessment", "group": "Numeric", "size": (360, 220),
        "attrs": [
            {"name": "text", "label": "Heading text", "type": "str", "default": ""},
            {"name": "code", "label": "Total score code", "type": "code", "default": ""},
            {"name": "repopulateDays", "label": "Repopulate (days)", "type": "int", "default": 0},
            {"name": "questions", "type": "questions", "label": "Questions & scoring",
             "default": ""},
        ],
    },
    "calculated": {
        "label": "Calculated value", "group": "Numeric", "size": (360, 24),
        "attrs": [
            {"name": "text", "label": "Label text", "type": "str", "default": ""},
            {"name": "calculation", "label": "Formula", "type": "choice", "default": "bmi",
             "choices": CALCULATIONS},
            {"name": "code", "label": "Result code", "type": "code", "default": ""},
        ],
    },
    "quickAction": {
        "label": "Quick action button", "group": "Special", "size": (160, 24),
        "attrs": [
            {"name": "label", "label": "Button label", "type": "str", "default": ""},
            {"name": "actionId", "label": "Action id", "type": "str", "default": ""},
        ],
    },
    "patientSignature": {
        "label": "Patient signature", "group": "Special", "size": (240, 60),
        "attrs": [{"name": "label", "label": "Label", "type": "str", "default": ""}],
    },
    "handover": {
        "label": "Handover element", "group": "Special", "size": (360, 24),
        "attrs": [
            {"name": "text", "label": "Label text", "type": "str", "default": ""},
            {"name": "category", "label": "Category", "type": "int", "default": 0},
        ],
    },
}

# XML element names as they appear in exported templates. Keys are the internal
# kind; values override the default (kind-as-tag).
TAGS = {
    "textArea": "textarea",
    "numeric": "number",
    "date": "dateOf",
    "multipleSelection": "multiple",
    "radioPanel": "radio",
    "qualifierComboBox": "qualifiedComboBox",
    "quickAction": "button",
    "hyperlink": "hyperLink",
    "patientSignature": "PatientSignature",
    "handover": "handover",
}
for _k, _t in TAGS.items():
    COMPONENTS[_k]["tag"] = _t
COMPONENTS["calculated"]["tag"] = "calculated"  # overridden per-calculation at write time

# Palette order
GROUP_ORDER = ["Read-coded", "Layout", "Free text", "Numeric", "Special"]
