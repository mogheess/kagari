/**
 * Tiny AsyncStorage wrapper. Each store owns its own in-memory state and merge
 * semantics; this just centralizes the (de)serialization + error swallowing so a
 * corrupt/missing key never crashes the app.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Persistence<T> {
  load: () => Promise<T | null>;
  save: (value: T) => void;
}

export function makePersistence<T>(key: string): Persistence<T> {
  // AsyncStorage runs every write as its own background task, so two writes of
  // one key can land in either order and leave an older state on disk (deleting
  // eight downloads at once kept five of them). One write at a time, and only
  // the newest value waiting: the ones in between are already out of date.
  let waiting: string | undefined;
  let writing = false;

  const flush = async () => {
    writing = true;
    while (waiting !== undefined) {
      const raw = waiting;
      waiting = undefined;
      try {
        await AsyncStorage.setItem(key, raw);
      } catch {
        // Swallowed like every other storage error; the next save tries again.
      }
    }
    writing = false;
  };

  return {
    load: async () => {
      try {
        const raw = await AsyncStorage.getItem(key);
        return raw != null ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    },
    save: (value: T) => {
      waiting = JSON.stringify(value);
      if (!writing) flush();
    },
  };
}
