import { enforcesScreenMinimum, overStitchCapAction, readDestination, submitLabels } from "./mode"

const read = (qs: string) => readDestination(new URLSearchParams(qs))

describe("readDestination", () => {
  it("reads each destination from the URL", () => {
    expect(read("adminProof=order_1:ordli_1:back&proofArtwork=https%3A%2F%2Fr2%2Fa.png")).toEqual({
      kind: "proof",
      orderId: "order_1",
      lineItemId: "ordli_1",
      side: "back",
      artworkParam: "https://r2/a.png",
    })
    expect(read("pos_session=pos_1")).toEqual({ kind: "pos", sessionId: "pos_1" })
    expect(read("quote_id=q_1&qsig=s&group=qg_1&seed=x")).toEqual({
      kind: "quote",
      quoteId: "q_1",
      qsig: "s",
      groupId: "qg_1",
      seed: "x",
    })
    expect(read("variant=v_1")).toEqual({ kind: "shop" })
    expect(readDestination(null)).toEqual({ kind: "shop" })
  })

  it("needs every part of a staff link", () => {
    expect(read("adminProof=order_1::back").kind).toBe("shop")
    expect(read("quote_id=q_1").kind).toBe("shop")
  })

  it("POS wins over quote, as the save path always has", () => {
    expect(read("pos_session=pos_1&quote_id=q_1&qsig=s").kind).toBe("pos")
  })
})

describe("rules", () => {
  const shop = { kind: "shop" } as const
  const pos = read("pos_session=p")
  const quote = read("quote_id=q&qsig=s")

  it("only quotes skip the screen minimum", () => {
    expect([shop, pos, quote].map(enforcesScreenMinimum)).toEqual([true, true, false])
  })

  it("over-cap embroidery: staff price quotes, POS is refused, shop asks for a quote", () => {
    expect(overStitchCapAction(quote, { editingCart: false })).toBe("allow")
    expect(overStitchCapAction(pos, { editingCart: false })).toBe("use_quote")
    expect(overStitchCapAction(shop, { editingCart: true })).toBe("cannot_edit")
    expect(overStitchCapAction(shop, { editingCart: false })).toBe("request_quote")
  })

  it("button labels", () => {
    const none = { editingCartLine: false, needsQuote: false }
    expect(submitLabels(quote, { editingCartLine: true, needsQuote: true }).label).toBe("Add design to quote")
    expect(submitLabels(pos, none).label).toBe("Add to sale")
    expect(submitLabels(shop, { editingCartLine: true, needsQuote: true }).label).toBe("Update cart")
    expect(submitLabels(shop, { ...none, needsQuote: true }).label).toBe("Request a quote")
    expect(submitLabels(shop, none)).toEqual({})
  })
})
