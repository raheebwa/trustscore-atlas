# SPDX-License-Identifier: Apache-2.0
"""UNBS Product Certification Scheme register."""

import certifi

from atlas_pipeline.html import table_rows

ENDPOINT = "https://cims.unbs.go.ug/api/website/?per_page=20000"
TLS_VERIFY = certifi.where()
COLUMNS = (
    "permit_number",
    "certified_product",
    "holding_company",
    "district",
    "product_brand",
    "relevant_standard",
    "status",
    "expiry_date",
)
DUMP_CELLS = 9


def run(ctx) -> None:
    body = ctx.fetch(ENDPOINT, headers={"Accept": "*/*"})
    ctx.raw.put("certified-products.html", body)
    for row in table_rows(body.decode("utf-8", "replace"), table_id="dataTables-example"):
        if not row or not row[0].isdigit():
            continue
        if len(row) != DUMP_CELLS:
            ctx.drop_row("malformed row")
            continue
        values = dict(zip(COLUMNS, row[1:], strict=True))
        if not values["permit_number"] or not values["holding_company"]:
            ctx.drop_row("missing permit holder")
            continue
        ctx.emit_record(values | {"source_ref": ENDPOINT})
