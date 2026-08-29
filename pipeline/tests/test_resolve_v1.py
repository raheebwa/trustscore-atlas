"""Resolution v1: issuer-unique identifiers group entities across sources; everything else is a
candidate, never a merge; merged groups keep the older atlas id and alias the rest."""

from datetime import UTC, datetime

from atlas_pipeline.resolve import resolve

T = datetime(2026, 8, 29, tzinfo=UTC)
PACK = {
    "country": "UG",
    "identifier_schemes": {
        "ug:tin": {"pattern": "^1[0-9]{9}$", "issuer_unique": True},
        "ug:kcca_licence": {"pattern": "^[0-9a-f]{16}$"},
    },
    "sources": [
        {"slug": "kcca.businesses", "state": "loaded"},
        {"slug": "ura.vat_withholding_agents", "state": "loaded"},
        {"slug": "ura.customs_agents", "state": "loaded"},
    ],
}
CHECKED = ["kcca.businesses", "ura.vat_withholding_agents", "ura.customs_agents"]


def stmt(entity_id, field, value, *, source, rec="r1", precedence=2):
    return {
        "statement_id": f"{entity_id}|{field}|{value}|{rec}",
        "entity_id": entity_id,
        "country": "UG",
        "field": field,
        "value": value,
        "source": source,
        "source_ref": "https://example.org/register",
        "source_record_id": rec,
        "asserted_at": T,
        "licence": "public-record",
        "precedence": precedence,
        "confidence": "official",
    }


def ident(entity_id, scheme, value, *, source):
    return stmt(
        entity_id, "identifiers", f'{{"scheme":"{scheme}","value":"{value}"}}', source=source
    )


def test_issuer_unique_identifier_groups_entities_across_sources():
    vat, customs = "ura.vat_withholding_agents:aaaa", "ura.customs_agents:bbbb"
    statements = [
        stmt(
            vat,
            "canonical_name",
            "EXAMPLE HARDWARE SUPPLIES LTD",
            source="ura.vat_withholding_agents",
        ),
        ident(vat, "ug:tin", "1000000001", source="ura.vat_withholding_agents"),
        stmt(
            customs,
            "canonical_name",
            "EXAMPLE HARDWARE SUPPLIES LIMITED",
            source="ura.customs_agents",
        ),
        ident(customs, "ug:tin", "1000000001", source="ura.customs_agents"),
        stmt(customs, "location.tax_office", "Nakawa", source="ura.customs_agents"),
    ]
    result = resolve(statements, pack=PACK, checked_sources=CHECKED)
    assert len(result.businesses) == 1
    b = result.businesses[0]
    assert b["coverage"]["found_in"] == ["ura.customs_agents", "ura.vat_withholding_agents"]
    assert {(i["scheme"], i["source"]) for i in b["identifiers"]} == {
        ("ug:tin", "ura.vat_withholding_agents"),
        ("ug:tin", "ura.customs_agents"),
    }
    assert {s["atlas_id"] for s in result.statements} == {b["atlas_id"]}
    assert b["canonical_name"] in {
        "EXAMPLE HARDWARE SUPPLIES LTD",
        "EXAMPLE HARDWARE SUPPLIES LIMITED",
    }
    assert result.groups[b["atlas_id"]] == sorted([vat, customs])


def test_record_with_no_shared_identifier_stands_alone_even_with_the_same_name():
    ura, kcca = "ura.vat_withholding_agents:cccc", "kcca.businesses:dddd"
    statements = [
        stmt(ura, "canonical_name", "SAMPLE BREWERY LTD", source="ura.vat_withholding_agents"),
        ident(ura, "ug:tin", "1000000002", source="ura.vat_withholding_agents"),
        stmt(kcca, "canonical_name", "SAMPLE BREWERY LTD", source="kcca.businesses", precedence=3),
        ident(kcca, "ug:kcca_licence", "0123456789abcdef", source="kcca.businesses"),
    ]
    result = resolve(statements, pack=PACK, checked_sources=CHECKED)
    assert len(result.businesses) == 2
    by_source = {b["coverage"]["found_in"][0]: b for b in result.businesses}
    assert by_source["ura.vat_withholding_agents"]["identifiers"] == [
        {"scheme": "ug:tin", "value": "1000000002", "source": "ura.vat_withholding_agents"}
    ]
    assert by_source["kcca.businesses"]["coverage"]["found_in"] == ["kcca.businesses"]
    assert result.aliases == []


def test_non_unique_scheme_never_groups():
    a, b = "kcca.businesses:eeee", "kcca.businesses:ffff"
    statements = [
        stmt(a, "canonical_name", "EXAMPLE TRADERS", source="kcca.businesses", precedence=3),
        ident(a, "ug:kcca_licence", "00000000000000aa", source="kcca.businesses"),
        stmt(b, "canonical_name", "EXAMPLE TRADERS TWO", source="kcca.businesses", precedence=3),
        ident(b, "ug:kcca_licence", "00000000000000aa", source="kcca.businesses"),
    ]
    assert len(resolve(statements, pack=PACK, checked_sources=CHECKED).businesses) == 2


def test_join_of_previously_separate_ids_keeps_the_older_and_aliases_the_newer():
    vat, customs = "ura.vat_withholding_agents:gggg", "ura.customs_agents:hhhh"
    crosswalk = {
        vat: {"atlas_id": "atl_older00000000000", "first_regeneration_id": "20260801T000000Z"},
        customs: {"atlas_id": "atl_newer00000000000", "first_regeneration_id": "20260815T000000Z"},
    }
    statements = [
        stmt(
            vat, "canonical_name", "EXAMPLE DISTRIBUTORS LTD", source="ura.vat_withholding_agents"
        ),
        ident(vat, "ug:tin", "1000000003", source="ura.vat_withholding_agents"),
        stmt(customs, "canonical_name", "EXAMPLE DISTRIBUTORS LTD", source="ura.customs_agents"),
        ident(customs, "ug:tin", "1000000003", source="ura.customs_agents"),
    ]
    result = resolve(statements, pack=PACK, checked_sources=CHECKED, crosswalk=crosswalk)
    assert len(result.businesses) == 1
    assert result.businesses[0]["atlas_id"] == "atl_older00000000000"
    assert result.aliases == [
        {
            "atlas_id": "atl_newer00000000000",
            "canonical_atlas_id": "atl_older00000000000",
            "reason": "ug:tin",
        }
    ]
    assert result.new_entities == []
    assert {s["atlas_id"] for s in result.statements} == {"atl_older00000000000"}
