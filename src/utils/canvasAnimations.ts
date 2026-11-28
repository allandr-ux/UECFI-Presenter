import type React from 'react';
import type { CanvasAnimationType, CanvasElement } from '../../shared/types';

export type AnimationDirection = 'left' | 'right' | 'up' | 'down';

export interface CanvasAnimationPreset {
  id: CanvasAnimationType;
  label: string;
  group: 'none' | 'entrance' | 'loop';
  defaultDuration: number;
  supportsUnit?: boolean;
  directions?: AnimationDirection[];
  supportsIntensity?: boolean;
}

export const CANVAS_ANIMATION_PRESETS: CanvasAnimationPreset[] = [
  { id: 'none', label: 'None', group: 'none', defaultDuration: 0.7 },
  // Entrance animations (play smoothly when slide appears)
  { id: 'fadeIn', label: 'Fade In', group: 'entrance', defaultDuration: 0.7 },
  { id: 'rise', label: 'Rise (Slide Up)', group: 'entrance', defaultDuration: 0.75, directions: ['up', 'down'] },
  { id: 'slideLeft', label: 'Slide Left', group: 'entrance', defaultDuration: 0.75, directions: ['left', 'right'] },
  { id: 'slideRight', label: 'Slide Right', group: 'entrance', defaultDuration: 0.75, directions: ['left', 'right'] },
  { id: 'pop', label: 'Pop / Zoom', group: 'entrance', defaultDuration: 0.65, supportsIntensity: true },
  {
    id: 'smokeDissolve',
    label: 'Smoke Dissolve',
    group: 'entrance',
    defaultDuration: 1.1,
    supportsUnit: true,
    directions: ['up', 'down', 'left', 'right'],
    supportsIntensity: true
  },
  {
    id: 'maskRise',
    label: 'Mask Rise',
    group: 'entrance',
    defaultDuration: 0.85,
    supportsUnit: true,
    directions: ['up', 'down']
  },
  {
    id: 'powerOn',
    label: 'Power On',
    group: 'entrance',
    defaultDuration: 1.2,
    supportsUnit: true
  },
  {
    id: 'strokeDraw',
    label: 'Stroke Draw',
    group: 'entrance',
    defaultDuration: 3.0
  },
  // Continuous motion loops (subtle ambient motion)
  { id: 'float', label: 'Gentle Float', group: 'loop', defaultDuration: 3.2, supportsIntensity: true },
  { id: 'pulse', label: 'Soft Pulse', group: 'loop', defaultDuration: 2.6, supportsIntensity: true },
  { id: 'glow', label: 'Subtle Glow', group: 'loop', defaultDuration: 2.8, supportsIntensity: true },
  { id: 'spin', label: 'Slow Spin', group: 'loop', defaultDuration: 10 },
  { id: 'sway', label: 'Gentle Sway', group: 'loop', defaultDuration: 3.6, supportsIntensity: true },
  { id: 'vaporHaze', label: 'Vapor Haze', group: 'loop', defaultDuration: 7, supportsIntensity: true },
  { id: 'squishy', label: 'Squishy', group: 'loop', defaultDuration: 1.5, supportsUnit: true, supportsIntensity: true },
  { id: 'ripple', label: 'Wave Ripple', group: 'loop', defaultDuration: 1.6, supportsUnit: true, supportsIntensity: true },
  { id: 'wobble3d', label: '3D Wobble', group: 'loop', defaultDuration: 5, supportsIntensity: true }
];

const KEYFRAME_MAP: Record<Exclude<CanvasAnimationType, 'none'>, string> = {
  fadeIn: 'uecfiAnimFadeIn',
  rise: 'uecfiAnimRise',
  slideLeft: 'uecfiAnimSlideLeft',
  slideRight: 'uecfiAnimSlideRight',
  pop: 'uecfiAnimPop',
  smokeDissolve: 'uecfiAnimFadeIn',
  maskRise: 'uecfiAnimRise',
  powerOn: 'uecfiAnimFadeIn',
  strokeDraw: 'uecfiAnimFadeIn',
  float: 'uecfiAnimFloat',
  pulse: 'uecfiAnimPulse',
  glow: 'uecfiAnimGlow',
  spin: 'uecfiAnimSpin',
  sway: 'uecfiAnimSway',
  vaporHaze: 'uecfiAnimVaporHaze',
  squishy: 'uecfiAnimPulse',
  ripple: 'uecfiAnimFloat',
  wobble3d: 'uecfiAnimWobble3d'
};

