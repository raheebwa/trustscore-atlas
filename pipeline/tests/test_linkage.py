"""Name candidates: probabilistic pairs across records with expert-set weights, written for
review and never merged."""

from atlas_pipeline.linkage import name_candidates


def test_similar_names_across_sources_become_a_candidate_pair_with_a_comparison_vector():
    businesses = [
        {
            "atlas_id": "atl_0000000000000001",
            "name_normalised": "EXAMPLE HARDWARE SUPPLIES LTD",
            "canonical_name": "EXAMPLE HARDWARE SUPPLIES LTD",
            "coverage": {"found_in": ["kcca.businesses"]},
            "location": {"division_or_subcounty": "Nakawa Division"},
        },
        {
            "atlas_id": "atl_0000000000000002",
            "name_normalised": "EXAMPLE HARDWARE SUPPLIES LTD",
            "canonical_name": "EXAMPLE HARDWARE SUPPLIES LIMITED",
            "coverage": {"found_in": ["ura.vat_withholding_agents"]},
            "location": {},
        },
        {
            "atlas_id": "atl_0000000000000003",
            "name_normalised": "SAMPLE BAKERY",
            "canonical_name": "SAMPLE BAKERY",
            "coverage": {"found_in": ["kcca.businesses"]},
            "location": {"division_or_subcounty": "Central Division"},
        },
        {
            "atlas_id": "atl_0000000000000004",
            "name_normalised": "EXAMPLE HARDWARE SUPPLIES LTD",
            "canonical_name": "EXAMPLE HARDWARE SUPPLIES LTD",
            "coverage": {"found_in": ["kcca.businesses"]},
            "location": {"division_or_subcounty": "Nakawa Division"},
        },
    ]
    candidates = name_candidates(businesses, model_version="v1")
    pairs = {(c["atlas_id_a"], c["atlas_id_b"]) for c in candidates}
    assert ("atl_0000000000000001", "atl_0000000000000002") in pairs
    assert not any("atl_0000000000000003" in p for p in pairs)
    assert not any("atl_0000000000000001" in p and "atl_0000000000000004" in p for p in pairs), (
        "records from the same register are not paired: the register would have merged them"
    )
    c = next(c for c in candidates if c["atlas_id_b"] == "atl_0000000000000002")
    assert 0.5 <= c["match_probability"] <= 1.0
    assert isinstance(c["match_weight"], float)
    assert c["model_version"] == "v1"
    assert set(c["comparison"]) >= {"name", "division"}
    assert c["blocking_rule"]


def test_candidates_are_deterministic():
    businesses = [
        {
            "atlas_id": "atl_000000000000000a",
            "name_normalised": "EXAMPLE GENERAL STORES",
            "canonical_name": "EXAMPLE GENERAL STORES",
            "coverage": {"found_in": ["kcca.businesses"]},
            "location": {},
        },
        {
            "atlas_id": "atl_000000000000000b",
            "name_normalised": "EXAMPLE GENERAL STORE",
            "canonical_name": "EXAMPLE GENERAL STORE",
            "coverage": {"found_in": ["unbs.certified_products"]},
            "location": {},
        },
    ]
    a = name_candidates(businesses, model_version="v1")
    b = name_candidates(list(reversed(businesses)), model_version="v1")
    assert a == b and len(a) == 1
