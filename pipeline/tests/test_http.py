# SPDX-License-Identifier: Apache-2.0
"""Characterization tests for the polite fetcher: retries with backoff, pause after success."""

import httpx
import pytest

from atlas_pipeline import http
from atlas_pipeline.adapters import load_adapter, run_adapter

from .conftest import PACKS, RUN_ID, SALT, STARTED_AT


def _fetcher_with(handler, monkeypatch, **kwargs):
    sleeps: list[float] = []
    monkeypatch.setattr(http.time, "sleep", sleeps.append)
    transport = httpx.MockTransport(handler)
    real_client = httpx.Client

    def client(**client_kwargs):
        return real_client(transport=transport, **client_kwargs)

    monkeypatch.setattr(http.httpx, "Client", client)
    return http.make_fetcher(**kwargs), sleeps


def test_fetch_returns_body_and_pauses_after_success(monkeypatch):
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers["user-agent"])
        return httpx.Response(200, content=b"<table></table>")

    fetch, sleeps = _fetcher_with(handler, monkeypatch, pause=0.25)
    assert fetch("https://example.com/page") == b"<table></table>"
    assert sleeps == [0.25]
    assert seen == [http.USER_AGENT]


def test_fetch_retries_with_backoff_then_succeeds(monkeypatch):
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(503) if calls["n"] < 3 else httpx.Response(200, content=b"ok")

    fetch, sleeps = _fetcher_with(handler, monkeypatch, retries=3, pause=0.5, backoff=2.0)
    assert fetch("https://example.com/") == b"ok"
    assert calls["n"] == 3
    assert sleeps == [2.0, 4.0, 0.5]


def test_fetch_raises_after_last_retry(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    fetch, sleeps = _fetcher_with(handler, monkeypatch, retries=2)
    with pytest.raises(httpx.HTTPStatusError):
        fetch("https://example.com/")
    assert len(sleeps) == 1


def test_fetch_forwards_method_data_and_headers_and_keeps_cookies(monkeypatch):
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(200, headers={"Set-Cookie": "JSESSIONID=fixture; Path=/"})
        assert request.headers["cookie"] == "JSESSIONID=fixture"
        return httpx.Response(200, content=b"results")

    fetch, _ = _fetcher_with(handler, monkeypatch, pause=0)
    fetch("https://example.com/parameter")
    body = fetch(
        "https://example.com/results",
        method="POST",
        data={"reportCode": "7"},
        headers={"X-CSRF-TOKEN": "fixture-token"},
    )

    assert body == b"results"
    assert requests[1].method == "POST"
    assert requests[1].content == b"reportCode=7"
    assert requests[1].headers["x-csrf-token"] == "fixture-token"


def test_make_fetcher_passes_a_certificate_bundle_path(monkeypatch):
    options = {}

    class Client:
        def __init__(self, **kwargs):
            options.update(kwargs)

        def request(self, method, url, *, data=None, headers=None):
            request = httpx.Request(method, url, content=data, headers=headers)
            return httpx.Response(200, content=b"ok", request=request)

    monkeypatch.setattr(http.httpx, "Client", Client)
    fetch = http.make_fetcher(verify="/tmp/fixture-ca.pem", pause=0)

    assert fetch("https://example.com/") == b"ok"
    assert options["verify"] == "/tmp/fixture-ca.pem"


def test_run_adapter_uses_the_certificate_bundle_declared_by_the_adapter(monkeypatch, tmp_path):
    adapter = PACKS / "ug" / "sources" / "unbs_certified_products"
    spec = load_adapter(adapter)
    page = (adapter / "fixtures" / "raw" / "certified-products.html").read_bytes()
    options = {}

    def make_fetcher(**kwargs):
        options.update(kwargs)

        def fetch(url, **_request):
            assert url == spec.module.ENDPOINT
            return page

        return fetch

    monkeypatch.setattr(http, "make_fetcher", make_fetcher)
    run_adapter(
        spec,
        data_root=tmp_path,
        run_id=RUN_ID,
        started_at=STARTED_AT,
        salt=SALT,
    )

    assert options["verify"] == spec.module.TLS_VERIFY
