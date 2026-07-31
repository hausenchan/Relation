#!/usr/bin/env python3
"""Materialize Zhixiao SelectDB JSON snapshots into legacy workbook inputs.

The current Zhixiao HTML generator still reads the fixed legacy report files.
This bridge keeps that generator working while SelectDB becomes the source of
truth. SQL templates must alias their output columns to the legacy report
headers expected by generate_multi3_report_project.py.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, help="Path to SelectDB snapshot manifest.json")
    parser.add_argument("--output-dir", required=True, help="Legacy report source output directory")
    return parser.parse_args()


def read_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def ordered_headers(rows: list[dict], declared_columns: list[str] | None = None) -> list[str]:
    headers: list[str] = []
    for column in declared_columns or []:
        if column and column not in headers:
            headers.append(str(column))
    for row in rows:
        for key in row.keys():
            if key not in headers:
                headers.append(str(key))
    return headers


def column_name(index: int) -> str:
    name = ""
    current = index
    while current:
        current, remainder = divmod(current - 1, 26)
        name = chr(65 + remainder) + name
    return name


def cell_xml(value, row_index: int, column_index: int) -> str:
    ref = f"{column_name(column_index)}{row_index}"
    if value is None:
        text = ""
    else:
        text = str(value)
    escaped = escape(text, {'"': '&quot;'})
    return f'<c r="{ref}" t="inlineStr"><is><t>{escaped}</t></is></c>'


def worksheet_xml(rows: list[dict], headers: list[str]) -> str:
    sheet_rows = []
    all_rows = [dict(zip(headers, headers))] + rows
    for row_index, row in enumerate(all_rows, start=1):
        cells = ''.join(cell_xml(row.get(header, ""), row_index, column_index) for column_index, header in enumerate(headers, start=1))
        sheet_rows.append(f'<row r="{row_index}">{cells}</row>')
    max_column = column_name(max(1, len(headers)))
    max_row = max(1, len(all_rows))
    dimension = f"A1:{max_column}{max_row}"
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="{dimension}"/>
  <sheetData>{''.join(sheet_rows)}</sheetData>
</worksheet>'''


def write_xlsx(path: Path, rows: list[dict], headers: list[str]) -> None:
    files = {
        '[Content_Types].xml': '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>''',
        '_rels/.rels': '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>''',
        'xl/workbook.xml': '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>''',
        'xl/_rels/workbook.xml.rels': '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>''',
        'xl/worksheets/sheet1.xml': worksheet_xml(rows, headers),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(path, 'w', ZIP_DEFLATED) as workbook:
        for filename, content in files.items():
            workbook.writestr(filename, content)


def write_workbook(path: Path, rows: list[dict], declared_columns: list[str] | None = None) -> None:
    headers = ordered_headers(rows, declared_columns)
    write_xlsx(path, rows, headers)


def main() -> None:
    args = parse_args()
    manifest_path = Path(args.manifest).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    manifest = read_json(manifest_path)
    snapshot_dir = manifest_path.parent
    written: list[dict] = []

    for dataset in manifest.get("datasets", []):
        dataset_code = dataset.get("dataset_code")
        legacy_filename = dataset.get("legacy_filename")
        filename = dataset.get("filename") or f"{dataset_code}.json"
        if not dataset_code or not legacy_filename:
            continue
        payload = read_json(snapshot_dir / filename)
        rows = payload.get("rows") or []
        if not isinstance(rows, list):
            rows = []
        output_path = output_dir / legacy_filename
        write_workbook(output_path, rows, payload.get("columns") or [])
        written.append({
            "dataset_code": dataset_code,
            "legacy_filename": legacy_filename,
            "row_count": len(rows),
        })

    print(json.dumps({
        "ok": True,
        "source": str(manifest_path.name),
        "output_dir": str(output_dir),
        "written_count": len(written),
        "written": written,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
