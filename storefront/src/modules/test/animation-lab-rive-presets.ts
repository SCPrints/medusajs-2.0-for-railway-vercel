/**
 * Rive lab presets. Assets are vendored under /animation-lab/*.riv (see storefront/public).
 * Optional overrides: NEXT_PUBLIC_ANIMATION_LAB_RIVE_1 … _5 (full URL or path).
 */
export type RiveLabPreset = {
  id: string
  sectionTitle: string
  sectionDescription: string
  /** Default src when env not set */
  src: string
  stateMachines?: string | string[]
  animations?: string | string[]
  /** When false, Rive may attach pointer listeners defined in the file */
  shouldDisableRiveListeners?: boolean
}

const BASE = "/animation-lab"

export const ANIMATION_LAB_RIVE_PRESETS: RiveLabPreset[] = [
  {
    id: "rive-vehicles-sm",
    sectionTitle: "Rive — vehicles (state machine)",
    sectionDescription:
      "Hosted sample `vehicles.riv` with state machine **bumpy** (Rive CDN sample mirrored in /public). Autoplay respects reduced motion.",
    src: `${BASE}/vehicles.riv`,
    stateMachines: "bumpy",
    shouldDisableRiveListeners: true,
  },
  {
    id: "rive-offroad",
    sectionTitle: "Rive — off-road car",
    sectionDescription: "CDN sample (off_road_car.riv) — simple looping artboard.",
    src: `${BASE}/off_road_car.riv`,
    shouldDisableRiveListeners: true,
  },
  {
    id: "rive-truck",
    sectionTitle: "Rive — truck",
    sectionDescription: "CDN sample (truck.riv) — lightweight vector loop.",
    src: `${BASE}/truck.riv`,
    shouldDisableRiveListeners: true,
  },
  {
    id: "rive-vehicles-linear",
    sectionTitle: "Rive — vehicles (default playback)",
    sectionDescription:
      "Same vehicles file with default autoplay (no explicit state machine prop) — compare with the bumpy state-machine variant above.",
    src: `${BASE}/vehicles.riv`,
    shouldDisableRiveListeners: true,
  },
  {
    id: "rive-listeners",
    sectionTitle: "Rive — pointer listeners enabled",
    sectionDescription:
      "Same vehicles file with **Rive canvas listeners** enabled — if the artboard defines hit areas, pointer interactions may fire. Falls back visually to the same asset otherwise.",
    src: `${BASE}/vehicles.riv`,
    stateMachines: "bumpy",
    shouldDisableRiveListeners: false,
  },
]

export function resolveRivePresetSrc(index1Based: number, fallback: string): string {
  const fromEnv = process.env[`NEXT_PUBLIC_ANIMATION_LAB_RIVE_${index1Based}`]
  return typeof fromEnv === "string" && fromEnv.length > 0 ? fromEnv : fallback
}
