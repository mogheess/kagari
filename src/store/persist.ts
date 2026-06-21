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
      AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});
    },
  };
}
