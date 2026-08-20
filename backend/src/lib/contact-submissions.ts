import { Pool } from "pg"

import { DATABASE_URL } from "./constants"

/**
 * `contact_submissions` predates the module system — it's a plain table created
 * on demand rather than by a Medusa migration. Both the public write path
 * (/contact) and the admin read path (/admin/contact-submissions) go through
 * here so the schema is guaranteed present before EITHER touches it: on a
 * backend whose last deploy predates a column, a read that ran first would
 * otherwise 500 on the missing column.
 */

const pool = new Pool({ connectionString: DATABASE_URL })

let ensurePromise: Promise<void> | null = null

export type ContactAttachment = {
  url: string
  fileName: string
  mimeType: string | null
  bytes: number | null
}

export type ContactSubmissionInput = {
  id: string
  firstName: string | null
  lastName: string | null
  email: string
  phone: string
  subject: string | null
  message: string
  sourceOrigin: string | null
  sourceIp: string | null
  userAgent: string | null
  attachments: ContactAttachment[]
}

export type ContactSubmissionRow = {
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
  attachments: ContactAttachment[] | null
  created_at: string
}

export async function ensureContactSubmissionsTable() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS contact_submissions (
          id TEXT PRIMARY KEY,
          first_name TEXT,
          last_name TEXT,
          email TEXT NOT NULL,
          phone TEXT,
          subject TEXT,
          message TEXT NOT NULL,
          source_origin TEXT,
          source_ip TEXT,
          user_agent TEXT,
          attachments JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      // Back-fill columns on databases whose table predates them.
      await pool.query(`ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS attachments JSONB`)
      await pool.query(`ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS phone TEXT`)
    })()
  }

  await ensurePromise
}

export async function createContactSubmission(input: ContactSubmissionInput) {
  await ensureContactSubmissionsTable()

  await pool.query(
    `
      INSERT INTO contact_submissions (
        id,
        first_name,
        last_name,
        email,
        phone,
        subject,
        message,
        source_origin,
        source_ip,
        user_agent,
        attachments
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    [
      input.id,
      input.firstName,
      input.lastName,
      input.email,
      input.phone,
      input.subject,
      input.message,
      input.sourceOrigin,
      input.sourceIp,
      input.userAgent,
      input.attachments.length ? JSON.stringify(input.attachments) : null,
    ]
  )
}

// One predicate over every human-readable column — staff search "who contacted
// us about hoodies", not "search the subject column".
const SEARCH_SQL = `(
  coalesce(first_name, '') || ' ' ||
  coalesce(last_name, '') || ' ' ||
  email || ' ' ||
  coalesce(phone, '') || ' ' ||
  coalesce(subject, '') || ' ' ||
  message
) ILIKE $1`

export async function listContactSubmissions({
  q,
  limit,
}: {
  q: string
  limit: number
}): Promise<{ rows: ContactSubmissionRow[]; total: number }> {
  await ensureContactSubmissionsTable()

  const rows = q
    ? await pool.query(
        `SELECT * FROM contact_submissions WHERE ${SEARCH_SQL} ORDER BY created_at DESC LIMIT $2`,
        [`%${q}%`, limit]
      )
    : await pool.query(
        `SELECT * FROM contact_submissions ORDER BY created_at DESC LIMIT $1`,
        [limit]
      )

  const totalResult = await pool.query(`SELECT COUNT(*)::int AS total FROM contact_submissions`)

  return {
    rows: rows.rows as ContactSubmissionRow[],
    total: Number(totalResult.rows[0]?.total ?? 0),
  }
}
