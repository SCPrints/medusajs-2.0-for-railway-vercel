import { Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Setup → Supplier documents. SC Prints' own paperwork (ABN certificate,
 * insurance certificate, modern slavery statement…) uploaded once; every
 * signed-in customer can download it from their account → Documents.
 */
type Doc = { id: string; title: string; url: string; updated_at: string }

const api = async (path: string, init?: RequestInit) => {
  const res = await fetch(path, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init })
  const body = (await res.json().catch(() => ({}))) as any
  if (!res.ok) throw new Error(body?.error ?? body?.message ?? `Request failed (${res.status})`)
  return body
}

const upload = async (file: File): Promise<string> => {
  const fd = new FormData()
  fd.append("files", file)
  const res = await fetch("/admin/uploads", { method: "POST", credentials: "include", body: fd })
  if (!res.ok) throw new Error(`Upload failed (${res.status})`)
  const url = ((await res.json()) as { files?: Array<{ url?: string }> })?.files?.[0]?.url
  if (!url) throw new Error("Upload returned no URL")
  return url
}

const SupplierDocumentsPage = () => {
  const [docs, setDocs] = useState<Doc[]>([])
  const [title, setTitle] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const newFile = useRef<HTMLInputElement>(null)
  const replaceFile = useRef<HTMLInputElement>(null)
  const replaceId = useRef<string | null>(null)

  const load = useCallback(
    () => api("/admin/supplier-documents").then((b) => setDocs(b.documents ?? [])).catch((e) => toast.error(e.message)),
    []
  )
  useEffect(() => {
    void load()
  }, [load])

  const run = async (key: string, work: () => Promise<void>, done: string) => {
    setBusy(key)
    try {
      await work()
      toast.success(done)
      await load()
    } catch (e: any) {
      toast.error(e?.message ?? "Something went wrong")
    } finally {
      setBusy(null)
    }
  }

  const add = () => {
    const file = newFile.current?.files?.[0]
    if (!title.trim() || !file) return toast.error("Give it a name and choose a file")
    void run(
      "add",
      async () => {
        await api("/admin/supplier-documents", { method: "POST", body: JSON.stringify({ title: title.trim(), url: await upload(file) }) })
        setTitle("")
        if (newFile.current) newFile.current.value = ""
      },
      "Document added"
    )
  }

  const replace = (file: File | undefined) => {
    const id = replaceId.current
    if (!id || !file) return
    void run(id, async () => {
      await api(`/admin/supplier-documents/${id}`, { method: "POST", body: JSON.stringify({ url: await upload(file) }) })
    }, "File replaced")
    if (replaceFile.current) replaceFile.current.value = ""
  }

  const remove = (d: Doc) => {
    if (!window.confirm(`Remove "${d.title}"? Customers will no longer see it.`)) return
    void run(d.id, async () => {
      await api(`/admin/supplier-documents/${d.id}`, { method: "DELETE" })
    }, "Document removed")
  }

  return (
    <Container className="flex flex-col gap-y-4">
      <div>
        <Heading level="h1">Supplier documents</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Our own documents that customers ask for: ABN certificate, insurance certificate, modern slavery statement. Signed-in
          customers download them from their account under Documents.
        </Text>
        <Text size="small" className="mt-1">
          <a href="/admin/supplier-documents/supplier-pack" download className="text-ui-fg-interactive hover:underline">
            Download our supplier details (PDF)
          </a>{" "}
          — ABN, address, bank details and links to these documents, for a new customer&apos;s accounts team.
        </Text>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-ui-border-base p-3">
        <div className="min-w-[14rem] flex-1">
          <Text size="xsmall" className="mb-1 text-ui-fg-subtle">Name customers see</Text>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Insurance certificate of currency" maxLength={200} />
        </div>
        <input ref={newFile} type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" className="text-sm" aria-label="File" />
        <Button onClick={add} isLoading={busy === "add"}>Add document</Button>
      </div>

      <input ref={replaceFile} type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" className="hidden" onChange={(e) => replace(e.target.files?.[0])} />

      {docs.length === 0 ? (
        <Text size="small" className="text-ui-fg-subtle">No documents yet.</Text>
      ) : (
        <ul className="divide-y divide-ui-border-base rounded-lg border border-ui-border-base">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <a href={d.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-ui-fg-interactive hover:underline">
                  {d.title}
                </a>
                <Text size="xsmall" className="text-ui-fg-subtle">Updated {new Date(d.updated_at).toLocaleDateString("en-AU")}</Text>
              </div>
              <div className="flex gap-2">
                <Button
                  size="small"
                  variant="secondary"
                  isLoading={busy === d.id}
                  onClick={() => {
                    replaceId.current = d.id
                    replaceFile.current?.click()
                  }}
                >
                  Replace file
                </Button>
                <Button size="small" variant="danger" disabled={busy === d.id} onClick={() => remove(d)}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Container>
  )
}

export default SupplierDocumentsPage
