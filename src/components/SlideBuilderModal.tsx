import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../utils/cn';
import { buildTextEffectsCss, applyListPrefix, buildShimmerStarsStyle } from '../utils/textEffects';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Copy,
  CopyPlus,
  Download,
  FlipHorizontal2,
  FlipVertical2,
  GripVertical,
  Image as ImageIcon,
  Italic,
  Layers,
  LayoutTemplate,
  List,
  ListOrdered,
  Lock,
  Minus,
  MoreHorizontal,
  Palette,
  Plus,
  Redo2,
  RefreshCw,
  RotateCw,
  Send,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Type,
  Underline,
  Undo2,
  Unlock,
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
import { extractPrimaryFontFamily, FONT_CATALOG } from '../fonts';
import { ensureFontLoaded } from '../utils/fontLoader';
import {
  CANVAS_ANIMATION_PRESETS,
  getElementAnimationStyle,
  getSmokeVector,
  isLoopAnimation
} from '../utils/canvasAnimations';
import { saveUserMediaFile } from '../utils/mediaUpload';
import { buildColoredSvgDataUrl } from './AssetBrowserModal';
import { BackgroundImagePicker } from './BackgroundImagePicker';
import { CanvasColorDrawer } from './CanvasColorDrawer';
import { CanvasElementsDrawer } from './CanvasElementsDrawer';
import { CanvasFontDrawer } from './CanvasFontDrawer';
import {
  CanvasFrameGraphic,
  clampFrameImageTransform,
  frameImageAspectCache,
  getCroppedImageStyle,
  getFrameCoverDimensions
} from './CanvasFrameGraphic';
import {
  CanvasLineGraphic,
  computeLineBounds,
  getCurveInsertMidpoints,
  getElbowMidHandlePct,
  getLineCurvePoints,
  getLineEndpoints,
  getLinePresetConfig,
  isResponsiveLineShape,
  LINE_CAP_OPTIONS,
  STAGE_VIRTUAL_H,
  STAGE_VIRTUAL_W
} from './CanvasLineGraphic';
import {
  CanvasShapeGraphic,
  getShapeDefaultAspect,
  SHAPE_OPTIONS
} from './CanvasShapeGraphic';
import { CanvasThreeDModel } from './CanvasThreeDModel';
import { CanvasThreeDObject, DEFAULT_THREE_D_CONFIG } from './CanvasThreeDObject';
import {
  createTemplateId,
  downloadTemplateAssetsAndRewrite,
  fetchApprovedTemplates,
  generateSlideThumbnailDataUrl,
  resolveTemplateAssetUrl,
  submitCommunityTemplate,
  uploadSlideAssetsAndRewrite,
  uploadTemplateAsset,
  type CommunityTemplate,
  type TemplateCategory
} from '../utils/templateService';
import { restoreBundledMediaOnImport } from '../utils/mediaUpload';

