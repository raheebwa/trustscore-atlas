"""Name candidates: probabilistic pairs between businesses from different registers.

Expert-set match weights on name similarity and division agreement (no training on name-only
features, which would train circularly). Pairs are written for review; nothing here merges.
"""

from splink import DuckDBAPI, Linker, SettingsCreator, block_on

MODEL_VERSION = "v1"
BLOCKING_RULE = "first token of name_normalised"


def _settings() -> SettingsCreator:
    import splink.comparison_level_library as cll
    import splink.comparison_library as cl

    name = cl.CustomComparison(
        output_column_name="name",
        comparison_levels=[
            cll.NullLevel("name_normalised"),
            cll.ExactMatchLevel("name_normalised").configure(
                m_probability=0.7, u_probability=0.001
            ),
            cll.JaroWinklerLevel("name_normalised", 0.95).configure(
                m_probability=0.2, u_probability=0.001
            ),
            cll.JaroWinklerLevel("name_normalised", 0.88).configure(
                m_probability=0.08, u_probability=0.02
            ),
            cll.ElseLevel().configure(m_probability=0.02, u_probability=0.975),
        ],
    )
    division = cl.CustomComparison(
        output_column_name="division",
        comparison_levels=[
            cll.NullLevel("division"),
            cll.ExactMatchLevel("division").configure(m_probability=0.85, u_probability=0.3),
            cll.ElseLevel().configure(m_probability=0.15, u_probability=0.7),
        ],
    )
    return SettingsCreator(
        link_type="dedupe_only",
        unique_id_column_name="atlas_id",
        comparisons=[name, division],
        blocking_rules_to_generate_predictions=[block_on("first_token")],
        # Prior for a pair inside a first-token block, not for two random records overall.
        probability_two_random_records_match=0.01,
        retain_matching_columns=True,
        retain_intermediate_calculation_columns=False,
    )


def name_candidates(
    businesses: list[dict], *, model_version: str = MODEL_VERSION, threshold: float = 0.5
) -> list[dict]:
    """Candidate pairs (probability >= threshold) between businesses that come from different
    registers. Same-register pairs are skipped: a register that lists both has already decided
    they are different."""
    if len(businesses) < 2:
        return []
    import pandas as pd

    frame = pd.DataFrame(
        [
            {
                "atlas_id": b["atlas_id"],
                "name_normalised": b["name_normalised"] or None,
                "first_token": (b["name_normalised"] or "").split(" ")[0] or None,
                "division": (b.get("location") or {}).get("division_or_subcounty") or None,
            }
            for b in businesses
        ]
    ).sort_values("atlas_id")
    linker = Linker(frame, _settings(), db_api=DuckDBAPI())
    predictions = linker.inference.predict(threshold_match_probability=threshold)
    rows = predictions.as_pandas_dataframe()
    sources_of = {b["atlas_id"]: set(b.get("coverage", {}).get("found_in", [])) for b in businesses}
    out = []
    for r in rows.itertuples(index=False):
        a, b = sorted((r.atlas_id_l, r.atlas_id_r))
        if sources_of[a] & sources_of[b]:
            continue
        out.append(
            {
                "atlas_id_a": a,
                "atlas_id_b": b,
                "match_probability": round(float(r.match_probability), 6),
                "match_weight": round(float(r.match_weight), 6),
                "comparison": {"name": int(r.gamma_name), "division": int(r.gamma_division)},
                "blocking_rule": BLOCKING_RULE,
                "model_version": model_version,
            }
        )
    out.sort(key=lambda c: (c["atlas_id_a"], c["atlas_id_b"]))
    return out
