/**
 * Community links surfaced in Settings.
 *
 * Each entry is only rendered when its URL is filled in, so an unset link never
 * ships as a dead row the user can tap.
 */

/**
 * Discord invite for the Kagari community.
 *
 * Paste the invite here (e.g. 'https://discord.gg/xxxxxxx') to make the row
 * appear under Community in Settings. Leave empty to hide it.
 */
export const DISCORD_INVITE_URL = '';

/** Whether any community link is configured. */
export function hasCommunityLinks(): boolean {
  return DISCORD_INVITE_URL.trim().length > 0;
}
