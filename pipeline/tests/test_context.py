# SPDX-License-Identifier: Apache-2.0
from atlas_pipeline.context import Context, RawStore


def test_fetch_forwards_request_keywords_and_records_the_url(tmp_path):
    calls = []

    def fetcher(url, *, method="GET", data=None, headers=None):
        calls.append((url, method, data, headers))
        return b"response"

    ctx = Context(fetcher=fetcher, raw=RawStore(tmp_path))
    body = ctx.fetch(
        "https://example.org/report",
        method="POST",
        data={"reportCode": "7"},
        headers={"X-CSRF-TOKEN": "fixture-token"},
    )

    assert body == b"response"
    assert calls == [
        (
            "https://example.org/report",
            "POST",
            {"reportCode": "7"},
            {"X-CSRF-TOKEN": "fixture-token"},
        )
    ]
    assert ctx.raw.last_url == "https://example.org/report"
