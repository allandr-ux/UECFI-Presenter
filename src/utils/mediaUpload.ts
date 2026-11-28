import type { ProgramItem } from '../../shared/types';

/**
 * Saves a user-selected image or audio file to the Electron app's disk media directory
 * and returns an HTTP URL served by the local presenter server.
 */
export async function saveUserMediaFile(file: File): Promise<string> {
  if (!window.presenterAPI) {
    throw new Error('Electron presenterAPI is unavailable.');
  }
  const buffer = await file.arrayBuffer();
  const saved = await window.presenterAPI.saveMediaFile(file.name, new Uint8Array(buffer));
  return saved.url;
}

function uint8ToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Collects all `uecfi-media://local/<fileName>` assets (images, backgrounds, 3D models, audio)
 * referenced by `data` and encodes them as base64 for portable JSON export.
 */
export async function bundleLocalMediaForExport<T = ProgramItem[]>(
  data: T
): Promise<Record<string, string>> {
  const serialized = JSON.stringify(data);
  const matches = serialized.matchAll(/uecfi-media:\/\/local\/([a-zA-Z0-9._-]+)/g);
  const fileNames = new Set<string>();
  for (const m of matches) {
    if (m[1]) fileNames.add(m[1]);
  }

  const bundle: Record<string, string> = {};
  for (const fileName of fileNames) {
    try {
      const res = await fetch(`uecfi-media://local/${fileName}`);
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      bundle[fileName] = uint8ToBase64(bytes);
    } catch {
      // Skip missing or unreadable local file
    }
  }
  return bundle;
}

/**
 * Restores any bundled `mediaAssets` from an imported JSON payload into the
 * local machine's media directory and remaps `uecfi-media://local/...` URLs.
 */
export async function restoreBundledMediaOnImport<T = ProgramItem[]>(
  data: T,
  mediaAssets: unknown
): Promise<T> {
  if (!mediaAssets || typeof mediaAssets !== 'object' || !window.presenterAPI?.saveMediaFile) {
    return data;
  }

  const urlMap = new Map<string, string>();
  for (const [fileName, b64] of Object.entries(mediaAssets as Record<string, unknown>)) {
    if (typeof b64 !== 'string' || !b64) continue;
    try {
      const bytes = base64ToUint8(b64);
      const saved = await window.presenterAPI.saveMediaFile(fileName, bytes);
      urlMap.set(`uecfi-media://local/${fileName}`, saved.url);
    } catch {
      // Skip malformed asset entry
    }
  }

  if (urlMap.size === 0) return data;
  let serialized = JSON.stringify(data);
  for (const [oldUrl, newUrl] of urlMap.entries()) {
    if (oldUrl !== newUrl) {
      serialized = serialized.replaceAll(oldUrl, newUrl);
    }
  }
  return JSON.parse(serialized) as T;
}
