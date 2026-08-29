"""Bank of Uganda supervised financial institutions register."""

import json

ENDPOINT = (
    "https://bou.or.ug/api/supervision"
    "?populate[supervisedInstitutions][populate][category][populate]=*"
)


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
            record = {
                "name": _clean(item.get("title")),
                "category": category,
                "code": _clean(item.get("code")),
                "source_ref": ENDPOINT,
            }
            if not record["name"] or not record["category"]:
                ctx.drop_row("missing institution name or category")
                continue
            ctx.emit_record(record)
