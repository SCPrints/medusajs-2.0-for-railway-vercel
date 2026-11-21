import { PORTAL_MESSAGE_ACTOR_PREFIX, portalMessageBody, visibleMessages } from "../job-messages"
import { appendRequest, decideRequest, MAX_REQUESTS, type CustomerRequest } from "../customer-requests"

const row = (id: string, created_by: string | null, body: string, t = "2026-11-21T01:00:00Z") => ({ id, created_by, body, created_at: t })
const who = { customerId: "cus_1", customerEmail: "Sam@Example.com" }

describe("visibleMessages", () => {
  it("never returns internal notes, system rows or other people's text", () => {
    const out = visibleMessages(
      [
        row("1", "staff-note:user_1", "Note: customer is difficult"),
        row("2", "user_1", "internal comment"),
        row("3", null, "system row"),
        row("4", "email:other@example.com", "From: other@example.com\n\nsecret"),
        row("5", "email:portal:cus_2", portalMessageBody("x@y.com", "someone else")),
        row("6", "portal-request:cus_1", "Problem reported"),
      ],
      who
    )
    expect(out).toEqual([])
  })
  it("returns own portal + email messages and staff emails, oldest first", () => {
    const out = visibleMessages(
      [
        row("b", "staff-email:user_1", "Sure thing", "2026-11-21T02:00:00Z"),
        row("a", `${PORTAL_MESSAGE_ACTOR_PREFIX}cus_1`, portalMessageBody("sam@example.com", "Hello"), "2026-11-21T01:00:00Z"),
        row("c", "email:Sam <sam@example.com>", "From: Sam <sam@example.com> · Subject: Re\n\nThanks", "2026-11-21T03:00:00Z"),
      ],
      who
    )
    expect(out.map((m) => [m.from, m.text])).toEqual([["you", "Hello"], ["staff", "Sure thing"], ["you", "Thanks"]])
  })
})

describe("customer requests", () => {
  const mk = (id: string): CustomerRequest => ({ id, kind: "problem", status: "open", staff_note: null, created_at: "x", decided_at: null })
  it("caps the list", () => {
    let l: CustomerRequest[] = []
    for (let i = 0; i < MAX_REQUESTS + 5; i++) l = appendRequest(l, mk(String(i)))
    expect(l).toHaveLength(MAX_REQUESTS)
  })
  it("decides one request, null for unknown", () => {
    const l = [mk("a")]
    expect(decideRequest(l, "zz", "approved", null, new Date())).toBeNull()
    expect(decideRequest(l, "a", "declined", " no stock ", new Date())![0]).toMatchObject({ status: "declined", staff_note: "no stock" })
  })
})
