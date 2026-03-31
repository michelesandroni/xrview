import { isTauri } from "@tauri-apps/api/core";

interface TauriStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
  delete(key: string): Promise<boolean>;
}

let tauriStore: TauriStore | null = null;

async function getTauriStore(): Promise<TauriStore> {
  if (!tauriStore) {
    const { Store } = await import("@tauri-apps/plugin-store");
    tauriStore = await Store.load("xrview.json");
  }
  return tauriStore!;
}

export async function storageGet<T>(key: string): Promise<T | null> {
  if (isTauri()) {
    const store = await getTauriStore();
    const val = await store.get<T>(key);
    return val ?? null;
  }
  const raw = localStorage.getItem(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function storageSet(key: string, value: unknown): Promise<void> {
  if (isTauri()) {
    const store = await getTauriStore();
    await store.set(key, value);
    await store.save();
    return;
  }
  localStorage.setItem(key, JSON.stringify(value));
}
