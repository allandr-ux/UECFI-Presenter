/**
 * Dynamic FontFace lazy loader & unloader for Google Fonts.
 * Keeps memory lean by loading font faces only when visible in the Font drawer
 * or actively used in the presentation, and deleting unused FontFace objects
 * from `document.fonts` when scrolled out of view.
 */

const cssCache = new Map<string, string>();
const loadedFaces = new Map<string, FontFace[]>();
const pendingLoads = new Map<string, Promise<void>>();

interface ParsedFace {
  weight: string;
  style: string;
  src: string;
  unicodeRange?: string;
}

function parseGoogleCss(cssText: string): ParsedFace[] {
  const faces: ParsedFace[] = [];
  const blockRegex = /@font-face\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(cssText)) !== null) {
    const block = match[1];
    const urlMatch = /src:\s*url\(([^)]+)\)/.exec(block);
    if (!urlMatch) continue;
    const weightMatch = /font-weight:\s*([^;]+)/.exec(block);
    const styleMatch = /font-style:\s*([^;]+)/.exec(block);
    const rangeMatch = /unicode-range:\s*([^;]+)/.exec(block);
    faces.push({
      src: urlMatch[1].replace(/['"]/g, '').trim(),
      weight: weightMatch ? weightMatch[1].trim() : '400',
      style: styleMatch ? styleMatch[1].trim() : 'normal',
      unicodeRange: rangeMatch ? rangeMatch[1].trim() : undefined
    });
  }
  return faces;
}

export async function ensureFontLoaded(family: string, googleSpec?: string): Promise<void> {
  if (!googleSpec || typeof document === 'undefined' || !('fonts' in document)) return;
  if (loadedFaces.has(family)) return;

  const existingPending = pendingLoads.get(family);
  if (existingPending) return existingPending;

  const loadPromise = (async () => {
    try {
      let cssText = cssCache.get(googleSpec);
      if (!cssText) {
        const url = `https://fonts.googleapis.com/css2?family=${googleSpec}&display=swap`;
        const res = await fetch(url);
        if (!res.ok) return;
        cssText = await res.text();
        cssCache.set(googleSpec, cssText);
      }

      const parsed = parseGoogleCss(cssText);
      if (parsed.length === 0) return;

      // Prefer Latin / standard subsets first to keep per-font memory tiny
      const preferred = parsed.filter(
        (f) => !f.unicodeRange || f.unicodeRange.includes('U+0000-00FF')
      );
      const targets = preferred.length > 0 ? preferred : parsed.slice(0, 2);

      const added: FontFace[] = [];
      for (const spec of targets) {
        try {
          const face = new FontFace(family, `url(${spec.src})`, {
            weight: spec.weight,
            style: spec.style,
            unicodeRange: spec.unicodeRange
          });
          const loaded = await face.load();
          document.fonts.add(loaded);
          added.push(loaded);
        } catch {
          // Ignore individual weight/subset load failures
        }
      }
      if (added.length > 0) {
        loadedFaces.set(family, added);
      }
    } catch {
      // Offline or blocked network: gracefully keep fallback font
    } finally {
      pendingLoads.delete(family);
    }
  })();

  pendingLoads.set(family, loadPromise);
  return loadPromise;
}

export function unloadFontIfUnused(
  family: string,
  inUseFamilies: Set<string>,
  visibleFamilies: Set<string>
): void {
  if (inUseFamilies.has(family) || visibleFamilies.has(family)) return;
  const faces = loadedFaces.get(family);
  if (!faces || typeof document === 'undefined' || !('fonts' in document)) return;
  for (const face of faces) {
    try {
      document.fonts.delete(face);
    } catch {
      // Ignore
    }
  }
  loadedFaces.delete(family);
}

export function isFontLoadedInMemory(family: string): boolean {
  return loadedFaces.has(family);
}
