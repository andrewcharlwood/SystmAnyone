"""Code search for the template code pickers.

SystmOne templates store CTV3 codes. The bundled `data/ctv3.csv.gz` holds every
current and optional CTV3 concept with its preferred term (frozen April 2020,
Open Government Licence). Practices can add their own codes, such as TPP local
`Y` codes, with $SYSTMANYONE_TERMS: a `code,term` CSV/TSV file, or a directory of them.
"""
import csv
import gzip
import os
import sys

_BUNDLED = os.path.join(os.path.dirname(__file__), "data", "ctv3.csv.gz")

_INDEX = {}      # code -> (term, system)
_TERMS = []      # (lowercased term, code, term, system) for substring search


def _add_rows(rows, system):
    next(rows, None)
    for row in rows:
        if len(row) < 2 or not row[0].strip():
            continue
        code, term = row[0].strip(), row[1].strip()
        _INDEX.setdefault(code, (term, system))


def _read_text(path):
    with open(path, "rb") as fh:
        raw = fh.read()
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("cp1252", errors="replace")


def _load_local_file(path):
    delimiter = "\t" if path.lower().endswith(".tsv") else ","
    try:
        _add_rows(csv.reader(_read_text(path).splitlines(), delimiter=delimiter), "Local")
    except (OSError, csv.Error) as error:
        print(f"systmanyone: skipped terminology file {path}: {error}", file=sys.stderr)


def _local_files():
    for path in os.environ.get("SYSTMANYONE_TERMS", "").split(os.pathsep):
        if os.path.isdir(path):
            for name in sorted(os.listdir(path)):
                if name.lower().endswith((".csv", ".tsv")):
                    yield os.path.join(path, name)
        elif path:
            yield path


def _load():
    for path in _local_files():
        _load_local_file(path)
    with gzip.open(_BUNDLED, "rt", newline="", encoding="utf-8") as fh:
        _add_rows(csv.reader(fh), "CTV3")
    for code, (term, system) in _INDEX.items():
        _TERMS.append((term.lower(), code, term, system))


_load()


def count():
    return len(_INDEX)


def terms(codes):
    return {code: _INDEX[code][0] for code in codes if code in _INDEX}


def search(q, limit=20):
    q = (q or "").strip()
    if not q:
        return []
    ql = q.lower()
    exact, prefix, tstart, tsub = [], [], [], []
    for lterm, code, term, system in _TERMS:
        if code == q:
            exact.append(code)
        elif code.startswith(q):
            prefix.append(code)
        elif lterm.startswith(ql):
            tstart.append(code)
        elif ql in lterm and len(tsub) < limit:
            tsub.append(code)
    out = []
    for group in (exact, prefix, tstart, tsub):
        for code in group:
            term, system = _INDEX[code]
            out.append({"code": code, "term": term, "system": system})
            if len(out) >= limit:
                return out
    return out
