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
