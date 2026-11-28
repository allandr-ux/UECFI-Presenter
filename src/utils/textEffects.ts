import type { CanvasElement } from '../../shared/types';

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

/**
 * Builds scaled `textShadow` (solid text) and `filter` (gradient text) CSS strings
 * combining optional Text Glow and optional Drop Shadow.
 */
export function buildTextEffectsCss(
  el: Pick<
    CanvasElement,
    | 'glowBlur'
    | 'glowColor'
    | 'textShadowEnabled'
    | 'textShadowColor'
    | 'textShadowBlur'
    | 'textShadowDirection'
    | 'textShadowOffset'
    | 'textShadowOffsetX'
    | 'textShadowOffsetY'
    | 'textShadowOpacity'
  >,
  scale: number
): { textShadow?: string; filter?: string } {
  const shadows: string[] = [];
  const filters: string[] = [];

  if (el.glowBlur && el.glowBlur > 0) {
    const gc = el.glowColor || '#38bdf8';
    shadows.push(
      `0 0 ${el.glowBlur * 0.4 * scale}px ${gc}`,
      `0 0 ${el.glowBlur * scale}px ${gc}`
    );
    filters.push(
      `drop-shadow(0 0 ${el.glowBlur * 0.4 * scale}px ${gc})`,
      `drop-shadow(0 0 ${el.glowBlur * scale}px ${gc})`
    );
  }

  if (el.textShadowEnabled) {
    let ox: number;
    let oy: number;
    if (
      typeof el.textShadowOffset === 'number' ||
      typeof el.textShadowDirection === 'number' ||
      (typeof el.textShadowOffsetX !== 'number' && typeof el.textShadowOffsetY !== 'number')
    ) {
      const dirRad = ((el.textShadowDirection ?? 45) * Math.PI) / 180;
      const dist = (el.textShadowOffset ?? 25) * 0.35 * scale;
      ox = Number((Math.cos(dirRad) * dist).toFixed(2));
      oy = Number((Math.sin(dirRad) * dist).toFixed(2));
    } else {
      ox = (el.textShadowOffsetX ?? 0) * scale;
      oy = (el.textShadowOffsetY ?? 4) * scale;
    }
    const blur = (el.textShadowBlur ?? 25) * 0.35 * scale;
    const opacity = el.textShadowOpacity ?? 0.55;
    const col = hexToRgba(el.textShadowColor || '#000000', opacity);
    shadows.push(`${ox}px ${oy}px ${blur}px ${col}`);
    filters.push(`drop-shadow(${ox}px ${oy}px ${blur}px ${col})`);
  }

  return {
    textShadow: shadows.length > 0 ? shadows.join(', ') : undefined,
    filter: filters.length > 0 ? filters.join(' ') : undefined
  };
}

/**
 * Non-destructively prefixes lines with bullets or numbers when listStyle is active.
 */
export function applyListPrefix(
  raw: string,
  listStyle?: 'none' | 'bullet' | 'number'
): string {
  if (!listStyle || listStyle === 'none') return raw;
  const lines = raw.split('\n');
  let num = 1;
  return lines
    .map((line) => {
      if (!line.trim() && lines.length > 1) return line;
      if (listStyle === 'bullet') return `• ${line}`;
      const prefix = `${num}. `;
      num += 1;
      return `${prefix}${line}`;
    })
    .join('\n');
}

const SHIMMER_STAR_SPECS: Array<[number, string, string]> = [
  [2.5, '18%', '30%'],
  [2, '66%', '18%'],
  [3, '84%', '62%'],
  [2, '38%', '74%'],
  [2.5, '8%', '66%'],
  [2, '48%', '24%'],
  [2.5, '92%', '28%'],
  [2, '28%', '52%'],
  [3, '74%', '80%'],
  [2, '56%', '58%'],
  [2.5, '12%', '16%'],
  [2, '42%', '88%'],
  [2.5, '88%', '42%'],
  [2, '62%', '38%'],
  [2.5, '22%', '84%']
];

/**
 * Builds the `background` and glow `filter` CSS for `.uecfi-shimmer-stars`
 * based on particle density (0..3), glow intensity (0..2), and particle size (0.5..3).
 */
export function buildShimmerStarsStyle(
  density = 1,
  glow = 1,
  color?: string,
  particleSize = 1
): { background: string; filter?: string } {
  const count = Math.max(0, Math.min(SHIMMER_STAR_SPECS.length, Math.round(density * 5)));
  if (count === 0) return { background: 'none', filter: 'none' };
  const scale = Math.max(0.3, Math.min(4, particleSize));
  const background = SHIMMER_STAR_SPECS.slice(0, count)
    .map(([baseSize, x, y]) => {
      const sz = Number((baseSize * scale).toFixed(2));
      return `radial-gradient(${sz}px ${sz}px at ${x} ${y}, #fff 45%, transparent 55%)`;
    })
    .join(', ');
  if (glow <= 0) {
    return { background, filter: 'none' };
  }
  const glowColor = color && !color.includes('gradient(') ? color : '#e8d5f5';
  const coreBlur = Number((3 * glow).toFixed(2));
  const outerBlur = Number((7 * glow).toFixed(2));
  return {
    background,
    filter: `drop-shadow(0 0 ${coreBlur}px #ffffff) drop-shadow(0 0 ${outerBlur}px ${glowColor})`
  };
}
