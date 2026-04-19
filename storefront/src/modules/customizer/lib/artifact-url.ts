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

export const extractRenderArtifactUrl = (value: unknown) =>
  typeof value === "string" ? value : null
