"""Central Bank of Kenya licensed bank directories."""

from atlas_pipeline.html import table_rows

COMMERCIAL_URL = (
    "https://www.centralbank.go.ke/bank-supervision/commercial-banks-mortgage-finance-institutions/"
)
MICROFINANCE_URL = "https://www.centralbank.go.ke/bank-supervision/microfinance-banks/"

COMMERCIAL_BANK = "commercial_bank"
MICROFINANCE_BANK = "microfinance_bank"


def _emit_rows(ctx, source_ref: str, category: str, body: bytes) -> None:
    for row in table_rows(body.decode("utf-8", "replace")):
        if not row:
            continue
        if row[0].lower() in {"name", "institution name", "institution"}:
            continue
        if len(row) < 2:
            ctx.drop_row("malformed row")
            continue
        name = row[0].strip()
        licence_number = row[1].strip()
        if not name:
            ctx.drop_row("malformed row")
            continue
        ctx.emit_record(
            {
                "name": name,
                "category": category,
                "licence_number": licence_number,
                "source_ref": source_ref,
            }
        )


def run(ctx) -> None:
    # Store each page right after its fetch so the manifest records the URL it came from.
    commercial = ctx.fetch(COMMERCIAL_URL)
    ctx.raw.put("commercial-banks.html", commercial)
    microfinance = ctx.fetch(MICROFINANCE_URL)
    ctx.raw.put("microfinance-banks.html", microfinance)
    _emit_rows(ctx, COMMERCIAL_URL, COMMERCIAL_BANK, commercial)
    _emit_rows(ctx, MICROFINANCE_URL, MICROFINANCE_BANK, microfinance)
