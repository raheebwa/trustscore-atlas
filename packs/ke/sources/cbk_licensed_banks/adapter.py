# SPDX-License-Identifier: Apache-2.0
"""Central Bank of Kenya licensed bank directories."""

import io
import re
from html.parser import HTMLParser
from urllib.parse import unquote, urljoin, urlsplit

import pdfplumber

BANK_SUPERVISION_URL = "https://www.centralbank.go.ke/bank-supervision/"

COMMERCIAL_BANK = "commercial_bank"
MORTGAGE_FINANCE_INSTITUTION = "mortgage_finance_institution"
BANK_HOLDING_COMPANY = "bank_holding_company"
MICROFINANCE_BANK = "microfinance_bank"

UPLOAD_RE = re.compile(
    r"/wp-content/uploads/(?P<year>[0-9]{4})/(?P<month>[0-9]{2})/"
    r"(?P<filename>[^/?#]+\.pdf)$",
    re.IGNORECASE,
)
ENTRY_RE = re.compile(r"^(?P<number>[0-9]+)\.\s*(?P<name>.*)$")
FIELD_RE = re.compile(
    r"(?P<label>"
    r"Licensed\s+Subsidiary|Postal\s+Address|Physical\s+Address|"
    r"Contact\s+Centre\s+Tel|Switch\s+Board\s+Tel|Contact\s+Centre|"
    r"Date\s+Authori[sz]ed|Date\s+Licen[cs]ed|Peer\s+Group|"
    r"E-mail\s+address|Telephone|Website|Branches|E-mail|Email|Fax|SMS"
    r")\s*:",
    re.IGNORECASE,
)

FIELD_NAMES = {
    "website": "website",
    "date licensed": "date_licensed",
    "date licenced": "date_licensed",
    "date authorised": "date_licensed",
    "date authorized": "date_licensed",
    "peer group": "peer_group",
    "branches": "branches",
}


class _LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.hrefs: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag.lower() != "a":
            return
        href = dict(attrs).get("href")
        if href:
            self.hrefs.append(href)


def _clean(value: str) -> str:
    return " ".join(value.split())


def _directory_kind(filename: str) -> str | None:
    words = re.sub(r"[-_]+", " ", unquote(filename)).lower()
    if "microfinance banks" in words:
        return "microfinance"
    if "commercial banks" in words:
        return "commercial"
    return None


def _latest_directories(body: bytes) -> dict[str, tuple[str, str]]:
    parser = _LinkParser()
    parser.feed(body.decode("utf-8", "replace"))
    candidates: dict[str, list[tuple[int, int, str]]] = {
        "commercial": [],
        "microfinance": [],
    }
    for href in parser.hrefs:
        url = urljoin(BANK_SUPERVISION_URL, href)
        match = UPLOAD_RE.search(urlsplit(url).path)
        if not match:
            continue
        kind = _directory_kind(match.group("filename"))
        year, month = int(match.group("year")), int(match.group("month"))
        if kind and 1 <= month <= 12:
            candidates[kind].append((year, month, url))

    selected = {}
    for kind, links in candidates.items():
        if not links:
            raise RuntimeError(f"CBK Bank Supervision page has no {kind}-banks PDF link")
        year, month, url = max(links)
        selected[kind] = (url, f"{year:04d}/{month:02d}")
    return selected


def _section_category(line: str) -> str | None:
    upper = _clean(line).upper()
    prefix = re.match(r"^(?P<section>[A-Z])\s*[:.]\s*", upper)
    if prefix:
        section = prefix.group("section")
        heading = upper[prefix.end() :]
        if section == "A" and "COMMERCIAL BANKS" in heading:
            return COMMERCIAL_BANK
        if section == "B" and "MORTGAGE FINANCE" in heading:
            return MORTGAGE_FINANCE_INSTITUTION
        if section == "C" and "HOLDING COMPANIES" in heading:
            return BANK_HOLDING_COMPANY
        if "MICROFINANCE BANKS" in heading:
            return MICROFINANCE_BANK
    if "DIRECTORY OF LICENCED MICROFINANCE BANKS" in upper:
        return MICROFINANCE_BANK
    if "DIRECTORY OF LICENSED MICROFINANCE BANKS" in upper:
        return MICROFINANCE_BANK
    return None


