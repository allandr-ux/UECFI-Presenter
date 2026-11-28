import React from 'react';
import type {
  CanvasElement,
  LineCapStyle,
  LineDashPattern,
  LineRouteType,
  ShapeVariant
} from '../../shared/types';

export const STAGE_VIRTUAL_W = 1920;
export const STAGE_VIRTUAL_H = 1080;

export const LINE_CAP_OPTIONS: Array<{ id: LineCapStyle; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'arrow', label: 'Open Arrow' },
  { id: 'circleOutline', label: 'Hollow Circle' },
  { id: 'squareOutline', label: 'Hollow Square' },
  { id: 'diamondOutline', label: 'Hollow Diamond' },
  { id: 'bar', label: 'Bar' },
  { id: 'arrowFilled', label: 'Solid Arrow' },
  { id: 'circleFilled', label: 'Solid Circle' },
  { id: 'squareFilled', label: 'Solid Square' },
  { id: 'diamondFilled', label: 'Solid Diamond' }
];

/**
 * Returns true for shape variants in the Lines category that should be inserted
 * as responsive, multi-part line elements (excluding thick wavy decorative lines).
 */
export function isResponsiveLineShape(shapeType: ShapeVariant): boolean {
  return (
    shapeType.startsWith('line') &&
    shapeType !== 'lineWaveThick' &&
    shapeType !== 'lineZigzagWaveThick'
  );
}

export function getLinePresetConfig(shapeType: ShapeVariant): {
  lineDash: LineDashPattern;
  lineStartCap: LineCapStyle;
  lineEndCap: LineCapStyle;
  lineRoundedCaps: boolean;
} {
  switch (shapeType) {
    case 'lineDoubleChevronArrow':
      return { lineDash: 'solid', lineStartCap: 'arrow', lineEndCap: 'arrow', lineRoundedCaps: true };
    case 'lineDottedArrow':
      return { lineDash: 'dotted', lineStartCap: 'none', lineEndCap: 'arrow', lineRoundedCaps: true };
    case 'lineChevronArrow':
      return { lineDash: 'solid', lineStartCap: 'none', lineEndCap: 'arrow', lineRoundedCaps: true };
    case 'lineArrowRight':
      return { lineDash: 'solid', lineStartCap: 'none', lineEndCap: 'arrowFilled', lineRoundedCaps: false };
    case 'lineDottedDoubleArrow':
      return { lineDash: 'dotted', lineStartCap: 'arrow', lineEndCap: 'arrow', lineRoundedCaps: true };
    case 'lineDotted':
      return { lineDash: 'dotted', lineStartCap: 'none', lineEndCap: 'none', lineRoundedCaps: true };
    case 'lineDashed':
      return { lineDash: 'dashed', lineStartCap: 'none', lineEndCap: 'none', lineRoundedCaps: false };
    case 'lineCircleEnds':
      return { lineDash: 'solid', lineStartCap: 'circleFilled', lineEndCap: 'circleFilled', lineRoundedCaps: false };
    case 'lineHollowCircleEnds':
      return { lineDash: 'solid', lineStartCap: 'circleOutline', lineEndCap: 'circleOutline', lineRoundedCaps: false };
    case 'lineBarEnds':
      return { lineDash: 'solid', lineStartCap: 'bar', lineEndCap: 'bar', lineRoundedCaps: false };
    case 'lineSquareEnds':
      return { lineDash: 'solid', lineStartCap: 'squareFilled', lineEndCap: 'squareFilled', lineRoundedCaps: false };
    case 'lineHollowSquareEnds':
      return { lineDash: 'solid', lineStartCap: 'squareOutline', lineEndCap: 'squareOutline', lineRoundedCaps: false };
    case 'lineDiamondEnds':
      return { lineDash: 'solid', lineStartCap: 'diamondFilled', lineEndCap: 'diamondFilled', lineRoundedCaps: false };
    case 'lineHollowDiamondEnds':
      return { lineDash: 'solid', lineStartCap: 'diamondOutline', lineEndCap: 'diamondOutline', lineRoundedCaps: false };
    case 'line':
    default:
      return { lineDash: 'solid', lineStartCap: 'none', lineEndCap: 'none', lineRoundedCaps: false };
  }
}

