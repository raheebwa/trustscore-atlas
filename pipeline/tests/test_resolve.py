# SPDX-License-Identifier: Apache-2.0
"""Resolution v0: statements from one or more sources -> canonical businesses."""

from datetime import UTC, datetime

import pytest

from atlas_pipeline.resolve import choose_name, entity_kind, normalise_name, resolve

T1 = datetime(2026, 8, 1, tzinfo=UTC)
T2 = datetime(2026, 8, 29, tzinfo=UTC)
PACK = {
    "country": "UG",
    "sources": [
        {"slug": "kcca.businesses", "state": "loaded"},
        {"slug": "ura.vat_withholding_agents", "state": "not_loaded"},
    ],
}


def stmt(entity_id, field, value, *, rec="r1", at=T2, source="kcca.businesses", precedence=3):
    return {
        "statement_id": f"{entity_id}|{field}|{value}|{rec}",
        "entity_id": entity_id,
        "country": "UG",
        "field": field,
        "value": value,
        "source": source,
        "source_ref": "https://example.org/register",
        "source_record_id": rec,
        "asserted_at": at,
        "licence": "public-record",
        "precedence": precedence,
        "confidence": "official",
    }


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("Example Hardware Supplies Limited", "EXAMPLE HARDWARE SUPPLIES LTD"),
        ("  sample   bakery, ltd.", "SAMPLE BAKERY LTD"),
        ("PLACEHOLDER (U) LTD", "PLACEHOLDER U LTD"),
        ("Example & Sons", "EXAMPLE AND SONS"),
    ],
)
def test_normalise_name(raw, expected):
    assert normalise_name(raw) == expected


@pytest.mark.parametrize(
    "name, kind",
    [
        ("EXAMPLE HARDWARE SUPPLIES LTD", "company"),
        ("Sample Bakery Limited", "company"),
        ("EXAMPLE TRADERS", "unknown"),
    ],
)
def test_entity_kind_is_inferred_from_legal_suffix(name, kind):
    assert entity_kind(name) == kind


def test_choose_name_prefers_precedence_then_support_then_recency_then_shortest():
    candidates = [
        stmt("e", "canonical_name", "Example Bakery Ltd", rec="r1", at=T1),
        stmt("e", "canonical_name", "EXAMPLE BAKERY LTD", rec="r2", at=T1),
        stmt("e", "canonical_name", "EXAMPLE BAKERY LTD", rec="r3", at=T1),
    ]
    winner, variants = choose_name(candidates)
    assert winner == "EXAMPLE BAKERY LTD"
    assert variants == ["Example Bakery Ltd"]

    tie = [
        stmt("e", "canonical_name", "SAMPLE STORES", rec="r1", at=T1),
        stmt("e", "canonical_name", "SAMPLE  STORES", rec="r2", at=T2),
    ]
    assert choose_name(tie)[0] == "SAMPLE  STORES"  # equal support, most recent wins

    verified = [
        stmt("e", "canonical_name", "SAMPLE STORES", rec="r1"),
        stmt("e", "canonical_name", "SAMPLE STORES", rec="r2"),
        stmt("e", "canonical_name", "Sample Stores Ltd", rec="op", precedence=1),
    ]
    assert choose_name(verified)[0] == "Sample Stores Ltd"  # precedence beats support


def test_resolve_builds_one_business_per_entity_with_coverage_and_identifiers():
    ident = '{"scheme":"ug:kcca_licence","value":"aaaa"}'
    statements = [
        stmt("kcca.businesses:aaaa", "canonical_name", "EXAMPLE BAKERY LTD", rec="r1", at=T1),
        stmt("kcca.businesses:aaaa", "canonical_name", "EXAMPLE BAKERY LTD", rec="r2"),
        stmt("kcca.businesses:aaaa", "sector.source_category", "GENERAL", rec="r1", at=T1),
        stmt("kcca.businesses:aaaa", "sector.source_nature", "Bakery", rec="r1", at=T1),
        stmt("kcca.businesses:aaaa", "sector.source_nature", "Retailers", rec="r2"),
        stmt(
            "kcca.businesses:aaaa",
            "location.division_or_subcounty",
            "Central Division",
            rec="r1",
            at=T1,
        ),
        stmt("kcca.businesses:aaaa", "location.district", "Kampala", rec="r1", at=T1),
        stmt("kcca.businesses:aaaa", "identifiers", ident, rec="r1", at=T1),
        stmt("kcca.businesses:bbbb", "canonical_name", "SAMPLE TRADERS", rec="r9"),
        stmt(
            "kcca.businesses:bbbb",
            "identifiers",
            '{"scheme":"ug:kcca_licence","value":"bbbb"}',
            rec="r9",
        ),
    ]
    result = resolve(statements, pack=PACK, checked_sources=["kcca.businesses"])
    assert len(result.businesses) == 2
    b = next(x for x in result.businesses if x["canonical_name"] == "EXAMPLE BAKERY LTD")
    assert b["atlas_id"].startswith("atl_") and len(b["atlas_id"]) == 20
    assert b["country"] == "UG"
    assert b["name_normalised"] == "EXAMPLE BAKERY LTD"
    assert b["name_variants"] == []
    assert b["entity_kind"] == "company"
    assert b["sector"] == {"source_category": "GENERAL", "source_nature": "Retailers"}
    assert b["location"] == {"district": "Kampala", "division_or_subcounty": "Central Division"}
    assert b["first_seen"] == "2026-08-01" and b["last_seen"] == "2026-08-29"
    assert b["coverage"] == {
        "applicable": ["kcca.businesses", "ura.vat_withholding_agents"],
        "checked": ["kcca.businesses"],
        "found_in": ["kcca.businesses"],
        "not_yet_checked": ["ura.vat_withholding_agents"],
    }
    assert b["identifiers"] == [
        {"scheme": "ug:kcca_licence", "value": "aaaa", "source": "kcca.businesses"}
    ]
    linked = [s for s in result.statements if s["entity_id"].endswith("aaaa")]
    assert linked and all(s["atlas_id"] == b["atlas_id"] for s in linked)
    assert len(result.statements) == len(statements)


