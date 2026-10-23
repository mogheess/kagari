/**
 * Android 13+ asks before an app may post notifications. We ask when the user
 * shows interest in them (turning on background checks, or adding a first
 * title to the library while checks are on), never at launch, and only once
 * unprompted: after that the Profile setting is where they change their mind.
 */
import { PermissionsAndroid, Platform } from 'react-native';
import { makePersistence } from '../store/persist';

const askedStore = makePersistence<boolean>('@kagari/notificationsAsked/v1');

function needsRuntimePermission(): boolean {
  return Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version >= 33;
}

/** Whether the app may post notifications right now. */
export async function notificationsAllowed(): Promise<boolean> {
  if (!needsRuntimePermission()) return true;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
}

/**
 * Asks for the permission if it isn't granted. `unprompted` requests (not a
 * direct tap on a notifications setting) only ever ask once.
 */
export async function requestNotificationPermission(opts?: { unprompted?: boolean }): Promise<boolean> {
  if (!needsRuntimePermission()) return true;
  if (await notificationsAllowed()) return true;
  if (opts?.unprompted && (await askedStore.load())) return false;
  askedStore.save(true);
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}
