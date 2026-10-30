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

// AsyncStorage runs every write as its own background task, so two writes of
// one key can land in either order and leave an older state on disk (deleting
// eight downloads at once kept five of them). Each key writes one value at a
// time, and only the newest one waiting: the ones in between are already out
// of date. Kept per key, not per store, so two stores on one key can't race.
interface WriteQueue {
  waiting?: string;
  writing: boolean;
}
const queues = new Map<string, WriteQueue>();

async function flush(key: string, queue: WriteQueue): Promise<void> {
  queue.writing = true;
  while (queue.waiting !== undefined) {
    const raw = queue.waiting;
    queue.waiting = undefined;
    try {
      await AsyncStorage.setItem(key, raw);
    } catch {
      // Swallowed like every other storage error; the next save tries again.
    }
  }
  queue.writing = false;
}

function write(key: string, raw: string): void {
  let queue = queues.get(key);
  if (!queue) {
    queue = { writing: false };
    queues.set(key, queue);
  }
  queue.waiting = raw;
  if (!queue.writing) flush(key, queue);
}

export function makePersistence<T>(key: string): Persistence<T> {
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
      const raw: string | undefined = JSON.stringify(value);
      // Nothing to store (undefined); it mustn't replace a newer value waiting.
      if (raw !== undefined) write(key, raw);
    },
  };
}