export function getLineEndpoints(el: CanvasElement): {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx: number;
  cy: number;
  lineType: LineRouteType;
} {
  const x1 = el.lineX1 ?? el.x;
  const y1 = el.lineY1 ?? el.y + el.height / 2;
  const x2 = el.lineX2 ?? el.x + el.width;
  const y2 = el.lineY2 ?? el.y + el.height / 2;
  const cx = el.lineCx ?? (x1 + x2) / 2;
  const cy = el.lineCy ?? (y1 + y2) / 2;
  const lineType: LineRouteType = el.lineType ?? 'straight';
  return { x1, y1, x2, y2, cx, cy, lineType };
}

export function getLineCurvePoints(el: CanvasElement): Array<{ x: number; y: number }> {
  if (el.linePoints && el.linePoints.length > 0) {
    return el.linePoints;
  }
  const { x1, y1, x2, y2, cx, cy } = getLineEndpoints(el);
  if (typeof el.lineCx === 'number' || typeof el.lineCy === 'number') {
    return [{ x: cx, y: cy }];
  }
  return [{ x: Number(((x1 + x2) / 2).toFixed(2)), y: Number(((y1 + y2) / 2).toFixed(2)) }];
}

/**
 * Returns segment index + midpoint (%) where a new curving handle can be inserted.
 */
export function getCurveInsertMidpoints(
  el: CanvasElement
): Array<{ insertIndex: number; x: number; y: number }> {
  const { x1, y1, x2, y2 } = getLineEndpoints(el);
  const mids = getLineCurvePoints(el);
  const all = [{ x: x1, y: y1 }, ...mids, { x: x2, y: y2 }];
  const result: Array<{ insertIndex: number; x: number; y: number }> = [];
  for (let i = 0; i < all.length - 1; i++) {
    result.push({
      insertIndex: i,
      x: Number(((all[i].x + all[i + 1].x) / 2).toFixed(2)),
      y: Number(((all[i].y + all[i + 1].y) / 2).toFixed(2))
    });
  }
  return result;
}

/**
 * Recomputes bounding box (x, y, width, height) in stage % from the line's endpoints/control.
 */
