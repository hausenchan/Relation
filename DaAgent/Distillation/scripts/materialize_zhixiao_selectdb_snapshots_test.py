#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile


SCRIPT = Path(__file__).with_name("materialize_zhixiao_selectdb_snapshots.py")


class MaterializeZhixiaoSelectDbSnapshotsTest(unittest.TestCase):
    def test_materializes_legacy_workbook_without_third_party_dependencies(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            snapshot_dir = root / "snapshots"
            output_dir = root / "out"
            snapshot_dir.mkdir()
            payload = {
                "dataset_code": "zhixiao_app_income_daily",
                "columns": ["日期", "小程序ID", "小程序名称", "收入"],
                "rows": [
                    {
                        "日期": "2026-07-31",
                        "小程序ID": "2088000000000001",
                        "小程序名称": "声享听伴",
                        "收入": "123.45",
                    }
                ],
            }
            manifest = {
                "datasets": [
                    {
                        "dataset_code": "zhixiao_app_income_daily",
                        "legacy_filename": "支小应用收入.xls",
                        "filename": "zhixiao_app_income_daily.json",
                    }
                ]
            }
            (snapshot_dir / "zhixiao_app_income_daily.json").write_text(
                json.dumps(payload, ensure_ascii=False),
                encoding="utf-8",
            )
            manifest_path = snapshot_dir / "manifest.json"
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")

            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--manifest",
                    str(manifest_path),
                    "--output-dir",
                    str(output_dir),
                ],
                check=True,
                capture_output=True,
                text=True,
            )

            summary = json.loads(result.stdout)
            self.assertTrue(summary["ok"])
            self.assertEqual(summary["written_count"], 1)
            workbook_path = output_dir / "支小应用收入.xls"
            self.assertTrue(workbook_path.exists())
            with ZipFile(workbook_path) as workbook:
                names = set(workbook.namelist())
                self.assertIn("xl/workbook.xml", names)
                self.assertIn("xl/worksheets/sheet1.xml", names)
                sheet_xml = workbook.read("xl/worksheets/sheet1.xml").decode("utf-8")
            self.assertIn("小程序名称", sheet_xml)
            self.assertIn("声享听伴", sheet_xml)
            self.assertIn("123.45", sheet_xml)


if __name__ == "__main__":
    unittest.main()