def test_atlas_id_is_stable_for_the_same_earliest_identifier():
    s = [
        stmt("kcca.businesses:cccc", "canonical_name", "EXAMPLE LTD"),
        stmt("kcca.businesses:cccc", "identifiers", '{"scheme":"ug:kcca_licence","value":"cccc"}'),
    ]
    a = resolve(s, pack=PACK, checked_sources=["kcca.businesses"]).businesses[0]["atlas_id"]
    b = resolve(list(reversed(s)), pack=PACK, checked_sources=["kcca.businesses"]).businesses[0][
        "atlas_id"
    ]
    assert a == b


def test_recent_value_wins_within_same_precedence_when_support_is_equal():
    s = [
        stmt("kcca.businesses:dddd", "canonical_name", "EXAMPLE LTD"),
        stmt("kcca.businesses:dddd", "sector.source_category", "OTHERS", rec="r1", at=T1),
        stmt("kcca.businesses:dddd", "sector.source_category", "GENERAL", rec="r2", at=T2),
    ]
    b = resolve(s, pack=PACK, checked_sources=["kcca.businesses"]).businesses[0]
    assert b["sector"]["source_category"] == "GENERAL"


def _location_of(statements):
    result = resolve(statements, pack=PACK, checked_sources=["kcca.businesses"])
    return result.businesses[0]["location"]


def test_admin_location_comes_from_one_source_rather_than_the_best_of_each_field():
    """A district from one register beside a division from another is a place that does not exist.

    Nakawa Division is in Kampala, not in Wakiso, so a record that took its district from the
    standards bureau and its division from the city authority published a contradiction. The admin
    fields are resolved together, from whichever source wins them as a set.
    """
    entity = "kcca.businesses:aaaa"
    statements = [
        stmt(entity, "canonical_name", "ROOFINGS LTD"),
        stmt(entity, "location.district", "Kampala", source="kcca.businesses"),
        stmt(
            entity,
            "location.division_or_subcounty",
            "Nakawa Division",
            source="kcca.businesses",
        ),
        stmt(entity, "location.district", "Wakiso", source="unbs.certified_products"),
    ]

    assert _location_of(statements) == {
        "district": "Kampala",
        "division_or_subcounty": "Nakawa Division",
    }


def test_a_tie_at_equal_precedence_goes_to_the_source_that_knows_the_place_better():
    """Both registers are rank 3. The one carrying the finer admin level wins the set."""
    entity = "kcca.businesses:bbbb"
    statements = [
        stmt(entity, "canonical_name", "SAMPLE TRADERS LTD"),
        stmt(entity, "location.district", "Wakiso", source="unbs.certified_products", rec="r9"),
        stmt(entity, "location.district", "Kampala", source="kcca.businesses"),
        stmt(entity, "location.division_or_subcounty", "Rubaga Division", source="kcca.businesses"),
    ]

    assert _location_of(statements)["district"] == "Kampala"


def test_a_higher_ranked_source_wins_the_set_even_when_it_knows_less():
    """Precedence still decides first: a better source with only a district takes the district."""
    entity = "kcca.businesses:cccc"
    statements = [
        stmt(entity, "canonical_name", "SAMPLE TRADERS LTD"),
        stmt(entity, "location.district", "Wakiso", source="ursb.companies", precedence=1),
        stmt(entity, "location.district", "Kampala", source="kcca.businesses"),
        stmt(entity, "location.division_or_subcounty", "Rubaga Division", source="kcca.businesses"),
    ]

    location = _location_of(statements)
    assert location["district"] == "Wakiso"
    assert "division_or_subcounty" not in location


def test_a_record_with_no_admin_location_at_all_keeps_what_it_does_have():
    """URA knows which office serves a business without knowing which district it sits in."""
    entity = "ura.customs_agents:eeee"
    statements = [
        stmt(entity, "canonical_name", "SAMPLE TRADERS LTD", source="ura.customs_agents"),
        stmt(entity, "location.tax_office", "Nakawa", source="ura.customs_agents"),
    ]

    assert _location_of(statements) == {"tax_office": "Nakawa"}


def test_a_location_field_outside_the_admin_hierarchy_keeps_its_own_source():
    """A tax office is not a place in the admin hierarchy, so it cannot contradict a district."""
    entity = "kcca.businesses:dddd"
    statements = [
        stmt(entity, "canonical_name", "SAMPLE TRADERS LTD"),
        stmt(entity, "location.district", "Kampala", source="kcca.businesses"),
        stmt(entity, "location.tax_office", "Nakawa", source="ura.customs_agents"),
    ]

    assert _location_of(statements) == {"district": "Kampala", "tax_office": "Nakawa"}