export const SMOKE_CHAR_VECTORS: Array<{ x: string; y: string; r: string }> = [
  { x: '-30px', y: '-58px', r: '-18deg' },
  { x: '14px', y: '-70px', r: '10deg' },
  { x: '-10px', y: '-52px', r: '-6deg' },
  { x: '26px', y: '-66px', r: '14deg' },
  { x: '-22px', y: '-74px', r: '-12deg' },
  { x: '18px', y: '-56px', r: '8deg' }
];

export function getSmokeVector(
  idx: number,
  direction: AnimationDirection = 'up',
  intensity = 1
): { x: string; y: string; r: string } {
  const base = SMOKE_CHAR_VECTORS[idx % SMOKE_CHAR_VECTORS.length];
  const bx = parseFloat(base.x);
  const by = parseFloat(base.y);
  const br = parseFloat(base.r);
  const k = Math.max(0.3, Math.min(2, intensity));
  let x = bx * k;
  let y = by * k;
  if (direction === 'down') {
    y = Math.abs(by) * k;
  } else if (direction === 'left') {
    x = -Math.abs(by) * k;
    y = bx * 0.6 * k;
  } else if (direction === 'right') {
    x = Math.abs(by) * k;
    y = bx * 0.6 * k;
  }
  return {
    x: `${Math.round(x)}px`,
    y: `${Math.round(y)}px`,
    r: `${Math.round(br * k)}deg`
  };
}

export function isLoopAnimation(type?: CanvasAnimationType): boolean {
  return (
    type === 'float' ||
    type === 'pulse' ||
    type === 'glow' ||
    type === 'spin' ||
    type === 'sway' ||
    type === 'vaporHaze' ||
    type === 'squishy' ||
    type === 'ripple' ||
    type === 'wobble3d'
  );
}

/**
 * Returns the CSS animation style for a CanvasElement so both the live stage
 * and the Slide Builder preview render identical 60fps motion.
 */
export function getElementAnimationStyle(el: CanvasElement): React.CSSProperties {
  const anim = el.animation;
  if (!anim || anim === 'none') return {};
  if (
    (anim === 'smokeDissolve' ||
      anim === 'maskRise' ||
      anim === 'powerOn' ||
      anim === 'strokeDraw' ||
      anim === 'squishy' ||
      anim === 'ripple') &&
    el.kind === 'text'
  ) {
    return {};
  }
  const preset = CANVAS_ANIMATION_PRESETS.find((p) => p.id === anim);
  const duration = el.animationDuration ?? preset?.defaultDuration ?? 0.7;
  const delay = el.animationDelay ?? 0;
  let keyframe = KEYFRAME_MAP[anim];
  if (anim === 'rise' && el.animationDirection === 'down') {
    keyframe = 'uecfiAnimDropDown';
  } else if ((anim === 'slideLeft' || anim === 'slideRight') && el.animationDirection === 'right') {
    keyframe = 'uecfiAnimSlideRight';
  } else if ((anim === 'slideLeft' || anim === 'slideRight') && el.animationDirection === 'left') {
    keyframe = 'uecfiAnimSlideLeft';
  }

  if (isLoopAnimation(anim)) {
    const timing = anim === 'spin' ? 'linear' : 'ease-in-out';
    const intensity = el.animationIntensity ?? 1;
    return {
      animation: `${keyframe} ${duration}s ${timing} ${delay}s infinite`,
      ...(anim === 'wobble3d'
        ? {
            transformStyle: 'preserve-3d',
            ['--wobble-k' as string]: intensity
          }
        : {})
    };
  }

  return {
    animation: `${keyframe} ${duration}s cubic-bezier(0.22, 1, 0.36, 1) ${delay}s both`
  };
}