export function computeLineBounds(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx?: number,
  cy?: number,
  extraPoints?: Array<{ x: number; y: number }>
): { x: number; y: number; width: number; height: number } {
  const xs = [x1, x2];
  const ys = [y1, y2];
  if (typeof cx === 'number') xs.push(cx);
  if (typeof cy === 'number') ys.push(cy);
  if (extraPoints) {
    for (const pt of extraPoints) {
      xs.push(pt.x);
      ys.push(pt.y);
    }
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(2.5, Number((maxX - minX).toFixed(2)));
  const height = Math.max(2.5, Number((maxY - minY).toFixed(2)));
  return {
    x: Number(minX.toFixed(2)),
    y: Number(minY.toFixed(2)),
    width,
    height
  };
}

/**
 * Computes elbowed orthogonal points & rounded SVG path in virtual 1920x1080 coordinates.
 */
function buildElbowGeometry(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  hx: number,
  hy: number
): {
  d: string;
  startAngle: number;
  endAngle: number;
  midHandlePct: { x: number; y: number };
} {
  const dx = p2x - p1x;
  const dy = p2y - p1y;
  const horizontalPrimary = Math.abs(dx) >= Math.abs(dy);

  let c1x: number;
  let c1y: number;
  let c2x: number;
  let c2y: number;
  let midHandlePct: { x: number; y: number };

  if (horizontalPrimary) {
    // Route: P1 -> (p1x, hy) -> (p2x, hy) -> P2
    c1x = p1x;
    c1y = hy;
    c2x = p2x;
    c2y = hy;
    midHandlePct = {
      x: ((p1x + p2x) / 2 / STAGE_VIRTUAL_W) * 100,
      y: (hy / STAGE_VIRTUAL_H) * 100
    };
  } else {
    // Route: P1 -> (hx, p1y) -> (hx, p2y) -> P2
    c1x = hx;
    c1y = p1y;
    c2x = hx;
    c2y = p2y;
    midHandlePct = {
      x: (hx / STAGE_VIRTUAL_W) * 100,
      y: ((p1y + p2y) / 2 / STAGE_VIRTUAL_H) * 100
    };
  }

  const pts = [
    { x: p1x, y: p1y },
    { x: c1x, y: c1y },
    { x: c2x, y: c2y },
    { x: p2x, y: p2y }
  ];

  // Build path with smooth rounded corners
  const maxR = 26;
  const parts: string[] = [`M ${pts[0].x} ${pts[0].y}`];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];
    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);
    if (len1 < 1 || len2 < 1) {
      parts.push(`L ${curr.x} ${curr.y}`);
      continue;
    }
    const r = Math.min(maxR, len1 / 2, len2 / 2);
    const inX = curr.x - (v1x / len1) * r;
    const inY = curr.y - (v1y / len1) * r;
    const outX = curr.x + (v2x / len2) * r;
    const outY = curr.y + (v2y / len2) * r;
    parts.push(`L ${inX} ${inY} Q ${curr.x} ${curr.y} ${outX} ${outY}`);
  }
  parts.push(`L ${pts[3].x} ${pts[3].y}`);

  const startVecX = Math.hypot(c1x - p1x, c1y - p1y) > 0.5 ? c1x - p1x : dx;
  const startVecY = Math.hypot(c1x - p1x, c1y - p1y) > 0.5 ? c1y - p1y : dy;
  const endVecX = Math.hypot(p2x - c2x, p2y - c2y) > 0.5 ? p2x - c2x : dx;
  const endVecY = Math.hypot(p2x - c2x, p2y - c2y) > 0.5 ? p2y - c2y : dy;

  return {
    d: parts.join(' '),
    startAngle: Math.atan2(startVecY, startVecX),
    endAngle: Math.atan2(endVecY, endVecX),
    midHandlePct
  };
}

export function getElbowMidHandlePct(el: CanvasElement): { x: number; y: number } {
  const { x1, y1, x2, y2, cx, cy } = getLineEndpoints(el);
  return buildElbowGeometry(
    x1 * (STAGE_VIRTUAL_W / 100),
    y1 * (STAGE_VIRTUAL_H / 100),
    x2 * (STAGE_VIRTUAL_W / 100),
    y2 * (STAGE_VIRTUAL_H / 100),
    cx * (STAGE_VIRTUAL_W / 100),
    cy * (STAGE_VIRTUAL_H / 100)
  ).midHandlePct;
}

function getDashArray(dash: LineDashPattern, strokeWidth: number, rounded: boolean): string | undefined {
  switch (dash) {
    case 'dashed':
      return `${strokeWidth * 3.2} ${strokeWidth * 2}`;
    case 'shortDashed':
      return `${strokeWidth * 1.6} ${strokeWidth * 1.4}`;
    case 'dotted':
      return rounded ? `0.01 ${strokeWidth * 2.1}` : `${strokeWidth} ${strokeWidth * 1.4}`;
    case 'solid':
    default:
      return undefined;
  }
}

