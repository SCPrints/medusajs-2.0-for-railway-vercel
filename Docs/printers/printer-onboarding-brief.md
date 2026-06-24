# Printer Onboarding Brief — Adpost Group

Three newly acquired machines, three completely different decoration technologies, almost no
overlap. This brief covers what each does, what it runs on, the software, and — most
importantly — the practical problems you'll hit and how to work around them.

**Identity notes**
- The unit written up as **"UJF-6042 MkI e"** is a transcription slip — the real model is the
  **Mimaki UJF-6042 MkII e**. There is no "MkI e".
- The **TxF300-75 now has a "Plus" revision** (announced early 2026) whose upgrades specifically
  target the white-ink supply problem below. **Confirm which one Adpost actually has.**

**Confidence:** where a figure comes from a sibling machine (e.g. the HP R1000/R2000) or a single
forum report rather than a verified report on the exact model, it's flagged. Treat flagged numbers
as "plausible for the platform, not proven on your unit." This brief was assembled with an
adversarial fact-check pass that corrected two first-draft errors (the R530 is a **7-colour**
machine, not CMYK-only; the TxF's ink is **PHT50**, not Tp400).

---

## 1. HP Latex R530

### What it is & what you'll use it for
A 64-inch (1.6 m) **hybrid** wide-format printer — it prints directly onto **rigid boards on a
flatbed** *and* onto **flexible roll media**, on the same machine. Water-based **HP Latex** inks
(low odour, laminate-ready immediately, no solvent outgassing wait) plus genuine **white ink** with
automatic recirculation. Launched 2025; HP's compact, single-phase entry into the R-Series. It's a
**7-colour** machine: CMYK + Light Cyan + Light Magenta + White + Optimizer + Overcoat. Sweet spot:
one box doing both rigid and roll plus white in a small footprint (fits through a standard doorway,
220V single-phase).

→ **Send it:** signs, POP/POS displays, banners, wall graphics, vehicle-wrap panels.

### Mediums
- **Rigid (flatbed), up to 2 in / 50 mm thick:** foam board, corrugated, acrylic, aluminium/ACP,
  wood, glass, ceramic — up to 4×8 ft sheets.
- **Flexible (roll), up to 64 in / 1.6 m:** self-adhesive vinyl, PVC banner, wallcoverings, wrap films.
- Media must tolerate the curing heat; heat-sensitive/unprofiled stock needs a custom profile. White
  is for transparent and dark substrates.

### Software
- **HP PrintOS / Production Hub** — HP's cloud workflow + remote monitoring.
- **ONYX**, **Caldera**, **ErgoSoft** — all three RIPs are HP-certified for the R530 (ripping, colour,
  white/layer setup, contour-cut prep). Pick one as your house RIP.
- On-board touchscreen for job loading, white-recirculation routines, calibration.
- Consumables: **HP 875** cartridges across all channels (White **9D7Q3A**, Optimizer **9D7Q1A**,
  Black **9D7P7A**, etc.); **HP 886 White Latex Printhead** (G0Z21A) + colour printhead (G0Z24A).
  *(Ignore "HP 832/873/872" — those belong to other Latex models.)*

### Common problems + workarounds
1. **White-ink line clogs if you fully power the machine off (HIGH — confirmed on HP's own knowledge
   centre).** *This is the #1 new-shop mistake.* White must recirculate constantly, and
   auto-maintenance only runs in **sleep/low-power** mode, not when off. Past a hard limit (~8 hrs
   published; siblings cite as little as 4) the line clogs and a **certified engineer** must flush it.
   → **Never power it fully off. Leave it in sleep 24/7.** Confirm sleep mode on install day, make it
   a shop rule, follow HP's Extended Downtime Procedure for holidays, and treat any power outage as
   an incident.
2. **High white-ink cost; white expires ~2× faster than colour (HIGH).** ~6-month shelf life vs ~12,
   and ~120% ink load for full opacity. → Batch white jobs, forecast volume so cartridges don't
   time-expire, use oldest-first, price white-heavy jobs accordingly.
3. **"Banding/nozzle dropout" that's really a faulty drop detector or cabling — not dead heads (HIGH,
   from R2000 Plus).** → Before condemning ~$3k of heads, reset the drop-detection database, run 3
   detection cycles + a nozzle check, reseat carriage cables. Keep a spare drop detector to swap-test.
