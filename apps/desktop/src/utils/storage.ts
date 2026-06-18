export const getStoredValue = (key: string): string | null => {
  if (typeof window === 'undefined') return null;

  const nativeValue = window.shob?.storage.getItem(undefined, key);
  if (nativeValue !== null && nativeValue !== undefined) {
    try {
      window.localStorage.setItem(key, nativeValue);
    } catch {
      // localStorage is only a compatibility mirror.
    }
    return nativeValue;
  }

  let legacyValue: string | null = null;
  try {
    legacyValue = window.localStorage.getItem(key);
  } catch {
    legacyValue = null;
  }

  if (legacyValue !== null) {
    void window.shob?.storage.setItem(undefined, key, legacyValue).catch(() => undefined);
  }

  return legacyValue;
};

export const setStoredValue = (key: string, value: string | null): void => {
  if (typeof window === 'undefined') return;

  try {
    if (value !== null) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Native storage is the source of truth in Electron.
  }

  const storage = window.shob?.storage;
  if (!storage) return;

  const op = value !== null
    ? storage.setItem(undefined, key, value)
    : storage.removeItem(undefined, key);
  void op.catch(() => undefined);
};
