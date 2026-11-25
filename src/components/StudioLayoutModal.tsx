import React, { useEffect, useId, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Image as ImageIcon,
  Minus,
  RotateCcw,
  Shapes,
  Trash2,
  Type,
  UserSquare2,
  X
} from 'lucide-react';
import type {
  CanvasElement,
  ParticipantStageConfig,
  ShapeVariant,
  StudioBoxRect
} from '../../shared/types';
import { saveUserMediaFile } from '../utils/mediaUpload';
import { CanvasShapeGraphic } from './CanvasShapeGraphic';
import {
  DEFAULT_PARTICIPANT_BOX,
  DEFAULT_PRESENTATION_BOX,
  DEFAULT_STUDIO_BACKGROUND
} from './ParticipantOverlay';

interface StudioLayoutModalProps {
  open: boolean;
  onClose: () => void;
  stageConfig: ParticipantStageConfig;
  onSave: (next: Partial<ParticipantStageConfig>) => void;
}

type SelectionTarget =
  | { kind: 'presentation' }
  | { kind: 'participant' }
  | { kind: 'element'; id: string }
  | null;

const BG_PRESETS = [
  'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
  'linear-gradient(135deg, #090d16 0%, #1e1b4b 100%)',
  'linear-gradient(135deg, #022c22 0%, #0f172a 100%)',
  'linear-gradient(135deg, #31102f 0%, #0f172a 100%)',
  '#f8fafc',
  '#000000'
];

