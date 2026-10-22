import { Badge, Button, Container, Heading, Input, Text, Textarea, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

import type { DspGroupPack } from "../../../lib/dsp-job"

type Pack = {
  po: string
  customer: string
  due_date: string | null
  default_to: string | null
  sent: Array<{ at: string; to: string; by: string | null }>
  packs: DspGroupPack[]
}

const fmtWhen = (iso: string) => {
  const d = new Date(iso)
  return `${d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} ${d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}`
}

/**
 * Send to DSP (lib/dsp-job.ts): everything comes off the order — garment,
 * sizes, print positions, colours, artwork. Staff check it, then send: DSP
 * gets a short job email with the art proof PDF (their own template) and
 * the artwork files attached. Their reply lands on the job.
 */
export function DspPackPanel({ jobId }: { jobId: string }) {
  const [pack, setPack] = useState<Pack | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [to, setTo] = useState("")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const base = `/admin/jobs/${encodeURIComponent(jobId)}/dsp-pack`

  useEffect(() => {
    let live = true
    fetch(base, { credentials: "include" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error ?? `Failed (${res.status})`)
        if (!live) return
        setPack(json as Pack)
        setTo((json as Pack).default_to ?? "")
      })
      .catch((err) => live && setError(err?.message ?? "Couldn't build the DSP job"))
    return () => {
      live = false
    }
  }, [base])

  const send = async () => {
    setSending(true)
    try {
      const res = await fetch(base, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim(), message: message.trim() || undefined }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? `Send failed (${res.status})`)
      setPack((p) => (p ? { ...p, sent: json.sent ?? p.sent } : p))
      toast.success(`Sent to ${to.trim()}`)
    } catch (err: any) {
      toast.error(err?.message ?? "Send failed")
    } finally {
      setSending(false)
    }
  }

  if (error) {
    return (
      <Container><Text size="small" className="text-ui-fg-subtle">DSP: {error}</Text></Container>
    )
  }
  if (!pack) {
    return (
      <Container><Text size="small" className="text-ui-fg-subtle">Building DSP job…</Text></Container>
    )
  }
  if (!pack.packs.length) return null // nothing on this order goes to DSP

  const pages = pack.packs.reduce((n, p) => n + p.pages.length, 0)
  const last = pack.sent.at(-1)
  return (
    <Container className="flex flex-col gap-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Heading level="h3">Send to DSP</Heading>
          <Text size="xsmall" className="text-ui-fg-subtle">
            Screen print / Supacolour work on this order, laid out for DSP's printIQ and art-proof template.
          </Text>
        </div>
        {last ? <Badge size="2xsmall" color="green">Sent {fmtWhen(last.at)} to {last.to}</Badge> : <Badge size="2xsmall" color="orange">Not sent</Badge>}
      </div>

      {pack.packs.map((p) => (
        <div key={p.groupId} className="rounded-md border border-ui-border-base p-3 flex flex-col gap-y-2">
          <Text size="small" weight="plus">{p.title}</Text>
          <Text size="xsmall" className="text-ui-fg-subtle">{p.sizesText}</Text>
          <ul className="text-xs flex flex-col gap-y-1">
            {p.pages.map((pg, i) => (
              <li key={pg.side} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{pg.positionLabel}</span>
                <span className="text-ui-fg-subtle">{pg.method === "screen" ? `${pg.inks.join(", ")} · ${pg.screens} screens` : "Supacolour transfer"}</span>
                <span className="text-ui-fg-subtle">· {pg.printSize ? `${pg.printSize.widthMm} × ${pg.printSize.heightMm} mm` : "size from artwork"}</span>
                {p.artwork[i]?.url ? (
                  <a className="text-ui-fg-interactive" href={p.artwork[i].url!} target="_blank" rel="noreferrer">· artwork ({p.artwork[i].name.split(".").pop()})</a>
                ) : null}
              </li>
            ))}
          </ul>
          {p.warnings.length ? (
            <ul className="flex flex-col gap-y-0.5">
              {p.warnings.map((w, i) => <li key={i} className="text-xs text-ui-fg-subtle">⚠ {w}</li>)}
            </ul>
          ) : null}
        </div>
      ))}

      <Button size="small" variant="secondary" className="self-start" asChild><a href={`${base}?format=pdf`}>Preview art proof ({pages} page{pages === 1 ? "" : "s"})</a></Button>

      <div className="flex flex-col gap-y-2 border-t border-ui-border-base pt-3">
        <Input size="small" type="email" placeholder="DSP's email address" value={to} onChange={(e) => setTo(e.target.value)} />
        <Textarea rows={2} placeholder="Note to DSP (optional)" value={message} onChange={(e) => setMessage(e.target.value)} />
        <Button size="small" variant="primary" className="self-start" isLoading={sending} disabled={!to.trim()} onClick={send}>
          {last ? "Send to DSP again" : "Send to DSP"}
        </Button>
      </div>
    </Container>
  )
}
