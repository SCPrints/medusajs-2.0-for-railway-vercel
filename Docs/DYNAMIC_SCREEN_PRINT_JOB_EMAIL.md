# Dynamic Screen Printing — job email template

One email per garment group (same garment + same artwork). Save as a Gmail Template.

```
Subject: SC Prints #{{CPO}} — {{CLIENT}} — {{GARMENT}} x {{QTY}}

Hi team,

PO:           #{{CPO}}
Client:       {{CLIENT}}
Required by:  {{DATE}}
Garments:     {{e.g. AS Colour 5001 Tee, 100% cotton — arriving DATE via AS Colour}}

SIZES
  {{COLOUR}}:  S-{{n}}  M-{{n}}  L-{{n}}  XL-{{n}}  2XL-{{n}}   = {{n}}
  {{COLOUR}}:  S-{{n}}  M-{{n}}  L-{{n}}  XL-{{n}}  2XL-{{n}}   = {{n}}
  Total: {{QTY}}

PRINT
  {{POSITION}} — {{W}} x {{H}}mm — {{PMS ####C / White / Black}}{{ + base}} — {{file.ai}}
  {{POSITION}} — {{W}} x {{H}}mm — {{PMS ####C}} — {{file.ai}}

Notes: {{anything not covered above, else delete this line}}

Thanks,
{{NAME}}
```

## Example (J52375-02)

```
Subject: SC Prints #78 — ALS Safety — AS Colour 5001 Tees x 54

Hi team,

PO:           #78
Client:       ALS Safety
Required by:  9/9
Garments:     AS Colour 5001 Tee, 100% cotton — arriving 5/9 via AS Colour

SIZES
  Orange:        S-3  M-20  L-20  XL-5  2XL-5   = 53
  Charity Pink:  XS-3                            = 3
  Total: 56

PRINT
  Left chest      — 100 x 34mm  — Black — ALS_leftchest.ai
  Lower left back — 275 x 400mm — Black — ALS_back.ai

Notes: same art as #78 black tees, black ink instead of white/base.

Thanks,
Sean
```

Garment colour per size line matters: the Orange/Pink proof for J52375-02 came back labelled "Black 5001 Tees".
