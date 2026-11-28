import type { CanvasElement } from '../../shared/types';

export type TemplateCategory =
  | 'General'
  | 'Worship'
  | 'Tema'
  | 'Logo'
  | 'Announcement'
  | 'Youth'
  | 'Event';

export interface CommunityTemplateSlide {
  backgroundColor?: string;
  backgroundGradient?: string;
  canvasElements: CanvasElement[];
}

export interface CommunityTemplate {
  id: string;
  title: string;
  category: TemplateCategory;
  author: string;
  status?: 'pending' | 'approved' | 'rejected';
  thumbnailUrl?: string;
  thumbnailDataUrl?: string;
  mediaAssets?: Record<string, string>;
  createdAt: string;
  approvedAt?: string;
  slide: CommunityTemplateSlide;
}

export interface SubmitTemplatePayload {
  title: string;
  category: TemplateCategory;
  author: string;
  thumbnailUrl?: string;
  thumbnailDataUrl?: string;
  mediaAssets?: Record<string, string>;
  slide: CommunityTemplateSlide;
}

const DEFAULT_RELAY_URL = 'wss://remote.uecfi.net/ws';

/**
 * Converts a WebSocket signaling relay URL (e.g. wss://remote.uecfi.net/ws)
 * into its HTTP(S) origin base URL (e.g. https://remote.uecfi.net).
 */
