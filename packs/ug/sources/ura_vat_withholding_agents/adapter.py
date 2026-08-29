"""URA VAT withholding agents report."""

import re
from datetime import datetime
from urllib.parse import urlencode

from atlas_pipeline.html import table_rows

BASE = "https://ura.go.ug/Portal/reportController/do"
REPORT_CODE = 1004
PAGE_SIZE = 10
EXTRA_PARAMS = {}
COLUMNS = ("sr_no", "tin", "name", "designation_effective_date")


def parameter_url() -> str:
    return f"{BASE}?{urlencode({'reportCode': REPORT_CODE, 'actionCode': 'RPRTPARAMETERPAGE'})}"


def result_url() -> str:
    return f"{BASE}?actionCode=REPORTSEARCHRESULTS&FromParaPage=TRUE"


def first_page_data(csrf: str) -> dict[str, str]:
    return {
        "_csrf": csrf,
        "reportCode": str(REPORT_CODE),
        "prm_tin": "",
        "prm_name": "",
        "prm0_reportCode": str(REPORT_CODE),
        "prm0_actionCode": "RPRTPARAMETERPAGE",
        "fieldsToSkip": "hParaShowString",
        "hParaShowString": "",
        **EXTRA_PARAMS,
    }


def ajax_url(page: int) -> str:
    params = {
        "actionCode": "RPRTPAJAXSRCHDATASTRING",
        "reportCode": str(REPORT_CODE),
        "crntRprtLevel": "1",
        "ajaxRequestType": "goToPage",
        "reqPageNum": str(page),
        "isAdmin": "",
        "fieldsToSkip": "prm1_paraDisStr",
        "prm1_ajaxComboTarget": "",
        "prm1_reportCode": str(REPORT_CODE),
        "prm1_rprtPageNum": str(page - 1),
        "prm1_paraDisStr": "",
        "prm1_name": "",
        "prm1_tin": "",
    }
    return f"{BASE}?{urlencode(params)}"


def _csrf(html: str) -> str:
    match = re.search(r'name=["\']_csrf["\'][^>]*value=["\']([^"\']+)', html)
    if not match:
        raise RuntimeError("could not find _csrf on URA parameter page")
    return match.group(1)


def _total(html: str) -> int:
    match = re.search(r"Displaying\s+\d+\s+to\s+\d+\s+of\s+(\d+)\s+records", html)
    if not match:
        raise RuntimeError("could not find the URA report row count")
    return int(match.group(1))


def _iso_date(value: str) -> str:
    return datetime.strptime(value, "%d/%m/%Y").date().isoformat()


def _emit_page(ctx, html: bytes, source_ref: str) -> None:
    for row in table_rows(html.decode("utf-8", "replace")):
        if not row or not row[0].isdigit():
            continue
        if len(row) != len(COLUMNS):
            ctx.drop_row("malformed row")
            continue
        values = dict(zip(COLUMNS, row, strict=True))
        try:
            values["designation_effective_date"] = _iso_date(values["designation_effective_date"])
        except ValueError:
            ctx.drop_row("invalid designation date")
            continue
        ctx.emit_record(values | {"source_ref": source_ref})


def run(ctx) -> None:
    form_url = parameter_url()
    form = ctx.fetch(form_url, headers={"Accept": "text/html,application/xhtml+xml"})
    ctx.raw.put("parameter-page.html", form)
    csrf = _csrf(form.decode("utf-8", "replace"))

    page_url = result_url()
    first = ctx.fetch(
        page_url,
        method="POST",
        data=first_page_data(csrf),
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": form_url,
        },
    )
    ctx.raw.put("page-1.html", first)
    _emit_page(ctx, first, page_url)

    pages = max(1, -(-_total(first.decode("utf-8", "replace")) // PAGE_SIZE))
    for page in range(2, pages + 1):
        page_url = ajax_url(page)
        body = ctx.fetch(
            page_url,
            method="POST",
            data=b"",
            headers={
                "X-CSRF-TOKEN": csrf,
                "X-Requested-With": "XMLHttpRequest",
                "Referer": result_url(),
            },
        )
        ctx.raw.put(f"page-{page}.html", body)
        _emit_page(ctx, body, page_url)


SNAPSHOT_DATE_COLUMNS = ["designation_effective_date"]


def from_snapshot_row(row: dict) -> dict:
    """Normalise a row from a dated typed table received earlier (snapshot runs)."""
    return row | {c: _iso_date(row[c]) if row.get(c) else "" for c in SNAPSHOT_DATE_COLUMNS}
