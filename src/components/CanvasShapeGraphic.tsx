import React from 'react';
import type { ShapeVariant } from '../../shared/types';

interface CanvasShapeGraphicProps {
  shapeType: ShapeVariant;
  fill: string;
}

export const SHAPE_OPTIONS: { id: ShapeVariant; label: string }[] = [
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'circle', label: 'Circle / Oval' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'star', label: 'Star' },
  { id: 'hexagon', label: 'Hexagon' },
  { id: 'arrowRight', label: 'Arrow' },
  { id: 'cross', label: 'Cross' }
];

/**
 * Renders vector SVG geometry for non-rectangular Slide Builder shapes so both
 * the editor canvas and the live presentation stage share identical geometry.
 */
export const CanvasShapeGraphic: React.FC<CanvasShapeGraphicProps> = ({
  shapeType,
  fill
}) => {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      width="100%"
      height="100%"
      style={{ display: 'block', pointerEvents: 'none' }}
    >
      {shapeType === 'rectangle' && <rect x="4" y="8" width="92" height="84" rx="10" fill={fill} />}
      {shapeType === 'circle' && <ellipse cx="50" cy="50" rx="49" ry="49" fill={fill} />}
      {shapeType === 'triangle' && <polygon points="50,2 98,98 2,98" fill={fill} />}
      {shapeType === 'diamond' && <polygon points="50,2 98,50 50,98 2,50" fill={fill} />}
      {shapeType === 'star' && (
        <polygon
          points="50,2 63,36 98,36 70,58 80,94 50,72 20,94 30,58 2,36 37,36"
          fill={fill}
        />
      )}
      {shapeType === 'hexagon' && <polygon points="25,4 75,4 98,50 75,96 25,96 2,50" fill={fill} />}
      {shapeType === 'arrowRight' && (
        <polygon points="2,30 62,30 62,10 98,50 62,90 62,70 2,70" fill={fill} />
      )}
      {shapeType === 'cross' && (
        <polygon
          points="35,4 65,4 65,35 96,35 96,65 65,65 65,96 35,96 35,65 4,65 4,35 35,35"
          fill={fill}
        />
      )}
    </svg>
  );
};
