// Curated catalog for the Custom Hats brief builder. This is the single source
// of truth for cap styles, decoration locations, methods, and trim add-ons.
// It drives both the marketing "what's possible" cards (server page) and the
// brief-builder form (client). Edit here to add/rename options — no other file
// needs to change.
// ponytail: static curated data, not a DB module — full-custom blanks aren't in
// the retail catalog and a human prices every quote, so a data file is enough.
// Promote to an admin-managed module only if staff need to edit it without a deploy.

export type CapStyle = {
  id: string
  label: string
  blurb: string
}

export const CAP_STYLES: CapStyle[] = [
  { id: "trucker", label: "Trucker (foam front, mesh back)", blurb: "Foam front panel — ideal for deboss, patches, DTF." },
  { id: "snapback", label: "Snapback (structured, flat brim)", blurb: "Hard structured front for bold embroidery." },
  { id: "dad-cap", label: "Dad cap (unstructured, curved brim)", blurb: "Soft low-profile — great for tone-on-tone." },
  { id: "5-panel", label: "5-panel / camp cap", blurb: "Flat single front panel — clean for patches + print." },
  { id: "flat-peak", label: "Flat-peak / fitted", blurb: "Flat undervisor for underbrim prints." },
  { id: "bucket", label: "Bucket hat", blurb: "All-over canvas — embroidery, appliqué, all-over print." },
  { id: "beanie", label: "Beanie (knit)", blurb: "Cuff embroidery or woven label — no heat/print." },
  { id: "visor", label: "Visor", blurb: "Front band only." },
  { id: "other", label: "Other / not sure", blurb: "Tell us what you have in mind." },
]

export type DecorationLocation = { id: string; label: string }

export const LOCATIONS: DecorationLocation[] = [
  { id: "front", label: "Front / crown" },
  { id: "back", label: "Back" },
  { id: "left", label: "Left side" },
  { id: "right", label: "Right side" },
  { id: "bill-top", label: "Bill / brim (top)" },
  { id: "undervisor", label: "Undervisor (bill underside)" },
  { id: "sandwich", label: "Sandwich bill (edge)" },
  { id: "closure", label: "Closure strap" },
]

export type Method = { id: string; label: string; blurb?: string }
export type MethodGroup = { group: string; blurb: string; methods: Method[] }

export const METHOD_GROUPS: MethodGroup[] = [
  {
    group: "Embroidery (stitched)",
    blurb: "Sewn directly onto the cap, bottom-up on a cap frame.",
    methods: [
      { id: "flat-embroidery", label: "Flat embroidery", blurb: "2D satin/fill — the default." },
      { id: "3d-puff", label: "3D puff", blurb: "Foam-raised satin. Bold, closed shapes only." },
      { id: "chenille", label: "Chenille / loop-pile", blurb: "Varsity texture (dedicated head)." },
      { id: "applique", label: "Appliqué / tackle twill", blurb: "Fabric inlay + stitched border." },
      { id: "tone-on-tone", label: "Tone-on-tone", blurb: "Thread matched to the cap." },
    ],
  },
  {
    group: "Patches (applied)",
    blurb: "Decorated flat, then applied — sidesteps most crown-shape limits.",
    methods: [
      { id: "patch-embroidered", label: "Embroidered patch" },
      { id: "patch-woven", label: "Woven patch", blurb: "Finer detail, flatter." },
      { id: "patch-leather", label: "Leather / faux-leather patch", blurb: "Laser-cut + engraved." },
      { id: "patch-pvc", label: "PVC / rubber patch" },
      { id: "patch-chenille", label: "Chenille patch" },
      { id: "patch-sublimated", label: "Sublimated poly patch", blurb: "Full-colour photographic." },
      { id: "patch-debossed-leather", label: "Debossed / embossed leather patch" },
    ],
  },
  {
    group: "Heat-applied",
    blurb: "Pressed onto flat-ish panels with a cap press.",
    methods: [
      { id: "dtf", label: "DTF transfer", blurb: "Soft hand, full colour, fine detail." },
      { id: "screen-transfer", label: "Screen-printed transfer (Supacolor)", blurb: "Best opacity + durability at volume." },
      { id: "htv", label: "HTV / cut vinyl", blurb: "Single colour + specialty films." },
      { id: "sublimation", label: "Sublimation", blurb: "White/light polyester only." },
      { id: "rhinestone", label: "Rhinestone / hotfix" },
    ],
  },
  {
    group: "Direct print",
    blurb: "Printed straight onto the cap — best on flat brims + undervisors.",
    methods: [
      { id: "uv-print", label: "UV print", blurb: "Flat brims / undervisors / shallow crowns." },
      { id: "uv-dtf", label: "UV DTF (sticker-style)", blurb: "Hard-surface accessories." },
      { id: "direct-screen", label: "Direct screen print", blurb: "Flat panels / brims only." },
    ],
  },
]

// Flat lookup for building human-readable labels at submit time.
export const METHOD_LABEL: Record<string, string> = Object.fromEntries(
  METHOD_GROUPS.flatMap((g) => g.methods.map((m) => [m.id, m.label]))
)
export const LOCATION_LABEL: Record<string, string> = Object.fromEntries(
  LOCATIONS.map((l) => [l.id, l.label])
)

// Specialty HTV films (surfaced as a hint when HTV is chosen).
export const HTV_FILMS = ["Reflective", "Flock", "Foil", "Glitter", "Glow"] as const

export const PATCH_ATTACHMENTS = ["Heat-seal", "Sewn perimeter", "Hook-and-loop (removable)"] as const

// Whole-cap structural / trim add-ons (not tied to a single decoration location).
export type TrimOption = { id: string; label: string }

export const TRIM_OPTIONS: TrimOption[] = [
  { id: "deboss", label: "Deboss (foam trucker front)" },
  { id: "laser-etch", label: "Laser etch" },
  { id: "woven-label", label: "Woven label" },
  { id: "metal-badge", label: "Metal badge / pin" },
  { id: "contrast-stitch", label: "Contrast stitching" },
  { id: "custom-eyelets", label: "Custom eyelets" },
  { id: "custom-closure", label: "Custom closure / strap" },
]
export const TRIM_LABEL: Record<string, string> = Object.fromEntries(
  TRIM_OPTIONS.map((t) => [t.id, t.label])
)
