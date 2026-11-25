/**
 * Server actions that return `{ error }` instead of throwing (production hides
 * thrown messages). This turns that back into a thrown Error on the client, so
 * existing `.catch((err) => setError(err.message))` code shows the real reason.
 */
export async function orThrow<T>(promise: Promise<T | { error: string }>): Promise<T> {
  const result = await promise
  if (result && typeof result === "object" && "error" in result && typeof (result as { error: unknown }).error === "string") {
    throw new Error((result as { error: string }).error)
  }
  return result as T
}
