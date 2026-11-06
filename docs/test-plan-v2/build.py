"""
Builds docs/STOCKFLOW_TEST_PLAN_v2.0.docx from the content modules next to this file.

    python docs/test-plan-v2/build.py

Edit the content (content_front.py, content_a.py, content_b.py, content_c.py), run this, commit both.
Needs python-docx (pip install python-docx). The page is A4 landscape so the five test columns fit.
"""
from __future__ import annotations

import os
import sys

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Mm, Pt, RGBColor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import content_a  # noqa: E402
import content_b  # noqa: E402
import content_c  # noqa: E402
import content_front as front  # noqa: E402

OUT = os.path.normpath(os.path.join(HERE, "..", "STOCKFLOW_TEST_PLAN_v2.0.docx"))
FONT = "Arial"
NAVY = RGBColor(0x1F, 0x2A, 0x44)
GREY = RGBColor(0x55, 0x55, 0x55)

# A4 landscape, 15 mm margins: usable width 267 mm
COLS = [("ID", 20), ("Role", 22), ("What to do", 95), ("Expected result", 78), ("Result", 26), ("Notes", 26)]
KEY_COLS = [("Key", 40), ("Meaning", 227)]


def shade(cell, hex_fill: str) -> None:
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    tcPr.append(shd)


TBLPR_ORDER = ["tblStyle", "tblpPr", "tblOverlap", "bidiVisual", "tblStyleRowBandSize", "tblStyleColBandSize", "tblW", "jc",
               "tblCellSpacing", "tblInd", "tblBorders", "shd", "tblLayout", "tblCellMar", "tblLook", "tblCaption", "tblDescription"]


def tblpr_insert(tblPr, el) -> None:
    """Add a table property in the position the schema requires (Word is strict about the order)."""
    name = el.tag.split("}")[1]
    rank = TBLPR_ORDER.index(name)
    for child in list(tblPr):
        cname = child.tag.split("}")[1]
        if cname in TBLPR_ORDER and TBLPR_ORDER.index(cname) > rank:
            child.addprevious(el)
            return
    tblPr.append(el)


def set_cell_margins(table, top=40, bottom=40, left=70, right=70) -> None:
    tblPr = table._tbl.tblPr
    mar = OxmlElement("w:tblCellMar")
    for side, val in (("top", top), ("left", left), ("bottom", bottom), ("right", right)):
        el = OxmlElement(f"w:{side}")
        el.set(qn("w:w"), str(val))
        el.set(qn("w:type"), "dxa")
        mar.append(el)
    tblpr_insert(tblPr, mar)


def repeat_header(row) -> None:
    trPr = row._tr.get_or_add_trPr()
    el = OxmlElement("w:tblHeader")
    el.set(qn("w:val"), "true")
    trPr.append(el)


def no_split(row) -> None:
    trPr = row._tr.get_or_add_trPr()
    el = OxmlElement("w:cantSplit")
    el.set(qn("w:val"), "true")
    trPr.append(el)


def set_widths(table, widths_mm) -> None:
    table.autofit = False  # python-docx writes the fixed-layout element itself
    for row in table.rows:
        for i, w in enumerate(widths_mm):
            row.cells[i].width = Mm(w)
    grid = table._tbl.tblGrid
    for i, gc in enumerate(grid.findall(qn("w:gridCol"))):
        gc.set(qn("w:w"), str(int(widths_mm[i] * 56.6929)))


def run(p, text, bold=False, italic=False, size=9.5, color=None):
    r = p.add_run(text)
    r.bold = bold
    r.italic = italic
    r.font.name = FONT
    r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    r.font.size = Pt(size)
    if color is not None:
        r.font.color.rgb = color
    return r


def para(doc_or_cell, text="", bold=False, italic=False, size=10, color=None, after=4, before=0, align=None, keep_next=False):
    p = doc_or_cell.add_paragraph()
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.space_before = Pt(before)
    p.paragraph_format.keep_with_next = keep_next
    if align:
        p.alignment = align
    if text:
        run(p, text, bold, italic, size, color)
    return p


def cell_text(cell, text: str, bold=False, size=9, color=None, italic=False) -> None:
    """Fill a cell; each line of `text` becomes its own paragraph (docx has no line breaks in cells that behave)."""
    lines = text.split("\n") if text else [""]
    first = True
    for line in lines:
        p = cell.paragraphs[0] if first else cell.add_paragraph()
        first = False
        p.paragraph_format.space_after = Pt(1.5)
        p.paragraph_format.space_before = Pt(0)
        if line:
            run(p, line, bold, italic, size, color)


def heading(doc, text, level=1):
    sizes = {1: 16, 2: 12.5, 3: 11}
    p = doc.add_paragraph()
    p.style = doc.styles[f"Heading {level}"]
    p.paragraph_format.space_before = Pt(14 if level == 1 else 9)
    p.paragraph_format.space_after = Pt(5)
    p.paragraph_format.keep_with_next = True
    r = p.add_run(text)
    r.font.name = FONT
    r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    r.font.size = Pt(sizes[level])
    r.bold = True
    r.font.color.rgb = NAVY
    return p


def bullets(doc, items):
    for it in items:
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.space_after = Pt(2)
        run(p, it, size=10)


def plain_table(doc, header, rows, widths):
    t = doc.add_table(rows=1, cols=len(header))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_cell_margins(t)
    for i, h in enumerate(header):
        c = t.rows[0].cells[i]
        shade(c, "1F2A44")
        cell_text(c, h, bold=True, size=9, color=RGBColor(0xFF, 0xFF, 0xFF))
    repeat_header(t.rows[0])
    for r in rows:
        cells = t.add_row().cells
        for i, v in enumerate(r):
            cell_text(cells[i], v, size=9)
    set_widths(t, widths)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t


