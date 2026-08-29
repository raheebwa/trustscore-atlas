"""The only surface an adapter sees: fetch, raw storage, record emission."""

import hashlib
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

type RequestData = bytes | Mapping[str, str] | None
type RequestHeaders = Mapping[str, str] | None


class Fetcher(Protocol):
    def __call__(
        self,
        url: str,
        *,
        method: str = "GET",
        data: RequestData = None,
        headers: RequestHeaders = None,
    ) -> bytes: ...


@dataclass
class RawStore:
    directory: Path
    objects: list[dict] = field(default_factory=list)

    last_url: str | None = None

    def put(self, name: str, data: bytes) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        (self.directory / name).write_bytes(data)
        entry = {"name": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
        if self.last_url:
            entry["url"] = self.last_url
        self.objects.append(entry)


@dataclass
class Context:
    fetcher: Fetcher
    raw: RawStore
    params: dict = field(default_factory=dict)
    records: list[dict] = field(default_factory=list)
    dropped: int = 0

    def fetch(
        self,
        url: str,
        *,
        method: str = "GET",
        data: RequestData = None,
        headers: RequestHeaders = None,
    ) -> bytes:
        self.raw.last_url = url
        return self.fetcher(url, method=method, data=data, headers=headers)

    def emit_record(self, row: dict) -> None:
        self.records.append(dict(row))

    def drop_row(self, reason: str) -> None:
        self.dropped += 1
