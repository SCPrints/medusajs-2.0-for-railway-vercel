import { jobTaskFilter } from "../job-tasks"

describe("jobTaskFilter", () => {
  const status = ["open", "in_progress"]

  it("matches order or quote tasks once a quote has become an order", () => {
    expect(jobTaskFilter("order_1", "qt_1")).toEqual({
      $or: [{ order_id: "order_1" }, { quote_id: "qt_1" }],
      status,
    })
  })

  it("uses the single id when the job has only one", () => {
    expect(jobTaskFilter("order_1", null)).toEqual({ order_id: "order_1", status })
    expect(jobTaskFilter(null, "qt_1")).toEqual({ quote_id: "qt_1", status })
  })
})
