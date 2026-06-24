# Adpost Group — Printer Docs

Onboarding + shop-floor reference for the three printers acquired June 2026:
**HP Latex R530**, **Mimaki UJF-6042 MkII e**, **Mimaki TxF300-75**.

## Contents

| File | What it is | Use it for |
| --- | --- | --- |
| [`printer-onboarding-brief.md`](printer-onboarding-brief.md) | Full brief — what each machine is, mediums, software, every problem + workaround, how they fit together, what to learn first | Read once when learning the fleet; reference for detail |
| [`official-resources.md`](official-resources.md) | Verified manufacturer links — product pages, datasheets, RIP/driver downloads, maintenance videos, ink part numbers | Finding manuals, software, spares; training |
| [`hp-latex-r530-cheatsheet.pdf`](hp-latex-r530-cheatsheet.pdf) | One-page A4 shop-floor card | **Print + laminate, pin by the machine** |
| [`mimaki-ujf-6042-mkiie-cheatsheet.pdf`](mimaki-ujf-6042-mkiie-cheatsheet.pdf) | One-page A4 shop-floor card | **Print + laminate, pin by the machine** |
| [`mimaki-txf300-75-cheatsheet.pdf`](mimaki-txf300-75-cheatsheet.pdf) | One-page A4 shop-floor card | **Print + laminate, pin by the machine** |
| [`printer-cheatsheets-all.pdf`](printer-cheatsheets-all.pdf) | All three cards in one file | Print the lot in one go |
| [`_build_cards.py`](_build_cards.py) | Generator for the cheat-sheet PDFs | Edit content + `python3 Docs/printers/_build_cards.py` to regenerate |

## The one thing that matters most

All three have a **white-ink failure mode that is the single biggest avoidable expense:**

- **R530** — never fully power off; leave it in Sleep 24/7 so white recirculates.
- **UJF-6042** — shake white bottles + run white maintenance before each shift; never idle >1–2 weeks.
- **TxF300-75** — keep it powered + capped during idle (MCTv2); weigh white + nozzle-check before the first job.

Embed these day one — they're free, and ignoring them is what causes the costly engineer callouts.

## Accuracy note

Built with an adversarial fact-check pass. Model identity, white-ink rules, and headline specs are
verified. A few figures (drop-detector behaviour, ACP cure temps, a $25 solenoid part, head-replacement
frequency) come from sibling machines or single forum reports and are flagged in the brief — verify on
your own units. Confirm whether the textile printer is the **TxF300-75** or the newer **TxF300-75 Plus**
(the Plus changes the white-supply specifics).

*Regenerate cards: `pip install reportlab pypdf && python3 Docs/printers/_build_cards.py` · v1 · 2026-06-19*
