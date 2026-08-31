import { google } from "googleapis"

import {
  GOOGLE_DRIVE_JOBS_FOLDER_ID,
  GOOGLE_SERVICE_ACCOUNT_JSON,
} from "../../lib/constants"
// Reused on purpose: buildGoogleJwt centralises the service-account key,
// DWD `subject` (impersonates info@scprints.com.au — folders land owned by
// that user, same as manually created ones), token caching, and the Node-22
// native-fetch transport fix. Directory name says seo-analytics; the helper
// is generic Google auth.
import { buildGoogleJwt } from "../seo-analytics/google-auth"

const SCOPE = "https://www.googleapis.com/auth/drive"
const FOLDER_MIME = "application/vnd.google-apps.folder"

export type JobFolder = {
  id: string
  url: string
  files_id: string
}

export function isDriveConfigured(): boolean {
  return Boolean(GOOGLE_DRIVE_JOBS_FOLDER_ID && GOOGLE_SERVICE_ACCOUNT_JSON)
}

/**
 * Creates a job folder under the configured Jobs parent folder, plus a
 * "Files" subfolder inside it (the artwork drop convention staff already
 * use for manually created job folders).
 */
export async function createJobFolder(name: string): Promise<JobFolder> {
  if (!isDriveConfigured()) {
    throw new Error(
      "Google Drive is not configured — set GOOGLE_DRIVE_JOBS_FOLDER_ID (and GOOGLE_SERVICE_ACCOUNT_JSON)."
    )
  }

  const drive = google.drive({ version: "v3", auth: buildGoogleJwt([SCOPE]) })

  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: FOLDER_MIME,
      parents: [GOOGLE_DRIVE_JOBS_FOLDER_ID!],
    },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  })

  const folderId = folder.data.id
  if (!folderId) {
    throw new Error("Drive folder create returned no id")
  }

  const files = await drive.files.create({
    requestBody: {
      name: "Files",
      mimeType: FOLDER_MIME,
      parents: [folderId],
    },
    fields: "id",
    supportsAllDrives: true,
  })

  return {
    id: folderId,
    url:
      folder.data.webViewLink ??
      `https://drive.google.com/drive/folders/${folderId}`,
    files_id: files.data.id ?? "",
  }
}