export function relayUrlToHttpBase(relayUrl?: string): string {
  const raw = (relayUrl || '').trim() || DEFAULT_RELAY_URL;
  try {
    const normalized = raw
      .replace(/^wss:\/\//i, 'https://')
      .replace(/^ws:\/\//i, 'http://');
    const parsed = new URL(
      /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`,
    );
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return 'https://remote.uecfi.net';
  }
}

/**
 * Sends a lightweight health ping to keep the Render signaling server awake
 * while desktop apps are online. Fails silently so it never disrupts the UI.
 */
export async function pingSignalingHealth(relayUrl?: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  const base = relayUrlToHttpBase(relayUrl);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${base}/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetches approved community templates from the signaling server.
 */
export async function fetchApprovedTemplates(
  relayUrl?: string,
): Promise<{ templates: CommunityTemplate[]; storageMode?: string }> {
  const base = relayUrlToHttpBase(relayUrl);
  const res = await fetch(`${base}/api/templates`, {
    method: 'GET',
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch templates (${res.status})`);
  }
  const data = await res.json();
  return {
    templates: Array.isArray(data?.templates) ? data.templates : [],
    storageMode: data?.storageMode,
  };
}

/**
 * Resolves a server-relative asset path (e.g. /api/templates/assets/...)
 * against the signaling server's HTTP base URL.
 */
export function resolveTemplateAssetUrl(
  relayUrl: string | undefined,
  assetPath: string | undefined,
): string | undefined {
  if (!assetPath) return undefined;
  if (/^(https?:|data:|uecfi-media:)/i.test(assetPath)) return assetPath;
  const base = relayUrlToHttpBase(relayUrl);
  return `${base}${assetPath.startsWith('/') ? assetPath : `/${assetPath}`}`;
}

/**
 * Uploads a single binary file (image, background, 3D .glb, or JPEG thumbnail)
 * to the signaling server / R2 and returns its server-relative URL.
 */
export async function uploadTemplateAsset(
  relayUrl: string | undefined,
  fileName: string,
  bytes: Uint8Array | ArrayBuffer | Blob,
  contentType = 'application/octet-stream',
): Promise<string> {
  const base = relayUrlToHttpBase(relayUrl);
  const body = bytes instanceof Uint8Array ? new Blob([bytes.slice()], { type: contentType }) : bytes;
  const res = await fetch(
    `${base}/api/templates/assets?name=${encodeURIComponent(fileName)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'X-File-Name': fileName,
      },
      body,
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.url) {
    throw new Error(data?.error || `Asset upload failed (${res.status})`);
  }
  return data.url as string;
}

/**
 * Uploads all `uecfi-media://local/<fileName>` files referenced by a slide
 * as real binary files and rewrites their URLs to `/api/templates/assets/...`.
 */
export async function uploadSlideAssetsAndRewrite(
  relayUrl: string | undefined,
  slide: CommunityTemplateSlide,
): Promise<CommunityTemplateSlide> {
  let serialized = JSON.stringify(slide);
  const matches = serialized.matchAll(/uecfi-media:\/\/local\/([a-zA-Z0-9._-]+)/g);
  const fileNames = new Set<string>();
  for (const m of matches) {
    if (m[1]) fileNames.add(m[1]);
  }
  if (fileNames.size === 0) return slide;

  for (const fileName of fileNames) {
    const res = await fetch(`uecfi-media://local/${fileName}`);
    if (!res.ok) {
      throw new Error(`Could not read local asset "${fileName}" for upload.`);
    }
    const blob = await res.blob();
    const assetUrl = await uploadTemplateAsset(
      relayUrl,
      fileName,
      blob,
      blob.type || 'application/octet-stream',
    );
    serialized = serialized.replaceAll(`uecfi-media://local/${fileName}`, assetUrl);
  }
  return JSON.parse(serialized) as CommunityTemplateSlide;
}

/**
 * Downloads any `/api/templates/assets/<assetId>/<fileName>` binary files
 * referenced by a template slide into the local Electron media directory and
 * remaps their URLs to `uecfi-media://local/...`.
 */
export async function downloadTemplateAssetsAndRewrite(
  relayUrl: string | undefined,
  slide: CommunityTemplateSlide,
): Promise<CommunityTemplateSlide> {
  if (!window.presenterAPI?.saveMediaFile) return slide;
  let serialized = JSON.stringify(slide);
  const matches = serialized.matchAll(/\/api\/templates\/assets\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9._-]+)/g);
  const paths = new Map<string, string>();
  for (const m of matches) {
    if (m[0] && m[2]) paths.set(m[0], m[2]);
  }
  if (paths.size === 0) return slide;

  const base = relayUrlToHttpBase(relayUrl);
  for (const [assetPath, fileName] of paths.entries()) {
    try {
      const res = await fetch(`${base}${assetPath}`);
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      const saved = await window.presenterAPI.saveMediaFile(fileName, bytes);
      serialized = serialized.replaceAll(assetPath, saved.url);
    } catch {
      // Skip unreachable asset
    }
  }
  return JSON.parse(serialized) as CommunityTemplateSlide;
}

/**
 * Submits the current slide as a community template for admin moderation.
 */
export async function submitCommunityTemplate(
  relayUrl: string | undefined,
  payload: SubmitTemplatePayload,
): Promise<{ ok: boolean; id: string; status: string }> {
  const base = relayUrlToHttpBase(relayUrl);
  const res = await fetch(`${base}/api/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Submission failed (${res.status})`);
  }
  return data;
}

/**
 * Renders a lightweight 320x180 JPEG preview of a slide's background, shapes,
 * and text elements for display in the template browser and admin queue.
 */
export function generateSlideThumbnailDataUrl(
  slide: CommunityTemplateSlide,
): string | undefined {
  if (typeof document === 'undefined') return undefined;
  try {
    const width = 320;
    const height = 180;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    // Draw background color or gradient approximation
    ctx.fillStyle = slide.backgroundColor || '#1e293b';
    ctx.fillRect(0, 0, width, height);

    if (slide.backgroundGradient) {
      const hexMatches = slide.backgroundGradient.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g);
      if (hexMatches && hexMatches.length >= 2) {
        const grad = ctx.createLinearGradient(0, 0, width, height);
        grad.addColorStop(0, hexMatches[0]);
        grad.addColorStop(1, hexMatches[hexMatches.length - 1]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      }
    }

    const elements = Array.isArray(slide.canvasElements) ? slide.canvasElements : [];
    const sorted = [...elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

    for (const el of sorted) {
      const x = ((el.x ?? 0) / 100) * width;
      const y = ((el.y ?? 0) / 100) * height;
      const w = ((el.width ?? 20) / 100) * width;
      const h = ((el.height ?? 10) / 100) * height;

      ctx.save();
      ctx.globalAlpha = el.opacity ?? 1;

      if (el.kind === 'shape') {
        ctx.fillStyle = el.backgroundColor || 'rgba(255,255,255,0.2)';
        if (el.shapeType === 'circle') {
          ctx.beginPath();
          ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, w, h);
        }
      } else if (el.kind === 'text') {
        if (el.backgroundColor && el.backgroundColor !== 'transparent') {
          ctx.fillStyle = el.backgroundColor;
          ctx.fillRect(x, y, w, h);
        }
        const rawText = (el.text || '').replace(/<[^>]+>/g, '').trim();
        if (rawText) {
          const scaledFontSize = Math.max(6, Math.min(28, ((el.fontSize || 32) / 1080) * height * 1.6));
          ctx.font = `${el.fontWeight || '600'} ${scaledFontSize}px ${el.fontFamily || 'sans-serif'}`;
          ctx.fillStyle = el.color || '#ffffff';
          ctx.textBaseline = 'top';
          const align = el.textAlign || 'left';
          ctx.textAlign = align;
          const textX = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x + 2;
          const lines = rawText.split('\n').slice(0, 3);
          lines.forEach((line, idx) => {
            ctx.fillText(line.slice(0, 42), textX, y + 2 + idx * (scaledFontSize * 1.15), Math.max(10, w - 4));
          });
        }
      } else if (el.kind === 'image' || el.kind === 'frame') {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
        ctx.strokeRect(x, y, w, h);
      }

      ctx.restore();
    }

    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return undefined;
  }
}
