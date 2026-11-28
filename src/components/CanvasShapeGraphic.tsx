import React, { useId } from 'react';
import type { ShapeVariant } from '../../shared/types';

interface CanvasShapeGraphicProps {
  shapeType: ShapeVariant;
  fill: string;
}

export interface ShapeOptionEntry {
  id: ShapeVariant;
  label: string;
  category: ShapeCategoryId;
}

export type ShapeCategoryId =
  | 'lines'
  | 'basic'
  | 'polygons'
  | 'stars'
  | 'arrows'
  | 'flowchart'
  | 'speech'
  | 'clouds'
  | 'hearts'
  | 'banners'
  | 'teardrops'
  | 'cogs'
  | 'squareStars'
  | 'organic'
  | 'abstract';

export const SHAPE_CATEGORIES: Array<{
  id: ShapeCategoryId;
  label: string;
}> = [
  { id: 'lines', label: 'Lines' },
  { id: 'basic', label: 'Basic shapes' },
  { id: 'polygons', label: 'Polygons' },
  { id: 'stars', label: 'Stars' },
  { id: 'arrows', label: 'Arrows' },
  { id: 'flowchart', label: 'Flowchart shapes' },
  { id: 'speech', label: 'Speech bubbles' },
  { id: 'clouds', label: 'Clouds' },
  { id: 'hearts', label: 'Hearts' },
  { id: 'banners', label: 'Banners' },
  { id: 'teardrops', label: 'Teardrops' },
  { id: 'cogs', label: 'Cogs' },
  { id: 'squareStars', label: 'Square stars' },
  { id: 'organic', label: 'Organic shapes' },
  { id: 'abstract', label: 'Abstract shapes' }
];

