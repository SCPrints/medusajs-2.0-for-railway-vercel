/**
 * Keep small artwork draggable. Fabric tests resize handles before the artwork,
 * and their 36px touch boxes meet in the middle of anything under ~28px on
 * screen, so every finger drag resized it (phones, Nov 2026).
 *
 * All numbers are screen px: Fabric's padding and handle sizes ignore zoom.
 */
export const GRAB_PX = 44
const BASE_PADDING = 4
/** Under this, the four side handles would sit on top of the corner handles. */
const SIDE_HANDLE_MIN_PX = 72
const SIDE_HANDLES = ["ml", "mr", "mt", "mb"]

/** Selection-box padding that makes the shorter side at least GRAB_PX. */
export function grabPadding(width: number, height: number): number {
  return Math.max(BASE_PADDING, Math.ceil((GRAB_PX - Math.min(width, height)) / 2))
}

export function applyGrabArea(object: any): void {
  if (!object?.canvas || !object.controls) return
  const zoom = object.canvas.getZoom()
  const width = object.getScaledWidth() * zoom
  const height = object.getScaledHeight() * zoom
  const padding = grabPadding(width, height)
  object.padding = padding

  const roomForSides = Math.min(width, height) + 2 * padding >= SIDE_HANDLE_MIN_PX
  for (const key of SIDE_HANDLES) {
    const control = object.controls[key]
    // Text boxes wrap with ml / mr, so those always stay.
    if (control) object.setControlVisible(key, roomForSides || control.actionName === "resizing")
  }

  // The padded box already lifts the rotate handle; don't push it off the canvas.
  const rotate = object.controls.mtr
  if (rotate) rotate.offsetY = -Math.max(24, 40 - (padding - BASE_PADDING))

  // A press in the middle always moves; handles keep everything outside it.
  object.findControl = function (pointer: { x: number; y: number }, forTouch?: boolean) {
    const { tl, br } = this.oCoords ?? {}
    if (tl && br && Math.hypot(pointer.x - (tl.x + br.x) / 2, pointer.y - (tl.y + br.y) / 2) < GRAB_PX / 2) {
      this.__corner = undefined
      return undefined
    }
    return Object.getPrototypeOf(this).findControl.call(this, pointer, forTouch)
  }
  object.setCoords()
}
