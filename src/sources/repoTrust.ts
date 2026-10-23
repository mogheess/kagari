/**
 * Keeps native's record of repo signing keys in step with the repos the app
 * just fetched, so an extension signed by one of the user's repos loads
 * without a trust prompt. Called wherever the catalogue is fetched.
 */
import { getEngine } from '../engine';
import { repoSigningKeys } from '../engine/repoClient';
import { refreshSources } from './sourcesStore';
import type { AvailableExtensionDto } from '../engine/types';

/** Resolves true when trust changed (extensions were reloaded and sources refreshed). */
export async function syncRepoSigningKeys(
  available: readonly AvailableExtensionDto[],
): Promise<boolean> {
  const keys = repoSigningKeys(available);
  if (Object.keys(keys).length === 0) return false;
  try {
    const changed = await getEngine().setRepoSigningKeys(keys);
    if (changed) await refreshSources();
    return changed;
  } catch {
    return false;
  }
}
