import { applyGrabArea, GRAB_PX, grabPadding } from "./grab-area"

const fake = (width: number, height: number, zoom = 1, sideAction = "scale") => {
  const visible: Record<string, boolean> = {}
  const proto = { findControl: () => ({ key: "br" }) }
  const object: any = Object.assign(Object.create(proto), {
    canvas: { getZoom: () => zoom },
    getScaledWidth: () => width,
    getScaledHeight: () => height,
    controls: { ml: { actionName: sideAction }, mr: { actionName: sideAction }, mt: {}, mb: {} },
    setControlVisible: (key: string, on: boolean) => (visible[key] = on),
    setCoords: () => undefined,
    oCoords: { tl: { x: 78, y: 78 }, br: { x: 122, y: 122 } },
  })
  applyGrabArea(object)
  return { object, visible }
}

describe("applyGrabArea", () => {
  it("grows a tiny logo's box to a finger-sized target, in screen px", () => {
    const { object } = fake(16, 12, 0.675)
    expect(12 * 0.675 + 2 * object.padding).toBeGreaterThanOrEqual(GRAB_PX)
  })

  it("a press in the middle moves; outside it the handles still work", () => {
    const { object } = fake(16, 12)
    expect(object.findControl({ x: 100, y: 100 }, true)).toBeUndefined()
    expect(object.findControl({ x: 115, y: 108 }, true)).toBeUndefined()
    expect(object.findControl({ x: 122, y: 122 }, true)).toEqual({ key: "br" })
  })

  it("hides side handles only when there is no room for them", () => {
    expect(fake(16, 12).visible).toEqual({ ml: false, mr: false, mt: false, mb: false })
    expect(fake(200, 150).visible).toEqual({ ml: true, mr: true, mt: true, mb: true })
  })

  it("keeps a text box's wrap handles", () => {
    expect(fake(120, 18, 1, "resizing").visible).toEqual({ ml: true, mr: true, mt: false, mb: false })
  })

  it("leaves large artwork at the normal padding", () => {
    expect(grabPadding(200, 150)).toBe(4)
  })
})
