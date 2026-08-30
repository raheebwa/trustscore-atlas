# SPDX-License-Identifier: Apache-2.0
"""Polite HTTP fetcher used for live adapter runs."""

import time
from pathlib import Path

import httpx

from .context import Fetcher, RequestData, RequestHeaders

USER_AGENT = "TrustScore Atlas adapter (+https://atlas.trustscorehq.com)"


def make_fetcher(
    *,
    timeout: float = 120.0,
    retries: int = 3,
    pause: float = 0.5,
    backoff: float = 2.0,
    verify: str | Path | None = None,
) -> Fetcher:
    client_options = {
        "headers": {"User-Agent": USER_AGENT},
        "timeout": timeout,
        "follow_redirects": True,
    }
    if verify is not None:
        client_options["verify"] = str(verify)
    client = httpx.Client(**client_options)

    def fetch(
        url: str,
        *,
        method: str = "GET",
        data: RequestData = None,
        headers: RequestHeaders = None,
    ) -> bytes:
        delay = backoff
        for attempt in range(1, retries + 1):
            try:
                response = client.request(method, url, data=data, headers=headers)
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
