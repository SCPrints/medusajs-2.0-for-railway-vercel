import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Switch,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"

export type OrganisationDesign = {
  id: string
  organisation_id: string
  name: string
  code: string | null
  thumbnail_url: string
  print_file_url: string | null
  customizer_metadata: unknown | null
  is_active: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

type Upload = {
  filename: string
  mime_type: string
  data_base64: string
}

const readFileAsBase64 = (file: File): Promise<Upload> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the data: prefix; backend handles either form anyway.
      const base64 = result.replace(/^data:[^;]+;base64,/, "")
      resolve({
        filename: file.name,
        mime_type: file.type || "application/octet-stream",
        data_base64: base64,
      })
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

type EditorState = {
  open: boolean
  editingId: string | null
  name: string
  code: string
  thumbnailUrl: string
  printFileUrl: string
  thumbnailUpload: Upload | null
  printFileUpload: Upload | null
  isActive: boolean
  saving: boolean
}

const emptyEditor = (): EditorState => ({
  open: false,
  editingId: null,
  name: "",
  code: "",
  thumbnailUrl: "",
  printFileUrl: "",
  thumbnailUpload: null,
  printFileUpload: null,
  isActive: true,
  saving: false,
})

type Props = {
  organisationId: string
  onCountChange?: (count: number) => void
}

const DesignsTab = ({ organisationId, onCountChange }: Props) => {
  const [designs, setDesigns] = useState<OrganisationDesign[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [editor, setEditor] = useState<EditorState>(emptyEditor())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/admin/organisations/${organisationId}/designs`,
        { credentials: "include" }
      )
      if (!res.ok) throw new Error(await res.text())
      const json = (await res.json()) as { designs?: OrganisationDesign[] }
      const list = json.designs ?? []
      setDesigns(list)
      onCountChange?.(list.filter((d) => d.is_active).length)
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to load designs")
    } finally {
      setLoading(false)
    }
  }, [organisationId, onCountChange])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = () => {
    setEditor({ ...emptyEditor(), open: true })
  }

  const openEdit = (d: OrganisationDesign) => {
    setEditor({
      open: true,
      editingId: d.id,
      name: d.name,
      code: d.code ?? "",
      thumbnailUrl: d.thumbnail_url,
      printFileUrl: d.print_file_url ?? "",
      thumbnailUpload: null,
      printFileUpload: null,
      isActive: d.is_active,
      saving: false,
    })
  }

  const closeEditor = () => setEditor(emptyEditor())

  const submitEditor = async () => {
    if (!editor.name.trim()) {
      toast.error("Name required")
      return
    }
    if (!editor.editingId) {
      if (!editor.thumbnailUrl && !editor.thumbnailUpload) {
        toast.error("Thumbnail (URL or upload) required")
        return
      }
    }

    setEditor((e) => ({ ...e, saving: true }))

    const body: Record<string, unknown> = {
      name: editor.name.trim(),
      code: editor.code.trim() || null,
      is_active: editor.isActive,
    }

    if (editor.thumbnailUpload) {
      body.thumbnail_upload = editor.thumbnailUpload
    } else if (editor.thumbnailUrl) {
      body.thumbnail_url = editor.thumbnailUrl
    }

    if (editor.printFileUpload) {
      body.print_file_upload = editor.printFileUpload
    } else if (editor.printFileUrl) {
      body.print_file_url = editor.printFileUrl
    } else if (editor.editingId) {
      body.print_file_url = null
    }

    const url = editor.editingId
      ? `/admin/organisations/${organisationId}/designs/${editor.editingId}`
      : `/admin/organisations/${organisationId}/designs`

    try {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success(editor.editingId ? "Design updated" : "Design created")
      closeEditor()
      await load()
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed")
      setEditor((e) => ({ ...e, saving: false }))
    }
  }

  const handleFileChange = async (
    field: "thumbnail" | "print",
    file: File | null
  ) => {
    if (!file) return
    try {
      const upload = await readFileAsBase64(file)
      setEditor((e) => ({
        ...e,
        ...(field === "thumbnail"
          ? { thumbnailUpload: upload }
          : { printFileUpload: upload }),
      }))
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to read file")
    }
  }

  const deactivate = async (d: OrganisationDesign) => {
    if (
      !window.confirm(
        `Deactivate ${d.name}? It will stop appearing in pickers but inventory rows remain intact.`
      )
    )
      return
    try {
      await fetch(
        `/admin/organisations/${organisationId}/designs/${d.id}`,
        { method: "DELETE", credentials: "include" }
      )
      toast.success("Deactivated")
      await load()
    } catch {
      toast.error("Deactivate failed")
    }
  }

  const visible = showInactive
    ? designs
    : designs.filter((d) => d.is_active)

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex items-center justify-between">
        <Text size="small" className="text-ui-fg-subtle">
          Pre-approved artwork for this organisation. Used by the fulfillment
          order entry form to populate the design picker.
        </Text>
        <div className="flex items-center gap-x-2">
          <Switch
            id="show-inactive-designs"
            checked={showInactive}
            onCheckedChange={setShowInactive}
          />
          <Label htmlFor="show-inactive-designs" size="xsmall">
            Show inactive
          </Label>
          <Button size="small" onClick={openCreate}>
            + Add design
          </Button>
        </div>
      </div>

      {editor.open ? (
        <Container className="border border-ui-border-base p-4 flex flex-col gap-y-3">
          <Heading level="h3" className="text-base">
            {editor.editingId ? "Edit design" : "New design"}
          </Heading>
          <div className="grid grid-cols-1 small:grid-cols-2 gap-3">
            <div>
              <Label size="xsmall">Name *</Label>
              <Input
                value={editor.name}
                onChange={(e) =>
                  setEditor((s) => ({ ...s, name: e.target.value }))
                }
                placeholder="Lifegrain Logo White"
              />
            </div>
            <div>
              <Label size="xsmall">Code</Label>
              <Input
                value={editor.code}
                onChange={(e) =>
                  setEditor((s) => ({ ...s, code: e.target.value }))
                }
                placeholder="LG-WHITE-A"
              />
            </div>
            <div className="small:col-span-2">
              <Label size="xsmall">Thumbnail</Label>
              <div className="flex items-center gap-x-2">
                <Input
                  placeholder="Paste URL OR pick file →"
                  value={
                    editor.thumbnailUpload
                      ? `[uploading ${editor.thumbnailUpload.filename}]`
                      : editor.thumbnailUrl
                  }
                  onChange={(e) =>
                    setEditor((s) => ({
                      ...s,
                      thumbnailUrl: e.target.value,
                      thumbnailUpload: null,
                    }))
                  }
                  disabled={!!editor.thumbnailUpload}
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    handleFileChange("thumbnail", e.target.files?.[0] ?? null)
                  }
                  className="text-xs"
                />
              </div>
              {editor.thumbnailUrl && !editor.thumbnailUpload ? (
                <img
                  src={editor.thumbnailUrl}
                  alt=""
                  className="mt-2 h-20 w-20 object-contain rounded border border-ui-border-base"
                />
              ) : null}
            </div>
            <div className="small:col-span-2">
              <Label size="xsmall">Print file</Label>
              <div className="flex items-center gap-x-2">
                <Input
                  placeholder="Paste URL OR pick file →"
                  value={
                    editor.printFileUpload
                      ? `[uploading ${editor.printFileUpload.filename}]`
                      : editor.printFileUrl
                  }
                  onChange={(e) =>
                    setEditor((s) => ({
                      ...s,
                      printFileUrl: e.target.value,
                      printFileUpload: null,
                    }))
                  }
                  disabled={!!editor.printFileUpload}
                />
                <input
                  type="file"
                  accept="image/*,application/pdf,.svg,.eps,.ai"
                  onChange={(e) =>
                    handleFileChange("print", e.target.files?.[0] ?? null)
                  }
                  className="text-xs"
                />
              </div>
              <Text size="xsmall" className="text-ui-fg-muted mt-1">
                Production-ready artwork. Stamped on print tasks so operators
                know exactly what to print.
              </Text>
            </div>
            <div className="flex items-end gap-x-2 small:col-span-2">
              <Switch
                id="design-active"
                checked={editor.isActive}
                onCheckedChange={(v) =>
                  setEditor((s) => ({ ...s, isActive: v }))
                }
              />
              <Label htmlFor="design-active">Active</Label>
            </div>
          </div>
          <div className="flex justify-end gap-x-2">
            <Button
              size="small"
              variant="secondary"
              onClick={closeEditor}
              disabled={editor.saving}
            >
              Cancel
            </Button>
            <Button
              size="small"
              onClick={submitEditor}
              disabled={editor.saving}
            >
              {editor.saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </Container>
      ) : null}

      {loading ? (
        <Text className="text-ui-fg-muted text-sm">Loading designs…</Text>
      ) : visible.length === 0 ? (
        <Container className="flex flex-col items-center gap-y-2 py-8 bg-ui-bg-subtle/40">
          <Text className="text-ui-fg-muted text-sm">No designs yet.</Text>
          <Text size="xsmall" className="text-ui-fg-muted">
            Click "+ Add design" to upload artwork.
          </Text>
        </Container>
      ) : (
        <div className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-3">
          {visible.map((d) => (
            <div
              key={d.id}
              className={`border border-ui-border-base rounded p-3 flex flex-col gap-y-2 hover:border-ui-border-strong transition ${d.is_active ? "" : "opacity-50"}`}
            >
              <div className="aspect-square bg-ui-bg-subtle rounded overflow-hidden flex items-center justify-center">
                {d.thumbnail_url ? (
                  <img
                    src={d.thumbnail_url}
                    alt={d.name}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <Text size="xsmall" className="text-ui-fg-muted">
                    (no thumbnail)
                  </Text>
                )}
              </div>
              <div className="flex items-start justify-between gap-x-1">
                <div className="flex-1 min-w-0">
                  <Text weight="plus" size="small" className="truncate">
                    {d.name}
                  </Text>
                  {d.code ? (
                    <Text
                      size="xsmall"
                      className="text-ui-fg-muted truncate"
                    >
                      {d.code}
                    </Text>
                  ) : null}
                </div>
                {d.is_active ? null : (
                  <Badge size="2xsmall" color="grey">
                    Inactive
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-x-2">
                <Button
                  size="small"
                  variant="secondary"
                  onClick={() => openEdit(d)}
                  className="flex-1"
                >
                  Edit
                </Button>
                {d.is_active ? (
                  <button
                    type="button"
                    onClick={() => deactivate(d)}
                    className="text-xs text-rose-600 hover:underline"
                  >
                    Deactivate
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default DesignsTab