4. **Prints scratch easily, especially dark solids on rigid (HIGH, mostly R1000 reports).** Latex film
   is thinner than UV. → Use slower/higher-pass profiles, keep Overcoat low (~1.0–1.5, not maxed),
   laminate anything outdoor/abrasive, don't stack wet prints. Scratch resistance keeps improving for
   ~24h.
5. **Aluminium/ACP heat-marks or delaminates (HIGH, R1000).** → Print side A on the generic preset,
   drop cure to ~80°C for side B, cool fully before reloading, wait ≥4 hrs before laminating,
   adhesion-test every new ACP brand.
6. **Adhesion failures without profiling/prep (HIGH).** → Build a tested media-preset library *before*
   production — never run a new substrate live on a customer job; wipe boards, handle with gloves,
   keep a cross-hatch tape-test SOP.
7. **Carriage strike on warped/proud rigid (MEDIUM).** → Check flatness, reject/clamp warped sheets,
   stay under 2 in, verify vacuum + head-gap.
8. **Maintenance-cartridge / ink-collector churn + "not new" lockouts (MEDIUM).** → Stock both
   consumables ahead; on a false error, re-seat firmly; budget as monthly cost.
9. **No auto two-sided roll registration (MEDIUM).** → Build fiducials into artwork, test-sheet first,
   document a manual SOP.
10. **Slow in white/HQ modes — it's a compromise hybrid (~4–6 4×8 sheets/hr, MEDIUM).** → Right-size
    expectations (a one-machine shop, not a high-volume rigid house); use white passes only where
    needed.
11. **Belt-print needs proper bleed or you get white edge slivers (MEDIUM).** → Bake a bleed check
    into prepress.
12. **Gen4 ink lock-in + tablet-UI learning curve (MEDIUM).** → Order Gen4 only (no carryover from
    Gen3 330/560); budget operator training.

---

## 2. Mimaki UJF-6042 MkII e

### What it is & what you'll use it for
A **benchtop UV-LED flatbed** for **direct-to-object** printing — promo goods, gifts, awards,
packaging samples, signage components, small 3D items. It does **not** print rolls. UV-LED cures
instantly, so it prints on non-absorbent surfaces and lays white + clear in one pass. Bed:
**600 × 420 mm (~A2)**; prints objects up to **153 mm thick** (the defining edge over the A4-class
UJF-3042). ~2021–2022. Optional **Kebab MkII** rotary for 360° cylindrical printing. 1200 × 1200 dpi.

→ **Send it:** personalised promo products, drinkware, phone cases, awards, hard-goods decoration,
variable-data batches.

### Mediums
- *Rigid/hard:* acrylic, glass, metal, wood, ceramic, slate, PVC, rigid plastics (LH-100 ink).
- *Flexible:* leather, polyurethane, soft plastics, phone cases (LUS-120/150 ink).
- *3D objects up to 153 mm:* awards, housings, packaging, bottles.
- *Cylindrical* via the Kebab rotary.
- Low-energy/slick substrates usually need **PR-200 primer** first. 8 channels: CMYK + White + Lc/Lm
  + Clear.

### Software
- **Mimaki RasterLink7** — bundled RIP: colour sep, white+CMYK+clear layering, variable data,
  numbering, and **jig (object-alignment) printing**.
- **Mimaki Clear Control (MCC)** — gloss/matte/2.5D textured clear effects.
- ICC profiling via RasterLink; **Kebab MkII** control screen for cylindrical scaling.

### Common problems + workarounds
1. **White ink settles and drops out mid-job (often Head 4) — the most-reported headache (HIGH).**
   Dense TiO₂ white settles fast and the UJF circulates white only in the sub-tank, *not through the
   head*. → **Shake every white bottle before each shift**, run daily white maintenance, never leave
   idle >1–2 weeks. If it drops out: syringe-flush/replace the white solenoid valve (~US$25, p/n
   M015864 — *single forum source*), confirm Head 4 reaches temp, set Waiting/Drawing-Refresh to 2–3.
2. **Clear/Primer head clogs and dies — owners report replacing as often as every 6 months (HIGH).**
   UV ink left static in the intermittent channel cures hard. → Cycle ink through it regularly, daily
   clean, wipe the head face with approved flushing fluid; **budget periodic head replacement as a
   real cost.**
3. **"White blowout" — stray white mist sprays around the artwork, worse in dry/winter air (HIGH).**
   Static + dry air + excess head gap. → Ionizer fan, humidifier (35–65% RH), IPA-wipe parts, keep
   head gap as low as safe (~1.5 mm).