TAG_FILL = {"NEW": "E2F0D9", "CHANGED": "FFF2CC"}


def test_table(doc, rows):
    t = doc.add_table(rows=1, cols=len(COLS))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_cell_margins(t)
    for i, (name, _) in enumerate(COLS):
        c = t.rows[0].cells[i]
        shade(c, "1F2A44")
        cell_text(c, name, bold=True, size=9, color=RGBColor(0xFF, 0xFF, 0xFF))
    repeat_header(t.rows[0])
    for row in rows:
        tid, role, steps, expected = row[0], row[1], row[2], row[3]
        tags = row[4] if len(row) > 4 else ""
        r = t.add_row()
        no_split(r)
        cells = r.cells
        cell_text(cells[0], tid, bold=True, size=8.5)
        if tags:
            for tag in tags.split():
                p = cells[0].add_paragraph()
                p.paragraph_format.space_after = Pt(0)
                run(p, tag, bold=True, size=7, color=GREY)
            first = tags.split()[0]
            if first in TAG_FILL:
                shade(cells[0], TAG_FILL[first])
        cell_text(cells[1], role, size=8.5)
        cell_text(cells[2], steps, size=9)
        cell_text(cells[3], expected, size=9)
        cell_text(cells[4], "☐ Pass\n☐ Fail\n☐ N/A", size=8.5)
        cell_text(cells[5], "", size=9)
    set_widths(t, [w for _, w in COLS])
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def add_field(paragraph, instr: str, size=8):
    r = paragraph.add_run()
    r.font.size = Pt(size)
    r.font.name = FONT
    for kind, text in (("begin", None), (None, instr), ("end", None)):
        if kind:
            el = OxmlElement("w:fldChar")
            el.set(qn("w:fldCharType"), kind)
        else:
            el = OxmlElement("w:instrText")
            el.set(qn("xml:space"), "preserve")
            el.text = text
        r._r.append(el)


def setup(doc):
    st = doc.styles["Normal"]
    st.font.name = FONT
    st.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    st.font.size = Pt(10)
    sec = doc.sections[0]
    sec.orientation = WD_ORIENT.LANDSCAPE
    sec.page_width, sec.page_height = Mm(297), Mm(210)
    sec.left_margin = sec.right_margin = Mm(15)
    sec.top_margin = Mm(16)
    sec.bottom_margin = Mm(16)
    hp = sec.header.paragraphs[0]
    run(hp, "StockFlow Test Plan  |  Version 2.0  |  6 November 2026", size=8, color=GREY)
    fp = sec.footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run(fp, "Page ", size=8, color=GREY)
    add_field(fp, "PAGE")
    run(fp, " of ", size=8, color=GREY)
    add_field(fp, "NUMPAGES")


def page_break(doc):
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


def build():
    doc = Document()
    setup(doc)

    # ---- title page ---------------------------------------------------------------------------------------------
    para(doc, "", after=60)
    para(doc, front.TITLE, bold=True, size=30, color=NAVY, after=6)
    para(doc, front.SUBTITLE, size=14, color=GREY, after=18)
    plain_table(doc, ["", ""], front.TITLE_FACTS, [55, 212])
    para(doc, front.TITLE_NOTE, italic=True, size=10, color=GREY, before=10)
    page_break(doc)

    # ---- contents -----------------------------------------------------------------------------------------------
    heading(doc, "Contents", 1)
    for num, title in front.contents(content_a.SECTIONS + content_b.SECTIONS + content_c.SECTIONS):
        para(doc, f"{num}   {title}", size=10, after=2)
    page_break(doc)

    # ---- front matter ---------------------------------------------------------------------------------------------
    for h, level, kind, body in front.FRONT:
        heading(doc, h, level)
        if kind == "p":
            for t in body:
                para(doc, t, size=10, after=5)
        elif kind == "bullets":
            bullets(doc, body)
        elif kind == "table":
            header, rows, widths = body
            plain_table(doc, header, rows, widths)
        elif kind == "key":
            plain_table(doc, ["Key", "Meaning"], body, [40, 227])

    # ---- test sections --------------------------------------------------------------------------------------------
    total = 0
    for sec in content_a.SECTIONS + content_b.SECTIONS + content_c.SECTIONS:
        page_break(doc)
        heading(doc, f"{sec['num']}. {sec['title']}", 1)
        for t in sec.get("intro", []):
            para(doc, t, size=10, after=5)
        for sub in sec["groups"]:
            if sub.get("title"):
                heading(doc, sub["title"], 2)
            for t in sub.get("intro", []):
                para(doc, t, size=10, after=4)
            if sub.get("rows"):
                test_table(doc, sub["rows"])
                total += len(sub["rows"])

    # ---- appendices -----------------------------------------------------------------------------------------------
    for h, kind, body in front.APPENDICES:
        page_break(doc)
        heading(doc, h, 1)
        if kind == "p":
            for t in body:
                para(doc, t, size=10, after=5)
        elif kind == "bullets":
            bullets(doc, body)
        elif kind == "table":
            header, rows, widths = body
            plain_table(doc, header, rows, widths)

    # python-docx's template has a zoom element without the percent attribute that the schema requires.
    for z in doc.settings.element.findall(qn("w:zoom")):
        if z.get(qn("w:percent")) is None:
            z.set(qn("w:percent"), "100")

    doc.core_properties.title = "StockFlow Test Plan v2.0"
    doc.core_properties.author = "Engineering"
    doc.core_properties.subject = "System test plan"
    doc.save(OUT)
    print(f"wrote {OUT}")
    print(f"{total} test cases in {len(content_a.SECTIONS + content_b.SECTIONS + content_c.SECTIONS)} sections")


if __name__ == "__main__":
    build()
