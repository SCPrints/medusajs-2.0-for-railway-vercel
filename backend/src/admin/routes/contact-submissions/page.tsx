import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChatBubbleLeftRightSolid } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import { Fragment, useEffect, useState } from "react"

import { HelpTooltip } from "../../components/reports/help-tooltip"
import { buildMailtoUrl, contactFullName } from "../../lib/contact-reply"
import { tinted, NAV_COLOR } from "../../lib/nav-tint"

type Attachment = {
  url: string
  fileName: string
  mimeType: string | null
  bytes: number | null
}

type Submission = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
  phone: string | null
  subject: string | null
  message: string
  source_origin: string | null
  source_ip: string | null
  user_agent: string | null
  attachments: Attachment[] | null
  created_at: string
}

const formatBytes = (bytes: number | null) => {
  if (!bytes) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const ContactSubmissionsPage = () => {
  const [rows, setRows] = useState<Submission[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const refresh = async (q = search) => {
    setLoading(true)
    try {
      const url = q.trim().length
        ? `/admin/contact-submissions?q=${encodeURIComponent(q.trim())}`
        : "/admin/contact-submissions"
      const res = await fetch(url, { credentials: "include" })
      if (!res.ok) throw new Error(await res.text())
      const json = (await res.json()) as {
        submissions: Submission[]
        total: number
      }
      setRows(json.submissions ?? [])
      setTotal(json.total ?? 0)
    } catch (err: any) {
      toast.error(err?.message ?? "Load failed")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reply = (s: Submission) => {
    window.location.href = buildMailtoUrl(s)
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h1" className="flex items-center">
          Contact submissions
          <HelpTooltip
            text={{
              title: "Every contact-form enquiry received",
              body: "Each submission from the storefront contact form is stored here as well as emailed to the contact inbox. Use this when an email was missed, filtered, or deleted — the record is permanent.",
              bullets: [
                "Newest first. Click a row to see the full message, attachments, and where it came from.",
                "Search matches name, email, phone, subject, and the message body.",
                "Reply opens your mail client addressed to the customer — replies are NOT tracked here.",
                "If a genuine enquiry needs quoting, create a Quote so it enters the sales pipeline.",
              ],
            }}
          />
        </Heading>
        <Badge color="grey">
          {rows.length === total ? `${total} total` : `${rows.length} of ${total}`}
        </Badge>
      </div>

      <div className="px-6 py-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[260px]">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void refresh()
            }}
            placeholder="Search name, email, phone, subject or message…"
          />
        </div>
        <Button variant="secondary" onClick={() => void refresh()}>
          Search
        </Button>
        <Button
          variant="transparent"
          onClick={() => {
            setSearch("")
            void refresh("")
          }}
        >
          Clear
        </Button>
      </div>

      <div className="px-6 py-4">
        {loading ? (
          <Text className="text-ui-fg-muted text-sm">Loading…</Text>
        ) : rows.length === 0 ? (
          <Text className="text-ui-fg-muted text-sm">
            {search.trim()
              ? "No submissions match that search."
              : "No contact submissions yet."}
          </Text>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Received</Table.HeaderCell>
                <Table.HeaderCell>From</Table.HeaderCell>
                <Table.HeaderCell>Contact</Table.HeaderCell>
                <Table.HeaderCell>Subject</Table.HeaderCell>
                <Table.HeaderCell></Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.map((s) => {
                const isOpen = expanded === s.id
                const attachments = s.attachments ?? []
                return (
                  <Fragment key={s.id}>
                    <Table.Row
                      className="cursor-pointer"
                      onClick={() => setExpanded(isOpen ? null : s.id)}
                    >
                      <Table.Cell>
                        <Text size="xsmall" className="text-ui-fg-muted">
                          {new Date(s.created_at).toLocaleString()}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text className="font-medium">{contactFullName(s)}</Text>
                        {attachments.length ? (
                          <Badge color="blue" size="2xsmall">
                            {attachments.length} file
                            {attachments.length === 1 ? "" : "s"}
                          </Badge>
                        ) : null}
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="xsmall">{s.email}</Text>
                        <Text size="xsmall" className="text-ui-fg-muted">
                          {s.phone || "—"}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="small">{s.subject || "—"}</Text>
                        {!isOpen ? (
                          <Text
                            size="xsmall"
                            className="text-ui-fg-muted truncate max-w-[380px]"
                          >
                            {s.message}
                          </Text>
                        ) : null}
                      </Table.Cell>
                      <Table.Cell>
                        <Button
                          variant="secondary"
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation()
                            reply(s)
                          }}
                        >
                          Reply
                        </Button>
                      </Table.Cell>
                    </Table.Row>

                    {isOpen ? (
                      <Table.Row>
                        <Table.Cell colSpan={5}>
                          <div className="flex flex-col gap-y-3 py-2">
                            <Text className="whitespace-pre-wrap text-sm">
                              {s.message}
                            </Text>

                            {attachments.length ? (
                              <div className="flex flex-wrap gap-2">
                                {attachments.map((a) => (
                                  <a
                                    key={a.url}
                                    href={a.url}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Badge color="blue">
                                      {a.fileName}
                                      {formatBytes(a.bytes)
                                        ? ` · ${formatBytes(a.bytes)}`
                                        : ""}
                                    </Badge>
                                  </a>
                                ))}
                              </div>
                            ) : null}

                            <Text
                              size="xsmall"
                              className="text-ui-fg-muted break-all"
                            >
                              {s.id} · {s.source_origin || "unknown origin"} ·{" "}
                              {s.source_ip || "no IP"}
                            </Text>
                          </div>
                        </Table.Cell>
                      </Table.Row>
                    ) : null}
                  </Fragment>
                )
              })}
            </Table.Body>
          </Table>
        )}
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Contact submissions",
  icon: tinted(ChatBubbleLeftRightSolid, NAV_COLOR.crm),
  rank: 54,
})

export default ContactSubmissionsPage
