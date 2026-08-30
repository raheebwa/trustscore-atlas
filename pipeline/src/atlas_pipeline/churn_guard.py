"""Identity-churn guard: refuse to load a regeneration that silently rewrites identities.

A regeneration built from the wrong state (no crosswalk, no labels) passes every step and
looks healthy, so this check compares the new regeneration with the previously published
bundle before anything is loaded. Every number is reported whether or not the guard trips.
"""

import json
from dataclasses import asdict, dataclass
from pathlib import Path

import pyarrow.parquet as pq

NEW_ENTITY_SHARE_LIMIT = 0.02


@dataclass
class ChurnReport:
    regeneration_id: str
    previous_businesses: int
    previous_aliases: int
    labels_on_file: int
    new_entities: int
    new_entity_share: float
    labels_applied: int
    aliases: int
    reasons: list[str]

    @property
    def ok(self) -> bool:
        return not self.reasons


def _parquet_rows(path: Path) -> int:
    return pq.read_metadata(path).num_rows if path.is_file() else 0


def _labels_on_file(path: Path) -> int:
    if not path.is_file():
        return 0
    return sum(1 for line in path.read_text().splitlines() if line.strip())


def check_churn(*, regeneration_dir: Path, previous_bundle: Path, labels_file: Path) -> ChurnReport:
    summary = json.loads((regeneration_dir / "regeneration.json").read_text())
    previous_businesses = _parquet_rows(previous_bundle / "canonical" / "businesses.parquet")
    previous_aliases = _parquet_rows(previous_bundle / "canonical" / "aliases.parquet")
    labels_on_file = _labels_on_file(labels_file)
    new_entities = int(summary.get("new_entities", 0))
    labels_applied = int(summary.get("labels", 0))
    aliases = int(summary.get("counts", {}).get("aliases", 0))
    share = new_entities / previous_businesses if previous_businesses else 0.0

    reasons: list[str] = []
    if previous_businesses and share > NEW_ENTITY_SHARE_LIMIT:
        reasons.append(
            f"new entities {new_entities} are {share:.1%} of the previous "
            f"{previous_businesses} businesses (limit {NEW_ENTITY_SHARE_LIMIT:.0%}); "
            "the crosswalk was probably not restored"
        )
    if labels_on_file and labels_applied == 0:
        reasons.append(
            f"labels applied 0 while the labels file holds {labels_on_file}; "
            "labels were not restored"
        )
    if previous_aliases and aliases == 0:
        reasons.append(
            f"aliases 0 while the previous regeneration had {previous_aliases}; merges were lost"
        )
    return ChurnReport(
        regeneration_id=summary["id"],
        previous_businesses=previous_businesses,
        previous_aliases=previous_aliases,
        labels_on_file=labels_on_file,
        new_entities=new_entities,
        new_entity_share=round(share, 4),
        labels_applied=labels_applied,
        aliases=aliases,
        reasons=reasons,
    )


def report_json(report: ChurnReport) -> str:
    return json.dumps(asdict(report) | {"ok": report.ok}, indent=2)
