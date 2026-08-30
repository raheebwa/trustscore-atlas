# SPDX-License-Identifier: Apache-2.0
from atlas_pipeline.html import table_rows

HTML = """
<table>
<tr><th>A</th><th>B</th></tr>
<tr><td> x </td><td>y
z</td></tr>
<tr><td>TOTAL: 1 Businesses</td></tr>
</table>
"""


def test_table_rows_returns_stripped_cells_per_row():
    assert table_rows(HTML) == [["A", "B"], ["x", "y z"], ["TOTAL: 1 Businesses"]]


def test_table_rows_can_select_one_table_by_id():
    html = """
    <table id="other"><tr><td>1</td><td>Ignore me</td></tr></table>
    <table id="wanted"><tr><th>A</th></tr><tr><td>Keep me</td></tr></table>
    """
    assert table_rows(html, table_id="wanted") == [["A"], ["Keep me"]]
