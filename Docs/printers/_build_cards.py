#!/usr/bin/env python3
"""
Generate one-page A4 shop-floor cheat-sheets for the three Adpost Group printers.

Run:  python3 Docs/printers/_build_cards.py
Output: Docs/printers/*-cheatsheet.pdf  (+ printer-cheatsheets-all.pdf)

Design goal: a single laminate-able A4 card per machine that an operator can
tick daily. Content is condensed from Docs/printers/printer-onboarding-brief.md.
Edit the CARDS dict below and re-run to regenerate.
"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table,
    TableStyle, Flowable, KeepInFrame,
)

HERE = os.path.dirname(os.path.abspath(__file__))

# ---- glyph safety: Helvetica (WinAnsi) lacks arrows/checkboxes/>=.  Use » and >= ----

class CheckBox(Flowable):
    """A small empty square to tick."""
    def __init__(self, size=8.5):
        super().__init__()
        self.size = size
        self.width = size
        self.height = size
    def draw(self):
        self.canv.setLineWidth(0.9)
        self.canv.setStrokeColor(colors.HexColor("#4A4A4A"))
        self.canv.rect(0, 0, self.size, self.size)


def style(name, **kw):
    base = dict(fontName="Helvetica", fontSize=7.6, leading=9.4,
                textColor=colors.HexColor("#1F2933"))
    base.update(kw)
    return ParagraphStyle(name, **base)


def build_card(out_path, c):
    accent = colors.HexColor(c["accent"])
    accent_tint = colors.HexColor(c["tint"])
    page_w, page_h = A4
    margin = 16 * mm
    doc = BaseDocTemplate(
        out_path, pagesize=A4,
        leftMargin=margin, rightMargin=margin, topMargin=12 * mm, bottomMargin=12 * mm,
        title=c["name"] + " - Shop-floor card", author="Adpost Group / SC Prints",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin,
                  page_w - 2 * doc.leftMargin, page_h - doc.topMargin - doc.bottomMargin,
                  id="main", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="card", frames=[frame])])

    full_w = page_w - 2 * doc.leftMargin

    # styles
    h_sec = style("sec", fontName="Helvetica-Bold", fontSize=9.2, leading=11,
                  textColor=accent, spaceBefore=7, spaceAfter=2.5)
    body = style("body")
    body_b = style("bodyb", fontName="Helvetica-Bold")
    small = style("small", fontSize=6.8, leading=8.2, textColor=colors.HexColor("#52606D"))

    story = []

    # ---------- header band ----------
    head_left = Paragraph(
        f'<font color="white"><b>{c["name"]}</b></font>',
        style("hl", fontName="Helvetica-Bold", fontSize=15.5, leading=17, textColor=colors.white))
    head_sub = Paragraph(
        f'<font color="#E6F0FA">{c["type"]}</font>',
        style("hs", fontSize=8.2, leading=10, textColor=colors.white))
    head_right = Paragraph(
        '<font color="#FFFFFF"><b>ADPOST GROUP</b><br/>SHOP-FLOOR CARD</font>',
        style("hr", fontName="Helvetica-Bold", fontSize=7.2, leading=9,
              textColor=colors.white, alignment=2))
    head_tbl = Table([[ [head_left, head_sub], head_right ]], colWidths=[full_w * 0.74, full_w * 0.26])
    head_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), accent),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.append(head_tbl)

    # ---------- golden rule ----------
    gr_label = Paragraph('<b>GOLDEN RULE</b>',
                         style("grl", fontName="Helvetica-Bold", fontSize=9, leading=11,
                               textColor=accent))
    gr_text = Paragraph(c["golden"], style("grt", fontSize=8.6, leading=10.6,
                                            fontName="Helvetica-Bold",
                                            textColor=colors.HexColor("#1F2933")))
    gr = Table([[gr_label], [gr_text]], colWidths=[full_w])
    gr.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), accent_tint),
        ("LINEABOVE", (0, 0), (-1, 0), 0, accent),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (0, 0), 5),
        ("BOTTOMPADDING", (0, 0), (0, 0), 0),
        ("TOPPADDING", (0, 1), (0, 1), 1),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
        ("LINEBEFORE", (0, 0), (0, -1), 3, accent),
    ]))
    story.append(Spacer(1, 4))
    story.append(gr)
    story.append(Spacer(1, 2))

    # ---------- helpers ----------
    def checklist(items):
        rows = [[CheckBox(), Paragraph(t, body)] for t in items]
        t = Table(rows, colWidths=[15, None])
        t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (0, 0), 5),
            ("RIGHTPADDING", (1, 0), (1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 2.4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2.4),
        ]))
        return t

    def bullets(items):
        flow = []
        for t in items:
            flow.append(Paragraph(f'<font color="{c["accent"]}"><b>&bull;</b></font>&nbsp; {t}', body))
            flow.append(Spacer(1, 1.6))
        return flow

    def problems(items):
        flow = []
        for prob, fix in items:
            flow.append(Paragraph(
                f'<b>{prob}</b> <font color="{c["accent"]}"><b>&raquo;</b></font> {fix}', body))
            flow.append(Spacer(1, 2.4))
        return flow

    # ---------- left column ----------
    left = []
    left.append(Paragraph("DAILY &mdash; tick each shift", h_sec))
    left.append(checklist(c["daily"]))
    left.append(Paragraph("WEEKLY / MONTHLY PM", h_sec))
    left += bullets(c["pm"])

    # ---------- right column ----------
    right = []
    right.append(Paragraph("TOP PROBLEMS &raquo; QUICK FIX", h_sec))
    right += problems(c["problems"])
    right.append(Paragraph("KEEP ON THE SPARES SHELF", h_sec))
    right += bullets(c["spares"])
    right.append(Paragraph("SOFTWARE", h_sec))
    right += bullets(c["software"])

    gutter = 10
    col_w = (full_w - gutter) / 2.0
    body_tbl = Table([[KeepInFrame(col_w, 560, left, mode="shrink"),
                       "",
                       KeepInFrame(col_w, 560, right, mode="shrink")]],
                     colWidths=[col_w, gutter, col_w])
    body_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LINEBETWEEN", (1, 0), (1, 0), 0.5, colors.HexColor("#D9DEE4")),
    ]))
    story.append(body_tbl)

    # ---------- call the tech strip ----------
    tech_items = "".join(f'<b>{i}.</b> {t} &nbsp; ' for i, t in enumerate(c["tech"], 1))
    tech = Paragraph(
        '<font color="white"><b>CALL THE TECH IF&nbsp;&nbsp;</b></font>'
        f'<font color="#FFF6E6">{tech_items}</font>',
        style("tech", fontSize=7.4, leading=9.6, textColor=colors.white))
    tech_tbl = Table([[tech]], colWidths=[full_w])
    tech_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#B23B1E")),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(Spacer(1, 5))
    story.append(tech_tbl)

    # ---------- footer ----------
    story.append(Spacer(1, 3))
    story.append(Paragraph(
        'Full brief: <b>Docs/printers/printer-onboarding-brief.md</b> &nbsp;|&nbsp; '
        'Official manuals + videos: <b>Docs/printers/official-resources.md</b> &nbsp;|&nbsp; '
        'Some figures are platform/sibling-sourced &mdash; verify on your unit. &nbsp; v1 &middot; 2026-06-19',
        small))

    doc.build(story)
    return out_path


# =====================================================================
# CONTENT  (condensed from the verified onboarding brief)
# =====================================================================

CARDS = [
    {
        "file": "hp-latex-r530-cheatsheet.pdf",
        "name": "HP Latex R530",
        "type": "64\" hybrid (rigid flatbed + roll) · water-based Latex · 7-colour + White",
        "accent": "#0B5FA5", "tint": "#E3EEF7",
        "golden": "NEVER fully power the printer off. Leave it in Sleep / Low-Power mode 24/7 so the "
                  "white ink keeps recirculating. A full shutdown clogs the white line and needs a "
                  "certified-engineer flush to recover. Treat any power outage as an incident.",
        "daily": [
            "First thing: confirm the machine is in SLEEP, not OFF.",
            "Run a nozzle check / status before the first job.",
            "After any overnight power blip, check white-ink status immediately.",
            "Wipe rigid boards clean + handle with gloves (fingerprint oil = adhesion voids).",
            "Check rigid stock is FLAT before loading (warped board = carriage strike).",
            "Set up artwork bleed for edge-to-edge work (avoids white edge slivers).",
        ],
        "pm": [
            "Run HP weekly + monthly maintenance routines (see video links).",
            "Check / re-seat the maintenance cartridge + ink collector; replace when prompted.",
            "Rotate white cartridges oldest-first &mdash; white expires in ~6 months (colour ~12).",
            "Build + test a media preset for every new substrate BEFORE production.",
        ],
        "problems": [
            ("White line clogged", "was it powered off? Sleep only. Recovery = HP engineer flush."),
            ("“Nozzles out” / banding", "reset drop-detection DB, run 3 detect cycles + nozzle check, reseat carriage cables BEFORE buying ~$3k heads."),
            ("Prints scratch (dark solids)", "slower/higher pass, Overcoat low (~1.0-1.5), laminate, let cure 24h."),
            ("ACP heat-marks / delaminates", "side-B cure ~80°C, cool fully, wait >=4h before laminating."),
            ("Adhesion failure", "clean board, glove-handle, cross-hatch tape-test the new batch."),
        ],
        "spares": [
            "Spare drop detector (cheap swap-to-test part).",
            "HP 875 inks &mdash; incl. White 9D7Q3A, Optimizer 9D7Q1A, Black 9D7P7A.",
            "HP 886 white printhead (G0Z21A) + colour printhead (G0Z24A).",
            "Maintenance cartridge + ink collector (HP 833 / 838).",
        ],
        "software": [
            "<b>RIP</b>: ONYX <i>or</i> Caldera <i>or</i> ErgoSoft (all certified &mdash; pick one house RIP).",
            "<b>HP PrintOS / Production Hub</b>: cloud workflow + remote monitoring.",
            "<b>On-board touchscreen</b>: job load, white recirculation, calibration.",
        ],
        "tech": [
            "white line clogged after a shutdown",
            "nozzles still out after drop-detector reset + cable reseat",
            "adhesion fails across multiple profiled substrates",
        ],
    },
    {
        "file": "mimaki-ujf-6042-mkiie-cheatsheet.pdf",
        "name": "Mimaki UJF-6042 MkII e",
        "type": "A2 UV-LED flatbed · direct-to-object (up to 153mm thick) · CMYK+W+Lc/Lm+Clear · Kebab rotary",
        "accent": "#5B3E96", "tint": "#ECE7F5",
        "golden": "Shake every WHITE ink bottle (~20 gentle tilts) before each shift and run daily white "
                  "maintenance. White circulates only in the sub-tank, NOT through the head, so it settles "
                  "fast. Never leave the machine idle longer than 1-2 weeks. Put it on a UPS / line conditioner.",
        "daily": [
            "Shake the white ink bottle(s) before the shift.",
            "Nozzle check before the first job; clean Head 4 (white) if it's dropping.",
            "Wipe the clear/primer head face with approved flushing fluid (F-200 / FL-007).",
            "Clean wiper, caps + flushing box; check the ionizer needle is clean.",
            "IPA-wipe slick parts (glass/acrylic); ionizer fan on in dry weather.",
            "Set head height to the part's true HIGH point + use the correct jig/spacer.",
        ],
        "pm": [
            "Clean the X-axis encoder strip + homing sensor (prevents Error 533).",
            "Inspect dampers / filters / tubing; replace on schedule.",
            "Re-torque the table-base screws + re-check the table is level.",
            "Check ink expiry on delivery (firmware locks out expired ink); rotate FIFO.",
        ],
        "problems": [
            ("White drops out mid-job (Head 4)", "shake bottle, white maintenance, syringe-flush/replace white solenoid (M015864), confirm Head 4 at temp."),
            ("Error 533 (X homing fail)", "CLEAN the encoder strip + sensor FIRST &mdash; not the electronics."),
            ("White “blowout” / mist on art", "ionizer + 35-65% RH, lower head gap (~1.5mm), IPA-wipe parts."),
            ("Ink scratches off glass/metal", "PR-200 primer + IPA degrease; scratch-test new substrates."),
            ("Clear/primer head dead", "cycle ink + clean daily; budget periodic head replacement."),
        ],
        "spares": [
            "White solenoid valve (M015864) &mdash; forum-sourced part, confirm against your unit.",
            "Wipers, caps, dampers, filters.",
            "Flushing fluid (F-200 / FL-007); spare X-axis encoder strip.",
        ],
        "software": [
            "<b>RasterLink7</b>: RIP + jig (object alignment) + variable-data / numbering.",
            "<b>Mimaki Clear Control (MCC)</b>: gloss / matte / 2.5D textured clear.",
            "<b>Kebab MkII control</b>: enter diameter for 360° cylindrical printing.",
        ],
        "tech": [
            "auto-maintenance freezes >1h (temp sensor / valves / o-rings)",
            "white won't recover after solenoid flush + cleaning",
            "encoder strip is scratched (needs replacement)",
        ],
    },
    {
        "file": "mimaki-txf300-75-cheatsheet.pdf",
        "name": "Mimaki TxF300-75",
        "type": "Roll-fed DTF film transfer · PHT50 pigment (W+CMYK) · 800mm · prints FILM only, not garments",
        "accent": "#B83280", "tint": "#F7E6F0",
        "golden": "Keep the printer POWERED + CAPPED during idle so MCTv2 keeps the white moving &mdash; don't "
                  "power down over long weekends. Weigh the white cartridges before each shift and run a nozzle "
                  "check before the first job. At install, get a full nozzle check during dealer commissioning "
                  "to catch a DOA head in warranty.",
        "daily": [
            "Nozzle check before the first job + after any idle period.",
            "Weigh the white cartridges; keep >=1 spare per slot loaded.",
            "End-of-day cap-station + wiper clean (approved solution only).",
            "Keep the printer clear of the powder-shaker airflow (no adhesive drift onto the head).",
            "Check room temp / RH at print height (aim 20-26°C / 40-60%).",
        ],
        "pm": [
            "Inspect / replace white-side dampers + filters (every 2-4 weeks).",
            "Clean the carriage underside; replace a glazed cap sponge.",
            "Map the curing oven with thermal strips; run wash tests on production samples.",
            "Calibrate powder-shaker vibration + film tension; ground / add anti-static.",
        ],
        "problems": [
            ("White runs out mid-job", "weigh before shift + spare per slot (or UISS / TxF300-75 Plus upgrade)."),
            ("White nozzles drop", "auto-clean max 3x, then manual wipe, then cap soak; swap a suspect cartridge BEFORE blaming the head."),
            ("Prints crack / peel / wash off", "it's the CURING: map oven temp + dwell, wash-test; powder must be glossy, not chalky."),
            ("White halo / mis-registration", "RasterLink choke (shrink white base under colour); save a verified preset."),
            ("Powder on blanks / clumping", "calibrate shaker, anti-static, keep powder dry + sifted."),
        ],
        "spares": [
            "White-side dampers + filters.",
            "Cap sponge + approved cleaning solution.",
            "PHT50 ink (esp. White); DTF film + adhesive powder stock.",
        ],
        "software": [
            "<b>RasterLink7</b>: RIP, white layering + choke; one licence covers up to 4 printers.",
            "<b>Mimaki Profile Master 3</b>: custom ICC / colour profiling.",
            "<b>Mimaki Remote Access (MRA)</b> + on-printer <b>NCU / NRS</b> nozzle recovery.",
        ],
        "tech": [
            "a white channel won't recover after dampers + purge + clean (push warranty head swap, esp. if new)",
            "repeated DOA-like nozzle loss",
            "NCU / NRS faults",
        ],
    },
]


def main():
    from pypdf import PdfWriter, PdfReader
    merger = PdfWriter()
    for c in CARDS:
        out = os.path.join(HERE, c["file"])
        build_card(out, c)
        n = len(PdfReader(out).pages)
        print(f"  {c['file']:42s} pages={n}")
        for p in PdfReader(out).pages:
            merger.add_page(p)
    combo = os.path.join(HERE, "printer-cheatsheets-all.pdf")
    with open(combo, "wb") as fh:
        merger.write(fh)
    print(f"  printer-cheatsheets-all.pdf")


if __name__ == "__main__":
    main()
