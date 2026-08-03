const cache = new Map<string, Promise<string | null>>()

/** Shared Ely.by skin fetch (data URL), keyed by lowercase username. */
export function getElybySkinDataUrl(username: string): Promise<string | null> {
  const key = username.trim().toLowerCase()
  if (!key) return Promise.resolve(null)

  let pending = cache.get(key)
  if (!pending) {
    pending = window.awesomeAPI
      .fetchElybySkin(key)
      .then((dataUrl) => dataUrl || null)
      .catch(() => null)
    cache.set(key, pending)
  }
  return pending
}