export const SHAPE_OPTIONS: ShapeOptionEntry[] = [
  // Lines (matching Canva Lines grid order)
  { id: 'lineWaveThick', label: 'Thick Wave Line', category: 'lines' },
  { id: 'lineDoubleChevronArrow', label: 'Double Open Arrow Line', category: 'lines' },
  { id: 'lineDottedArrow', label: 'Dotted Arrow Line', category: 'lines' },
  { id: 'lineChevronArrow', label: 'Open Arrow Line', category: 'lines' },
  { id: 'lineArrowRight', label: 'Arrow Line', category: 'lines' },
  { id: 'lineDottedDoubleArrow', label: 'Dotted Double Arrow Line', category: 'lines' },
  { id: 'line', label: 'Solid Line', category: 'lines' },
  { id: 'lineCircleEnds', label: 'Circle Ends Line', category: 'lines' },
  { id: 'lineHollowCircleEnds', label: 'Hollow Circle Ends Line', category: 'lines' },
  { id: 'lineDotted', label: 'Dotted Line', category: 'lines' },
  { id: 'lineBarEnds', label: 'Bar Ends Line', category: 'lines' },
  { id: 'lineDashed', label: 'Dashed Line', category: 'lines' },
  { id: 'lineHollowDiamondEnds', label: 'Hollow Diamond Ends Line', category: 'lines' },
  { id: 'lineHollowSquareEnds', label: 'Hollow Square Ends Line', category: 'lines' },
  { id: 'lineSquareEnds', label: 'Square Ends Line', category: 'lines' },
  { id: 'lineDiamondEnds', label: 'Diamond Ends Line', category: 'lines' },
  { id: 'lineZigzagWaveThick', label: 'Thick Multi-Wave Line', category: 'lines' },
  // Basic shapes
  { id: 'rectangle', label: 'Square', category: 'basic' },
  { id: 'roundedRect', label: 'Rounded Square', category: 'basic' },
  { id: 'circle', label: 'Circle / Oval', category: 'basic' },
  { id: 'triangle', label: 'Triangle', category: 'basic' },
  { id: 'triangleDown', label: 'Inverted Triangle', category: 'basic' },
  { id: 'diamond', label: 'Diamond', category: 'basic' },
  { id: 'cross', label: 'Cross', category: 'basic' },
  { id: 'ring', label: 'Ring', category: 'basic' },
  // Polygons
  { id: 'pentagon', label: 'Pentagon', category: 'polygons' },
  { id: 'hexagon', label: 'Hexagon', category: 'polygons' },
  { id: 'hexagonFlat', label: 'Hexagon Wide', category: 'polygons' },
  { id: 'heptagon', label: 'Heptagon', category: 'polygons' },
  { id: 'octagon', label: 'Octagon', category: 'polygons' },
  { id: 'chamferRect', label: 'Chamfer Box', category: 'polygons' },
  // Stars
  { id: 'star4', label: '4-Point Star', category: 'stars' },
  { id: 'star', label: '5-Point Star', category: 'stars' },
  { id: 'star6', label: '6-Point Star', category: 'stars' },
  { id: 'star8', label: '8-Point Star', category: 'stars' },
  { id: 'star12', label: '12-Point Star', category: 'stars' },
  { id: 'burst', label: 'Sunburst', category: 'stars' },
  // Arrows
  { id: 'arrowRight', label: 'Right Arrow', category: 'arrows' },
  { id: 'arrowLeft', label: 'Left Arrow', category: 'arrows' },
  { id: 'arrowUp', label: 'Up Arrow', category: 'arrows' },
  { id: 'arrowDown', label: 'Down Arrow', category: 'arrows' },
  { id: 'arrowLeftRight', label: 'Double Arrow', category: 'arrows' },
  { id: 'chevronRight', label: 'Chevron', category: 'arrows' },
  // Flowchart shapes
  { id: 'flowchartHex', label: 'Preparation', category: 'flowchart' },
  { id: 'pill', label: 'Terminator Pill', category: 'flowchart' },
  { id: 'roundedSquare', label: 'Process Box', category: 'flowchart' },
  { id: 'parallelogram', label: 'Parallelogram', category: 'flowchart' },
  { id: 'wave', label: 'Document Wave', category: 'flowchart' },
  { id: 'trapezoid', label: 'Trapezoid', category: 'flowchart' },
  // Speech bubbles
  { id: 'speechSquare', label: 'Square Bubble', category: 'speech' },
  { id: 'speechOval', label: 'Oval Bubble', category: 'speech' },
  { id: 'thoughtCloud', label: 'Thought Bubble', category: 'speech' },
  { id: 'speechRounded', label: 'Rounded Bubble', category: 'speech' },
  { id: 'speechTailLeft', label: 'Callout Left', category: 'speech' },
  // Clouds
  { id: 'cloud', label: 'Fluffy Cloud', category: 'clouds' },
  { id: 'cloudSoft', label: 'Soft Cloud', category: 'clouds' },
  { id: 'cloudFlat', label: 'Flat Cloud', category: 'clouds' },
  { id: 'cloudPuffy', label: 'Puffy Cloud', category: 'clouds' },
  // Hearts
  { id: 'heart', label: 'Classic Heart', category: 'hearts' },
  { id: 'heartTall', label: 'Tall Heart', category: 'hearts' },
  { id: 'heartWide', label: 'Wide Heart', category: 'hearts' },
  { id: 'heartSoft', label: 'Soft Heart', category: 'hearts' },
  // Banners
  { id: 'bannerRibbon', label: 'Ribbon Banner', category: 'banners' },
  { id: 'bannerShield', label: 'Shield Banner', category: 'banners' },
  { id: 'bannerBookmark', label: 'Bookmark', category: 'banners' },
  { id: 'bannerTag', label: 'Pointed Tag', category: 'banners' },
  { id: 'bannerArch', label: 'Arch Ribbon', category: 'banners' },
  // Teardrops
  { id: 'teardrop', label: 'Teardrop', category: 'teardrops' },
  { id: 'teardropSlim', label: 'Slim Drop', category: 'teardrops' },
  { id: 'teardropWide', label: 'Wide Drop', category: 'teardrops' },
  { id: 'teardropFlame', label: 'Flame Drop', category: 'teardrops' },
  // Cogs
  { id: 'cog', label: 'Gear 12-Tooth', category: 'cogs' },
  { id: 'cogThin', label: 'Gear Ring', category: 'cogs' },
  { id: 'sunburstCog', label: 'Sun Gear', category: 'cogs' },
  { id: 'gearHole', label: 'Small Hole Gear', category: 'cogs' },
  // Square stars
  { id: 'asterisk6', label: '6-Ray Asterisk', category: 'squareStars' },
  { id: 'asterisk8', label: '8-Ray Asterisk', category: 'squareStars' },
  { id: 'plusThick', label: 'Block Burst', category: 'squareStars' },
  { id: 'spark5', label: '5-Ray Asterisk', category: 'squareStars' },
  // Organic shapes
  { id: 'flower6', label: '6-Petal Flower', category: 'organic' },
  { id: 'flower8', label: '8-Petal Flower', category: 'organic' },
  { id: 'clover', label: 'Four-Leaf Clover', category: 'organic' },
  { id: 'blob', label: 'Organic Blob', category: 'organic' },
  // Abstract shapes
  { id: 'quatrefoil', label: 'Quatrefoil', category: 'abstract' },
  { id: 'hourglass', label: 'Hourglass', category: 'abstract' },
  { id: 'archStack', label: 'Arch Stack', category: 'abstract' },
  { id: 'diagonalCut', label: 'Diagonal Cut', category: 'abstract' }
];

