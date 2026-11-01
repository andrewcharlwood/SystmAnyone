# SystmAnyone

*Clinical templates for SystmOne, built by anyone.*

Build SystmOne clinical templates (type 0) in a browser and export an `.xml`
file in the same format SystmOne's own template export uses.

This is an **unofficial** tool. It is not affiliated with or endorsed by TPP.
The file format has been validated against real, publicly published exports.

> **Not clinically safety-assured.** No clinical safety case (DCB0129) exists
> for this tool. Anyone deploying a template made with it is responsible for
> their own DCB0160 assessment: check every code and test the template in a
> training unit before live use.

## Run
```
pip install .
systmanyone                              # GUI at http://127.0.0.1:8801
python3 -m systmanyone.sample out.xml    # write the sample template from the CLI
```
The only dependency is Flask.

## What works
- Drag-and-drop editor: the form preview is the canvas. Move, resize, align,
  layers, multiple pages, undo/redo, local autosave.
- Code picker over every current and optional CTV3 concept (269k, bundled).
- Export with the `ID:<crc32>` header SystmOne checks on import.
- Import of existing exports. Attributes and child elements the editor does not
  model (for example `dependency` show/hide rules) are carried through unchanged
  on re-export; anything that cannot be kept (such as embedded `view` elements)
  is listed before the file opens.
- A two-page showcase sample: a deprescribing-focused medication review.

Not yet tested: importing an exported file into a live SystmOne.

## Codes
SystmOne templates store **CTV3** codes (5 characters, e.g. `XaF8d`, `8B3V.`).
Export rejects anything else.

NHS England froze CTV3 in April 2020. SNOMED CT concepts created since then
have no public CTV3 code; SystmOne records them with TPP local codes (`Y....`),
which are not published. To use them, export them from your own SystmOne and
point the tool at a `code,term` CSV/TSV file (or a directory of them):
```
SYSTMANYONE_TERMS=/path/to/local_codes.csv systmanyone
```
Local entries take precedence over the bundled CTV3 terms.

## File format
```
ID:<crc32 decimal, space-padded to 23 characters>\n
<?xml version="1.0" encoding="UTF-8" ?><SystmOneTemplates>…
  <TemplateDefinition Male= Female= Type="0">
    <template …><page …> …components… </page></template>
    <Name/><Description/><Category/><Icon/><Source/><SourceGroup/><Position/>
  </TemplateDefinition>
</SystmOneTemplates>
```
The CRC is `zlib.crc32` over every byte after the first line. SystmOne refuses
a file whose CRC does not match.

Component elements include `checkBox`, `comboBox`, `multiple`, `radio`,
`number`, `dateOf`, `notes`, `textarea`, `formattedText`, `title`, `hline`,
`vline`, `button`, `hyperLink`, `qualifiedComboBox`, `bp`, `scoredAssessment`
and calculated values (`bmi`, `abpi`, `idealweight`, …). `tabGroup`,
`sectionGroup` and `view` are not supported by the editor.

## Limitations
- Some attributes are inferred rather than confirmed by a real export;
  calculated values, scored assessments and BP are approximations.
- `Icon` and `Category` refer to practice or TPP content and are left at defaults.
- The preview approximates SystmOne's renderer (fonts, control styling).

## Layout
```
systmanyone/
  schema.py       component catalogue: drives the editor and the XML writer
  model.py        template model, XML export, CRC, CTV3 validation
  read.py         import and CRC check of existing exports
  terminology.py  code search (bundled CTV3 + optional local files)
  sample.py       showcase template
  server.py       Flask API and GUI server
  static/         editor (vanilla JavaScript ES modules)
  data/           ctv3.csv.gz and its provenance
```

## Licence
Code: MIT (see `LICENSE`). Bundled CTV3 terminology: Crown copyright, Open
Government Licence v3.0 (see `systmanyone/data/README.md`).

SystmOne is a trademark of TPP. SystmAnyone is an independent project, not
affiliated with or endorsed by TPP; the name refers to SystmOne only to
describe compatibility.
