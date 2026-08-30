# SPDX-License-Identifier: Apache-2.0
"""KCCA licensed businesses.

The directory page queries one endpoint per business nature; an empty division returns all
five divisions in one response. Each response is one HTML table: a header row, one row per
listing (name, category, nature, contact, email, division) and a TOTAL footer row.
"""

from pathlib import Path
from urllib.parse import urlencode

from atlas_pipeline.html import table_rows

ENDPOINT = "https://kcca.go.ug/sitePages/business_query.php"
DIVISIONS = {
    "Central Division",
    "Kawempe Division",
    "Makindye Division",
    "Nakawa Division",
    "Rubaga Division",
}
COLUMNS = 6


def query_url(nature: str) -> str:
    return f"{ENDPOINT}?{urlencode({'nature': nature, 'name': '', 'division': ''})}"


def raw_name(nature: str) -> str:
    return "".join(c if c.isalnum() else "-" for c in nature.lower()).strip("-") + ".html"


def natures() -> list[str]:
    text = (Path(__file__).with_name("natures.txt")).read_text()
    return [line.strip() for line in text.splitlines() if line.strip()]


def run(ctx) -> None:
    for nature in ctx.params.get("natures") or natures():
        url = query_url(nature)
        html = ctx.fetch(url)
        ctx.raw.put(raw_name(nature), html)
        for row in table_rows(html.decode("utf-8", "replace")):
            if not row or row[0].upper() == "BUSINESS NAME":
                continue
            if len(row) == 1 and row[0].startswith("TOTAL"):
                continue
            if len(row) < COLUMNS or row[5] not in DIVISIONS:
                ctx.drop_row("malformed row")
                continue
            name, category, kind, contact, email, division = row[:COLUMNS]
            ctx.emit_record(
                {
                    "business_name": name,
                    "business_category": category,
                    "business_nature": kind,
                    "contact": contact,
                    "email": email,
                    "division": division,
                    "source_nature_query": nature,
                    "source_ref": url,
                }
            )
