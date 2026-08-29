"""Minimal HTML table extraction using the standard library only."""

from html.parser import HTMLParser


class _TableRowParser(HTMLParser):
    def __init__(self, table_id: str | None = None) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[list[str]] = []
        self._table_id = table_id
        self._in_selected_table = table_id is None
        self._row: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag == "table" and self._table_id is not None:
            self._in_selected_table = dict(attrs).get("id") == self._table_id
        elif tag == "tr" and self._in_selected_table:
            self._row = []
        elif tag in ("td", "th") and self._row is not None:
            self._cell = []

    def handle_endtag(self, tag: str) -> None:
        if tag in ("td", "th") and self._cell is not None and self._row is not None:
            self._row.append(" ".join("".join(self._cell).split()))
            self._cell = None
        elif tag == "tr" and self._row is not None:
            self.rows.append(self._row)
            self._row = None
        elif tag == "table" and self._table_id is not None:
            self._in_selected_table = False

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)


def table_rows(html: str, *, table_id: str | None = None) -> list[list[str]]:
    """Return every table row as a list of whitespace-collapsed cell strings."""
    parser = _TableRowParser(table_id)
    parser.feed(html)
    return parser.rows
