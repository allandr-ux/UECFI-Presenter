import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../utils/cn';

interface ActiveTooltip {
  text: string;
  target: HTMLElement;
}

interface TooltipCoords {
  top: number;
  left: number;
  arrowLeft: number;
  placement: 'bottom' | 'top';
  ready: boolean;
}

function extractTooltipText(el: HTMLElement): string {
  const titleAttr = el.getAttribute('title');
  if (titleAttr !== null) {
    el.setAttribute('data-html-tooltip', titleAttr);
    el.removeAttribute('title');
    return titleAttr.trim();
  }
  return (el.getAttribute('data-html-tooltip') ?? '').trim();
}

function findTooltipTarget(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;
  const candidate = node.closest('[title], [data-html-tooltip]');
  if (!(candidate instanceof HTMLElement)) return null;
  if (candidate.tagName === 'IFRAME') return null;
  return candidate;
}

/**
 * Global HTML tooltip renderer that converts native `title` attributes
 * across the UI into styled dark pill tooltips with directional carets.
 * Uses `popover="manual"` so tooltips render in the Top Layer above open `<dialog>` modals.
 */
export const HtmlTooltipLayer: React.FC = () => {
  const [active, setActive] = useState<ActiveTooltip | null>(null);
  const [coords, setCoords] = useState<TooltipCoords>({
    top: 0,
    left: 0,
    arrowLeft: 12,
    placement: 'bottom',
    ready: false
  });
  const popoverRef = useRef<HTMLDivElement>(null);
  const activeTargetRef = useRef<HTMLElement | null>(null);
  const showTimerRef = useRef<number | null>(null);
  const lastClosedAtRef = useRef<number>(0);

  useEffect(() => {
    const clearShowTimer = () => {
      if (showTimerRef.current !== null) {
        window.clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };

    const hideTooltip = () => {
      clearShowTimer();
      if (activeTargetRef.current) {
        lastClosedAtRef.current = performance.now();
        activeTargetRef.current = null;
      }
      setActive(null);
    };

    const scheduleShow = (target: HTMLElement, text: string, immediate = false) => {
      clearShowTimer();
      activeTargetRef.current = target;
      const recentlyClosed = performance.now() - lastClosedAtRef.current < 260;
      if (immediate || recentlyClosed) {
        setActive({ text, target });
        return;
      }
      showTimerRef.current = window.setTimeout(() => {
        showTimerRef.current = null;
        if (activeTargetRef.current === target && target.isConnected) {
          setActive({ text, target });
        }
      }, 200);
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = findTooltipTarget(e.target);
      if (!target) {
        if (activeTargetRef.current) hideTooltip();
        return;
      }
      const text = extractTooltipText(target);
      if (!text) {
        if (activeTargetRef.current) hideTooltip();
        return;
      }
      if (activeTargetRef.current === target) return;
      scheduleShow(target, text);
    };

    const handleMouseOut = (e: MouseEvent) => {
      const current = activeTargetRef.current;
      if (!current) return;
      const related = e.relatedTarget as Node | null;
      if (related && current.contains(related)) return;
      const nextTarget = findTooltipTarget(related);
      if (nextTarget === current) return;
      hideTooltip();
    };

    const handleFocusIn = (e: FocusEvent) => {
      const target = findTooltipTarget(e.target);
      if (!target) return;
      let isFocusVisible = false;
      try {
        isFocusVisible = target.matches(':focus-visible');
      } catch {
        isFocusVisible = false;
      }
      if (!isFocusVisible) return;
      const text = extractTooltipText(target);
      if (!text) return;
      scheduleShow(target, text, true);
    };

    const handleFocusOut = () => {
      hideTooltip();
    };

    const handlePointerDown = () => {
      hideTooltip();
    };

    const handleScroll = () => {
      if (activeTargetRef.current) hideTooltip();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeTargetRef.current) {
        hideTooltip();
      }
    };

    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('scroll', handleScroll, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('blur', handleFocusOut);

    return () => {
      clearShowTimer();
      document.removeEventListener('mouseover', handleMouseOver, true);
      document.removeEventListener('mouseout', handleMouseOut, true);
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('blur', handleFocusOut);
    };
  }, []);

  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el) return;

    if (!active || !active.target.isConnected) {
      try {
        if (el.matches(':popover-open')) el.hidePopover();
      } catch {
        // Ignore if popover API is unsupported
      }
      setCoords((prev) => (prev.ready ? { ...prev, ready: false } : prev));
      return;
    }

    try {
      if (!el.matches(':popover-open')) el.showPopover();
    } catch {
      // Fallback to fixed positioning
    }

    const rect = active.target.getBoundingClientRect();
    const tipRect = el.getBoundingClientRect();
    const margin = 8;
    const offset = 8;

    let placement: 'bottom' | 'top' = 'bottom';
    let top = rect.bottom + offset;

    if (
      top + tipRect.height > window.innerHeight - margin &&
      rect.top - offset - tipRect.height >= margin
    ) {
      placement = 'top';
      top = rect.top - offset - tipRect.height;
    }

    const targetCenterX = rect.left + rect.width / 2;
    const idealLeft = targetCenterX - tipRect.width / 2;
    const left = Math.max(margin, Math.min(window.innerWidth - tipRect.width - margin, idealLeft));
    const arrowLeft = Math.max(10, Math.min(tipRect.width - 10, targetCenterX - left));

    setCoords({ top, left, arrowLeft, placement, ready: true });
  }, [active]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={popoverRef}
      popover="manual"
      role="tooltip"
      aria-hidden={!active}
      className={cn(
        'pointer-events-none fixed inset-auto z-[2147483647] m-0 overflow-visible border-0 bg-transparent p-0 transition-opacity duration-[110ms] ease-out',
        active && coords.ready ? 'opacity-100' : 'opacity-0'
      )}
      style={{
        top: `${coords.top}px`,
        left: `${coords.left}px`
      }}
    >
      {active && (
        <div className="relative max-w-[280px] break-words rounded-md border border-white/14 bg-[#1a1e23] px-2.5 py-[5px] text-center text-[0.75rem] font-medium leading-[1.35] whitespace-normal text-slate-100 shadow-[0_6px_18px_rgba(0,0,0,0.5)]">
          {active.text}
          <span
            aria-hidden="true"
            className={cn(
              'absolute h-2 w-2 rotate-45 bg-[#1a1e23]',
              coords.placement === 'bottom'
                ? '-top-[5px] border-t border-l border-white/14'
                : '-bottom-[5px] border-r border-b border-white/14'
            )}
            style={{
              left: `${coords.arrowLeft - 4}px`
            }}
          />
        </div>
      )}
    </div>,
    document.body
  );
};
