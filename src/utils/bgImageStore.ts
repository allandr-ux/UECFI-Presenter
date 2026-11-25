import { useEffect, useState } from 'react';

export interface SavedBgImage {
  id: string;
  name: string;
  dataUrl: string;
  cssValue: string;
  createdAt: number;
}

const DB_NAME = 'uecfi_presenter_bg_db';
const STORE_NAME = 'images';
const DB_VERSION = 1;

const listeners = new Set<(images: SavedBgImage[]) => void>();
let cachedImages: SavedBgImage[] | null = null;

function openBgDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function notifyListeners(images: SavedBgImage[]) {
  cachedImages = images;
  for (const cb of listeners) {
    cb(images);
  }
}

export async function loadSavedBgImages(): Promise<SavedBgImage[]> {
  try {
    const db = await openBgDb();
    const all = await new Promise<SavedBgImage[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as SavedBgImage[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    const sorted = [...all].sort((a, b) => b.createdAt - a.createdAt);
    cachedImages = sorted;
    return sorted;
  } catch {
    return cachedImages ?? [];
  }
}

/**
 * Saves an uploaded background image to IndexedDB (deduplicating by dataUrl)
 * and notifies all active pickers across the app.
 */
export async function saveBgImage(name: string, dataUrl: string): Promise<SavedBgImage> {
  const existing = (cachedImages ?? (await loadSavedBgImages())).find(
    (img) => img.dataUrl === dataUrl
  );
  if (existing) return existing;

  const entry: SavedBgImage = {
    id: `bg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    dataUrl,
    cssValue: `url("${dataUrl}") center/cover no-repeat`,
    createdAt: Date.now()
  };

  try {
    const db = await openBgDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Ignore storage errors gracefully and still update in-memory cache
  }

  const next = [entry, ...(cachedImages ?? [])];
  notifyListeners(next);
  return entry;
}

export async function deleteSavedBgImage(id: string): Promise<void> {
  try {
    const db = await openBgDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Ignore storage errors gracefully
  }

  const next = (cachedImages ?? []).filter((img) => img.id !== id);
  notifyListeners(next);
}

/**
 * React hook for accessing and mutating the shared saved background image library.
 */
export function useSavedBgImages() {
  const [images, setImages] = useState<SavedBgImage[]>(cachedImages ?? []);

  useEffect(() => {
    listeners.add(setImages);
    if (cachedImages === null) {
      loadSavedBgImages().then((loaded) => setImages(loaded));
    } else {
      setImages(cachedImages);
    }
    return () => {
      listeners.delete(setImages);
    };
  }, []);

  return {
    images,
    saveImage: saveBgImage,
    deleteImage: deleteSavedBgImage
  };
}
