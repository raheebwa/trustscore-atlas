"""Personal-data posture applied to every native row before it is written anywhere."""

import hashlib
import hmac


def salted_hash(value: str, salt: str) -> str:
    """Keyed SHA-256 of a value. Used only as a linkage feature, never displayed or exported."""
    return hmac.new(salt.encode("utf-8"), value.encode("utf-8"), hashlib.sha256).hexdigest()


def apply_posture(
    row: dict[str, str | None],
    *,
    excluded: list[str],
    hashed: list[str],
    salt: str,
) -> dict[str, str | None]:
    """Drop excluded columns and replace hashed columns with `<column>_hash`."""
    out: dict[str, str | None] = {}
    for key, value in row.items():
        if key in hashed:
            out[f"{key}_hash"] = salted_hash(value, salt) if value else None
        if key in excluded:
            continue
        out[key] = value
    return out