interface SlideBuilderModalProps {
  open: boolean;
  initialItem: ProgramItem | null;
  signalingRelayUrl?: string;
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
  if (el.kind === 'shape') return false;
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
  signalingRelayUrl,
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
  const [copiedClipboard, setCopiedClipboard] = useState<{
    items: CanvasElement[];
    sourceSlideIdx: number;
  } | null>(null);
  const [snapGuide, setSnapGuide] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null
  });
  const [stageHeight, setStageHeight] = useState(400);
  const [justSaved, setJustSaved] = useState(false);
  const [resizingElId, setResizingElId] = useState<string | null>(null);
  const [hoveredElId, setHoveredElId] = useState<string | null>(null);
  const suppressNextMainClickRef = useRef(false);
  const [quickMenuElId, setQuickMenuElId] = useState<string | null>(null);
  const [quickSubmenu, setQuickSubmenu] = useState<'layer' | 'align' | null>(null);
  const [quickMenuAnchor, setQuickMenuAnchor] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);
  const [lastShapeColor, setLastShapeColor] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('uecfi_last_shape_color_v1');
      if (saved && /^#[0-9a-fA-F]{6}$/.test(saved)) return saved;
    } catch {
      // Ignore
    }
    return '#e2e8f0';
  });
  const [designFeedback, setDesignFeedback] = useState<string | null>(null);
  const designImportRef = useRef<HTMLInputElement | null>(null);
  const designFeedbackTimerRef = useRef<number | null>(null);
  // Incremented to replay entrance animations live inside the Canvas preview
  const [animReplayNonce, setAnimReplayNonce] = useState(0);
  // Canva-style far-left rail active tab (null = collapsed drawer for maximum canvas space)
  const [activeRailTab, setActiveRailTab] = useState<
    | 'templates'
    | 'elements'
    | 'text'
    | 'uploads'
    | 'background'
    | 'layers'
    | 'color'
    | 'effects'
    | 'fonts'
    | 'animate'
    | null
  >(null);
  const [communityTemplates, setCommunityTemplates] = useState<CommunityTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<'All' | TemplateCategory>('All');
  const [submitFormOpen, setSubmitFormOpen] = useState(false);
  const [submitTitle, setSubmitTitle] = useState('');
  const [submitCategory, setSubmitCategory] = useState<TemplateCategory | ''>('');
  const [submitAuthorName, setSubmitAuthorName] = useState(() => {
    try {
      return localStorage.getItem('uecfi_template_author_name') || '';
    } catch {
      return '';
    }
  });
  const [submitAuthorCentro, setSubmitAuthorCentro] = useState(() => {
    try {
      return localStorage.getItem('uecfi_template_author_centro') || '';
    } catch {
      return '';
    }
  });
  const [submitBusy, setSubmitBusy] = useState(false);
  const [capturingThumbnail, setCapturingThumbnail] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const loadCommunityTemplates = async () => {
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const res = await fetchApprovedTemplates(signalingRelayUrl);
      setCommunityTemplates(res.templates);
    } catch (err) {
      setTemplatesError(err instanceof Error ? err.message : 'Unable to load templates');
    } finally {
      setTemplatesLoading(false);
    }
  };

  useEffect(() => {
    if (open && activeRailTab === 'templates') {
      void loadCommunityTemplates();
    }
  }, [open, activeRailTab, signalingRelayUrl]);
  const [colorTarget, setColorTarget] = useState<
    | { kind: 'textColor'; label: string }
    | { kind: 'shapeFill'; label: string }
    | { kind: 'outlineColor'; label: string }
    | { kind: 'glowColor'; label: string }
    | { kind: 'shadowColor'; label: string }
    | { kind: 'background'; label: string }
    | null
  >(null);
  const openColorDrawer = (target: NonNullable<typeof colorTarget>) => {
    setColorTarget(target);
    setActiveRailTab('color');
  };
  // Floating popover open beneath the contextual top formatting toolbar
  const [activePopover, setActivePopover] = useState<
    | 'font'
    | 'effects'
    | 'animate'
    | 'shape'
    | '3d'
    | 'lineStyle'
    | 'lineStartCap'
    | 'lineEndCap'
    | 'lineType'
    | 'transparency'
    | null
  >(null);
  const [backgroundSelected, setBackgroundSelected] = useState(false);
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
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveDeck();
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        if (!editingTextId) {
          e.preventDefault();
          setSelectedElIds(elements.map((el) => el.id));
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
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
        if (selectedElements.length > 0) {
          e.preventDefault();
          handleCopySelection();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
        if (copiedClipboard && copiedClipboard.items.length > 0) {
          e.preventDefault();
          handlePasteCopied();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        if (selectedElements.length > 0 && !editingTextId && !editingFrameId) {
          e.preventDefault();
          handleDuplicateSelection();
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
    if (open) {
      setActiveRailTab(null);
      setColorTarget(null);
      setBackgroundSelected(false);
    }
  }, [open]);

  useEffect(() => {
    setActivePopover(null);
    if (selectedElIds.length > 0) setBackgroundSelected(false);
  }, [selectedElIds]);

  const activeSlide = slides[activeSlideIdx] ?? slides[0];
  const activeSlideBg = activeSlide?.background || themeBackground;
  const elements = activeSlide?.canvasElements ?? [];

  // Ensure any Google Fonts used on the active slide (or Text drawer effect previews) are loaded
  useEffect(() => {
    for (const el of elements) {
      if (el.kind === 'text' && el.fontFamily) {
        const family = extractPrimaryFontFamily(el.fontFamily);
        const entry = FONT_CATALOG.find((f) => f.family === family);
        if (entry?.googleSpec) {
          void ensureFontLoaded(entry.family, entry.googleSpec);
        }
      }
    }
    if (activeRailTab === 'text') {
      for (const fam of ['Fredoka', 'Archivo']) {
        const entry = FONT_CATALOG.find((f) => f.family === fam);
        if (entry?.googleSpec) {
          void ensureFontLoaded(entry.family, entry.googleSpec);
        }
      }
    }
  }, [elements, activeRailTab]);

  // Dynamically adapt the open Color drawer target when the user selects a different item or the background
  useEffect(() => {
    if (activeRailTab !== 'color') return;
    const sel = elements.find((el) => el.id === selectedElIds[0]) ?? null;
    if (sel) {
      if (sel.kind === 'text') {
        setColorTarget((prev) =>
          prev &&
          (prev.kind === 'textColor' ||
            prev.kind === 'outlineColor' ||
            prev.kind === 'glowColor' ||
            prev.kind === 'shadowColor')
            ? prev
            : { kind: 'textColor', label: 'Text color' }
        );
      } else if (sel.kind === 'shape' || sel.kind === 'divider' || sel.kind === 'line') {
        setColorTarget({ kind: 'shapeFill', label: sel.kind === 'line' ? 'Line color' : 'Shape color' });
      }
    } else if (backgroundSelected) {
      setColorTarget({ kind: 'background', label: 'Background color' });
    }
  }, [activeRailTab, selectedElIds, elements, backgroundSelected]);

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
    selectedEl?.textTransform,
    selectedEl?.listStyle,
    selectedEl?.textPosition,
    selectedEl?.textEffect,
    selectedEl?.outlineWidth,
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

  const setElementLayerExtreme = (elId: string, position: 'front' | 'back') => {
    updateActiveElements((prev) => {
      const sorted = [...prev].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex((item) => item.id === elId);
      if (idx < 0) return prev;
      const [moved] = sorted.splice(idx, 1);
      if (position === 'front') sorted.push(moved);
      else sorted.unshift(moved);
      return sorted.map((item, i) => ({ ...item, zIndex: i + 1 }));
    });
  };

  const handleDuplicateElement = (el: CanvasElement) => {
    const dup: CanvasElement = {
      ...JSON.parse(JSON.stringify(el)),
      id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      locked: false,
      x: Math.min(85, Number((el.x + 3).toFixed(2))),
      y: Math.min(85, Number((el.y + 3).toFixed(2))),
      zIndex: elements.length + 1
    };
    updateActiveElements((prev) => [...prev, dup]);
    setSelectedElIds([dup.id]);
    setQuickMenuElId(null);
    setQuickSubmenu(null);
  };

  const handleDuplicateSelection = () => {
    if (selectedElements.length === 0) return;
    if (selectedElements.length === 1) {
      handleDuplicateElement(selectedElements[0]);
      return;
    }
    const firstGroupId = selectedElements[0]?.groupId;
    const isSingleGroup =
      Boolean(firstGroupId) &&
      selectedElements.every((item) => item.groupId === firstGroupId);
    const nextGroupId = isSingleGroup
      ? `grp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
      : undefined;
    const clones: CanvasElement[] = selectedElements.map((item, idx) => ({
      ...JSON.parse(JSON.stringify(item)),
      id: `el-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      groupId: nextGroupId,
      locked: false,
      x: Math.min(85, Number((item.x + 3).toFixed(2))),
      y: Math.min(85, Number((item.y + 3).toFixed(2))),
      zIndex: elements.length + idx + 1
    }));
    updateActiveElements((prev) => [...prev, ...clones]);
    setSelectedElIds(clones.map((c) => c.id));
    setQuickMenuElId(null);
    setQuickSubmenu(null);
  };

  const handleCopySelection = () => {
    if (selectedElements.length === 0) return;
    const ordered = [...selectedElements].sort((a, b) => a.zIndex - b.zIndex);
    setCopiedClipboard({
      items: JSON.parse(JSON.stringify(ordered)) as CanvasElement[],
      sourceSlideIdx: activeSlideIdx
    });
    setQuickMenuElId(null);
    setQuickSubmenu(null);
  };

  const handlePasteCopied = () => {
    if (!copiedClipboard || copiedClipboard.items.length === 0) return;
    const ordered = [...copiedClipboard.items].sort((a, b) => a.zIndex - b.zIndex);
    const sameSlide = copiedClipboard.sourceSlideIdx === activeSlideIdx;
    const maxX = Math.max(...ordered.map((item) => item.x + item.width));
    const maxY = Math.max(...ordered.map((item) => item.y + item.height));
    const dx = sameSlide ? (maxX + 3 <= 100 ? 3 : 0) : 0;
    const dy = sameSlide ? (maxY + 3 <= 100 ? 3 : 0) : 0;
    const baseZ = elements.reduce((m, item) => Math.max(m, item.zIndex), 0);
    const groupMap = new Map<string, string>();
    const stamp = Date.now();
    const pasted: CanvasElement[] = ordered.map((item, idx) => {
      let nextGroupId: string | undefined;
      if (item.groupId) {
        nextGroupId =
          groupMap.get(item.groupId) ??
          `grp-${stamp}-${Math.random().toString(36).slice(2, 5)}`;
        groupMap.set(item.groupId, nextGroupId);
      }
      return {
        ...JSON.parse(JSON.stringify(item)),
        id: `el-${stamp}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
        groupId: nextGroupId,
        locked: false,
        x: Number((item.x + dx).toFixed(2)),
        y: Number((item.y + dy).toFixed(2)),
        ...(item.kind === 'line'
          ? {
              lineX1: typeof item.lineX1 === 'number' ? Number((item.lineX1 + dx).toFixed(2)) : undefined,
              lineY1: typeof item.lineY1 === 'number' ? Number((item.lineY1 + dy).toFixed(2)) : undefined,
              lineX2: typeof item.lineX2 === 'number' ? Number((item.lineX2 + dx).toFixed(2)) : undefined,
              lineY2: typeof item.lineY2 === 'number' ? Number((item.lineY2 + dy).toFixed(2)) : undefined,
              lineCx: typeof item.lineCx === 'number' ? Number((item.lineCx + dx).toFixed(2)) : undefined,
              lineCy: typeof item.lineCy === 'number' ? Number((item.lineCy + dy).toFixed(2)) : undefined,
              linePoints: item.linePoints?.map((pt) => ({
                x: Number((pt.x + dx).toFixed(2)),
                y: Number((pt.y + dy).toFixed(2))
              }))
            }
          : {}),
        zIndex: baseZ + idx + 1
      };
    });
    updateActiveElements((prev) => [...prev, ...pasted]);
    setSelectedElIds(pasted.map((p) => p.id));
    setQuickMenuElId(null);
    setQuickSubmenu(null);
  };

  const handleAlignElementToPage = (
    el: CanvasElement,
    edge: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
  ) => {
    const patch: Partial<CanvasElement> =
      edge === 'left'
        ? { x: 0 }
        : edge === 'center'
          ? { x: Number(((100 - el.width) / 2).toFixed(2)) }
          : edge === 'right'
            ? { x: Number((100 - el.width).toFixed(2)) }
            : edge === 'top'
              ? { y: 0 }
              : edge === 'middle'
                ? { y: Number(((100 - el.height) / 2).toFixed(2)) }
                : { y: Number((100 - el.height).toFixed(2)) };
    updateActiveElements((prev) =>
      prev.map((item) => (item.id === el.id ? { ...item, ...patch } : item))
    );
    setQuickMenuElId(null);
    setQuickSubmenu(null);
  };

  const handleAddText = (
    preset: 'heading' | 'subheading' | 'body' = 'heading',
    overrides?: {
      text?: string;
      color?: string;
      textEffect?: CanvasElement['textEffect'];
      fontFamily?: string;
      fontWeight?: CanvasElement['fontWeight'];
      fontStyle?: CanvasElement['fontStyle'];
      textTransform?: CanvasElement['textTransform'];
      letterSpacing?: number;
      animation?: CanvasElement['animation'];
      animationDuration?: number;
      animationUnit?: CanvasElement['animationUnit'];
      enterEdit?: boolean;
    }
  ) => {
    const config =
      preset === 'heading'
        ? { text: 'Add a heading', fontSize: 84, fontWeight: '800' as const, height: 18 }
        : preset === 'subheading'
          ? { text: 'Add a subheading', fontSize: 52, fontWeight: '600' as const, height: 14 }
          : { text: 'Add a little bit of body text', fontSize: 34, fontWeight: '400' as const, height: 12 };

    const text = overrides?.text ?? config.text;
    const fontSize = config.fontSize;
    const fontWeight = overrides?.fontWeight ?? config.fontWeight;
    const fontStyle = overrides?.fontStyle ?? 'normal';
    const fontFamily = overrides?.fontFamily ?? 'Inter, system-ui, sans-serif';
    const textTransform = overrides?.textTransform;
    const letterSpacing = overrides?.letterSpacing;
    const textEffect = overrides?.textEffect;

    // Measure rendered text width in 1920x1080 virtual stage coordinates so the box fits tightly without wrapping.
    let width = 70;
    if (typeof document !== 'undefined' && document.body) {
      const probe = document.createElement('div');
      probe.style.position = 'fixed';
      probe.style.left = '-99999px';
      probe.style.top = '-99999px';
      probe.style.visibility = 'hidden';
      probe.style.pointerEvents = 'none';
      probe.style.display = 'inline-block';
      probe.style.width = 'max-content';
      probe.style.whiteSpace = 'pre';
      probe.style.boxSizing = 'border-box';
      probe.style.padding = '12px';
      probe.style.fontFamily = fontFamily;
      probe.style.fontSize = `${fontSize}px`;
      probe.style.fontWeight = fontWeight;
      probe.style.fontStyle = fontStyle;
      if (textTransform === 'uppercase') probe.style.textTransform = 'uppercase';
      if (typeof letterSpacing === 'number') probe.style.letterSpacing = `${letterSpacing}em`;

      if (
        textEffect === 'voltage' ||
        textEffect === 'rainbowRipple' ||
        textEffect === 'rainbow' ||
        overrides?.animation === 'squishy' ||
        overrides?.animation === 'ripple' ||
        overrides?.animation === 'powerOn'
      ) {
        const lines = text.split('\n');
        lines.forEach((line, lineIdx) => {
          if (lineIdx > 0) probe.appendChild(document.createElement('br'));
          for (const ch of Array.from(line)) {
            const span = document.createElement('span');
            span.style.display = 'inline-block';
            if (textEffect === 'voltage') span.style.webkitTextStrokeWidth = '2px';
            span.textContent = ch === ' ' ? '\u00A0' : ch;
            probe.appendChild(span);
          }
        });
      } else {
        probe.textContent = text;
      }

      document.body.appendChild(probe);
      const measuredPx = probe.getBoundingClientRect().width;
      document.body.removeChild(probe);

      // Add extra room for shimmer particles (.uecfi-shimmer-stars uses inset: -8% -4%) or voltage glow + small safety buffer.
      const particlePadding =
        textEffect === 'shimmer'
          ? Math.max(36, measuredPx * 0.1)
          : textEffect === 'voltage'
            ? 12
            : 0;
      const totalPx = measuredPx + 12 + particlePadding;
      width = Math.min(90, Math.max(8, Number(((totalPx / 1920) * 100).toFixed(2))));
    }
    const x = Number(((100 - width) / 2).toFixed(2));

    const newEl: CanvasElement = {
      id: `el-${Date.now()}`,
      kind: 'text',
      x,
      y: 38,
      width,
      height: config.height,
      zIndex: elements.length + 1,
      text,
      fontSize,
      fontWeight,
      ...(overrides?.fontFamily ? { fontFamily: overrides.fontFamily } : {}),
      ...(overrides?.fontStyle ? { fontStyle: overrides.fontStyle } : {}),
      ...(overrides?.textTransform ? { textTransform: overrides.textTransform } : {}),
      ...(typeof overrides?.letterSpacing === 'number'
        ? { letterSpacing: overrides.letterSpacing }
        : {}),
      color: overrides?.color ?? '#ffffff',
      textAlign: 'center',
      ...(overrides?.textEffect ? { textEffect: overrides.textEffect } : {}),
      ...(overrides?.animation ? { animation: overrides.animation } : {}),
      ...(typeof overrides?.animationDuration === 'number'
        ? { animationDuration: overrides.animationDuration }
        : {}),
      ...(overrides?.animationUnit ? { animationUnit: overrides.animationUnit } : {})
    };
    updateActiveElements((prev) => [...prev, newEl]);
    setSelectedElId(newEl.id);
    setEditingTextId(overrides?.enterEdit === false ? null : newEl.id);
  };

  const handleAddAmazingInteriorsPreset = () => {
    const now = Date.now();
    const groupId = `grp-${now}`;
    const fontFamily = "'Barlow Condensed', Impact, Arial, sans-serif";
    const fontSize = 110;
    const measureBoxWidth = (word: string): number => {
      if (typeof document === 'undefined' || !document.body) return 45;
      const probe = document.createElement('div');
      probe.style.position = 'fixed';
      probe.style.left = '-99999px';
      probe.style.top = '-99999px';
      probe.style.visibility = 'hidden';
      probe.style.display = 'inline-block';
      probe.style.width = 'max-content';
      probe.style.whiteSpace = 'pre';
      probe.style.boxSizing = 'border-box';
      probe.style.padding = '12px';
      probe.style.fontFamily = fontFamily;
      probe.style.fontSize = `${fontSize}px`;
      probe.style.fontWeight = '600';
      probe.style.textTransform = 'uppercase';
      probe.textContent = word;
      document.body.appendChild(probe);
      const measuredPx = probe.getBoundingClientRect().width + 18;
      document.body.removeChild(probe);
      return Math.min(90, Math.max(8, Number(((measuredPx / 1920) * 100).toFixed(2))));
    };
    const w1 = measureBoxWidth('AMAZING');
    const w2 = measureBoxWidth('INTERIORS');
    const el1: CanvasElement = {
      id: `el-${now}-1`,
      kind: 'text',
      groupId,
      x: Number(((100 - w1) / 2).toFixed(2)),
      y: 30,
      width: w1,
      height: 15,
      zIndex: elements.length + 1,
      text: 'AMAZING',
      fontSize,
      fontWeight: '600',
      fontFamily,
      textTransform: 'uppercase',
      lineHeight: 0.85,
      color: '#00ffff',
      textAlign: 'center',
      textEffect: 'amazingPop'
    };
    const el2: CanvasElement = {
      id: `el-${now}-2`,
      kind: 'text',
      groupId,
      x: Number(((100 - w2) / 2).toFixed(2)),
      y: 44,
      width: w2,
      height: 15,
      zIndex: elements.length + 2,
      text: 'INTERIORS',
      fontSize,
      fontWeight: '600',
      fontFamily,
      textTransform: 'uppercase',
      lineHeight: 0.85,
      color: '#ff69b4',
      textAlign: 'center',
      textEffect: 'amazingPop'
    };
    updateActiveElements((prev) => [...prev, el1, el2]);
    setSelectedElIds([el1.id, el2.id]);
    setEditingTextId(null);
  };

  const handleAddShape = (shapeType: ShapeVariant = 'rectangle') => {
    if (isResponsiveLineShape(shapeType)) {
      const preset = getLinePresetConfig(shapeType);
      const x1 = 27;
      const y1 = 50;
      const x2 = 73;
      const y2 = 50;
      const bounds = computeLineBounds(x1, y1, x2, y2);
      const newEl: CanvasElement = {
        id: `el-${Date.now()}`,
        kind: 'line',
        shapeType,
        ...bounds,
        lineType: 'straight',
        lineDash: preset.lineDash,
        lineRoundedCaps: preset.lineRoundedCaps,
        lineStrokeWidth: 4,
        lineStartCap: preset.lineStartCap,
        lineEndCap: preset.lineEndCap,
        lineX1: x1,
        lineY1: y1,
        lineX2: x2,
        lineY2: y2,
        zIndex: elements.length + 1,
        color: lastShapeColor,
        backgroundColor: lastShapeColor,
        opacity: 1
      };
      updateActiveElements((prev) => [...prev, newEl]);
      setSelectedElId(newEl.id);
      setEditingTextId(null);
      return;
    }
    const isLine = shapeType.startsWith('line');
    const aspect = getShapeDefaultAspect(shapeType);
    const height = isLine ? 4 : aspect > 1 ? 26 : aspect < 1 ? 38 : 36;
    // On a 16:9 stage, width% = height% * pixelAspect * (9 / 16) yields exact pixel aspect.
    const width = isLine ? 46 : Number((height * aspect * (9 / 16)).toFixed(2));
    const newEl: CanvasElement = {
      id: `el-${Date.now()}`,
      kind: 'shape',
      shapeType,
      x: Number(((100 - width) / 2).toFixed(2)),
      y: Number(((100 - height) / 2).toFixed(2)),
      width,
      height,
      zIndex: elements.length + 1,
      backgroundColor: lastShapeColor,
      borderRadius: shapeType === 'roundedRect' ? 30 : 0,
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
    setQuickMenuElId(null);
    setQuickSubmenu(null);
    if (el.locked) return;

    const rect = stage.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const origMap = new Map<
      string,
      {
        x: number;
        y: number;
        width: number;
        height: number;
        lineX1?: number;
        lineY1?: number;
        lineX2?: number;
        lineY2?: number;
        lineCx?: number;
        lineCy?: number;
        linePoints?: Array<{ x: number; y: number }>;
      }
    >();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const item of elements) {
      if (activeIds.includes(item.id)) {
        origMap.set(item.id, {
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          lineX1: item.lineX1,
          lineY1: item.lineY1,
          lineX2: item.lineX2,
          lineY2: item.lineY2,
          lineCx: item.lineCx,
          lineCy: item.lineCy,
          linePoints: item.linePoints?.map((pt) => ({ ...pt }))
        });
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
    if (mode === 'resize') setResizingElId(el.id);

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
                y: Number((orig.y + clampedDy).toFixed(2)),
                ...(item.kind === 'line'
                  ? {
                      lineX1: typeof orig.lineX1 === 'number' ? Number((orig.lineX1 + clampedDx).toFixed(2)) : undefined,
                      lineY1: typeof orig.lineY1 === 'number' ? Number((orig.lineY1 + clampedDy).toFixed(2)) : undefined,
                      lineX2: typeof orig.lineX2 === 'number' ? Number((orig.lineX2 + clampedDx).toFixed(2)) : undefined,
                      lineY2: typeof orig.lineY2 === 'number' ? Number((orig.lineY2 + clampedDy).toFixed(2)) : undefined,
                      lineCx: typeof orig.lineCx === 'number' ? Number((orig.lineCx + clampedDx).toFixed(2)) : undefined,
                      lineCy: typeof orig.lineCy === 'number' ? Number((orig.lineCy + clampedDy).toFixed(2)) : undefined,
                      linePoints: orig.linePoints?.map((pt) => ({
                        x: Number((pt.x + clampedDx).toFixed(2)),
                        y: Number((pt.y + clampedDy).toFixed(2))
                      }))
                    }
                  : {})
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
          const minW = el.kind === 'shape' ? 2 : 8;
          const minH = el.kind === 'shape' ? 1 : 6;
          if (affectsRight) {
            nextW = Math.max(minW, Math.min(100, origW + dxPct));
          } else if (affectsLeft) {
            nextW = Math.max(minW, Math.min(100, origW - dxPct));
            nextX = origX + (origW - nextW);
          }
          if (affectsBottom) {
            nextH = Math.max(minH, Math.min(100, origH + dyPct));
          } else if (affectsTop) {
            nextH = Math.max(minH, Math.min(100, origH - dyPct));
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
      setResizingElId(null);
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
   * Interactive endpoint / curve / elbow handle drag for responsive line elements.
   * Shift-dragging an endpoint snaps to 45° increments.
   */
  const startLineHandleDrag = (
    e: React.PointerEvent,
    el: CanvasElement,
    handle: 'start' | 'end' | 'control',
    controlIndex = 0,
    insertNewPoint?: { insertIndex: number; x: number; y: number }
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (el.locked) return;
    const stage = stageRef.current;
    if (!stage) return;

    const rect = stage.getBoundingClientRect();
    const { x1, y1, x2, y2, cx, cy, lineType } = getLineEndpoints(el);
    const hasCustomControl =
      typeof el.lineCx === 'number' ||
      typeof el.lineCy === 'number' ||
      Boolean(el.linePoints && el.linePoints.length > 0);
    const baseCurvePts = getLineCurvePoints(el).map((pt) => ({ ...pt }));
    if (insertNewPoint) {
      baseCurvePts.splice(insertNewPoint.insertIndex, 0, {
        x: insertNewPoint.x,
        y: insertNewPoint.y
      });
      const initBounds = computeLineBounds(x1, y1, x2, y2, undefined, undefined, baseCurvePts);
      updateActiveElements(
        (prev) =>
          prev.map((item) =>
            item.id === el.id
              ? {
                  ...item,
                  ...initBounds,
                  linePoints: baseCurvePts,
                  lineCx: baseCurvePts[0]?.x,
                  lineCy: baseCurvePts[0]?.y
                }
              : item
          ),
        false
      );
    }
    const targetCurveIdx = insertNewPoint ? insertNewPoint.insertIndex : controlIndex;
    activeDragKindRef.current = 'move';

    const onMove = (ev: PointerEvent) => {
      let px = Number((((ev.clientX - rect.left) / rect.width) * 100).toFixed(2));
      let py = Number((((ev.clientY - rect.top) / rect.height) * 100).toFixed(2));
      px = Math.max(-10, Math.min(110, px));
      py = Math.max(-10, Math.min(110, py));

      if ((handle === 'start' || handle === 'end') && ev.shiftKey) {
        const anchorX = handle === 'start' ? x2 : x1;
        const anchorY = handle === 'start' ? y2 : y1;
        const dxPx = (px - anchorX) * (STAGE_VIRTUAL_W / 100);
        const dyPx = (py - anchorY) * (STAGE_VIRTUAL_H / 100);
        const lenPx = Math.hypot(dxPx, dyPx);
        const snapAng = Math.round(Math.atan2(dyPx, dxPx) / (Math.PI / 4)) * (Math.PI / 4);
        px = Number((anchorX + (Math.cos(snapAng) * lenPx * 100) / STAGE_VIRTUAL_W).toFixed(2));
        py = Number((anchorY + (Math.sin(snapAng) * lenPx * 100) / STAGE_VIRTUAL_H).toFixed(2));
      }

      updateActiveElements(
        (prev) =>
          prev.map((item) => {
            if (item.id !== el.id) return item;
            let nextX1 = x1;
            let nextY1 = y1;
            let nextX2 = x2;
            let nextY2 = y2;
            let nextCx = hasCustomControl ? cx : (x1 + x2) / 2;
            let nextCy = hasCustomControl ? cy : (y1 + y2) / 2;
            let nextPoints =
              lineType === 'curved' ? baseCurvePts.map((pt) => ({ ...pt })) : item.linePoints;

            if (handle === 'start') {
              nextX1 = px;
              nextY1 = py;
              if (!hasCustomControl) {
                nextCx = Number(((nextX1 + nextX2) / 2).toFixed(2));
                nextCy = Number(((nextY1 + nextY2) / 2).toFixed(2));
                if (lineType === 'curved') {
                  nextPoints = [{ x: nextCx, y: nextCy }];
                }
              }
            } else if (handle === 'end') {
              nextX2 = px;
              nextY2 = py;
              if (!hasCustomControl) {
                nextCx = Number(((nextX1 + nextX2) / 2).toFixed(2));
                nextCy = Number(((nextY1 + nextY2) / 2).toFixed(2));
                if (lineType === 'curved') {
                  nextPoints = [{ x: nextCx, y: nextCy }];
                }
              }
            } else if (lineType === 'curved') {
              nextPoints = baseCurvePts.map((pt, idx) =>
                idx === targetCurveIdx ? { x: px, y: py } : { ...pt }
              );
              nextCx = nextPoints[0]?.x ?? px;
              nextCy = nextPoints[0]?.y ?? py;
            } else {
              nextCx = px;
              nextCy = py;
            }

            const bounds = computeLineBounds(
              nextX1,
              nextY1,
              nextX2,
              nextY2,
              lineType !== 'straight' ? nextCx : undefined,
              lineType !== 'straight' ? nextCy : undefined,
              lineType === 'curved' ? nextPoints : undefined
            );
            return {
              ...item,
              ...bounds,
              lineX1: nextX1,
              lineY1: nextY1,
              lineX2: nextX2,
              lineY2: nextY2,
              lineCx: nextCx,
              lineCy: nextCy,
              linePoints: nextPoints
            };
          }),
        false
      );
    };

    const onUp = () => {
      activeDragKindRef.current = 'none';
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

  const startGroupResize = (
    e: React.PointerEvent,
    corner: 'nw' | 'ne' | 'sw' | 'se' = 'se'
  ) => {
    e.stopPropagation();
    const stage = stageRef.current;
    if (!stage || selectedElements.length < 2) return;
    if (selectedElements.some((item) => item.locked)) return;

    const rect = stage.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const affectsLeft = corner === 'nw' || corner === 'sw';
    const affectsTop = corner === 'nw' || corner === 'ne';
    setResizingElId('__group__');
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
      const signedDx = affectsLeft ? -dxPct : dxPct;
      const signedDy = affectsTop ? -dyPct : dyPct;
      let sx: number;
      let sy: number;
      if (hasImageInGroup || ev.shiftKey) {
        const rawScale =
          Math.abs(signedDx) >= Math.abs(signedDy)
            ? (bboxW + signedDx) / bboxW
            : (bboxH + signedDy) / bboxH;
        const minScale = Math.max(8 / bboxW, 8 / bboxH);
        const maxScaleX = affectsLeft ? (maxX + 20) / bboxW : (120 - minX) / bboxW;
        const maxScaleY = affectsTop ? (maxY + 20) / bboxH : (120 - minY) / bboxH;
        const uniform = Math.max(minScale, Math.min(Math.min(maxScaleX, maxScaleY), rawScale));
        sx = uniform;
        sy = uniform;
      } else {
        const maxW = affectsLeft ? maxX + 20 : 120 - minX;
        const maxH = affectsTop ? maxY + 20 : 120 - minY;
        const nextBboxW = Math.max(8, Math.min(maxW, bboxW + signedDx));
        const nextBboxH = Math.max(8, Math.min(maxH, bboxH + signedDy));
        sx = nextBboxW / bboxW;
        sy = nextBboxH / bboxH;
      }
      const fontScale = Math.min(sx, sy);
      const nextMinX = affectsLeft ? maxX - bboxW * sx : minX;
      const nextMinY = affectsTop ? maxY - bboxH * sy : minY;

      updateActiveElements(
        (prev) =>
          prev.map((item) => {
            const orig = origMap.get(item.id);
            if (!orig) return item;
            return {
              ...item,
              x: Number((nextMinX + (orig.x - minX) * sx).toFixed(2)),
              y: Number((nextMinY + (orig.y - minY) * sy).toFixed(2)),
              width: Number(Math.max(2, orig.width * sx).toFixed(2)),
              height: Number(Math.max(2, orig.height * sy).toFixed(2)),
              fontSize:
                item.kind === 'text' && typeof orig.fontSize === 'number'
                  ? Math.max(10, Math.min(700, Math.round(orig.fontSize * fontScale)))
                  : item.fontSize
            };
          }),
        false
      );
    };

    const onUp = () => {
      setResizingElId(null);
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
    setBackgroundSelected(false);

    let didDragMarquee = false;

    const onMove = (ev: PointerEvent) => {
      const curPctX = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100));
      const curPctY = Math.max(0, Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100));
      const x = Math.min(startPctX, curPctX);
      const y = Math.min(startPctY, curPctY);
      const width = Math.abs(curPctX - startPctX);
      const height = Math.abs(curPctY - startPctY);
      setMarqueeRect({ x, y, width, height });

      if (width > 0.5 || height > 0.5) {
        didDragMarquee = true;
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
      if (didDragMarquee) {
        suppressNextMainClickRef.current = true;
        window.setTimeout(() => {
          suppressNextMainClickRef.current = false;
        }, 0);
      } else if (e.target === stageRef.current && !e.shiftKey) {
        setBackgroundSelected(true);
        setActivePopover(null);
      }
      setMarqueeRect(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const showDesignFeedback = (msg: string) => {
    setDesignFeedback(msg);
    if (designFeedbackTimerRef.current) window.clearTimeout(designFeedbackTimerRef.current);
    designFeedbackTimerRef.current = window.setTimeout(() => setDesignFeedback(null), 2200);
  };

  const handleExportDesign = () => {
    const payload = studioMode
      ? {
          kind: 'uecfi-studio-design',
          version: 1,
          exportedAt: new Date().toISOString(),
          studioBackground: themeBackground,
          studioPresentationBox: presBox,
          studioParticipantBox: partBox,
          studioElements: slides[0]?.canvasElements ?? []
        }
      : {
          kind: 'uecfi-slide-design',
          version: 1,
          exportedAt: new Date().toISOString(),
          title: title.trim() || 'Untitled Design',
          themeBackground,
          blocks: slides
        };
    const slug = (studioMode ? 'studio-design' : title.trim() || 'slide-design')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug || 'design'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showDesignFeedback('Exported ✓');
  };

  const handleImportDesign = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as {
        kind?: string;
        title?: string;
        themeBackground?: string;
        blocks?: SlideBlock[];
        studioBackground?: string;
        studioPresentationBox?: StudioBoxRect;
        studioParticipantBox?: StudioBoxRect;
        studioElements?: CanvasElement[];
      };

      if (studioMode) {
        let nextBg = themeBackground;
        let nextElements: CanvasElement[] | null = null;
        if (parsed.kind === 'uecfi-studio-design' || Array.isArray(parsed.studioElements)) {
          if (typeof parsed.studioBackground === 'string') nextBg = parsed.studioBackground;
          if (parsed.studioPresentationBox) setPresBox(parsed.studioPresentationBox);
          if (parsed.studioParticipantBox) setPartBox(parsed.studioParticipantBox);
          nextElements = Array.isArray(parsed.studioElements) ? parsed.studioElements : [];
        } else if (Array.isArray(parsed.blocks) && parsed.blocks.length > 0) {
          if (typeof parsed.themeBackground === 'string') nextBg = parsed.themeBackground;
          nextElements = blockToCanvasElements(parsed.blocks[0]);
        }
        if (!nextElements) {
          showDesignFeedback('Invalid design file');
          return;
        }
        const studioSlide: SlideBlock = {
          id: 'studio-layout',
          label: 'Studio Layout',
          lines: [],
          canvasElements: nextElements
        };
        setThemeBackground(nextBg);
        setSlides([studioSlide]);
        setActiveSlideIdx(0);
        setSelectedElIds([]);
        setSelectedStudioBox(null);
        pushHistory([studioSlide], nextBg);
        showDesignFeedback('Imported ✓');
        return;
      }

      let nextBg = themeBackground;
      let nextSlides: SlideBlock[] | null = null;
      if (Array.isArray(parsed.blocks) && parsed.blocks.length > 0) {
        if (typeof parsed.themeBackground === 'string') nextBg = parsed.themeBackground;
        nextSlides = parsed.blocks.map((b) => ({
          ...b,
          canvasElements: blockToCanvasElements(b)
        }));
        if (parsed.title && !initialItem?.id?.startsWith('logo-slide')) {
          setTitle(parsed.title);
        }
      } else if (parsed.kind === 'uecfi-studio-design' || Array.isArray(parsed.studioElements)) {
        if (typeof parsed.studioBackground === 'string') nextBg = parsed.studioBackground;
        nextSlides = [
          {
            id: `blk-${Date.now()}`,
            label: 'Slide 1',
            lines: [],
            canvasElements: Array.isArray(parsed.studioElements) ? parsed.studioElements : []
          }
        ];
      }

      if (!nextSlides) {
        showDesignFeedback('Invalid design file');
        return;
      }
      setThemeBackground(nextBg);
      setSlides(nextSlides);
      setActiveSlideIdx(0);
      setSelectedElIds([]);
      pushHistory(nextSlides, nextBg);
      showDesignFeedback('Imported ✓');
    } catch {
      showDesignFeedback('Invalid design file');
    }
  };

  const handleSaveDeck = (e?: React.FormEvent) => {
    e?.preventDefault();
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
      className="m-0 h-screen max-h-screen w-screen max-w-[100vw] rounded-none border-0"
      onClose={() => {
        if (dialogRef.current) dialogRef.current.returnValue = '';
        onClose();
      }}
    >
      <form
        onSubmit={handleSaveDeck}
        className="flex h-screen w-full flex-col"
      >
        {/* Canva-Style Top Header Bar */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[linear-gradient(90deg,#1e1b4b_0%,#312e81_45%,#1e293b_100%)] px-4 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[linear-gradient(135deg,#7c3aed_0%,#2563eb_100%)] px-2.5 py-1 text-[0.88rem] font-extrabold tracking-[0.02em] text-white">
              <Sparkles size={14} />
              <h2 id={titleId} className="m-0 text-[0.88rem] font-extrabold">
                {studioMode ? 'Studio Canvas' : 'Canvas'}
              </h2>
            </div>

            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                disabled={!canUndo}
                onClick={handleUndo}
                title="Undo (Cmd/Ctrl+Z)"
                className={cn(
                  BTN_CLS,
                  'border-white/14 bg-white/8 px-2 py-1.5 text-white hover:bg-white/15',
                  !canUndo && 'opacity-35'
                )}
              >
                <Undo2 size={14} />
              </button>
              <button
                type="button"
                disabled={!canRedo}
                onClick={handleRedo}
                title="Redo (Cmd/Ctrl+Shift+Z)"
                className={cn(
                  BTN_CLS,
                  'border-white/14 bg-white/8 px-2 py-1.5 text-white hover:bg-white/15',
                  !canRedo && 'opacity-35'
                )}
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
                className={cn(
                  BTN_CLS,
                  'border-white/14 bg-white/8 px-2.5 py-1.5 text-[0.76rem] text-slate-200 hover:bg-white/15'
                )}
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
                className={cn(
                  INPUT_CLS,
                  'max-w-[300px] border-white/18 bg-slate-900/55 px-2.5 py-1.5 font-semibold text-white'
                )}
              />
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {designFeedback && (
              <span className="rounded-md bg-white/12 px-2 py-1 text-[0.74rem] font-semibold text-emerald-300">
                {designFeedback}
              </span>
            )}
            <button
              type="button"
              onClick={() => designImportRef.current?.click()}
              title={studioMode ? 'Import Studio Design (.json)' : 'Import Design (.json)'}
              className={cn(
                BTN_CLS,
                'border-white/14 bg-white/8 px-2.5 py-[7px] text-[0.78rem] text-white hover:bg-white/15'
              )}
            >
              <Upload size={14} />
              <span>Import</span>
            </button>
            <button
              type="button"
              onClick={handleExportDesign}
              title={studioMode ? 'Export Studio Design (.json)' : 'Export Design (.json)'}
              className={cn(
                BTN_CLS,
                'border-white/14 bg-white/8 px-2.5 py-[7px] text-[0.78rem] text-white hover:bg-white/15'
              )}
            >
              <Download size={14} />
              <span>Export</span>
            </button>
            <button
              type="submit"
              className={cn(
                'cursor-pointer rounded-lg border-0 px-4 py-[7px] text-[0.82rem] font-bold text-white transition-colors duration-150',
                justSaved ? 'bg-emerald-500' : 'bg-violet-600 hover:bg-violet-500'
              )}
            >
              {justSaved ? 'Saved ✓' : t.editor.save}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.editor.cancel}
              className={cn(
                BTN_CLS,
                'border-white/14 bg-white/8 px-2 py-1.5 text-white hover:bg-white/15'
              )}
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
          className="hidden"
        />

        {/* Hidden local 3D model (.glb) upload input */}
        <input
          ref={glbFileRef}
          type="file"
          accept=".glb,model/gltf-binary"
          onChange={handleGlbUpload}
          className="hidden"
        />

        {/* Hidden design JSON import input */}
        <input
          ref={designImportRef}
          type="file"
          accept=".json,application/json"
          onChange={handleImportDesign}
          className="hidden"
        />

        {/* Canva-Style Workspace: Far-Left Icon Rail + Collapsible Drawer + Center Studio */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Far-Left Vertical Icon Rail */}
          <nav
            aria-label="Canvas Tools"
            className="flex w-[68px] shrink-0 flex-col items-center gap-1.5 border-r border-subtle bg-[#0b0f19] px-1 py-2.5"
          >
            {(
              [
                { id: 'templates', label: 'Templates', icon: <LayoutTemplate size={18} /> },
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
                  className={cn(
                    'flex w-[58px] cursor-pointer flex-col items-center gap-1 rounded-[10px] border-0 px-0.5 py-2 text-[0.64rem] transition-colors',
                    active
                      ? 'bg-violet-600/25 font-bold text-violet-200'
                      : 'bg-transparent font-medium text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  )}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Collapsible Left Drawer (320px) */}
          {activeRailTab && (
            <aside className="flex min-h-0 w-[320px] shrink-0 flex-col overflow-hidden border-r border-subtle bg-gray-900">
              <div className="flex items-center justify-between border-b border-subtle px-3 py-2.5">
                <span className="text-[0.8rem] font-bold capitalize">
                  {activeRailTab}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveRailTab(null)}
                  title="Collapse panel for larger canvas"
                  className="inline-flex cursor-pointer border-0 bg-transparent p-0.5 text-text-muted hover:text-text-primary"
                >
                  <ChevronLeft size={16} />
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-3">
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
                      className="w-full cursor-pointer rounded-[10px] border-0 bg-violet-600 px-3 py-2.5 text-[0.84rem] font-bold text-white transition-colors hover:bg-violet-500"
                    >
                      + Add a text box
                    </button>
                    <span className={SECTION_TITLE_CLS}>Quick Text Styles</span>
                    <button
                      type="button"
                      onClick={() => handleAddText('heading')}
                      className="w-full cursor-pointer rounded-[10px] border border-subtle bg-panel-elevated p-3 text-left text-[1.15rem] font-extrabold text-white transition-colors hover:bg-hover"
                    >
                      Add a heading
                    </button>
                    {studioMode && (
                      <button
                        type="button"
                        onClick={handleAddParticipantWidget}
                        className="w-full cursor-pointer rounded-[10px] border border-amber-400/45 bg-amber-400/12 px-3 py-2.5 text-left text-[0.84rem] font-bold text-amber-200 transition-colors hover:bg-amber-400/20"
                      >
                        + Speaker Name / Title
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleAddText('subheading')}
                      className="w-full cursor-pointer rounded-[10px] border border-subtle bg-panel-elevated px-3 py-2.5 text-left text-[0.92rem] font-semibold text-slate-200 transition-colors hover:bg-hover"
                    >
                      Add a subheading
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddText('body')}
                      className="w-full cursor-pointer rounded-[10px] border border-subtle bg-panel-elevated px-3 py-2.5 text-left text-[0.78rem] font-normal text-slate-300 transition-colors hover:bg-hover"
                    >
                      Add a little bit of body text
                    </button>
                    <span className={cn(SECTION_TITLE_CLS, 'mt-1')}>Presets</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleAddText('heading', {
                            text: 'Rainbow Ripple',
                            textEffect: 'rainbowRipple',
                            fontFamily: "'Fredoka', sans-serif",
                            fontWeight: '700',
                            letterSpacing: 0.01,
                            enterEdit: false
                          })
                        }
                        className="flex h-[74px] cursor-pointer items-center justify-center rounded-[10px] border border-subtle px-2 text-center text-[0.95rem] font-bold tracking-[0.01em] transition-transform hover:scale-[1.02]"
                        style={{
                          fontFamily: "'Fredoka', sans-serif",
                          background: '#fdf9f0'
                        }}
                      >
                        <span className="uecfi-text-rainbow-ripple leading-tight">
                          {Array.from('Rainbow Ripple').map((ch, idx) => (
                            <span
                              key={idx}
                              className="uecfi-rainbow-char"
                              style={{ ['--char-i' as string]: idx }}
                            >
                              {ch === ' ' ? '\u00A0' : ch}
                            </span>
                          ))}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleAddText('heading', {
                            text: 'PRISM',
                            textEffect: 'prismSpin',
                            fontFamily: "'Archivo', sans-serif",
                            fontWeight: '900',
                            textTransform: 'uppercase',
                            letterSpacing: 0.02,
                            enterEdit: false
                          })
                        }
                        className="flex h-[74px] cursor-pointer items-center justify-center rounded-[10px] border border-subtle px-2 text-center text-[1.05rem] font-black tracking-[0.02em] uppercase transition-transform hover:scale-[1.02]"
                        style={{
                          fontFamily: "'Archivo', sans-serif",
                          background: '#101014'
                        }}
                      >
                        <span
                          className="uecfi-text-prism-spin leading-tight"
                          style={{ filter: 'drop-shadow(0 4px 16px rgb(120 80 200 / 0.35))' }}
                        >
                          PRISM
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleAddText('heading', {
                            text: 'Shimmer',
                            color: '#c9b8e8',
                            textEffect: 'shimmer',
                            fontFamily: "'Playfair Display', serif",
                            fontWeight: '700',
                            fontStyle: 'italic',
                            enterEdit: false
                          })
                        }
                        className="flex h-[66px] cursor-pointer items-center justify-center rounded-[10px] border border-subtle px-2 text-center text-[1.12rem] font-bold italic transition-transform hover:scale-[1.01]"
                        style={{
                          fontFamily: "'Playfair Display', serif",
                          background: '#0d0a14'
                        }}
                      >
                        <span className="uecfi-text-shimmer px-2 leading-tight">
                          Shimmer
                          <span className="uecfi-shimmer-stars" aria-hidden="true" />
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleAddText('heading', {
                            text: 'OVERRIDE',
                            color: '#f4f6ff',
                            textEffect: 'override',
                            fontFamily:
                              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                            fontWeight: '900',
                            textTransform: 'uppercase',
                            letterSpacing: 0.04,
                            enterEdit: false
                          })
                        }
                        className="flex h-[66px] cursor-pointer items-center justify-center rounded-[10px] border border-subtle px-2 text-center text-[1.02rem] font-black tracking-[0.04em] uppercase transition-transform hover:scale-[1.01]"
                        style={{
                          fontFamily:
                            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                          background: 'repeating-linear-gradient(0deg, #070709 0 3px, #0a0a0d 3px 6px)'
                        }}
                      >
                        <span className="uecfi-text-override px-1 leading-tight" data-text="OVERRIDE">
                          OVERRIDE
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleAddText('heading', {
                            text: 'VOLTAGE',
                            color: '#f5bc28',
                            textEffect: 'voltage',
                            animation: 'powerOn',
                            animationDuration: 1.2,
                            animationUnit: 'character',
                            fontFamily:
                              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                            fontWeight: '900',
                            textTransform: 'uppercase',
                            letterSpacing: 0.02,
                            enterEdit: false
                          })
                        }
                        className="flex h-[66px] cursor-pointer items-center justify-center rounded-[10px] border border-subtle px-2 text-center text-[1.02rem] font-black tracking-[0.02em] uppercase transition-transform hover:scale-[1.01]"
                        style={{
                          fontFamily:
                            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                          background: 'radial-gradient(110% 110% at 50% 30%, #12100a, #060503)'
                        }}
                      >
                        <span className="uecfi-text-voltage flex gap-[0.04em] leading-tight">
                          {Array.from('VOLTAGE').map((ch, idx) => (
                            <span
                              key={idx}
                              className="uecfi-voltage-char"
                              style={{
                                ['--i' as string]: idx,
                                WebkitTextStrokeWidth: '1.3px'
                              }}
                            >
                              {ch}
                            </span>
                          ))}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleAddText('heading', {
                            text: 'squishy!',
                            textEffect: 'rainbow',
                            animation: 'squishy',
                            animationDuration: 1.5,
                            animationUnit: 'character',
                            fontFamily: "'Fredoka', sans-serif",
                            fontWeight: '700',
                            letterSpacing: 0.02,
                            enterEdit: false
                          })
                        }
                        className="flex h-[66px] cursor-pointer items-center justify-center rounded-[10px] border border-subtle px-2 text-center text-[1.06rem] font-bold tracking-[0.02em] transition-transform hover:scale-[1.01]"
                        style={{
                          fontFamily: "'Fredoka', sans-serif",
                          background: '#1b1224'
                        }}
                      >
                        <span className="leading-tight">
                          {Array.from('squishy!').map((ch, idx) => (
                            <span
                              key={idx}
                              className="inline-block"
                              style={{ color: `oklch(0.8 0.19 ${idx * 42})` }}
                            >
                              {ch}
                            </span>
                          ))}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleAddText('heading', {
                            text: '3D GLOW',
                            color: '#0a0a0a',
                            textEffect: 'threeDGlow',
                            animation: 'wobble3d',
                            animationDuration: 5,
                            fontFamily: "'Concert One', sans-serif",
                            fontWeight: '400',
                            textTransform: 'uppercase',
                            enterEdit: false
                          })
                        }
                        className="col-span-2 flex h-[66px] cursor-pointer items-center justify-center rounded-[10px] border border-subtle px-2 text-center text-[1.18rem] tracking-[0.04em] uppercase transition-transform hover:scale-[1.01]"
                        style={{
                          fontFamily: "'Concert One', sans-serif",
                          background: '#0a0a0a'
                        }}
                      >
                        <span
                          className="uecfi-text-3d-glow-layer leading-tight text-[#0a0a0a]"
                          style={{ ['--glow-3d-blur' as string]: '12px' }}
                        >
                          3D GLOW
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleAddText('heading', {
                            text: 'Merci',
                            color: '#1d2440',
                            animation: 'strokeDraw',
                            animationDuration: 3.0,
                            fontFamily: "'Caveat', cursive",
                            fontWeight: '600',
                            enterEdit: false
                          })
                        }
                        className="flex h-[66px] cursor-pointer items-center justify-center rounded-[10px] border border-subtle px-2 text-center text-[1.28rem] font-semibold transition-transform hover:scale-[1.01]"
                        style={{
                          fontFamily: "'Caveat', cursive",
                          backgroundColor: '#f4efe6',
                          backgroundImage:
                            'radial-gradient(rgba(29,36,64,0.1) 1px, transparent 1px)',
                          backgroundSize: '12px 12px',
                          color: '#1d2440'
                        }}
                      >
                        <span className="leading-tight">Merci</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleAddText('heading', {
                            text: 'TRACE',
                            color: '#38e8d6',
                            textEffect: 'trace',
                            fontFamily: "'Archivo', sans-serif",
                            fontWeight: '900',
                            textTransform: 'uppercase',
                            letterSpacing: 0.03,
                            enterEdit: false
                          })
                        }
                        className="flex h-[66px] cursor-pointer items-center justify-center rounded-[10px] border border-subtle px-2 text-center text-[1.06rem] font-black tracking-[0.04em] uppercase transition-transform hover:scale-[1.01]"
                        style={{
                          fontFamily: "'Archivo', sans-serif",
                          background: '#0a0f14',
                          color: 'transparent',
                          WebkitTextStroke: '1.2px #38e8d6',
                          filter: 'drop-shadow(0 0 6px #38e8d6)'
                        }}
                      >
                        <span className="leading-tight">TRACE</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleAddText('heading', {
                            text: '3D Extrude',
                            color: '#e91e63',
                            textEffect: 'threeDExtrude',
                            fontFamily: "'Inter', sans-serif",
                            fontWeight: '900',
                            enterEdit: false
                          })
                        }
                        className="col-span-2 flex h-[66px] cursor-pointer items-center justify-center rounded-[10px] border border-subtle px-2 text-center text-[1.28rem] font-black transition-transform hover:scale-[1.01]"
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          background: 'color-mix(in srgb, #ffffff 82%, #e91e63)'
                        }}
                      >
                        <span className="uecfi-text-3d-extrude leading-tight">3D Extrude</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleAddText('heading', {
                            text: 'POP ART',
                            color: '#ff1f8f',
                            textEffect: 'popArt',
                            fontFamily: "'Raleway', sans-serif",
                            fontWeight: '900',
                            textTransform: 'uppercase',
                            letterSpacing: 0.1,
                            enterEdit: false
                          })
                        }
                        className="flex h-[66px] cursor-pointer items-center justify-center rounded-[10px] border border-subtle px-2 text-center text-[1.18rem] font-black tracking-[0.1em] uppercase transition-transform hover:scale-[1.01]"
                        style={{
                          fontFamily: "'Raleway', sans-serif",
                          background: '#ffff00'
                        }}
                      >
                        <span className="uecfi-text-pop-art leading-tight">POP ART</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleAddText('heading', {
                            text: 'DECONSTRUCTED',
                            color: '#ffff64',
                            animation: 'deconstructed',
                            animationDuration: 5,
                            fontFamily: "'Cambay', sans-serif",
                            fontWeight: '700',
                            letterSpacing: -0.02,
                            enterEdit: false
                          })
                        }
                        className="flex h-[66px] cursor-pointer items-center justify-center rounded-[10px] border border-subtle px-2 text-center text-[0.95rem] font-bold tracking-[-0.02em] transition-transform hover:scale-[1.01]"
                        style={{
                          fontFamily: "'Cambay', sans-serif",
                          background: '#000000',
                          color: '#ffff64'
                        }}
                      >
                        <span className="leading-tight">DECONSTRUCTED</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleAddText('heading', {
                            text: 'Retro Stack',
                            color: '#fcedd8',
                            textEffect: 'retroStack',
                            fontFamily: "'Niconne', cursive",
                            fontWeight: '700',
                            enterEdit: false
                          })
                        }
                        className="col-span-2 flex h-[66px] cursor-pointer items-center justify-center rounded-[10px] border border-subtle px-2 text-center text-[1.45rem] font-bold transition-transform hover:scale-[1.01]"
                        style={{
                          fontFamily: "'Niconne', cursive",
                          background: '#d52e3f'
                        }}
                      >
                        <span className="uecfi-text-retro-stack leading-tight">Retro Stack</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleAddText('heading', {
                            text: 'Slide',
                            color: '#4bc0c8',
                            textEffect: 'slideStripes',
                            fontFamily: "'Bungee Shade', cursive",
                            fontWeight: '400',
                            enterEdit: false
                          })
                        }
                        className="col-span-2 flex h-[66px] cursor-pointer items-center justify-center rounded-[10px] border border-subtle px-2 text-center text-[1.45rem] font-normal transition-transform hover:scale-[1.01]"
                        style={{
                          fontFamily: "'Bungee Shade', cursive",
                          background: '#ffed94'
                        }}
                      >
                        <span className="uecfi-text-slide-stripes leading-tight">Slide</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleAddText('heading', {
                            text: '3D BLOCK',
                            color: '#ece8da',
                            textEffect: 'block3d',
                            fontFamily: 'Verdana, Geneva, sans-serif',
                            fontWeight: '700',
                            textTransform: 'uppercase',
                            enterEdit: false
                          })
                        }
                        className="col-span-2 flex h-[66px] cursor-pointer items-center justify-center rounded-[10px] border border-subtle px-2 text-center text-[1.22rem] font-bold uppercase transition-transform hover:scale-[1.01]"
                        style={{
                          fontFamily: 'Verdana, Geneva, sans-serif',
                          background: '#c8c3b8'
                        }}
                      >
                        <span className="uecfi-text-block-3d leading-tight">3D BLOCK</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleAddAmazingInteriorsPreset}
                        className="col-span-2 flex h-[74px] cursor-pointer flex-col items-center justify-center rounded-[10px] border border-subtle px-2 text-center text-[1.18rem] font-semibold leading-[0.86] uppercase transition-transform hover:scale-[1.01]"
                        style={{
                          fontFamily: "'Barlow Condensed', Impact, Arial, sans-serif",
                          backgroundColor: '#ffffff',
                          backgroundImage:
                            'radial-gradient(lightgrey 10%, transparent 5%), radial-gradient(lightgrey 10%, transparent 5%)',
                          backgroundSize: '14px 14px',
                          backgroundPosition: '0 0, 7px 7px'
                        }}
                      >
                        <span
                          className="uecfi-text-amazing-pop"
                          style={{ ['--amazing-accent' as string]: '#00ffff' }}
                        >
                          AMAZING
                        </span>
                        <span
                          className="uecfi-text-amazing-pop"
                          style={{ ['--amazing-accent' as string]: '#ff69b4' }}
                        >
                          INTERIORS
                        </span>
                      </button>
                    </div>
                    <p className="m-0 text-[0.72rem] leading-[1.45] text-text-muted">
                      Tip: Double-click any text box on the canvas to type directly inside it.
                    </p>
                  </>
                )}

                {activeRailTab === 'fonts' && selectedEl?.kind === 'text' && (
                  <CanvasFontDrawer
                    currentFontValue={selectedEl.fontFamily ?? FONT_CATALOG[0].value}
                    documentFontValues={Array.from(
                      new Set(
                        slides
                          .flatMap((s) => s.canvasElements ?? [])
                          .filter((el) => el.kind === 'text' && el.fontFamily)
                          .map((el) => el.fontFamily as string)
                      )
                    )}
                    onSelectFont={(fontValue) => updateSelectedEl({ fontFamily: fontValue })}
                    onClose={() => setActiveRailTab(null)}
                  />
                )}

                {activeRailTab === 'animate' && (
                  <div className="flex flex-col gap-3">
                    {!selectedEl ? (
                      <div className="rounded-[10px] border border-dashed border-subtle p-3 text-center text-[0.76rem] text-text-muted">
                        Select an element on the slide to add entrance or motion animations.
                      </div>
                    ) : (() => {
                        const activeAnim = selectedEl.animation ?? 'none';
                        const activePreset = CANVAS_ANIMATION_PRESETS.find(
                          (p) => p.id === activeAnim
                        );
                        const isLoop = isLoopAnimation(selectedEl.animation);
                        const entranceList = CANVAS_ANIMATION_PRESETS.filter(
                          (p) => p.group === 'none' || p.group === 'entrance'
                        );
                        const loopList = CANVAS_ANIMATION_PRESETS.filter(
                          (p) => p.group === 'loop'
                        );

                        const chunkRows = <T,>(items: T[], size = 3): T[][] => {
                          const rows: T[][] = [];
                          for (let i = 0; i < items.length; i += size) {
                            rows.push(items.slice(i, i + size));
                          }
                          return rows;
                        };

                        const renderCardPreview = (id: CanvasAnimationType, active: boolean) => {
                          const fg = active ? 'text-violet-200' : 'text-violet-400';
                          if (id === 'none') {
                            return <span className="text-[0.8rem] font-semibold text-text-muted">None</span>;
                          }
                          if (id === 'fadeIn') {
                            return <span className={cn('text-[0.95rem] font-extrabold opacity-65', fg)}>ABC</span>;
                          }
                          if (id === 'rise') {
                            return <span className={cn('text-[0.95rem] font-extrabold', fg)}>↑ ABC</span>;
                          }
                          if (id === 'slideLeft') {
                            return <span className={cn('text-[0.95rem] font-extrabold', fg)}>← ABC</span>;
                          }
                          if (id === 'slideRight') {
                            return <span className={cn('text-[0.95rem] font-extrabold', fg)}>ABC →</span>;
                          }
                          if (id === 'pop') {
                            return <span className={cn('text-[1.05rem] font-black tracking-tight', fg)}>A<span className="text-[1.2rem]">B</span>C</span>;
                          }
                          if (id === 'smokeDissolve') {
                            return (
                              <span className={cn('text-[0.92rem] font-bold tracking-wider', fg)} style={{ filter: 'blur(0.7px)' }}>
                                A<span className="opacity-65">B</span><span className="opacity-35">C</span>
                              </span>
                            );
                          }
                          if (id === 'maskRise') {
                            return (
                              <span className={cn('inline-block overflow-hidden border-b border-current/40 pb-0.5 text-[0.92rem] font-serif font-semibold', fg)}>
                                <span className="inline-block translate-y-[2px]">ABC</span>
                              </span>
                            );
                          }
                          if (id === 'vaporHaze') {
                            return (
                              <span className={cn('text-[0.92rem] font-bold italic opacity-75', fg)} style={{ filter: 'blur(1px)' }}>
                                VAPOR
                              </span>
                            );
                          }
                          if (id === 'squishy') {
                            return (
                              <span className={cn('text-[0.95rem] font-extrabold', fg)}>
                                <span className="inline-block scale-x-110 scale-y-90">A</span>
                                <span className="inline-block -translate-y-0.5 scale-x-95 scale-y-110">B</span>
                                <span className="inline-block">C</span>
                              </span>
                            );
                          }
                          if (id === 'powerOn') {
                            return (
                              <span className={cn('text-[0.95rem] font-black', fg)}>
                                <span className="opacity-30">A</span>
                                <span className="text-white drop-shadow-[0_0_6px_#fff]">B</span>
                                <span>C</span>
                              </span>
                            );
                          }
                          if (id === 'ripple') {
                            return (
                              <span className={cn('text-[0.95rem] font-extrabold', fg)}>
                                <span className="inline-block translate-y-[1px]">A</span>
                                <span className="inline-block -translate-y-[3px]">B</span>
                                <span className="inline-block translate-y-[1px]">C</span>
                              </span>
                            );
                          }
                          if (id === 'wobble3d') {
                            return (
                              <span
                                className={cn('inline-block text-[0.95rem] font-black', fg)}
                                style={{
                                  transform: 'perspective(120px) rotateX(18deg) rotateY(-20deg)'
                                }}
                              >
                                ABC
                              </span>
                            );
                          }
                          if (id === 'strokeDraw') {
                            return (
                              <span
                                className={cn('text-[1.1rem] font-semibold', fg)}
                                style={{
                                  fontFamily: "'Caveat', cursive",
                                  color: 'transparent',
                                  WebkitTextStroke: '1px currentColor'
                                }}
                              >
                                Merci
                              </span>
                            );
                          }
                          if (id === 'deconstructed') {
                            return (
                              <span className={cn('relative inline-block text-[0.95rem] font-bold tracking-tight', fg)}>
                                <span className="inline-block translate-x-[2px] opacity-70">AB</span>
                                <span className="inline-block -translate-x-[2px]">C</span>
                              </span>
                            );
                          }
                          if (id === 'spin') {
                            return <RotateCw size={18} className={fg} />;
                          }
                          return <span className={cn('text-[0.95rem] font-extrabold', fg)}>ABC</span>;
                        };

                        const renderInlineOptions = (colIdx: number) => {
                          if (!activePreset || activePreset.id === 'none') return null;
                          const caretLeft = colIdx === 0 ? '16.66%' : colIdx === 1 ? '50%' : '83.33%';
                          return (
                            <div className="relative mt-2 rounded-xl border border-subtle bg-panel-elevated p-3">
                              <div
                                className="absolute -top-1.5 h-3 w-3 -translate-x-1/2 rotate-45 border-t border-l border-subtle bg-panel-elevated"
                                style={{ left: caretLeft }}
                              />
                              <div className="flex flex-col gap-3">
                                <label className={FIELD_LABEL_CLS}>
                                  <span>
                                    Speed / Duration ({(selectedEl.animationDuration ?? activePreset.defaultDuration).toFixed(1)}s)
                                  </span>
                                  <input
                                    type="range"
                                    min={0.3}
                                    max={isLoop ? 14 : 3}
                                    step={0.1}
                                    value={selectedEl.animationDuration ?? activePreset.defaultDuration}
                                    onChange={(e) => {
                                      updateSelectedEl({
                                        animationDuration: Number(e.target.value)
                                      });
                                      setAnimReplayNonce((n) => n + 1);
                                    }}
                                    className="accent-violet-500"
                                  />
                                </label>

                                {!isLoop && (
                                  <label className={FIELD_LABEL_CLS}>
                                    <span>
                                      Start Delay ({(selectedEl.animationDelay ?? 0).toFixed(1)}s)
                                    </span>
                                    <input
                                      type="range"
                                      min={0}
                                      max={3}
                                      step={0.1}
                                      value={selectedEl.animationDelay ?? 0}
                                      onChange={(e) => {
                                        updateSelectedEl({
                                          animationDelay: Number(e.target.value)
                                        });
                                        setAnimReplayNonce((n) => n + 1);
                                      }}
                                      className="accent-violet-500"
                                    />
                                  </label>
                                )}

                                {activePreset.supportsUnit && selectedEl.kind === 'text' && (
                                  <div className="flex flex-col gap-1.5">
                                    <span className="text-[0.74rem] font-semibold text-text-secondary">
                                      Writing Style
                                    </span>
                                    <div className="grid grid-cols-3 gap-1.5">
                                      {(
                                        [
                                          { id: 'character', label: 'Character' },
                                          { id: 'word', label: 'Word' },
                                          { id: 'line', label: 'Line' }
                                        ] as const
                                      ).map((u) => {
                                        const defaultUnit =
                                          activePreset.id === 'maskRise'
                                            ? 'line'
                                            : 'character';
                                        const active =
                                          (selectedEl.animationUnit ?? defaultUnit) === u.id;
                                        return (
                                          <button
                                            key={u.id}
                                            type="button"
                                            onClick={() => {
                                              updateSelectedEl({ animationUnit: u.id });
                                              setAnimReplayNonce((n) => n + 1);
                                            }}
                                            className={cn(
                                              'cursor-pointer rounded-lg border py-1.5 text-[0.72rem] font-semibold transition-colors',
                                              active
                                                ? 'border-violet-500 bg-violet-500/20 text-violet-300'
                                                : 'border-subtle bg-panel text-text-primary hover:border-accent/60'
                                            )}
                                          >
                                            {u.label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {activePreset.directions && activePreset.directions.length > 0 && (
                                  <div className="flex flex-col gap-1.5">
                                    <span className="text-[0.74rem] font-semibold text-text-secondary">
                                      Direction
                                    </span>
                                    <div className="flex gap-1.5">
                                      {activePreset.directions.map((dir) => {
                                        const defaultDir =
                                          selectedEl.animation === 'slideRight'
                                            ? 'right'
                                            : selectedEl.animation === 'slideLeft'
                                              ? 'left'
                                              : 'up';
                                        const active =
                                          (selectedEl.animationDirection ?? defaultDir) === dir;
                                        const arrow =
                                          dir === 'left'
                                            ? '←'
                                            : dir === 'right'
                                              ? '→'
                                              : dir === 'up'
                                                ? '↑'
                                                : '↓';
                                        return (
                                          <button
                                            key={dir}
                                            type="button"
                                            title={`Direction: ${dir}`}
                                            onClick={() => {
                                              updateSelectedEl({ animationDirection: dir });
                                              setAnimReplayNonce((n) => n + 1);
                                            }}
                                            className={cn(
                                              'flex-1 cursor-pointer rounded-lg border py-1.5 text-[0.9rem] font-bold transition-colors',
                                              active
                                                ? 'border-violet-500 bg-violet-500/20 text-violet-300'
                                                : 'border-subtle bg-panel text-text-primary hover:border-accent/60'
                                            )}
                                          >
                                            {arrow}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {activePreset.supportsIntensity && (
                                  <label className={FIELD_LABEL_CLS}>
                                    <span>
                                      Intensity ({Math.round((selectedEl.animationIntensity ?? 1) * 100)}%)
                                    </span>
                                    <input
                                      type="range"
                                      min={0.3}
                                      max={2}
                                      step={0.1}
                                      value={selectedEl.animationIntensity ?? 1}
                                      onChange={(e) => {
                                        updateSelectedEl({
                                          animationIntensity: Number(e.target.value)
                                        });
                                        setAnimReplayNonce((n) => n + 1);
                                      }}
                                      className="accent-violet-500"
                                    />
                                  </label>
                                )}
                              </div>
                            </div>
                          );
                        };

                        const renderSectionRows = (presets: typeof CANVAS_ANIMATION_PRESETS) =>
                          chunkRows(presets, 3).map((row, rIdx) => {
                            const activeIdx = row.findIndex(
                              (p) => p.id === activeAnim && p.id !== 'none'
                            );
                            return (
                              <div key={`anim-row-${rIdx}`} className="flex flex-col">
                                <div className="grid grid-cols-3 gap-2">
                                  {row.map((p) => {
                                    const active = activeAnim === p.id;
                                    const isSplitAnim =
                                      p.id === 'smokeDissolve' ||
                                      p.id === 'maskRise' ||
                                      p.id === 'powerOn' ||
                                      p.id === 'squishy' ||
                                      p.id === 'ripple';
                                    const incompatibleWithEffect =
                                      (isSplitAnim &&
                                        (selectedEl.textEffect === 'prismSpin' ||
                                          selectedEl.textEffect === 'shimmer' ||
                                          selectedEl.textEffect === 'threeDGlow' ||
                                          selectedEl.textEffect === 'trace' ||
                                          selectedEl.textEffect === 'slideStripes')) ||
                                      (p.id === 'strokeDraw' &&
                                        selectedEl.textEffect !== undefined &&
                                        selectedEl.textEffect !== 'none');
                                    return (
                                      <button
                                        key={p.id}
                                        type="button"
                                        disabled={incompatibleWithEffect}
                                        title={
                                          incompatibleWithEffect
                                            ? 'Not compatible with Prism or Shimmer text effect'
                                            : undefined
                                        }
                                        onClick={() => {
                                          if (incompatibleWithEffect) return;
                                          const isMask = p.id === 'maskRise';
                                          updateSelectedEl({
                                            animation: p.id === 'none' ? undefined : p.id,
                                            animationDuration:
                                              p.id === 'none' ? undefined : p.defaultDuration,
                                            animationDelay:
                                              p.id === 'none'
                                                ? undefined
                                                : selectedEl.animationDelay ?? 0,
                                            ...(isMask && selectedEl.animation !== p.id
                                              ? {
                                                  animationUnit: 'line',
                                                  animationDirection: 'up'
                                                }
                                              : {})
                                          });
                                          setAnimReplayNonce((n) => n + 1);
                                        }}
                                        className={cn(
                                          'flex flex-col items-center gap-1 border-0 bg-transparent p-0',
                                          incompatibleWithEffect
                                            ? 'cursor-not-allowed opacity-40'
                                            : 'cursor-pointer'
                                        )}
                                      >
                                        <div
                                          className={cn(
                                            'relative flex h-[62px] w-full items-center justify-center rounded-[10px] border transition-colors',
                                            active && p.id !== 'none'
                                              ? 'border-violet-500 bg-slate-600/75 ring-1 ring-violet-500'
                                              : active
                                                ? 'border-violet-500 bg-panel-elevated ring-1 ring-violet-500'
                                                : 'border-subtle bg-panel-elevated hover:border-accent/60'
                                          )}
                                        >
                                          {renderCardPreview(p.id, active)}
                                          {active && p.id !== 'none' && (
                                            <div className="absolute inset-0 flex items-center justify-center rounded-[10px] bg-slate-900/35">
                                              <SlidersHorizontal size={16} className="text-white" />
                                            </div>
                                          )}
                                        </div>
                                        <span className="line-clamp-1 text-center text-[0.68rem] font-medium text-text-secondary">
                                          {p.label.replace(' (Slide Up)', '')}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                                {activeIdx !== -1 && renderInlineOptions(activeIdx)}
                              </div>
                            );
                          });

                        return (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-[0.74rem] font-bold uppercase tracking-wider text-text-secondary">
                                Entrance
                              </span>
                              {activeAnim !== 'none' && (
                                <button
                                  type="button"
                                  onClick={() => setAnimReplayNonce((n) => n + 1)}
                                  className="cursor-pointer rounded-[6px] border border-[rgba(56,189,248,0.45)] bg-[rgba(56,189,248,0.14)] px-2 py-[3px] text-[0.7rem] font-semibold text-[#7dd3fc]"
                                >
                                  Replay
                                </button>
                              )}
                            </div>
                            <div className="flex flex-col gap-2">
                              {renderSectionRows(entranceList)}
                            </div>

                            <span className="pt-1 text-[0.74rem] font-bold uppercase tracking-wider text-text-secondary">
                              Continuous Motion
                            </span>
                            <div className="flex flex-col gap-2">
                              {renderSectionRows(loopList)}
                            </div>
                          </>
                        );
                      })()}
                  </div>
                )}

                {activeRailTab === 'effects' && (
                  <div className="flex flex-col gap-3">
                    {selectedEl?.kind !== 'text' ? (
                      <div className="rounded-[10px] border border-dashed border-subtle p-3 text-center text-[0.76rem] text-text-muted">
                        Select a text element on the slide to apply and customize text effects.
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              updateSelectedEl({
                                textEffect: 'none',
                                outlineWidth: 0,
                                glowBlur: 0,
                                textShadowEnabled: false
                              })
                            }
                            className={cn(
                              'flex flex-col items-center gap-1 rounded-[10px] border bg-panel-elevated p-2 cursor-pointer transition-colors',
                              (selectedEl.textEffect ?? 'none') === 'none' &&
                                !(selectedEl.outlineWidth && selectedEl.outlineWidth > 0) &&
                                !(selectedEl.glowBlur && selectedEl.glowBlur > 0) &&
                                !selectedEl.textShadowEnabled
                                ? 'border-violet-500 ring-1 ring-violet-500'
                                : 'border-subtle hover:border-accent/60'
                            )}
                          >
                            <span className="text-[1.15rem] font-extrabold text-white">Ag</span>
                            <span className="text-[0.68rem] text-text-secondary">None</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateSelectedEl({
                                textShadowEnabled: !selectedEl.textShadowEnabled
                              })
                            }
                            className={cn(
                              'flex flex-col items-center gap-1 rounded-[10px] border bg-panel-elevated p-2 cursor-pointer transition-colors',
                              selectedEl.textShadowEnabled
                                ? 'border-violet-500 ring-1 ring-violet-500'
                                : 'border-subtle hover:border-accent/60'
                            )}
                          >
                            <span
                              className="text-[1.15rem] font-extrabold text-violet-300"
                              style={{ textShadow: '2px 3px 4px rgba(0,0,0,0.85)' }}
                            >
                              Ag
                            </span>
                            <span className="text-[0.68rem] text-text-secondary">Drop</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateSelectedEl({
                                glowBlur: selectedEl.glowBlur && selectedEl.glowBlur > 0 ? 0 : 18
                              })
                            }
                            className={cn(
                              'flex flex-col items-center gap-1 rounded-[10px] border bg-panel-elevated p-2 cursor-pointer transition-colors',
                              selectedEl.glowBlur && selectedEl.glowBlur > 0
                                ? 'border-violet-500 ring-1 ring-violet-500'
                                : 'border-subtle hover:border-accent/60'
                            )}
                          >
                            <span
                              className="text-[1.15rem] font-extrabold text-violet-300"
                              style={{ textShadow: '0 0 10px #a78bfa' }}
                            >
                              Ag
                            </span>
                            <span className="text-[0.68rem] text-text-secondary">Glow</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateSelectedEl({
                                outlineWidth:
                                  selectedEl.outlineWidth && selectedEl.outlineWidth > 0 ? 0 : 4
                              })
                            }
                            className={cn(
                              'flex flex-col items-center gap-1 rounded-[10px] border bg-panel-elevated p-2 cursor-pointer transition-colors',
                              selectedEl.outlineWidth && selectedEl.outlineWidth > 0
                                ? 'border-violet-500 ring-1 ring-violet-500'
                                : 'border-subtle hover:border-accent/60'
                            )}
                          >
                            <span
                              className="text-[1.15rem] font-extrabold text-transparent"
                              style={{ WebkitTextStroke: '1.5px #a78bfa' }}
                            >
                              Ag
                            </span>
                            <span className="text-[0.68rem] text-text-secondary">Outline</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateSelectedEl({
                                textEffect:
                                  selectedEl.textEffect === 'rainbow' ? 'none' : 'rainbow'
                              })
                            }
                            className={cn(
                              'flex flex-col items-center gap-1 rounded-[10px] border bg-panel-elevated p-2 cursor-pointer transition-colors',
                              selectedEl.textEffect === 'rainbow'
                                ? 'border-violet-500 ring-1 ring-violet-500'
                                : 'border-subtle hover:border-accent/60'
                            )}
                          >
                            <span className="uecfi-text-rainbow text-[1.15rem] font-extrabold">
                              <span className="uecfi-rainbow-static-char" style={{ ['--char-i' as string]: 0 }}>A</span>
                              <span className="uecfi-rainbow-static-char" style={{ ['--char-i' as string]: 2 }}>g</span>
                            </span>
                            <span className="text-[0.68rem] text-text-secondary">Rainbow</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateSelectedEl({
                                textEffect:
                                  selectedEl.textEffect === 'rainbowRipple' ? 'none' : 'rainbowRipple'
                              })
                            }
                            className={cn(
                              'flex flex-col items-center gap-1 rounded-[10px] border bg-panel-elevated p-2 cursor-pointer transition-colors',
                              selectedEl.textEffect === 'rainbowRipple'
                                ? 'border-violet-500 ring-1 ring-violet-500'
                                : 'border-subtle hover:border-accent/60'
                            )}
                          >
                            <span className="uecfi-text-rainbow-ripple text-[1.15rem] font-extrabold">
                              <span className="uecfi-rainbow-char" style={{ ['--char-i' as string]: 0 }}>A</span>
                              <span className="uecfi-rainbow-char" style={{ ['--char-i' as string]: 1 }}>g</span>
                            </span>
                            <span className="text-[0.68rem] text-text-secondary">R. Ripple</span>
                          </button>
                          <button
                            type="button"
                            disabled={
                              selectedEl.animation === 'smokeDissolve' ||
                              selectedEl.animation === 'maskRise' ||
                              selectedEl.animation === 'powerOn' ||
                              selectedEl.animation === 'squishy' ||
                              selectedEl.animation === 'ripple'
                            }
                            title={
                              selectedEl.animation === 'smokeDissolve' ||
                              selectedEl.animation === 'maskRise' ||
                              selectedEl.animation === 'powerOn' ||
                              selectedEl.animation === 'squishy' ||
                              selectedEl.animation === 'ripple'
                                ? 'Not compatible with per-character/split animations'
                                : undefined
                            }
                            onClick={() =>
                              updateSelectedEl({
                                textEffect:
                                  selectedEl.textEffect === 'prismSpin' ? 'none' : 'prismSpin'
                              })
                            }
                            className={cn(
                              'flex flex-col items-center gap-1 rounded-[10px] border bg-panel-elevated p-2 transition-colors',
                              selectedEl.animation === 'smokeDissolve' ||
                                selectedEl.animation === 'maskRise' ||
                                selectedEl.animation === 'powerOn' ||
                                selectedEl.animation === 'squishy' ||
                                selectedEl.animation === 'ripple'
                                ? 'cursor-not-allowed opacity-40 border-subtle'
                                : selectedEl.textEffect === 'prismSpin'
                                  ? 'cursor-pointer border-violet-500 ring-1 ring-violet-500'
                                  : 'cursor-pointer border-subtle hover:border-accent/60'
                            )}
                          >
                            <span className="uecfi-text-prism-spin text-[1.15rem] font-black">Ag</span>
                            <span className="text-[0.68rem] text-text-secondary">Prism</span>
                          </button>
                          <button
                            type="button"
                            disabled={
                              selectedEl.animation === 'smokeDissolve' ||
                              selectedEl.animation === 'maskRise' ||
                              selectedEl.animation === 'powerOn' ||
                              selectedEl.animation === 'squishy' ||
                              selectedEl.animation === 'ripple'
                            }
                            title={
                              selectedEl.animation === 'smokeDissolve' ||
                              selectedEl.animation === 'maskRise' ||
                              selectedEl.animation === 'powerOn' ||
                              selectedEl.animation === 'squishy' ||
                              selectedEl.animation === 'ripple'
                                ? 'Not compatible with per-character/split animations'
                                : undefined
                            }
                            onClick={() =>
                              updateSelectedEl({
                                textEffect:
                                  selectedEl.textEffect === 'shimmer' ? 'none' : 'shimmer'
                              })
                            }
                            className={cn(
                              'flex flex-col items-center gap-1 rounded-[10px] border bg-panel-elevated p-2 transition-colors',
                              selectedEl.animation === 'smokeDissolve' ||
                                selectedEl.animation === 'maskRise' ||
                                selectedEl.animation === 'powerOn' ||
                                selectedEl.animation === 'squishy' ||
                                selectedEl.animation === 'ripple'
                                ? 'cursor-not-allowed opacity-40 border-subtle'
                                : selectedEl.textEffect === 'shimmer'
                                  ? 'cursor-pointer border-violet-500 ring-1 ring-violet-500'
                                  : 'cursor-pointer border-subtle hover:border-accent/60'
                            )}
                          >
                            <span className="uecfi-text-shimmer px-1 text-[1.15rem] font-bold italic">
                              Ag
                              <span className="uecfi-shimmer-stars" aria-hidden="true" />
                            </span>
                            <span className="text-[0.68rem] text-text-secondary">Shimmer</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateSelectedEl({
                                textEffect:
                                  selectedEl.textEffect === 'override' ? 'none' : 'override'
                              })
                            }
                            className={cn(
                              'flex flex-col items-center gap-1 rounded-[10px] border bg-panel-elevated p-2 cursor-pointer transition-colors',
                              selectedEl.textEffect === 'override'
                                ? 'border-violet-500 ring-1 ring-violet-500'
                                : 'border-subtle hover:border-accent/60'
                            )}
                          >
                            <span
                              className="uecfi-text-override px-1 text-[1.1rem] font-black tracking-[0.04em]"
                              data-text="Ag"
                            >
                              Ag
                            </span>
                            <span className="text-[0.68rem] text-text-secondary">Override</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateSelectedEl({
                                textEffect:
                                  selectedEl.textEffect === 'voltage' ? 'none' : 'voltage'
                              })
                            }
                            className={cn(
                              'flex flex-col items-center gap-1 rounded-[10px] border bg-panel-elevated p-2 cursor-pointer transition-colors',
                              selectedEl.textEffect === 'voltage'
                                ? 'border-violet-500 ring-1 ring-violet-500'
                                : 'border-subtle hover:border-accent/60'
                            )}
                          >
                            <span className="uecfi-text-voltage px-1 text-[1.1rem] font-black tracking-[0.02em]">
                              <span
                                className="uecfi-voltage-char"
                                style={{ ['--i' as string]: 0, WebkitTextStrokeWidth: '1.2px' }}
                              >
                                A
                              </span>
                              <span
                                className="uecfi-voltage-char"
                                style={{ ['--i' as string]: 1, WebkitTextStrokeWidth: '1.2px' }}
                              >
                                g
                              </span>
                            </span>
                            <span className="text-[0.68rem] text-text-secondary">Voltage</span>
                          </button>
                          <button
                            type="button"
                            disabled={
                              selectedEl.animation === 'smokeDissolve' ||
                              selectedEl.animation === 'maskRise' ||
                              selectedEl.animation === 'powerOn' ||
                              selectedEl.animation === 'squishy' ||
                              selectedEl.animation === 'ripple'
                            }
                            title={
                              selectedEl.animation === 'smokeDissolve' ||
                              selectedEl.animation === 'maskRise' ||
                              selectedEl.animation === 'powerOn' ||
                              selectedEl.animation === 'squishy' ||
                              selectedEl.animation === 'ripple'
                                ? 'Not compatible with per-character/split animations'
                                : undefined
                            }
                            onClick={() =>
                              updateSelectedEl({
                                textEffect:
                                  selectedEl.textEffect === 'threeDGlow' ? 'none' : 'threeDGlow'
                              })
                            }
                            className={cn(
                              'flex flex-col items-center gap-1 rounded-[10px] border bg-panel-elevated p-2 transition-colors',
                              selectedEl.animation === 'smokeDissolve' ||
                                selectedEl.animation === 'maskRise' ||
                                selectedEl.animation === 'powerOn' ||
                                selectedEl.animation === 'squishy' ||
                                selectedEl.animation === 'ripple'
                                ? 'cursor-not-allowed opacity-40 border-subtle'
                                : selectedEl.textEffect === 'threeDGlow'
                                  ? 'cursor-pointer border-violet-500 ring-1 ring-violet-500'
                                  : 'cursor-pointer border-subtle hover:border-accent/60'
                            )}
                          >
                            <span
                              className="uecfi-text-3d-glow-layer px-1 text-[1.1rem] font-black text-[#0a0a0a]"
                              style={{ ['--glow-3d-blur' as string]: '8px' }}
                            >
                              Ag
                            </span>
                            <span className="text-[0.68rem] text-text-secondary">3D Glow</span>
                          </button>
                          <button
                            type="button"
                            disabled={
                              selectedEl.animation === 'smokeDissolve' ||
                              selectedEl.animation === 'maskRise' ||
                              selectedEl.animation === 'powerOn' ||
                              selectedEl.animation === 'strokeDraw' ||
                              selectedEl.animation === 'squishy' ||
                              selectedEl.animation === 'ripple'
                            }
                            title={
                              selectedEl.animation === 'smokeDissolve' ||
                              selectedEl.animation === 'maskRise' ||
                              selectedEl.animation === 'powerOn' ||
                              selectedEl.animation === 'strokeDraw' ||
                              selectedEl.animation === 'squishy' ||
                              selectedEl.animation === 'ripple'
                                ? 'Not compatible with per-character/stroke animations'
                                : undefined
                            }
                            onClick={() =>
                              updateSelectedEl({
                                textEffect:
                                  selectedEl.textEffect === 'trace' ? 'none' : 'trace'
                              })
                            }
                            className={cn(
                              'flex flex-col items-center gap-1 rounded-[10px] border bg-panel-elevated p-2 transition-colors',
                              selectedEl.animation === 'smokeDissolve' ||
                                selectedEl.animation === 'maskRise' ||
                                selectedEl.animation === 'powerOn' ||
                                selectedEl.animation === 'strokeDraw' ||
                                selectedEl.animation === 'squishy' ||
                                selectedEl.animation === 'ripple'
                                ? 'cursor-not-allowed opacity-40 border-subtle'
                                : selectedEl.textEffect === 'trace'
                                  ? 'cursor-pointer border-violet-500 ring-1 ring-violet-500'
                                  : 'cursor-pointer border-subtle hover:border-accent/60'
                            )}
                          >
                            <span
                              className="px-1 text-[1.1rem] font-black"
                              style={{
                                color: 'transparent',
                                WebkitTextStroke: '1px #38e8d6',
                                filter: 'drop-shadow(0 0 4px #38e8d6)'
                              }}
                            >
                              Ag
                            </span>
                            <span className="text-[0.68rem] text-text-secondary">Trace</span>
                          </button>
                          <button
                            type="button"
                            disabled={selectedEl.animation === 'strokeDraw'}
                            title={
                              selectedEl.animation === 'strokeDraw'
                                ? 'Not compatible with Stroke Draw animation'
                                : undefined
                            }
                            onClick={() =>
                              updateSelectedEl({
                                textEffect:
                                  selectedEl.textEffect === 'threeDExtrude'
                                    ? 'none'
                                    : 'threeDExtrude',
                                ...(selectedEl.textEffect !== 'threeDExtrude' &&
                                (!selectedEl.color || selectedEl.color === '#ffffff')
                                  ? { color: '#e91e63' }
                                  : {})
                              })
                            }
                            className={cn(
                              'flex flex-col items-center gap-1 rounded-[10px] border bg-panel-elevated p-2 transition-colors',
                              selectedEl.animation === 'strokeDraw'
                                ? 'cursor-not-allowed opacity-40 border-subtle'
                                : selectedEl.textEffect === 'threeDExtrude'
                                  ? 'cursor-pointer border-violet-500 ring-1 ring-violet-500'
                                  : 'cursor-pointer border-subtle hover:border-accent/60'
                            )}
                          >
                            <span className="uecfi-text-3d-extrude px-1 text-[1.15rem] font-black">
                              Ag
                            </span>
                            <span className="text-[0.68rem] text-text-secondary">Extrude</span>
                          </button>
                          <button
                            type="button"
                            disabled={selectedEl.animation === 'strokeDraw'}
                            title={
                              selectedEl.animation === 'strokeDraw'
                                ? 'Not compatible with Stroke Draw animation'
                                : undefined
                            }
                            onClick={() =>
                              updateSelectedEl({
                                textEffect:
                                  selectedEl.textEffect === 'popArt' ? 'none' : 'popArt',
                                ...(selectedEl.textEffect !== 'popArt' &&
                                (!selectedEl.color || selectedEl.color === '#ffffff')
                                  ? { color: '#ff1f8f' }
                                  : {})
                              })
                            }
                            className={cn(
                              'flex flex-col items-center gap-1 rounded-[10px] border bg-panel-elevated p-2 transition-colors',
                              selectedEl.animation === 'strokeDraw'
                                ? 'cursor-not-allowed opacity-40 border-subtle'
                                : selectedEl.textEffect === 'popArt'
                                  ? 'cursor-pointer border-violet-500 ring-1 ring-violet-500'
                                  : 'cursor-pointer border-subtle hover:border-accent/60'
                            )}
                          >
                            <span className="uecfi-text-pop-art px-1 text-[1.15rem] font-black">
                              Ag
                            </span>
                            <span className="text-[0.68rem] text-text-secondary">Pop Art</span>
                          </button>
                          <button
                            type="button"
                            disabled={selectedEl.animation === 'strokeDraw'}
                            title={
                              selectedEl.animation === 'strokeDraw'
                                ? 'Not compatible with Stroke Draw animation'
                                : undefined
                            }
                            onClick={() =>
                              updateSelectedEl({
                                textEffect:
                                  selectedEl.textEffect === 'retroStack' ? 'none' : 'retroStack',
                                ...(selectedEl.textEffect !== 'retroStack' &&
                                (!selectedEl.color || selectedEl.color === '#ffffff')
                                  ? { color: '#fcedd8' }
                                  : {})
                              })
                            }
                            className={cn(
                              'flex flex-col items-center gap-1 rounded-[10px] border bg-panel-elevated p-2 transition-colors',
                              selectedEl.animation === 'strokeDraw'
                                ? 'cursor-not-allowed opacity-40 border-subtle'
                                : selectedEl.textEffect === 'retroStack'
                                  ? 'cursor-pointer border-violet-500 ring-1 ring-violet-500'
                                  : 'cursor-pointer border-subtle hover:border-accent/60'
                            )}
                          >
                            <span className="uecfi-text-retro-stack px-1 text-[1.15rem] font-bold">
                              Ag
                            </span>
                            <span className="text-[0.68rem] text-text-secondary">Retro</span>
                          </button>
                          <button
                            type="button"
                            disabled={
                              selectedEl.animation === 'smokeDissolve' ||
                              selectedEl.animation === 'maskRise' ||
                              selectedEl.animation === 'powerOn' ||
                              selectedEl.animation === 'strokeDraw' ||
                              selectedEl.animation === 'squishy' ||
                              selectedEl.animation === 'ripple'
                            }
                            title={
                              selectedEl.animation === 'smokeDissolve' ||
                              selectedEl.animation === 'maskRise' ||
                              selectedEl.animation === 'powerOn' ||
                              selectedEl.animation === 'strokeDraw' ||
                              selectedEl.animation === 'squishy' ||
                              selectedEl.animation === 'ripple'
                                ? 'Not compatible with per-character/stroke animations'
                                : undefined
                            }
                            onClick={() =>
                              updateSelectedEl({
                                textEffect:
                                  selectedEl.textEffect === 'slideStripes' ? 'none' : 'slideStripes'
                              })
                            }
                            className={cn(
                              'flex flex-col items-center gap-1 rounded-[10px] border bg-panel-elevated p-2 transition-colors',
                              selectedEl.animation === 'smokeDissolve' ||
                                selectedEl.animation === 'maskRise' ||
                                selectedEl.animation === 'powerOn' ||
                                selectedEl.animation === 'strokeDraw' ||
                                selectedEl.animation === 'squishy' ||
                                selectedEl.animation === 'ripple'
                                ? 'cursor-not-allowed opacity-40 border-subtle'
                                : selectedEl.textEffect === 'slideStripes'
                                  ? 'cursor-pointer border-violet-500 ring-1 ring-violet-500'
                                  : 'cursor-pointer border-subtle hover:border-accent/60'
                            )}
                          >
                            <span className="uecfi-text-slide-stripes px-1 text-[1.15rem] font-black">
                              Ag
                            </span>
                            <span className="text-[0.68rem] text-text-secondary">Slide</span>
                          </button>
                          <button
                            type="button"
                            disabled={selectedEl.animation === 'strokeDraw'}
                            title={
                              selectedEl.animation === 'strokeDraw'
                                ? 'Not compatible with Stroke Draw animation'
                                : undefined
                            }
                            onClick={() =>
                              updateSelectedEl({
                                textEffect:
                                  selectedEl.textEffect === 'block3d' ? 'none' : 'block3d',
                                ...(selectedEl.textEffect !== 'block3d' &&
                                (!selectedEl.color || selectedEl.color === '#ffffff')
                                  ? { color: '#ece8da' }
                                  : {})
                              })
                            }
                            className={cn(
                              'flex flex-col items-center gap-1 rounded-[10px] border bg-panel-elevated p-2 transition-colors',
                              selectedEl.animation === 'strokeDraw'
                                ? 'cursor-not-allowed opacity-40 border-subtle'
                                : selectedEl.textEffect === 'block3d'
                                  ? 'cursor-pointer border-violet-500 ring-1 ring-violet-500'
                                  : 'cursor-pointer border-subtle hover:border-accent/60'
                            )}
                          >
                            <span className="uecfi-text-block-3d px-1 text-[1.15rem] font-bold">
                              Ag
                            </span>
                            <span className="text-[0.68rem] text-text-secondary">3D Block</span>
                          </button>
                          <button
                            type="button"
                            disabled={selectedEl.animation === 'strokeDraw'}
                            title={
                              selectedEl.animation === 'strokeDraw'
                                ? 'Not compatible with Stroke Draw animation'
                                : undefined
                            }
                            onClick={() =>
                              updateSelectedEl({
                                textEffect:
                                  selectedEl.textEffect === 'amazingPop' ? 'none' : 'amazingPop',
                                ...(selectedEl.textEffect !== 'amazingPop' &&
                                (!selectedEl.color || selectedEl.color === '#ffffff')
                                  ? { color: '#00ffff' }
                                  : {})
                              })
                            }
                            className={cn(
                              'flex flex-col items-center gap-1 rounded-[10px] border bg-panel-elevated p-2 transition-colors',
                              selectedEl.animation === 'strokeDraw'
                                ? 'cursor-not-allowed opacity-40 border-subtle'
                                : selectedEl.textEffect === 'amazingPop'
                                  ? 'cursor-pointer border-violet-500 ring-1 ring-violet-500'
                                  : 'cursor-pointer border-subtle hover:border-accent/60'
                            )}
                          >
                            <span
                              className="uecfi-text-amazing-pop px-1 text-[1.15rem] font-semibold"
                              style={{ ['--amazing-accent' as string]: '#00ffff' }}
                            >
                              Ag
                            </span>
                            <span className="text-[0.68rem] text-text-secondary">Color Pop</span>
                          </button>
                        </div>

                        {selectedEl.textEffect === 'shimmer' && (
                          <>
                            <label className={FIELD_LABEL_CLS}>
                              <span>
                                Particle Density ({Math.round((selectedEl.shimmerDensity ?? 1) * 100)}%)
                              </span>
                              <input
                                type="range"
                                min={0}
                                max={3}
                                step={0.2}
                                value={selectedEl.shimmerDensity ?? 1}
                                onChange={(e) =>
                                  updateSelectedEl({ shimmerDensity: Number(e.target.value) })
                                }
                                className="accent-violet-500"
                              />
                            </label>
                            <label className={FIELD_LABEL_CLS}>
                              <span>
                                Particle Glow ({Math.round((selectedEl.shimmerGlow ?? 1) * 100)}%)
                              </span>
                              <input
                                type="range"
                                min={0}
                                max={2}
                                step={0.1}
                                value={selectedEl.shimmerGlow ?? 1}
                                onChange={(e) =>
                                  updateSelectedEl({ shimmerGlow: Number(e.target.value) })
                                }
                                className="accent-violet-500"
                              />
                            </label>
                            <label className={FIELD_LABEL_CLS}>
                              <span>
                                Particle Size ({Math.round((selectedEl.shimmerParticleSize ?? 1) * 100)}%)
                              </span>
                              <input
                                type="range"
                                min={0.5}
                                max={3}
                                step={0.1}
                                value={selectedEl.shimmerParticleSize ?? 1}
                                onChange={(e) =>
                                  updateSelectedEl({ shimmerParticleSize: Number(e.target.value) })
                                }
                                className="accent-violet-500"
                              />
                            </label>
                          </>
                        )}

                        {Boolean(selectedEl.outlineWidth && selectedEl.outlineWidth > 0) && (
                          <label className={FIELD_LABEL_CLS}>
                            <span>Text Outline ({selectedEl.outlineWidth ?? 0}px)</span>
                            <div className="flex items-center gap-2">
                              <input
                                type="range"
                                min={0}
                                max={12}
                                step={1}
                                value={selectedEl.outlineWidth ?? 0}
                                onChange={(e) =>
                                  updateSelectedEl({ outlineWidth: Number(e.target.value) })
                                }
                                className="flex-1"
                              />
                              <input
                                type="color"
                                title="Outline Color"
                                value={selectedEl.outlineColor ?? '#000000'}
                                onChange={(e) =>
                                  updateSelectedEl({ outlineColor: e.target.value })
                                }
                                className="h-[22px] w-[26px] cursor-pointer rounded border border-subtle bg-transparent p-0"
                              />
                            </div>
                          </label>
                        )}

                        {Boolean(selectedEl.glowBlur && selectedEl.glowBlur > 0) && (
                          <label className={FIELD_LABEL_CLS}>
                            <span>Text Glow ({selectedEl.glowBlur ?? 0}px)</span>
                            <div className="flex items-center gap-2">
                              <input
                                type="range"
                                min={0}
                                max={60}
                                step={1}
                                value={selectedEl.glowBlur ?? 0}
                                onChange={(e) =>
                                  updateSelectedEl({ glowBlur: Number(e.target.value) })
                                }
                                className="flex-1"
                              />
                              <input
                                type="color"
                                title="Glow Color"
                                value={selectedEl.glowColor ?? '#38bdf8'}
                                onChange={(e) =>
                                  updateSelectedEl({ glowColor: e.target.value })
                                }
                                className="h-[22px] w-[26px] cursor-pointer rounded border border-subtle bg-transparent p-0"
                              />
                            </div>
                          </label>
                        )}

                        {Boolean(selectedEl.textShadowEnabled) && (() => {
                          const shadowDir = selectedEl.textShadowDirection ?? 45;
                          const shadowOffset = selectedEl.textShadowOffset ?? 25;
                          const shadowBlur = selectedEl.textShadowBlur ?? 25;
                          const shadowTransparency = Math.round(
                            (1 - (selectedEl.textShadowOpacity ?? 0.55)) * 100
                          );
                          const renderStepperRow = (
                            label: string,
                            value: number,
                            min: number,
                            max: number,
                            onChange: (next: number) => void
                          ) => (
                            <div className="flex flex-col gap-1.5">
                              <span className="text-[0.76rem] font-medium text-text-primary">
                                {label}
                              </span>
                              <div className="flex items-center gap-2.5">
                                <input
                                  type="range"
                                  min={min}
                                  max={max}
                                  step={1}
                                  value={value}
                                  onChange={(e) => onChange(Number(e.target.value))}
                                  className="flex-1 accent-violet-500"
                                />
                                <div className="inline-flex h-8 items-center rounded-lg border border-subtle bg-panel px-1.5">
                                  <button
                                    type="button"
                                    onClick={() => onChange(Math.max(min, value - 1))}
                                    className="flex h-6 w-5 cursor-pointer items-center justify-center border-0 bg-transparent text-[0.9rem] text-text-secondary hover:text-text-primary"
                                  >
                                    −
                                  </button>
                                  <span className="w-8 text-center text-[0.76rem] font-semibold tabular-nums text-text-primary">
                                    {value}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => onChange(Math.min(max, value + 1))}
                                    className="flex h-6 w-5 cursor-pointer items-center justify-center border-0 bg-transparent text-[0.9rem] text-text-secondary hover:text-text-primary"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            </div>
                          );

                          return (
                            <div className="flex flex-col gap-3 border-t border-subtle pt-3">
                              {renderStepperRow('Direction', shadowDir, -180, 180, (next) =>
                                updateSelectedEl({ textShadowDirection: next })
                              )}
                              {renderStepperRow('Offset', shadowOffset, 0, 100, (next) =>
                                updateSelectedEl({ textShadowOffset: next })
                              )}
                              {renderStepperRow('Blur', shadowBlur, 0, 100, (next) =>
                                updateSelectedEl({ textShadowBlur: next })
                              )}
                              {renderStepperRow(
                                'Transparency',
                                shadowTransparency,
                                0,
                                100,
                                (next) =>
                                  updateSelectedEl({
                                    textShadowOpacity: Number((1 - next / 100).toFixed(2))
                                  })
                              )}
                              <div className="flex items-center justify-between pt-0.5">
                                <span className="text-[0.78rem] font-medium text-text-primary">
                                  Color
                                </span>
                                <input
                                  type="color"
                                  title="Drop Shadow Color"
                                  value={selectedEl.textShadowColor ?? '#000000'}
                                  onChange={(e) =>
                                    updateSelectedEl({
                                      textShadowEnabled: true,
                                      textShadowColor: e.target.value
                                    })
                                  }
                                  className="h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-subtle bg-transparent p-0"
                                />
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                )}

                {activeRailTab === 'color' && colorTarget && (() => {
                  const docColors = Array.from(
                    new Set(
                      [
                        activeSlideBg,
                        ...elements.flatMap((el) => [
                          el.color,
                          el.backgroundColor,
                          el.outlineColor,
                          el.glowColor
                        ])
                      ].filter((c): c is string => Boolean(c && /^#[0-9a-fA-F]{6}$/.test(c)))
                    )
                  );
                  const currentColor =
                    colorTarget.kind === 'textColor'
                      ? selectedEl?.color ?? '#ffffff'
                      : colorTarget.kind === 'shapeFill'
                        ? selectedEl?.kind === 'line'
                          ? selectedEl?.color ?? selectedEl?.backgroundColor ?? lastShapeColor
                          : selectedEl?.backgroundColor ?? lastShapeColor
                        : colorTarget.kind === 'outlineColor'
                          ? selectedEl?.outlineColor ?? '#000000'
                          : colorTarget.kind === 'glowColor'
                            ? selectedEl?.glowColor ?? '#38bdf8'
                            : colorTarget.kind === 'shadowColor'
                              ? selectedEl?.textShadowColor ?? '#000000'
                              : activeSlideBg;
                  return (
                    <CanvasColorDrawer
                      title={colorTarget.label}
                      currentColor={currentColor}
                      allowGradients={
                        colorTarget.kind === 'background' ||
                        colorTarget.kind === 'textColor' ||
                        (colorTarget.kind === 'shapeFill' && selectedEl?.kind !== 'line')
                      }
                      documentColors={docColors}
                      onSelectColor={(nextColor) => {
                        if (colorTarget.kind === 'textColor') {
                          updateSelectedEl({ color: nextColor });
                        } else if (colorTarget.kind === 'shapeFill') {
                          setLastShapeColor(nextColor);
                          try {
                            localStorage.setItem('uecfi_last_shape_color_v1', nextColor);
                          } catch {
                            // Ignore
                          }
                          updateSelectedEl(
                            selectedEl?.kind === 'line'
                              ? { color: nextColor, backgroundColor: nextColor }
                              : { backgroundColor: nextColor }
                          );
                        } else if (colorTarget.kind === 'outlineColor') {
                          updateSelectedEl({ outlineColor: nextColor });
                        } else if (colorTarget.kind === 'glowColor') {
                          updateSelectedEl({ glowColor: nextColor });
                        } else if (colorTarget.kind === 'shadowColor') {
                          updateSelectedEl({ textShadowEnabled: true, textShadowColor: nextColor });
                        } else if (colorTarget.kind === 'background') {
                          if (activeSlide?.background !== undefined) {
                            const nextSlides = slides.map((s, idx) =>
                              idx === activeSlideIdx ? { ...s, background: nextColor } : s
                            );
                            setSlides(nextSlides);
                            pushHistory(nextSlides, themeBackground);
                          } else {
                            setThemeBackground(nextColor);
                            pushHistory(slides, nextColor);
                          }
                        }
                      }}
                      onClose={() => setActiveRailTab(null)}
                    />
                  );
                })()}

                {activeRailTab === 'uploads' && (
                  <>
                    <button
                      type="button"
                      onClick={() => imgFileRef.current?.click()}
                      className="flex w-full cursor-pointer items-center justify-center gap-[7px] rounded-[10px] border-0 bg-violet-600 p-3 text-[0.84rem] font-bold text-white transition-colors hover:bg-violet-500"
                    >
                      <Upload size={15} /> Upload Image File
                    </button>
                    <button
                      type="button"
                      onClick={() => glbFileRef.current?.click()}
                      className={cn(BTN_CLS, 'w-full border-violet-400/45 p-2.5 text-violet-200 hover:bg-hover')}
                      title="Import a binary glTF (.glb) 3D model"
                    >
                      <Box size={14} /> Upload 3D Model (.glb)
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveRailTab('elements')}
                      className={cn(BTN_CLS, 'w-full p-2.5 hover:bg-hover')}
                    >
                      <ImageIcon size={14} /> Browse Elements &amp; Photos
                    </button>
                    <div className="mt-1 flex items-center justify-between">
                      <span className={SECTION_TITLE_CLS}>
                        Your Uploads ({uploadedImages.length})
                      </span>
                    </div>
                    {uploadedImages.length === 0 ? (
                      <p className="m-0 text-[0.72rem] leading-[1.45] text-text-muted">
                        Uploaded and stock images are stored locally so your presentation stays 100% offline-ready.
                      </p>
                    ) : (
                      <div className="columns-2 gap-2">
                        {uploadedImages.map((item) => (
                          <div
                            key={item.fileName}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('application/x-uecfi-uploaded-image', item.url);
                            }}
                            onClick={() => addImageUrlToSlide(item.url, 'Uploaded Image')}
                            title="Click to add to slide, or drag onto a Frame"
                            className="relative mb-2 cursor-pointer break-inside-avoid overflow-hidden rounded-lg border border-subtle bg-panel-elevated"
                          >
                            <img
                              src={item.url}
                              alt=""
                              loading="lazy"
                              className="block h-auto w-full"
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
                              className="absolute top-1 right-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border-0 bg-slate-900/78 text-slate-50 opacity-85 hover:opacity-100"
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
                    <span className={SECTION_TITLE_CLS}>Slide {activeSlideIdx + 1} Background</span>
                    <div className="grid grid-cols-4 gap-2">
                      {THEME_PRESETS.map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          title={preset.name}
                          onClick={() => updateActiveSlideBackground(preset.value)}
                          className={cn(
                            'aspect-[16/10] cursor-pointer rounded-lg',
                            activeSlideBg === preset.value
                              ? 'border-2 border-violet-400'
                              : 'border border-subtle'
                          )}
                          style={{ background: preset.value }}
                        />
                      ))}
                    </div>
                    <label className={FIELD_LABEL_CLS}>
                      <span>Solid Color</span>
                      <input
                        type="color"
                        value={activeSlideBg.startsWith('#') ? activeSlideBg : '#0f172a'}
                        onChange={(e) => updateActiveSlideBackground(e.target.value)}
                        className="h-[34px] w-full cursor-pointer rounded-lg border border-subtle bg-transparent"
                      />
                    </label>
                    <div className="flex flex-col gap-1.5">
                      <span className={SECTION_TITLE_CLS}>Custom Background Image</span>
                      <BackgroundImagePicker
                        value={activeSlideBg}
                        onSelect={updateActiveSlideBackground}
                      />
                    </div>
                  </>
                )}

                {activeRailTab === 'templates' && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className={SECTION_TITLE_CLS}>Community Templates</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void loadCommunityTemplates()}
                          disabled={templatesLoading}
                          title="Refresh templates"
                          className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-subtle bg-white/5 px-2 py-1 text-[0.7rem] text-slate-300 hover:bg-white/10 disabled:opacity-50"
                        >
                          <RefreshCw size={12} className={templatesLoading ? 'animate-spin' : ''} />
                          Refresh
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSubmitFormOpen((v) => !v);
                            setSubmitFeedback(null);
                            if (!submitTitle.trim() && title.trim()) {
                              setSubmitTitle(title.trim());
                            }
                          }}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-md border-0 bg-violet-600 px-2 py-1 text-[0.7rem] font-semibold text-white hover:bg-violet-500"
                        >
                          <Send size={11} />
                          Submit
                        </button>
                      </div>
                    </div>

                    {submitFormOpen && (
                      <div className="flex flex-col gap-2 rounded-lg border border-violet-500/40 bg-violet-950/25 p-2.5">
                        <div className="text-[0.74rem] font-semibold text-violet-200">
                          Share Current Slide as Template
                        </div>
                        <input
                          type="text"
                          value={submitTitle}
                          onChange={(e) => setSubmitTitle(e.target.value)}
                          placeholder="Template title (e.g. Easter Welcome)"
                          maxLength={80}
                          className="rounded-md border border-subtle bg-slate-950 px-2.5 py-1.5 text-[0.76rem] text-slate-100 outline-none focus:border-violet-400"
                        />
                        <select
                          value={submitCategory}
                          onChange={(e) => setSubmitCategory(e.target.value as TemplateCategory | '')}
                          className={cn(
                            'rounded-md border border-subtle bg-slate-950 px-2.5 py-1.5 text-[0.74rem] outline-none focus:border-violet-400',
                            submitCategory ? 'text-slate-100' : 'text-slate-400'
                          )}
                        >
                          <option value="" disabled>
                            Select category...
                          </option>
                          {(['General', 'Worship', 'Tema', 'Logo', 'Announcement', 'Youth', 'Event'] as const).map(
                            (cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            )
                          )}
                        </select>
                        <div className="grid grid-cols-2 gap-1.5">
                          <input
                            type="text"
                            value={submitAuthorName}
                            onChange={(e) => setSubmitAuthorName(e.target.value)}
                            placeholder="Your name"
                            maxLength={40}
                            className="rounded-md border border-subtle bg-slate-950 px-2.5 py-1.5 text-[0.74rem] text-slate-100 outline-none focus:border-violet-400"
                          />
                          <input
                            type="text"
                            value={submitAuthorCentro}
                            onChange={(e) => setSubmitAuthorCentro(e.target.value)}
                            placeholder="Centro"
                            maxLength={40}
                            className="rounded-md border border-subtle bg-slate-950 px-2.5 py-1.5 text-[0.74rem] text-slate-100 outline-none focus:border-violet-400"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSubmitFormOpen(false)}
                            className="cursor-pointer rounded-md border border-subtle bg-transparent px-2.5 py-1 text-[0.72rem] text-slate-300 hover:bg-white/5"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={submitBusy}
                            onClick={async () => {
                              if (!submitTitle.trim()) {
                                setSubmitFeedback({ kind: 'err', text: 'Please enter a template title.' });
                                return;
                              }
                              if (!submitCategory) {
                                setSubmitFeedback({ kind: 'err', text: 'Please select a category.' });
                                return;
                              }
                              setSubmitBusy(true);
                              setSubmitFeedback(null);
                              try {
                                const clonedElements = JSON.parse(JSON.stringify(elements)) as CanvasElement[];
                                const isGradient =
                                  activeSlideBg.includes('gradient(') || activeSlideBg.includes('url(');
                                const slidePayload = {
                                  backgroundColor: isGradient ? undefined : activeSlideBg,
                                  backgroundGradient: isGradient ? activeSlideBg : undefined,
                                  canvasElements: clonedElements
                                };
                                // Capture a real screenshot of the live stage (hiding selection handles & dashed boxes briefly)
                                let thumbnailDataUrl: string | undefined;
                                if (stageRef.current && window.presenterAPI?.captureStageThumbnail) {
                                  const prevSelectedIds = selectedElIds;
                                  const prevBgSelected = backgroundSelected;
                                  setCapturingThumbnail(true);
                                  if (prevSelectedIds.length > 0) setSelectedElIds([]);
                                  if (prevBgSelected) setBackgroundSelected(false);
                                  await new Promise<void>((resolve) =>
                                    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
                                  );
                                  try {
                                    const rect = stageRef.current.getBoundingClientRect();
                                    const captured = await window.presenterAPI.captureStageThumbnail({
                                      x: rect.left,
                                      y: rect.top,
                                      width: rect.width,
                                      height: rect.height
                                    });
                                    if (captured) thumbnailDataUrl = captured;
                                  } finally {
                                    setCapturingThumbnail(false);
                                    if (prevSelectedIds.length > 0) setSelectedElIds(prevSelectedIds);
                                    if (prevBgSelected) setBackgroundSelected(true);
                                  }
                                }
                                if (!thumbnailDataUrl) {
                                  thumbnailDataUrl = generateSlideThumbnailDataUrl(slidePayload);
                                }
                                // Upload thumbnail & all slide assets into a single folder per template in R2
                                const templateId = createTemplateId();
                                let thumbnailUrl: string | undefined;
                                if (thumbnailDataUrl) {
                                  try {
                                    const thumbBlob = await (await fetch(thumbnailDataUrl)).blob();
                                    thumbnailUrl = await uploadTemplateAsset(
                                      signalingRelayUrl,
                                      'thumbnail.jpg',
                                      thumbBlob,
                                      thumbBlob.type || 'image/jpeg',
                                      templateId
                                    );
                                  } catch {
                                    // Fall back to inline data URL if thumbnail upload fails
                                  }
                                }
                                const rewrittenSlide = await uploadSlideAssetsAndRewrite(
                                  signalingRelayUrl,
                                  slidePayload,
                                  templateId
                                );
                                const cleanName = submitAuthorName.trim();
                                const cleanCentro = submitAuthorCentro.trim();
                                try {
                                  localStorage.setItem('uecfi_template_author_name', cleanName);
                                  localStorage.setItem('uecfi_template_author_centro', cleanCentro);
                                } catch {
                                  // Ignore storage errors
                                }
                                const combinedAuthor =
                                  cleanName && cleanCentro
                                    ? `${cleanName} (${cleanCentro})`
                                    : cleanName || cleanCentro || 'Community';
                                await submitCommunityTemplate(signalingRelayUrl, {
                                  id: templateId,
                                  title: submitTitle.trim(),
                                  category: submitCategory,
                                  author: combinedAuthor,
                                  ...(thumbnailUrl ? { thumbnailUrl } : { thumbnailDataUrl }),
                                  slide: rewrittenSlide
                                });
                                setSubmitFeedback({
                                  kind: 'ok',
                                  text: 'Submitted! Your template is pending admin approval.'
                                });
                                setSubmitTitle('');
                                setSubmitCategory('');
                                setSubmitFormOpen(false);
                              } catch (err) {
                                setSubmitFeedback({
                                  kind: 'err',
                                  text: err instanceof Error ? err.message : 'Failed to submit template'
                                });
                              } finally {
                                setSubmitBusy(false);
                              }
                            }}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-md border-0 bg-violet-600 px-3 py-1 text-[0.72rem] font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                          >
                            {submitBusy ? 'Submitting...' : 'Submit for Review'}
                          </button>
                        </div>
                      </div>
                    )}

                    {submitFeedback && (
                      <div
                        className={cn(
                          'flex items-start gap-1.5 rounded-lg border px-2.5 py-2 text-[0.74rem]',
                          submitFeedback.kind === 'ok'
                            ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200'
                            : 'border-rose-500/40 bg-rose-950/30 text-rose-200'
                        )}
                      >
                        {submitFeedback.kind === 'ok' && <CheckCircle2 size={14} className="mt-0.5 shrink-0" />}
                        <span>{submitFeedback.text}</span>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1">
                      {(['All', 'Worship', 'Tema', 'Logo', 'Announcement', 'Youth', 'Event', 'General'] as const).map(
                        (cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setTemplateCategoryFilter(cat)}
                            className={cn(
                              'cursor-pointer rounded-full border px-2 py-0.5 text-[0.68rem] transition-colors',
                              templateCategoryFilter === cat
                                ? 'border-violet-400 bg-violet-600/30 font-semibold text-violet-100'
                                : 'border-subtle bg-white/5 text-slate-300 hover:bg-white/10'
                            )}
                          >
                            {cat}
                          </button>
                        )
                      )}
                    </div>

                    {templatesError && (
                      <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-2.5 py-2 text-[0.74rem] text-rose-200">
                        {templatesError}
                      </div>
                    )}

                    {templatesLoading ? (
                      <div className="py-6 text-center text-[0.76rem] text-text-muted">
                        Loading community templates...
                      </div>
                    ) : (
                      (() => {
                        const filtered = communityTemplates.filter(
                          (tpl) =>
                            templateCategoryFilter === 'All' || tpl.category === templateCategoryFilter
                        );
                        if (filtered.length === 0) {
                          return (
                            <div className="rounded-lg border border-dashed border-subtle px-3 py-6 text-center text-[0.76rem] text-text-muted">
                              No approved templates in this category yet. Click <strong>Submit</strong> above to share yours!
                            </div>
                          );
                        }
                        return (
                          <div className="grid grid-cols-1 gap-2.5">
                            {filtered.map((tpl) => (
                              <button
                                key={tpl.id}
                                type="button"
                                onClick={async () => {
                                  let restoredSlide = await downloadTemplateAssetsAndRewrite(
                                    signalingRelayUrl,
                                    tpl.slide
                                  );
                                  if (tpl.mediaAssets) {
                                    restoredSlide = await restoreBundledMediaOnImport(
                                      restoredSlide,
                                      tpl.mediaAssets
                                    );
                                  }
                                  const nextBg =
                                    restoredSlide.backgroundGradient ||
                                    restoredSlide.backgroundColor ||
                                    activeSlideBg;
                                  const cloned = (
                                    JSON.parse(JSON.stringify(restoredSlide.canvasElements || [])) as CanvasElement[]
                                  ).map((el, idx) => ({
                                    ...el,
                                    id: `tpl-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`
                                  }));
                                  const nextSlides = slidesRef.current.map((s, idx) =>
                                    idx === activeSlideIdx
                                      ? { ...s, background: nextBg, canvasElements: cloned }
                                      : s
                                  );
                                  setSlides(nextSlides);
                                  setSelectedElIds([]);
                                  setBackgroundSelected(false);
                                  pushHistory(nextSlides, bgRef.current);
                                }}
                                className="group flex cursor-pointer flex-col overflow-hidden rounded-lg border border-subtle bg-slate-950/70 text-left transition-colors hover:border-violet-400"
                              >
                                <div className="relative aspect-video w-full overflow-hidden bg-slate-900">
                                  {(tpl.thumbnailUrl || tpl.thumbnailDataUrl) ? (
                                    <img
                                      src={
                                        resolveTemplateAssetUrl(signalingRelayUrl, tpl.thumbnailUrl) ||
                                        tpl.thumbnailDataUrl
                                      }
                                      alt={tpl.title}
                                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                                    />
                                  ) : (
                                    <div
                                      className="flex h-full w-full items-center justify-center text-[0.72rem] text-slate-300"
                                      style={{
                                        background:
                                          tpl.slide.backgroundGradient ||
                                          tpl.slide.backgroundColor ||
                                          '#1e293b'
                                      }}
                                    >
                                      {tpl.title}
                                    </div>
                                  )}
                                  <span className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[0.62rem] font-semibold text-slate-200">
                                    {tpl.category}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                                  <span className="truncate text-[0.75rem] font-semibold text-slate-100">
                                    {tpl.title}
                                  </span>
                                  <span className="shrink-0 text-[0.66rem] text-slate-400">
                                    by {tpl.author || 'Community'}
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        );
                      })()
                    )}
                  </div>
                )}

                {activeRailTab === 'layers' && (
                  <div className="flex flex-col gap-1.5">
                    <span className={SECTION_TITLE_CLS}>Layers ({elements.length}) — Drag to Reorder</span>
                    {elements.length === 0 ? (
                      <div className="text-[0.78rem] text-text-muted">
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
                              className={cn(
                                'flex items-center gap-1 rounded-lg border px-2 py-1.5',
                                isSel
                                  ? 'border-violet-500 bg-violet-500/18'
                                  : 'border-subtle bg-panel-elevated'
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => setSelectedElIds(expandWithGroupIds([el.id], elements))}
                                className="min-w-0 flex-1 cursor-pointer truncate border-0 bg-transparent p-0 text-left text-[0.75rem] text-text-primary"
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
                                className={cn(BTN_CLS, 'p-[3px] hover:bg-hover')}
                              >
                                <Copy size={11} />
                              </button>
                              <button
                                type="button"
                                disabled={visualIdx === 0}
                                onClick={() => moveElementLayer(el.id, 1)}
                                title="Move Forward"
                                className={cn(BTN_CLS, 'p-[3px] hover:bg-hover', visualIdx === 0 && 'opacity-35')}
                              >
                                <ArrowUp size={11} />
                              </button>
                              <button
                                type="button"
                                disabled={visualIdx === arr.length - 1}
                                onClick={() => moveElementLayer(el.id, -1)}
                                title="Move Backward"
                                className={cn(
                                  BTN_CLS,
                                  'p-[3px]',
                                  visualIdx === arr.length - 1 && 'opacity-35'
                                )}
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
          <div className="relative flex min-w-0 flex-1 flex-col">
            {/* Reserved Single-Row Slot for Dynamic Formatting Toolbar (keeps canvas size steady) */}
            <div className="relative z-[60] flex h-[48px] shrink-0 items-end justify-center bg-[#070a11] px-3 pb-0">
              {(selectedElements.length > 0 ||
                (studioMode && selectedStudioBox) ||
                backgroundSelected) && (
                <div
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="canvas-light-toolbar relative flex max-w-full flex-nowrap items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200/90 bg-white px-2.5 py-1 text-slate-900 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
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
                      <span className="text-[0.78rem] font-bold text-[#ddd6fe]">
                        {selectedElements.length} selected
                      </span>
                      <div className="h-[18px] w-px bg-subtle" />
                      {!isAlreadySingleGroup && (
                        <button type="button" onClick={handleGroupSelected} className={BTN_CLS}>
                          Group
                        </button>
                      )}
                      {hasAnyGroup && (
                        <button type="button" onClick={handleUngroupSelected} className={BTN_CLS}>
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
                        className={BTN_CLS}
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
                        className={cn(BTN_CLS, 'border-[#7f1d1d] text-[#fca5a5]')}
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </>
                  );
                })()
              ) : selectedEl ? (
                <>
                  {/* TEXT CONTEXTUAL CONTROLS */}
                  {selectedEl.kind === 'text' && (
                    <>
                      {(() => {
                        const currentFontVal = selectedEl.fontFamily ?? FONT_CATALOG[0].value;
                        const currentFamily = extractPrimaryFontFamily(currentFontVal);
                        const currentFont =
                          FONT_CATALOG.find(
                            (f) => f.value === currentFontVal || f.family === currentFamily
                          ) ?? { label: currentFamily, value: currentFontVal };
                        return (
                          <button
                            type="button"
                            aria-label="Font family"
                            aria-expanded={activeRailTab === 'fonts'}
                            onClick={() => {
                              setActivePopover(null);
                              setActiveRailTab((prev) => (prev === 'fonts' ? null : 'fonts'));
                            }}
                            className={cn(
                              BTN_CLS,
                              'w-[138px] justify-between px-2.5 py-1 text-[0.78rem]',
                              activeRailTab === 'fonts' && 'border-violet-400 bg-violet-50'
                            )}
                          >
                            <span
                              className="truncate"
                              style={{ fontFamily: currentFont.value }}
                            >
                              {currentFont.label}
                            </span>
                            <ChevronDown size={13} className="shrink-0 text-slate-500" />
                          </button>
                        );
                      })()}

                      {/* Canva-style − [Size] + pill stepper */}
                      <div className="inline-flex h-[28px] items-center rounded-lg border border-slate-300 bg-white px-0.5">
                        <button
                          type="button"
                          aria-label="Decrease font size"
                          onClick={() =>
                            updateSelectedEl({ fontSize: Math.max(8, (selectedEl.fontSize ?? 56) - 1) })
                          }
                          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[0.9rem] font-medium text-slate-700 transition-colors hover:bg-slate-100"
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
                          className="h-6 w-9 border-0 bg-transparent text-center text-[0.78rem] font-medium tabular-nums text-slate-900 [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                        <button
                          type="button"
                          aria-label="Increase font size"
                          onClick={() =>
                            updateSelectedEl({ fontSize: Math.min(700, (selectedEl.fontSize ?? 56) + 1) })
                          }
                          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[0.9rem] font-medium text-slate-700 transition-colors hover:bg-slate-100"
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        title="Text Color"
                        aria-label="Text color"
                        onClick={() => openColorDrawer({ kind: 'textColor', label: 'Text color' })}
                        className="h-7 w-7 cursor-pointer rounded-[6px] border border-slate-300 p-0 shadow-inner transition-transform hover:scale-105"
                        style={{ background: selectedEl.color ?? '#ffffff' }}
                      />

                      <div className="h-[18px] w-px bg-subtle" />

                      <button
                        type="button"
                        title="Bold"
                        onClick={() =>
                          updateSelectedEl({
                            fontWeight: (selectedEl.fontWeight ?? '700') === '400' ? '700' : '400'
                          })
                        }
                        className={cn(
                          BTN_CLS,
                          'px-2 py-1 font-extrabold',
                          (selectedEl.fontWeight ?? '700') !== '400'
                            ? 'bg-[rgba(124,58,237,0.3)]'
                            : 'bg-transparent'
                        )}
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
                        className={cn(
                          BTN_CLS,
                          'px-[7px] py-[5px]',
                          selectedEl.fontStyle === 'italic'
                            ? 'bg-[rgba(124,58,237,0.3)]'
                            : 'bg-transparent'
                        )}
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
                        className={cn(
                          BTN_CLS,
                          'px-[7px] py-[5px]',
                          selectedEl.textDecoration === 'underline'
                            ? 'bg-[rgba(124,58,237,0.3)]'
                            : 'bg-transparent'
                        )}
                      >
                        <Underline size={13} />
                      </button>
                      <button
                        type="button"
                        title="Uppercase (aA)"
                        aria-label="Toggle uppercase"
                        onClick={() =>
                          updateSelectedEl({
                            textTransform:
                              selectedEl.textTransform === 'uppercase' ? 'none' : 'uppercase'
                          })
                        }
                        className={cn(
                          BTN_CLS,
                          'px-[7px] py-[5px] text-[12px] font-bold',
                          selectedEl.textTransform === 'uppercase'
                            ? 'bg-[rgba(124,58,237,0.3)]'
                            : 'bg-transparent'
                        )}
                      >
                        aA
                      </button>
                      <button
                        type="button"
                        title={
                          selectedEl.listStyle === 'bullet'
                            ? 'List: Bullets (click for numbered)'
                            : selectedEl.listStyle === 'number'
                              ? 'List: Numbered (click for none)'
                              : 'List (bullets / numbered)'
                        }
                        aria-label="Toggle list"
                        onClick={() => {
                          const cur = selectedEl.listStyle ?? 'none';
                          const next =
                            cur === 'none' ? 'bullet' : cur === 'bullet' ? 'number' : 'none';
                          updateSelectedEl({ listStyle: next });
                        }}
                        className={cn(
                          BTN_CLS,
                          'px-[7px] py-[5px]',
                          selectedEl.listStyle && selectedEl.listStyle !== 'none'
                            ? 'bg-[rgba(124,58,237,0.3)]'
                            : 'bg-transparent'
                        )}
                      >
                        {selectedEl.listStyle === 'number' ? (
                          <ListOrdered size={14} />
                        ) : (
                          <List size={14} />
                        )}
                      </button>

                      <div className="h-[18px] w-px bg-subtle" />

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
                          className={cn(
                            BTN_CLS,
                            'px-1.5 py-[5px]',
                            (selectedEl.textAlign ?? 'center') === a.align
                              ? 'bg-[rgba(124,58,237,0.3)]'
                              : 'bg-transparent'
                          )}
                        >
                          {a.icon}
                        </button>
                      ))}

                      <div className="relative flex items-center">
                        <button
                          type="button"
                          title="Advanced settings (spacing & text position)"
                          aria-label="Advanced settings"
                          onClick={() =>
                            setActivePopover((prev) => (prev === 'effects' ? null : 'effects'))
                          }
                          className={cn(
                            BTN_CLS,
                            'px-[7px] py-[5px]',
                            activePopover === 'effects'
                              ? 'bg-[rgba(124,58,237,0.3)]'
                              : 'bg-transparent'
                          )}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 18 18"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M5 3.5H13" />
                            <path d="M5 3.5V4.8" />
                            <path d="M13 3.5V4.8" />
                            <path d="M9 3.5V10.5" />
                            <path d="M7.2 10.5H10.8" />
                            <path d="M3 14.5H15" />
                            <path d="M5.2 12.5L3 14.5L5.2 16.5" />
                            <path d="M12.8 12.5L15 14.5L12.8 16.5" />
                          </svg>
                        </button>
                        {activePopover === 'effects' && (
                          <div className="absolute left-1/2 top-full z-50 mt-1.5 flex w-[270px] -translate-x-1/2 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 text-slate-900 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                            <div className="flex items-center justify-between">
                              <span className={SECTION_TITLE_CLS}>Advanced settings</span>
                              <button
                                type="button"
                                onClick={() => setActivePopover(null)}
                                className="cursor-pointer border-0 bg-transparent text-text-muted"
                              >
                                <X size={14} />
                              </button>
                            </div>
                            <label className={FIELD_LABEL_CLS}>
                              <span>Letter spacing ({(selectedEl.letterSpacing ?? 0).toFixed(2)}em)</span>
                              <input
                                type="range"
                                min={-0.05}
                                max={0.3}
                                step={0.01}
                                value={selectedEl.letterSpacing ?? 0}
                                onChange={(e) =>
                                  updateSelectedEl({ letterSpacing: Number(e.target.value) })
                                }
                              />
                            </label>
                            <label className={FIELD_LABEL_CLS}>
                              <span>Line spacing ({(selectedEl.lineHeight ?? 1.22).toFixed(2)})</span>
                              <input
                                type="range"
                                min={0.9}
                                max={2.2}
                                step={0.05}
                                value={selectedEl.lineHeight ?? 1.22}
                                onChange={(e) =>
                                  updateSelectedEl({ lineHeight: Number(e.target.value) })
                                }
                              />
                            </label>
                            <label className={FIELD_LABEL_CLS}>
                              <span>Font size ({selectedEl.fontSize ?? 56}px)</span>
                              <input
                                type="range"
                                min={12}
                                max={700}
                                step={1}
                                value={selectedEl.fontSize ?? 56}
                                onChange={(e) =>
                                  updateSelectedEl({ fontSize: Number(e.target.value) })
                                }
                              />
                            </label>
                            <div className="flex flex-col gap-1.5 border-t border-slate-200 pt-2">
                              <span className="text-[0.76rem] font-semibold text-slate-800">
                                Text position
                              </span>
                              <div className="grid grid-cols-3 rounded-xl bg-slate-100 p-1">
                                {(
                                  [
                                    { id: 'normal', label: 'A2', title: 'Normal' },
                                    { id: 'superscript', label: 'A²', title: 'Superscript' },
                                    { id: 'subscript', label: 'A₂', title: 'Subscript' }
                                  ] as const
                                ).map((pos) => {
                                  const active = (selectedEl.textPosition ?? 'normal') === pos.id;
                                  return (
                                    <button
                                      key={pos.id}
                                      type="button"
                                      title={pos.title}
                                      onClick={() => updateSelectedEl({ textPosition: pos.id })}
                                      className={cn(
                                        'cursor-pointer rounded-lg border-0 py-1.5 text-[0.82rem] font-semibold transition-all',
                                        active
                                          ? 'bg-white text-slate-900 shadow-sm'
                                          : 'bg-transparent text-slate-500 hover:text-slate-800'
                                      )}
                                    >
                                      {pos.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        title="Text Effects"
                        onClick={() => {
                          setActivePopover(null);
                          setActiveRailTab((prev) => (prev === 'effects' ? null : 'effects'));
                        }}
                        className={cn(
                          BTN_CLS,
                          'px-[9px] py-[5px]',
                          activeRailTab === 'effects'
                            ? 'bg-[rgba(124,58,237,0.3)]'
                            : 'bg-transparent'
                        )}
                      >
                        Effects
                      </button>
                    </>
                  )}

                  {/* RESPONSIVE LINE CONTEXTUAL CONTROLS */}
                  {selectedEl.kind === 'line' && (
                    <>
                      <button
                        type="button"
                        title="Line Color"
                        aria-label="Line color"
                        onClick={() => openColorDrawer({ kind: 'shapeFill', label: 'Line color' })}
                        className="h-7 w-7 cursor-pointer rounded-[6px] border border-slate-300 p-0 shadow-inner transition-transform hover:scale-105"
                        style={{
                          background: selectedEl.color || selectedEl.backgroundColor || lastShapeColor
                        }}
                      />
                      <button
                        type="button"
                        title="Line style & stroke weight"
                        aria-label="Line style and stroke weight"
                        onClick={() =>
                          setActivePopover((prev) => (prev === 'lineStyle' ? null : 'lineStyle'))
                        }
                        className={cn(
                          BTN_CLS,
                          'px-2 py-1',
                          activePopover === 'lineStyle'
                            ? 'bg-[rgba(124,58,237,0.22)] text-violet-700'
                            : 'bg-transparent'
                        )}
                      >
                        <svg width="15" height="14" viewBox="0 0 16 14" fill="currentColor">
                          <rect x="1" y="1" width="14" height="1.5" rx="0.75" />
                          <rect x="1" y="5" width="14" height="2.5" rx="1" />
                          <rect x="1" y="10" width="14" height="3.5" rx="1" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        title="Start point style"
                        aria-label="Start point style"
                        onClick={() =>
                          setActivePopover((prev) =>
                            prev === 'lineStartCap' ? null : 'lineStartCap'
                          )
                        }
                        className={cn(
                          BTN_CLS,
                          'px-2 py-1',
                          activePopover === 'lineStartCap'
                            ? 'bg-[rgba(124,58,237,0.22)] text-violet-700'
                            : 'bg-transparent'
                        )}
                      >
                        <ArrowLeft size={14} />
                      </button>
                      <button
                        type="button"
                        title="Swap start & end styles"
                        aria-label="Swap start and end styles"
                        onClick={() => {
                          const startCap = selectedEl.lineStartCap ?? 'none';
                          const endCap = selectedEl.lineEndCap ?? 'none';
                          if (startCap !== endCap) {
                            updateSelectedEl({ lineStartCap: endCap, lineEndCap: startCap });
                          } else {
                            const { x1, y1, x2, y2 } = getLineEndpoints(selectedEl);
                            updateSelectedEl({ lineX1: x2, lineY1: y2, lineX2: x1, lineY2: y1 });
                          }
                        }}
                        className={cn(BTN_CLS, 'px-1.5 py-1 bg-transparent text-slate-600')}
                      >
                        <span className="text-[11px] font-bold tracking-tight">&lt;&gt;</span>
                      </button>
                      <button
                        type="button"
                        title="End point style"
                        aria-label="End point style"
                        onClick={() =>
                          setActivePopover((prev) => (prev === 'lineEndCap' ? null : 'lineEndCap'))
                        }
                        className={cn(
                          BTN_CLS,
                          'px-2 py-1',
                          activePopover === 'lineEndCap'
                            ? 'bg-[rgba(124,58,237,0.22)] text-violet-700'
                            : 'bg-transparent'
                        )}
                      >
                        <ArrowRight size={14} />
                      </button>
                      <button
                        type="button"
                        title="Line type (Straight, Elbowed, Curved)"
                        aria-label="Line routing type"
                        onClick={() =>
                          setActivePopover((prev) => (prev === 'lineType' ? null : 'lineType'))
                        }
                        className={cn(
                          BTN_CLS,
                          'px-2 py-1',
                          activePopover === 'lineType'
                            ? 'bg-[rgba(124,58,237,0.22)] text-violet-700'
                            : 'bg-transparent'
                        )}
                      >
                        <svg width="16" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.6">
                          {(selectedEl.lineType ?? 'straight') === 'elbowed' ? (
                            <>
                              <path d="M3 11 H9 V3 H15" />
                              <circle cx="3" cy="11" r="1.6" fill="white" />
                              <circle cx="15" cy="3" r="1.6" fill="white" />
                            </>
                          ) : (selectedEl.lineType ?? 'straight') === 'curved' ? (
                            <>
                              <path d="M3 11 Q6 2 15 3" />
                              <circle cx="3" cy="11" r="1.6" fill="white" />
                              <circle cx="15" cy="3" r="1.6" fill="white" />
                            </>
                          ) : (
                            <>
                              <line x1="3" y1="11" x2="15" y2="3" />
                              <circle cx="3" cy="11" r="1.6" fill="white" />
                              <circle cx="15" cy="3" r="1.6" fill="white" />
                            </>
                          )}
                        </svg>
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
                        className={cn(
                          BTN_CLS,
                          'px-[9px] py-[5px]',
                          activePopover === 'shape'
                            ? 'bg-[rgba(124,58,237,0.3)]'
                            : 'bg-transparent'
                        )}
                      >
                        <Square size={13} /> Shape
                      </button>
                      <button
                        type="button"
                        title="Shape Fill"
                        aria-label="Shape fill color"
                        onClick={() => openColorDrawer({ kind: 'shapeFill', label: 'Shape color' })}
                        className="h-7 w-7 cursor-pointer rounded-[6px] border border-slate-300 p-0 shadow-inner transition-transform hover:scale-105"
                        style={{
                          background: selectedEl.backgroundColor || lastShapeColor
                        }}
                      />
                      {(!selectedEl.shapeType ||
                        selectedEl.shapeType === 'rectangle' ||
                        selectedEl.shapeType === 'roundedRect') && (
                        <label className="inline-flex items-center gap-[5px] text-[0.73rem] text-text-secondary">
                          Radius
                          <input
                            type="range"
                            min={0}
                            max={120}
                            value={selectedEl.borderRadius ?? 0}
                            onChange={(e) => updateSelectedEl({ borderRadius: Number(e.target.value) })}
                            className="w-16"
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
                      className={cn(
                        BTN_CLS,
                        'px-2.5 py-[5px]',
                        activePopover === '3d' ||
                          selectedEl.kind === 'model3d' ||
                          selectedEl.threeD?.enabled
                          ? 'bg-[rgba(124,58,237,0.3)]'
                          : 'bg-transparent',
                        selectedEl.kind === 'model3d' || selectedEl.threeD?.enabled
                          ? 'border-[#a78bfa] text-[#ddd6fe]'
                          : 'border-subtle text-text-primary'
                      )}
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
                    <div className="inline-flex items-center gap-[5px]">
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
                          className={cn(
                            'h-[18px] w-[18px] cursor-pointer rounded-full p-0',
                            (selectedEl.color || '#ffffff').toLowerCase() === swatch
                              ? 'border-2 border-[#a78bfa]'
                              : 'border border-white/30'
                          )}
                          style={{ background: swatch }}
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
                        className="h-[26px] w-[26px] cursor-pointer rounded-[6px] border border-subtle bg-transparent p-0"
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
                        className="h-7 w-7 cursor-pointer rounded-[6px] border border-subtle bg-transparent p-0"
                      />
                      <label className="inline-flex items-center gap-[5px] text-[0.73rem] text-text-secondary">
                        Thickness
                        <input
                          type="range"
                          min={1}
                          max={24}
                          value={selectedEl.thickness ?? 4}
                          onChange={(e) => updateSelectedEl({ thickness: Number(e.target.value) })}
                          className="w-[70px]"
                        />
                      </label>
                    </>
                  )}

                  {/* FRAME CONTEXTUAL CONTROLS */}
                  {selectedEl.kind === 'frame' && (
                    <>
                      {(selectedEl.frameShape === 'square' || selectedEl.frameShape === 'rounded') && (
                        <label className="inline-flex items-center gap-[5px] text-[0.73rem] text-text-secondary">
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
                            className="w-[68px]"
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
                            className={cn(
                              BTN_CLS,
                              'px-[9px] py-[5px]',
                              editingFrameId === selectedEl.id
                                ? 'border-[#8b5cf6] bg-[rgba(124,58,237,0.35)] text-[#ddd6fe]'
                                : 'border-subtle bg-transparent text-text-primary'
                            )}
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
                            className={cn(
                              BTN_CLS,
                              'border-[rgba(245,158,11,0.45)] px-[9px] py-[5px] text-[#fde68a]'
                            )}
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
                        className={cn(
                          BTN_CLS,
                          'px-[7px] py-[5px]',
                          selectedEl.flipX ? 'bg-[rgba(124,58,237,0.3)]' : 'bg-transparent'
                        )}
                      >
                        <FlipHorizontal2 size={13} />
                      </button>
                      <button
                        type="button"
                        title="Flip Vertical"
                        onClick={() => updateSelectedEl({ flipY: !selectedEl.flipY })}
                        className={cn(
                          BTN_CLS,
                          'px-[7px] py-[5px]',
                          selectedEl.flipY ? 'bg-[rgba(124,58,237,0.3)]' : 'bg-transparent'
                        )}
                      >
                        <FlipVertical2 size={13} />
                      </button>
                    </>
                  )}

                  <div className="relative flex items-center">
                    <button
                      type="button"
                      title="Transparency"
                      aria-label="Transparency"
                      onClick={() =>
                        setActivePopover((prev) =>
                          prev === 'transparency' ? null : 'transparency'
                        )
                      }
                      className={cn(
                        BTN_CLS,
                        'px-[7px] py-[5px]',
                        activePopover === 'transparency'
                          ? 'bg-[rgba(124,58,237,0.3)]'
                          : 'bg-transparent'
                      )}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <rect x="2" y="2" width="3" height="3" opacity="0.95" />
                        <rect x="8" y="2" width="3" height="3" opacity="0.55" />
                        <rect x="5" y="5" width="3" height="3" opacity="0.75" />
                        <rect x="11" y="5" width="3" height="3" opacity="0.35" />
                        <rect x="2" y="8" width="3" height="3" opacity="0.95" />
                        <rect x="8" y="8" width="3" height="3" opacity="0.55" />
                        <rect x="5" y="11" width="3" height="3" opacity="0.75" />
                        <rect x="11" y="11" width="3" height="3" opacity="0.35" />
                      </svg>
                    </button>
                    {activePopover === 'transparency' && (() => {
                      const pct = Math.round((selectedEl.opacity ?? 1) * 100);
                      return (
                        <div className="absolute left-1/2 top-full z-50 mt-1.5 flex w-[250px] -translate-x-1/2 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 text-slate-900 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                          <span className="text-[0.8rem] font-semibold text-slate-800">
                            Transparency
                          </span>
                          <div className="flex items-center gap-2.5">
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={pct}
                              onChange={(e) =>
                                updateSelectedEl({
                                  opacity: Number((Number(e.target.value) / 100).toFixed(2))
                                })
                              }
                              className="flex-1 accent-violet-500"
                            />
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={pct}
                              onChange={(e) => {
                                const clamped = Math.max(
                                  0,
                                  Math.min(100, Number(e.target.value) || 0)
                                );
                                updateSelectedEl({
                                  opacity: Number((clamped / 100).toFixed(2))
                                });
                              }}
                              className="h-8 w-12 rounded-lg border border-slate-200 bg-white text-center text-[0.8rem] font-semibold tabular-nums text-slate-800 outline-none focus:border-violet-500"
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="h-[18px] w-px bg-subtle" />

                  <button
                    type="button"
                    onClick={() => {
                      setActivePopover(null);
                      setActiveRailTab((prev) => (prev === 'animate' ? null : 'animate'));
                    }}
                    className={cn(
                      BTN_CLS,
                      'px-[9px] py-[5px]',
                      activeRailTab === 'animate' ||
                        (selectedEl.animation && selectedEl.animation !== 'none')
                        ? 'bg-[rgba(124,58,237,0.3)]'
                        : 'bg-transparent',
                      selectedEl.animation && selectedEl.animation !== 'none'
                        ? 'text-[#ddd6fe]'
                        : 'text-text-primary'
                    )}
                  >
                    <Wand2 size={13} /> Animate
                  </button>

                  <div className="ml-auto inline-flex items-center gap-1">
                    <button
                      type="button"
                      title="Bring Forward"
                      onClick={() => moveElementLayer(selectedEl.id, 1)}
                      className={cn(BTN_CLS, 'px-1.5 py-[5px]')}
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      title="Send Backward"
                      onClick={() => moveElementLayer(selectedEl.id, -1)}
                      className={cn(BTN_CLS, 'px-1.5 py-[5px]')}
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
                      className={cn(BTN_CLS, 'px-1.5 py-[5px]')}
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
                      className={cn(BTN_CLS, 'border-[#7f1d1d] px-1.5 py-[5px] text-[#fca5a5]')}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </>
              ) : backgroundSelected && !(studioMode && selectedStudioBox) ? (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveRailTab('background')}
                    className={cn(BTN_CLS, 'gap-1.5 px-2.5')}
                  >
                    <span
                      className="h-4 w-4 rounded-[4px] border border-slate-300"
                      style={{ background: activeSlideBg }}
                    />
                    Background
                  </button>
                  <button
                    type="button"
                    title="Background Color"
                    aria-label="Background color"
                    onClick={() => openColorDrawer({ kind: 'background', label: 'Background color' })}
                    className="h-7 w-7 cursor-pointer rounded-[6px] border border-slate-300 p-0 shadow-inner transition-transform hover:scale-105"
                    style={{ background: activeSlideBg }}
                  />
                </>
              ) : null}

              {studioMode && !selectedEl && selectedStudioBox && (() => {
                const box = selectedStudioBox === 'presentation' ? presBox : partBox;
                const setBox = selectedStudioBox === 'presentation' ? setPresBox : setPartBox;
                const boxLabel =
                  selectedStudioBox === 'presentation' ? 'Presentation Box' : 'Speaker / Camera Box';
                return (
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-[0.8rem] font-bold text-[#ddd6fe]">
                      {boxLabel}
                    </span>
                    <div className="h-[18px] w-px bg-subtle" />
                    <label className="inline-flex items-center gap-1.5 text-[0.76rem] text-text-secondary">
                      <span>Radius ({box.borderRadius ?? 16}px)</span>
                      <input
                        type="range"
                        min={0}
                        max={48}
                        step={2}
                        value={box.borderRadius ?? 16}
                        onChange={(e) => setBox({ ...box, borderRadius: Number(e.target.value) })}
                        className="w-20"
                      />
                    </label>
                    <span className="text-[0.74rem] text-text-muted">
                      X {Math.round(box.x)}% · Y {Math.round(box.y)}% · {Math.round(box.width)}% × {Math.round(box.height)}%
                    </span>
                  </div>
                );
              })()}

              {/* FLOATING POPOVERS BELOW CONTEXTUAL TOOLBAR */}
              {selectedEl && activePopover === 'lineStyle' && selectedEl.kind === 'line' && (
                <div className="absolute left-4 top-full z-50 mt-1.5 flex w-[270px] flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 text-slate-900 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        { id: 'solid', label: 'Solid', dash: undefined },
                        { id: 'dashed', label: 'Dashed', dash: '6 3' },
                        { id: 'shortDashed', label: 'Short Dashed', dash: '3 2' },
                        { id: 'dotted', label: 'Dotted', dash: '1.5 2.5' }
                      ] as const
                    ).map((opt) => {
                      const active = (selectedEl.lineDash ?? 'solid') === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          title={opt.label}
                          onClick={() => updateSelectedEl({ lineDash: opt.id })}
                          className={cn(
                            'flex h-9 cursor-pointer items-center justify-center rounded-lg border bg-white transition-colors',
                            active
                              ? 'border-violet-600 ring-1 ring-violet-600'
                              : 'border-slate-200 hover:border-slate-300'
                          )}
                        >
                          <svg width="26" height="6" viewBox="0 0 26 6">
                            <line
                              x1="2"
                              y1="3"
                              x2="24"
                              y2="3"
                              stroke="#0f172a"
                              strokeWidth="2.2"
                              strokeDasharray={opt.dash}
                              strokeLinecap={opt.id === 'dotted' ? 'round' : 'butt'}
                            />
                          </svg>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[0.8rem] font-medium text-slate-800">
                      Rounded end points
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(selectedEl.lineRoundedCaps)}
                      onClick={() =>
                        updateSelectedEl({ lineRoundedCaps: !selectedEl.lineRoundedCaps })
                      }
                      className={cn(
                        'relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full border-0 transition-colors',
                        selectedEl.lineRoundedCaps ? 'bg-violet-600' : 'bg-slate-300'
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                          selectedEl.lineRoundedCaps ? 'translate-x-[18px]' : 'translate-x-[2px]'
                        )}
                      />
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[0.8rem] font-medium text-slate-800">Stroke weight</span>
                    <div className="flex items-center gap-2.5">
                      <input
                        type="range"
                        min={1}
                        max={32}
                        step={1}
                        value={selectedEl.lineStrokeWidth ?? 4}
                        onChange={(e) =>
                          updateSelectedEl({ lineStrokeWidth: Number(e.target.value) })
                        }
                        className="flex-1 accent-violet-600"
                      />
                      <span className="flex h-7 w-10 items-center justify-center rounded-md border border-slate-200 text-[0.78rem] font-semibold tabular-nums text-slate-800">
                        {selectedEl.lineStrokeWidth ?? 4}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {selectedEl &&
                (activePopover === 'lineStartCap' || activePopover === 'lineEndCap') &&
                selectedEl.kind === 'line' && (() => {
                  const isStart = activePopover === 'lineStartCap';
                  const currentCap = isStart
                    ? (selectedEl.lineStartCap ?? 'none')
                    : (selectedEl.lineEndCap ?? 'none');
                  return (
                    <div className="absolute left-12 top-full z-50 mt-1.5 grid w-[250px] grid-cols-5 gap-1.5 rounded-xl border border-slate-200 bg-white p-2.5 text-slate-900 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                      {LINE_CAP_OPTIONS.map((opt) => {
                        const active = currentCap === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            title={opt.label}
                            onClick={() => {
                              updateSelectedEl(
                                isStart ? { lineStartCap: opt.id } : { lineEndCap: opt.id }
                              );
                              setActivePopover(null);
                            }}
                            className={cn(
                              'flex h-10 cursor-pointer items-center justify-center rounded-lg border-0 transition-colors',
                              active
                                ? 'bg-violet-100 text-violet-700'
                                : 'bg-transparent text-slate-800 hover:bg-slate-100'
                            )}
                          >
                            <svg
                              width="22"
                              height="16"
                              viewBox="0 0 22 16"
                              style={{ transform: isStart ? 'scaleX(-1)' : undefined }}
                            >
                              {opt.id === 'none' ? (
                                <g stroke="currentColor" strokeWidth="1.6" fill="none">
                                  <circle cx="11" cy="8" r="5.5" />
                                  <line x1="7" y1="12" x2="15" y2="4" />
                                </g>
                              ) : (
                                <>
                                  <line
                                    x1="3"
                                    y1="8"
                                    x2={opt.id === 'arrow' || opt.id === 'arrowFilled' ? 17 : 13}
                                    y2="8"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                  />
                                  {opt.id === 'arrow' && (
                                    <path
                                      d="M12 4 L17 8 L12 12"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.8"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  )}
                                  {opt.id === 'arrowFilled' && (
                                    <polygon points="18,8 11,4 11,12" fill="currentColor" />
                                  )}
                                  {opt.id === 'circleOutline' && (
                                    <circle
                                      cx="14"
                                      cy="8"
                                      r="3.2"
                                      fill="white"
                                      stroke="currentColor"
                                      strokeWidth="1.8"
                                    />
                                  )}
                                  {opt.id === 'circleFilled' && (
                                    <circle cx="14" cy="8" r="3.6" fill="currentColor" />
                                  )}
                                  {opt.id === 'squareOutline' && (
                                    <rect
                                      x="11"
                                      y="5"
                                      width="6"
                                      height="6"
                                      fill="white"
                                      stroke="currentColor"
                                      strokeWidth="1.8"
                                    />
                                  )}
                                  {opt.id === 'squareFilled' && (
                                    <rect x="11" y="5" width="6" height="6" fill="currentColor" />
                                  )}
                                  {opt.id === 'diamondOutline' && (
                                    <polygon
                                      points="18,8 14.5,4.5 11,8 14.5,11.5"
                                      fill="white"
                                      stroke="currentColor"
                                      strokeWidth="1.8"
                                    />
                                  )}
                                  {opt.id === 'diamondFilled' && (
                                    <polygon
                                      points="18,8 14.5,4.5 11,8 14.5,11.5"
                                      fill="currentColor"
                                    />
                                  )}
                                  {opt.id === 'bar' && (
                                    <line
                                      x1="15"
                                      y1="3.5"
                                      x2="15"
                                      y2="12.5"
                                      stroke="currentColor"
                                      strokeWidth="1.8"
                                      strokeLinecap="round"
                                    />
                                  )}
                                </>
                              )}
                            </svg>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

              {selectedEl && activePopover === 'lineType' && selectedEl.kind === 'line' && (
                <div className="absolute left-36 top-full z-50 mt-1.5 flex w-[165px] flex-col gap-0.5 rounded-xl border border-slate-200 bg-white p-1.5 text-slate-900 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                  {(
                    [
                      { id: 'straight', label: 'Straight' },
                      { id: 'elbowed', label: 'Elbowed' },
                      { id: 'curved', label: 'Curved' }
                    ] as const
                  ).map((opt) => {
                    const active = (selectedEl.lineType ?? 'straight') === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          const { x1, y1, x2, y2 } = getLineEndpoints(selectedEl);
                          const midX = (x1 + x2) / 2;
                          const midY = (y1 + y2) / 2;
                          const patch: Partial<CanvasElement> = { lineType: opt.id };
                          if (opt.id === 'curved' && typeof selectedEl.lineCy !== 'number') {
                            patch.lineCx = Number(midX.toFixed(2));
                            patch.lineCy = Number(Math.max(5, midY - 12).toFixed(2));
                          } else if (opt.id === 'elbowed' && typeof selectedEl.lineCy !== 'number') {
                            patch.lineCx = Number(midX.toFixed(2));
                            patch.lineCy = Number(midY.toFixed(2));
                          }
                          updateSelectedEl(patch);
                          setActivePopover(null);
                        }}
                        className="flex cursor-pointer items-center justify-between rounded-lg border-0 bg-transparent px-2.5 py-2 text-[0.82rem] font-medium text-slate-800 hover:bg-slate-100"
                      >
                        <span className="inline-flex items-center gap-2.5">
                          <svg width="16" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                            {opt.id === 'straight' && (
                              <>
                                <line x1="3" y1="11" x2="15" y2="3" />
                                <circle cx="3" cy="11" r="1.5" fill="white" />
                                <circle cx="15" cy="3" r="1.5" fill="white" />
                              </>
                            )}
                            {opt.id === 'elbowed' && (
                              <>
                                <path d="M3 11 H9 V3 H15" />
                                <circle cx="3" cy="11" r="1.5" fill="white" />
                                <circle cx="15" cy="3" r="1.5" fill="white" />
                              </>
                            )}
                            {opt.id === 'curved' && (
                              <>
                                <path d="M3 11 Q5 2 15 3" />
                                <circle cx="3" cy="11" r="1.5" fill="white" />
                                <circle cx="15" cy="3" r="1.5" fill="white" />
                              </>
                            )}
                          </svg>
                          {opt.label}
                        </span>
                        {active && <Check size={14} className="text-slate-900" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedEl && activePopover === 'shape' && selectedEl.kind === 'shape' && (
                <div className="absolute left-3.5 top-full z-50 mt-1.5 flex w-[260px] flex-col gap-2 rounded-xl border border-subtle bg-white text-slate-900 border-slate-200 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                  <span className={SECTION_TITLE_CLS}>Change Shape</span>
                  <div className="grid max-h-[260px] grid-cols-4 gap-1.5 overflow-y-auto pr-0.5">
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
                          className={cn(
                            'flex h-9 cursor-pointer items-center justify-center rounded-[7px] border',
                            active
                              ? 'border-[#8b5cf6] bg-[rgba(139,92,246,0.2)]'
                              : 'border-subtle bg-panel-elevated'
                          )}
                        >
                          <div className="h-[18px] w-[18px]">
                            <CanvasShapeGraphic shapeType={opt.id} fill={active ? '#7c3aed' : '#334155'} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedEl && activePopover === '3d' && (selectedEl.kind === 'image' || selectedEl.kind === 'model3d') && (() => {
                const td = selectedEl.threeD ?? DEFAULT_THREE_D_CONFIG;
                const isGlbModel = selectedEl.kind === 'model3d';
                const patch3D = (patch: Partial<typeof td>) =>
                  updateSelectedEl({ threeD: { ...td, ...patch } });
                return (
                  <div className="absolute right-3.5 top-full z-50 mt-1.5 flex w-[280px] flex-col gap-2.5 rounded-xl border border-subtle bg-white text-slate-900 border-slate-200 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                    <div className="flex items-center justify-between">
                      <span className={SECTION_TITLE_CLS}>{isGlbModel ? '3D Model (.glb)' : '3D Object'}</span>
                      {!isGlbModel && (
                        <button
                          type="button"
                          onClick={() => patch3D({ enabled: !td.enabled })}
                          className={cn(
                            BTN_CLS,
                            'px-2.5 py-1 font-bold',
                            td.enabled
                              ? 'border-[#a78bfa] bg-[#7c3aed] text-white'
                              : 'border-subtle bg-transparent text-text-secondary'
                          )}
                        >
                          <Box size={12} /> {td.enabled ? '3D On' : '3D Off'}
                        </button>
                      )}
                    </div>
                    {!isGlbModel && (
                      <>
                    <label className={FIELD_LABEL_CLS}>
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
                    <label className={FIELD_LABEL_CLS}>
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
                    <div className="flex items-center gap-2">
                      <label className={cn(FIELD_LABEL_CLS, 'flex-1')}>
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
                          className={INPUT_CLS}
                        >
                          <option value="metallic">Metallic</option>
                          <option value="glossy">Glossy</option>
                          <option value="ice">Glowing Ice</option>
                          <option value="glass">Crystal Glass</option>
                          <option value="matte">Matte</option>
                          <option value="neon">Neon Glow</option>
                        </select>
                      </label>
                      <div className={FIELD_LABEL_CLS}>
                        <span>Edge Color</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            title="Extrude the PNG's own edge colors through the sides (pulled candy effect)"
                            onClick={() =>
                              patch3D({
                                enabled: true,
                                edgeMode: td.edgeMode === 'matchImage' ? 'solid' : 'matchImage'
                              })
                            }
                            className={cn(
                              BTN_CLS,
                              'h-[30px] px-2 text-[11px] font-semibold',
                              td.edgeMode === 'matchImage'
                                ? 'border-[#a78bfa] bg-[#7c3aed] text-white'
                                : 'border-subtle bg-transparent text-text-secondary'
                            )}
                          >
                            Match PNG
                          </button>
                          <input
                            type="color"
                            title="Solid 3D Edge Color"
                            value={td.edgeColor}
                            onChange={(e) =>
                              patch3D({ enabled: true, edgeMode: 'solid', edgeColor: e.target.value })
                            }
                            className={cn(
                              'h-[30px] w-[34px] cursor-pointer rounded-[6px] border border-subtle bg-transparent p-0',
                              td.edgeMode === 'matchImage' && 'opacity-50'
                            )}
                          />
                        </div>
                      </div>
                    </div>
                      </>
                    )}
                    <label className={FIELD_LABEL_CLS}>
                      <span>3D Animation</span>
                      <select
                        aria-label="3D animation"
                        value={td.animation}
                        onChange={(e) =>
                          patch3D({ enabled: true, animation: e.target.value as CanvasThreeDAnimation })
                        }
                        className={INPUT_CLS}
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
                      <label className={FIELD_LABEL_CLS}>
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
                    <label className={FIELD_LABEL_CLS}>
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
              )}
            </div>

            {/* Center: HUGE Interactive 16:9 Safe-Area Canvas (strictly locked to 16:9 via container units) */}
            <main
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) startMarquee(e);
              }}
              onClick={() => {
                if (suppressNextMainClickRef.current) {
                  suppressNextMainClickRef.current = false;
                  return;
                }
                setSelectedElId(null);
                setBackgroundSelected(false);
                setActivePopover(null);
              }}
              style={{
                flex: 1,
                minHeight: 0,
                containerType: 'size',
                background: '#070a11',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                padding: '5px 24px 20px',
                overflow: 'hidden'
              }}
            >
            <div
              ref={stageRef}
              onPointerDown={startMarquee}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 'min(calc(100cqw - 48px), calc((100cqh - 25px) * 16 / 9))',
                height: 'min(calc(100cqh - 25px), calc((100cqw - 48px) * 9 / 16))',
                background: activeSlideBg,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                position: 'relative',
                borderRadius: '8px',
                outline: backgroundSelected && selectedElIds.length === 0 ? '2px solid #38bdf8' : 'none',
                outlineOffset: '0px',
                boxShadow: '0 16px 48px rgba(0, 0, 0, 0.7)',
                overflow: 'hidden',
                userSelect: 'none',
                flexShrink: 0
              }}
            >
              <svg
                width="0"
                height="0"
                aria-hidden="true"
                style={{ position: 'absolute', pointerEvents: 'none' }}
              >
                <defs>
                  <filter id="uecfi-vapor-haze-filter" x="-40%" y="-80%" width="180%" height="260%">
                    <feTurbulence
                      type="fractalNoise"
                      baseFrequency="0.012 0.05"
                      numOctaves="2"
                      seed="7"
                      result="n"
                    >
                      <animate
                        attributeName="baseFrequency"
                        values="0.012 0.05;0.02 0.09;0.012 0.05"
                        dur="7s"
                        repeatCount="indefinite"
                      />
                    </feTurbulence>
                    <feDisplacementMap in="SourceGraphic" in2="n" scale="0" xChannelSelector="R" yChannelSelector="G">
                      <animate
                        attributeName="scale"
                        values="0;0;90;0;0"
                        keyTimes="0;.3;.55;.8;1"
                        dur="7s"
                        repeatCount="indefinite"
                      />
                    </feDisplacementMap>
                  </filter>
                </defs>
              </svg>
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
                    el.kind === 'shape' &&
                    el.shapeType &&
                    el.shapeType !== 'rectangle' &&
                    el.shapeType !== 'roundedRect';
                  const textEffect = el.textEffect ?? 'none';
                  const isPrismSpin = textEffect === 'prismSpin';
                  const isShimmer = textEffect === 'shimmer';
                  const isRainbow = textEffect === 'rainbow';
                  const isRainbowRipple = textEffect === 'rainbowRipple';
                  const isOverride = textEffect === 'override';
                  const isVoltage = textEffect === 'voltage';
                  const isThreeDGlow = textEffect === 'threeDGlow';
                  const isTrace = textEffect === 'trace';
                  const isThreeDExtrude = textEffect === 'threeDExtrude';
                  const isPopArt = textEffect === 'popArt';
                  const isRetroStack = textEffect === 'retroStack';
                  const isSlideStripes = textEffect === 'slideStripes';
                  const isBlock3d = textEffect === 'block3d';
                  const isAmazingPop = textEffect === 'amazingPop';
                  const isStrokeDraw = el.animation === 'strokeDraw';
                  const isGradientText =
                    !isPrismSpin &&
                    !isShimmer &&
                    !isRainbow &&
                    !isRainbowRipple &&
                    !isOverride &&
                    !isVoltage &&
                    !isThreeDGlow &&
                    !isTrace &&
                    !isThreeDExtrude &&
                    !isPopArt &&
                    !isRetroStack &&
                    !isSlideStripes &&
                    !isBlock3d &&
                    !isAmazingPop &&
                    (el.color || '').includes('gradient(');
                  const { textShadow: computedTextShadow, filter: computedTextFilter } =
                    buildTextEffectsCss(el, scale);
                  const sharedTextStyle: React.CSSProperties = {
                    width: '100%',
                    ...(isGradientText || isPrismSpin || isShimmer || isSlideStripes
                      ? {
                          ...(isGradientText ? { backgroundImage: el.color } : {}),
                          ...(isShimmer && el.color && !el.color.includes('gradient(')
                            ? ({ '--shimmer-color': el.color } as React.CSSProperties)
                            : {}),
                          WebkitBackgroundClip: 'text',
                          backgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          color: 'transparent',
                          filter: computedTextFilter
                        }
                      : isRainbow || isRainbowRipple
                        ? {
                            textShadow: computedTextShadow
                          }
                        : isVoltage
                          ? {
                              color: 'transparent',
                              WebkitTextFillColor: 'transparent',
                              ...(el.color && !el.color.includes('gradient(')
                                ? ({ '--voltage-color': el.color } as React.CSSProperties)
                                : {})
                            }
                          : isThreeDGlow
                            ? {
                                color: el.color || '#0a0a0a',
                                ['--glow-3d-blur' as string]: `${Math.max(4, 30 * scale)}px`
                              }
                            : isThreeDExtrude
                              ? {
                                  ...(el.color && !el.color.includes('gradient(')
                                    ? ({ '--extrude-color': el.color } as React.CSSProperties)
                                    : {})
                                }
                              : isPopArt
                                ? {
                                    color: 'transparent',
                                    WebkitTextFillColor: 'transparent',
                                    ...(el.color && !el.color.includes('gradient(')
                                      ? ({ '--pop-art-accent': el.color } as React.CSSProperties)
                                      : {})
                                  }
                                : isAmazingPop
                                  ? {
                                      ...(el.color && !el.color.includes('gradient(')
                                        ? ({ '--amazing-accent': el.color } as React.CSSProperties)
                                        : {})
                                    }
                                  : isOverride
                            ? {
                                color: el.color || '#f4f6ff',
                                ...(computedTextShadow && computedTextShadow !== 'none'
                                  ? { textShadow: computedTextShadow }
                                  : {})
                              }
                            : {
                                color: el.color || '#ffffff',
                                textShadow: computedTextShadow
                              }),
                    fontFamily: el.fontFamily || "'Inter', sans-serif",
                    fontSize: `${(el.fontSize ?? 56) * scale * (el.textPosition && el.textPosition !== 'normal' ? 0.62 : 1)}px`,
                    ...(el.textPosition === 'superscript'
                      ? { position: 'relative', top: '-0.35em' }
                      : el.textPosition === 'subscript'
                        ? { position: 'relative', top: '0.28em' }
                        : {}),
                    fontWeight: el.fontWeight ?? '700',
                    fontStyle: el.fontStyle ?? 'normal',
                    textDecoration: el.textDecoration ?? 'none',
                    textTransform: el.textTransform === 'uppercase' ? 'uppercase' : undefined,
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
                      el.outlineWidth && el.outlineWidth > 0 ? 'stroke fill' : undefined
                  };
                  return el.kind === 'line' ? (
                    <React.Fragment key={el.id}>
                      <svg
                        viewBox={`0 0 ${STAGE_VIRTUAL_W} ${STAGE_VIRTUAL_H}`}
                        preserveAspectRatio="none"
                        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                        style={{
                          zIndex: el.zIndex,
                          opacity: el.opacity ?? 1
                        }}
                      >
                        <CanvasLineGraphic
                          element={el}
                          interactive
                          onPointerDownBody={(e) => startDrag(e, el, 'move')}
                          onMouseEnterBody={() => setHoveredElId(el.id)}
                          onMouseLeaveBody={() =>
                            setHoveredElId((prev) => (prev === el.id ? null : prev))
                          }
                        />
                      </svg>
                      {isSelected && selectedElIds.length === 1 && !el.locked && (() => {
                        const { x1, y1, x2, y2, cx, cy, lineType } = getLineEndpoints(el);
                        const elbowMid = lineType === 'elbowed' ? getElbowMidHandlePct(el) : null;
                        return (
                          <div
                            className="pointer-events-none absolute inset-0"
                            style={{ zIndex: el.zIndex + 20 }}
                          >
                            {/* Start endpoint handle */}
                            <div
                              onPointerDown={(e) => startLineHandleDrag(e, el, 'start')}
                              title="Drag start point (Shift to snap 45°)"
                              style={{
                                position: 'absolute',
                                left: `${x1}%`,
                                top: `${y1}%`,
                                width: '14px',
                                height: '14px',
                                transform: 'translate(-50%, -50%)',
                                borderRadius: '999px',
                                background: '#ffffff',
                                border: '2px solid #8b5cf6',
                                boxShadow: '0 1px 5px rgba(0,0,0,0.45)',
                                cursor: 'grab',
                                pointerEvents: 'auto'
                              }}
                            />
                            {/* End endpoint handle */}
                            <div
                              onPointerDown={(e) => startLineHandleDrag(e, el, 'end')}
                              title="Drag end point (Shift to snap 45°)"
                              style={{
                                position: 'absolute',
                                left: `${x2}%`,
                                top: `${y2}%`,
                                width: '14px',
                                height: '14px',
                                transform: 'translate(-50%, -50%)',
                                borderRadius: '999px',
                                background: '#ffffff',
                                border: '2px solid #8b5cf6',
                                boxShadow: '0 1px 5px rgba(0,0,0,0.45)',
                                cursor: 'grab',
                                pointerEvents: 'auto'
                              }}
                            />
                            {/* Curved bend handles (multi-point) + midpoint '+' handles to add more */}
                            {lineType === 'curved' && (() => {
                              const curvePts = getLineCurvePoints(el);
                              const insertMids = getCurveInsertMidpoints(el);
                              return (
                                <>
                                  {insertMids.map((mid) => (
                                    <div
                                      key={`add-curve-${mid.insertIndex}`}
                                      onPointerDown={(e) =>
                                        startLineHandleDrag(e, el, 'control', mid.insertIndex, {
                                          insertIndex: mid.insertIndex,
                                          x: mid.x,
                                          y: mid.y
                                        })
                                      }
                                      title="Click or drag to add a curving handle"
                                      style={{
                                        position: 'absolute',
                                        left: `${mid.x}%`,
                                        top: `${mid.y}%`,
                                        width: '13px',
                                        height: '13px',
                                        transform: 'translate(-50%, -50%)',
                                        borderRadius: '999px',
                                        background: 'rgba(255,255,255,0.85)',
                                        border: '1.5px dashed #8b5cf6',
                                        color: '#6d28d9',
                                        fontSize: '10px',
                                        fontWeight: 800,
                                        lineHeight: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                                        cursor: 'copy',
                                        pointerEvents: 'auto'
                                      }}
                                    >
                                      +
                                    </div>
                                  ))}
                                  {curvePts.map((pt, idx) => (
                                    <div
                                      key={`curve-pt-${idx}`}
                                      onPointerDown={(e) => startLineHandleDrag(e, el, 'control', idx)}
                                      onDoubleClick={(e) => {
                                        if (curvePts.length <= 1) return;
                                        e.stopPropagation();
                                        const nextPts = curvePts.filter((_, i) => i !== idx);
                                        const bounds = computeLineBounds(
                                          x1,
                                          y1,
                                          x2,
                                          y2,
                                          undefined,
                                          undefined,
                                          nextPts
                                        );
                                        updateSelectedEl({
                                          ...bounds,
                                          linePoints: nextPts,
                                          lineCx: nextPts[0]?.x,
                                          lineCy: nextPts[0]?.y
                                        });
                                      }}
                                      title={
                                        curvePts.length > 1
                                          ? 'Drag to bend curve (double-click to remove)'
                                          : 'Drag to bend curve'
                                      }
                                      style={{
                                        position: 'absolute',
                                        left: `${pt.x}%`,
                                        top: `${pt.y}%`,
                                        width: '13px',
                                        height: '13px',
                                        transform: 'translate(-50%, -50%)',
                                        borderRadius: '999px',
                                        background: '#e2e8f0',
                                        border: '2px solid #8b5cf6',
                                        boxShadow: '0 1px 5px rgba(0,0,0,0.45)',
                                        cursor: 'grab',
                                        pointerEvents: 'auto'
                                      }}
                                    />
                                  ))}
                                </>
                              );
                            })()}
                            {/* Elbowed mid-segment pill handle */}
                            {lineType === 'elbowed' && elbowMid && (
                              <div
                                onPointerDown={(e) => startLineHandleDrag(e, el, 'control')}
                                title="Drag to adjust elbow"
                                style={{
                                  position: 'absolute',
                                  left: `${elbowMid.x}%`,
                                  top: `${elbowMid.y}%`,
                                  width: Math.abs(x2 - x1) >= Math.abs(y2 - y1) ? '20px' : '8px',
                                  height: Math.abs(x2 - x1) >= Math.abs(y2 - y1) ? '8px' : '20px',
                                  transform: 'translate(-50%, -50%)',
                                  borderRadius: '999px',
                                  background: '#ffffff',
                                  border: '1.5px solid #8b5cf6',
                                  boxShadow: '0 1px 5px rgba(0,0,0,0.45)',
                                  cursor: Math.abs(x2 - x1) >= Math.abs(y2 - y1) ? 'ns-resize' : 'ew-resize',
                                  pointerEvents: 'auto'
                                }}
                              />
                            )}
                          </div>
                        );
                      })()}
                    </React.Fragment>
                  ) : (
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
                      onPointerEnter={(e) => {
                        e.stopPropagation();
                        setHoveredElId(el.id);
                      }}
                      onPointerLeave={() => {
                        setHoveredElId((prev) => (prev === el.id ? null : prev));
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
                        outline: isEditingThisText
                          ? '2px solid #8b5cf6'
                          : isSelected
                            ? selectedElements.length > 1 &&
                              Boolean(selectedElements[0]?.groupId) &&
                              selectedElements.every(
                                (item) => item.groupId === selectedElements[0]?.groupId
                              )
                              ? 'none'
                              : '2px solid #38bdf8'
                            : capturingThumbnail
                              ? 'none'
                              : hoveredElId === el.id &&
                                  !editingTextId &&
                                  !editingFrameId &&
                                  !resizingElId &&
                                  !rotatingInfo &&
                                  !marqueeRect
                                ? '1.5px solid rgba(56, 189, 248, 0.85)'
                                : 'none',
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
                          background: isVectorShape ? 'transparent' : el.backgroundColor || 'transparent',
                          borderRadius: isVectorShape ? undefined : `${(el.borderRadius ?? 0) * scale}px`,
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
                      <div
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
                          ...(!isEditingThisText && el.animation === 'vaporHaze'
                            ? { filter: 'url(#uecfi-vapor-haze-filter)' }
                            : {}),
                          ...(el.textEffect === 'threeDGlow' || el.animation === 'wobble3d'
                            ? { transformStyle: 'preserve-3d' }
                            : {})
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
                              ...(isGradientText || isPrismSpin || isShimmer || isRainbowRipple || isVoltage || isThreeDGlow || isPopArt || isSlideStripes
                                ? {
                                    backgroundImage: undefined,
                                    WebkitBackgroundClip: undefined,
                                    backgroundClip: undefined,
                                    WebkitTextFillColor: undefined,
                                    color: isPrismSpin || isThreeDGlow || isPopArt || isSlideStripes
                                      ? '#ffffff'
                                      : isShimmer
                                          ? (el.color && !el.color.includes('gradient(') ? el.color : '#e8d5f5')
                                          : isVoltage
                                            ? (el.color && !el.color.includes('gradient(') ? el.color : '#f5bc28')
                                            : isRainbowRipple
                                              ? 'oklch(0.68 0.22 20)'
                                              : (el.color?.match(/#[0-9a-fA-F]{6}/)?.[0] ?? '#ffffff'),
                                    ...(isThreeDGlow ? { textShadow: '0 0 10px cyan' } : {}),
                                    filter: undefined
                                  }
                                : {}),
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
                        ) : isTrace || isStrokeDraw ? (
                          (() => {
                            const fontSizePx =
                              (el.fontSize ?? 56) *
                              scale *
                              (el.textPosition && el.textPosition !== 'normal' ? 0.62 : 1);
                            const lineHeightVal = el.lineHeight ?? 1.22;
                            const padPx = 12 * scale;
                            const lines = applyListPrefix(el.text || '', el.listStyle).split('\n');
                            const svgHeight = Math.ceil(
                              lines.length * fontSizePx * lineHeightVal + padPx * 2
                            );
                            const anchor =
                              el.textAlign === 'left'
                                ? 'start'
                                : el.textAlign === 'right'
                                  ? 'end'
                                  : 'middle';
                            const xPos =
                              el.textAlign === 'left'
                                ? padPx
                                : el.textAlign === 'right'
                                  ? `calc(100% - ${padPx}px)`
                                  : '50%';
                            const drawDur = el.animationDuration ?? 3.0;
                            const drawDelay = el.animationDelay ?? 0.2;
                            const fillDelay = Number((drawDelay + drawDur * 0.9).toFixed(2));
                            const dashLen = Math.round(Math.max(320, fontSizePx * 5.2));
                            const dashLit = Math.max(24, Math.round(fontSizePx * 0.55));
                            const dashGap = Math.max(180, Math.round(fontSizePx * 4.3));
                            const inkColor =
                              el.color && !el.color.includes('gradient(') ? el.color : '#ffffff';
                            const traceColor =
                              el.color && !el.color.includes('gradient(') ? el.color : '#38e8d6';
                            return (
                              <svg
                                data-text-measure={el.id}
                                width="100%"
                                height={svgHeight}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  overflow: 'visible',
                                  pointerEvents: 'none'
                                }}
                              >
                                {lines.map((rawLine, lineIdx) => {
                                  const lineText =
                                    el.textTransform === 'uppercase'
                                      ? rawLine.toUpperCase()
                                      : rawLine;
                                  const yPos =
                                    padPx + (lineIdx + 0.78) * fontSizePx * lineHeightVal;
                                  const commonTextProps = {
                                    x: xPos,
                                    y: yPos,
                                    textAnchor: anchor as 'start' | 'middle' | 'end',
                                    style: {
                                      fontFamily: el.fontFamily || "'Inter', sans-serif",
                                      fontSize: `${fontSizePx}px`,
                                      fontWeight: el.fontWeight ?? '700',
                                      fontStyle: el.fontStyle ?? 'normal',
                                      letterSpacing:
                                        typeof el.letterSpacing === 'number'
                                          ? `${el.letterSpacing}em`
                                          : undefined
                                    }
                                  };
                                  if (isTrace) {
                                    return (
                                      <React.Fragment key={lineIdx}>
                                        <text
                                          {...commonTextProps}
                                          className="uecfi-trace-base"
                                          strokeWidth={Math.max(1, 1.5 * scale)}
                                        >
                                          {lineText}
                                        </text>
                                        <text
                                          {...commonTextProps}
                                          aria-hidden="true"
                                          className="uecfi-trace-lit"
                                          strokeWidth={Math.max(1, 2 * scale)}
                                          strokeDasharray={`${dashLit} ${dashGap}`}
                                          style={{
                                            ...commonTextProps.style,
                                            ['--trace-glow' as string]: traceColor,
                                            ['--trace-period' as string]: -(dashLit + dashGap)
                                          }}
                                        >
                                          {lineText}
                                        </text>
                                      </React.Fragment>
                                    );
                                  }
                                  return (
                                    <text
                                      key={lineIdx}
                                      {...commonTextProps}
                                      className="uecfi-anim-stroke-draw"
                                      strokeWidth={Math.max(1, 2 * scale)}
                                      style={{
                                        ...commonTextProps.style,
                                        ['--stroke-ink' as string]: inkColor,
                                        ['--draw-dash' as string]: dashLen,
                                        ['--draw-dur' as string]: `${drawDur}s`,
                                        ['--draw-delay' as string]: `${drawDelay + lineIdx * 0.4}s`,
                                        ['--fill-delay' as string]: `${fillDelay + lineIdx * 0.4}s`
                                      }}
                                    >
                                      {lineText}
                                    </text>
                                  );
                                })}
                              </svg>
                            );
                          })()
                        ) : el.animation === 'deconstructed' && !isTrace && !isThreeDGlow ? (
                          <div
                            data-text-measure={el.id}
                            className="uecfi-deconstructed-stage"
                            style={{
                              pointerEvents: 'none',
                              ['--decon-dur' as string]: `${el.animationDuration ?? 5}s`
                            }}
                          >
                            <div style={{ ...sharedTextStyle, opacity: 0, pointerEvents: 'none' }}>
                              {applyListPrefix(el.text || '', el.listStyle)}
                            </div>
                            {[1, 2, 3, 4].map((sliceNum) => (
                              <div
                                key={sliceNum}
                                aria-hidden="true"
                                className={cn(
                                  `uecfi-deconstructed-slice-${sliceNum}`,
                                  isPopArt && 'uecfi-text-pop-art',
                                  isRetroStack && 'uecfi-text-retro-stack',
                                  isThreeDExtrude && 'uecfi-text-3d-extrude',
                                  isOverride && 'uecfi-text-override',
                                  isPrismSpin && 'uecfi-text-prism-spin',
                                  isShimmer && 'uecfi-text-shimmer'
                                )}
                                style={{
                                  ...sharedTextStyle,
                                  position: 'absolute',
                                  inset: 0,
                                  pointerEvents: 'none'
                                }}
                              >
                                {applyListPrefix(el.text || '', el.listStyle)}
                              </div>
                            ))}
                          </div>
                        ) : isThreeDGlow ? (
                          <div
                            data-text-measure={el.id}
                            className="uecfi-text-3d-glow-stage"
                            style={{ width: '100%', pointerEvents: 'none' }}
                          >
                            {Array.from({ length: 10 }, (_, layerIdx) => (
                              <div
                                key={layerIdx}
                                aria-hidden={layerIdx > 0 || undefined}
                                className="uecfi-text-3d-glow-layer"
                                style={{
                                  ...sharedTextStyle,
                                  ...(layerIdx > 0
                                    ? { position: 'absolute', inset: 0, pointerEvents: 'none' }
                                    : { position: 'relative' }),
                                  transform:
                                    layerIdx > 0
                                      ? `translateZ(${Number((layerIdx * 5 * scale).toFixed(2))}px)`
                                      : undefined
                                }}
                              >
                                {applyListPrefix(el.text || '', el.listStyle)}
                              </div>
                            ))}
                          </div>
                        ) : (isGradientText || isPrismSpin || isShimmer) && el.outlineWidth && el.outlineWidth > 0 ? (
                          <div
                            data-text-measure={el.id}
                            style={{ position: 'relative', width: '100%', pointerEvents: 'none' }}
                          >
                            <div
                              aria-hidden="true"
                              style={{
                                ...sharedTextStyle,
                                backgroundImage: undefined,
                                WebkitBackgroundClip: undefined,
                                backgroundClip: undefined,
                                WebkitTextFillColor: undefined,
                                color: 'transparent',
                                pointerEvents: 'none'
                              }}
                            >
                              {applyListPrefix(el.text || '', el.listStyle)}
                            </div>
                            <div
                              className={
                                isPrismSpin
                                  ? 'uecfi-text-prism-spin'
                                  : isShimmer
                                    ? 'uecfi-text-shimmer'
                                    : undefined
                              }
                              style={{
                                ...sharedTextStyle,
                                position: 'absolute',
                                inset: 0,
                                WebkitTextStroke: undefined,
                                paintOrder: undefined,
                                filter: undefined,
                                pointerEvents: 'none'
                              }}
                            >
                              {applyListPrefix(el.text || '', el.listStyle)}
                              {isShimmer && (
                                <span
                                  className="uecfi-shimmer-stars"
                                  style={buildShimmerStarsStyle(
                                    el.shimmerDensity,
                                    el.shimmerGlow,
                                    el.color,
                                    el.shimmerParticleSize
                                  )}
                                  aria-hidden="true"
                                />
                              )}
                            </div>
                          </div>
                        ) : (
                          <div
                            data-text-measure={el.id}
                            data-text={isOverride ? applyListPrefix(el.text || '', el.listStyle) : undefined}
                            className={
                              isPrismSpin
                                ? 'uecfi-text-prism-spin'
                                : isShimmer
                                  ? 'uecfi-text-shimmer'
                                  : isRainbow
                                    ? 'uecfi-text-rainbow'
                                    : isRainbowRipple
                                      ? 'uecfi-text-rainbow-ripple'
                                      : isOverride
                                        ? 'uecfi-text-override'
                                        : isVoltage
                                          ? 'uecfi-text-voltage'
                                          : isThreeDExtrude
                                            ? 'uecfi-text-3d-extrude'
                                            : isPopArt
                                              ? 'uecfi-text-pop-art'
                                              : isRetroStack
                                                ? 'uecfi-text-retro-stack'
                                                : isSlideStripes
                                                  ? 'uecfi-text-slide-stripes'
                                                  : isBlock3d
                                                    ? 'uecfi-text-block-3d'
                                                    : isAmazingPop
                                                      ? 'uecfi-text-amazing-pop'
                                                      : undefined
                            }
                            style={{ ...sharedTextStyle, pointerEvents: 'none' }}
                          >
                            {isRainbow ||
                            isRainbowRipple ||
                            isVoltage ||
                            el.animation === 'smokeDissolve' ||
                            el.animation === 'maskRise' ||
                            el.animation === 'powerOn' ||
                            el.animation === 'squishy' ||
                            el.animation === 'ripple'
                              ? (() => {
                                  const raw = applyListPrefix(el.text || '', el.listStyle);
                                  const isSmokeDissolve = el.animation === 'smokeDissolve';
                                  const isMaskRise = el.animation === 'maskRise';
                                  const isPowerOn = el.animation === 'powerOn';
                                  const isSquishy = el.animation === 'squishy';
                                  const isRipple = el.animation === 'ripple';
                                  const baseDelaySec = el.animationDelay ?? 0;
                                  const charDurationSec =
                                    el.animationDuration ??
                                    (isMaskRise
                                      ? 0.85
                                      : isPowerOn
                                        ? 1.2
                                        : isSquishy
                                          ? 1.5
                                          : isRipple
                                            ? 1.6
                                            : 1.1);
                                  const smokeUnit =
                                    el.animationUnit ?? (isMaskRise ? 'line' : 'character');
                                  const smokeDir = el.animationDirection ?? 'up';
                                  const smokeIntensity = el.animationIntensity ?? 1;

                                  let effectCharCounter = 0;
                                  const renderEffectSegment = (segment: string) => {
                                    if (!isRainbow && !isRainbowRipple && !isVoltage) return segment;
                                    return Array.from(segment).map((ch, i) => {
                                      const eIdx = effectCharCounter++;
                                      return (
                                        <span
                                          key={i}
                                          className={cn(
                                            isRainbow && 'uecfi-rainbow-static-char',
                                            isRainbowRipple && 'uecfi-rainbow-char',
                                            isVoltage && 'uecfi-voltage-char'
                                          )}
                                          style={{
                                            ...(isRainbow || isRainbowRipple
                                              ? {
                                                  ['--char-i' as string]: eIdx,
                                                  ['--rainbow-hsl' as string]: `hsl(${(eIdx * 42) % 360}, 88%, 66%)`
                                                }
                                              : {}),
                                            ...(isVoltage
                                              ? {
                                                  ['--i' as string]: eIdx,
                                                  WebkitTextStrokeWidth: `${Math.max(1, 2 * scale)}px`
                                                }
                                              : {})
                                          }}
                                        >
                                          {ch === ' ' ? '\u00A0' : ch}
                                        </span>
                                      );
                                    });
                                  };

                                  if (isMaskRise) {
                                    const maskY = smokeDir === 'down' ? '-112%' : '112%';
                                    const maskTiming = 'cubic-bezier(0.16, 0.84, 0.3, 1)';

                                    if (smokeUnit === 'line') {
                                      return raw.split('\n').map((line, lineIdx) => (
                                        <span key={lineIdx} className="uecfi-anim-mask uecfi-anim-mask--line">
                                          <span
                                            className="uecfi-anim-mask-inner"
                                            style={{
                                              ['--mask-y' as string]: maskY,
                                              animationDuration: `${charDurationSec}s`,
                                              animationTimingFunction: maskTiming,
                                              animationDelay: `${baseDelaySec + lineIdx * 0.14}s`
                                            }}
                                          >
                                            {line ? renderEffectSegment(line) : '\u00A0'}
                                          </span>
                                        </span>
                                      ));
                                    }

                                    if (smokeUnit === 'word') {
                                      let wordIdx = 0;
                                      return raw.split('\n').map((line, lineIdx, arr) => (
                                        <React.Fragment key={lineIdx}>
                                          {line.split(/(\s+)/).map((part, partIdx) => {
                                            if (/^\s+$/.test(part)) {
                                              return (
                                                <React.Fragment key={partIdx}>{part}</React.Fragment>
                                              );
                                            }
                                            if (!part) return null;
                                            const idx = wordIdx++;
                                            return (
                                              <span key={partIdx} className="uecfi-anim-mask">
                                                <span
                                                  className="uecfi-anim-mask-inner"
                                                  style={{
                                                    ['--mask-y' as string]: maskY,
                                                    animationDuration: `${charDurationSec}s`,
                                                    animationTimingFunction: maskTiming,
                                                    animationDelay: `${baseDelaySec + idx * 0.08}s`
                                                  }}
                                                >
                                                  {renderEffectSegment(part)}
                                                </span>
                                              </span>
                                            );
                                          })}
                                          {lineIdx < arr.length - 1 && <br />}
                                        </React.Fragment>
                                      ));
                                    }

                                    let maskCharIdx = 0;
                                    return raw.split('\n').map((line, lineIdx, arr) => (
                                      <React.Fragment key={lineIdx}>
                                        {Array.from(line).map((ch, chIdx) => {
                                          const idx = maskCharIdx++;
                                          return (
                                            <span key={chIdx} className="uecfi-anim-mask">
                                              <span
                                                className="uecfi-anim-mask-inner"
                                                style={{
                                                  ['--mask-y' as string]: maskY,
                                                  animationDuration: `${charDurationSec}s`,
                                                  animationTimingFunction: maskTiming,
                                                  animationDelay: `${baseDelaySec + idx * 0.035}s`
                                                }}
                                              >
                                                {renderEffectSegment(ch === ' ' ? '\u00A0' : ch)}
                                              </span>
                                            </span>
                                          );
                                        })}
                                        {lineIdx < arr.length - 1 && <br />}
                                      </React.Fragment>
                                    ));
                                  }

                                  if (isPowerOn) {
                                    if (smokeUnit === 'line') {
                                      return raw.split('\n').map((line, lineIdx, arr) => (
                                        <React.Fragment key={lineIdx}>
                                          <span
                                            className="uecfi-anim-poweron-char"
                                            style={{
                                              ['--poweron-dur' as string]: `${charDurationSec}s`,
                                              ['--poweron-delay' as string]: `${baseDelaySec + lineIdx * 0.22}s`,
                                              animationDuration: `${charDurationSec}s`,
                                              animationDelay: `${baseDelaySec + lineIdx * 0.22}s`
                                            }}
                                          >
                                            {line ? renderEffectSegment(line) : '\u00A0'}
                                          </span>
                                          {lineIdx < arr.length - 1 && <br />}
                                        </React.Fragment>
                                      ));
                                    }

                                    if (smokeUnit === 'word') {
                                      let wordIdx = 0;
                                      return raw.split('\n').map((line, lineIdx, arr) => (
                                        <React.Fragment key={lineIdx}>
                                          {line.split(/(\s+)/).map((part, partIdx) => {
                                            if (/^\s+$/.test(part)) {
                                              return (
                                                <React.Fragment key={partIdx}>{part}</React.Fragment>
                                              );
                                            }
                                            if (!part) return null;
                                            const idx = wordIdx++;
                                            return (
                                              <span
                                                key={partIdx}
                                                className="uecfi-anim-poweron-char"
                                                style={{
                                                  ['--poweron-dur' as string]: `${charDurationSec}s`,
                                                  ['--poweron-delay' as string]: `${baseDelaySec + idx * 0.18}s`,
                                                  animationDuration: `${charDurationSec}s`,
                                                  animationDelay: `${baseDelaySec + idx * 0.18}s`
                                                }}
                                              >
                                                {renderEffectSegment(part)}
                                              </span>
                                            );
                                          })}
                                          {lineIdx < arr.length - 1 && <br />}
                                        </React.Fragment>
                                      ));
                                    }

                                    let poCharIdx = 0;
                                    return raw.split('\n').map((line, lineIdx, arr) => (
                                      <React.Fragment key={lineIdx}>
                                        {Array.from(line).map((ch, chIdx) => {
                                          const idx = poCharIdx++;
                                          return (
                                            <span
                                              key={chIdx}
                                              className="uecfi-anim-poweron-char"
                                              style={{
                                                ['--poweron-dur' as string]: `${charDurationSec}s`,
                                                ['--poweron-delay' as string]: `${baseDelaySec + idx * 0.16}s`,
                                                animationDuration: `${charDurationSec}s`,
                                                animationDelay: `${baseDelaySec + idx * 0.16}s`
                                              }}
                                            >
                                              {renderEffectSegment(ch === ' ' ? '\u00A0' : ch)}
                                            </span>
                                          );
                                        })}
                                        {lineIdx < arr.length - 1 && <br />}
                                      </React.Fragment>
                                    ));
                                  }

                                  if (isRipple) {
                                    if (smokeUnit === 'line') {
                                      return raw.split('\n').map((line, lineIdx, arr) => (
                                        <React.Fragment key={lineIdx}>
                                          <span
                                            className="uecfi-anim-ripple-char"
                                            style={{
                                              ['--i' as string]: lineIdx,
                                              ['--ripple-k' as string]: smokeIntensity,
                                              animationDuration: `${charDurationSec}s`,
                                              animationDelay: `${lineIdx * -0.18}s`
                                            }}
                                          >
                                            {line ? renderEffectSegment(line) : '\u00A0'}
                                          </span>
                                          {lineIdx < arr.length - 1 && <br />}
                                        </React.Fragment>
                                      ));
                                    }

                                    if (smokeUnit === 'word') {
                                      let wordIdx = 0;
                                      return raw.split('\n').map((line, lineIdx, arr) => (
                                        <React.Fragment key={lineIdx}>
                                          {line.split(/(\s+)/).map((part, partIdx) => {
                                            if (/^\s+$/.test(part)) {
                                              return (
                                                <React.Fragment key={partIdx}>{part}</React.Fragment>
                                              );
                                            }
                                            if (!part) return null;
                                            const idx = wordIdx++;
                                            return (
                                              <span
                                                key={partIdx}
                                                className="uecfi-anim-ripple-char"
                                                style={{
                                                  ['--i' as string]: idx,
                                                  ['--ripple-k' as string]: smokeIntensity,
                                                  animationDuration: `${charDurationSec}s`,
                                                  animationDelay: `${idx * -0.15}s`
                                                }}
                                              >
                                                {renderEffectSegment(part)}
                                              </span>
                                            );
                                          })}
                                          {lineIdx < arr.length - 1 && <br />}
                                        </React.Fragment>
                                      ));
                                    }

                                    let ripCharIdx = 0;
                                    return raw.split('\n').map((line, lineIdx, arr) => (
                                      <React.Fragment key={lineIdx}>
                                        {Array.from(line).map((ch, chIdx) => {
                                          const idx = ripCharIdx++;
                                          return (
                                            <span
                                              key={chIdx}
                                              className="uecfi-anim-ripple-char"
                                              style={{
                                                ['--i' as string]: idx,
                                                ['--ripple-k' as string]: smokeIntensity,
                                                animationDuration: `${charDurationSec}s`,
                                                animationDelay: `${idx * -0.12}s`
                                              }}
                                            >
                                              {renderEffectSegment(ch === ' ' ? '\u00A0' : ch)}
                                            </span>
                                          );
                                        })}
                                        {lineIdx < arr.length - 1 && <br />}
                                      </React.Fragment>
                                    ));
                                  }

                                  if (isSquishy) {
                                    if (smokeUnit === 'line') {
                                      return raw.split('\n').map((line, lineIdx, arr) => (
                                        <React.Fragment key={lineIdx}>
                                          <span
                                            className="uecfi-anim-squishy-char"
                                            style={{
                                              ['--i' as string]: lineIdx,
                                              ['--squishy-k' as string]: smokeIntensity,
                                              animationDuration: `${charDurationSec}s`,
                                              animationDelay: `${lineIdx * -0.18}s`
                                            }}
                                          >
                                            {line ? renderEffectSegment(line) : '\u00A0'}
                                          </span>
                                          {lineIdx < arr.length - 1 && <br />}
                                        </React.Fragment>
                                      ));
                                    }

                                    if (smokeUnit === 'word') {
                                      let wordIdx = 0;
                                      return raw.split('\n').map((line, lineIdx, arr) => (
                                        <React.Fragment key={lineIdx}>
                                          {line.split(/(\s+)/).map((part, partIdx) => {
                                            if (/^\s+$/.test(part)) {
                                              return (
                                                <React.Fragment key={partIdx}>{part}</React.Fragment>
                                              );
                                            }
                                            if (!part) return null;
                                            const idx = wordIdx++;
                                            return (
                                              <span
                                                key={partIdx}
                                                className="uecfi-anim-squishy-char"
                                                style={{
                                                  ['--i' as string]: idx,
                                                  ['--squishy-k' as string]: smokeIntensity,
                                                  animationDuration: `${charDurationSec}s`,
                                                  animationDelay: `${idx * -0.15}s`
                                                }}
                                              >
                                                {renderEffectSegment(part)}
                                              </span>
                                            );
                                          })}
                                          {lineIdx < arr.length - 1 && <br />}
                                        </React.Fragment>
                                      ));
                                    }

                                    let sqCharIdx = 0;
                                    return raw.split('\n').map((line, lineIdx, arr) => (
                                      <React.Fragment key={lineIdx}>
                                        {Array.from(line).map((ch, chIdx) => {
                                          const idx = sqCharIdx++;
                                          return (
                                            <span
                                              key={chIdx}
                                              className="uecfi-anim-squishy-char"
                                              style={{
                                                ['--i' as string]: idx,
                                                ['--squishy-k' as string]: smokeIntensity,
                                                animationDuration: `${charDurationSec}s`,
                                                animationDelay: `${idx * -0.13}s`
                                              }}
                                            >
                                              {renderEffectSegment(ch === ' ' ? '\u00A0' : ch)}
                                            </span>
                                          );
                                        })}
                                        {lineIdx < arr.length - 1 && <br />}
                                      </React.Fragment>
                                    ));
                                  }

                                  if (isSmokeDissolve && smokeUnit === 'line') {
                                    return raw.split('\n').map((line, lineIdx, arr) => {
                                      const vec = getSmokeVector(
                                        lineIdx,
                                        smokeDir,
                                        smokeIntensity
                                      );
                                      return (
                                        <React.Fragment key={lineIdx}>
                                          <span
                                            className="uecfi-anim-smoke-char"
                                            style={{
                                              ['--sx' as string]: vec.x,
                                              ['--sy' as string]: vec.y,
                                              ['--sr' as string]: vec.r,
                                              animationDuration: `${charDurationSec}s`,
                                              animationDelay: `${baseDelaySec + lineIdx * 0.16}s`
                                            }}
                                          >
                                            {line ? renderEffectSegment(line) : '\u00A0'}
                                          </span>
                                          {lineIdx < arr.length - 1 && <br />}
                                        </React.Fragment>
                                      );
                                    });
                                  }

                                  if (isSmokeDissolve && smokeUnit === 'word') {
                                    let wordIdx = 0;
                                    return raw.split('\n').map((line, lineIdx, arr) => (
                                      <React.Fragment key={lineIdx}>
                                        {line.split(/(\s+)/).map((part, partIdx) => {
                                          if (/^\s+$/.test(part)) {
                                            return (
                                              <React.Fragment key={partIdx}>{part}</React.Fragment>
                                            );
                                          }
                                          if (!part) return null;
                                          const idx = wordIdx++;
                                          const vec = getSmokeVector(
                                            idx,
                                            smokeDir,
                                            smokeIntensity
                                          );
                                          return (
                                            <span
                                              key={partIdx}
                                              className="uecfi-anim-smoke-char"
                                              style={{
                                                ['--sx' as string]: vec.x,
                                                ['--sy' as string]: vec.y,
                                                ['--sr' as string]: vec.r,
                                                animationDuration: `${charDurationSec}s`,
                                                animationDelay: `${baseDelaySec + idx * 0.11}s`
                                              }}
                                            >
                                              {renderEffectSegment(part)}
                                            </span>
                                          );
                                        })}
                                        {lineIdx < arr.length - 1 && <br />}
                                      </React.Fragment>
                                    ));
                                  }

                                  let charIdx = 0;
                                  return raw.split('\n').map((line, lineIdx, arr) => (
                                    <React.Fragment key={lineIdx}>
                                      {Array.from(line).map((ch, chIdx) => {
                                        const idx = charIdx++;
                                        const vec = getSmokeVector(idx, smokeDir, smokeIntensity);
                                        if (isSmokeDissolve && (isRainbowRipple || isVoltage)) {
                                          return (
                                            <span
                                              key={chIdx}
                                              className="uecfi-anim-smoke-char"
                                              style={{
                                                ['--sx' as string]: vec.x,
                                                ['--sy' as string]: vec.y,
                                                ['--sr' as string]: vec.r,
                                                animationDuration: `${charDurationSec}s`,
                                                animationDelay: `${baseDelaySec + idx * 0.055}s`
                                              }}
                                            >
                                              {renderEffectSegment(ch === ' ' ? '\u00A0' : ch)}
                                            </span>
                                          );
                                        }
                                        return (
                                          <span
                                            key={chIdx}
                                            className={cn(
                                              isRainbow && 'uecfi-rainbow-static-char',
                                              isRainbowRipple && 'uecfi-rainbow-char',
                                              isVoltage && 'uecfi-voltage-char',
                                              isSmokeDissolve && 'uecfi-anim-smoke-char'
                                            )}
                                            style={{
                                              ...(isRainbow || isRainbowRipple
                                                ? {
                                                    ['--char-i' as string]: idx,
                                                    ['--rainbow-hsl' as string]: `hsl(${(idx * 42) % 360}, 88%, 66%)`
                                                  }
                                                : {}),
                                              ...(isVoltage
                                                ? {
                                                    ['--i' as string]: idx,
                                                    WebkitTextStrokeWidth: `${Math.max(1, 2 * scale)}px`
                                                  }
                                                : {}),
                                              ...(isSmokeDissolve
                                                ? {
                                                    ['--sx' as string]: vec.x,
                                                    ['--sy' as string]: vec.y,
                                                    ['--sr' as string]: vec.r,
                                                    animationDuration: `${charDurationSec}s`,
                                                    animationDelay: `${baseDelaySec + idx * 0.055}s`
                                                  }
                                                : {})
                                            }}
                                          >
                                            {ch === ' ' ? '\u00A0' : ch}
                                          </span>
                                        );
                                      })}
                                      {lineIdx < arr.length - 1 && <br />}
                                    </React.Fragment>
                                  ));
                                })()
                              : applyListPrefix(el.text || '', el.listStyle)}
                            {isShimmer && (
                              <span
                                className="uecfi-shimmer-stars"
                                style={buildShimmerStarsStyle(
                                  el.shimmerDensity,
                                  el.shimmerGlow,
                                  el.color,
                                  el.shimmerParticleSize
                                )}
                                aria-hidden="true"
                              />
                            )}
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
                          {/* Live dimension badge while resizing shapes */}
                          {resizingElId === el.id && el.kind === 'shape' && (
                            <div
                              className="pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/15 bg-slate-900/95 px-2 py-0.5 text-[0.68rem] font-semibold tabular-nums text-white shadow-lg"
                              style={el.y < 8 ? { bottom: -58 } : { top: -28 }}
                            >
                              {Math.round((el.width / 100) * 1920)} × {Math.round((el.height / 100) * 1080)} px
                            </div>
                          )}
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

              {/* Canva-style Floating Quick Toolbar (single, multi-selection, and groups) */}
              {selectedElements.length >= 1 &&
                !editingTextId &&
                !editingFrameId &&
                !resizingElId &&
                !rotatingInfo &&
                !activePopover &&
                (() => {
                  const isMulti = selectedElements.length > 1;
                  const firstEl = selectedElements[0];
                  const firstGroupId = firstEl?.groupId;
                  const isSingleGroup =
                    Boolean(firstGroupId) &&
                    selectedElements.every((item) => item.groupId === firstGroupId);
                  const hasAnyGroup = selectedElements.some((item) => item.groupId);
                  const allLocked = selectedElements.every((item) => item.locked);
                  const minX = Math.min(...selectedElements.map((item) => item.x));
                  const minY = Math.min(...selectedElements.map((item) => item.y));
                  const maxX = Math.max(...selectedElements.map((item) => item.x + item.width));
                  const maxY = Math.max(...selectedElements.map((item) => item.y + item.height));
                  const boxW = maxX - minX;
                  const boxH = maxY - minY;
                  const centerX = minX + boxW / 2;
                  const anchorKey = isMulti ? `multi:${selectedElIds.join(',')}` : firstEl.id;

                  const horizStyle: React.CSSProperties =
                    centerX < 12
                      ? { left: '1.5%' }
                      : centerX > 88
                        ? { right: '1.5%' }
                        : { left: `${centerX}%`, transform: 'translateX(-50%)' };
                  const vertStyle: React.CSSProperties =
                    minY < 10 && maxY > 85
                      ? { top: '1.5%' }
                      : minY < 10
                        ? { top: `calc(${maxY}% + 10px)` }
                        : { top: `calc(${minY}% - 44px)` };

                  const duplicateSelection = handleDuplicateSelection;

                  const deleteSelection = () => {
                    const toRemove = new Set(selectedElIds);
                    updateActiveElements((prev) => prev.filter((item) => !toRemove.has(item.id)));
                    setSelectedElIds([]);
                    setQuickMenuElId(null);
                    setQuickSubmenu(null);
                  };

                  const toggleLockSelection = () => {
                    const selectedSet = new Set(selectedElIds);
                    updateActiveElements((prev) =>
                      prev.map((item) =>
                        selectedSet.has(item.id) ? { ...item, locked: !allLocked } : item
                      )
                    );
                  };

                  const alignSelectionToPage = (
                    edge: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
                  ) => {
                    const dx =
                      edge === 'left'
                        ? -minX
                        : edge === 'center'
                          ? (100 - boxW) / 2 - minX
                          : edge === 'right'
                            ? 100 - boxW - minX
                            : 0;
                    const dy =
                      edge === 'top'
                        ? -minY
                        : edge === 'middle'
                          ? (100 - boxH) / 2 - minY
                          : edge === 'bottom'
                            ? 100 - boxH - minY
                            : 0;
                    const selectedSet = new Set(selectedElIds);
                    updateActiveElements((prev) =>
                      prev.map((item) =>
                        selectedSet.has(item.id)
                          ? {
                              ...item,
                              x: Number((item.x + dx).toFixed(2)),
                              y: Number((item.y + dy).toFixed(2))
                            }
                          : item
                      )
                    );
                    setQuickMenuElId(null);
                    setQuickSubmenu(null);
                  };

                  const moveSelectionLayerExtreme = (pos: 'front' | 'back') => {
                    const selectedSet = new Set(selectedElIds);
                    updateActiveElements((prev) => {
                      const sorted = [...prev].sort((a, b) => a.zIndex - b.zIndex);
                      const moving = sorted.filter((i) => selectedSet.has(i.id));
                      const staying = sorted.filter((i) => !selectedSet.has(i.id));
                      const next = pos === 'front' ? [...staying, ...moving] : [...moving, ...staying];
                      return next.map((item, idx) => ({ ...item, zIndex: idx + 1 }));
                    });
                    setQuickMenuElId(null);
                  };

                  return (
                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute',
                        ...horizStyle,
                        ...vertStyle,
                        zIndex: 997
                      }}
                    >
                      <div className="flex items-center gap-0.5 rounded-full border border-slate-200/80 bg-white px-1.5 py-1 text-slate-800 shadow-[0_6px_20px_rgba(0,0,0,0.38)]">
                        {isMulti && !isSingleGroup && (
                          <button
                            type="button"
                            title="Group selected items (Cmd/Ctrl+G)"
                            onClick={handleGroupSelected}
                            className="cursor-pointer rounded-full border-0 bg-transparent px-2.5 py-1 text-[0.76rem] font-semibold text-slate-800 transition-colors hover:bg-slate-100"
                          >
                            Group
                          </button>
                        )}
                        {isMulti && hasAnyGroup && (
                          <button
                            type="button"
                            title="Ungroup (Cmd/Ctrl+Shift+G)"
                            onClick={handleUngroupSelected}
                            className="cursor-pointer rounded-full border-0 bg-transparent px-2.5 py-1 text-[0.76rem] font-semibold text-slate-800 transition-colors hover:bg-slate-100"
                          >
                            Ungroup
                          </button>
                        )}
                        <button
                          type="button"
                          title={allLocked ? 'Unlock' : 'Lock position & size'}
                          onClick={toggleLockSelection}
                          className={cn(
                            'flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-0 transition-colors',
                            allLocked
                              ? 'bg-violet-100 text-violet-700'
                              : 'bg-transparent text-slate-700 hover:bg-slate-100'
                          )}
                        >
                          {allLocked ? <Lock size={14} /> : <Unlock size={14} />}
                        </button>
                        <button
                          type="button"
                          title="Duplicate (Cmd/Ctrl+D)"
                          onClick={duplicateSelection}
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-slate-700 transition-colors hover:bg-slate-100"
                        >
                          <CopyPlus size={14} />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          onClick={deleteSelection}
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-slate-700 transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={14} />
                        </button>
                        <button
                          type="button"
                          title="More actions"
                          onClick={(e) => {
                            setQuickSubmenu(null);
                            if (quickMenuElId === anchorKey) {
                              setQuickMenuElId(null);
                              setQuickMenuAnchor(null);
                              return;
                            }
                            const rect = e.currentTarget.getBoundingClientRect();
                            const menuW = 224;
                            const margin = 12;
                            const left = Math.max(
                              margin,
                              Math.min(
                                window.innerWidth - menuW - margin,
                                rect.left + rect.width / 2 - menuW / 2
                              )
                            );
                            const spaceBelow = window.innerHeight - rect.bottom - margin;
                            const spaceAbove = rect.top - margin;
                            if (spaceBelow >= 280 || spaceBelow >= spaceAbove) {
                              setQuickMenuAnchor({
                                left,
                                top: rect.bottom + 6,
                                maxHeight: Math.max(160, spaceBelow - 6)
                              });
                            } else {
                              setQuickMenuAnchor({
                                left,
                                bottom: window.innerHeight - rect.top + 6,
                                maxHeight: Math.max(160, spaceAbove - 6)
                              });
                            }
                            setQuickMenuElId(anchorKey);
                          }}
                          className={cn(
                            'flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-0 transition-colors',
                            quickMenuElId === anchorKey
                              ? 'bg-slate-200 text-slate-900'
                              : 'bg-transparent text-slate-700 hover:bg-slate-100'
                          )}
                        >
                          <MoreHorizontal size={15} />
                        </button>
                      </div>

                      {quickMenuElId === anchorKey &&
                        quickMenuAnchor &&
                        createPortal(
                          <div
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            className="fixed flex w-[224px] flex-col overflow-y-auto rounded-xl border border-slate-200 bg-white py-1.5 text-[0.78rem] text-slate-800 shadow-[0_14px_36px_rgba(0,0,0,0.42)]"
                            style={{
                              left: quickMenuAnchor.left,
                              ...(quickMenuAnchor.top !== undefined
                                ? { top: quickMenuAnchor.top }
                                : { bottom: quickMenuAnchor.bottom }),
                              maxHeight: quickMenuAnchor.maxHeight,
                              zIndex: 9999
                            }}
                          >
                            <button
                              type="button"
                              onClick={handleCopySelection}
                              className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent px-3 py-1.5 text-left hover:bg-slate-100"
                            >
                              <span className="flex items-center gap-2.5">
                                <Copy size={14} className="text-slate-600" /> Copy
                              </span>
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.65rem] text-slate-500">
                                ⌘C
                              </span>
                            </button>
                            <button
                              type="button"
                              disabled={!copiedClipboard || copiedClipboard.items.length === 0}
                              onClick={handlePasteCopied}
                              className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent px-3 py-1.5 text-left hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <span className="flex items-center gap-2.5">
                                <Clipboard size={14} className="text-slate-600" /> Paste
                              </span>
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.65rem] text-slate-500">
                                ⌘V
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={duplicateSelection}
                              className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent px-3 py-1.5 text-left hover:bg-slate-100"
                            >
                              <span className="flex items-center gap-2.5">
                                <CopyPlus size={14} className="text-slate-600" /> Duplicate
                              </span>
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.65rem] text-slate-500">
                                ⌘D
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={deleteSelection}
                              className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent px-3 py-1.5 text-left text-red-600 hover:bg-red-50"
                            >
                              <span className="flex items-center gap-2.5">
                                <Trash2 size={14} /> Delete
                              </span>
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.65rem] text-slate-500">
                                DEL
                              </span>
                            </button>

                            <div className="my-1 h-px bg-slate-200" />

                            <button
                              type="button"
                              onClick={() =>
                                setQuickSubmenu((s) => (s === 'layer' ? null : 'layer'))
                              }
                              className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent px-3 py-1.5 text-left hover:bg-slate-100"
                            >
                              <span className="flex items-center gap-2.5">
                                <Layers size={14} className="text-slate-600" /> Layer
                              </span>
                              <ChevronRight
                                size={14}
                                className={cn(
                                  'text-slate-400 transition-transform',
                                  quickSubmenu === 'layer' && 'rotate-90'
                                )}
                              />
                            </button>
                            {quickSubmenu === 'layer' && (
                              <div className="mx-2 mb-1 grid grid-cols-2 gap-1 rounded-lg bg-slate-50 p-1.5 text-[0.72rem]">
                                {!isMulti && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        moveElementLayer(firstEl.id, 1);
                                        setQuickMenuElId(null);
                                      }}
                                      className="cursor-pointer rounded border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:bg-slate-100"
                                    >
                                      Forward
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        moveElementLayer(firstEl.id, -1);
                                        setQuickMenuElId(null);
                                      }}
                                      className="cursor-pointer rounded border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:bg-slate-100"
                                    >
                                      Backward
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() => moveSelectionLayerExtreme('front')}
                                  className="cursor-pointer rounded border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:bg-slate-100"
                                >
                                  To Front
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveSelectionLayerExtreme('back')}
                                  className="cursor-pointer rounded border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:bg-slate-100"
                                >
                                  To Back
                                </button>
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                setQuickSubmenu((s) => (s === 'align' ? null : 'align'))
                              }
                              className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent px-3 py-1.5 text-left hover:bg-slate-100"
                            >
                              <span className="flex items-center gap-2.5">
                                <AlignCenter size={14} className="text-slate-600" /> Align to page
                              </span>
                              <ChevronRight
                                size={14}
                                className={cn(
                                  'text-slate-400 transition-transform',
                                  quickSubmenu === 'align' && 'rotate-90'
                                )}
                              />
                            </button>
                            {quickSubmenu === 'align' && (
                              <div className="mx-2 mb-1 grid grid-cols-3 gap-1 rounded-lg bg-slate-50 p-1.5 text-[0.72rem]">
                                {(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map(
                                  (edge) => (
                                    <button
                                      key={edge}
                                      type="button"
                                      onClick={() => alignSelectionToPage(edge)}
                                      className="cursor-pointer rounded border border-slate-200 bg-white px-1.5 py-1 capitalize text-slate-700 hover:bg-slate-100"
                                    >
                                      {edge}
                                    </button>
                                  )
                                )}
                              </div>
                            )}

                            <div className="my-1 h-px bg-slate-200" />

                            <button
                              type="button"
                              onClick={() => {
                                toggleLockSelection();
                                setQuickMenuElId(null);
                              }}
                              className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent px-3 py-1.5 text-left hover:bg-slate-100"
                            >
                              <span className="flex items-center gap-2.5">
                                {allLocked ? (
                                  <Unlock size={14} className="text-slate-600" />
                                ) : (
                                  <Lock size={14} className="text-slate-600" />
                                )}
                                {allLocked ? 'Unlock' : 'Lock'}
                              </span>
                            </button>

                            {!isMulti && firstEl.kind === 'image' && firstEl.imageSrc && (
                              <button
                                type="button"
                                onClick={() => {
                                  const bg = `url("${firstEl.imageSrc}") center / cover no-repeat`;
                                  setThemeBackground(bg);
                                  pushHistory(slidesRef.current, bg);
                                  setQuickMenuElId(null);
                                }}
                                className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent px-3 py-1.5 text-left hover:bg-slate-100"
                              >
                                <span className="flex items-center gap-2.5">
                                  <ImageIcon size={14} className="text-slate-600" /> Replace background
                                </span>
                              </button>
                            )}
                          </div>,
                          dialogRef.current ?? document.body
                        )}
                    </div>
                  );
                })()}

              {selectedElements.length > 1 &&
                (() => {
                  const minX = Math.min(...selectedElements.map((el) => el.x));
                  const minY = Math.min(...selectedElements.map((el) => el.y));
                  const maxX = Math.max(...selectedElements.map((el) => el.x + el.width));
                  const maxY = Math.max(...selectedElements.map((el) => el.y + el.height));
                  const isSingleGroup =
                    Boolean(selectedElements[0]?.groupId) &&
                    selectedElements.every((el) => el.groupId === selectedElements[0]?.groupId);
                  return (
                    <div
                      style={{
                        position: 'absolute',
                        left: `${minX}%`,
                        top: `${minY}%`,
                        width: `${maxX - minX}%`,
                        height: `${maxY - minY}%`,
                        border: isSingleGroup ? '1.5px solid #38bdf8' : '1.5px dashed #38bdf8',
                        pointerEvents: 'none',
                        zIndex: 998
                      }}
                    >
                      {!selectedElements.some((el) => el.locked) &&
                        (
                          [
                            { id: 'nw' as const, top: '-6px', left: '-6px', cursor: 'nwse-resize' },
                            { id: 'ne' as const, top: '-6px', right: '-6px', cursor: 'nesw-resize' },
                            { id: 'sw' as const, bottom: '-6px', left: '-6px', cursor: 'nesw-resize' },
                            { id: 'se' as const, bottom: '-6px', right: '-6px', cursor: 'nwse-resize' }
                          ] as const
                        ).map((h) => (
                          <div
                            key={h.id}
                            onPointerDown={(e) => startGroupResize(e, h.id)}
                            title="Drag to resize selection (Shift to lock aspect)"
                            style={{
                              position: 'absolute',
                              ...('top' in h ? { top: h.top } : {}),
                              ...('bottom' in h ? { bottom: h.bottom } : {}),
                              ...('left' in h ? { left: h.left } : {}),
                              ...('right' in h ? { right: h.right } : {}),
                              width: '12px',
                              height: '12px',
                              borderRadius: '999px',
                              background: '#ffffff',
                              border: '1.5px solid #38bdf8',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.45)',
                              cursor: h.cursor,
                              pointerEvents: 'auto'
                            }}
                          />
                        ))}
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
              className="flex h-[68px] shrink-0 items-center gap-2 overflow-x-auto border-t border-subtle bg-slate-900 px-3.5 py-2"
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
                    className={cn(
                      'flex min-w-[148px] max-w-[190px] shrink-0 items-center gap-1.5 rounded-[9px] border-2 px-2.5 py-1.5 transition-[border-color,opacity] duration-120',
                      isDragOver
                        ? 'border-sky-400'
                        : isActive
                          ? 'border-violet-500'
                          : 'border-subtle',
                      isActive ? 'bg-violet-600/20' : 'bg-panel-elevated',
                      isDragging ? 'cursor-grabbing opacity-45' : 'cursor-grab opacity-100',
                      isDragOver &&
                        (draggedSlideIdx !== null && draggedSlideIdx < idx
                          ? 'shadow-[inset_-3px_0_0_#38bdf8]'
                          : 'shadow-[inset_3px_0_0_#38bdf8]')
                    )}
                  >
                    <GripVertical
                      size={12}
                      className="shrink-0 text-text-secondary opacity-65"
                    />
                    <span
                      className={cn(
                        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] text-[0.7rem] font-bold text-white',
                        isActive ? 'bg-violet-600' : 'bg-white/8'
                      )}
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
                      className={cn(
                        'min-w-0 flex-1 border-0 bg-transparent px-0.5 py-px text-[0.76rem] text-text-primary outline-none',
                        isActive ? 'font-bold' : 'font-medium'
                      )}
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
                      className="cursor-pointer border-0 bg-transparent p-0.5 text-text-secondary opacity-80 hover:opacity-100"
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
                        className="cursor-pointer border-0 bg-transparent p-0.5 text-red-300 opacity-80 hover:opacity-100"
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
                className="inline-flex shrink-0 cursor-pointer items-center gap-[5px] rounded-[9px] border border-dashed border-violet-500/55 bg-violet-600/12 px-3.5 py-2 text-[0.78rem] font-bold text-violet-200 transition-colors hover:bg-violet-600/22"
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

const SECTION_TITLE_CLS =
  'text-[0.72rem] font-bold uppercase tracking-[0.06em] text-text-secondary';

const FIELD_LABEL_CLS = 'flex flex-col gap-1 text-[0.74rem] font-semibold text-text-secondary';

const INPUT_CLS =
  'w-full rounded-[7px] border border-subtle bg-app px-2 py-1.5 font-[inherit] text-[0.82rem] text-text-primary focus:border-accent focus:outline-none';

const BTN_CLS =
  'inline-flex items-center justify-center gap-[5px] rounded-[7px] border border-subtle bg-panel-elevated px-2.5 py-1.5 text-[0.78rem] font-semibold transition-colors';
