# SPDX-License-Identifier: Apache-2.0
"""Bank of Uganda supervised financial institutions register."""

import json

ENDPOINT = (
    "https://bou.or.ug/api/supervision"
    "?populate[supervisedInstitutions][populate][category][populate]=*"
)


def _code_rules():
    """The ug:bou_code pattern and null values from the pack, so adapter and conformance agree."""
    import re
    from pathlib import Path

    import yaml

    pack = yaml.safe_load((Path(__file__).resolve().parents[2] / "pack.yml").read_text())
    scheme = pack["identifier_schemes"]["ug:bou_code"]
    nulls = {str(value).strip().casefold() for value in scheme.get("null_values", [])}
    return re.compile(scheme["pattern"]), nulls


CODE_PATTERN, CODE_NULLS = _code_rules()


def _clean(value) -> str:
    return " ".join(value.split()) if isinstance(value, str) else ""


def _categories(body: bytes) -> list:
    try:
        payload = json.loads(body)
        categories = payload["data"]["supervisedInstitutions"]["category"]
    except (KeyError, TypeError, json.JSONDecodeError) as error:
        raise RuntimeError("Bank of Uganda returned an invalid supervision response") from error
    if not isinstance(categories, list):
        raise RuntimeError("Bank of Uganda supervision response has no category list")
    return categories


def run(ctx) -> None:
    body = ctx.fetch(ENDPOINT, headers={"Accept": "application/json"})
    ctx.raw.put("supervision.json", body)
    for raw_category in _categories(body):
        if not isinstance(raw_category, dict):
            ctx.drop_row("malformed category")
            continue
        category = _clean(raw_category.get("category"))
        items = raw_category.get("items")
        if not isinstance(items, list):
            ctx.drop_row("malformed category items")
            continue
        for item in items:
            if not isinstance(item, dict):
                ctx.drop_row("malformed institution row")
                continue
            code = _clean(item.get("code"))
            record = {
                "name": _clean(item.get("title")),
                "category": category,
                # Only values shaped like a register code become identifiers; the register
                # also prints notes ("Expired License") in the code column, and placeholders
                # such as 0000, which match the shape but identify nothing.
                "code": (
                    code
                    if CODE_PATTERN.fullmatch(code) and code.strip().casefold() not in CODE_NULLS
                    else ""
                ),
                "source_ref": ENDPOINT,
            }
            if not record["name"] or not record["category"]:
                ctx.drop_row("missing institution name or category")
                continue
            ctx.emit_record(record)
