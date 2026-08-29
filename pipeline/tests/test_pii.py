from atlas_pipeline.pii import apply_posture, salted_hash


def test_salted_hash_is_deterministic_and_salt_sensitive():
    a = salted_hash("256700000000", "salt-a")
    assert a == salted_hash("256700000000", "salt-a")
    assert a != salted_hash("256700000000", "salt-b")
    assert len(a) == 64 and "256700000000" not in a


def test_apply_posture_drops_excluded_and_hashes_listed_columns():
    row = {"name": "EXAMPLE LTD", "contact": "256700000000", "email": "x@example.com"}
    out = apply_posture(row, excluded=["contact", "email"], hashed=["contact"], salt="s")
    assert set(out) == {"name", "contact_hash"}
    assert out["contact_hash"] == salted_hash("256700000000", "s")


def test_apply_posture_hashes_empty_value_to_none():
    out = apply_posture({"contact": ""}, excluded=["contact"], hashed=["contact"], salt="s")
    assert out == {"contact_hash": None}
