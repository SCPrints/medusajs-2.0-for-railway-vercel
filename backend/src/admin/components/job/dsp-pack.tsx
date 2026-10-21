import { Badge, Button, Container, Heading, Text, Textarea, toast } from "@medusajs/ui"
import { useState } from "react"

import type { DspGroupPack } from "../../../lib/dsp-job"

type Pack = { po: string; customer: string; due_date: string | null; packs: DspGroupPack[] }

/**
 * DSP job pack (lib/dsp-job.ts): the art proof stamped on DSP's own template,
 * a printIQ copy-paste block per garment, and the artwork files to send.
 * PMS, print size and repeat-job come from the job pricer's DSP fields.
 */
export function DspPackPanel({ jobId, quoteId }: { jobId: string; quoteId: string | null }) {
  const [pack, setPack] = useState<Pack | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const base = `/admin/jobs/${encodeURIComponent(jobId)}/dsp-pack`

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(base, { credentials: "include" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? `Failed (${res.status})`)
      setPack(json as Pack)
    } catch (err: any) {
      setError(err?.message ?? "Couldn't build the DSP pack")
    } finally {
      setLoading(false)
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Copied — paste into printIQ")
    } catch {
      toast.error("Copy failed — select the text and copy it by hand")
    }
  }

  return (
    <Container className="flex flex-col gap-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Heading level="h3">DSP job pack</Heading>
          <Text size="xsmall" className="text-ui-fg-subtle">Screen + Supacolour positions, laid out for DSP's printIQ and art-proof template.</Text>
        </div>
        <div className="flex gap-2">
          {quoteId ? <Button size="small" variant="transparent" asChild><a href={`/app/quote-pricer?quote=${quoteId}`}>Edit in job pricer</a></Button> : null}
          <Button size="small" variant="secondary" isLoading={loading} onClick={load}>{pack ? "Refresh" : "Prepare"}</Button>
        </div>
      </div>

      {error ? <Text size="small" className="text-ui-fg-error">{error}</Text> : null}
      {pack && !pack.packs.length ? <Text size="small" className="text-ui-fg-subtle">No screen print or Supacolour positions on this job — nothing goes to DSP.</Text> : null}

      {pack && pack.packs.length ? (
        <>
          <Button size="small" variant="primary" asChild className="self-start">
            <a href={`${base}?format=pdf`}>Download art proof PDF ({pack.packs.reduce((n, p) => n + p.pages.length, 0)} pages)</a>
          </Button>
          {pack.packs.map((p) => (
            <div key={p.groupId} className="rounded-md border border-ui-border-base p-3 flex flex-col gap-y-2">
              <Text size="small" weight="plus">{p.title}</Text>
              {p.warnings.length ? (
                <ul className="flex flex-col gap-y-1">
                  {p.warnings.map((w, i) => (
                    <li key={i}><Badge size="2xsmall" color="orange">check</Badge> <span className="text-xs">{w}</span></li>
                  ))}
                </ul>
              ) : null}
              <div className="flex items-center justify-between">
                <Text size="xsmall" className="text-ui-fg-subtle">printIQ job — paste section by section</Text>
                <Button size="small" variant="secondary" onClick={() => copy(p.printiqText)}>Copy</Button>
              </div>
              <Textarea readOnly rows={14} value={p.printiqText} className="font-mono text-xs" />
              <Text size="xsmall" className="text-ui-fg-subtle">Artwork to send DSP</Text>
              <ul className="text-xs flex flex-col gap-y-0.5">
                {p.artwork.map((a, i) => (
                  <li key={i}>
                    {a.position} · design {a.design}:{" "}
                    {a.vectorUrl ? <a className="text-ui-fg-interactive" href={a.vectorUrl} target="_blank" rel="noreferrer">vector file</a> : <span className="text-ui-fg-error">no vector</span>}
                    {a.rasterUrl ? <> · <a className="text-ui-fg-interactive" href={a.rasterUrl} target="_blank" rel="noreferrer">preview image</a></> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      ) : null}
    </Container>
  )
}
