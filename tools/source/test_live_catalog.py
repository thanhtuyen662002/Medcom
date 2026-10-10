import json
from pathlib import Path
import shutil
import tempfile
import unittest

from validate_live_catalog import ROOT, SNAPSHOT, validate


class LiveCatalogTests(unittest.TestCase):
    def test_observed_live_catalog_is_finite_integral_and_separate_from_release_acceptance(self):
        result = validate()
        self.assertEqual(1665, result["objects"])
        self.assertEqual(13534, result["columns"])
        self.assertEqual(118, result["documentColumns"])
        self.assertFalse(result["productionAccepted"])

    def test_missing_member_changed_bytes_and_fabricated_acceptance_fail(self):
        for mutation in ("missing", "changed", "accepted"):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                directory = root / SNAPSHOT
                shutil.copytree(ROOT / SNAPSHOT, directory)
                source_path = directory / "source-set.json"
                source = json.loads(source_path.read_text(encoding="utf-8"))
                if mutation == "missing":
                    source["members"].pop("catalog-triggers.json")
                elif mutation == "changed":
                    with (directory / "document-read-tables.json").open("ab") as output:
                        output.write(b" ")
                else:
                    source["productionAccepted"] = True
                source_path.write_text(json.dumps(source), encoding="utf-8")
                with self.assertRaises(ValueError):
                    validate(root)

    def test_windows_checkout_preserves_canonical_metadata_integrity(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            directory = root / SNAPSHOT
            shutil.copytree(ROOT / SNAPSHOT, directory)
            for path in directory.glob("*.json"):
                path.write_bytes(path.read_bytes().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n"))
            self.assertEqual("PASS", validate(root)["snapshotIntegrity"])
