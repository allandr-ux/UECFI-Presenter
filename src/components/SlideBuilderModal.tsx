import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Box,
  ChevronLeft,
  Copy,
  FlipHorizontal2,
  FlipVertical2,
  GripVertical,
  Image as ImageIcon,
  Italic,
  Layers,
  Minus,
  Palette,
  Plus,
  Redo2,
  RotateCw,
  Sparkles,
  Square,
  Trash2,
  Type,
  Underline,
  Undo2,
  Upload,
  Wand2,
  X
} from 'lucide-react';
import type {
  CanvasAnimationType,
  CanvasElement,
  CanvasThreeDAnimation,
  CanvasThreeDMaterial,
  FrameVariant,
  ParticipantStageConfig,
  ProgramItem,
  ShapeVariant,
  SlideBlock,
  StudioBoxRect
} from '../../shared/types';
import {
  DEFAULT_PARTICIPANT_BOX,
  DEFAULT_PRESENTATION_BOX,
  DEFAULT_STUDIO_BACKGROUND
} from './ParticipantOverlay';
import { useTerminology } from '../hooks/useTerminology';
import { LOCAL_FONTS } from '../fonts';
import {
  CANVAS_ANIMATION_PRESETS,
  getElementAnimationStyle,
  isLoopAnimation
} from '../utils/canvasAnimations';
import { saveUserMediaFile } from '../utils/mediaUpload';
import { buildColoredSvgDataUrl } from './AssetBrowserModal';
import { BackgroundImagePicker } from './BackgroundImagePicker';
import { CanvasElementsDrawer } from './CanvasElementsDrawer';
import {
  CanvasFrameGraphic,
  clampFrameImageTransform,
  frameImageAspectCache,
  getCroppedImageStyle,
  getFrameCoverDimensions
} from './CanvasFrameGraphic';
import { CanvasShapeGraphic, SHAPE_OPTIONS } from './CanvasShapeGraphic';
import { CanvasThreeDModel } from './CanvasThreeDModel';
import { CanvasThreeDObject, DEFAULT_THREE_D_CONFIG } from './CanvasThreeDObject';

interface SlideBuilderModalProps {
  open: boolean;
  initialItem: ProgramItem | null;
  onClose: () => void;
  onSave: (item: ProgramItem) => void;
  studioMode?: {
    stageConfig: ParticipantStageConfig;
    onSaveStudio: (next: Partial<ParticipantStageConfig>) => void;
  };
}

const THEME_PRESETS = [
  { name: 'Deep Navy', value: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)' },
  { name: 'Royal Indigo', value: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)' },
  { name: 'Sanctuary Emerald', value: 'linear-gradient(135deg, #111827 0%, #064e3b 100%)' },
  { name: 'Midnight Slate', value: 'linear-gradient(135deg, #090d16 0%, #1e293b 100%)' },
  { name: 'Warm Crimson', value: 'linear-gradient(135deg, #1f1018 0%, #7f1d1d 100%)' }
];

function isAspectRatioLocked(el: CanvasElement): boolean {
  if (el.kind === 'image') return true;
  if (el.kind === 'shape') {
    return Boolean(el.shapeType && el.shapeType !== 'rectangle' && el.shapeType !== 'arrowRight');
  }
  if (el.kind === 'frame') {
    const f = el.frameShape ?? 'circle';
    return (
      f === 'circle' ||
      f === 'square' ||
      f === 'heart' ||
      f === 'star' ||
      f === 'hexagon' ||
      f === 'diamond'
    );
  }
  return false;
}

function createBlankSlideBlock(index: number, background: string): SlideBlock {
  return {
    id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label: `Slide ${index + 1}`,
    lines: [],
    background,
    canvasElements: []
  };
}

function createDefaultSlideBlock(index: number): SlideBlock {
  return {
    id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label: `Slide ${index + 1}`,
    lines: ['Welcome to UECFI'],
    canvasElements: [
      {
        id: `el-${Date.now()}-1`,
        kind: 'text',
        x: 10,
        y: 34,
        width: 80,
        height: 28,
        zIndex: 2,
        text: 'Welcome to UECFI',
        fontSize: 78,
        fontWeight: '800',
        color: '#ffffff',
        textAlign: 'center'
      }
    ]
  };
}

function blockToCanvasElements(block: SlideBlock): CanvasElement[] {
  if (block.canvasElements && block.canvasElements.length > 0) {
    return block.canvasElements.map((el) => ({ ...el }));
  }
  return [
    {
      id: `el-${Date.now()}-converted`,
      kind: 'text',
      x: 10,
      y: 28,
      width: 80,
      height: 44,
      zIndex: 1,
      text: block.lines.join('\n') || 'Slide Text',
      fontSize: 64,
      fontWeight: '700',
      color: '#ffffff',
      textAlign: 'center'
    }
  ];
}

