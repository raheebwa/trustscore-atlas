# SPDX-License-Identifier: Apache-2.0
"""Generate the synthetic CBK PDF fixtures without third-party PDF libraries."""

from pathlib import Path

RAW = Path(__file__).parent / "raw"

COMMERCIAL_PAGES = [
    [
        "CENTRAL BANK OF KENYA",
        "DIRECTORY OF LICENCED COMMERCIAL BANKS, MORTGAGE FINANCE",
        "INSTITUTIONS AND AUTHORISED NON-OPERATING BANK HOLDING",
        "COMPANIES",
        "A: COMMERCIAL BANKS",
        "1. Example Bank Kenya PLC",
        "Postal Address: P. O. Box 00000 - 00000, Example City",
        "Telephone: +254 000 000 000",
        "Fax: +254 000 000 000",
        "E-mail: bank@example.invalid",
        "Website: https://www.examplebank.example.invalid/",
        "corporate",
        "Physical Address: Example House, Example Street,",
        "Example City",
        "Date Licensed: 1st January 2000",
        "Peer Group: Large",
        "Branches: 10",
        "2. Illustrative Commercial Bank Limited",
        "Postal Address: P. O. Box 00000 - 00000, Example City",
        "Telephone: +254 000 000 000",
        "Fax: +254 000 000 000",
        "E-mail: commercial@example.invalid",
        "Website: https://commercial.example.invalid",
        "Physical Address: Sample House, Example Street, Example City",
        "Date Licensed: 2nd February 2001",
        "Peer Group: Small",
        "Branches: 4",
        "3.",
        "Page 1 of 2",
        "C2: CBK - Official",
    ],
    [
        "CENTRAL BANK OF KENYA",
        "DIRECTORY OF LICENCED COMMERCIAL BANKS, MORTGAGE FINANCE",
        "INSTITUTIONS AND AUTHORISED NON-OPERATING BANK HOLDING",
        "COMPANIES",
        "B: MORTGAGE FINANCE INSTITUTIONS",
        "1. Sample Mortgage Finance Limited",
        "Postal Address: P. O. Box 00000 - 00000, Example City",
        "Telephone: +254 000 000 000",
        "E-mail: mortgage@example.invalid",
        "Website: https://mortgage.example.invalid",
        "Physical Address: Sample Plaza, Example Street, Example City",
        "Date Licensed: 3rd March 2002",
        "Peer Group: Medium",
        "Branches: 2",
        "C: BANK HOLDING COMPANIES",
        "1. Example Holding Company Limited",
        "Postal Address: P. O. Box 00000 - 00000, Example City",
        "Telephone: +254 000 000 000",
        "E-mail: holding@example.invalid",
        "Website: https://holding.example.invalid",
        "Physical Address: Holding House, Example Street, Example City",
        "Date Authorised: 4th April 2003",
        "Page 2 of 2",
        "C2: CBK - Official",
    ],
]

MICROFINANCE_PAGES = [
    [
        "CENTRAL BANK OF KENYA",
        "NO. DIRECTORY OF LICENCED MICROFINANCE BANKS",
        "1. Community Microfinance Bank Limited",
        "Postal Address: P. O. Box 00000 - 00000, Example City",
        "Telephone: +254 000 000 000",
        "Fax: +254 000 000 000",
        "E-mail: community@example.invalid",
        "Website: https://community.example.invalid",
        "Physical Address: Community House, Example Street, Example City",
        "Date Licenced: 05.05.2004",
        "Branches: 3",
        "2. Sample Microfinance Bank Limited",
        "Postal Address: P. O. Box 00000 - 00000, Example City",
        "Telephone: +254 000 000 000",
        "E-mail: microfinance@example.invalid",
        "Website: https://microfinance.example.invalid",
        "Physical Address: Sample House, Example Street, Example City",
        "Date Licenced: 06.06.2005",
        "Branches: 1",
        "Page 1 of 1",
        "C2: CBK - Official",
    ]
]


def _pdf_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _content_stream(lines: list[str]) -> bytes:
    commands = ["BT", "/F1 10 Tf", "12 TL", "54 744 Td"]
    for line in lines:
        commands.extend([f"({_pdf_text(line)}) Tj", "T*"])
    commands.append("ET")
    return ("\n".join(commands) + "\n").encode("ascii")


def _make_pdf(pages: list[list[str]]) -> bytes:
    font_id = 3 + 2 * len(pages)
    objects = {
        1: b"<< /Type /Catalog /Pages 2 0 R >>",
        2: (
            f"<< /Type /Pages /Count {len(pages)} /Kids "
            f"[{' '.join(f'{3 + 2 * index} 0 R' for index in range(len(pages)))}] >>"
        ).encode("ascii"),
        font_id: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    }
    for index, lines in enumerate(pages):
        page_id = 3 + 2 * index
        content_id = page_id + 1
        stream = _content_stream(lines)
        objects[page_id] = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 {font_id} 0 R >> >> "
            f"/Contents {content_id} 0 R >>"
        ).encode("ascii")
        objects[content_id] = (
            f"<< /Length {len(stream)} >>\nstream\n".encode("ascii") + stream + b"endstream"
        )

    document = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for object_id in range(1, font_id + 1):
        offsets.append(len(document))
        document.extend(f"{object_id} 0 obj\n".encode("ascii"))
        document.extend(objects[object_id])
        document.extend(b"\nendobj\n")

    xref_offset = len(document)
    document.extend(f"xref\n0 {font_id + 1}\n".encode("ascii"))
    document.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        document.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    document.extend(
        f"trailer\n<< /Size {font_id + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode(
            "ascii"
        )
    )
    return bytes(document)


def main() -> None:
    RAW.mkdir(exist_ok=True)
    (RAW / "commercial-banks.pdf").write_bytes(_make_pdf(COMMERCIAL_PAGES))
    (RAW / "microfinance-banks.pdf").write_bytes(_make_pdf(MICROFINANCE_PAGES))


if __name__ == "__main__":
    main()