const WIDE_SHAPE_ASPECTS: Partial<Record<ShapeVariant, number>> = {
  arrowRight: 1.5,
  arrowLeft: 1.5,
  arrowLeftRight: 1.75,
  bannerRibbon: 2.2,
  pill: 1.75,
  flowchartHex: 1.6,
  parallelogram: 1.45,
  wave: 1.45,
  trapezoid: 1.45,
  roundedSquare: 1.35,
  speechSquare: 1.2,
  speechOval: 1.35,
  speechRounded: 1.35,
  speechTailLeft: 1.35,
  thoughtCloud: 1.25,
  cloud: 1.5,
  cloudSoft: 1.75,
  cloudFlat: 1.75,
  cloudPuffy: 1.45,
  heartWide: 1.25
};

const TALL_SHAPE_ASPECTS: Partial<Record<ShapeVariant, number>> = {
  arrowUp: 0.72,
  arrowDown: 0.72,
  heartTall: 0.78,
  bannerBookmark: 0.75,
  bannerTag: 0.75,
  bannerArch: 0.75,
  teardrop: 0.75,
  teardropSlim: 0.62,
  teardropFlame: 0.72
};

/**
 * Returns the natural pixel width/height aspect ratio for a shape so newly inserted
 * shapes start with crisp, undistorted proportions while still allowing free resizing.
 */
export function getShapeDefaultAspect(shapeType: ShapeVariant): number {
  if (shapeType === 'lineWaveThick' || shapeType === 'lineZigzagWaveThick') return 4.5;
  if (shapeType.startsWith('line')) return 8;
  return WIDE_SHAPE_ASPECTS[shapeType] ?? TALL_SHAPE_ASPECTS[shapeType] ?? 1;
}

/** Scales an array of [x, y] points so its tight bounding box spans 0..100 on both axes. */
function normalizePointsToBox(pts: Array<[number, number]>): string {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  return pts
    .map(([x, y]) => {
      const nx = ((x - minX) / spanX) * 100;
      const ny = ((y - minY) / spanY) * 100;
      return `${nx.toFixed(2)},${ny.toFixed(2)}`;
    })
    .join(' ');
}

function regularPolygonPoints(sides: number, rotationDeg = -90): string {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < sides; i++) {
    const angle = ((rotationDeg + (360 / sides) * i) * Math.PI) / 180;
    pts.push([50 + 50 * Math.cos(angle), 50 + 50 * Math.sin(angle)]);
  }
  return normalizePointsToBox(pts);
}

function starPoints(
  pointsCount: number,
  outerR = 50,
  innerR = 22,
  rotationDeg = -90
): string {
  const pts: Array<[number, number]> = [];
  const total = pointsCount * 2;
  for (let i = 0; i < total; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = ((rotationDeg + (360 / total) * i) * Math.PI) / 180;
    pts.push([50 + r * Math.cos(angle), 50 + r * Math.sin(angle)]);
  }
  return normalizePointsToBox(pts);
}

function gearPath(teeth: number, outerR: number, innerR: number, holeR: number): string {
  const step = (Math.PI * 2) / teeth;
  const rawPts: Array<[number, number]> = [];
  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const a1 = a0 + step * 0.22;
    const a2 = a0 + step * 0.35;
    const a3 = a0 + step * 0.65;
    const a4 = a0 + step * 0.78;
    rawPts.push([50 + innerR * Math.cos(a0), 50 + innerR * Math.sin(a0)]);
    rawPts.push([50 + outerR * Math.cos(a1), 50 + outerR * Math.sin(a1)]);
    rawPts.push([50 + outerR * Math.cos(a2), 50 + outerR * Math.sin(a2)]);
    rawPts.push([50 + innerR * Math.cos(a3), 50 + innerR * Math.sin(a3)]);
    rawPts.push([50 + innerR * Math.cos(a4), 50 + innerR * Math.sin(a4)]);
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of rawPts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  let d = rawPts
    .map(([x, y], idx) => {
      const nx = (((x - minX) / spanX) * 100).toFixed(2);
      const ny = (((y - minY) / spanY) * 100).toFixed(2);
      return `${idx === 0 ? 'M' : 'L'}${nx},${ny}`;
    })
    .join(' ');
  d += ' Z';
  if (holeR > 0) {
    const rScaled = (holeR / Math.max(spanX, spanY)) * 100;
    d += ` M${(50 + rScaled).toFixed(2)},50 A${rScaled.toFixed(2)},${rScaled.toFixed(2)} 0 1,0 ${(50 - rScaled).toFixed(2)},50 A${rScaled.toFixed(2)},${rScaled.toFixed(2)} 0 1,0 ${(50 + rScaled).toFixed(2)},50 Z`;
  }
  return d;
}