export const SlideBuilderModal: React.FC<SlideBuilderModalProps> = ({
  open,
  initialItem,
  onClose,
  onSave,
  studioMode
}) => {
  const t = useTerminology();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);
  const imgFileRef = useRef<HTMLInputElement>(null);
  const glbFileRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const [title, setTitle] = useState('');
  const [themeBackground, setThemeBackground] = useState(THEME_PRESETS[0].value);
  const [presBox, setPresBox] = useState<StudioBoxRect>(DEFAULT_PRESENTATION_BOX);
  const [partBox, setPartBox] = useState<StudioBoxRect>(DEFAULT_PARTICIPANT_BOX);
  const [selectedStudioBox, setSelectedStudioBox] = useState<'presentation' | 'participant' | null>(
    null
  );
  const [slides, setSlides] = useState<SlideBlock[]>([]);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [selectedElIds, setSelectedElIds] = useState<string[]>([]);
  // ID of the text element currently being edited inline directly inside its canvas bounding box
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const inlineTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Tracks active drag kind so auto-fit height never fights corner-resize drags
  const activeDragKindRef = useRef<'none' | 'move' | 'side' | 'corner'>('none');
  const [marqueeRect, setMarqueeRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [copiedEl, setCopiedEl] = useState<CanvasElement | null>(null);
  const [snapGuide, setSnapGuide] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null
  });
  const [stageHeight, setStageHeight] = useState(400);
  const [justSaved, setJustSaved] = useState(false);
  // Incremented to replay entrance animations live inside the Canvas preview
  const [animReplayNonce, setAnimReplayNonce] = useState(0);
  // Canva-style far-left rail active tab (null = collapsed drawer for maximum canvas space)
  const [activeRailTab, setActiveRailTab] = useState<
    'elements' | 'text' | 'uploads' | 'background' | 'layers' | null
  >('elements');
  // Floating popover open beneath the contextual top formatting toolbar
  const [activePopover, setActivePopover] = useState<'effects' | 'animate' | 'shape' | '3d' | null>(null);
  // Active rotation readout badge (only visible while actively dragging the rotate handle)
  const [rotatingInfo, setRotatingInfo] = useState<{ elId: string; angle: number } | null>(null);
  // ID of the Frame element currently highlighted as an image drop target
  const [dropTargetFrameId, setDropTargetFrameId] = useState<string | null>(null);
  // ID of the Frame element currently in double-click inner image crop/pan/rotate mode
  const [editingFrameId, setEditingFrameId] = useState<string | null>(null);
  // Drag-and-drop state for reordering slides in the bottom filmstrip
  const [draggedSlideIdx, setDraggedSlideIdx] = useState<number | null>(null);
  const [dragOverSlideIdx, setDragOverSlideIdx] = useState<number | null>(null);
  // Persisted user-uploaded images loaded from the local media directory
  const [uploadedImages, setUploadedImages] = useState<
    Array<{ fileName: string; url: string; mtimeMs: number }>
  >([]);

  const refreshUploadedImages = async () => {
    if (!window.presenterAPI?.listMediaImages) return;
    try {
      const items = await window.presenterAPI.listMediaImages();
      setUploadedImages(items);
    } catch {
      // Ignore if media list unavailable
    }
  };

  useEffect(() => {
    if (activeRailTab === 'uploads') {
      void refreshUploadedImages();
    }
  }, [activeRailTab]);
  const draftIdRef = useRef<string>('');
  const savedTimerRef = useRef<number | null>(null);

  // Undo / Redo history stack
  type HistorySnapshot = { slides: SlideBlock[]; themeBackground: string };
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const slidesRef = useRef<SlideBlock[]>(slides);
  const bgRef = useRef<string>(themeBackground);
  slidesRef.current = slides;
  bgRef.current = themeBackground;

  const pushHistory = (nextSlides: SlideBlock[], nextBg: string) => {
    const snap: HistorySnapshot = {
      slides: JSON.parse(JSON.stringify(nextSlides)) as SlideBlock[],
      themeBackground: nextBg
    };
    setHistory((prev) => {
      const base = prev.slice(0, historyIdx + 1);
      const next = [...base, snap].slice(-50);
      setHistoryIdx(next.length - 1);
      return next;
    });
  };

  const canUndo = historyIdx > 0;
  const canRedo = historyIdx >= 0 && historyIdx < history.length - 1;

  const handleUndo = () => {
    if (!canUndo) return;
    const targetIdx = historyIdx - 1;
    const snap = history[targetIdx];
    if (!snap) return;
    setSlides(JSON.parse(JSON.stringify(snap.slides)) as SlideBlock[]);
    setThemeBackground(snap.themeBackground);
    setHistoryIdx(targetIdx);
  };

  const handleRedo = () => {
    if (!canRedo) return;
    const targetIdx = historyIdx + 1;
    const snap = history[targetIdx];
    if (!snap) return;
    setSlides(JSON.parse(JSON.stringify(snap.slides)) as SlideBlock[]);
    setThemeBackground(snap.themeBackground);
    setHistoryIdx(targetIdx);
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const wasOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (!open) return;
    if (studioMode && wasOpen) return;
    draftIdRef.current = initialItem?.id ?? `slide-${Date.now()}`;
    setJustSaved(false);
    setSelectedStudioBox(null);
    if (studioMode) {
      const cfg = studioMode.stageConfig;
      const bg = cfg.studioBackground || DEFAULT_STUDIO_BACKGROUND;
      const studioEls = (cfg.studioElements ?? []).map((el) => ({ ...el }));
      const studioSlide: SlideBlock = {
        id: 'studio-layout',
        label: 'Studio Layout',
        lines: [],
        canvasElements: studioEls
      };
      setTitle('Studio Layout');
      setThemeBackground(bg);
      setPresBox(cfg.studioPresentationBox ?? DEFAULT_PRESENTATION_BOX);
      setPartBox(cfg.studioParticipantBox ?? DEFAULT_PARTICIPANT_BOX);
      setSlides([studioSlide]);
      setActiveSlideIdx(0);
      setSelectedElIds([]);
      setHistory([{ slides: JSON.parse(JSON.stringify([studioSlide])) as SlideBlock[], themeBackground: bg }]);
      setHistoryIdx(0);
      return;
    }
    if (initialItem) {
      const bg = initialItem.themeBackground ?? THEME_PRESETS[0].value;
      const converted = initialItem.blocks.map((b) => ({
        ...b,
        canvasElements: blockToCanvasElements(b)
      }));
      const initSlides = converted.length > 0 ? converted : [createDefaultSlideBlock(0)];
      setTitle(initialItem.title);
      setThemeBackground(bg);
      setSlides(initSlides);
      setActiveSlideIdx(0);
      const firstEls = initSlides[0]?.canvasElements ?? [];
      const firstId = firstEls[0]?.id ?? null;
      setSelectedElIds(firstId ? expandWithGroupIds([firstId], firstEls) : []);
      setHistory([{ slides: JSON.parse(JSON.stringify(initSlides)) as SlideBlock[], themeBackground: bg }]);
      setHistoryIdx(0);
    } else {
      const first = createDefaultSlideBlock(0);
      const bg = THEME_PRESETS[0].value;
      setTitle('');
      setThemeBackground(bg);
      setSlides([first]);
      setActiveSlideIdx(0);
      const firstId = first.canvasElements?.[0]?.id ?? null;
      setSelectedElIds(firstId ? [firstId] : []);
      setHistory([{ slides: JSON.parse(JSON.stringify([first])) as SlideBlock[], themeBackground: bg }]);
      setHistoryIdx(0);
    }
  }, [open, initialItem, studioMode]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const obs = new ResizeObserver(() => {
      if (stage.clientHeight > 0) setStageHeight(stage.clientHeight);
    });
    obs.observe(stage);
    return () => obs.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
        if (selectedEl) {
          e.preventDefault();
          setCopiedEl(JSON.parse(JSON.stringify(selectedEl)) as CanvasElement);
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
        if (copiedEl) {
          e.preventDefault();
          const pasted: CanvasElement = {
            ...JSON.parse(JSON.stringify(copiedEl)),
            id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            x: Math.min(85, copiedEl.x + 3),
            y: Math.min(85, copiedEl.y + 3),
            zIndex: elements.length + 1
          };
          updateActiveElements((prev) => [...prev, pasted]);
          setSelectedElIds([pasted.id]);
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) {
          handleUngroupSelected();
        } else {
          handleGroupSelected();
        }
      } else if (e.key === 'Enter' && selectedEl?.kind === 'text' && !editingTextId) {
        e.preventDefault();
        setEditingTextId(selectedEl.id);
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && selectedElIds.length > 0 && !editingTextId && !editingFrameId) {
        e.preventDefault();
        const toRemove = new Set(selectedElIds);
        updateActiveElements((prev) => prev.filter((item) => !toRemove.has(item.id)));
        setSelectedElIds([]);
      } else if ((e.key === 'Escape' || e.key === 'Enter') && editingFrameId) {
        e.preventDefault();
        setEditingFrameId(null);
      }
    };
    // On Windows, releasing Alt focuses the application menu bar and steals subsequent
    // canvas shortcuts (Delete, arrows). Suppress Alt keyup while Slide Builder is open.
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Alt') {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  });

  // Focus the inline canvas textarea whenever entering Canva-style inline text editing
  useEffect(() => {
    if (!editingTextId) return;
    const ta = inlineTextareaRef.current;
    if (!ta) return;
    ta.focus();
    if (
      ta.value === 'New Text' ||
      ta.value === 'Add a heading' ||
      ta.value === 'Add a subheading' ||
      ta.value === 'Add a little bit of body text'
    ) {
      ta.select();
    } else {
      const len = ta.value.length;
      ta.setSelectionRange(len, len);
    }
  }, [editingTextId]);

  // Exit inline text/frame-crop editing if selection changes away or slide switches
  useEffect(() => {
    if (editingTextId && (selectedElIds.length !== 1 || selectedElIds[0] !== editingTextId)) {
      setEditingTextId(null);
    }
    if (editingFrameId && (selectedElIds.length !== 1 || selectedElIds[0] !== editingFrameId)) {
      setEditingFrameId(null);
    }
  }, [selectedElIds, editingTextId, editingFrameId]);

  useEffect(() => {
    setEditingTextId(null);
    setEditingFrameId(null);
    setActivePopover(null);
  }, [activeSlideIdx, open]);

  useEffect(() => {
    setActivePopover(null);
  }, [selectedElIds]);

  const activeSlide = slides[activeSlideIdx] ?? slides[0];
  const activeSlideBg = activeSlide?.background || themeBackground;
  const elements = activeSlide?.canvasElements ?? [];

  // Updates ONLY the currently active slide's background (independent per-slide customization)
  const updateActiveSlideBackground = (nextBg: string) => {
    const nextSlides = slidesRef.current.map((s, idx) =>
      idx === activeSlideIdx ? { ...s, background: nextBg } : s
    );
    setSlides(nextSlides);
    pushHistory(nextSlides, bgRef.current);
  };
  const selectedElId = selectedElIds.length === 1 ? selectedElIds[0] : null;
  const selectedEl = elements.find((el) => el.id === selectedElId) ?? null;
  const selectedElements = elements.filter((el) => selectedElIds.includes(el.id));
  const scale = stageHeight / 1080;

  // Synchronously auto-fit a selected text box's height before browser paint (useLayoutEffect)
  // so there is zero 1-frame flicker/glitch when changing font size or narrowing via side handles.
  // Skipped during corner-resize drags so it never fights the pointermove handler.
  useLayoutEffect(() => {
    if (!open || !selectedEl || selectedEl.kind !== 'text') return;
    if (activeDragKindRef.current === 'corner' || activeDragKindRef.current === 'move') return;

    const stage = stageRef.current;
    if (!stage || stage.clientHeight <= 0) return;

    let naturalHeightPx = 0;
    if (editingTextId === selectedEl.id && inlineTextareaRef.current) {
      const ta = inlineTextareaRef.current;
      const prevHeight = ta.style.height;
      ta.style.height = '0px';
      naturalHeightPx = ta.scrollHeight;
      ta.style.height = prevHeight || '100%';
    } else {
      const measureEl = stage.querySelector<HTMLElement>(`[data-text-measure="${selectedEl.id}"]`);
      if (!measureEl) return;
      naturalHeightPx = Math.max(measureEl.scrollHeight, measureEl.offsetHeight);
    }

    if (naturalHeightPx <= 0) return;
    const nextHeightPct = Math.max(
      4,
      Number(((naturalHeightPx / stage.clientHeight) * 100).toFixed(2))
    );
    if (Math.abs(nextHeightPct - selectedEl.height) > 0.35) {
      updateActiveElements(
        (prev) =>
          prev.map((item) =>
            item.id === selectedEl.id ? { ...item, height: nextHeightPct } : item
          ),
        false
      );
    }
  }, [
    open,
    editingTextId,
    selectedEl?.id,
    selectedEl?.kind,
    selectedEl?.text,
    selectedEl?.fontSize,
    selectedEl?.fontFamily,
    selectedEl?.fontWeight,
    selectedEl?.fontStyle,
    selectedEl?.lineHeight,
    selectedEl?.letterSpacing,
    selectedEl?.width,
    stageHeight
  ]);

  const setSelectedElId = (id: string | null) => {
    setSelectedElIds(id ? [id] : []);
  };

  const expandWithGroupIds = (ids: string[], allEls: CanvasElement[]): string[] => {
    const groupIds = new Set<string>();
    const result = new Set<string>(ids);
    for (const el of allEls) {
      if (result.has(el.id) && el.groupId) {
        groupIds.add(el.groupId);
      }
    }
    if (groupIds.size > 0) {
      for (const el of allEls) {
        if (el.groupId && groupIds.has(el.groupId)) {
          result.add(el.id);
        }
      }
    }
    return Array.from(result);
  };

  const handleGroupSelected = () => {
    if (selectedElIds.length < 2) return;
    const newGroupId = `grp-${Date.now()}`;
    const idSet = new Set(selectedElIds);
    updateActiveElements((prev) =>
      prev.map((el) => (idSet.has(el.id) ? { ...el, groupId: newGroupId } : el))
    );
  };

  const handleUngroupSelected = () => {
    if (selectedElIds.length === 0) return;
    const idSet = new Set(selectedElIds);
    const groupIds = new Set(
      elements.filter((el) => idSet.has(el.id) && el.groupId).map((el) => el.groupId!)
    );
    if (groupIds.size === 0) return;
    updateActiveElements((prev) =>
      prev.map((el) =>
        el.groupId && groupIds.has(el.groupId) ? { ...el, groupId: undefined } : el
      )
    );
  };

  const updateActiveElements = (
    updater: (prev: CanvasElement[]) => CanvasElement[],
    recordHistory = true
  ) => {
    const nextSlides = slidesRef.current.map((s, idx) => {
      if (idx !== activeSlideIdx) return s;
      const nextEls = updater(s.canvasElements ?? []);
      const textLines = nextEls
        .filter((el) => el.kind === 'text' && el.text?.trim())
        .flatMap((el) => el.text!.split('\n'));
      return {
        ...s,
        lines: textLines.length > 0 ? textLines : [s.label || 'Slide'],
        canvasElements: nextEls
      };
    });
    setSlides(nextSlides);
    if (recordHistory) {
      pushHistory(nextSlides, bgRef.current);
    }
  };

  const updateSelectedEl = (patch: Partial<CanvasElement>) => {
    if (!selectedElId) return;
    updateActiveElements((prev) =>
      prev.map((el) => (el.id === selectedElId ? { ...el, ...patch } : el))
    );
  };

  /**
   * Moves an element up (+1 = toward front) or down (-1 = toward back)
   * and normalizes zIndex values to 1..N so layer order is always deterministic.
   */
  const moveElementLayer = (elId: string, direction: 1 | -1) => {
    updateActiveElements((prev) => {
      const sorted = [...prev].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex((item) => item.id === elId);
      const targetIdx = idx + direction;
      if (idx < 0 || targetIdx < 0 || targetIdx >= sorted.length) return prev;
      const [moved] = sorted.splice(idx, 1);
      sorted.splice(targetIdx, 0, moved);
      return sorted.map((item, i) => ({ ...item, zIndex: i + 1 }));
    });
  };

  const handleAddText = (preset: 'heading' | 'subheading' | 'body' = 'heading') => {
    const config =
      preset === 'heading'
        ? { text: 'Add a heading', fontSize: 84, fontWeight: '800' as const, height: 18 }
        : preset === 'subheading'
          ? { text: 'Add a subheading', fontSize: 52, fontWeight: '600' as const, height: 14 }
          : { text: 'Add a little bit of body text', fontSize: 34, fontWeight: '400' as const, height: 12 };
    const newEl: CanvasElement = {
      id: `el-${Date.now()}`,
      kind: 'text',
      x: 15,
      y: 38,
      width: 70,
      height: config.height,
      zIndex: elements.length + 1,
      text: config.text,
      fontSize: config.fontSize,
      fontWeight: config.fontWeight,
      color: '#ffffff',
      textAlign: 'center'
    };
    updateActiveElements((prev) => [...prev, newEl]);
    setSelectedElId(newEl.id);
    setEditingTextId(newEl.id);
  };

  const handleAddShape = (shapeType: ShapeVariant = 'rectangle') => {
    const isSquareShape = shapeType !== 'rectangle' && shapeType !== 'arrowRight';
    const height = isSquareShape ? 40 : 45;
    // On a 16:9 stage, width = height * (9 / 16) produces an exact 1:1 square in pixels.
    const width = isSquareShape ? Number((height * (9 / 16)).toFixed(2)) : 60;
    const newEl: CanvasElement = {
      id: `el-${Date.now()}`,
      kind: 'shape',
      shapeType,
      x: Number(((100 - width) / 2).toFixed(2)),
      y: Number(((100 - height) / 2).toFixed(2)),
      width,
      height,
      zIndex: elements.length + 1,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      borderRadius: shapeType === 'rectangle' ? 24 : 0,
      opacity: 1
    };
    updateActiveElements((prev) => [...prev, newEl]);
    setSelectedElId(newEl.id);
    setEditingTextId(null);
  };

  const handleAddParticipantWidget = () => {
    const newEl: CanvasElement = {
      id: `el-${Date.now()}`,
      name: 'Speaker Name / Title',
      kind: 'participantWidget',
      x: 5,
      y: 78,
      width: 34,
      height: 15,
      zIndex: elements.length + 1,
      backgroundColor: 'rgba(15, 23, 42, 0.72)',
      borderRadius: 12,
      opacity: 1,
      widgetTitleColor: '#fbbf24',
      widgetTitleSize: 18,
      widgetNameColor: '#ffffff',
      widgetNameSize: 24,
      widgetCentroColor: '#94a3b8',
      widgetCentroSize: 16,
      widgetAccentColor: '#fbbf24'
    };
    updateActiveElements((prev) => [...prev, newEl]);
    setSelectedStudioBox(null);
    setSelectedElId(newEl.id);
    setEditingTextId(null);
  };

  const startStudioBoxDrag = (
    e: React.PointerEvent,
    target: 'presentation' | 'participant',
    mode: 'move' | 'resize'
  ) => {
    e.stopPropagation();
    const stage = stageRef.current;
    if (!stage) return;
    setSelectedElIds([]);
    setSelectedStudioBox(target);

    const rect = stage.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = target === 'presentation' ? { ...presBox } : { ...partBox };
    const setter = target === 'presentation' ? setPresBox : setPartBox;

    const onMove = (ev: PointerEvent) => {
      const dxPct = ((ev.clientX - startX) / rect.width) * 100;
      const dyPct = ((ev.clientY - startY) / rect.height) * 100;
      if (mode === 'move') {
        setter({
          ...orig,
          x: Number(Math.max(0, Math.min(100 - orig.width, orig.x + dxPct)).toFixed(1)),
          y: Number(Math.max(0, Math.min(100 - orig.height, orig.y + dyPct)).toFixed(1))
        });
      } else {
        let nextW = Math.max(12, Math.min(100 - orig.x, orig.width + dxPct));
        let nextH = Math.max(12, Math.min(100 - orig.y, orig.height + dyPct));
        if (target === 'presentation' && !ev.shiftKey) {
          nextH = Math.max(12, Math.min(100 - orig.y, nextW));
          nextW = nextH;
        }
        setter({
          ...orig,
          width: Number(nextW.toFixed(1)),
          height: Number(nextH.toFixed(1))
        });
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleAddDivider = () => {
    const newEl: CanvasElement = {
      id: `el-${Date.now()}`,
      kind: 'divider',
      x: 20,
      y: 48,
      width: 60,
      height: 5,
      zIndex: elements.length + 1,
      color: '#ffffff',
      thickness: 4,
      opacity: 0.85
    };
    updateActiveElements((prev) => [...prev, newEl]);
    setSelectedElId(newEl.id);
    setEditingTextId(null);
  };

  const addImageUrlToSlide = (mediaUrl: string, name = 'Image') => {
    const probe = new Image();
    probe.onload = () => {
      const natW = probe.naturalWidth || 16;
      const natH = probe.naturalHeight || 9;
      const natRatio = natW / natH;
      // Convert image aspect ratio into 16:9 stage percentage dimensions
      let heightPct = 45;
      let widthPct = heightPct * natRatio * (9 / 16);
      if (widthPct > 65) {
        widthPct = 65;
        heightPct = widthPct / (natRatio * (9 / 16));
      }
      const w = Number(Math.max(4, widthPct).toFixed(2));
      const h = Number(Math.max(4, heightPct).toFixed(2));
      const newEl: CanvasElement = {
        id: `el-${Date.now()}`,
        name,
        kind: 'image',
        x: Number(((100 - w) / 2).toFixed(2)),
        y: Number(((100 - h) / 2).toFixed(2)),
        width: w,
        height: h,
        zIndex: elements.length + 1,
        imageSrc: mediaUrl
      };
      updateActiveElements((prev) => [...prev, newEl]);
      setSelectedElId(newEl.id);
    };
    probe.src = mediaUrl;
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const mediaUrl = await saveUserMediaFile(file);
    void refreshUploadedImages();
    const cleanFileName = file.name.replace(/\.[^.]+$/, '').trim();
    addImageUrlToSlide(mediaUrl, cleanFileName || 'Image');
  };

  const handleGlbUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const mediaUrl = await saveUserMediaFile(file);
    const cleanFileName = file.name.replace(/\.[^.]+$/, '').trim();
    const el: CanvasElement = {
      id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: cleanFileName || '3D Model',
      kind: 'model3d',
      x: 32,
      y: 22,
      width: 36,
      height: 50,
      zIndex: elements.length + 1,
      modelSrc: mediaUrl,
      threeD: { ...DEFAULT_THREE_D_CONFIG }
    };
    updateActiveElements((prev) => [...prev, el]);
    setSelectedElIds([el.id]);
  };

  const handleBackgroundImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const mediaUrl = await saveUserMediaFile(file);
    setThemeBackground(`url("${mediaUrl}") center / cover no-repeat`);
  };

  const startDrag = (
    e: React.PointerEvent,
    el: CanvasElement,
    mode: 'move' | 'resize',
    resizeHandle: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e' = 'se'
  ) => {
    e.stopPropagation();
    const stage = stageRef.current;
    if (!stage) return;

    let activeIds: string[];
    if (e.shiftKey && mode === 'move') {
      const groupSet = new Set(expandWithGroupIds([el.id], elements));
      const alreadyIn = selectedElIds.includes(el.id);
      activeIds = alreadyIn
        ? selectedElIds.filter((id) => !groupSet.has(id))
        : expandWithGroupIds([...selectedElIds, el.id], elements);
      setSelectedElIds(activeIds);
    } else if (selectedElIds.includes(el.id)) {
      activeIds = expandWithGroupIds(selectedElIds, elements);
    } else {
      activeIds = expandWithGroupIds([el.id], elements);
      setSelectedElIds(activeIds);
    }

    if (activeIds.length === 0) return;

    const rect = stage.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const origMap = new Map<string, { x: number; y: number; width: number; height: number }>();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const item of elements) {
      if (activeIds.includes(item.id)) {
        origMap.set(item.id, { x: item.x, y: item.y, width: item.width, height: item.height });
        minX = Math.min(minX, item.x);
        minY = Math.min(minY, item.y);
        maxX = Math.max(maxX, item.x + item.width);
        maxY = Math.max(maxY, item.y + item.height);
      }
    }
    const bboxW = maxX - minX;
    const bboxH = maxY - minY;
    const origX = el.x;
    const origY = el.y;
    const origW = el.width;
    const origH = el.height;
    const origFontSize = el.fontSize ?? 56;
    // For text boxes, compute the exact minimum width (%) that fits 1 single character + padding
    let minWidthPct = 2;
    if (el.kind === 'text' && rect.width > 0) {
      const measureCanvas = document.createElement('canvas');
      const ctx = measureCanvas.getContext('2d');
      const pxFontSize = origFontSize * scale;
      let maxCharPx = pxFontSize * 0.7;
      if (ctx) {
        ctx.font = `${el.fontStyle ?? 'normal'} ${el.fontWeight ?? '700'} ${pxFontSize}px ${el.fontFamily || "'Inter', sans-serif"}`;
        const chars = Array.from((el.text || 'W').replace(/\s+/g, ''));
        const samples = chars.length > 0 ? chars : ['W'];
        maxCharPx = 0;
        for (const ch of samples) {
          const w = ctx.measureText(ch).width;
          if (w > maxCharPx) maxCharPx = w;
        }
      }
      const letterSpacingPx =
        typeof el.letterSpacing === 'number' ? Math.max(0, el.letterSpacing * pxFontSize) : 0;
      const minPx = maxCharPx + letterSpacingPx + 24 * scale + 2;
      minWidthPct = Math.min(100, (minPx / rect.width) * 100);
    }
    activeDragKindRef.current =
      mode === 'move'
        ? 'move'
        : resizeHandle === 'w' || resizeHandle === 'e' || resizeHandle === 'n' || resizeHandle === 's'
          ? 'side'
          : 'corner';

    // Precompute Canva-style alignment snap targets: stage center (50%) + all non-selected elements'
    // left/center/right (X) and top/middle/bottom (Y) edges.
    const xTargets: number[] = [50];
    const yTargets: number[] = [50];
    for (const item of elements) {
      if (activeIds.includes(item.id)) continue;
      xTargets.push(item.x, item.x + item.width / 2, item.x + item.width);
      yTargets.push(item.y, item.y + item.height / 2, item.y + item.height);
    }

    let hoveredFrameId: string | null = null;
    const canDropIntoFrame = mode === 'move' && el.kind === 'image' && Boolean(el.imageSrc) && activeIds.length === 1;
    const frameCandidates = canDropIntoFrame
      ? [...elements].filter((item) => item.kind === 'frame').sort((a, b) => b.zIndex - a.zIndex)
      : [];

    const onMove = (ev: PointerEvent) => {
      const dxPct = ((ev.clientX - startX) / rect.width) * 100;
      const dyPct = ((ev.clientY - startY) / rect.height) * 100;

      if (mode === 'move') {
        let clampedDx = Math.max(-20 - minX, Math.min(120 - maxX, dxPct));
        let clampedDy = Math.max(-20 - minY, Math.min(120 - maxY, dyPct));

        let snappedGuideX: number | null = null;
        let snappedGuideY: number | null = null;

        // Hold Alt/Option while dragging to temporarily disable snapping
        if (!ev.altKey) {
          const SNAP_THRESHOLD = 1.2;

          // Check dragged left, center, and right against all X snap targets
          const dragXs = [
            minX + clampedDx,
            minX + clampedDx + bboxW / 2,
            minX + clampedDx + bboxW
          ];
          let bestDistX = SNAP_THRESHOLD;
          let bestAdjX = 0;
          for (const candidate of dragXs) {
            for (const target of xTargets) {
              const dist = Math.abs(candidate - target);
              if (dist < bestDistX) {
                bestDistX = dist;
                bestAdjX = target - candidate;
                snappedGuideX = target;
              }
            }
          }
          if (snappedGuideX !== null) {
            clampedDx += bestAdjX;
          }

          // Check dragged top, middle, and bottom against all Y snap targets
          const dragYs = [
            minY + clampedDy,
            minY + clampedDy + bboxH / 2,
            minY + clampedDy + bboxH
          ];
          let bestDistY = SNAP_THRESHOLD;
          let bestAdjY = 0;
          for (const candidate of dragYs) {
            for (const target of yTargets) {
              const dist = Math.abs(candidate - target);
              if (dist < bestDistY) {
                bestDistY = dist;
                bestAdjY = target - candidate;
                snappedGuideY = target;
              }
            }
          }
          if (snappedGuideY !== null) {
            clampedDy += bestAdjY;
          }
        }

        setSnapGuide({ x: snappedGuideX, y: snappedGuideY });

        if (canDropIntoFrame && frameCandidates.length > 0) {
          const ptrX = ((ev.clientX - rect.left) / rect.width) * 100;
          const ptrY = ((ev.clientY - rect.top) / rect.height) * 100;
          const hitFrame = frameCandidates.find(
            (f) => ptrX >= f.x && ptrX <= f.x + f.width && ptrY >= f.y && ptrY <= f.y + f.height
          );
          hoveredFrameId = hitFrame?.id ?? null;
          setDropTargetFrameId(hoveredFrameId);
        }

        updateActiveElements(
          (prev) =>
            prev.map((item) => {
              const orig = origMap.get(item.id);
              if (!orig) return item;
              return {
                ...item,
                x: Number((orig.x + clampedDx).toFixed(2)),
                y: Number((orig.y + clampedDy).toFixed(2))
              };
            }),
          false
        );
      } else {
        let nextX = origX;
        let nextY = origY;
        let nextW = origW;
        let nextH = origH;
        let nextFontSize: number | undefined;
        let nextCrop:
          | { cropTop: number; cropRight: number; cropBottom: number; cropLeft: number }
          | undefined;

        const isEdgeHandle =
          resizeHandle === 'w' || resizeHandle === 'e' || resizeHandle === 'n' || resizeHandle === 's';
        const affectsLeft = resizeHandle === 'nw' || resizeHandle === 'sw' || resizeHandle === 'w';
        const affectsRight = resizeHandle === 'ne' || resizeHandle === 'se' || resizeHandle === 'e';
        const affectsTop = resizeHandle === 'nw' || resizeHandle === 'ne' || resizeHandle === 'n';
        const affectsBottom = resizeHandle === 'sw' || resizeHandle === 'se' || resizeHandle === 's';

        if (el.kind === 'image' && isEdgeHandle) {
          // Non-destructive image trimming: moves only the dragged edge and hides overflow without stretching
          const origCL = el.cropLeft ?? 0;
          const origCR = el.cropRight ?? 0;
          const origCT = el.cropTop ?? 0;
          const origCB = el.cropBottom ?? 0;
          const origFw = Math.max(0.05, 1 - origCL - origCR);
          const origFh = Math.max(0.05, 1 - origCT - origCB);
          const fullW = origW / origFw;
          const fullH = origH / origFh;
          const minBoxW = Math.max(3, fullW * 0.05);
          const minBoxH = Math.max(3, fullH * 0.05);

          let nextCL = origCL;
          let nextCR = origCR;
          let nextCT = origCT;
          let nextCB = origCB;

          if (resizeHandle === 'e') {
            const maxW = fullW * (1 - origCL);
            nextW = Math.max(minBoxW, Math.min(maxW, origW + dxPct));
            nextCR = Math.max(0, Number((1 - origCL - nextW / fullW).toFixed(4)));
          } else if (resizeHandle === 'w') {
            const maxW = fullW * (1 - origCR);
            nextW = Math.max(minBoxW, Math.min(maxW, origW - dxPct));
            nextX = origX + (origW - nextW);
            nextCL = Math.max(0, Number((1 - origCR - nextW / fullW).toFixed(4)));
          } else if (resizeHandle === 's') {
            const maxH = fullH * (1 - origCT);
            nextH = Math.max(minBoxH, Math.min(maxH, origH + dyPct));
            nextCB = Math.max(0, Number((1 - origCT - nextH / fullH).toFixed(4)));
          } else if (resizeHandle === 'n') {
            const maxH = fullH * (1 - origCB);
            nextH = Math.max(minBoxH, Math.min(maxH, origH - dyPct));
            nextY = origY + (origH - nextH);
            nextCT = Math.max(0, Number((1 - origCB - nextH / fullH).toFixed(4)));
          }

          nextCrop = {
            cropTop: nextCT,
            cropRight: nextCR,
            cropBottom: nextCB,
            cropLeft: nextCL
          };
        } else if (resizeHandle === 'w' || resizeHandle === 'e') {
          // Horizontal-only side pill resize: adjusts box width down to 1-character minimum so text wraps cleanly
          if (affectsRight) {
            nextW = Math.max(minWidthPct, Math.min(100, origW + dxPct));
          } else if (affectsLeft) {
            nextW = Math.max(minWidthPct, Math.min(100, origW - dxPct));
            nextX = origX + (origW - nextW);
          }
        } else if (el.kind === 'text') {
          // Canva-style corner drag on text boxes: proportionally scales fontSize + bounding box together
          const signedDx = affectsLeft ? -dxPct : dxPct;
          const signedDy = affectsTop ? -dyPct : dyPct;
          const rawScale =
            Math.abs(signedDx) >= Math.abs(signedDy)
              ? (origW + signedDx) / origW
              : (origH + signedDy) / origH;
          const minScale = Math.max(8 / origFontSize, 4 / origW, 4 / origH);
          const maxScale = Math.min(700 / origFontSize, 150 / origW, 150 / origH);
          const clampedScale = Math.max(minScale, Math.min(maxScale, rawScale));
          nextW = origW * clampedScale;
          nextH = origH * clampedScale;
          nextFontSize = Math.round(Math.max(8, Math.min(700, origFontSize * clampedScale)));
          if (affectsLeft) nextX = origX + (origW - nextW);
          if (affectsTop) nextY = origY + (origH - nextH);
        } else if (isAspectRatioLocked(el) || el.kind === 'frame' || ev.shiftKey) {
          // Lock aspect ratio on corner drag for images, frames, geometric shapes, or Shift-drag
          const signedDx = affectsLeft ? -dxPct : dxPct;
          const signedDy = affectsTop ? -dyPct : dyPct;
          const rawScale =
            Math.abs(signedDx) >= Math.abs(signedDy)
              ? (origW + signedDx) / origW
              : (origH + signedDy) / origH;
          const minScale = Math.max(4 / origW, 4 / origH);
          const maxScale = Math.min(100 / origW, 100 / origH);
          const clampedScale = Math.max(minScale, Math.min(maxScale, rawScale));
          nextW = origW * clampedScale;
          nextH = origH * clampedScale;
          if (affectsLeft) nextX = origX + (origW - nextW);
          if (affectsTop) nextY = origY + (origH - nextH);
        } else {
          if (affectsRight) {
            nextW = Math.max(8, Math.min(100, origW + dxPct));
          } else if (affectsLeft) {
            nextW = Math.max(8, Math.min(100, origW - dxPct));
            nextX = origX + (origW - nextW);
          }
          if (affectsBottom) {
            nextH = Math.max(6, Math.min(100, origH + dyPct));
          } else if (affectsTop) {
            nextH = Math.max(6, Math.min(100, origH - dyPct));
            nextY = origY + (origH - nextH);
          }
        }
        const isSideOnly = el.kind !== 'image' && (resizeHandle === 'w' || resizeHandle === 'e');
        updateActiveElements(
          (prev) =>
            prev.map((item) =>
              item.id === el.id
                ? {
                    ...item,
                    x: Number(nextX.toFixed(2)),
                    ...(isSideOnly ? {} : { y: Number(nextY.toFixed(2)) }),
                    width: Number(nextW.toFixed(2)),
                    // Preserve auto-fitted height during side-handle drags so hitting min-width never resets height to origH
                    ...(isSideOnly ? {} : { height: Number(nextH.toFixed(2)) }),
                    ...(nextFontSize !== undefined ? { fontSize: nextFontSize } : {}),
                    ...(nextCrop ?? {})
                  }
                : item
            ),
          false
        );
      }
    };

    const onUp = () => {
      activeDragKindRef.current = 'none';
      setSnapGuide({ x: null, y: null });
      setDropTargetFrameId(null);
      if (hoveredFrameId && el.imageSrc) {
        const targetId = hoveredFrameId;
        const droppedSrc = el.imageSrc;
        updateActiveElements((prev) =>
          prev
            .filter((item) => item.id !== el.id)
            .map((item) => (item.id === targetId ? { ...item, imageSrc: droppedSrc } : item))
        );
        setSelectedElId(targetId);
      } else {
        pushHistory(slidesRef.current, bgRef.current);
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /**
   * Canva-style rotation drag from the bottom rotate handle.
   * Snaps to 0°/±45°/±90°/±135°/180° within 3° (Shift = 15° steps, Alt = free rotation)
   * and pops out a live degree readout while dragging.
   */
  const startRotate = (e: React.PointerEvent, el: CanvasElement) => {
    e.stopPropagation();
    e.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const rect = stage.getBoundingClientRect();
    const cx = rect.left + ((el.x + el.width / 2) / 100) * rect.width;
    const cy = rect.top + ((el.y + el.height / 2) / 100) * rect.height;
    activeDragKindRef.current = 'move';
    setRotatingInfo({ elId: el.id, angle: Math.round(el.rotation ?? 0) });

    const onMove = (ev: PointerEvent) => {
      // Handle sits at the bottom center (90° in screen coords), so subtract 90° so straight-down = 0°
      let deg = Math.atan2(ev.clientY - cy, ev.clientX - cx) * (180 / Math.PI) - 90;
      // Normalize to (-180, 180]
      while (deg <= -180) deg += 360;
      while (deg > 180) deg -= 360;

      if (ev.shiftKey) {
        deg = Math.round(deg / 15) * 15;
      } else if (!ev.altKey) {
        const snapAngles = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
        for (const target of snapAngles) {
          if (Math.abs(deg - target) <= 3) {
            deg = target;
            break;
          }
        }
      }
      const rounded = Math.round(deg) === -180 ? 180 : Math.round(deg);
      setRotatingInfo({ elId: el.id, angle: rounded });
      updateActiveElements(
        (prev) => prev.map((item) => (item.id === el.id ? { ...item, rotation: rounded } : item)),
        false
      );
    };

    const onUp = () => {
      activeDragKindRef.current = 'none';
      setRotatingInfo(null);
      pushHistory(slidesRef.current, bgRef.current);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /**
   * Inner Frame Crop Mode: allows panning, scaling, and rotating the photo inside a Frame
   * independently of the Frame's own position, size, and shape.
   */
  const startFrameCropDrag = (
    e: React.PointerEvent,
    el: CanvasElement,
    mode: 'pan' | 'scale' | 'rotate'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const rect = stage.getBoundingClientRect();
    const frameWpx = (el.width / 100) * rect.width;
    const frameHpx = (el.height / 100) * rect.height;
    const startX = e.clientX;
    const startY = e.clientY;
    const origOffX = el.imageOffsetX ?? 0;
    const origOffY = el.imageOffsetY ?? 0;
    const origScale = el.imageScale ?? 1;
    const origRot = el.imageRotation ?? 0;

    const cx =
      rect.left +
      ((el.x + el.width / 2) / 100) * rect.width +
      (origOffX / 100) * frameWpx;
    const cy =
      rect.top +
      ((el.y + el.height / 2) / 100) * rect.height +
      (origOffY / 100) * frameHpx;

    if (mode === 'rotate') {
      setRotatingInfo({ elId: el.id, angle: Math.round(origRot) });
    }

    const frameShape = el.frameShape || 'circle';
    const imgAspect =
      (el.imageSrc ? frameImageAspectCache.get(el.imageSrc) : undefined) ??
      frameWpx / Math.max(1, frameHpx);

    const onMove = (ev: PointerEvent) => {
      if (mode === 'pan') {
        const dxPct = frameWpx > 0 ? ((ev.clientX - startX) / frameWpx) * 100 : 0;
        const dyPct = frameHpx > 0 ? ((ev.clientY - startY) / frameHpx) * 100 : 0;
        const clamped = clampFrameImageTransform({
          frameShape,
          frameW: frameWpx,
          frameH: frameHpx,
          imgAspect,
          scale: origScale,
          offsetX: origOffX + dxPct,
          offsetY: origOffY + dyPct,
          rotation: origRot
        });
        updateActiveElements(
          (prev) =>
            prev.map((item) =>
              item.id === el.id
                ? {
                    ...item,
                    imageOffsetX: clamped.offsetX,
                    imageOffsetY: clamped.offsetY
                  }
                : item
            ),
          false
        );
      } else if (mode === 'scale') {
        const startDist = Math.hypot(startX - cx, startY - cy) || 1;
        const curDist = Math.hypot(ev.clientX - cx, ev.clientY - cy);
        const clamped = clampFrameImageTransform({
          frameShape,
          frameW: frameWpx,
          frameH: frameHpx,
          imgAspect,
          scale: origScale * (curDist / startDist),
          offsetX: origOffX,
          offsetY: origOffY,
          rotation: origRot
        });
        updateActiveElements(
          (prev) =>
            prev.map((item) =>
              item.id === el.id
                ? {
                    ...item,
                    imageScale: clamped.scale,
                    imageOffsetX: clamped.offsetX,
                    imageOffsetY: clamped.offsetY
                  }
                : item
            ),
          false
        );
      } else {
        let deg = Math.atan2(ev.clientY - cy, ev.clientX - cx) * (180 / Math.PI) - 90;
        while (deg <= -180) deg += 360;
        while (deg > 180) deg -= 360;
        if (ev.shiftKey) {
          deg = Math.round(deg / 15) * 15;
        } else if (!ev.altKey) {
          for (const target of [-180, -135, -90, -45, 0, 45, 90, 135, 180]) {
            if (Math.abs(deg - target) <= 3) {
              deg = target;
              break;
            }
          }
        }
        const rounded = Math.round(deg) === -180 ? 180 : Math.round(deg);
        const clamped = clampFrameImageTransform({
          frameShape,
          frameW: frameWpx,
          frameH: frameHpx,
          imgAspect,
          scale: origScale,
          offsetX: origOffX,
          offsetY: origOffY,
          rotation: rounded
        });
        setRotatingInfo({ elId: el.id, angle: rounded });
        updateActiveElements(
          (prev) =>
            prev.map((item) =>
              item.id === el.id
                ? {
                    ...item,
                    imageRotation: rounded,
                    imageScale: clamped.scale,
                    imageOffsetX: clamped.offsetX,
                    imageOffsetY: clamped.offsetY
                  }
                : item
            ),
          false
        );
      }
    };

    const onUp = () => {
      setRotatingInfo(null);
      pushHistory(slidesRef.current, bgRef.current);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startGroupResize = (e: React.PointerEvent) => {
    e.stopPropagation();
    const stage = stageRef.current;
    if (!stage || selectedElements.length < 2) return;

    const rect = stage.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const origMap = new Map<
      string,
      { x: number; y: number; width: number; height: number; fontSize?: number }
    >();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const item of selectedElements) {
      origMap.set(item.id, {
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        fontSize: item.fontSize
      });
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + item.width);
      maxY = Math.max(maxY, item.y + item.height);
    }

    const bboxW = Math.max(1, maxX - minX);
    const bboxH = Math.max(1, maxY - minY);
    const hasImageInGroup = selectedElements.some((el) => el.kind === 'image');

    const onMove = (ev: PointerEvent) => {
      const dxPct = ((ev.clientX - startX) / rect.width) * 100;
      const dyPct = ((ev.clientY - startY) / rect.height) * 100;
      let sx: number;
      let sy: number;
      if (hasImageInGroup || ev.shiftKey) {
        const rawScale =
          Math.abs(dxPct) >= Math.abs(dyPct)
            ? (bboxW + dxPct) / bboxW
            : (bboxH + dyPct) / bboxH;
        const minScale = Math.max(8 / bboxW, 8 / bboxH);
        const maxScale = Math.min((120 - minX) / bboxW, (120 - minY) / bboxH);
        const uniform = Math.max(minScale, Math.min(maxScale, rawScale));
        sx = uniform;
        sy = uniform;
      } else {
        const nextBboxW = Math.max(8, Math.min(120 - minX, bboxW + dxPct));
        const nextBboxH = Math.max(8, Math.min(120 - minY, bboxH + dyPct));
        sx = nextBboxW / bboxW;
        sy = nextBboxH / bboxH;
      }
      const fontScale = Math.min(sx, sy);

      updateActiveElements(
        (prev) =>
          prev.map((item) => {
            const orig = origMap.get(item.id);
            if (!orig) return item;
            return {
              ...item,
              x: Number((minX + (orig.x - minX) * sx).toFixed(2)),
              y: Number((minY + (orig.y - minY) * sy).toFixed(2)),
              width: Number(Math.max(2, orig.width * sx).toFixed(2)),
              height: Number(Math.max(2, orig.height * sy).toFixed(2)),
              fontSize:
                item.kind === 'text' && typeof orig.fontSize === 'number'
                  ? Math.max(10, Math.min(180, Math.round(orig.fontSize * fontScale)))
                  : item.fontSize
            };
          }),
        false
      );
    };

    const onUp = () => {
      pushHistory(slidesRef.current, bgRef.current);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startMarquee = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const startPctX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const startPctY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    const initialSelected = e.shiftKey ? [...selectedElIds] : [];
    if (!e.shiftKey) {
      setSelectedElIds([]);
    }

    const onMove = (ev: PointerEvent) => {
      const curPctX = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100));
      const curPctY = Math.max(0, Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100));
      const x = Math.min(startPctX, curPctX);
      const y = Math.min(startPctY, curPctY);
      const width = Math.abs(curPctX - startPctX);
      const height = Math.abs(curPctY - startPctY);
      setMarqueeRect({ x, y, width, height });

      if (width > 0.5 || height > 0.5) {
        const hitIds = elements
          .filter(
            (item) =>
              item.x <= x + width &&
              item.x + item.width >= x &&
              item.y <= y + height &&
              item.y + item.height >= y
          )
          .map((item) => item.id);
        setSelectedElIds(expandWithGroupIds([...initialSelected, ...hitIds], elements));
      }
    };

    const onUp = () => {
      setMarqueeRect(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleSaveDeck = (e: React.FormEvent) => {
    e.preventDefault();
    if (studioMode) {
      studioMode.onSaveStudio({
        layout: 'custom',
        studioBackground: themeBackground,
        studioPresentationBox: presBox,
        studioParticipantBox: partBox,
        studioElements: slides[0]?.canvasElements ?? []
      });
      setJustSaved(true);
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => setJustSaved(false), 1800);
      return;
    }
    const id = draftIdRef.current || initialItem?.id || `slide-${Date.now()}`;
    draftIdRef.current = id;
    onSave({
      id,
      title: title.trim() || 'Untitled Slides',
      subtitle: initialItem?.subtitle || t.contentTypes.slide,
      type: 'slide',
      themeBackground,
      blocks: slides
    });
    setJustSaved(true);
    if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    savedTimerRef.current = window.setTimeout(() => setJustSaved(false), 1800);
  };

  return (
    <>
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      style={{
        maxWidth: '100vw',
        maxHeight: '100vh',
        width: '100vw',
        height: '100vh',
        margin: 0,
        borderRadius: 0,
        border: 'none'
      }}
      onClose={() => {
        if (dialogRef.current) dialogRef.current.returnValue = '';
        onClose();
      }}
    >
      <form
        onSubmit={handleSaveDeck}
        style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%' }}
      >
        {/* Canva-Style Top Header Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 16px',
            background: 'linear-gradient(90deg, #1e1b4b 0%, #312e81 45%, #1e293b 100%)',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            gap: '12px',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)',
                color: '#fff',
                fontWeight: 800,
                fontSize: '0.88rem',
                letterSpacing: '0.02em',
                flexShrink: 0
              }}
            >
              <Sparkles size={14} />
              <h2 id={titleId} style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800 }}>
                {studioMode ? 'Studio Canvas' : 'Canvas'}
              </h2>
            </div>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                disabled={!canUndo}
                onClick={handleUndo}
                title="Undo (Cmd/Ctrl+Z)"
                style={{
                  ...btnStyle,
                  padding: '6px 8px',
                  background: 'rgba(255,255,255,0.08)',
                  borderColor: 'rgba(255,255,255,0.14)',
                  color: '#fff',
                  opacity: canUndo ? 1 : 0.35
                }}
              >
                <Undo2 size={14} />
              </button>
              <button
                type="button"
                disabled={!canRedo}
                onClick={handleRedo}
                title="Redo (Cmd/Ctrl+Shift+Z)"
                style={{
                  ...btnStyle,
                  padding: '6px 8px',
                  background: 'rgba(255,255,255,0.08)',
                  borderColor: 'rgba(255,255,255,0.14)',
                  color: '#fff',
                  opacity: canRedo ? 1 : 0.35
                }}
              >
                <Redo2 size={14} />
              </button>
            </div>

            {studioMode ? (
              <button
                type="button"
                onClick={() => {
                  setThemeBackground(DEFAULT_STUDIO_BACKGROUND);
                  setPresBox(DEFAULT_PRESENTATION_BOX);
                  setPartBox(DEFAULT_PARTICIPANT_BOX);
                }}
                style={{
                  ...btnStyle,
                  padding: '6px 10px',
                  background: 'rgba(255,255,255,0.08)',
                  borderColor: 'rgba(255,255,255,0.14)',
                  color: '#e2e8f0',
                  fontSize: '0.76rem'
                }}
                title="Reset Presentation & Speaker boxes to default positions"
              >
                Reset Studio Boxes
              </button>
            ) : (
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Untitled Design..."
                style={{
                  ...inputStyle,
                  maxWidth: '300px',
                  padding: '6px 10px',
                  background: 'rgba(15, 23, 42, 0.55)',
                  borderColor: 'rgba(255,255,255,0.18)',
                  color: '#fff',
                  fontWeight: 600
                }}
              />
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button
              type="submit"
              style={{
                padding: '7px 16px',
                borderRadius: '8px',
                border: 'none',
                background: justSaved ? '#10b981' : '#7c3aed',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.82rem',
                transition: 'background 150ms ease',
                cursor: 'pointer'
              }}
            >
              {justSaved ? 'Saved ✓' : t.editor.save}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.editor.cancel}
              style={{
                ...btnStyle,
                padding: '6px 8px',
                background: 'rgba(255,255,255,0.08)',
                borderColor: 'rgba(255,255,255,0.14)',
                color: '#fff'
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Hidden local image upload input */}
        <input
          ref={imgFileRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          style={{ display: 'none' }}
        />

        {/* Hidden local 3D model (.glb) upload input */}
        <input
          ref={glbFileRef}
          type="file"
          accept=".glb,model/gltf-binary"
          onChange={handleGlbUpload}
          style={{ display: 'none' }}
        />

        {/* Canva-Style Workspace: Far-Left Icon Rail + Collapsible Drawer + Center Studio */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          {/* Far-Left Vertical Icon Rail */}
          <nav
            aria-label="Canvas Tools"
            style={{
              width: '68px',
              flexShrink: 0,
              background: '#0b0f19',
              borderRight: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '10px 4px',
              gap: '6px'
            }}
          >
            {(
              [
                { id: 'elements', label: 'Elements', icon: <Sparkles size={18} /> },
                { id: 'text', label: 'Text', icon: <Type size={18} /> },
                { id: 'uploads', label: 'Uploads', icon: <Upload size={18} /> },
                { id: 'background', label: 'Background', icon: <Palette size={18} /> },
                { id: 'layers', label: 'Layers', icon: <Layers size={18} /> }
              ] as const
            ).map((tab) => {
              const active = activeRailTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveRailTab((prev) => (prev === tab.id ? null : tab.id))}
                  style={{
                    width: '58px',
                    padding: '8px 2px',
                    borderRadius: '10px',
                    border: 'none',
                    background: active ? 'rgba(124, 58, 237, 0.25)' : 'transparent',
                    color: active ? '#ddd6fe' : '#94a3b8',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.64rem',
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer'
                  }}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Collapsible Left Drawer (320px) */}
          {activeRailTab && (
            <aside
              style={{
                width: '320px',
                flexShrink: 0,
                background: '#111827',
                borderRight: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--border-subtle)'
                }}
              >
                <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'capitalize' }}>
                  {activeRailTab}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveRailTab(null)}
                  title="Collapse panel for larger canvas"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    padding: '2px',
                    display: 'inline-flex',
                    cursor: 'pointer'
                  }}
                >
                  <ChevronLeft size={16} />
                </button>
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px'
                }}
              >
                {activeRailTab === 'elements' && (
                  <CanvasElementsDrawer
                    onAddShape={handleAddShape}
                    onAddDivider={handleAddDivider}
                    onInsertSvgIcon={({ name, svgTemplate, color, dataUrl, aspect }) => {
                      const ratio = aspect && aspect > 0 ? aspect : 1;
                      let height = ratio > 1.5 ? 18 : 28;
                      let width = Number((height * ratio * (9 / 16)).toFixed(2));
                      if (width > 70) {
                        width = 70;
                        height = Number((width / (ratio * (9 / 16))).toFixed(2));
                      }
                      const newEl: CanvasElement = {
                        id: `el-${Date.now()}`,
                        name,
                        kind: 'image',
                        x: Number(((100 - width) / 2).toFixed(2)),
                        y: Number(((100 - height) / 2).toFixed(2)),
                        width,
                        height,
                        zIndex: elements.length + 1,
                        color,
                        svgTemplate,
                        imageSrc: dataUrl,
                        opacity: 1
                      };
                      updateActiveElements((prev) => [...prev, newEl]);
                      setSelectedElId(newEl.id);
                      setEditingTextId(null);
                    }}
                    onInsertImage={({ name, url, naturalWidth, naturalHeight }) => {
                      const aspect =
                        naturalWidth > 0 && naturalHeight > 0 ? naturalWidth / naturalHeight : 16 / 9;
                      let height = 45;
                      let width = Number((height * aspect * (9 / 16)).toFixed(2));
                      if (width > 70) {
                        width = 70;
                        height = Number((width / (aspect * (9 / 16))).toFixed(2));
                      }
                      const newEl: CanvasElement = {
                        id: `el-${Date.now()}`,
                        name,
                        kind: 'image',
                        x: Number(((100 - width) / 2).toFixed(2)),
                        y: Number(((100 - height) / 2).toFixed(2)),
                        width,
                        height,
                        zIndex: elements.length + 1,
                        imageSrc: url,
                        opacity: 1
                      };
                      updateActiveElements((prev) => [...prev, newEl]);
                      setSelectedElId(newEl.id);
                      setEditingTextId(null);
                    }}
                    onSetBackgroundImage={(url) => {
                      updateActiveSlideBackground(`url("${url}") center / cover no-repeat`);
                    }}
                    onInsertGridLayout={(gridName, rects) => {
                      const baseZ = elements.length;
                      const created: CanvasElement[] = rects.map((r, i) => ({
                        id: `el-${Date.now()}-${i}`,
                        name: `${gridName} (${i + 1})`,
                        kind: 'shape',
                        shapeType: 'rectangle',
                        x: r.x,
                        y: r.y,
                        width: r.width,
                        height: r.height,
                        zIndex: baseZ + i + 1,
                        backgroundColor: 'rgba(148, 163, 184, 0.22)',
                        borderRadius: 16,
                        opacity: 1
                      }));
                      updateActiveElements((prev) => [...prev, ...created]);
                      setSelectedElIds(created.map((c) => c.id));
                      setEditingTextId(null);
                    }}
                    onAddFrame={(frameShape: FrameVariant, name: string, aspect: number) => {
                      const ratio = aspect > 0 ? aspect : 1;
                      const height = 38;
                      let width = Number((height * ratio * (9 / 16)).toFixed(2));
                      let finalH = height;
                      if (width > 65) {
                        width = 65;
                        finalH = Number((width / (ratio * (9 / 16))).toFixed(2));
                      }
                      const newEl: CanvasElement = {
                        id: `el-${Date.now()}`,
                        name,
                        kind: 'frame',
                        frameShape,
                        borderRadius: frameShape === 'rounded' ? 32 : 0,
                        x: Number(((100 - width) / 2).toFixed(2)),
                        y: Number(((100 - finalH) / 2).toFixed(2)),
                        width,
                        height: finalH,
                        zIndex: elements.length + 1,
                        opacity: 1
                      };
                      updateActiveElements((prev) => [...prev, newEl]);
                      setSelectedElId(newEl.id);
                      setEditingTextId(null);
                    }}
                  />
                )}

                {activeRailTab === 'text' && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleAddText('heading')}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: 'none',
                        background: '#7c3aed',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '0.84rem',
                        cursor: 'pointer'
                      }}
                    >
                      + Add a text box
                    </button>
                    <span style={sectionTitleStyle}>Quick Text Styles</span>
                    <button
                      type="button"
                      onClick={() => handleAddText('heading')}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '12px',
                        borderRadius: '10px',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-panel-elevated)',
                        color: '#fff',
                        fontSize: '1.15rem',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      Add a heading
                    </button>
                    {studioMode && (
                      <button
                        type="button"
                        onClick={handleAddParticipantWidget}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          border: '1px solid rgba(251, 191, 36, 0.45)',
                          background: 'rgba(251, 191, 36, 0.12)',
                          color: '#fde68a',
                          fontSize: '0.84rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        + Speaker Name / Title
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleAddText('subheading')}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-panel-elevated)',
                        color: '#e2e8f0',
                        fontSize: '0.92rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Add a subheading
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddText('body')}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-panel-elevated)',
                        color: '#cbd5e1',
                        fontSize: '0.78rem',
                        fontWeight: 400,
                        cursor: 'pointer'
                      }}
                    >
                      Add a little bit of body text
                    </button>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                      Tip: Double-click any text box on the canvas to type directly inside it.
                    </p>
                  </>
                )}

                {activeRailTab === 'uploads' && (
                  <>
                    <button
                      type="button"
                      onClick={() => imgFileRef.current?.click()}
                      style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '10px',
                        border: 'none',
                        background: '#7c3aed',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '0.84rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '7px',
                        cursor: 'pointer'
                      }}
                    >
                      <Upload size={15} /> Upload Image File
                    </button>
                    <button
                      type="button"
                      onClick={() => glbFileRef.current?.click()}
                      style={{
                        ...btnStyle,
                        width: '100%',
                        padding: '10px',
                        borderColor: 'rgba(167, 139, 250, 0.45)',
                        color: '#ddd6fe'
                      }}
                      title="Import a binary glTF (.glb) 3D model"
                    >
                      <Box size={14} /> Upload 3D Model (.glb)
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveRailTab('elements')}
                      style={{ ...btnStyle, width: '100%', padding: '10px' }}
                    >
                      <ImageIcon size={14} /> Browse Elements &amp; Photos
                    </button>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: '4px'
                      }}
                    >
                      <span style={sectionTitleStyle}>
                        Your Uploads ({uploadedImages.length})
                      </span>
                    </div>
                    {uploadedImages.length === 0 ? (
                      <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                        Uploaded and stock images are stored locally so your presentation stays 100% offline-ready.
                      </p>
                    ) : (
                      <div
                        style={{
                          columns: 2,
                          columnGap: '8px'
                        }}
                      >
                        {uploadedImages.map((item) => (
                          <div
                            key={item.fileName}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('application/x-uecfi-uploaded-image', item.url);
                            }}
                            onClick={() => addImageUrlToSlide(item.url, 'Uploaded Image')}
                            title="Click to add to slide, or drag onto a Frame"
                            style={{
                              position: 'relative',
                              breakInside: 'avoid',
                              marginBottom: '8px',
                              borderRadius: '8px',
                              overflow: 'hidden',
                              border: '1px solid var(--border-subtle)',
                              background: 'var(--bg-panel-elevated)',
                              cursor: 'pointer'
                            }}
                          >
                            <img
                              src={item.url}
                              alt=""
                              loading="lazy"
                              style={{
                                width: '100%',
                                height: 'auto',
                                display: 'block'
                              }}
                            />
                            <button
                              type="button"
                              title="Remove from uploads"
                              onClick={(e) => {
                                e.stopPropagation();
                                void (async () => {
                                  await window.presenterAPI?.deleteMediaFile?.(item.fileName);
                                  await refreshUploadedImages();
                                })();
                              }}
                              style={{
                                position: 'absolute',
                                top: '4px',
                                right: '4px',
                                width: '20px',
                                height: '20px',
                                borderRadius: '999px',
                                border: 'none',
                                background: 'rgba(15, 23, 42, 0.78)',
                                color: '#f8fafc',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                opacity: 0.85
                              }}
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {activeRailTab === 'background' && (
                  <>
                    <span style={sectionTitleStyle}>Slide {activeSlideIdx + 1} Background</span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                      {THEME_PRESETS.map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          title={preset.name}
                          onClick={() => updateActiveSlideBackground(preset.value)}
                          style={{
                            aspectRatio: '16 / 10',
                            borderRadius: '8px',
                            background: preset.value,
                            border:
                              activeSlideBg === preset.value
                                ? '2px solid #a78bfa'
                                : '1px solid var(--border-subtle)',
                            cursor: 'pointer'
                          }}
                        />
                      ))}
                    </div>
                    <label style={fieldLabelStyle}>
                      <span>Solid Color</span>
                      <input
                        type="color"
                        value={activeSlideBg.startsWith('#') ? activeSlideBg : '#0f172a'}
                        onChange={(e) => updateActiveSlideBackground(e.target.value)}
                        style={{
                          width: '100%',
                          height: '34px',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '8px',
                          background: 'transparent',
                          cursor: 'pointer'
                        }}
                      />
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <span style={sectionTitleStyle}>Custom Background Image</span>
                      <BackgroundImagePicker
                        value={activeSlideBg}
                        onSelect={updateActiveSlideBackground}
                      />
                    </div>
                  </>
                )}

                {activeRailTab === 'layers' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={sectionTitleStyle}>Layers ({elements.length}) — Drag to Reorder</span>
                    {elements.length === 0 ? (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        No elements on this slide yet.
                      </div>
                    ) : (
                      [...elements]
                        .sort((a, b) => b.zIndex - a.zIndex)
                        .map((el, visualIdx, arr) => {
                          const isSel = selectedElIds.includes(el.id);
                          const label =
                              el.kind === 'text'
                                ? el.text?.split('\n')[0]?.slice(0, 22) || 'Text'
                                : el.kind === 'image'
                                  ? el.name || 'Image'
                                  : el.kind === 'model3d'
                                    ? el.name || '3D Model'
                                    : el.kind === 'frame'
                                      ? el.name || 'Frame'
                                      : el.kind === 'divider'
                                        ? el.name || 'Divider'
                                        : el.name ||
                                          (el.shapeType
                                            ? el.shapeType.charAt(0).toUpperCase() + el.shapeType.slice(1)
                                            : 'Shape');
                          return (
                            <div
                              key={el.id}
                              draggable
                              onDragStart={(e) => e.dataTransfer.setData('text/plain', el.id)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault();
                                const draggedId = e.dataTransfer.getData('text/plain');
                                if (!draggedId || draggedId === el.id) return;
                                updateActiveElements((prev) => {
                                  const desc = [...prev].sort((a, b) => b.zIndex - a.zIndex);
                                  const fromIdx = desc.findIndex((x) => x.id === draggedId);
                                  const toIdx = desc.findIndex((x) => x.id === el.id);
                                  if (fromIdx < 0 || toIdx < 0) return prev;
                                  const [moved] = desc.splice(fromIdx, 1);
                                  desc.splice(toIdx, 0, moved);
                                  const total = desc.length;
                                  return desc.map((item, i) => ({ ...item, zIndex: total - i }));
                                });
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '6px 8px',
                                borderRadius: '8px',
                                border: '1px solid',
                                borderColor: isSel ? '#8b5cf6' : 'var(--border-subtle)',
                                background: isSel
                                  ? 'rgba(139,92,246,0.18)'
                                  : 'var(--bg-panel-elevated)'
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => setSelectedElIds(expandWithGroupIds([el.id], elements))}
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  textAlign: 'left',
                                  background: 'transparent',
                                  border: 'none',
                                  padding: 0,
                                  fontSize: '0.75rem',
                                  color: 'var(--text-primary)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  cursor: 'pointer'
                                }}
                              >
                                {label}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const clone: CanvasElement = {
                                    ...el,
                                    id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                                    groupId: undefined,
                                    x: Math.min(85, Number((el.x + 3).toFixed(2))),
                                    y: Math.min(85, Number((el.y + 3).toFixed(2))),
                                    zIndex: elements.length + 1
                                  };
                                  updateActiveElements((prev) => [...prev, clone]);
                                  setSelectedElId(clone.id);
                                }}
                                title="Duplicate Layer"
                                style={{ ...btnStyle, padding: '3px' }}
                              >
                                <Copy size={11} />
                              </button>
                              <button
                                type="button"
                                disabled={visualIdx === 0}
                                onClick={() => moveElementLayer(el.id, 1)}
                                title="Move Forward"
                                style={{ ...btnStyle, padding: '3px', opacity: visualIdx === 0 ? 0.35 : 1 }}
                              >
                                <ArrowUp size={11} />
                              </button>
                              <button
                                type="button"
                                disabled={visualIdx === arr.length - 1}
                                onClick={() => moveElementLayer(el.id, -1)}
                                title="Move Backward"
                                style={{
                                  ...btnStyle,
                                  padding: '3px',
                                  opacity: visualIdx === arr.length - 1 ? 0.35 : 1
                                }}
                              >
                                <ArrowDown size={11} />
                              </button>
                            </div>
                          );
                        })
                    )}
                  </div>
                )}
              </div>
            </aside>
          )}

          {/* Center Studio Column: Contextual Top Toolbar + Stage + Bottom Slide Filmstrip */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
            {/* Canva-Style Contextual Top Formatting Toolbar */}
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                minHeight: '46px',
                padding: '6px 14px',
                background: '#0f172a',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                flexShrink: 0,
                position: 'relative',
                zIndex: 30
              }}
            >
              {selectedElements.length > 1 ? (
                (() => {
                  const firstGroupId = selectedElements[0]?.groupId;
                  const isAlreadySingleGroup =
                    Boolean(firstGroupId) &&
                    selectedElements.every((el) => el.groupId === firstGroupId);
                  const hasAnyGroup = selectedElements.some((el) => el.groupId);
                  return (
                    <>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ddd6fe' }}>
                        {selectedElements.length} selected
                      </span>
                      <div style={{ width: '1px', height: '18px', background: 'var(--border-subtle)' }} />
                      {!isAlreadySingleGroup && (
                        <button type="button" onClick={handleGroupSelected} style={btnStyle}>
                          Group
                        </button>
                      )}
                      {hasAnyGroup && (
                        <button type="button" onClick={handleUngroupSelected} style={btnStyle}>
                          Ungroup
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const groupMap = new Map<string, string>();
                          const clones: CanvasElement[] = selectedElements.map((item, idx) => {
                            let nextGroupId: string | undefined;
                            if (item.groupId) {
                              nextGroupId =
                                groupMap.get(item.groupId) ??
                                `grp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                              groupMap.set(item.groupId, nextGroupId);
                            }
                            return {
                              ...item,
                              id: `el-${Date.now()}-${idx}`,
                              groupId: nextGroupId,
                              x: Math.min(85, item.x + 4),
                              y: Math.min(85, item.y + 4),
                              zIndex: elements.length + idx + 1
                            };
                          });
                          updateActiveElements((prev) => [...prev, ...clones]);
                          setSelectedElIds(clones.map((c) => c.id));
                        }}
                        style={btnStyle}
                      >
                        <Copy size={13} /> Duplicate
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const toRemove = new Set(selectedElIds);
                          updateActiveElements((prev) => prev.filter((el) => !toRemove.has(el.id)));
                          setSelectedElIds([]);
                        }}
                        style={{ ...btnStyle, borderColor: '#7f1d1d', color: '#fca5a5' }}
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </>
                  );
                })()
              ) : !selectedEl ? (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveRailTab('background')}
                    style={{
                      ...btnStyle,
                      padding: '4px 9px',
                      gap: '6px'
                    }}
                  >
                    <span
                      style={{
                        width: '14px',
                        height: '14px',
                        borderRadius: '4px',
                        background: activeSlideBg,
                        border: '1px solid rgba(255,255,255,0.35)'
                      }}
                    />
                    Background
                  </button>
                  <button type="button" onClick={() => handleAddText('heading')} style={btnStyle}>
                    <Type size={13} /> + Text
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveRailTab('elements')}
                    style={{
                      ...btnStyle,
                      borderColor: 'rgba(139, 92, 246, 0.5)',
                      background: 'rgba(124, 58, 237, 0.16)',
                      color: '#ddd6fe'
                    }}
                  >
                    <Sparkles size={13} /> Elements
                  </button>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    Click an item to format • Drag canvas to multi-select
                  </span>
                </>
              ) : (
                <>
                  {/* TEXT CONTEXTUAL CONTROLS */}
                  {selectedEl.kind === 'text' && (
                    <>
                      <select
                        aria-label="Font family"
                        value={selectedEl.fontFamily ?? LOCAL_FONTS[0].value}
                        onChange={(e) => updateSelectedEl({ fontFamily: e.target.value })}
                        style={{ ...inputStyle, width: '132px', padding: '4px 8px', fontSize: '0.78rem' }}
                      >
                        {LOCAL_FONTS.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>

                      {/* Canva-style - [Size] + stepper */}
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '7px',
                          overflow: 'hidden',
                          background: 'var(--bg-app)'
                        }}
                      >
                        <button
                          type="button"
                          aria-label="Decrease font size"
                          onClick={() =>
                            updateSelectedEl({ fontSize: Math.max(8, (selectedEl.fontSize ?? 56) - 1) })
                          }
                          style={{
                            width: '24px',
                            height: '26px',
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--text-primary)',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          aria-label="Font size"
                          min={8}
                          max={700}
                          value={selectedEl.fontSize ?? 56}
                          onChange={(e) => {
                            const parsed = Number.parseInt(e.target.value, 10);
                            if (!Number.isNaN(parsed)) {
                              updateSelectedEl({ fontSize: Math.max(8, Math.min(700, parsed)) });
                            }
                          }}
                          style={{
                            width: '44px',
                            height: '26px',
                            border: 'none',
                            borderLeft: '1px solid var(--border-subtle)',
                            borderRight: '1px solid var(--border-subtle)',
                            background: 'transparent',
                            color: 'var(--text-primary)',
                            textAlign: 'center',
                            fontSize: '0.78rem',
                            fontVariantNumeric: 'tabular-nums'
                          }}
                        />
                        <button
                          type="button"
                          aria-label="Increase font size"
                          onClick={() =>
                            updateSelectedEl({ fontSize: Math.min(700, (selectedEl.fontSize ?? 56) + 1) })
                          }
                          style={{
                            width: '24px',
                            height: '26px',
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--text-primary)',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          +
                        </button>
                      </div>

                      <input
                        type="color"
                        title="Text Color"
                        aria-label="Text color"
                        value={selectedEl.color ?? '#ffffff'}
                        onChange={(e) => updateSelectedEl({ color: e.target.value })}
                        style={{
                          width: '28px',
                          height: '28px',
                          padding: 0,
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '6px',
                          background: 'transparent',
                          cursor: 'pointer'
                        }}
                      />

                      <div style={{ width: '1px', height: '18px', background: 'var(--border-subtle)' }} />

                      <button
                        type="button"
                        title="Bold"
                        onClick={() =>
                          updateSelectedEl({
                            fontWeight: (selectedEl.fontWeight ?? '700') === '400' ? '700' : '400'
                          })
                        }
                        style={{
                          ...btnStyle,
                          padding: '4px 8px',
                          fontWeight: 800,
                          background:
                            (selectedEl.fontWeight ?? '700') !== '400'
                              ? 'rgba(124,58,237,0.3)'
                              : 'transparent'
                        }}
                      >
                        B
                      </button>
                      <button
                        type="button"
                        title="Italic"
                        onClick={() =>
                          updateSelectedEl({
                            fontStyle: selectedEl.fontStyle === 'italic' ? 'normal' : 'italic'
                          })
                        }
                        style={{
                          ...btnStyle,
                          padding: '5px 7px',
                          background:
                            selectedEl.fontStyle === 'italic' ? 'rgba(124,58,237,0.3)' : 'transparent'
                        }}
                      >
                        <Italic size={13} />
                      </button>
                      <button
                        type="button"
                        title="Underline"
                        onClick={() =>
                          updateSelectedEl({
                            textDecoration:
                              selectedEl.textDecoration === 'underline' ? 'none' : 'underline'
                          })
                        }
                        style={{
                          ...btnStyle,
                          padding: '5px 7px',
                          background:
                            selectedEl.textDecoration === 'underline'
                              ? 'rgba(124,58,237,0.3)'
                              : 'transparent'
                        }}
                      >
                        <Underline size={13} />
                      </button>

                      <div style={{ width: '1px', height: '18px', background: 'var(--border-subtle)' }} />

                      {(
                        [
                          { align: 'left', icon: <AlignLeft size={13} /> },
                          { align: 'center', icon: <AlignCenter size={13} /> },
                          { align: 'right', icon: <AlignRight size={13} /> }
                        ] as const
                      ).map((a) => (
                        <button
                          key={a.align}
                          type="button"
                          title={`Align ${a.align}`}
                          onClick={() => updateSelectedEl({ textAlign: a.align })}
                          style={{
                            ...btnStyle,
                            padding: '5px 6px',
                            background:
                              (selectedEl.textAlign ?? 'center') === a.align
                                ? 'rgba(124,58,237,0.3)'
                                : 'transparent'
                          }}
                        >
                          {a.icon}
                        </button>
                      ))}

                      <button
                        type="button"
                        onClick={() =>
                          setActivePopover((prev) => (prev === 'effects' ? null : 'effects'))
                        }
                        style={{
                          ...btnStyle,
                          padding: '5px 9px',
                          background:
                            activePopover === 'effects' ? 'rgba(124,58,237,0.3)' : 'transparent'
                        }}
                      >
                        Effects &amp; Spacing
                      </button>
                    </>
                  )}

                  {/* SHAPE CONTEXTUAL CONTROLS */}
                  {selectedEl.kind === 'shape' && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setActivePopover((prev) => (prev === 'shape' ? null : 'shape'))
                        }
                        style={{
                          ...btnStyle,
                          padding: '5px 9px',
                          background:
                            activePopover === 'shape' ? 'rgba(124,58,237,0.3)' : 'transparent'
                        }}
                      >
                        <Square size={13} /> Shape
                      </button>
                      <input
                        type="color"
                        title="Shape Fill"
                        value={
                          selectedEl.backgroundColor?.startsWith('#')
                            ? selectedEl.backgroundColor
                            : '#1e293b'
                        }
                        onChange={(e) => updateSelectedEl({ backgroundColor: e.target.value })}
                        style={{
                          width: '28px',
                          height: '28px',
                          padding: 0,
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '6px',
                          background: 'transparent',
                          cursor: 'pointer'
                        }}
                      />
                      {(!selectedEl.shapeType || selectedEl.shapeType === 'rectangle') && (
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '0.73rem',
                            color: 'var(--text-secondary)'
                          }}
                        >
                          Radius
                          <input
                            type="range"
                            min={0}
                            max={120}
                            value={selectedEl.borderRadius ?? 0}
                            onChange={(e) => updateSelectedEl({ borderRadius: Number(e.target.value) })}
                            style={{ width: '64px' }}
                          />
                        </label>
                      )}
                    </>
                  )}

                  {/* IMAGE / ICON / STICKER / 3D MODEL CONTEXTUAL CONTROLS */}
                  {(selectedEl.kind === 'image' || selectedEl.kind === 'model3d') && (
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedEl.kind === 'image' && !selectedEl.threeD?.enabled && activePopover !== '3d') {
                          updateSelectedEl({
                            threeD: selectedEl.threeD
                              ? { ...selectedEl.threeD, enabled: true }
                              : { ...DEFAULT_THREE_D_CONFIG }
                          });
                        }
                        setActivePopover((p) => (p === '3d' ? null : '3d'));
                      }}
                      style={{
                        ...btnStyle,
                        padding: '5px 10px',
                        background:
                          activePopover === '3d' ||
                          selectedEl.kind === 'model3d' ||
                          selectedEl.threeD?.enabled
                            ? 'rgba(124,58,237,0.3)'
                            : 'transparent',
                        borderColor:
                          selectedEl.kind === 'model3d' || selectedEl.threeD?.enabled
                            ? '#a78bfa'
                            : 'var(--border-subtle)',
                        color:
                          selectedEl.kind === 'model3d' || selectedEl.threeD?.enabled
                            ? '#ddd6fe'
                            : 'var(--text-primary)'
                      }}
                      title={
                        selectedEl.kind === 'model3d'
                          ? '3D Model motion & angle controls'
                          : 'Convert PNG to 3D object with effects & animations'
                      }
                    >
                      <Box size={13} /> 3D
                    </button>
                  )}
                  {selectedEl.kind === 'image' && selectedEl.svgTemplate && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      {['#ffffff', '#fde047', '#93c5fd', '#86efac', '#f9a8d4'].map((swatch) => (
                        <button
                          key={swatch}
                          type="button"
                          onClick={() =>
                            updateSelectedEl({
                              color: swatch,
                              imageSrc: buildColoredSvgDataUrl(selectedEl.svgTemplate!, swatch)
                            })
                          }
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '999px',
                            background: swatch,
                            border:
                              (selectedEl.color || '#ffffff').toLowerCase() === swatch
                                ? '2px solid #a78bfa'
                                : '1px solid rgba(255,255,255,0.3)',
                            padding: 0,
                            cursor: 'pointer'
                          }}
                        />
                      ))}
                      <input
                        type="color"
                        title="Icon Color"
                        value={selectedEl.color ?? '#ffffff'}
                        onChange={(e) =>
                          updateSelectedEl({
                            color: e.target.value,
                            imageSrc: buildColoredSvgDataUrl(selectedEl.svgTemplate!, e.target.value)
                          })
                        }
                        style={{
                          width: '26px',
                          height: '26px',
                          padding: 0,
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '6px',
                          background: 'transparent',
                          cursor: 'pointer'
                        }}
                      />
                    </div>
                  )}

                  {/* DIVIDER CONTEXTUAL CONTROLS */}
                  {selectedEl.kind === 'divider' && (
                    <>
                      <input
                        type="color"
                        title="Divider Color"
                        value={selectedEl.color ?? '#ffffff'}
                        onChange={(e) => updateSelectedEl({ color: e.target.value })}
                        style={{
                          width: '28px',
                          height: '28px',
                          padding: 0,
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '6px',
                          background: 'transparent',
                          cursor: 'pointer'
                        }}
                      />
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontSize: '0.73rem',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        Thickness
                        <input
                          type="range"
                          min={1}
                          max={24}
                          value={selectedEl.thickness ?? 4}
                          onChange={(e) => updateSelectedEl({ thickness: Number(e.target.value) })}
                          style={{ width: '70px' }}
                        />
                      </label>
                    </>
                  )}

                  {/* FRAME CONTEXTUAL CONTROLS */}
                  {selectedEl.kind === 'frame' && (
                    <>
                      {(selectedEl.frameShape === 'square' || selectedEl.frameShape === 'rounded') && (
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '0.73rem',
                            color: 'var(--text-secondary)'
                          }}
                        >
                          Radius
                          <input
                            type="range"
                            min={0}
                            max={160}
                            value={
                              selectedEl.borderRadius ??
                              (selectedEl.frameShape === 'rounded' ? 32 : 0)
                            }
                            onChange={(e) =>
                              updateSelectedEl({ borderRadius: Number(e.target.value) })
                            }
                            style={{ width: '68px' }}
                          />
                        </label>
                      )}
                      {selectedEl.imageSrc && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setEditingFrameId((prev) =>
                                prev === selectedEl.id ? null : selectedEl.id
                              )
                            }
                            style={{
                              ...btnStyle,
                              padding: '5px 9px',
                              background:
                                editingFrameId === selectedEl.id
                                  ? 'rgba(124, 58, 237, 0.35)'
                                  : 'transparent',
                              borderColor:
                                editingFrameId === selectedEl.id
                                  ? '#8b5cf6'
                                  : 'var(--border-subtle)',
                              color:
                                editingFrameId === selectedEl.id
                                  ? '#ddd6fe'
                                  : 'var(--text-primary)'
                            }}
                          >
                            {editingFrameId === selectedEl.id ? 'Done Crop' : 'Crop / Adjust'}
                          </button>
                          <button
                            type="button"
                            title="Remove image from frame"
                            onClick={() => {
                              setEditingFrameId(null);
                              updateSelectedEl({
                                imageSrc: undefined,
                                imageScale: undefined,
                                imageOffsetX: undefined,
                                imageOffsetY: undefined,
                                imageRotation: undefined
                              });
                            }}
                            style={{
                              ...btnStyle,
                              padding: '5px 9px',
                              borderColor: 'rgba(245, 158, 11, 0.45)',
                              color: '#fde68a'
                            }}
                          >
                            Clear Photo
                          </button>
                        </>
                      )}
                    </>
                  )}

                  {/* SHARED CONTROLS: FLIP (Image/Shape/Frame), OPACITY, ANIMATE, LAYER ORDER, DUPLICATE, DELETE */}
                  {(selectedEl.kind === 'image' ||
                    selectedEl.kind === 'shape' ||
                    selectedEl.kind === 'frame') && (
                    <>
                      <button
                        type="button"
                        title="Flip Horizontal"
                        onClick={() => updateSelectedEl({ flipX: !selectedEl.flipX })}
                        style={{
                          ...btnStyle,
                          padding: '5px 7px',
                          background: selectedEl.flipX ? 'rgba(124,58,237,0.3)' : 'transparent'
                        }}
                      >
                        <FlipHorizontal2 size={13} />
                      </button>
                      <button
                        type="button"
                        title="Flip Vertical"
                        onClick={() => updateSelectedEl({ flipY: !selectedEl.flipY })}
                        style={{
                          ...btnStyle,
                          padding: '5px 7px',
                          background: selectedEl.flipY ? 'rgba(124,58,237,0.3)' : 'transparent'
                        }}
                      >
                        <FlipVertical2 size={13} />
                      </button>
                    </>
                  )}

                  {selectedEl.kind !== 'text' && (
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '0.73rem',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      Opacity
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={selectedEl.opacity ?? 1}
                        onChange={(e) => updateSelectedEl({ opacity: Number(e.target.value) })}
                        style={{ width: '64px' }}
                      />
                    </label>
                  )}

                  <div style={{ width: '1px', height: '18px', background: 'var(--border-subtle)' }} />

                  <button
                    type="button"
                    onClick={() =>
                      setActivePopover((prev) => (prev === 'animate' ? null : 'animate'))
                    }
                    style={{
                      ...btnStyle,
                      padding: '5px 9px',
                      background:
                        activePopover === 'animate' ||
                        (selectedEl.animation && selectedEl.animation !== 'none')
                          ? 'rgba(124,58,237,0.3)'
                          : 'transparent',
                      color:
                        selectedEl.animation && selectedEl.animation !== 'none'
                          ? '#ddd6fe'
                          : 'var(--text-primary)'
                    }}
                  >
                    <Wand2 size={13} /> Animate
                  </button>

                  <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      type="button"
                      title="Bring Forward"
                      onClick={() => moveElementLayer(selectedEl.id, 1)}
                      style={{ ...btnStyle, padding: '5px 6px' }}
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      title="Send Backward"
                      onClick={() => moveElementLayer(selectedEl.id, -1)}
                      style={{ ...btnStyle, padding: '5px 6px' }}
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      type="button"
                      title="Duplicate"
                      onClick={() => {
                        const clone: CanvasElement = {
                          ...selectedEl,
                          id: `el-${Date.now()}`,
                          groupId: undefined,
                          x: Math.min(85, selectedEl.x + 4),
                          y: Math.min(85, selectedEl.y + 4),
                          zIndex: elements.length + 1
                        };
                        updateActiveElements((prev) => [...prev, clone]);
                        setSelectedElId(clone.id);
                      }}
                      style={{ ...btnStyle, padding: '5px 6px' }}
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      type="button"
                      title="Delete (Backspace)"
                      onClick={() => {
                        updateActiveElements((prev) => prev.filter((el) => el.id !== selectedEl.id));
                        setSelectedElId(null);
                      }}
                      style={{ ...btnStyle, padding: '5px 6px', borderColor: '#7f1d1d', color: '#fca5a5' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </>
              )}

              {studioMode && !selectedEl && selectedStudioBox && (() => {
                const box = selectedStudioBox === 'presentation' ? presBox : partBox;
                const setBox = selectedStudioBox === 'presentation' ? setPresBox : setPartBox;
                const boxLabel =
                  selectedStudioBox === 'presentation' ? 'Presentation Box' : 'Speaker / Camera Box';
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ddd6fe' }}>
                      {boxLabel}
                    </span>
                    <div style={{ width: '1px', height: '18px', background: 'var(--border-subtle)' }} />
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                      <span>Radius ({box.borderRadius ?? 16}px)</span>
                      <input
                        type="range"
                        min={0}
                        max={48}
                        step={2}
                        value={box.borderRadius ?? 16}
                        onChange={(e) => setBox({ ...box, borderRadius: Number(e.target.value) })}
                        style={{ width: '80px' }}
                      />
                    </label>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      X {Math.round(box.x)}% · Y {Math.round(box.y)}% · {Math.round(box.width)}% × {Math.round(box.height)}%
                    </span>
                  </div>
                );
              })()}

              {/* FLOATING POPOVERS BELOW CONTEXTUAL TOOLBAR */}
              {selectedEl && activePopover === 'effects' && selectedEl.kind === 'text' && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: '14px',
                    marginTop: '6px',
                    width: '280px',
                    padding: '12px',
                    borderRadius: '12px',
                    background: '#111827',
                    border: '1px solid var(--border-subtle)',
                    boxShadow: '0 18px 40px rgba(0,0,0,0.65)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    zIndex: 50
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={sectionTitleStyle}>Text Effects &amp; Spacing</span>
                    <button
                      type="button"
                      onClick={() => setActivePopover(null)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer'
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <label style={fieldLabelStyle}>
                    <span>Font Size Slider ({selectedEl.fontSize ?? 56}px)</span>
                    <input
                      type="range"
                      min={12}
                      max={700}
                      step={1}
                      value={selectedEl.fontSize ?? 56}
                      onChange={(e) => updateSelectedEl({ fontSize: Number(e.target.value) })}
                    />
                  </label>
                  <label style={fieldLabelStyle}>
                    <span>Text Outline ({selectedEl.outlineWidth ?? 0}px)</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="range"
                        min={0}
                        max={12}
                        step={1}
                        value={selectedEl.outlineWidth ?? 0}
                        onChange={(e) => updateSelectedEl({ outlineWidth: Number(e.target.value) })}
                        style={{ flex: 1 }}
                      />
                      <input
                        type="color"
                        value={selectedEl.outlineColor ?? '#000000'}
                        onChange={(e) => updateSelectedEl({ outlineColor: e.target.value })}
                        style={{ width: '26px', height: '22px', border: 'none', background: 'transparent' }}
                      />
                    </div>
                  </label>
                  <label style={fieldLabelStyle}>
                    <span>Line Spacing ({(selectedEl.lineHeight ?? 1.22).toFixed(2)})</span>
                    <input
                      type="range"
                      min={0.9}
                      max={2.2}
                      step={0.05}
                      value={selectedEl.lineHeight ?? 1.22}
                      onChange={(e) => updateSelectedEl({ lineHeight: Number(e.target.value) })}
                    />
                  </label>
                  <label style={fieldLabelStyle}>
                    <span>Letter Spacing ({(selectedEl.letterSpacing ?? 0).toFixed(2)}em)</span>
                    <input
                      type="range"
                      min={-0.05}
                      max={0.3}
                      step={0.01}
                      value={selectedEl.letterSpacing ?? 0}
                      onChange={(e) => updateSelectedEl({ letterSpacing: Number(e.target.value) })}
                    />
                  </label>
                </div>
              )}

              {selectedEl && activePopover === 'shape' && selectedEl.kind === 'shape' && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: '14px',
                    marginTop: '6px',
                    width: '240px',
                    padding: '12px',
                    borderRadius: '12px',
                    background: '#111827',
                    border: '1px solid var(--border-subtle)',
                    boxShadow: '0 18px 40px rgba(0,0,0,0.65)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    zIndex: 50
                  }}
                >
                  <span style={sectionTitleStyle}>Change Shape</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                    {SHAPE_OPTIONS.map((opt) => {
                      const active = (selectedEl.shapeType ?? 'rectangle') === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          title={opt.label}
                          onClick={() => {
                            const prevType = selectedEl.shapeType ?? 'rectangle';
                            const isTargetSquare = opt.id !== 'rectangle' && opt.id !== 'arrowRight';
                            if (prevType === 'rectangle' && isTargetSquare) {
                              const squareW = Number(Math.min(100, selectedEl.height * (9 / 16)).toFixed(2));
                              const centerX = selectedEl.x + selectedEl.width / 2;
                              const nextX = Number(
                                Math.max(0, Math.min(100 - squareW, centerX - squareW / 2)).toFixed(2)
                              );
                              updateSelectedEl({ shapeType: opt.id, width: squareW, x: nextX });
                            } else {
                              updateSelectedEl({ shapeType: opt.id });
                            }
                            setActivePopover(null);
                          }}
                          style={{
                            height: '36px',
                            borderRadius: '7px',
                            border: '1px solid',
                            borderColor: active ? '#8b5cf6' : 'var(--border-subtle)',
                            background: active ? 'rgba(139,92,246,0.2)' : 'var(--bg-panel-elevated)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                          }}
                        >
                          <div style={{ width: '18px', height: '18px' }}>
                            <CanvasShapeGraphic shapeType={opt.id} fill={active ? '#c4b5fd' : '#cbd5e1'} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedEl && activePopover === 'animate' && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: '14px',
                    marginTop: '6px',
                    width: '270px',
                    padding: '12px',
                    borderRadius: '12px',
                    background: '#111827',
                    border: '1px solid var(--border-subtle)',
                    boxShadow: '0 18px 40px rgba(0,0,0,0.65)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    zIndex: 50
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={sectionTitleStyle}>Element Animation</span>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      {selectedEl.animation && selectedEl.animation !== 'none' && (
                        <button
                          type="button"
                          onClick={() => setAnimReplayNonce((n) => n + 1)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            border: '1px solid rgba(56, 189, 248, 0.45)',
                            background: 'rgba(56, 189, 248, 0.14)',
                            color: '#7dd3fc',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Replay
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setActivePopover(null)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer'
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                  <select
                    aria-label="Element animation"
                    value={selectedEl.animation ?? 'none'}
                    onChange={(e) => {
                      const nextAnim = e.target.value as CanvasAnimationType;
                      const preset = CANVAS_ANIMATION_PRESETS.find((p) => p.id === nextAnim);
                      updateSelectedEl({
                        animation: nextAnim === 'none' ? undefined : nextAnim,
                        animationDuration:
                          nextAnim === 'none' ? undefined : preset?.defaultDuration ?? 0.7,
                        animationDelay: nextAnim === 'none' ? undefined : selectedEl.animationDelay ?? 0
                      });
                      setAnimReplayNonce((n) => n + 1);
                    }}
                    style={inputStyle}
                  >
                    <option value="none">None</option>
                    <optgroup label="Entrance (On Slide Show)">
                      {CANVAS_ANIMATION_PRESETS.filter((p) => p.group === 'entrance').map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Continuous Motion (Loop)">
                      {CANVAS_ANIMATION_PRESETS.filter((p) => p.group === 'loop').map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  {selectedEl.animation && selectedEl.animation !== 'none' && (
                    <>
                      <label style={fieldLabelStyle}>
                        <span>Duration ({(selectedEl.animationDuration ?? 0.7).toFixed(1)}s)</span>
                        <input
                          type="range"
                          min={0.3}
                          max={isLoopAnimation(selectedEl.animation) ? 14 : 3}
                          step={0.1}
                          value={selectedEl.animationDuration ?? 0.7}
                          onChange={(e) => {
                            updateSelectedEl({ animationDuration: Number(e.target.value) });
                            setAnimReplayNonce((n) => n + 1);
                          }}
                        />
                      </label>
                      {!isLoopAnimation(selectedEl.animation) && (
                        <label style={fieldLabelStyle}>
                          <span>Delay ({(selectedEl.animationDelay ?? 0).toFixed(1)}s)</span>
                          <input
                            type="range"
                            min={0}
                            max={3}
                            step={0.1}
                            value={selectedEl.animationDelay ?? 0}
                            onChange={(e) => {
                              updateSelectedEl({ animationDelay: Number(e.target.value) });
                              setAnimReplayNonce((n) => n + 1);
                            }}
                          />
                        </label>
                      )}
                    </>
                  )}
                </div>
              )}

              {selectedEl && activePopover === '3d' && (selectedEl.kind === 'image' || selectedEl.kind === 'model3d') && (() => {
                const td = selectedEl.threeD ?? DEFAULT_THREE_D_CONFIG;
                const isGlbModel = selectedEl.kind === 'model3d';
                const patch3D = (patch: Partial<typeof td>) =>
                  updateSelectedEl({ threeD: { ...td, ...patch } });
                return (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: '14px',
                      marginTop: '6px',
                      width: '280px',
                      padding: '12px',
                      borderRadius: '12px',
                      background: '#111827',
                      border: '1px solid var(--border-subtle)',
                      boxShadow: '0 18px 40px rgba(0,0,0,0.65)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      zIndex: 50
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={sectionTitleStyle}>{isGlbModel ? '3D Model (.glb)' : '3D Object'}</span>
                      {!isGlbModel && (
                        <button
                          type="button"
                          onClick={() => patch3D({ enabled: !td.enabled })}
                          style={{
                            ...btnStyle,
                            padding: '4px 10px',
                            background: td.enabled ? '#7c3aed' : 'transparent',
                            borderColor: td.enabled ? '#a78bfa' : 'var(--border-subtle)',
                            color: td.enabled ? '#ffffff' : 'var(--text-secondary)',
                            fontWeight: 700
                          }}
                        >
                          <Box size={12} /> {td.enabled ? '3D On' : '3D Off'}
                        </button>
                      )}
                    </div>
                    {!isGlbModel && (
                      <>
                    <label style={fieldLabelStyle}>
                      <span>Depth ({td.depth.toFixed(2)})</span>
                      <input
                        type="range"
                        min={0.04}
                        max={0.55}
                        step={0.02}
                        value={td.depth}
                        onChange={(e) => patch3D({ enabled: true, depth: Number(e.target.value) })}
                      />
                    </label>
                    <label style={fieldLabelStyle}>
                      <span>Bevel ({td.bevel.toFixed(3)})</span>
                      <input
                        type="range"
                        min={0}
                        max={0.05}
                        step={0.005}
                        value={td.bevel}
                        onChange={(e) => patch3D({ enabled: true, bevel: Number(e.target.value) })}
                      />
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label style={{ ...fieldLabelStyle, flex: 1 }}>
                        <span>Edge Finish</span>
                        <select
                          aria-label="3D edge material"
                          value={td.material}
                          onChange={(e) => {
                            const nextMat = e.target.value as CanvasThreeDMaterial;
                            const nextColor =
                              nextMat === 'ice' && td.edgeColor === '#cbd5e1'
                                ? '#7dd3fc'
                                : nextMat === 'glass' && td.edgeColor === '#cbd5e1'
                                  ? '#e0f2fe'
                                  : td.edgeColor;
                            patch3D({ enabled: true, material: nextMat, edgeColor: nextColor });
                          }}
                          style={inputStyle}
                        >
                          <option value="metallic">Metallic</option>
                          <option value="glossy">Glossy</option>
                          <option value="ice">Glowing Ice</option>
                          <option value="glass">Crystal Glass</option>
                          <option value="matte">Matte</option>
                          <option value="neon">Neon Glow</option>
                        </select>
                      </label>
                      <label style={fieldLabelStyle}>
                        <span>Color</span>
                        <input
                          type="color"
                          title="3D Edge Color"
                          value={td.edgeColor}
                          onChange={(e) => patch3D({ enabled: true, edgeColor: e.target.value })}
                          style={{
                            width: '34px',
                            height: '30px',
                            padding: 0,
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '6px',
                            background: 'transparent',
                            cursor: 'pointer'
                          }}
                        />
                      </label>
                    </div>
                      </>
                    )}
                    <label style={fieldLabelStyle}>
                      <span>3D Animation</span>
                      <select
                        aria-label="3D animation"
                        value={td.animation}
                        onChange={(e) =>
                          patch3D({ enabled: true, animation: e.target.value as CanvasThreeDAnimation })
                        }
                        style={inputStyle}
                      >
                        <option value="none">Static</option>
                        <option value="float">Float</option>
                        <option value="spin">3D Spin</option>
                        <option value="tilt">Tilt Sway</option>
                        <option value="flip">Coin Flip</option>
                        <option value="orbit">3D Orbit</option>
                      </select>
                    </label>
                    {td.animation !== 'none' && (
                      <label style={fieldLabelStyle}>
                        <span>Speed ({td.speed.toFixed(1)}x)</span>
                        <input
                          type="range"
                          min={0.25}
                          max={3}
                          step={0.25}
                          value={td.speed}
                          onChange={(e) => patch3D({ enabled: true, speed: Number(e.target.value) })}
                        />
                      </label>
                    )}
                    <label style={fieldLabelStyle}>
                      <span>Angle Y ({td.tiltY}°)</span>
                      <input
                        type="range"
                        min={-45}
                        max={45}
                        step={2}
                        value={td.tiltY}
                        onChange={(e) => patch3D({ enabled: true, tiltY: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                );
              })()}
            </div>

            {/* Center: HUGE Interactive 16:9 Safe-Area Canvas (strictly locked to 16:9 via container units) */}
            <main
              onClick={() => {
                setSelectedElId(null);
                setActivePopover(null);
              }}
              style={{
                flex: 1,
                minHeight: 0,
                containerType: 'size',
                background: '#070a11',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                overflow: 'hidden'
              }}
            >
            <div
              ref={stageRef}
              onPointerDown={startMarquee}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 'min(calc(100cqw - 48px), calc((100cqh - 48px) * 16 / 9))',
                height: 'min(calc(100cqh - 48px), calc((100cqw - 48px) * 9 / 16))',
                background: activeSlideBg,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                position: 'relative',
                borderRadius: '8px',
                boxShadow: '0 16px 48px rgba(0, 0, 0, 0.7)',
                overflow: 'hidden',
                userSelect: 'none',
                flexShrink: 0
              }}
            >
              {/* Center Snap Guides */}
              {snapGuide.x !== null && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${snapGuide.x}%`,
                    top: 0,
                    bottom: 0,
                    width: '1px',
                    background: snapGuide.x === 50 ? '#38bdf8' : '#e879f9',
                    pointerEvents: 'none',
                    zIndex: 999
                  }}
                />
              )}
              {snapGuide.y !== null && (
                <div
                  style={{
                    position: 'absolute',
                    top: `${snapGuide.y}%`,
                    left: 0,
                    right: 0,
                    height: '1px',
                    background: snapGuide.y === 50 ? '#38bdf8' : '#e879f9',
                    pointerEvents: 'none',
                    zIndex: 999
                  }}
                />
              )}

              {[...elements]
                .sort((a, b) => a.zIndex - b.zIndex)
                .map((el) => {
                  const isSelected = selectedElIds.includes(el.id);
                  const isEditingThisText = el.kind === 'text' && editingTextId === el.id;
                  const isEditingThisFrame =
                    el.kind === 'frame' && Boolean(el.imageSrc) && editingFrameId === el.id;
                  const isVectorShape =
                    el.kind === 'shape' && el.shapeType && el.shapeType !== 'rectangle';
                  const sharedTextStyle: React.CSSProperties = {
                    width: '100%',
                    color: el.color || '#ffffff',
                    fontFamily: el.fontFamily || "'Inter', sans-serif",
                    fontSize: `${(el.fontSize ?? 56) * scale}px`,
                    fontWeight: el.fontWeight ?? '700',
                    fontStyle: el.fontStyle ?? 'normal',
                    textDecoration: el.textDecoration ?? 'none',
                    textAlign: el.textAlign ?? 'center',
                    lineHeight: el.lineHeight ?? 1.22,
                    letterSpacing:
                      typeof el.letterSpacing === 'number'
                        ? `${el.letterSpacing}em`
                        : undefined,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                    padding: `${12 * scale}px`,
                    WebkitTextStroke:
                      el.outlineWidth && el.outlineWidth > 0
                        ? `${el.outlineWidth * scale}px ${el.outlineColor || '#000000'}`
                        : undefined,
                    paintOrder:
                      el.outlineWidth && el.outlineWidth > 0 ? 'stroke fill' : undefined,
                    textShadow: '0 2px 14px rgba(0,0,0,0.45)'
                  };
                  return (
                    <div
                      key={el.id}
                      onPointerDown={(e) => {
                        if (isEditingThisText) {
                          e.stopPropagation();
                          return;
                        }
                        if (isEditingThisFrame) {
                          startFrameCropDrag(e, el, 'pan');
                          return;
                        }
                        startDrag(e, el, 'move');
                      }}
                      onDoubleClick={(e) => {
                        if (el.kind === 'text') {
                          e.stopPropagation();
                          setSelectedElId(el.id);
                          setEditingTextId(el.id);
                        } else if (el.kind === 'frame' && el.imageSrc) {
                          e.stopPropagation();
                          setSelectedElId(el.id);
                          setEditingFrameId(el.id);
                        }
                      }}
                      onDragOver={(e) => {
                        if (el.kind === 'frame') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (dropTargetFrameId !== el.id) setDropTargetFrameId(el.id);
                        }
                      }}
                      onDragLeave={() => {
                        if (el.kind === 'frame' && dropTargetFrameId === el.id) {
                          setDropTargetFrameId(null);
                        }
                      }}
                      onDrop={async (e) => {
                        if (el.kind !== 'frame') return;
                        e.preventDefault();
                        e.stopPropagation();
                        setDropTargetFrameId(null);

                        // Case 1a: Dragged a saved image from the Uploads drawer
                        const uploadedUrl = e.dataTransfer.getData('application/x-uecfi-uploaded-image');
                        if (uploadedUrl) {
                          updateActiveElements((prev) =>
                            prev.map((item) =>
                              item.id === el.id ? { ...item, imageSrc: uploadedUrl } : item
                            )
                          );
                          setSelectedElId(el.id);
                          return;
                        }

                        // Case 1b: Dragged a Pixabay photo/vector/art card from the Elements drawer
                        const rawPhoto = e.dataTransfer.getData('application/x-uecfi-photo');
                        if (rawPhoto) {
                          try {
                            const hit = JSON.parse(rawPhoto) as {
                              id: number;
                              largeImageURL?: string;
                              webformatURL?: string;
                            };
                            const src = hit.largeImageURL || hit.webformatURL;
                            if (!src) return;
                            const res = await fetch(src);
                            if (!res.ok) return;
                            const blob = await res.blob();
                            const ext = blob.type.includes('png')
                              ? 'png'
                              : blob.type.includes('webp')
                                ? 'webp'
                                : 'jpg';
                            const fileName = `pixabay-${hit.id}.${ext}`;
                            let localUrl = '';
                            if (window.presenterAPI?.saveMediaFile) {
                              const bytes = new Uint8Array(await blob.arrayBuffer());
                              const saved = await window.presenterAPI.saveMediaFile(fileName, bytes);
                              localUrl = saved.url;
                            } else {
                              localUrl = await new Promise<string>((resolve, reject) => {
                                const reader = new FileReader();
                                reader.onload = () => resolve(String(reader.result));
                                reader.onerror = () => reject(new Error('Failed'));
                                reader.readAsDataURL(blob);
                              });
                            }
                            if (localUrl) {
                              updateActiveElements((prev) =>
                                prev.map((item) =>
                                  item.id === el.id ? { ...item, imageSrc: localUrl } : item
                                )
                              );
                              setSelectedElId(el.id);
                            }
                          } catch {
                            // Ignore failed drop
                          }
                          return;
                        }

                        // Case 2: Dropped a local image file from Finder/Desktop onto the Frame
                        const file = e.dataTransfer.files?.[0];
                        if (file && file.type.startsWith('image/')) {
                          const mediaUrl = await saveUserMediaFile(file);
                          void refreshUploadedImages();
                          updateActiveElements((prev) =>
                            prev.map((item) =>
                              item.id === el.id ? { ...item, imageSrc: mediaUrl } : item
                            )
                          );
                          setSelectedElId(el.id);
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute',
                        left: `${el.x}%`,
                        top: `${el.y}%`,
                        width: `${el.width}%`,
                        height: `${el.height}%`,
                        zIndex: el.zIndex,
                        opacity: el.opacity ?? 1,
                        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                        backgroundColor: isVectorShape ? 'transparent' : el.backgroundColor || 'transparent',
                        borderRadius: isVectorShape ? undefined : `${(el.borderRadius ?? 0) * scale}px`,
                        outline: isEditingThisText
                          ? '2px solid #8b5cf6'
                          : isSelected
                            ? '2px solid #38bdf8'
                            : '1px dashed rgba(255,255,255,0.18)',
                        cursor: isEditingThisText ? 'text' : 'move',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent:
                          el.textAlign === 'left'
                            ? 'flex-start'
                            : el.textAlign === 'right'
                              ? 'flex-end'
                              : 'center'
                      }}
                    >
                      <div
                        key={el.animation && el.animation !== 'none' ? `${el.id}-${animReplayNonce}` : el.id}
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent:
                            el.textAlign === 'left'
                              ? 'flex-start'
                              : el.textAlign === 'right'
                                ? 'flex-end'
                                : 'center',
                          ...(!isEditingThisText ? getElementAnimationStyle(el) : {})
                        }}
                      >
                      {isVectorShape && el.shapeType && (
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            transform:
                              el.flipX || el.flipY
                                ? `scale(${el.flipX ? -1 : 1}, ${el.flipY ? -1 : 1})`
                                : undefined
                          }}
                        >
                          <CanvasShapeGraphic
                            shapeType={el.shapeType}
                            fill={el.backgroundColor || '#1e293b'}
                          />
                        </div>
                      )}
                      {el.kind === 'text' &&
                        (isEditingThisText ? (
                          <textarea
                            ref={inlineTextareaRef}
                            value={el.text ?? ''}
                            onPointerDown={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const nextVal = e.target.value;
                              const ta = e.currentTarget;
                              // Auto-grow bounding box height smoothly if typed lines overflow
                              const stageH = stageRef.current?.clientHeight || 0;
                              let nextHeightPct: number | undefined;
                              if (stageH > 0 && ta.scrollHeight > ta.clientHeight + 2) {
                                nextHeightPct = Math.min(
                                  100,
                                  Number(((ta.scrollHeight / stageH) * 100 + 1).toFixed(2))
                                );
                              }
                              updateActiveElements(
                                (prev) =>
                                  prev.map((item) =>
                                    item.id === el.id
                                      ? {
                                          ...item,
                                          text: nextVal,
                                          ...(nextHeightPct !== undefined && nextHeightPct > item.height
                                            ? { height: nextHeightPct }
                                            : {})
                                        }
                                      : item
                                  ),
                                false
                              );
                            }}
                            onBlur={() => {
                              pushHistory(slidesRef.current, bgRef.current);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                e.stopPropagation();
                                pushHistory(slidesRef.current, bgRef.current);
                                setEditingTextId(null);
                              }
                            }}
                            placeholder="Type here..."
                            style={{
                              ...sharedTextStyle,
                              height: '100%',
                              margin: 0,
                              border: 'none',
                              outline: 'none',
                              background: 'transparent',
                              resize: 'none',
                              overflow: 'hidden',
                              boxSizing: 'border-box',
                              caretColor: '#ffffff'
                            }}
                          />
                        ) : (
                          <div
                            data-text-measure={el.id}
                            style={{ ...sharedTextStyle, pointerEvents: 'none' }}
                          >
                            {el.text || ''}
                          </div>
                        ))}

                      {el.kind === 'divider' && (
                        <div
                          style={{
                            width: '100%',
                            height: `${Math.max(1, (el.thickness ?? 4) * scale)}px`,
                            backgroundColor: el.color || '#ffffff',
                            borderRadius: '999px',
                            pointerEvents: 'none'
                          }}
                        />
                      )}

                      {el.kind === 'frame' && (
                        <CanvasFrameGraphic
                          frameShape={el.frameShape}
                          imageSrc={el.imageSrc}
                          borderRadius={
                            (el.borderRadius ?? (el.frameShape === 'rounded' ? 32 : 0)) * scale
                          }
                          imageScale={el.imageScale}
                          imageOffsetX={el.imageOffsetX}
                          imageOffsetY={el.imageOffsetY}
                          imageRotation={el.imageRotation}
                          flipX={el.flipX}
                          flipY={el.flipY}
                          isDropTarget={dropTargetFrameId === el.id}
                          isEditingCrop={isEditingThisFrame}
                        />
                      )}

                      {el.kind === 'image' && el.imageSrc && (
                        el.threeD?.enabled ? (
                          <CanvasThreeDObject
                            imageSrc={el.imageSrc}
                            config={el.threeD}
                            flipX={el.flipX}
                            flipY={el.flipY}
                          />
                        ) : (
                          <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
                            <img src={el.imageSrc} alt="" style={getCroppedImageStyle(el)} />
                          </div>
                        )
                      )}

                      {el.kind === 'model3d' && el.modelSrc && (
                        <CanvasThreeDModel
                          modelSrc={el.modelSrc}
                          config={el.threeD}
                          flipX={el.flipX}
                          flipY={el.flipY}
                        />
                      )}

                      {el.kind === 'participantWidget' && (
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            padding: `${Math.max(4, 12 * scale)}px ${Math.max(6, 16 * scale)}px`,
                            boxSizing: 'border-box',
                            pointerEvents: 'none',
                            overflow: 'hidden'
                          }}
                        >
                          <div
                            style={{
                              fontSize: `${Math.max(8, (el.widgetTitleSize ?? 18) * scale)}px`,
                              fontWeight: 700,
                              color: el.widgetTitleColor ?? '#fbbf24',
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em'
                            }}
                          >
                            SPEAKER
                          </div>
                          <div
                            style={{
                              fontSize: `${Math.max(10, (el.widgetNameSize ?? 24) * scale)}px`,
                              fontWeight: 800,
                              color: el.widgetNameColor ?? '#ffffff',
                              lineHeight: 1.15
                            }}
                          >
                            Participant Name
                          </div>
                          <div
                            style={{
                              fontSize: `${Math.max(8, (el.widgetCentroSize ?? 16) * scale)}px`,
                              color: el.widgetCentroColor ?? '#94a3b8'
                            }}
                          >
                            Centro / Location
                          </div>
                        </div>
                      )}
                      </div>

                      {/* Inner Image Crop/Scale/Rotate Controls (when double-clicking a filled Frame) */}
                      {isEditingThisFrame &&
                        (() => {
                          const frameW = Math.max(1, (el.width / 100) * 16);
                          const frameH = Math.max(1, (el.height / 100) * 9);
                          const imgAspect =
                            (el.imageSrc ? frameImageAspectCache.get(el.imageSrc) : undefined) ??
                            frameW / frameH;
                          const { coverWPct, coverHPct } = getFrameCoverDimensions(
                            frameW,
                            frameH,
                            imgAspect
                          );
                          const clamped = clampFrameImageTransform({
                            frameShape: el.frameShape || 'circle',
                            frameW,
                            frameH,
                            imgAspect,
                            scale: el.imageScale ?? 1,
                            offsetX: el.imageOffsetX ?? 0,
                            offsetY: el.imageOffsetY ?? 0,
                            rotation: el.imageRotation ?? 0
                          });
                          return (
                            <div
                              style={{
                                position: 'absolute',
                                inset: 0,
                                transform: `translate(${clamped.offsetX}%, ${clamped.offsetY}%) rotate(${el.imageRotation ?? 0}deg) scale(${clamped.scale})`,
                                transformOrigin: 'center center',
                                pointerEvents: 'none',
                                zIndex: 15
                              }}
                            >
                              <div
                                onPointerDown={(e) => startFrameCropDrag(e, el, 'pan')}
                                style={{
                                  position: 'absolute',
                                  left: '50%',
                                  top: '50%',
                                  width: `${coverWPct}%`,
                                  height: `${coverHPct}%`,
                                  transform: 'translate(-50%, -50%)',
                                  outline: '2px solid #8b5cf6',
                                  cursor: 'grab',
                                  pointerEvents: 'auto'
                                }}
                              >
                                {(
                                  [
                                    { h: 'nw', left: '-6px', top: '-6px', cursor: 'nwse-resize' },
                                    { h: 'ne', right: '-6px', top: '-6px', cursor: 'nesw-resize' },
                                    { h: 'sw', left: '-6px', bottom: '-6px', cursor: 'nesw-resize' },
                                    { h: 'se', right: '-6px', bottom: '-6px', cursor: 'nwse-resize' }
                                  ] as const
                                ).map((corner) => (
                                  <div
                                    key={corner.h}
                                    onPointerDown={(e) => startFrameCropDrag(e, el, 'scale')}
                                    title="Drag to resize inner photo"
                                    style={{
                                      position: 'absolute',
                                      ...('left' in corner ? { left: corner.left } : {}),
                                      ...('right' in corner ? { right: corner.right } : {}),
                                      ...('top' in corner ? { top: corner.top } : {}),
                                      ...('bottom' in corner ? { bottom: corner.bottom } : {}),
                                      width: '12px',
                                      height: '12px',
                                      borderRadius: '999px',
                                      background: '#ffffff',
                                      border: '2px solid #8b5cf6',
                                      boxShadow: '0 1px 4px rgba(0,0,0,0.45)',
                                      cursor: corner.cursor
                                    }}
                                  />
                                ))}
                                <div
                                  style={{
                                    position: 'absolute',
                                    left: '50%',
                                    bottom: '-34px',
                                    transform: 'translateX(-50%)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center'
                                  }}
                                >
                                  <div style={{ width: '1.5px', height: '10px', background: '#8b5cf6' }} />
                                  <div
                                    onPointerDown={(e) => startFrameCropDrag(e, el, 'rotate')}
                                    title="Drag to rotate inner photo"
                                    style={{
                                      width: '24px',
                                      height: '24px',
                                      borderRadius: '999px',
                                      background: rotatingInfo?.elId === el.id ? '#7c3aed' : '#ffffff',
                                      color: rotatingInfo?.elId === el.id ? '#ffffff' : '#0f172a',
                                      border: '1.5px solid #8b5cf6',
                                      boxShadow: '0 2px 8px rgba(0,0,0,0.45)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'grab'
                                    }}
                                  >
                                    <RotateCw size={12} />
                                  </div>
                                  {rotatingInfo?.elId === el.id && (
                                    <div
                                      style={{
                                        position: 'absolute',
                                        top: '38px',
                                        left: '50%',
                                        transform: `translateX(-50%) rotate(${-(el.rotation ?? 0) - (el.imageRotation ?? 0)}deg)`,
                                        padding: '3px 8px',
                                        borderRadius: '999px',
                                        background: '#1e1b4b',
                                        border: '1px solid #8b5cf6',
                                        color: '#ffffff',
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        whiteSpace: 'nowrap',
                                        pointerEvents: 'none'
                                      }}
                                    >
                                      {rotatingInfo.angle}°
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                      {isSelected && selectedElIds.length === 1 && !isEditingThisFrame && (
                        <>
                          {/* Canva-style 4 circular corner resize handles */}
                          {(
                            [
                              { h: 'nw', left: '-6px', top: '-6px', cursor: 'nwse-resize' },
                              { h: 'ne', right: '-6px', top: '-6px', cursor: 'nesw-resize' },
                              { h: 'sw', left: '-6px', bottom: '-6px', cursor: 'nesw-resize' },
                              { h: 'se', right: '-6px', bottom: '-6px', cursor: 'nwse-resize' }
                            ] as const
                          ).map((corner) => (
                            <div
                              key={corner.h}
                              onPointerDown={(e) => startDrag(e, el, 'resize', corner.h)}
                              title="Drag to resize"
                              style={{
                                position: 'absolute',
                                ...('left' in corner ? { left: corner.left } : {}),
                                ...('right' in corner ? { right: corner.right } : {}),
                                ...('top' in corner ? { top: corner.top } : {}),
                                ...('bottom' in corner ? { bottom: corner.bottom } : {}),
                                width: '12px',
                                height: '12px',
                                borderRadius: '999px',
                                background: '#ffffff',
                                border: `2px solid ${isEditingThisText ? '#8b5cf6' : '#38bdf8'}`,
                                boxShadow: '0 1px 4px rgba(0,0,0,0.45)',
                                cursor: corner.cursor,
                                zIndex: 10
                              }}
                            />
                          ))}
                          {/* Canva-style side & top/bottom pill handles: non-destructive trim on images, width adjust on text/unlocked shapes */}
                          {(el.kind === 'image' || !isAspectRatioLocked(el)) &&
                            (
                              [
                                { h: 'w', left: '-4px', top: '50%', transform: 'translateY(-50%)', w: 7, hPx: 22, cursor: 'ew-resize' },
                                { h: 'e', right: '-4px', top: '50%', transform: 'translateY(-50%)', w: 7, hPx: 22, cursor: 'ew-resize' },
                                ...(el.kind === 'image'
                                  ? ([
                                      { h: 'n', top: '-4px', left: '50%', transform: 'translateX(-50%)', w: 22, hPx: 7, cursor: 'ns-resize' },
                                      { h: 's', bottom: '-4px', left: '50%', transform: 'translateX(-50%)', w: 22, hPx: 7, cursor: 'ns-resize' }
                                    ] as const)
                                  : [])
                              ] as const
                            ).map((edge) => (
                              <div
                                key={edge.h}
                                onPointerDown={(e) => startDrag(e, el, 'resize', edge.h)}
                                title={el.kind === 'image' ? 'Drag to trim/crop edge' : 'Drag to adjust width'}
                                style={{
                                  position: 'absolute',
                                  ...('left' in edge ? { left: edge.left } : {}),
                                  ...('right' in edge ? { right: edge.right } : {}),
                                  ...('top' in edge ? { top: edge.top } : {}),
                                  ...('bottom' in edge ? { bottom: edge.bottom } : {}),
                                  transform: edge.transform,
                                  width: `${edge.w}px`,
                                  height: `${edge.hPx}px`,
                                  borderRadius: '999px',
                                  background: '#ffffff',
                                  border: `1.5px solid ${isEditingThisText ? '#8b5cf6' : '#38bdf8'}`,
                                  boxShadow: '0 1px 4px rgba(0,0,0,0.45)',
                                  cursor: edge.cursor,
                                  zIndex: 10
                                }}
                              />
                            ))}
                          {/* Canva-style bottom rotate handle + pop-out angle badge while rotating */}
                          {!isEditingThisText && (
                            <div
                              style={{
                                position: 'absolute',
                                left: '50%',
                                bottom: '-34px',
                                transform: 'translateX(-50%)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                zIndex: 12
                              }}
                            >
                              <div
                                style={{
                                  width: '1.5px',
                                  height: '10px',
                                  background: rotatingInfo?.elId === el.id ? '#8b5cf6' : '#38bdf8'
                                }}
                              />
                              <div
                                onPointerDown={(e) => startRotate(e, el)}
                                title="Drag to rotate (Shift for 15° steps)"
                                style={{
                                  width: '24px',
                                  height: '24px',
                                  borderRadius: '999px',
                                  background: rotatingInfo?.elId === el.id ? '#7c3aed' : '#ffffff',
                                  color: rotatingInfo?.elId === el.id ? '#ffffff' : '#0f172a',
                                  border: `1.5px solid ${rotatingInfo?.elId === el.id ? '#c4b5fd' : '#38bdf8'}`,
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.45)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'grab'
                                }}
                              >
                                <RotateCw size={12} />
                              </div>
                              {rotatingInfo?.elId === el.id && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    top: '38px',
                                    left: '50%',
                                    transform: `translateX(-50%) rotate(${-(el.rotation ?? 0)}deg)`,
                                    padding: '3px 8px',
                                    borderRadius: '999px',
                                    background: '#1e1b4b',
                                    border: '1px solid #8b5cf6',
                                    color: '#ffffff',
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    fontVariantNumeric: 'tabular-nums',
                                    whiteSpace: 'nowrap',
                                    boxShadow: '0 4px 14px rgba(0,0,0,0.55)',
                                    pointerEvents: 'none'
                                  }}
                                >
                                  {rotatingInfo.angle}°
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}

              {selectedElements.length > 1 &&
                (() => {
                  const minX = Math.min(...selectedElements.map((el) => el.x));
                  const minY = Math.min(...selectedElements.map((el) => el.y));
                  const maxX = Math.max(...selectedElements.map((el) => el.x + el.width));
                  const maxY = Math.max(...selectedElements.map((el) => el.y + el.height));
                  return (
                    <div
                      style={{
                        position: 'absolute',
                        left: `${minX}%`,
                        top: `${minY}%`,
                        width: `${maxX - minX}%`,
                        height: `${maxY - minY}%`,
                        border: '1.5px dashed #38bdf8',
                        pointerEvents: 'none',
                        zIndex: 998
                      }}
                    >
                      <div
                        onPointerDown={startGroupResize}
                        title="Drag to resize group"
                        style={{
                          position: 'absolute',
                          right: '-6px',
                          bottom: '-6px',
                          width: '12px',
                          height: '12px',
                          borderRadius: '3px',
                          background: '#38bdf8',
                          border: '1px solid #020617',
                          cursor: 'nwse-resize',
                          pointerEvents: 'auto'
                        }}
                      />
                    </div>
                  );
                })()}

              {studioMode && (
                <>
                  {/* Draggable & Resizable Presentation Frame */}
                  <div
                    onPointerDown={(e) => startStudioBoxDrag(e, 'presentation', 'move')}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedElIds([]);
                      setSelectedStudioBox('presentation');
                    }}
                    style={{
                      position: 'absolute',
                      left: `${presBox.x}%`,
                      top: `${presBox.y}%`,
                      width: `${presBox.width}%`,
                      height: `${presBox.height}%`,
                      borderRadius: `${(presBox.borderRadius ?? 16) * scale}px`,
                      background: 'rgba(15, 23, 42, 0.85)',
                      border:
                        selectedStudioBox === 'presentation'
                          ? '2px solid #8b5cf6'
                          : '1.5px solid rgba(148, 163, 184, 0.55)',
                      boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'move',
                      zIndex: 4,
                      userSelect: 'none'
                    }}
                  >
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#e2e8f0' }}>
                      Presentation Slide
                    </span>
                    <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                      {Math.round(presBox.width)}% × {Math.round(presBox.height)}%
                    </span>
                    {selectedStudioBox === 'presentation' && (
                      <div
                        onPointerDown={(e) => startStudioBoxDrag(e, 'presentation', 'resize')}
                        title="Drag to resize Presentation box (hold Shift for free aspect)"
                        style={{
                          position: 'absolute',
                          right: '-6px',
                          bottom: '-6px',
                          width: '12px',
                          height: '12px',
                          borderRadius: '3px',
                          background: '#8b5cf6',
                          border: '1px solid #fff',
                          cursor: 'nwse-resize'
                        }}
                      />
                    )}
                  </div>

                  {/* Draggable & Resizable Participant Camera Frame */}
                  <div
                    onPointerDown={(e) => startStudioBoxDrag(e, 'participant', 'move')}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedElIds([]);
                      setSelectedStudioBox('participant');
                    }}
                    style={{
                      position: 'absolute',
                      left: `${partBox.x}%`,
                      top: `${partBox.y}%`,
                      width: `${partBox.width}%`,
                      height: `${partBox.height}%`,
                      borderRadius: `${(partBox.borderRadius ?? 16) * scale}px`,
                      background: 'rgba(6, 78, 59, 0.55)',
                      border:
                        selectedStudioBox === 'participant'
                          ? '2px solid #10b981'
                          : '1.5px solid rgba(16, 185, 129, 0.55)',
                      boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'move',
                      zIndex: 5,
                      userSelect: 'none'
                    }}
                  >
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#d1fae5' }}>
                      Speaker / Camera
                    </span>
                    <span style={{ fontSize: '0.68rem', color: '#6ee7b7' }}>
                      {Math.round(partBox.width)}% × {Math.round(partBox.height)}%
                    </span>
                    {selectedStudioBox === 'participant' && (
                      <div
                        onPointerDown={(e) => startStudioBoxDrag(e, 'participant', 'resize')}
                        title="Drag to resize Speaker / Camera box"
                        style={{
                          position: 'absolute',
                          right: '-6px',
                          bottom: '-6px',
                          width: '12px',
                          height: '12px',
                          borderRadius: '3px',
                          background: '#10b981',
                          border: '1px solid #fff',
                          cursor: 'nwse-resize'
                        }}
                      />
                    )}
                  </div>
                </>
              )}

              {marqueeRect && (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: `${marqueeRect.x}%`,
                    top: `${marqueeRect.y}%`,
                    width: `${marqueeRect.width}%`,
                    height: `${marqueeRect.height}%`,
                    border: '1.5px solid #38bdf8',
                    background: 'rgba(56, 189, 248, 0.14)',
                    pointerEvents: 'none',
                    zIndex: 1000
                  }}
                />
              )}
            </div>
          </main>

            {/* Canva-Style Bottom Slide Filmstrip Bar (hidden in Studio mode) */}
            {!studioMode && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                height: '68px',
                flexShrink: 0,
                background: '#0f172a',
                borderTop: '1px solid var(--border-subtle)',
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                overflowX: 'auto'
              }}
            >
              {slides.map((s, idx) => {
                const isActive = idx === activeSlideIdx;
                const isDragging = draggedSlideIdx === idx;
                const isDragOver = dragOverSlideIdx === idx && draggedSlideIdx !== null && draggedSlideIdx !== idx;
                return (
                  <div
                    key={s.id}
                    draggable
                    onDragStart={(e) => {
                      if (document.activeElement?.tagName === 'INPUT') {
                        e.preventDefault();
                        return;
                      }
                      setDraggedSlideIdx(idx);
                      setDragOverSlideIdx(null);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(idx));
                    }}
                    onDragOver={(e) => {
                      if (draggedSlideIdx === null) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverSlideIdx !== idx) {
                        setDragOverSlideIdx(idx);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverSlideIdx === idx) {
                        setDragOverSlideIdx(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromIdx = draggedSlideIdx;
                      setDraggedSlideIdx(null);
                      setDragOverSlideIdx(null);
                      if (fromIdx === null || fromIdx === idx) return;
                      const activeSlideId = slides[activeSlideIdx]?.id;
                      const nextSlides = [...slides];
                      const [moved] = nextSlides.splice(fromIdx, 1);
                      nextSlides.splice(idx, 0, moved);
                      setSlides(nextSlides);
                      pushHistory(nextSlides, bgRef.current);
                      if (activeSlideId) {
                        const nextActiveIdx = nextSlides.findIndex((sl) => sl.id === activeSlideId);
                        if (nextActiveIdx >= 0) setActiveSlideIdx(nextActiveIdx);
                      }
                    }}
                    onDragEnd={() => {
                      setDraggedSlideIdx(null);
                      setDragOverSlideIdx(null);
                    }}
                    onClick={() => {
                      if (activeSlideIdx !== idx) {
                        setActiveSlideIdx(idx);
                        const els = s.canvasElements ?? [];
                        const firstId = els[0]?.id ?? null;
                        setSelectedElIds(firstId ? expandWithGroupIds([firstId], els) : []);
                      }
                    }}
                    title="Drag to reorder slide"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 10px',
                      borderRadius: '9px',
                      border: '2px solid',
                      borderColor: isDragOver
                        ? '#38bdf8'
                        : isActive
                          ? '#8b5cf6'
                          : 'var(--border-subtle)',
                      boxShadow: isDragOver
                        ? draggedSlideIdx !== null && draggedSlideIdx < idx
                          ? 'inset -3px 0 0 #38bdf8'
                          : 'inset 3px 0 0 #38bdf8'
                        : undefined,
                      background: isActive ? 'rgba(124, 58, 237, 0.2)' : 'var(--bg-panel-elevated)',
                      minWidth: '148px',
                      maxWidth: '190px',
                      flexShrink: 0,
                      opacity: isDragging ? 0.45 : 1,
                      cursor: isDragging ? 'grabbing' : 'grab',
                      transition: 'border-color 120ms ease, opacity 120ms ease'
                    }}
                  >
                    <GripVertical
                      size={12}
                      style={{ color: 'var(--text-secondary)', opacity: 0.65, flexShrink: 0 }}
                    />
                    <span
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '5px',
                        background: isActive ? '#7c3aed' : 'rgba(255,255,255,0.08)',
                        color: '#fff',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={s.label ?? ''}
                      placeholder={`Slide ${idx + 1}`}
                      onFocus={() => {
                        if (activeSlideIdx !== idx) {
                          setActiveSlideIdx(idx);
                          const els = s.canvasElements ?? [];
                          const firstId = els[0]?.id ?? null;
                          setSelectedElIds(firstId ? expandWithGroupIds([firstId], els) : []);
                        }
                      }}
                      onChange={(e) => {
                        const nextLabel = e.target.value;
                        setSlides((prev) =>
                          prev.map((slide, sIdx) =>
                            sIdx === idx ? { ...slide, label: nextLabel } : slide
                          )
                        );
                      }}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        background: 'transparent',
                        border: 'none',
                        padding: '1px 2px',
                        color: 'var(--text-primary)',
                        fontSize: '0.76rem',
                        fontWeight: isActive ? 700 : 500,
                        outline: 'none'
                      }}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const clone: SlideBlock = {
                          ...s,
                          id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                          label: `${s.label || `Slide ${idx + 1}`} (Copy)`,
                          lines: [...s.lines],
                          canvasElements: (s.canvasElements ?? []).map((el, elIdx) => ({
                            ...el,
                            id: `el-${Date.now()}-${elIdx}-${Math.random().toString(36).slice(2, 5)}`
                          }))
                        };
                        const nextSlides = [...slides];
                        nextSlides.splice(idx + 1, 0, clone);
                        setSlides(nextSlides);
                        setActiveSlideIdx(idx + 1);
                        const cloneEls = clone.canvasElements ?? [];
                        const firstId = cloneEls[0]?.id ?? null;
                        setSelectedElIds(firstId ? expandWithGroupIds([firstId], cloneEls) : []);
                      }}
                      style={{ background: 'transparent', border: 'none', padding: '2px', color: 'var(--text-secondary)', opacity: 0.8, cursor: 'pointer' }}
                      title="Duplicate slide"
                    >
                      <Copy size={12} />
                    </button>
                    {slides.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextSlides = slides.filter((_, i) => i !== idx);
                          setSlides(nextSlides);
                          setActiveSlideIdx(Math.max(0, Math.min(activeSlideIdx, nextSlides.length - 1)));
                        }}
                        style={{ background: 'transparent', border: 'none', padding: '2px', color: '#fca5a5', opacity: 0.8, cursor: 'pointer' }}
                        title={t.editor.delete}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  const prevBg = slides[slides.length - 1]?.background || activeSlideBg;
                  const next = createBlankSlideBlock(slides.length, prevBg);
                  const nextSlides = [...slides, next];
                  setSlides(nextSlides);
                  setActiveSlideIdx(slides.length);
                  setSelectedElIds([]);
                  setEditingTextId(null);
                  pushHistory(nextSlides, bgRef.current);
                }}
                style={{
                  padding: '8px 14px',
                  borderRadius: '9px',
                  border: '1px dashed rgba(139, 92, 246, 0.55)',
                  background: 'rgba(124, 58, 237, 0.12)',
                  color: '#ddd6fe',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  flexShrink: 0,
                  cursor: 'pointer'
                }}
              >
                <Plus size={14} /> Add Slide
              </button>
            </div>
            )}
          </div>
        </div>
      </form>
    </dialog>
    </>
  );
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-secondary)'
};

const fieldLabelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  fontSize: '0.74rem',
  color: 'var(--text-secondary)',
  fontWeight: 600
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: '7px',
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-app)',
  color: 'var(--text-primary)',
  fontSize: '0.82rem',
  fontFamily: 'inherit'
};

const btnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '5px',
  padding: '6px 10px',
  borderRadius: '7px',
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-panel-elevated)',
  fontSize: '0.78rem',
  fontWeight: 600
};
