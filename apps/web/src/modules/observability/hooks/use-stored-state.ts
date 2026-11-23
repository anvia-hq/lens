import { useCallback, useState } from "react";

const STORAGE_PREFIX = "lens:ui";

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function readStored<T>(key: string, fallback: T, isValid: (value: unknown) => value is T): T {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}:${key}`);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    return isValid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

/**
 * `useState` that persists a UI preference (panel collapsed, sections open) in localStorage.
 * The stored value is read synchronously on first render so the layout never paints the default
 * and then jumps. Unavailable or invalid storage falls back to the default.
 */
export function useStoredState<T>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => readStored(key, fallback, isValid));
  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(`${STORAGE_PREFIX}:${key}`, JSON.stringify(next));
      } catch {
        // Storage can be unavailable; the preference then lasts for this session only.
      }
    },
    [key],
  );
  return [value, update];
}
