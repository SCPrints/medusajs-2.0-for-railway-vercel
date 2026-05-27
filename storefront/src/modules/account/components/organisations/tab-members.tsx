"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  inviteOrganisationMember,
  removeOrganisationMember,
  updateOrganisationMemberRole,
  type OrgMember,
  type OrgRole,
} from "@lib/data/organisations"

type Props = {
  orgId: string
  members: OrgMember[]
  meCustomerId: string
}

const ROLE_OPTIONS: OrgRole[] = ["owner", "purchaser", "viewer"]
const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Owner",
  purchaser: "Purchaser",
  viewer: "Viewer",
}

export default function MembersTab({ orgId, members, meCustomerId }: Props) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<OrgRole>("purchaser")
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err"
    text: string
  } | null>(null)

  const ownerCount = members.filter((m) => m.role === "owner").length

  function refresh() {
    startTransition(() => router.refresh())
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setFeedback(null)
    const res = await inviteOrganisationMember(orgId, {
      email: inviteEmail.trim().toLowerCase(),
      role: inviteRole,
    })
    if (res.ok) {
      setInviteEmail("")
      setInviteRole("purchaser")
      setFeedback({ kind: "ok", text: "Member added." })
      refresh()
    } else {
      setFeedback({ kind: "err", text: res.error })
    }
  }

  async function handleRoleChange(memberId: string, role: OrgRole) {
    setFeedback(null)
    const res = await updateOrganisationMemberRole(orgId, memberId, role)
    if (res.ok) {
      setFeedback({ kind: "ok", text: "Role updated." })
      refresh()
    } else {
      setFeedback({ kind: "err", text: res.error })
    }
  }

  async function handleRemove(memberId: string, label: string) {
    if (!confirm(`Remove ${label} from this organisation?`)) return
    setFeedback(null)
    const res = await removeOrganisationMember(orgId, memberId)
    if (res.ok) {
      setFeedback({ kind: "ok", text: "Member removed." })
      refresh()
    } else {
      setFeedback({ kind: "err", text: res.error })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Invite form */}
      <section className="rounded-2xl border border-ui-border-base bg-white p-5">
        <h2 className="text-sm font-semibold text-ui-fg-base">
          Invite a member
        </h2>
        <p className="mt-1 text-xs text-ui-fg-muted">
          They must already have an SC Prints account with this email. Ask
          them to register first if they haven&apos;t.
        </p>
        <form
          onSubmit={handleInvite}
          className="mt-4 flex flex-col gap-3 phone:flex-row phone:items-end"
        >
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ui-fg-subtle">
              Email
            </span>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="alex@example.com"
              className="rounded-md border border-ui-border-base bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)]/40 min-h-11"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ui-fg-subtle">
              Role
            </span>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as OrgRole)}
              className="rounded-md border border-ui-border-base bg-white px-2 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)]/40 min-h-11"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={busy || !inviteEmail.trim()}
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--brand-secondary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-secondary)]/90 disabled:cursor-not-allowed disabled:opacity-50 min-h-11"
          >
            Invite
          </button>
        </form>
        {feedback ? (
          <p
            className={`mt-3 text-sm ${
              feedback.kind === "ok" ? "text-emerald-700" : "text-rose-700"
            }`}
            role="status"
          >
            {feedback.text}
          </p>
        ) : null}
      </section>

      {/* Members list */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]/80">
          Members ({members.length})
        </h2>
        <ul className="mt-3 divide-y divide-ui-border-base rounded-2xl border border-ui-border-base bg-white">
          {members.map((m) => {
            const isMe = m.customer_id === meCustomerId
            const isLastOwner = m.role === "owner" && ownerCount === 1
            const label =
              [m.customer?.first_name, m.customer?.last_name]
                .filter(Boolean)
                .join(" ")
                .trim() ||
              m.customer?.email ||
              m.customer_id
            return (
              <li
                key={m.id}
                className="flex flex-col gap-3 px-5 py-4 phone:flex-row phone:items-center phone:justify-between"
              >
                <div className="flex flex-col">
                  <p className="text-sm font-semibold text-ui-fg-base">
                    {label}{" "}
                    {isMe ? (
                      <span className="ml-1 inline-block rounded bg-ui-bg-subtle px-1.5 py-0.5 text-[10px] font-semibold text-ui-fg-muted">
                        You
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-ui-fg-muted">
                    {m.customer?.email ?? m.customer_id}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-ui-fg-subtle">
                    <span className="font-semibold uppercase tracking-[0.08em]">
                      Role
                    </span>
                    <select
                      value={m.role}
                      onChange={(e) =>
                        handleRoleChange(m.id, e.target.value as OrgRole)
                      }
                      disabled={busy || (isLastOwner && m.role === "owner")}
                      className="rounded-md border border-ui-border-base bg-white px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)]/40 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleRemove(m.id, label)}
                    disabled={busy || isLastOwner}
                    className="rounded-full border border-ui-border-base px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 min-h-11"
                    title={
                      isLastOwner
                        ? "Promote another member to owner first"
                        : "Remove from organisation"
                    }
                  >
                    Remove
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
