"""Showcase template: a two-page deprescribing-focused structured medication review.

Every code is a current or optional CTV3 concept from the bundled dictionary.
The SNOMED "structured medication review" concept post-dates the April 2020 CTV3
freeze, so practices should add their local SystmOne code for it if they need it.
"""
from .model import Component, Page, Template

LEFT_X, RIGHT_X, COLUMN_W, FULL_W = 24, 504, 444, 924
PREVIOUS_YEAR = {"pvlimit": "Last", "pvtime": "52", "pvunit": "Wks"}


def _review_page():
    page = Page(name="Review")
    add = page.components.append

    add(Component("title", x=LEFT_X, y=12, w=FULL_W, width=FULL_W, text="Structured medication review: deprescribing focus"))
    add(Component("textArea", x=LEFT_X, y=40, w=FULL_W, h=36,
                  text="Review the current medication list with the patient or carer. Record risk factors "
                       "here, then the decisions and plan on the Decisions page."))
    add(Component("hline", x=LEFT_X, y=84, length=FULL_W))

    add(Component("title", x=LEFT_X, y=96, w=COLUMN_W, width=COLUMN_W, text="Review"))
    add(Component("radioPanel", x=LEFT_X, y=120, w=COLUMN_W, h=72, text="Review type",
                  codes="XaJCO;XaIVl;XaJCN"))
    add(Component("checkBox", x=LEFT_X, y=204, w=COLUMN_W, text="Polypharmacy medication review", code="XaaCQ"))
    add(Component("checkBox", x=LEFT_X, y=228, w=COLUMN_W, text="Reviewed by pharmacist", code="XaIoW"))
    add(Component("checkBox", x=LEFT_X, y=252, w=COLUMN_W, text="Medicines adherence checked", code="XaRF1"))
    add(Component("comboBox", x=LEFT_X, y=276, w=COLUMN_W, text="Adherence concern", bias=40,
                  codes="XaZBU;XaZBZ"))
    add(Component("checkBox", x=LEFT_X, y=300, w=COLUMN_W, text="Adherence discussed", code="XaZBg"))

    add(Component("hline", x=480, y=96, length=228, vertical=True))

    add(Component("title", x=RIGHT_X, y=96, w=COLUMN_W, width=COLUMN_W, text="Risk factors"))
    add(Component("numeric", x=RIGHT_X, y=120, w=COLUMN_W, text="Clinical frailty scale", code="XaQik",
                  bias=60, **PREVIOUS_YEAR))
    add(Component("comboBox", x=RIGHT_X, y=144, w=COLUMN_W, text="Frailty", bias=60,
                  codes="XabdY;Xabdb;Xabdd"))
    add(Component("numeric", x=RIGHT_X, y=168, w=COLUMN_W, text="Electronic frailty index", code="XagQk",
                  bias=60, **PREVIOUS_YEAR))
    add(Component("numeric", x=RIGHT_X, y=192, w=COLUMN_W, text="Anticholinergic burden (ACB) score",
                  code="XagBE", bias=60, **PREVIOUS_YEAR))
    add(Component("numeric", x=RIGHT_X, y=216, w=COLUMN_W, text="Falls in the last year", code="XaISO",
                  bias=60, **PREVIOUS_YEAR))
    add(Component("checkBox", x=RIGHT_X, y=240, w=COLUMN_W, text="Falls caused by medication", code="XaJHb"))
    add(Component("numeric", x=RIGHT_X, y=264, w=COLUMN_W, text="eGFR (CKD-EPI)", code="XaZpN",
                  bias=60, units="mL/min/1.73m2", **PREVIOUS_YEAR))
    return page


def _decisions_page():
    page = Page(name="Decisions", colour=-3342388)
    add = page.components.append

    add(Component("title", x=LEFT_X, y=12, w=COLUMN_W, width=COLUMN_W, text="Deprescribing decisions"))
    add(Component("multipleSelection", x=LEFT_X, y=36, w=COLUMN_W, h=132, text="Medication changes",
                  codes="XaJYl;XaInu;XaIns;XaInr;XaInt;XaJK6;8B316"))
    add(Component("notes", x=LEFT_X, y=180, w=COLUMN_W, h=96, text="Plan and rationale", code="XaQwG",
                  orientation="Top"))

    add(Component("hline", x=480, y=12, length=264, vertical=True))

    add(Component("title", x=RIGHT_X, y=12, w=COLUMN_W, width=COLUMN_W, text="Shared decision making"))
    add(Component("radioPanel", x=RIGHT_X, y=36, w=COLUMN_W, h=56, text="Decision support",
                  codes="XaYjh;XaYji"))
    add(Component("checkBox", x=RIGHT_X, y=104, w=COLUMN_W, text="Management plan agreed", code="XaJgg"))
    add(Component("checkBox", x=RIGHT_X, y=128, w=COLUMN_W, text="Patient declined proposed change",
                  code="XaYYH"))
    add(Component("date", x=RIGHT_X, y=164, w=COLUMN_W, text="Next medication review due", code="XaF8c"))
    add(Component("hline", x=RIGHT_X, y=200, length=COLUMN_W))
    add(Component("checkBox", x=RIGHT_X, y=212, w=COLUMN_W, text="Medication review done", code="XaF8d"))
    return page


def build_deprescribing_smr():
    t = Template(
        name="Deprescribing SMR",
        description="Showcase deprescribing-focused structured medication review (unofficial sample).",
        category="Miscellaneous",
        width=972,
    )
    t.pages = [_review_page(), _decisions_page()]
    return t


if __name__ == "__main__":
    import sys
    t = build_deprescribing_smr()
    out = sys.argv[1] if len(sys.argv) > 1 else "Deprescribing SMR.xml"
    with open(out, "wb") as f:
        f.write(t.file_bytes())
    print(f"wrote {out} ({len(t.file_bytes())} bytes)")