4. **Auto-maintenance freezes the machine — can hang for hours (MEDIUM).** Reported causes: faulty
   Head 4 temp sensor, coolant/air-valve issues, bad o-rings, power surges. → Put it on a
   **UPS/line conditioner**; have the tech check pressures, valves, o-rings, sensor.
5. **Error 533 (X-origin/homing failure) at startup (HIGH — verified verbatim).** White ink/mist
   contaminate the X-axis encoder strip. → **Clean the encoder strip + homing sensor first** before
   swapping electronics; replace the strip if scratched. Add to PM.
6. **Head strikes / nozzle deflection from wrong head gap on objects (HIGH).** → Build jigs that hold
   parts at a consistent known height, set head height to the part's true high point, use the right
   table spacer; treat GAP-CHECK as a safety net, not a leveler.
7. **Table drifts out of level over time (MEDIUM).** Carriage motion loosens base screws. →
   Periodically re-torque and re-level to a consistent gap.
8. **Adhesion failures on glass/metal/slick plastics (MEDIUM).** → Use **PR-200 primer** (auto-primer
   applies to image area only), degrease with IPA, scratch-test new substrates.
9. **Under-cured/tacky white when layered (LOW).** → Correct white profile + print order
   (White→Colour on dark/clear), don't under-dose UV; scratch-test.
10. **UV ink expiry hard-lockout — firmware refuses expired ink (HIGH).** → **Check expiry on every
    bottle/chip on delivery, reject short-dated stock**, order to pace, rotate FIFO.
11. **Maintenance labour + consumables easy to under-budget (HIGH).** Wiper, caps, flushing box,
    dampers, filters, tubing all wear. → Strict daily/weekly PM + a spares shelf; treat PM time as
    production cost; use Mimaki's maintenance videos to standardise for new staff.

---

## 3. Mimaki TxF300-75

