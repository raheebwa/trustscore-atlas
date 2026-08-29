"""PPDA OCDS parties with aggregated procurement history."""

import json
import re
from datetime import date, datetime
from pathlib import Path
from urllib.parse import quote

BASE = "https://cdn.ppda.go.ug/api/open-data/v2/ocds"
MAX_STATUS_POLLS = 120
YEAR_PATTERN = re.compile(r"^[0-9]{4}-[0-9]{4}$")


def available_years_url() -> str:
    return f"{BASE}/available-years"


def exports_url() -> str:
    return f"{BASE}/exports"


def status_url(job_id: str) -> str:
    return f"{exports_url()}/{quote(job_id, safe='')}/status"


def download_url(job_id: str) -> str:
    return f"{exports_url()}/{quote(job_id, safe='')}/download"


def _json_object(body: bytes, label: str) -> dict:
    try:
        value = json.loads(body)
    except (TypeError, json.JSONDecodeError) as error:
        raise RuntimeError(f"PPDA returned invalid JSON for {label}") from error
    if not isinstance(value, dict):
        raise RuntimeError(f"PPDA returned a non-object JSON value for {label}")
    return value


def _available_years(ctx) -> list[str]:
    payload = _json_object(ctx.fetch(available_years_url()), "available years")
    data = payload.get("data")
    if not isinstance(data, list):
        raise RuntimeError("PPDA available years response has no data list")

    years = []
    for item in data:
        if not isinstance(item, dict):
            continue
        year = item.get("financial_year")
        if isinstance(year, str) and YEAR_PATTERN.fullmatch(year) and year not in years:
            years.append(year)

    requested = ctx.params.get("years")
    if not requested:
        return years
    if isinstance(requested, str):
        requested = [requested]
    selected = set(requested)
    return [year for year in years if year in selected]


def _download_package(ctx, year: str) -> tuple[bytes, str]:
    request = json.dumps({"fy": year, "format": "json"}).encode("utf-8")
    started = _json_object(
        ctx.fetch(
            exports_url(),
            method="POST",
            data=request,
            headers={"Content-Type": "application/json"},
        ),
        f"export start for {year}",
    )
    job_id = started.get("job_id")
    if not isinstance(job_id, str) or not job_id:
        raise RuntimeError(f"PPDA export for {year} returned no job_id")

    poll_url = started.get("status_url") or status_url(job_id)
    if not isinstance(poll_url, str):
        raise RuntimeError(f"PPDA export for {year} returned an invalid status_url")
    for _ in range(MAX_STATUS_POLLS):
        status = _json_object(ctx.fetch(poll_url), f"export status for {year}")
        state = status.get("status")
        if state == "complete":
            break
        if state in {"cancelled", "failed"}:
            raise RuntimeError(f"PPDA export for {year} ended with status {state}")
    else:
        raise RuntimeError(f"PPDA export for {year} did not complete")

    url = download_url(job_id)
    return ctx.fetch(url), url


def _new_party() -> dict:
    return {
        "seen_as_party": False,
        "name": "",
        "name_year": "",
        "roles": set(),
        "is_buyer": False,
        "awards_count": 0,
        "buyers": set(),
        "award_dates": [],
        "contracts_count": 0,
        "contract_dates": [],
        "tenders_count": 0,
        "years": set(),
    }


def _party(parties: dict[str, dict], party_id: str) -> dict:
    return parties.setdefault(party_id, _new_party())


def _references(value) -> list[dict]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _iso_date(value) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    try:
        if len(text) == 10:
            return date.fromisoformat(text).isoformat()
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        return None


def _valid_release(release) -> bool:
    if not isinstance(release, dict) or not release.get("ocid"):
        return False
    for field in ("parties", "awards", "contracts"):
        if release.get(field) is not None and not isinstance(release[field], list):
            return False
    if release.get("buyer") is not None and not isinstance(release["buyer"], dict):
        return False
    if release.get("tender") is not None and not isinstance(release["tender"], dict):
        return False
    return True