function renderCap(
  cap: LineCapStyle,
  x: number,
  y: number,
  angleRad: number,
  strokeWidth: number,
  color: string,
  rounded: boolean,
  key: string
) {
  if (cap === 'none') return null;
  const deg = (angleRad * 180) / Math.PI;
  const size = Math.max(12, strokeWidth * 3.2);
  const r = size * 0.42;
  const lineCap = rounded ? 'round' : 'butt';
  const lineJoin = rounded ? 'round' : 'miter';

  // Cap is drawn pointing in +X direction at (0,0) and rotated to angleRad
  return (
    <g key={key} transform={`translate(${x} ${y}) rotate(${deg})`}>
      {cap === 'arrow' && (
        <path
          d={`M ${-size * 0.72} ${-size * 0.48} L 0 0 L ${-size * 0.72} ${size * 0.48}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap={lineCap}
          strokeLinejoin={lineJoin}
        />
      )}
      {cap === 'arrowFilled' && (
        <polygon
          points={`0,0 ${-size * 0.92},${-size * 0.52} ${-size * 0.92},${size * 0.52}`}
          fill={color}
          stroke={color}
          strokeWidth={strokeWidth * 0.4}
          strokeLinejoin={lineJoin}
        />
      )}
      {cap === 'circleOutline' && (
        <circle
          cx={0}
          cy={0}
          r={r}
          fill="#0f172a"
          fillOpacity={0.01}
          stroke={color}
          strokeWidth={strokeWidth}
        />
      )}
      {cap === 'circleFilled' && <circle cx={0} cy={0} r={r} fill={color} />}
      {cap === 'squareOutline' && (
        <rect
          x={-r}
          y={-r}
          width={r * 2}
          height={r * 2}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin={lineJoin}
        />
      )}
      {cap === 'squareFilled' && <rect x={-r} y={-r} width={r * 2} height={r * 2} fill={color} />}
      {cap === 'diamondOutline' && (
        <polygon
          points={`${r * 1.25},0 0,${r * 1.25} ${-r * 1.25},0 0,${-r * 1.25}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin={lineJoin}
        />
      )}
      {cap === 'diamondFilled' && (
        <polygon
          points={`${r * 1.25},0 0,${r * 1.25} ${-r * 1.25},0 0,${-r * 1.25}`}
          fill={color}
        />
      )}
      {cap === 'bar' && (
        <line
          x1={0}
          y1={-size * 0.52}
          x2={0}
          y2={size * 0.52}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap={lineCap}
        />
      )}
    </g>
  );
}

interface CanvasLineGraphicProps {
  element: CanvasElement;
  interactive?: boolean;
  onPointerDownBody?: (e: React.PointerEvent<SVGPathElement>) => void;
  onMouseEnterBody?: () => void;
  onMouseLeaveBody?: () => void;
}

/**
 * Renders a responsive vector line (straight, elbowed, or curved) in 1920x1080 virtual stage space
 * with independent stroke weight, dash pattern, rounded endpoints, and start/end caps.
 */
export const CanvasLineGraphic: React.FC<CanvasLineGraphicProps> = ({
  element,
  interactive = false,
  onPointerDownBody,
  onMouseEnterBody,
  onMouseLeaveBody
}) => {
  const { x1, y1, x2, y2, cx, cy, lineType } = getLineEndpoints(element);
  const p1x = x1 * (STAGE_VIRTUAL_W / 100);
  const p1y = y1 * (STAGE_VIRTUAL_H / 100);
  const p2x = x2 * (STAGE_VIRTUAL_W / 100);
  const p2y = y2 * (STAGE_VIRTUAL_H / 100);
  const hx = cx * (STAGE_VIRTUAL_W / 100);
  const hy = cy * (STAGE_VIRTUAL_H / 100);

  const strokeWidth = Math.max(1, element.lineStrokeWidth ?? 4);
  const color = element.color || element.backgroundColor || '#ffffff';
  const dash: LineDashPattern = element.lineDash ?? 'solid';
  const rounded = Boolean(element.lineRoundedCaps);
  const startCap: LineCapStyle = element.lineStartCap ?? 'none';
  const endCap: LineCapStyle = element.lineEndCap ?? 'none';

  let pathD = '';
  let startAngle = Math.atan2(p2y - p1y, p2x - p1x);
  let endAngle = startAngle;

  if (lineType === 'curved') {
    const midPts = getLineCurvePoints(element).map((pt) => ({
      x: pt.x * (STAGE_VIRTUAL_W / 100),
      y: pt.y * (STAGE_VIRTUAL_H / 100)
    }));
    const allPts = [{ x: p1x, y: p1y }, ...midPts, { x: p2x, y: p2y }];

    if (allPts.length === 3) {
      // Single curving handle: exact quadratic Bezier passing through midPts[0] at t=0.5
      const qcx = 2 * allPts[1].x - 0.5 * (p1x + p2x);
      const qcy = 2 * allPts[1].y - 0.5 * (p1y + p2y);
      pathD = `M ${p1x} ${p1y} Q ${qcx} ${qcy} ${p2x} ${p2y}`;
      if (Math.hypot(qcx - p1x, qcy - p1y) > 0.5) {
        startAngle = Math.atan2(qcy - p1y, qcx - p1x);
      }
      if (Math.hypot(p2x - qcx, p2y - qcy) > 0.5) {
        endAngle = Math.atan2(p2y - qcy, p2x - qcx);
      }
    } else {
      // Multi-point smooth Catmull-Rom to cubic Bezier spline passing through every handle
      const segs: string[] = [`M ${p1x} ${p1y}`];
      let firstCp1: { x: number; y: number } | null = null;
      let lastCp2: { x: number; y: number } | null = null;
      for (let i = 0; i < allPts.length - 1; i++) {
        const p0 = allPts[Math.max(0, i - 1)];
        const p1 = allPts[i];
        const p2 = allPts[i + 1];
        const p3 = allPts[Math.min(allPts.length - 1, i + 2)];
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        if (i === 0) firstCp1 = { x: cp1x, y: cp1y };
        if (i === allPts.length - 2) lastCp2 = { x: cp2x, y: cp2y };
        segs.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
      }
      pathD = segs.join(' ');
      if (firstCp1 && Math.hypot(firstCp1.x - p1x, firstCp1.y - p1y) > 0.5) {
        startAngle = Math.atan2(firstCp1.y - p1y, firstCp1.x - p1x);
      }
      if (lastCp2 && Math.hypot(p2x - lastCp2.x, p2y - lastCp2.y) > 0.5) {
        endAngle = Math.atan2(p2y - lastCp2.y, p2x - lastCp2.x);
      }
    }
  } else if (lineType === 'elbowed') {
    const elbow = buildElbowGeometry(p1x, p1y, p2x, p2y, hx, hy);
    pathD = elbow.d;
    startAngle = elbow.startAngle;
    endAngle = elbow.endAngle;
  } else {
    pathD = `M ${p1x} ${p1y} L ${p2x} ${p2y}`;
  }

  const dashArray = getDashArray(dash, strokeWidth, rounded);
  const strokeLinecap = dash === 'dotted' && rounded ? 'round' : rounded ? 'round' : 'butt';
  const strokeLinejoin = rounded ? 'round' : 'miter';

  // Trim path slightly into filled/outline caps so the stroke doesn't poke past sharp arrow tips
  const capOffset = (cap: LineCapStyle) =>
    cap === 'arrowFilled' ? strokeWidth * 1.4 : 0;
  const startTrim = capOffset(startCap);
  const endTrim = capOffset(endCap);

  let visiblePathD = pathD;
  if (lineType === 'straight' && (startTrim > 0 || endTrim > 0)) {
    const len = Math.hypot(p2x - p1x, p2y - p1y);
    if (len > startTrim + endTrim + 2) {
      const ux = (p2x - p1x) / len;
      const uy = (p2y - p1y) / len;
      visiblePathD = `M ${p1x + ux * startTrim} ${p1y + uy * startTrim} L ${p2x - ux * endTrim} ${p2y - uy * endTrim}`;
    }
  }

  return (
    <g>
      <path
        d={visiblePathD}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray}
        strokeLinecap={strokeLinecap}
        strokeLinejoin={strokeLinejoin}
      />
      {renderCap(startCap, p1x, p1y, startAngle + Math.PI, strokeWidth, color, rounded, 'start-cap')}
      {renderCap(endCap, p2x, p2y, endAngle, strokeWidth, color, rounded, 'end-cap')}
      {interactive && (
        <path
          d={pathD}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(28, strokeWidth + 22)}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: 'stroke', cursor: 'move' }}
          onPointerDown={onPointerDownBody}
          onMouseEnter={onMouseEnterBody}
          onMouseLeave={onMouseLeaveBody}
        />
      )}
    </g>
  );
};
