"""Polite HTTP fetcher used for live adapter runs."""

import time

import httpx

USER_AGENT = "TrustScore Atlas adapter (+https://atlas.trustscorehq.com)"


def make_fetcher(
    *, timeout: float = 120.0, retries: int = 3, pause: float = 0.5, backoff: float = 2.0
):
    client = httpx.Client(
        headers={"User-Agent": USER_AGENT}, timeout=timeout, follow_redirects=True
    )

    def fetch(url: str) -> bytes:
        delay = backoff
        for attempt in range(1, retries + 1):
            try:
                response = client.get(url)
                response.raise_for_status()
                time.sleep(pause)
                return response.content
            except httpx.HTTPError:
                if attempt == retries:
                    raise
                time.sleep(delay)
                delay *= backoff
        raise AssertionError("unreachable")

    return fetch