### What it is & what you'll use it for
A roll-fed **Direct-to-Film (DTF)** textile transfer printer. It prints heat-transfer sheets — it
does **not** print directly onto garments. Workflow: print white + CMYK onto DTF film → apply
hot-melt adhesive powder and cure → heat-press onto the garment. Max width **800 mm (31.5")**.
Mimaki's second DTF model (Aug 2023); the dual staggered head gives up to ~**10 m²/hr**. 720/1440 dpi.

→ **Send it:** t-shirts, hoodies, jackets, totes — cotton, polyester, blends, and dark garments
(the white underbase enables darks).

### Mediums
- *Printed directly:* **DTF (PET release) film only**, roll-fed up to 810 mm wide.
- *Final transfer (via heat press, not the printer):* cotton, polyester, nylon, blends, dark
  garments, leather goods, totes. Fabric compatibility is a property of the transfer + press step,
  not the printer.

### Software
- **RasterLink7** — bundled RIP (white+CMYK layering, tonal gradation, colour management); one
  licence covers up to 4 printers.
- **Mimaki Profile Master 3 (MPM3)** — optional custom ICC profiling.
- **Mimaki Remote Access (MRA)** — remote status/ink/job monitoring.
- On-printer **NCU/NRS** — auto nozzle detection, cleaning, defective-nozzle substitution.
- Ink: **Mimaki PHT50** water-based pigment, CMYK + White, kept circulating by **MCTv2**; OEKO-TEX
  **ECO PASSPORT** certified. *(Not "Tp400.")*

### Common problems + workarounds
1. **Constant white-cartridge weighing/swapping; white runs out mid-job (HIGH).** Heavy white usage +
   limited slots on the base model. Mimaki effectively confirmed this by launching the **Plus** with
   extra white slots + auto-switching. → Weigh white carts before each shift, keep ≥1 spare per slot,
   log consumption per run; if uptime is critical, consider the UISS upgrade / Plus.
2. **White full-channel dropouts needing daily recovery (HIGH).** Pigment sedimentation in
   dampers/lines/head. → **Nozzle check before the first job daily**; let MCTv2 run (don't fully power
   down for long idles); escalate clogs progressively (auto-clean max 3×, then manual wipe, then
   capping-station soak); swap a suspect cartridge before assuming head damage; inspect white-side
   dampers/filters every 2–4 weeks.
3. **Head failure shortly after install (MEDIUM, from sibling TxF150).** Suspected
   early-production/shipping defect. → **Full nozzle check at install / during dealer commissioning**
   so a DOA head is caught in warranty; push for a warranty head swap rather than self-diagnosing for
   weeks.
4. **Clogging during idle — nozzles dry after a few unused days (HIGH).** → Keep it **powered and
   capped** during idle; follow Mimaki's long-storage procedure for extended shutdown; nozzle check +
   small purge before resuming.
5. **Capping station / wiper / carriage fouling from ink + drifting powder (HIGH).** → Daily
   cap-station + wiper clean (approved solution); **keep the printer away from the powder
   shaker/curing airflow** so adhesive doesn't drift onto the head; replace a glazed cap sponge.
6. **Tight environmental window (HIGH for the advice).** Dry air clogs white; humid air clumps powder.
   → Climate-control and measure at print height; humidifier/dehumidifier as needed; store powder
   airtight. *(Rated spec is 20–30°C / 35–65% RH; the tighter 20–26°C / 40–60% is operator
   clog-avoidance advice, not the spec.)*
7. **Wash-fastness failures (prints crack/peel/wash off) — it's the curing, not the printer (HIGH).**
   Uneven oven temp / dwell, under- or over-melted powder. → **Map the oven with thermal strips** for
   cold zones, dial in time+temp to spec, run periodic **wash tests** on production samples, confirm
   powder is glossy (not chalky) at tunnel exit.
8. **Powder-shaker headaches — uneven coverage, powder on blanks, clumping, film-feed/tension (HIGH).**
   → Calibrate shaker vibration + film tension, ground the shaker / add anti-static bars in dry air,
   store powder dry and sifted, clean rollers/screens daily, use flat PET film to avoid curl.
9. **Ongoing consumable/running cost (MEDIUM).** Closed OEM ink (~$80/bottle) + high white usage +
   dampers/filters/film/powder. → Build consumables into per-print pricing (~$2–4 all-in material),
   track real ink-per-job, **stay on OEM ink while under warranty**, don't over-clean.
10. **RIP white-layer mistakes — white halo or mis-registration (MEDIUM).** → In RasterLink use
    **Position Correction / "choke"** to shrink the white base under the colour, set overlay order
    deliberately, save a verified preset, proof a sample first.

---

## How the three fit together

They barely overlap — each owns a lane:

- **R530 → flat signage & display** (rigid + roll, the only one doing big sheets or roll media; white
  enables backlit/dark substrates).
- **UJF-6042 MkII e → small direct-to-object** (hard 3D items up to A2 × 153 mm, plus cylindrical via
  Kebab).
- **TxF300-75 → garment/textile** (DTF transfers heat-pressed onto fabric).

**Rule of thumb: flat surface or media → R530; hard 3D object → UJF; fabric/apparel → TxF.** The two
Mimakis share **RasterLink7** and the same white-ink discipline, so skills transfer between them. The
R530 is the odd one out (HP ecosystem, ONYX/Caldera/ErgoSoft, PrintOS).

## What to prioritise learning first

1. **White-ink discipline on all three — this is where money and downtime are lost.** R530: *never
   fully power off* (sleep 24/7). Both Mimakis: keep powered + capped during idle, weigh/shake white
   before shifts, nozzle-check before the first job daily, never leave idle for weeks. These habits
   are free; ignoring them is what causes the expensive callouts.
2. **Build tested presets before customer work** — R530 substrate profiles + adhesion tests, UJF
   primer/jig/head-gap setup, TxF white-choke + oven temperature mapping. Never run a new substrate or
   oven setting live on a paying job.
3. **Stand up a written daily/weekly PM routine + a spares shelf** (R530: drop detector,
   maintenance/collector cartridges; UJF: wiper/caps/dampers/white solenoid/flushing fluid; TxF:
   white-side dampers/filters/cap sponge). PM time is production cost.
4. **Catch DOA hardware in warranty** — full nozzle checks at install on both Mimakis and during
   dealer commissioning, so a defective head is the dealer's problem before you've sunk weeks into it.

**Confidence caveats:** the white-ink "never fully power off" (R530), white-dropout / Error-533 /
expiry-lockout (UJF), and white-supply / curing / powder (TxF) issues are all well-grounded. Several
R530 figures (drop detector, scratch numbers, ACP temps, throughput) come from sibling R1000/R2000
machines, and a few Mimaki figures (head-replacement frequency, the $25 solenoid part, the ink-expiry
claim) rest on single forum reports — treat those as directional until you've seen them on your own
units.

---
*v1 · 2026-06-19 · See `official-resources.md` for verified manufacturer links, manuals and videos.*
