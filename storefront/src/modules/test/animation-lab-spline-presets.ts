/**
 * Spline scenes load from exported .splinecode URLs (Spline editor → Export → Public URL).
 * Set NEXT_PUBLIC_ANIMATION_LAB_SPLINE_URL_1 … _5 in .env.local for each slot.
 */
export type SplineLabPreset = {
  id: string
  sectionTitle: string
  sectionDescription: string
  envIndex: 1 | 2 | 3 | 4 | 5
}

export const ANIMATION_LAB_SPLINE_PRESETS: SplineLabPreset[] = [
  {
    id: "spline-1",
    envIndex: 1,
    sectionTitle: "Spline — scene slot 1",
    sectionDescription:
      "3D embed via @splinetool/react-spline. Set **NEXT_PUBLIC_ANIMATION_LAB_SPLINE_URL_1** to a public scene URL.",
  },
  {
    id: "spline-2",
    envIndex: 2,
    sectionTitle: "Spline — scene slot 2",
    sectionDescription: "Set **NEXT_PUBLIC_ANIMATION_LAB_SPLINE_URL_2** for this block.",
  },
  {
    id: "spline-3",
    envIndex: 3,
    sectionTitle: "Spline — scene slot 3",
    sectionDescription: "Set **NEXT_PUBLIC_ANIMATION_LAB_SPLINE_URL_3**.",
  },
  {
    id: "spline-4",
    envIndex: 4,
    sectionTitle: "Spline — scene slot 4",
    sectionDescription: "Set **NEXT_PUBLIC_ANIMATION_LAB_SPLINE_URL_4**.",
  },
  {
    id: "spline-5",
    envIndex: 5,
    sectionTitle: "Spline — scene slot 5",
    sectionDescription: "Set **NEXT_PUBLIC_ANIMATION_LAB_SPLINE_URL_5**.",
  },
]

export function splineSceneUrlForIndex(index: 1 | 2 | 3 | 4 | 5): string {
  const key = `NEXT_PUBLIC_ANIMATION_LAB_SPLINE_URL_${index}` as const
  const v = process.env[key]
  return typeof v === "string" && v.length > 0 ? v : ""
}
