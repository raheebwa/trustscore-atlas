"""NLGRB licensed gaming operators register."""

import io
import json
import re
from urllib.parse import quote

import pdfplumber

BASE = "https://lgrb.go.ug"
WPDM_SEARCH = f"{BASE}/wp-json/wpdm/search"
TITLE_RE = re.compile(
    r"List of Licensed (?:Companies|Operators) For the Year\s*([0-9]{4})", re.IGNORECASE
)
COLUMNS = (
    "company_name",
    "trade_name",
    "licence_type",
    "website",
    "mode_of_operation",
    "licence_number",
)


def download_url(slug: str, package_id: int) -> str:
    return f"{BASE}/download/{quote(slug, safe='')}/?wpdmdl={package_id}"


def _clean(value) -> str:
    return " ".join(value.split()) if isinstance(value, str) else ""


def _latest_package(body: bytes) -> tuple[str, int, str]:
    try:
        payload = json.loads(body)
    except (TypeError, json.JSONDecodeError) as error:
        raise RuntimeError("NLGRB returned invalid download-manager JSON") from error
    packages = payload.get("packages") if isinstance(payload, dict) else None
    if not isinstance(packages, list):
        raise RuntimeError("NLGRB download-manager response has no packages list")

    candidates = []
    for package in packages:
        if not isinstance(package, dict):
            continue
        match = TITLE_RE.search(_clean(package.get("post_title")))
        slug = _clean(package.get("post_name"))
        try:
            package_id = int(package.get("ID"))
        except (TypeError, ValueError):
            continue
        if match and slug:
            candidates.append((int(match.group(1)), slug, package_id))
    if not candidates:
        raise RuntimeError("NLGRB published no annual licensed-companies package")
    year, slug, package_id = max(candidates, key=lambda item: item[0])
    return slug, package_id, str(year)


def _emit_pdf_rows(ctx, pdf_bytes: bytes, year: str, source_ref: str) -> None:
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            table = page.extract_table()
            if not table:
                continue
            for raw_row in table:
                cells = [_clean(cell) for cell in raw_row]
                if not cells or not re.fullmatch(r"[0-9]+\.?", cells[0]):
                    continue
                if len(cells) != len(COLUMNS) + 1:
                    ctx.drop_row("malformed operator row")
                    continue
                record = dict(zip(COLUMNS, cells[1:], strict=True))
                if not record["company_name"] or not record["licence_number"]:
                    ctx.drop_row("missing company name or licence number")
                    continue
                ctx.emit_record(record | {"year": year, "source_ref": source_ref})


def run(ctx) -> None:
    search = ctx.fetch(WPDM_SEARCH, headers={"Accept": "*/*"})
    ctx.raw.put("wpdm-search.json", search)
    slug, package_id, year = _latest_package(search)
    source_ref = download_url(slug, package_id)
    pdf_bytes = ctx.fetch(source_ref, headers={"Accept": "*/*"})
    ctx.raw.put(f"licensed-companies-{year}.pdf", pdf_bytes)
    _emit_pdf_rows(ctx, pdf_bytes, year, source_ref)