function renderAsteriskRays(count: number, thickness: number, fill: string) {
  const rays: React.ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const deg = (180 / count) * i;
    rays.push(
      <rect
        key={i}
        x={50 - thickness / 2}
        y={0}
        width={thickness}
        height={100}
        rx={thickness * 0.12}
        fill={fill}
        transform={`rotate(${deg} 50 50)`}
      />
    );
  }
  return rays;
}

function renderFlowerPetals(
  count: number,
  rx: number,
  ry: number,
  offsetY: number,
  fill: string
) {
  const petals: React.ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const deg = (360 / count) * i;
    petals.push(
      <ellipse
        key={i}
        cx={50}
        cy={offsetY}
        rx={rx}
        ry={ry}
        fill={fill}
        transform={`rotate(${deg} 50 50)`}
      />
    );
  }
  return petals;
}

function parseCssLinearGradient(
  css: string
): { angleDeg: number; stops: Array<{ color: string; offset: string }> } | null {
  const m = css.match(/^linear-gradient\(\s*([^,]+)\s*,([\s\S]+)\)$/i);
  if (!m) return null;
  const angleMatch = m[1].match(/(-?\d+(?:\.\d+)?)deg/i);
  const angleDeg = angleMatch ? Number(angleMatch[1]) : 135;
  const rawStops = m[2].split(',').map((s) => s.trim());
  const stops = rawStops
    .map((s, idx) => {
      const parts = s.split(/\s+/);
      const color = parts[0];
      const offset = parts[1] ?? `${Math.round((idx / Math.max(1, rawStops.length - 1)) * 100)}%`;
      return color ? { color, offset } : null;
    })
    .filter((s): s is { color: string; offset: string } => Boolean(s));
  return stops.length >= 2 ? { angleDeg, stops } : null;
}

/**
 * Renders tight-bounded vector SVG geometry (spanning 0..100 with no empty padding)
 * for Slide Builder shapes so both the editor canvas and live stage match their bounding boxes.
 */
