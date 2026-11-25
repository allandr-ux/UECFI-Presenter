import type React from 'react';
import type { CanvasAnimationType, CanvasElement } from '../../shared/types';

export interface CanvasAnimationPreset {
  id: CanvasAnimationType;
  label: string;
  group: 'none' | 'entrance' | 'loop';
  defaultDuration: number;
}

export const CANVAS_ANIMATION_PRESETS: CanvasAnimationPreset[] = [
  { id: 'none', label: 'None', group: 'none', defaultDuration: 0.7 },
  // Entrance animations (play smoothly when slide appears)
  { id: 'fadeIn', label: 'Fade In', group: 'entrance', defaultDuration: 0.7 },
  { id: 'rise', label: 'Rise (Slide Up)', group: 'entrance', defaultDuration: 0.75 },
  { id: 'slideLeft', label: 'Slide Left', group: 'entrance', defaultDuration: 0.75 },
  { id: 'slideRight', label: 'Slide Right', group: 'entrance', defaultDuration: 0.75 },
  { id: 'pop', label: 'Pop / Zoom', group: 'entrance', defaultDuration: 0.65 },
  // Continuous motion loops (subtle ambient motion)
  { id: 'float', label: 'Gentle Float', group: 'loop', defaultDuration: 3.2 },
  { id: 'pulse', label: 'Soft Pulse', group: 'loop', defaultDuration: 2.6 },
  { id: 'glow', label: 'Subtle Glow', group: 'loop', defaultDuration: 2.8 },
  { id: 'spin', label: 'Slow Spin', group: 'loop', defaultDuration: 10 },
  { id: 'sway', label: 'Gentle Sway', group: 'loop', defaultDuration: 3.6 }
];

const KEYFRAME_MAP: Record<Exclude<CanvasAnimationType, 'none'>, string> = {
  fadeIn: 'uecfiAnimFadeIn',
  rise: 'uecfiAnimRise',
  slideLeft: 'uecfiAnimSlideLeft',
  slideRight: 'uecfiAnimSlideRight',
  pop: 'uecfiAnimPop',
  float: 'uecfiAnimFloat',
  pulse: 'uecfiAnimPulse',
  glow: 'uecfiAnimGlow',
  spin: 'uecfiAnimSpin',
  sway: 'uecfiAnimSway'
};

export function isLoopAnimation(type?: CanvasAnimationType): boolean {
  return (
    type === 'float' ||
    type === 'pulse' ||
    type === 'glow' ||
    type === 'spin' ||
    type === 'sway'
  );
}

/**
 * Returns the CSS animation style for a CanvasElement so both the live stage
 * and the Slide Builder preview render identical 60fps motion.
 */
export function getElementAnimationStyle(el: CanvasElement): React.CSSProperties {
  const anim = el.animation;
  if (!anim || anim === 'none') return {};
  const preset = CANVAS_ANIMATION_PRESETS.find((p) => p.id === anim);
  const duration = el.animationDuration ?? preset?.defaultDuration ?? 0.7;
  const delay = el.animationDelay ?? 0;
  const keyframe = KEYFRAME_MAP[anim];

  if (isLoopAnimation(anim)) {
    const timing = anim === 'spin' ? 'linear' : 'ease-in-out';
    return {
      animation: `${keyframe} ${duration}s ${timing} ${delay}s infinite`
    };
  }

  return {
    animation: `${keyframe} ${duration}s cubic-bezier(0.22, 1, 0.36, 1) ${delay}s both`
  };
}