export const StudioLayoutModal: React.FC<StudioLayoutModalProps> = ({
  open,
  onClose,
  stageConfig,
  onSave
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const [background, setBackground] = useState(
    stageConfig.studioBackground || DEFAULT_STUDIO_BACKGROUND
  );
  const [presBox, setPresBox] = useState<StudioBoxRect>(
    stageConfig.studioPresentationBox ?? DEFAULT_PRESENTATION_BOX
  );
  const [partBox, setPartBox] = useState<StudioBoxRect>(
    stageConfig.studioParticipantBox ?? DEFAULT_PARTICIPANT_BOX
  );
  const [elements, setElements] = useState<CanvasElement[]>(
    stageConfig.studioElements ?? []
  );
  const [selection, setSelection] = useState<SelectionTarget>({ kind: 'presentation' });

  useEffect(() => {
    if (!open) return;
    setBackground(stageConfig.studioBackground || DEFAULT_STUDIO_BACKGROUND);
    setPresBox(stageConfig.studioPresentationBox ?? DEFAULT_PRESENTATION_BOX);
    setPartBox(stageConfig.studioParticipantBox ?? DEFAULT_PARTICIPANT_BOX);
    setElements(stageConfig.studioElements ?? []);
  }, [open, stageConfig]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const startDrag = (
    e: React.PointerEvent,
    target: SelectionTarget,
    mode: 'move' | 'resize'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setSelection(target);
    const stageEl = stageRef.current;
    if (!stageEl || !target) return;
    const rect = stageEl.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;

    const getInitial = () => {
      if (target.kind === 'presentation') return presBox;
      if (target.kind === 'participant') return partBox;
      const found = elements.find((el) => el.id === target.id);
      return found ? { x: found.x, y: found.y, width: found.width, height: found.height } : null;
    };

    const initial = getInitial();
    if (!initial) return;

    const onMove = (ev: PointerEvent) => {
      const dxPct = ((ev.clientX - startX) / rect.width) * 100;
      const dyPct = ((ev.clientY - startY) / rect.height) * 100;

      const applyRect = (cur: { x: number; y: number; width: number; height: number }) => {
        if (mode === 'move') {
          return {
            ...cur,
            x: Math.max(0, Math.min(100 - cur.width, Number((initial.x + dxPct).toFixed(1)))),
            y: Math.max(0, Math.min(100 - cur.height, Number((initial.y + dyPct).toFixed(1))))
          };
        }
        return {
          ...cur,
          width: Math.max(4, Math.min(100 - initial.x, Number((initial.width + dxPct).toFixed(1)))),
          height: Math.max(3, Math.min(100 - initial.y, Number((initial.height + dyPct).toFixed(1))))
        };
      };

      if (target.kind === 'presentation') {
        setPresBox((prev) => applyRect(prev));
      } else if (target.kind === 'participant') {
        setPartBox((prev) => applyRect(prev));
      } else {
        setElements((prev) =>
          prev.map((el) => (el.id === target.id ? { ...el, ...applyRect(el) } : el))
        );
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const addElement = (kind: CanvasElement['kind'], extra?: Partial<CanvasElement>) => {
    const id = `studio_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const maxZ = elements.reduce((m, e) => Math.max(m, e.zIndex), 1);
    const base: CanvasElement = {
      id,
      kind,
      x: 5,
      y: 76,
      width: kind === 'divider' ? 60 : kind === 'text' ? 40 : 16,
      height: kind === 'divider' ? 2 : kind === 'text' ? 12 : 16,
      zIndex: maxZ + 1,
      ...(kind === 'text'
        ? {
            text: 'Sunday Worship Service',
            fontFamily: 'Inter, sans-serif',
            fontSize: 44,
            fontWeight: '700',
            color: '#f8fafc',
            textAlign: 'left'
          }
        : {}),
      ...(kind === 'shape'
        ? {
            shapeType: 'rectangle' as ShapeVariant,
            backgroundColor: '#334155',
            borderRadius: 14,
            opacity: 0.9
          }
        : {}),
      ...(kind === 'divider'
        ? {
            color: '#38bdf8',
            thickness: 4
          }
        : {}),
      ...extra
    };
    setElements((prev) => [...prev, base]);
    setSelection({ kind: 'element', id });
  };

  const addSpeakerWidget = () => {
    addElement('participantWidget', {
      x: 2.5,
      y: 74,
      width: 44,
      height: 20,
      backgroundColor: '#0f172a',
      borderRadius: 16,
      opacity: 0.92,
      fontFamily: 'Inter, sans-serif',
      textAlign: 'left',
      widgetAccentColor: '#38bdf8',
      widgetInlineTitle: false,
      widgetTitleColor: '#93c5fd',
      widgetTitleSize: 28,
      widgetNameColor: '#f8fafc',
      widgetNameSize: 44,
      widgetCentroColor: '#cbd5e1',
      widgetCentroSize: 26
    });
  };

  const handleUploadElementImage = async (file: File) => {
    const savedUrl = await saveUserMediaFile(file);
    addElement('image', {
      x: 74,
      y: 6,
      width: 22,
      height: 22,
      imageSrc: savedUrl,
      borderRadius: 12
    });
  };

  const handleUploadBackgroundImage = async (file: File) => {
    const savedUrl = await saveUserMediaFile(file);
    setBackground(`url("${savedUrl}") center / cover no-repeat`);
  };

  const selectedElement =
    selection?.kind === 'element' ? elements.find((e) => e.id === selection.id) ?? null : null;

  const updateSelectedElement = (patch: Partial<CanvasElement>) => {
    if (!selectedElement) return;
    setElements((prev) =>
      prev.map((e) => (e.id === selectedElement.id ? { ...e, ...patch } : e))
    );
  };

  const handleSave = () => {
    onSave({
      layout: 'custom',
      studioBackground: background,
      studioPresentationBox: presBox,
      studioParticipantBox: partBox,
      studioElements: elements
    });
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      style={{ maxWidth: '1040px', width: '95vw' }}
    >
      <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 id={titleId} style={{ margin: 0, fontSize: '1.08rem', fontWeight: 700 }}>
            Customize Studio Layout
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                setBackground(DEFAULT_STUDIO_BACKGROUND);
                setPresBox(DEFAULT_PRESENTATION_BOX);
                setPartBox(DEFAULT_PARTICIPANT_BOX);
                setElements([]);
              }}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-panel-elevated)',
                fontSize: '0.78rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <RotateCcw size={13} /> Reset Default
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '6px',
                display: 'inline-flex'
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Add Elements & Background Toolbar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 10px',
            borderRadius: '10px',
            background: 'var(--bg-panel-elevated)',
            border: '1px solid var(--border-subtle)'
          }}
        >
          <button
            type="button"
            onClick={() => addElement('text')}
            style={{
              padding: '6px 10px',
              borderRadius: '7px',
              border: '1px solid var(--border-subtle)',
              background: 'transparent',
              fontSize: '0.78rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <Type size={13} /> + Text
          </button>
          <button
            type="button"
            onClick={addSpeakerWidget}
            style={{
              padding: '6px 10px',
              borderRadius: '7px',
              border: '1px solid rgba(56, 189, 248, 0.45)',
              background: 'rgba(56, 189, 248, 0.14)',
              color: '#7dd3fc',
              fontSize: '0.78rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <UserSquare2 size={13} /> + Speaker Widget
          </button>
          <button
            type="button"
            onClick={() => addElement('shape')}
            style={{
              padding: '6px 10px',
              borderRadius: '7px',
              border: '1px solid var(--border-subtle)',
              background: 'transparent',
              fontSize: '0.78rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <Shapes size={13} /> + Shape
          </button>
          <button
            type="button"
            onClick={() => addElement('divider')}
            style={{
              padding: '6px 10px',
              borderRadius: '7px',
              border: '1px solid var(--border-subtle)',
              background: 'transparent',
              fontSize: '0.78rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <Minus size={13} /> + Divider
          </button>
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            style={{
              padding: '6px 10px',
              borderRadius: '7px',
              border: '1px solid var(--border-subtle)',
              background: 'transparent',
              fontSize: '0.78rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <ImageIcon size={13} /> + Image
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUploadElementImage(f);
              e.target.value = '';
            }}
          />

          <div style={{ width: '1px', height: '20px', background: 'var(--border-subtle)', margin: '0 4px' }} />

          <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Backdrop:</span>
          {BG_PRESETS.map((preset, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setBackground(preset)}
              title="Background Preset"
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '6px',
                border: background === preset ? '2px solid #38bdf8' : '1px solid var(--border-subtle)',
                background: preset
              }}
            />
          ))}
          <input
            type="color"
            aria-label="Custom solid background color"
            onChange={(e) => setBackground(e.target.value)}
            style={{ width: '26px', height: '24px', padding: 0, border: 'none', background: 'transparent' }}
          />
          <button
            type="button"
            onClick={() => bgInputRef.current?.click()}
            style={{
              padding: '5px 8px',
              borderRadius: '7px',
              border: '1px solid var(--border-subtle)',
              background: 'transparent',
              fontSize: '0.75rem'
            }}
          >
            Upload BG
          </button>
          <input
            ref={bgInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUploadBackgroundImage(f);
              e.target.value = '';
            }}
          />
        </div>

        {/* Main Editor Grid: 16:9 Canvas + Inspector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 250px', gap: '14px', alignItems: 'start' }}>
          {/* 16:9 Stage Canvas */}
          <div
            ref={stageRef}
            onPointerDown={() => setSelection(null)}
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '16 / 9',
              background,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              borderRadius: '10px',
              overflow: 'hidden',
              border: '1px solid var(--border-subtle)',
              userSelect: 'none',
              touchAction: 'none'
            }}
          >
            {/* Custom Elements */}
            {[...elements]
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((el) => {
                const isSel = selection?.kind === 'element' && selection.id === el.id;
                const isVectorShape =
                  el.kind === 'shape' && el.shapeType && el.shapeType !== 'rectangle';
                return (
                  <div
                    key={el.id}
                    onPointerDown={(e) => startDrag(e, { kind: 'element', id: el.id }, 'move')}
                    style={{
                      position: 'absolute',
                      left: `${el.x}%`,
                      top: `${el.y}%`,
                      width: `${el.width}%`,
                      height: `${el.height}%`,
                      zIndex: el.zIndex,
                      cursor: 'move',
                      outline: isSel ? '2px solid #38bdf8' : '1px dashed rgba(255,255,255,0.2)',
                      backgroundColor:
                        el.kind === 'participantWidget' || (el.kind === 'shape' && !isVectorShape)
                          ? el.backgroundColor || '#0f172a'
                          : 'transparent',
                      borderRadius:
                        el.kind === 'shape' || el.kind === 'participantWidget'
                          ? `${Math.round((el.borderRadius ?? 0) * 0.4)}px`
                          : undefined,
                      opacity: el.opacity ?? 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent:
                        el.textAlign === 'left'
                          ? 'flex-start'
                          : el.textAlign === 'right'
                            ? 'flex-end'
                            : 'center',
                      color: el.color || '#f8fafc',
                      fontWeight: el.fontWeight || '700',
                      fontSize: `${Math.max(10, Math.round((el.fontSize ?? 40) * 0.38))}px`,
                      overflow: 'hidden'
                    }}
                  >
                    {el.kind === 'participantWidget' && (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          alignItems:
                            el.textAlign === 'right'
                              ? 'flex-end'
                              : el.textAlign === 'center'
                                ? 'center'
                                : 'flex-start',
                          textAlign: el.textAlign ?? 'left',
                          padding: '6px 10px',
                          borderLeft: el.widgetAccentColor
                            ? `3px solid ${el.widgetAccentColor}`
                            : undefined,
                          fontFamily: el.fontFamily || 'Inter, sans-serif',
                          gap: '2px'
                        }}
                      >
                        {el.widgetInlineTitle ? (
                          <div style={{ lineHeight: 1.15 }}>
                            <span
                              style={{
                                color: el.widgetTitleColor || '#93c5fd',
                                fontSize: `${Math.max(8, Math.round((el.widgetTitleSize ?? 32) * 0.35))}px`,
                                fontWeight: 600,
                                marginRight: '4px'
                              }}
                            >
                              Title
                            </span>
                            <span
                              style={{
                                color: el.widgetNameColor || '#f8fafc',
                                fontSize: `${Math.max(9, Math.round((el.widgetNameSize ?? 44) * 0.35))}px`,
                                fontWeight: 800
                              }}
                            >
                              Participant Name
                            </span>
                          </div>
                        ) : (
                          <>
                            <div
                              style={{
                                color: el.widgetTitleColor || '#93c5fd',
                                fontSize: `${Math.max(8, Math.round((el.widgetTitleSize ?? 28) * 0.35))}px`,
                                fontWeight: 600,
                                lineHeight: 1.1
                              }}
                            >
                              Title
                            </div>
                            <div
                              style={{
                                color: el.widgetNameColor || '#f8fafc',
                                fontSize: `${Math.max(9, Math.round((el.widgetNameSize ?? 44) * 0.35))}px`,
                                fontWeight: 800,
                                lineHeight: 1.1
                              }}
                            >
                              Participant Name
                            </div>
                          </>
                        )}
                        <div
                          style={{
                            color: el.widgetCentroColor || '#cbd5e1',
                            fontSize: `${Math.max(7, Math.round((el.widgetCentroSize ?? 26) * 0.35))}px`,
                            fontWeight: 500,
                            lineHeight: 1.15
                          }}
                        >
                          Centro / Position
                        </div>
                      </div>
                    )}
                    {el.kind === 'text' && (
                      <span style={{ whiteSpace: 'pre-wrap', width: '100%', textAlign: el.textAlign || 'left' }}>
                        {el.text}
                      </span>
                    )}
                    {isVectorShape && el.shapeType && (
                      <CanvasShapeGraphic
                        shapeType={el.shapeType}
                        fill={el.backgroundColor || '#334155'}
                      />
                    )}
                    {el.kind === 'divider' && (
                      <div
                        style={{
                          width: '100%',
                          height: `${Math.max(2, Math.round((el.thickness ?? 4) * 0.5))}px`,
                          background: el.color || '#38bdf8'
                        }}
                      />
                    )}
                    {el.kind === 'image' && el.imageSrc && (
                      <img
                        src={el.imageSrc}
                        alt=""
                        draggable={false}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          borderRadius: `${el.borderRadius ?? 0}px`
                        }}
                      />
                    )}
                    {isSel && (
                      <div
                        onPointerDown={(e) => startDrag(e, { kind: 'element', id: el.id }, 'resize')}
                        style={{
                          position: 'absolute',
                          right: 0,
                          bottom: 0,
                          width: '12px',
                          height: '12px',
                          background: '#38bdf8',
                          cursor: 'nwse-resize'
                        }}
                      />
                    )}
                  </div>
                );
              })}

            {/* Presentation Box */}
            <div
              onPointerDown={(e) => startDrag(e, { kind: 'presentation' }, 'move')}
              style={{
                position: 'absolute',
                left: `${presBox.x}%`,
                top: `${presBox.y}%`,
                width: `${presBox.width}%`,
                height: `${presBox.height}%`,
                background: 'rgba(84, 102, 118, 0.92)',
                borderRadius: `${Math.round((presBox.borderRadius ?? 16) * 0.5)}px`,
                border:
                  selection?.kind === 'presentation'
                    ? '2px solid #38bdf8'
                    : '1px solid rgba(255,255,255,0.25)',
                zIndex: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.95rem',
                letterSpacing: '0.06em',
                cursor: 'move'
              }}
            >
              PRESENTATION
              <div
                onPointerDown={(e) => startDrag(e, { kind: 'presentation' }, 'resize')}
                style={{
                  position: 'absolute',
                  right: 2,
                  bottom: 2,
                  width: '12px',
                  height: '12px',
                  background: '#38bdf8',
                  borderRadius: '2px',
                  cursor: 'nwse-resize'
                }}
              />
            </div>

            {/* Participant Box */}
            <div
              onPointerDown={(e) => startDrag(e, { kind: 'participant' }, 'move')}
              style={{
                position: 'absolute',
                left: `${partBox.x}%`,
                top: `${partBox.y}%`,
                width: `${partBox.width}%`,
                height: `${partBox.height}%`,
                background: 'rgba(84, 102, 118, 0.92)',
                borderRadius: `${Math.round((partBox.borderRadius ?? 16) * 0.5)}px`,
                border:
                  selection?.kind === 'participant'
                    ? '2px solid #38bdf8'
                    : '1px solid rgba(255,255,255,0.25)',
                zIndex: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.78rem',
                letterSpacing: '0.05em',
                cursor: 'move'
              }}
            >
              PARTICIPANT
              <div
                onPointerDown={(e) => startDrag(e, { kind: 'participant' }, 'resize')}
                style={{
                  position: 'absolute',
                  right: 2,
                  bottom: 2,
                  width: '12px',
                  height: '12px',
                  background: '#38bdf8',
                  borderRadius: '2px',
                  cursor: 'nwse-resize'
                }}
              />
            </div>
          </div>

          {/* Right Inspector Panel */}
          <div
            style={{
              padding: '12px',
              borderRadius: '10px',
              background: 'var(--bg-panel-elevated)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              fontSize: '0.78rem'
            }}
          >
            {selection?.kind === 'presentation' && (
              <>
                <strong>Presentation Box</strong>
                <label>
                  Corner Radius: {presBox.borderRadius ?? 16}px
                  <input
                    type="range"
                    min={0}
                    max={48}
                    value={presBox.borderRadius ?? 16}
                    onChange={(e) => setPresBox((p) => ({ ...p, borderRadius: Number(e.target.value) }))}
                    style={{ width: '100%' }}
                  />
                </label>
              </>
            )}

            {selection?.kind === 'participant' && (
              <>
                <strong>Participant Box</strong>
                <label>
                  Corner Radius: {partBox.borderRadius ?? 16}px
                  <input
                    type="range"
                    min={0}
                    max={48}
                    value={partBox.borderRadius ?? 16}
                    onChange={(e) => setPartBox((p) => ({ ...p, borderRadius: Number(e.target.value) }))}
                    style={{ width: '100%' }}
                  />
                </label>
              </>
            )}

            {selectedElement && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{selectedElement.kind.toUpperCase()} Element</strong>
                  <button
                    type="button"
                    onClick={() => {
                      setElements((prev) => prev.filter((e) => e.id !== selectedElement.id));
                      setSelection(null);
                    }}
                    style={{
                      padding: '4px 6px',
                      borderRadius: '6px',
                      border: '1px solid rgba(239,68,68,0.4)',
                      background: 'transparent',
                      color: '#f87171',
                      display: 'inline-flex'
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {selectedElement.kind === 'participantWidget' && (
                  <>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedElement.widgetInlineTitle)}
                        onChange={(e) =>
                          updateSelectedElement({ widgetInlineTitle: e.target.checked })
                        }
                      />
                      <span>Inline Title + Name</span>
                    </label>
                    <label>
                      Font Family
                      <select
                        value={selectedElement.fontFamily || 'Inter, sans-serif'}
                        onChange={(e) => updateSelectedElement({ fontFamily: e.target.value })}
                        style={{
                          width: '100%',
                          marginTop: '3px',
                          padding: '5px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          background: 'var(--bg-app)',
                          color: 'var(--text-primary)'
                        }}
                      >
                        <option value="Inter, sans-serif">Inter</option>
                        <option value="Montserrat, sans-serif">Montserrat</option>
                        <option value="Oswald, sans-serif">Oswald</option>
                        <option value="Playfair Display, serif">Playfair Display</option>
                        <option value="Merriweather, serif">Merriweather</option>
                      </select>
                    </label>
                    <select
                      aria-label="Widget Alignment"
                      value={selectedElement.textAlign || 'left'}
                      onChange={(e) =>
                        updateSelectedElement({
                          textAlign: e.target.value as 'left' | 'center' | 'right'
                        })
                      }
                      style={{
                        padding: '5px 6px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-app)',
                        color: 'var(--text-primary)'
                      }}
                    >
                      <option value="left">Align Left</option>
                      <option value="center">Align Center</option>
                      <option value="right">Align Right</option>
                    </select>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>BG</span>
                        <input
                          type="color"
                          value={selectedElement.backgroundColor || '#0f172a'}
                          onChange={(e) =>
                            updateSelectedElement({ backgroundColor: e.target.value })
                          }
                        />
                      </label>
                      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Accent</span>
                        <input
                          type="color"
                          value={selectedElement.widgetAccentColor || '#38bdf8'}
                          onChange={(e) =>
                            updateSelectedElement({ widgetAccentColor: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <label>
                      Opacity: {Math.round((selectedElement.opacity ?? 1) * 100)}%
                      <input
                        type="range"
                        min={10}
                        max={100}
                        value={Math.round((selectedElement.opacity ?? 1) * 100)}
                        onChange={(e) =>
                          updateSelectedElement({ opacity: Number(e.target.value) / 100 })
                        }
                        style={{ width: '100%' }}
                      />
                    </label>
                    <label>
                      Corner Radius: {selectedElement.borderRadius ?? 16}px
                      <input
                        type="range"
                        min={0}
                        max={48}
                        value={selectedElement.borderRadius ?? 16}
                        onChange={(e) =>
                          updateSelectedElement({ borderRadius: Number(e.target.value) })
                        }
                        style={{ width: '100%' }}
                      />
                    </label>
                    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Title ({selectedElement.widgetTitleSize ?? 32}px)</span>
                        <input
                          type="color"
                          value={selectedElement.widgetTitleColor || '#93c5fd'}
                          onChange={(e) =>
                            updateSelectedElement({ widgetTitleColor: e.target.value })
                          }
                        />
                      </label>
                      <input
                        type="range"
                        min={16}
                        max={72}
                        value={selectedElement.widgetTitleSize ?? 32}
                        onChange={(e) =>
                          updateSelectedElement({ widgetTitleSize: Number(e.target.value) })
                        }
                        style={{ width: '100%' }}
                      />
                      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Name ({selectedElement.widgetNameSize ?? 44}px)</span>
                        <input
                          type="color"
                          value={selectedElement.widgetNameColor || '#f8fafc'}
                          onChange={(e) =>
                            updateSelectedElement({ widgetNameColor: e.target.value })
                          }
                        />
                      </label>
                      <input
                        type="range"
                        min={20}
                        max={96}
                        value={selectedElement.widgetNameSize ?? 44}
                        onChange={(e) =>
                          updateSelectedElement({ widgetNameSize: Number(e.target.value) })
                        }
                        style={{ width: '100%' }}
                      />
                      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Centro/Pos ({selectedElement.widgetCentroSize ?? 26}px)</span>
                        <input
                          type="color"
                          value={selectedElement.widgetCentroColor || '#cbd5e1'}
                          onChange={(e) =>
                            updateSelectedElement({ widgetCentroColor: e.target.value })
                          }
                        />
                      </label>
                      <input
                        type="range"
                        min={14}
                        max={64}
                        value={selectedElement.widgetCentroSize ?? 26}
                        onChange={(e) =>
                          updateSelectedElement({ widgetCentroSize: Number(e.target.value) })
                        }
                        style={{ width: '100%' }}
                      />
                    </div>
                  </>
                )}

                {selectedElement.kind === 'text' && (
                  <>
                    <textarea
                      rows={3}
                      value={selectedElement.text ?? ''}
                      onChange={(e) => updateSelectedElement({ text: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-app)',
                        color: 'var(--text-primary)'
                      }}
                    />
                    <label>
                      Font Family
                      <select
                        value={selectedElement.fontFamily || 'Inter, sans-serif'}
                        onChange={(e) => updateSelectedElement({ fontFamily: e.target.value })}
                        style={{
                          width: '100%',
                          marginTop: '3px',
                          padding: '5px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          background: 'var(--bg-app)',
                          color: 'var(--text-primary)'
                        }}
                      >
                        <option value="Inter, sans-serif">Inter</option>
                        <option value="Montserrat, sans-serif">Montserrat</option>
                        <option value="Oswald, sans-serif">Oswald</option>
                        <option value="Playfair Display, serif">Playfair Display</option>
                        <option value="Merriweather, serif">Merriweather</option>
                      </select>
                    </label>
                    <label>
                      Font Size: {selectedElement.fontSize ?? 44}px
                      <input
                        type="range"
                        min={18}
                        max={120}
                        value={selectedElement.fontSize ?? 44}
                        onChange={(e) => updateSelectedElement({ fontSize: Number(e.target.value) })}
                        style={{ width: '100%' }}
                      />
                    </label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <select
                        aria-label="Font Weight"
                        value={selectedElement.fontWeight || '700'}
                        onChange={(e) =>
                          updateSelectedElement({
                            fontWeight: e.target.value as '400' | '600' | '700' | '800'
                          })
                        }
                        style={{
                          flex: 1,
                          padding: '5px 6px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          background: 'var(--bg-app)',
                          color: 'var(--text-primary)'
                        }}
                      >
                        <option value="400">Regular</option>
                        <option value="600">SemiBold</option>
                        <option value="700">Bold</option>
                        <option value="800">ExtraBold</option>
                      </select>
                      <select
                        aria-label="Text Alignment"
                        value={selectedElement.textAlign || 'left'}
                        onChange={(e) =>
                          updateSelectedElement({
                            textAlign: e.target.value as 'left' | 'center' | 'right'
                          })
                        }
                        style={{
                          flex: 1,
                          padding: '5px 6px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          background: 'var(--bg-app)',
                          color: 'var(--text-primary)'
                        }}
                      >
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>
                    </div>
                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Text Color</span>
                      <input
                        type="color"
                        value={selectedElement.color || '#f8fafc'}
                        onChange={(e) => updateSelectedElement({ color: e.target.value })}
                      />
                    </label>
                  </>
                )}

                {selectedElement.kind === 'shape' && (
                  <>
                    <select
                      value={selectedElement.shapeType || 'rectangle'}
                      onChange={(e) =>
                        updateSelectedElement({ shapeType: e.target.value as ShapeVariant })
                      }
                      style={{
                        padding: '5px 8px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-app)',
                        color: 'var(--text-primary)'
                      }}
                    >
                      <option value="rectangle">Rectangle</option>
                      <option value="circle">Circle</option>
                      <option value="triangle">Triangle</option>
                      <option value="diamond">Diamond</option>
                      <option value="star">Star</option>
                      <option value="hexagon">Hexagon</option>
                      <option value="arrowRight">Arrow</option>
                      <option value="cross">Cross</option>
                    </select>
                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Fill Color</span>
                      <input
                        type="color"
                        value={selectedElement.backgroundColor || '#334155'}
                        onChange={(e) => updateSelectedElement({ backgroundColor: e.target.value })}
                      />
                    </label>
                    <label>
                      Opacity: {Math.round((selectedElement.opacity ?? 1) * 100)}%
                      <input
                        type="range"
                        min={10}
                        max={100}
                        value={Math.round((selectedElement.opacity ?? 1) * 100)}
                        onChange={(e) => updateSelectedElement({ opacity: Number(e.target.value) / 100 })}
                        style={{ width: '100%' }}
                      />
                    </label>
                  </>
                )}

                {selectedElement.kind === 'divider' && (
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Line Color</span>
                    <input
                      type="color"
                      value={selectedElement.color || '#38bdf8'}
                      onChange={(e) => updateSelectedElement({ color: e.target.value })}
                    />
                  </label>
                )}

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => updateSelectedElement({ zIndex: selectedElement.zIndex + 1 })}
                    style={{ flex: 1, padding: '5px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                  >
                    <ArrowUp size={12} /> Forward
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSelectedElement({ zIndex: Math.max(0, selectedElement.zIndex - 1) })}
                    style={{ flex: 1, padding: '5px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                  >
                    <ArrowDown size={12} /> Back
                  </button>
                </div>
              </>
            )}

            {!selection && (
              <div style={{ color: 'var(--text-secondary)' }}>
                Drag and resize Presentation, Participant, or add elements on the stage.
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              background: 'transparent'
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: '#2563eb',
              color: '#fff',
              fontWeight: 700
            }}
          >
            Save &amp; Apply Studio Layout
          </button>
        </div>
      </div>
    </dialog>
  );
};