def _ignored_line(line: str) -> bool:
    upper = _clean(line).upper()
    return (
        not upper
        or upper == "CENTRAL BANK OF KENYA"
        or upper.startswith("DIRECTORY OF LICENCED COMMERCIAL BANKS")
        or upper.startswith("DIRECTORY OF LICENSED COMMERCIAL BANKS")
        or upper.startswith("INSTITUTIONS AND AUTHORISED NON-OPERATING")
        or upper.startswith("INSTITUTIONS AND AUTHORIZED NON-OPERATING")
        or upper == "COMPANIES"
        or re.fullmatch(r"PAGE [0-9]+ OF [0-9]+", upper) is not None
        or upper == "C2: CBK - OFFICIAL"
        or upper in {"ST", "ND", "RD", "TH"}
    )


def _field_name(label: str) -> str:
    normalised = _clean(label).lower()
    return FIELD_NAMES.get(normalised, normalised.replace("-", "_").replace(" ", "_"))


def _append_field(entry: dict, field: str, value: str) -> None:
    entry["fields"].setdefault(field, [])
    if value := _clean(value):
        entry["fields"][field].append(value)
    entry["has_field"] = True


def _emit_entry(ctx, entry: dict | None, directory_edition: str, source_ref: str) -> None:
    if entry is None:
        return
    if not entry["name"] or not entry["category"] or not entry["has_field"]:
        ctx.drop_row("malformed institution entry")
        return

    fields = {name: _clean(" ".join(parts)) for name, parts in entry["fields"].items() if parts}
    website = "".join(fields.get("website", "").split()).rstrip(";")
    ctx.emit_record(
        {
            "name": entry["name"],
            "category": entry["category"],
            "website": website,
            "date_licensed": fields.get("date_licensed", ""),
            "peer_group": fields.get("peer_group", ""),
            "branches": fields.get("branches", ""),
            "directory_edition": directory_edition,
            "source_ref": source_ref,
        }
    )


def _emit_pdf_rows(ctx, body: bytes, directory_edition: str, source_ref: str) -> None:
    category = None
    current = None
    current_field = None
    with pdfplumber.open(io.BytesIO(body)) as pdf:
        for page in pdf.pages:
            for raw_line in (page.extract_text() or "").splitlines():
                line = _clean(raw_line)
                if section := _section_category(line):
                    _emit_entry(ctx, current, directory_edition, source_ref)
                    category = section
                    current = None
                    current_field = None
                    continue
                if _ignored_line(line):
                    continue
                if match := ENTRY_RE.fullmatch(line):
                    _emit_entry(ctx, current, directory_edition, source_ref)
                    name = _clean(match.group("name"))
                    if not name:
                        ctx.drop_row("malformed institution entry")
                        current = None
                    else:
                        current = {
                            "name": name,
                            "category": category,
                            "fields": {},
                            "has_field": False,
                        }
                    current_field = None
                    continue
                if current is None:
                    continue

                matches = list(FIELD_RE.finditer(line))
                if matches:
                    if current_field and matches[0].start():
                        _append_field(current, current_field, line[: matches[0].start()])
                    for index, field_match in enumerate(matches):
                        end = matches[index + 1].start() if index + 1 < len(matches) else len(line)
                        current_field = _field_name(field_match.group("label"))
                        _append_field(current, current_field, line[field_match.end() : end])
                elif current_field:
                    _append_field(current, current_field, line)
    _emit_entry(ctx, current, directory_edition, source_ref)


def run(ctx) -> None:
    page = ctx.fetch(BANK_SUPERVISION_URL)
    ctx.raw.put("bank-supervision.html", page)
    directories = _latest_directories(page)

    commercial_url, commercial_edition = directories["commercial"]
    commercial = ctx.fetch(commercial_url, headers={"Accept": "*/*"})
    ctx.raw.put("commercial-banks.pdf", commercial)

    microfinance_url, microfinance_edition = directories["microfinance"]
    microfinance = ctx.fetch(microfinance_url, headers={"Accept": "*/*"})
    ctx.raw.put("microfinance-banks.pdf", microfinance)

    _emit_pdf_rows(ctx, commercial, commercial_edition, commercial_url)
    _emit_pdf_rows(ctx, microfinance, microfinance_edition, microfinance_url)
