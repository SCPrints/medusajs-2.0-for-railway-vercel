const DATA_URL_PREFIX = "data:"

export const normalizePersistedArtifactUrl = (url: string | null | undefined) => {
  if (typeof url !== "string" || !url.trim()) {
    return null
  }

  const normalizedUrl = url.trim()
  if (
    normalizedUrl.startsWith(DATA_URL_PREFIX) ||
    normalizedUrl === "null" ||
    normalizedUrl === "undefined"
  ) {
    return null
  }

  return normalizedUrl
}

/**
 * Reads `url` from render API JSON; ignores string "null" / empty; supports nested `{ url }`.
 */
export const extractRenderArtifactUrl = (value: unknown): string | null => {
  if (typeof value === "string") {
    const t = value.trim()
    if (!t || t === "null" || t === "undefined") {
      return null
    }
    return t
  }
  if (value && typeof value === "object" && value !== null && "url" in value) {
    return extractRenderArtifactUrl((value as { url: unknown }).url)
  }
  return null
}