export const CanvasShapeGraphic: React.FC<CanvasShapeGraphicProps> = ({
  shapeType,
  fill: fillProp
}) => {
  const gradId = useId().replace(/:/g, '');
  const parsedGrad = fillProp.includes('gradient(') ? parseCssLinearGradient(fillProp) : null;
  const fill = parsedGrad ? `url(#${gradId})` : fillProp;
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      width="100%"
      height="100%"
      style={{ display: 'block', pointerEvents: 'none', overflow: 'visible' }}
    >
      {parsedGrad && (
        <defs>
          <linearGradient
            id={gradId}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
            gradientTransform={`rotate(${parsedGrad.angleDeg - 90} 0.5 0.5)`}
          >
            {parsedGrad.stops.map((st, idx) => (
              <stop key={idx} offset={st.offset} stopColor={st.color} />
            ))}
          </linearGradient>
        </defs>
      )}
      {/* LINES */}
      {shapeType === 'line' && (
        <line x1="0" y1="50" x2="100" y2="50" stroke={fill} strokeWidth="14" strokeLinecap="butt" />
      )}
      {shapeType === 'lineWaveThick' && (
        <path
          d="M0,32 C25,58 50,58 75,32 C87,19 94,14 100,14 L100,56 C94,56 87,61 75,74 C50,100 25,100 0,74 Z"
          fill={fill}
        />
      )}
      {shapeType === 'lineZigzagWaveThick' && (
        <path
          d="M0,20 Q16.6,0 33.3,20 T66.6,20 T100,20 L100,72 Q83.3,52 66.6,72 T33.3,72 T0,72 Z"
          fill={fill}
        />
      )}
      {shapeType === 'lineChevronArrow' && (
        <g fill="none" stroke={fill} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round">
          <line x1="2" y1="50" x2="94" y2="50" />
          <polyline points="82,20 96,50 82,80" />
        </g>
      )}
      {shapeType === 'lineDoubleChevronArrow' && (
        <g fill="none" stroke={fill} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round">
          <line x1="6" y1="50" x2="94" y2="50" />
          <polyline points="18,20 4,50 18,80" />
          <polyline points="82,20 96,50 82,80" />
        </g>
      )}
      {shapeType === 'lineDottedArrow' && (
        <g fill="none" stroke={fill} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round">
          <line x1="2" y1="50" x2="88" y2="50" strokeDasharray="1 10" />
          <polyline points="82,20 96,50 82,80" />
        </g>
      )}
      {shapeType === 'lineArrowRight' && (
        <g fill={fill} stroke={fill}>
          <line x1="0" y1="50" x2="86" y2="50" strokeWidth="12" />
          <polygon points="84,12 100,50 84,88" stroke="none" />
        </g>
      )}
      {shapeType === 'lineDoubleArrow' && (
        <g fill={fill} stroke={fill}>
          <line x1="14" y1="50" x2="86" y2="50" strokeWidth="12" />
          <polygon points="16,12 0,50 16,88" stroke="none" />
          <polygon points="84,12 100,50 84,88" stroke="none" />
        </g>
      )}
      {shapeType === 'lineDottedDoubleArrow' && (
        <g fill={fill} stroke={fill}>
          <line x1="16" y1="50" x2="84" y2="50" strokeWidth="12" strokeDasharray="1 10" strokeLinecap="round" />
          <polygon points="16,14 0,50 16,86" stroke="none" />
          <polygon points="84,14 100,50 84,86" stroke="none" />
        </g>
      )}
      {shapeType === 'lineCircleEnds' && (
        <g fill={fill} stroke={fill}>
          <line x1="6" y1="50" x2="94" y2="50" strokeWidth="12" />
          <ellipse cx="6" cy="50" rx="6" ry="34" stroke="none" />
          <ellipse cx="94" cy="50" rx="6" ry="34" stroke="none" />
        </g>
      )}
      {shapeType === 'lineHollowCircleEnds' && (
        <g fill="none" stroke={fill} strokeWidth="11">
          <line x1="12" y1="50" x2="88" y2="50" />
          <ellipse cx="6.5" cy="50" rx="5.5" ry="30" />
          <ellipse cx="93.5" cy="50" rx="5.5" ry="30" />
        </g>
      )}
      {shapeType === 'lineSquareEnds' && (
        <g fill={fill} stroke={fill}>
          <line x1="4" y1="50" x2="96" y2="50" strokeWidth="12" />
          <rect x="0" y="15" width="7" height="70" stroke="none" />
          <rect x="93" y="15" width="7" height="70" stroke="none" />
        </g>
      )}
      {shapeType === 'lineHollowSquareEnds' && (
        <g fill="none" stroke={fill} strokeWidth="11">
          <line x1="11" y1="50" x2="89" y2="50" />
          <rect x="1" y="18" width="9" height="64" />
          <rect x="90" y="18" width="9" height="64" />
        </g>
      )}
      {shapeType === 'lineDiamondEnds' && (
        <g fill={fill} stroke={fill}>
          <line x1="6" y1="50" x2="94" y2="50" strokeWidth="12" />
          <polygon points="6,10 12,50 6,90 0,50" stroke="none" />
          <polygon points="94,10 100,50 94,90 88,50" stroke="none" />
        </g>
      )}
      {shapeType === 'lineHollowDiamondEnds' && (
        <g fill="none" stroke={fill} strokeWidth="10" strokeLinejoin="miter">
          <line x1="12" y1="50" x2="88" y2="50" />
          <polygon points="6,14 12,50 6,86 1,50" />
          <polygon points="94,14 99,50 94,86 88,50" />
        </g>
      )}
      {shapeType === 'lineBarEnds' && (
        <g stroke={fill} strokeWidth="12" strokeLinecap="butt">
          <line x1="2" y1="50" x2="98" y2="50" />
          <line x1="2" y1="10" x2="2" y2="90" />
          <line x1="98" y1="10" x2="98" y2="90" />
        </g>
      )}
      {shapeType === 'lineDashed' && (
        <line
          x1="0"
          y1="50"
          x2="100"
          y2="50"
          stroke={fill}
          strokeWidth="14"
          strokeDasharray="10 6"
        />
      )}
      {shapeType === 'lineDotted' && (
        <line
          x1="3"
          y1="50"
          x2="97"
          y2="50"
          stroke={fill}
          strokeWidth="16"
          strokeDasharray="1 10"
          strokeLinecap="round"
        />
      )}

      {/* BASIC SHAPES */}
      {shapeType === 'rectangle' && <rect x="0" y="0" width="100" height="100" rx="0" fill={fill} />}
      {shapeType === 'roundedRect' && <rect x="0" y="0" width="100" height="100" rx="22" fill={fill} />}
      {shapeType === 'circle' && <ellipse cx="50" cy="50" rx="50" ry="50" fill={fill} />}
      {shapeType === 'triangle' && <polygon points="50,0 100,100 0,100" fill={fill} />}
      {shapeType === 'triangleDown' && <polygon points="0,0 100,0 50,100" fill={fill} />}
      {shapeType === 'diamond' && <polygon points="50,0 100,50 50,100 0,50" fill={fill} />}
      {shapeType === 'cross' && (
        <polygon
          points="33,0 67,0 67,33 100,33 100,67 67,67 67,100 33,100 33,67 0,67 0,33 33,33"
          fill={fill}
        />
      )}
      {shapeType === 'ring' && (
        <path
          d="M50,0 A50,50 0 1,0 50,100 A50,50 0 1,0 50,0 Z M50,20 A30,30 0 1,1 50,80 A30,30 0 1,1 50,20 Z"
          fill={fill}
          fillRule="evenodd"
        />
      )}

      {/* POLYGONS */}
      {shapeType === 'pentagon' && <polygon points={regularPolygonPoints(5, -90)} fill={fill} />}
      {shapeType === 'hexagon' && <polygon points={regularPolygonPoints(6, -90)} fill={fill} />}
      {shapeType === 'hexagonFlat' && <polygon points={regularPolygonPoints(6, 0)} fill={fill} />}
      {shapeType === 'heptagon' && <polygon points={regularPolygonPoints(7, -90)} fill={fill} />}
      {shapeType === 'octagon' && <polygon points={regularPolygonPoints(8, -67.5)} fill={fill} />}
      {shapeType === 'chamferRect' && (
        <polygon points="18,0 82,0 100,18 100,82 82,100 18,100 0,82 0,18" fill={fill} />
      )}

      {/* STARS */}
      {shapeType === 'star4' && <polygon points={starPoints(4, 50, 16, -90)} fill={fill} />}
      {shapeType === 'star' && <polygon points={starPoints(5, 50, 20, -90)} fill={fill} />}
      {shapeType === 'star6' && <polygon points={starPoints(6, 50, 27, -90)} fill={fill} />}
      {shapeType === 'star8' && <polygon points={starPoints(8, 50, 31, -90)} fill={fill} />}
      {shapeType === 'star12' && <polygon points={starPoints(12, 50, 35, -90)} fill={fill} />}
      {shapeType === 'burst' && <polygon points={starPoints(16, 50, 37, -90)} fill={fill} />}

      {/* ARROWS */}
      {shapeType === 'arrowRight' && (
        <polygon points="0,25 60,25 60,0 100,50 60,100 60,75 0,75" fill={fill} />
      )}
      {shapeType === 'arrowLeft' && (
        <polygon points="100,25 40,25 40,0 0,50 40,100 40,75 100,75" fill={fill} />
      )}
      {shapeType === 'arrowUp' && (
        <polygon points="25,100 25,40 0,40 50,0 100,40 75,40 75,100" fill={fill} />
      )}
      {shapeType === 'arrowDown' && (
        <polygon points="25,0 25,60 0,60 50,100 100,60 75,60 75,0" fill={fill} />
      )}
      {shapeType === 'arrowLeftRight' && (
        <polygon
          points="0,50 26,0 26,28 74,28 74,0 100,50 74,100 74,72 26,72 26,100"
          fill={fill}
        />
      )}
      {shapeType === 'chevronRight' && (
        <polygon points="0,0 56,0 100,50 56,100 0,100 44,50" fill={fill} />
      )}

      {/* FLOWCHART SHAPES */}
      {shapeType === 'flowchartHex' && (
        <polygon points="18,0 82,0 100,50 82,100 18,100 0,50" fill={fill} />
      )}
      {shapeType === 'pill' && <rect x="0" y="0" width="100" height="100" rx="50" fill={fill} />}
      {shapeType === 'roundedSquare' && <rect x="0" y="0" width="100" height="100" rx="18" fill={fill} />}
      {shapeType === 'parallelogram' && <polygon points="18,0 100,0 82,100 0,100" fill={fill} />}
      {shapeType === 'wave' && (
        <path d="M0,0 H100 V84 Q75,108 50,84 Q25,60 0,84 Z" fill={fill} />
      )}
      {shapeType === 'trapezoid' && <polygon points="16,0 84,0 100,100 0,100" fill={fill} />}

      {/* SPEECH BUBBLES */}
      {shapeType === 'speechSquare' && (
        <path d="M0,0 H100 V76 H36 L12,100 V76 H0 Z" fill={fill} />
      )}
      {shapeType === 'speechOval' && (
        <path
          d="M50,0 C20,0 0,18 0,40 C0,54 10,66 24,73 L16,100 L40,78 C43,79 47,79 50,79 C80,79 100,62 100,40 C100,18 80,0 50,0 Z"
          fill={fill}
        />
      )}
      {shapeType === 'thoughtCloud' && (
        <g fill={fill}>
          <path d="M24,68 C9,68 0,58 0,44 C0,33 8,23 19,21 C24,8 36,0 50,0 C66,0 78,10 81,24 C92,27 100,36 100,47 C100,60 90,68 78,68 Z" />
          <circle cx="24" cy="81" r="7" />
          <circle cx="10" cy="95" r="5" />
        </g>
      )}
      {shapeType === 'speechRounded' && (
        <path
          d="M14,0 H86 A14,14 0 0,1 100,14 V62 A14,14 0 0,1 86,76 H38 L16,100 V76 H14 A14,14 0 0,1 0,62 V14 A14,14 0 0,1 14,0 Z"
          fill={fill}
        />
      )}
      {shapeType === 'speechTailLeft' && (
        <path
          d="M18,0 H82 A18,18 0 0,1 100,18 V56 A18,18 0 0,1 82,74 H34 L8,100 L18,74 A18,18 0 0,1 0,56 V18 A18,18 0 0,1 18,0 Z"
          fill={fill}
        />
      )}

      {/* CLOUDS */}
      {shapeType === 'cloud' && (
        <path
          d="M23,100 C9,100 0,87 0,70 C0,54 8,42 19,39 C23,16 36,0 51,0 C67,0 80,16 83,39 C93,43 100,56 100,71 C100,88 91,100 77,100 Z"
          fill={fill}
        />
      )}
      {shapeType === 'cloudSoft' && (
        <path
          d="M16,100 C6,100 0,88 0,73 C0,58 7,46 17,45 C21,20 34,0 49,0 C64,0 75,18 78,44 C90,45 100,57 100,73 C100,88 92,100 81,100 Z"
          fill={fill}
        />
      )}
      {shapeType === 'cloudFlat' && (
        <path
          d="M13,100 H87 C95,100 100,89 100,74 C100,59 93,47 84,46 C81,19 68,0 53,0 C40,0 29,15 25,38 C12,38 0,52 0,72 C0,88 5,100 13,100 Z"
          fill={fill}
        />
      )}
      {shapeType === 'cloudPuffy' && (
        <path
          d="M21,100 C8,100 0,87 0,70 C0,54 8,40 20,38 C23,14 37,0 53,0 C71,0 84,17 85,40 C94,45 100,57 100,71 C100,87 91,100 78,100 Z"
          fill={fill}
        />
      )}

      {/* HEARTS */}
      {shapeType === 'heart' && (
        <path
          d="M50,100 C50,100 0,66 0,31 C0,13 14,0 30,0 C40,0 47,6 50,14 C53,6 60,0 70,0 C86,0 100,13 100,31 C100,66 50,100 50,100 Z"
          fill={fill}
        />
      )}
      {shapeType === 'heartTall' && (
        <path
          d="M50,100 C50,100 0,66 0,30 C0,12 13,0 28,0 C39,0 47,6 50,14 C53,6 61,0 72,0 C87,0 100,12 100,30 C100,66 50,100 50,100 Z"
          fill={fill}
        />
      )}
      {shapeType === 'heartWide' && (
        <path
          d="M50,100 C50,100 0,68 0,32 C0,14 14,0 30,0 C41,0 47,7 50,15 C53,7 59,0 70,0 C86,0 100,14 100,32 C100,68 50,100 50,100 Z"
          fill={fill}
        />
      )}
      {shapeType === 'heartSoft' && (
        <path
          d="M50,100 C40,92 0,64 0,32 C0,14 14,0 30,0 C41,0 47,6 50,14 C53,6 59,0 70,0 C86,0 100,14 100,32 C100,64 60,92 50,100 Z"
          fill={fill}
        />
      )}

      {/* BANNERS */}
      {shapeType === 'bannerRibbon' && (
        <polygon points="0,0 100,0 84,50 100,100 0,100 16,50" fill={fill} />
      )}
      {shapeType === 'bannerShield' && (
        <polygon points="0,0 100,0 100,72 50,100 0,72" fill={fill} />
      )}
      {shapeType === 'bannerBookmark' && (
        <polygon points="0,0 100,0 100,100 50,76 0,100" fill={fill} />
      )}
      {shapeType === 'bannerTag' && (
        <path d="M12,0 H88 A12,12 0 0,1 100,12 V68 L50,100 L0,68 V12 A12,12 0 0,1 12,0 Z" fill={fill} />
      )}
      {shapeType === 'bannerArch' && (
        <path d="M0,18 A18,18 0 0,1 18,0 H82 A18,18 0 0,1 100,18 V100 L50,78 L0,100 Z" fill={fill} />
      )}

      {/* TEARDROPS */}
      {shapeType === 'teardrop' && (
        <path d="M50,0 C50,0 100,46 100,66 A50,34 0 1,1 0,66 C0,46 50,0 50,0 Z" fill={fill} />
      )}
      {shapeType === 'teardropSlim' && (
        <path d="M50,0 C50,0 100,48 100,68 A50,32 0 1,1 0,68 C0,48 50,0 50,0 Z" fill={fill} />
      )}
      {shapeType === 'teardropWide' && (
        <path d="M50,0 C50,0 100,44 100,63 A50,37 0 1,1 0,63 C0,44 50,0 50,0 Z" fill={fill} />
      )}
      {shapeType === 'teardropFlame' && (
        <path
          d="M58,0 C58,0 100,38 100,65 C100,86 78,100 50,100 C22,100 0,86 0,65 C0,42 44,20 58,0 Z"
          fill={fill}
        />
      )}

      {/* COGS */}
      {shapeType === 'cog' && (
        <path d={gearPath(12, 50, 39, 22)} fill={fill} fillRule="evenodd" />
      )}
      {shapeType === 'cogThin' && (
        <path d={gearPath(10, 50, 37, 20)} fill={fill} fillRule="evenodd" />
      )}
      {shapeType === 'sunburstCog' && (
        <path d={gearPath(14, 50, 31, 16)} fill={fill} fillRule="evenodd" />
      )}
      {shapeType === 'gearHole' && (
        <path d={gearPath(12, 50, 39, 10)} fill={fill} fillRule="evenodd" />
      )}

      {/* SQUARE STARS */}
      {shapeType === 'asterisk6' && renderAsteriskRays(4, 10, fill)}
      {shapeType === 'asterisk8' && renderAsteriskRays(4, 20, fill)}
      {shapeType === 'plusThick' && (
        <g fill={fill}>
          <rect x="33" y="0" width="34" height="100" />
          <rect x="0" y="33" width="100" height="34" />
          <rect x="33" y="0" width="34" height="100" transform="rotate(45 50 50)" />
        </g>
      )}
      {shapeType === 'spark5' && renderAsteriskRays(3, 15, fill)}

      {/* ORGANIC SHAPES */}
      {shapeType === 'flower6' && renderFlowerPetals(8, 9, 25, 25, fill)}
      {shapeType === 'flower8' && renderFlowerPetals(6, 11, 25, 25, fill)}
      {shapeType === 'clover' && (
        <g fill={fill}>
          <circle cx="29" cy="26" r="24" />
          <circle cx="71" cy="26" r="24" />
          <circle cx="24" cy="70" r="24" />
          <circle cx="76" cy="70" r="24" />
          <circle cx="50" cy="50" r="20" />
        </g>
      )}
      {shapeType === 'blob' && (
        <path
          d="M48,1 C72,-2 98,16 100,42 C102,68 80,98 52,100 C24,102 -2,82 0,50 C2,18 24,5 48,1 Z"
          fill={fill}
        />
      )}

      {/* ABSTRACT SHAPES */}
      {shapeType === 'quatrefoil' && (
        <path
          d="M50,0 C68,0 73,19 88,26 C100,32 100,50 96,65 C91,80 77,100 50,100 C23,100 9,80 4,65 C0,50 0,32 12,26 C27,19 32,0 50,0 Z"
          fill={fill}
        />
      )}
      {shapeType === 'hourglass' && (
        <path
          d="M0,0 H100 C100,26 78,40 60,50 C78,60 100,74 100,100 H0 C0,74 22,60 40,50 C22,40 0,26 0,0 Z"
          fill={fill}
        />
      )}
      {shapeType === 'archStack' && (
        <g fill={fill}>
          <path d="M0,48 A50,48 0 0,1 100,48 H0 Z" />
          <rect x="0" y="54" width="100" height="46" rx="23" />
        </g>
      )}
      {shapeType === 'diagonalCut' && (
        <polygon points="36,0 100,0 100,100 0,100 0,36" fill={fill} />
      )}
    </svg>
  );
};
