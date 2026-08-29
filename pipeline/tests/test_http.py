"""Characterization tests for the polite fetcher: retries with backoff, pause after success."""

import httpx
import pytest

from atlas_pipeline import http


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
