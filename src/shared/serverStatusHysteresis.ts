/** Delay between the first offline probe and the confirming probe (online → offline). */
export const OFFLINE_CONFIRM_DELAY_MS = 5000

/**
 * Online → offline only after a second offline probe. Online updates apply immediately.
 * First-seen offline (no prior online display) also applies immediately.
 */
export function shouldConfirmOffline(
  displayedOnline: boolean | undefined,
  probedOnline: boolean
): boolean {
  return displayedOnline === true && !probedOnline
}
