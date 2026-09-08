"""Example fixture loader for Noomori text-import golden tests."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures" / "text_import"
MANIFEST = json.loads((FIXTURES / "manifest.json").read_text())


@pytest.mark.parametrize("case", MANIFEST["fixtures"], ids=lambda case: case["id"])
def test_text_import_golden_fixture(case):
    source = (FIXTURES / "input" / f"{case['id']}.txt").read_text()
    expected = json.loads(
        (FIXTURES / "expected" / f"{case['id']}.json").read_text()
    )

    # Replace with the real parser/API adapter.
    result = parse_recipe_text_contract(source)

    assert_contract(result, expected)
