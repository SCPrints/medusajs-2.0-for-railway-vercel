import {
  filterLookbookJobs,
  groupLookbookJobs,
  relatedLookbookJobs,
  slugifyJob,
  type LookbookRow,
} from "../lookbook-jobs"

const row = (p: Partial<LookbookRow> & { id: string }): LookbookRow => ({
  title: p.id,
  description: null,
  image_url: `https://img/${p.id}.jpg`,
  attribution: null,
  job_slug: null,
  product_handles: { handles: [] },
  tags: { values: [] },
  ...p,
})

describe("lookbook jobs", () => {
  it("slugifies near-duplicate titles to the same job", () => {
    expect(slugifyJob("Art Gallery of NSW - Monumental")).toBe(
      "art-gallery-of-nsw-monumental"
    )
    expect(slugifyJob("Art Gallery of NSW Monumental")).toBe(
      "art-gallery-of-nsw-monumental"
    )
    expect(slugifyJob("M.A.G.")).toBe("m-a-g")
    expect(slugifyJob("  ")).toBe("")
  })

  it("groups tiles by slug and unions products + tags across the job", () => {
    const jobs = groupLookbookJobs([
      row({ id: "a", job_slug: "naked-baker", title: "Naked Baker", tags: { values: ["hospitality"] } }),
      row({ id: "b", job_slug: "rj", tags: { values: ["trades"] } }),
      row({
        id: "c",
        job_slug: "naked-baker",
        description: "Faded tees",
        product_handles: { handles: ["tee-5080"] },
      }),
      row({ id: "d" }), // no slug → its own job
    ])
    expect(jobs.map((j) => j.slug)).toEqual(["naked-baker", "rj", "d"])
    const nb = jobs[0]
    expect(nb.image_count).toBe(2)
    expect(nb.cover_image_url).toBe("https://img/a.jpg")
    expect(nb.description).toBe("Faded tees")
    expect(nb.product_handles).toEqual(["tee-5080"])

    expect(filterLookbookJobs(jobs, { productHandle: "tee-5080" }).map((j) => j.slug)).toEqual([
      "naked-baker",
    ])
    expect(filterLookbookJobs(jobs, { tag: "TRADES" }).map((j) => j.slug)).toEqual(["rj"])
  })

  it("puts overlapping jobs first in related", () => {
    const jobs = groupLookbookJobs([
      row({ id: "a", job_slug: "a", tags: { values: ["trades"] } }),
      row({ id: "b", job_slug: "b" }),
      row({ id: "c", job_slug: "c", tags: { values: ["trades"] } }),
    ])
    expect(relatedLookbookJobs(jobs[0], jobs).map((j) => j.slug)).toEqual(["c", "b"])
  })
})