def _aggregate_release(ctx, parties: dict[str, dict], release: dict, year: str) -> None:
    for raw_party in _references(release.get("parties")):
        party_id = raw_party.get("id")
        if not isinstance(party_id, str) or not party_id:
            continue
        party = _party(parties, party_id)
        party["seen_as_party"] = True
        party["years"].add(year)

        name = raw_party.get("name")
        if isinstance(name, str) and name and year >= party["name_year"]:
            party["name"] = name
            party["name_year"] = year
        roles = raw_party.get("roles")
        if isinstance(roles, list):
            party["roles"].update(role for role in roles if isinstance(role, str) and role)
        if "buyer" in party["roles"]:
            party["is_buyer"] = True

    buyer = release.get("buyer") or {}
    buyer_id = buyer.get("id")
    if isinstance(buyer_id, str) and buyer_id:
        _party(parties, buyer_id)["is_buyer"] = True

    award_suppliers = {}
    for award in _references(release.get("awards")):
        supplier_ids = {
            supplier["id"]
            for supplier in _references(award.get("suppliers"))
            if isinstance(supplier.get("id"), str) and supplier["id"]
        }
        award_id = award.get("id")
        if isinstance(award_id, str) and award_id:
            award_suppliers[award_id] = supplier_ids
        award_date = _iso_date(award.get("date"))
        for supplier_id in supplier_ids:
            party = _party(parties, supplier_id)
            party["awards_count"] += 1
            if isinstance(buyer_id, str) and buyer_id:
                party["buyers"].add(buyer_id)
            if award_date:
                party["award_dates"].append(award_date)

    for contract in _references(release.get("contracts")):
        supplier_ids = award_suppliers.get(contract.get("awardID"), set())
        period = contract.get("period")
        if not isinstance(period, dict):
            period = {}
        contract_date = _iso_date(contract.get("dateSigned") or period.get("startDate"))
        for supplier_id in supplier_ids:
            party = _party(parties, supplier_id)
            party["contracts_count"] += 1
            if contract_date:
                party["contract_dates"].append(contract_date)

    tender = release.get("tender") or {}
    tenderer_ids = {
        tenderer["id"]
        for tenderer in _references(tender.get("tenderers"))
        if isinstance(tenderer.get("id"), str) and tenderer["id"]
    }
    for tenderer_id in tenderer_ids:
        _party(parties, tenderer_id)["tenders_count"] += 1


def _record(party_id: str, party: dict) -> dict:
    award_dates = party["award_dates"]
    contract_dates = party["contract_dates"]
    return {
        "party_id": party_id,
        "name": party["name"],
        "roles": ";".join(sorted(party["roles"])),
        "is_buyer": str(party["is_buyer"]).lower(),
        "awards_count": str(party["awards_count"]),
        "distinct_buyers": str(len(party["buyers"])),
        "first_award_date": min(award_dates) if award_dates else None,
        "last_award_date": max(award_dates) if award_dates else None,
        "contracts_count": str(party["contracts_count"]),
        "last_contract_date": max(contract_dates) if contract_dates else None,
        "tenders_count": str(party["tenders_count"]),
        "years_seen": ";".join(sorted(party["years"])),
        "source_ref": BASE,
    }


def _packages_from_dir(directory: Path) -> list[tuple[str, bytes]]:
    """Release packages received earlier, one file per fiscal year, named download-<fy>.json
    or gpp_ocds_<yyyy>_<yyyy>.json."""
    found = []
    for path in sorted(directory.iterdir()):
        match = re.fullmatch(r"(?:download-|gpp_ocds_)(\d{4})[-_](\d{4})\.json", path.name)
        if match:
            found.append((f"{match.group(1)}-{match.group(2)}", path.read_bytes()))
    if not found:
        raise RuntimeError(f"no release packages found in {directory}")
    return found


def _packages(ctx) -> list[tuple[str, bytes]]:
    packages_dir = ctx.params.get("packages_dir")
    if packages_dir:
        value = packages_dir[0] if isinstance(packages_dir, list) else packages_dir
        return _packages_from_dir(Path(value))
    return [(year, _download_package(ctx, year)[0]) for year in _available_years(ctx)]


def run(ctx) -> None:
    parties = {}
    for year, body in _packages(ctx):
        ctx.raw.put(f"ppda-{year}.json", body)
        package = _json_object(body, f"release package for {year}")
        releases = package.get("releases")
        if not isinstance(releases, list):
            raise RuntimeError(f"PPDA release package for {year} has no releases list")
        for release in releases:
            if not _valid_release(release):
                ctx.drop_row("malformed release")
                continue
            _aggregate_release(ctx, parties, release, year)

    for party_id in sorted(parties):
        party = parties[party_id]
        if party["seen_as_party"] and party["name"]:
            ctx.emit_record(_record(party_id, party))
