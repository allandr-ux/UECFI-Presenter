import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bell,
  BookOpen,
  Camera,
  CameraOff,
  Cast,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Church,
  Clock,
  Copy,
  Download,
  Edit3,
  Eraser,
  FileText,
  GripVertical,
  Image as ImageIcon,
  LayoutTemplate,
  Link2,
  ListMusic,
  Maximize2,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  MoreVertical,
  Music,
  Pause,
  Pencil,
  Play,
  Plus,
  Presentation,
  Radio,
  RotateCcw,
  Search,
  Settings,
  Settings2,
  Sliders,
  Square,
  Trash2,
  Tv,
  Unlink,
  Upload,
  UserCheck,
  UserMinus,
  Users,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import type {
  BibleLayoutMode,
  ContentType,
  DisplayInfo,
  LiveState,
  LyricsDisplayMode,
  OutputOverride,
  OverflowCameraAngle,
  OverflowStageConfig,
  ParticipantModerationAction,
  ParticipantNetworkSettings,
  ParticipantSignalMessage,
  ParticipantStageConfig,
  Program,
  ProgramItem,
  RemoteCommandMessage,
  RemoteConnectionInfo,
  RemoteParticipant,
  RemoteReturnFeedConfig
} from '../../shared/types';
import { useTerminology } from '../hooks/useTerminology';
import { INITIAL_PROGRAM, SAMPLE_LIBRARY_ITEMS } from '../data/sampleData';
import {
  hydrateProgram,
  loadAppState,
  saveAppState,
  type PersistedProgramRef
} from '../utils/appStorage';
import {
  bundleLocalMediaForExport,
  restoreBundledMediaOnImport,
  saveUserMediaFile
} from '../utils/mediaUpload';
import { MainScreenView } from './MainScreenView';
import { ScaledMainScreenPreview } from './ScaledMainScreenPreview';
import { RemoteParticipantsPanel } from './RemoteParticipantsPanel';
import { StudioLayoutModal } from './StudioLayoutModal';
import { ParticipantBroadcaster, ScreenStreamReceiver, buildIceServers } from '../utils/webrtcRoom';
import { MAIN_ROOM_CAMERA_ID, buildOverflowLiveState } from '../utils/overflowState';
import { BackgroundImagePicker } from './BackgroundImagePicker';
import { DisplaySetupModal } from './DisplaySetupModal';
import { BibleLibraryPanel } from './BibleLibraryPanel';
import { ItemEditorModal } from './ItemEditorModal';
import { SlideBuilderModal } from './SlideBuilderModal';
import { CanvasSlideStage } from './CanvasSlideStage';
import { BibleProgramPicker } from './BibleProgramPicker';
import { BibleSearchPanel } from './BibleSearchPanel';
import { LyricsSyncModal } from './LyricsSyncModal';
import {
  findActiveTimedLineIndex,
  findBlockIndexForTime,
  flattenSongTimedLines,
  formatTimestamp
} from '../utils/timedLyrics';
import { loadImportedBibles, saveImportedBible } from '../utils/bibleStorage';
import { resolveVerseItemWithActiveBibles } from '../utils/bibleVerseResolver';
import { parseBibleXml } from '../utils/bibleXmlParser';
import { readTextFileWithEncoding } from '../utils/textEncoding';
import uecfiLogoTiny from '../assets/uecfi-logo-tiny.png';

const BIBLE_IMPORT_PROMPT_DISMISSED_KEY = 'uecfi_bible_import_prompt_dismissed_v1';

function getTypeIcon(type: ContentType) {
  switch (type) {
    case 'song':
      return <Music size={14} />;
    case 'verse':
      return <BookOpen size={14} />;
    case 'slide':
      return <Presentation size={14} />;
    case 'programItem':
      return <FileText size={14} />;
  }
}

/**
 * Hidden audio element used for LIVE remote participant output (System Default)
 * and operator "Listen" monitoring (routable to a specific output device like headphones via setSinkId).
 */
const ParticipantMonitorAudio: React.FC<{
  stream?: MediaStream;
  muted: boolean;
  sinkId?: string;
}> = ({ stream, muted, sinkId }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = audioRef.current as (HTMLAudioElement & {
      setSinkId?: (deviceId: string) => Promise<void>;
    }) | null;
    if (!el) return;

    let cancelled = false;

    const configureAndPlay = async () => {
      // Wrap only audio tracks in a dedicated MediaStream so Chromium/macOS
      // routes this <audio> element independently from muted <video> previews.
      const audioTracks = stream?.getAudioTracks() ?? [];
      const audioOnlyStream = audioTracks.length > 0 ? new MediaStream(audioTracks) : null;
      el.srcObject = audioOnlyStream;
      el.muted = muted;

      if (typeof el.setSinkId === 'function') {
        try {
          await el.setSinkId(sinkId || 'default');
        } catch (err) {
          console.warn('[Audio] setSinkId failed for device:', sinkId || 'default', err);
        }
      }

      if (!cancelled && audioOnlyStream && !muted) {
        el.play().catch(() => {});
      }
    };

    void configureAndPlay();
    return () => {
      cancelled = true;
    };
  }, [stream, muted, sinkId]);

  return <audio ref={audioRef} autoPlay playsInline muted={muted} style={{ display: 'none' }} />;
};

function generateCentroCode(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let suffix = '';
  for (let i = 0; i < 5; i++) {
    suffix += letters[Math.floor(Math.random() * letters.length)];
  }
  return `UECFI-${suffix}`;
}

export const OperatorConsole: React.FC = () => {
  const t = useTerminology();
  const [programs, setPrograms] = useState<PersistedProgramRef[]>(() => [
    {
      id: INITIAL_PROGRAM.id,
      name: INITIAL_PROGRAM.name,
      date: INITIAL_PROGRAM.date,
      entries: INITIAL_PROGRAM.items.map((it) =>
        it.type === 'slide'
          ? { kind: 'slide', item: it }
          : { kind: 'ref', itemId: it.sourceId ?? it.id }
      )
    }
  ]);
  const [activeProgramId, setActiveProgramId] = useState<string>(INITIAL_PROGRAM.id);
  const programRef = useMemo(
    () => programs.find((p) => p.id === activeProgramId) ?? programs[0],
    [programs, activeProgramId]
  );
  const setProgramRef = useCallback(
    (updater: React.SetStateAction<PersistedProgramRef>) => {
      setPrograms((prev) =>
        prev.map((p) => {
          if (p.id !== programRef.id) return p;
          return typeof updater === 'function' ? updater(p) : updater;
        })
      );
    },
    [programRef.id]
  );
  const [library, setLibrary] = useState<ProgramItem[]>(() =>
    SAMPLE_LIBRARY_ITEMS.filter((it) => it.type !== 'slide')
  );
  const program = useMemo(() => hydrateProgram(programRef, library), [programRef, library]);
  const [stateLoaded, setStateLoaded] = useState(false);
  // Browsing state (shown in Content Grid without affecting live output)
  const [browsingItemId, setBrowsingItemId] = useState<string>(INITIAL_PROGRAM.items[0]?.id ?? '');
  const [browsingAdHocItem, setBrowsingAdHocItem] = useState<ProgramItem | null>(null);
  const [highlightedVerseBlockIndex, setHighlightedVerseBlockIndex] = useState<number | null>(null);
  // Live state (actually projected on Main Screen, Live Monitor, Stage View, and Remote Viewer)
  // Start in standby (no item projected) until the operator selects a slide/item to present.
  const [liveItemId, setLiveItemId] = useState<string>('');
  const [liveAdHocItem, setLiveAdHocItem] = useState<ProgramItem | null>(null);
  const [activeBlockIndex, setActiveBlockIndex] = useState<number>(0);
  const [override, setOverride] = useState<OutputOverride>('none');

  const [mainScreenOpen, setMainScreenOpen] = useState(false);
  const [overflowScreenOpen, setOverflowScreenOpen] = useState(false);
  const [liveMonitorTarget, setLiveMonitorTarget] = useState<'main' | 'overflow'>('main');
  const [layoutsLinked, setLayoutsLinked] = useState<boolean>(() => {
    try {
      return localStorage.getItem('uecfi_layouts_linked_v1') === 'true';
    } catch {
      return false;
    }
  });
  const [mainRoomPreviewStream, setMainRoomPreviewStream] = useState<MediaStream | null>(null);
  const [overflowCameraStreams, setOverflowCameraStreams] = useState<Map<string, MediaStream>>(
    new Map()
  );
  const [overflowStudioModalOpen, setOverflowStudioModalOpen] = useState(false);
  const [overflowCameras, setOverflowCameras] = useState<Array<{ deviceId: string; label: string }>>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [returnAudioDevices, setReturnAudioDevices] = useState<Array<{ deviceId: string; label: string }>>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<Array<{ deviceId: string; label: string }>>([]);
  const [monitorOutputDeviceId, setMonitorOutputDeviceId] = useState<string>(() => {
    try {
      return localStorage.getItem('uecfi_monitor_output_device_v1') || '';
    } catch {
      return '';
    }
  });
  const [whisperInputDeviceId, setWhisperInputDeviceId] = useState<string>(() => {
    try {
      return localStorage.getItem('uecfi_whisper_input_device_v1') || 'default';
    } catch {
      return 'default';
    }
  });
  const [whisperAudioTrack, setWhisperAudioTrack] = useState<MediaStreamTrack | null>(null);
  const whisperAudioStreamRef = useRef<MediaStream | null>(null);
  const [returnFeedConfig, setReturnFeedConfig] = useState<RemoteReturnFeedConfig>(() => {
    try {
      const saved = localStorage.getItem('uecfi_return_feed_v1');
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<RemoteReturnFeedConfig>;
        return {
          sendVideo: parsed.sendVideo !== false,
          audioDeviceId: parsed.audioDeviceId || '',
          autoMuteWhenLive: parsed.autoMuteWhenLive !== false
        };
      }
    } catch {
      // Ignore malformed saved return feed config
    }
    return { sendVideo: true, audioDeviceId: '', autoMuteWhenLive: true };
  });
  const [returnAudioManualUnmute, setReturnAudioManualUnmute] = useState(false);
  const [returnAudioTrack, setReturnAudioTrack] = useState<MediaStreamTrack | null>(null);
  const returnAudioStreamRef = useRef<MediaStream | null>(null);
  // Persistent silent visual alerts sent by remote speakers requesting operator communication
  const [operatorAlerts, setOperatorAlerts] = useState<
    Array<{
      id: string;
      guestId: string;
      guestName: string;
      centroOrPosition?: string;
      timestamp: number;
    }>
  >([]);
  // IDs of remote participants whose audio the operator is actively monitoring locally (Whisper)
  const [monitoredParticipantIds, setMonitoredParticipantIds] = useState<string[]>([]);
  const handleToggleMonitorParticipant = useCallback((participantId: string) => {
    setMonitoredParticipantIds((prev) =>
      prev.includes(participantId)
        ? prev.filter((id) => id !== participantId)
        : [...prev, participantId]
    );
  }, []);
  const [overflowAngles, setOverflowAngles] = useState<OverflowCameraAngle[]>(() => {
    try {
      const saved = localStorage.getItem('uecfi_overflow_angles_v1');
      if (saved) {
        const parsed = JSON.parse(saved) as OverflowCameraAngle[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Ignore malformed saved angles
    }
    return [
      { id: 'angle_1', label: 'Wide', deviceId: '' },
      { id: 'angle_2', label: 'Pulpit', deviceId: '' }
    ];
  });
  const [activeOverflowAngleId, setActiveOverflowAngleId] = useState<string>(() => {
    return localStorage.getItem('uecfi_overflow_active_angle_v1') || 'angle_1';
  });
  const selectedOverflowCameraId =
    overflowAngles.find((a) => a.id === activeOverflowAngleId)?.deviceId ??
    overflowAngles[0]?.deviceId ??
    '';
  const [overflowConfig, setOverflowConfig] = useState<OverflowStageConfig>(() => {
    try {
      const saved = localStorage.getItem('uecfi_overflow_layout_v1');
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<OverflowStageConfig>;
        return {
          enabled: false,
          feedSource:
            parsed.feedSource === 'camera' || parsed.feedSource === 'remote'
              ? parsed.feedSource
              : 'auto',
          layout: parsed.layout === 'full' ? 'full' : 'custom',
          fullCropSides: parsed.fullCropSides !== false,
          studioBackground: parsed.studioBackground,
          studioPresentationBox: parsed.studioPresentationBox,
          studioParticipantBox: parsed.studioParticipantBox,
          studioElements: parsed.studioElements
        };
      }
    } catch {
      // Ignore malformed saved overflow layout
    }
    return { enabled: false, layout: 'custom', fullCropSides: true };
  });
  const mainRoomStreamRef = useRef<MediaStream | null>(null);
  const mainRoomBroadcasterRef = useRef<ParticipantBroadcaster | null>(null);
  const overflowSubscribedViewersRef = useRef<Set<string>>(new Set());
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [remoteInfo, setRemoteInfo] = useState<RemoteConnectionInfo | null>(null);
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [participantsModalOpen, setParticipantsModalOpen] = useState(false);
  const [studioLayoutModalOpen, setStudioLayoutModalOpen] = useState(false);
  const [participants, setParticipants] = useState<RemoteParticipant[]>([]);
  const [participantStageConfig, setParticipantStageConfig] = useState<ParticipantStageConfig>(() => {
    try {
      const saved = localStorage.getItem('uecfi_studio_layout_v1');
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<ParticipantStageConfig>;
        return {
          layout: parsed.layout === 'full' ? 'full' : 'custom',
          liveParticipantIds: [],
          showNameplate: parsed.showNameplate !== false,
          fullCropSides: parsed.fullCropSides !== false,
          studioBackground: parsed.studioBackground,
          studioPresentationBox: parsed.studioPresentationBox,
          studioParticipantBox: parsed.studioParticipantBox,
          studioElements: parsed.studioElements
        };
      }
    } catch {
      // Ignore invalid saved studio layout
    }
    return {
      layout: 'custom',
      liveParticipantIds: [],
      showNameplate: true,
      fullCropSides: true
    };
  });
  const [participantStreams, setParticipantStreams] = useState<Map<string, MediaStream>>(new Map());
  const [participantSettings, setParticipantSettings] = useState<ParticipantNetworkSettings>({
    signalingRelayUrl: 'wss://remote.uecfi.net/ws',
    onlineSessionCode: '',
    onlinePin: '1905',
    stunUrl: 'stun:stun.l.google.com:19302',
    turnUrl: '',
    turnUsername: '',
    turnCredential: ''
  });
  const operatorReceiverRef = useRef<ScreenStreamReceiver | null>(null);
  const relaySocketRef = useRef<WebSocket | null>(null);
  const onlineGuestsRef = useRef<Set<string>>(new Set());
  const onlineBridgeRef = useRef<Map<string, ParticipantBroadcaster>>(new Map());
  const operatorStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const bridgeSubscriptionsRef = useRef<Map<string, Set<string>>>(new Map());
  const overflowAngleStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const autoSwitchedMainRef = useRef(false);
  const autoSwitchedOverflowRef = useRef(false);
  const hasLiveMainGuestRef = useRef(false);
  hasLiveMainGuestRef.current = participantStageConfig.liveParticipantIds.length > 0;
  const [libraryTab, setLibraryTab] = useState<'library' | 'verses'>('verses');
  const [centerMode, setCenterMode] = useState<'grid' | 'search'>('grid');
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'song' | 'programItem'>('all');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [libraryIoMenuOpen, setLibraryIoMenuOpen] = useState(false);
  const libraryIoMenuRef = useRef<HTMLDivElement>(null);
  const libraryImportInputRef = useRef<HTMLInputElement>(null);
  const [libraryIoNotice, setLibraryIoNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [programAddMenuOpen, setProgramAddMenuOpen] = useState(false);
  const programAddMenuRef = useRef<HTMLDivElement>(null);
  const [programIoMenuOpen, setProgramIoMenuOpen] = useState(false);
  const programIoMenuRef = useRef<HTMLDivElement>(null);
  const programImportInputRef = useRef<HTMLInputElement>(null);
  const [programIoNotice, setProgramIoNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false);
  const playlistMenuRef = useRef<HTMLDivElement>(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [renamingPlaylistId, setRenamingPlaylistId] = useState<string | null>(null);
  const [renamePlaylistValue, setRenamePlaylistValue] = useState('');
  const [programPickerOpen, setProgramPickerOpen] = useState(false);
  const [programPickerMode, setProgramPickerMode] = useState<'library' | 'bible'>('library');
  const programPickerRef = useRef<HTMLDialogElement>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<{
    id: string;
    title: string;
    target: 'library' | 'program' | 'library-bulk' | 'program-clear';
  } | null>(null);
  const confirmDialogRef = useRef<HTMLDialogElement>(null);
  const confirmTitleId = React.useId();
  const [pendingLiveSwitch, setPendingLiveSwitch] = useState<{
    targetTitle: string;
    onConfirm: () => void;
  } | null>(null);
  const switchLiveDialogRef = useRef<HTMLDialogElement>(null);
  const switchLiveTitleId = React.useId();
  const [bibleImportPromptStep, setBibleImportPromptStep] = useState<'closed' | 'prompt' | 'later' | 'success'>('closed');
  const [dontShowBiblePromptAgain, setDontShowBiblePromptAgain] = useState(false);
  const [bibleStartupImporting, setBibleStartupImporting] = useState(false);
  const [bibleStartupImportError, setBibleStartupImportError] = useState<string | null>(null);
  const [bibleStartupImportedTitles, setBibleStartupImportedTitles] = useState<string[]>([]);
  const bibleImportPromptRef = useRef<HTMLDialogElement>(null);
  const bibleImportPromptTitleId = React.useId();
  const bibleStartupFileInputRef = useRef<HTMLInputElement>(null);
  const [pickerFilter, setPickerFilter] = useState<'all' | 'song' | 'programItem'>('all');
  const [pickerQuery, setPickerQuery] = useState('');
  const [draggedProgramIdx, setDraggedProgramIdx] = useState<number | null>(null);
  const [dragOverProgramIdx, setDragOverProgramIdx] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const pendingAutoPlayRef = useRef(false);
  const scrubberSeekingRef = useRef(false);
  const inspectorAudioUploadRef = useRef<HTMLInputElement>(null);
  const inspectorBgImageUploadRef = useRef<HTMLInputElement>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioTime, setAudioTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioVolume, setAudioVolume] = useState(1);
  const [syncModalOpen, setSyncModalOpen] = useState(false);

  useEffect(() => {
    const dialog = confirmDialogRef.current;
    if (!dialog) return;
    if (confirmDeleteItem && !dialog.open) {
      dialog.showModal();
    } else if (!confirmDeleteItem && dialog.open) {
      dialog.close();
    }
  }, [confirmDeleteItem]);

  useEffect(() => {
    const dialog = switchLiveDialogRef.current;
    if (!dialog) return;
    if (pendingLiveSwitch && !dialog.open) {
      dialog.showModal();
    } else if (!pendingLiveSwitch && dialog.open) {
      dialog.close();
    }
  }, [pendingLiveSwitch]);

  useEffect(() => {
    if (localStorage.getItem(BIBLE_IMPORT_PROMPT_DISMISSED_KEY) === 'true') return;
    let cancelled = false;
    loadImportedBibles().then((stored) => {
      if (!cancelled && stored.length === 0) {
        setDontShowBiblePromptAgain(false);
        setBibleImportPromptStep('prompt');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const dialog = bibleImportPromptRef.current;
    if (!dialog) return;
    if (bibleImportPromptStep !== 'closed' && !dialog.open) {
      dialog.showModal();
    } else if (bibleImportPromptStep === 'closed' && dialog.open) {
      dialog.close();
    }
  }, [bibleImportPromptStep]);

  const handleDeferBibleImport = () => {
    if (dontShowBiblePromptAgain) {
      localStorage.setItem(BIBLE_IMPORT_PROMPT_DISMISSED_KEY, 'true');
    }
    setBibleStartupImportError(null);
    setBibleImportPromptStep('later');
  };

  const handleStartupBibleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setBibleStartupImportError(null);
    setBibleStartupImporting(true);
    try {
      const importedTitles: string[] = [];
      for (const file of files) {
        const text = await readTextFileWithEncoding(file, { checkXmlProlog: true });
        const parsed = parseBibleXml(text, file.name);
        await saveImportedBible(parsed);
        importedTitles.push(parsed.title);
      }
      window.dispatchEvent(new Event('uecfi:bibles-updated'));
      setLibraryTab('verses');
      setBibleStartupImportedTitles(importedTitles);
      setBibleImportPromptStep('success');
    } catch (err) {
      setBibleStartupImportError(
        err instanceof Error ? err.message : 'Failed to import XML Bible.'
      );
    } finally {
      setBibleStartupImporting(false);
      e.target.value = '';
    }
  };

  // Re-resolve Program & ad-hoc verse items whenever imported Bibles or active Bible settings change
  useEffect(() => {
    let cancelled = false;
    const syncProgramVerses = () => {
      loadImportedBibles()
        .then((stored) => {
          if (cancelled || stored.length === 0) return;
          setPrograms((prev) => {
            let anyProgramChanged = false;
            const next = prev.map((prog) => {
              let anyEntryChanged = false;
              const nextEntries = prog.entries.map((entry) => {
                if (entry.kind !== 'verse') return entry;
                const resolved = resolveVerseItemWithActiveBibles(entry.item, stored);
                if (resolved === entry.item) return entry;
                anyEntryChanged = true;
                return { ...entry, item: resolved };
              });
              if (!anyEntryChanged) return prog;
              anyProgramChanged = true;
              return { ...prog, entries: nextEntries };
            });
            return anyProgramChanged ? next : prev;
          });
          setBrowsingAdHocItem((prev) =>
            prev ? resolveVerseItemWithActiveBibles(prev, stored) : prev
          );
          setLiveAdHocItem((prev) =>
            prev ? resolveVerseItemWithActiveBibles(prev, stored) : prev
          );
        })
        .catch(() => {});
    };

    syncProgramVerses();
    window.addEventListener('uecfi:bibles-updated', syncProgramVerses);
    window.addEventListener('uecfi:bible-settings-changed', syncProgramVerses);
    return () => {
      cancelled = true;
      window.removeEventListener('uecfi:bibles-updated', syncProgramVerses);
      window.removeEventListener('uecfi:bible-settings-changed', syncProgramVerses);
    };
  }, []);

  useEffect(() => {
    const dialog = programPickerRef.current;
    if (!dialog) return;
    if (programPickerOpen && !dialog.open) {
      dialog.showModal();
    } else if (!programPickerOpen && dialog.open) {
      dialog.close();
    }
  }, [programPickerOpen]);

  useEffect(() => {
    if (!addMenuOpen && !programAddMenuOpen && !programIoMenuOpen && !playlistMenuOpen && !libraryIoMenuOpen) return;
    const handleOutside = (e: PointerEvent) => {
      if (addMenuOpen && addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
      if (
        libraryIoMenuOpen &&
        libraryIoMenuRef.current &&
        !libraryIoMenuRef.current.contains(e.target as Node)
      ) {
        setLibraryIoMenuOpen(false);
      }
      if (
        programAddMenuOpen &&
        programAddMenuRef.current &&
        !programAddMenuRef.current.contains(e.target as Node)
      ) {
        setProgramAddMenuOpen(false);
      }
      if (
        programIoMenuOpen &&
        programIoMenuRef.current &&
        !programIoMenuRef.current.contains(e.target as Node)
      ) {
        setProgramIoMenuOpen(false);
      }
      if (
        playlistMenuOpen &&
        playlistMenuRef.current &&
        !playlistMenuRef.current.contains(e.target as Node)
      ) {
        setPlaylistMenuOpen(false);
        setRenamingPlaylistId(null);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAddMenuOpen(false);
        setLibraryIoMenuOpen(false);
        setProgramAddMenuOpen(false);
        setProgramIoMenuOpen(false);
        setPlaylistMenuOpen(false);
        setRenamingPlaylistId(null);
      }
    };
    window.addEventListener('pointerdown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('pointerdown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [addMenuOpen, libraryIoMenuOpen, programAddMenuOpen, programIoMenuOpen, playlistMenuOpen]);
  const [slideBuilderOpen, setSlideBuilderOpen] = useState(false);
  const [logoSlide, setLogoSlide] = useState<ProgramItem | null>(null);
  const [logoBuilderOpen, setLogoBuilderOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProgramItem | null>(null);
  const [editorDefaultType, setEditorDefaultType] = useState<ContentType>('song');

  // Resizable panel dimensions (persisted in localStorage)
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem('uecfi_layout_left_w'));
    return saved >= 260 && saved <= 680 ? saved : 420;
  });
  const [rightWidth, setRightWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem('uecfi_layout_right_w'));
    return saved >= 240 && saved <= 560 ? saved : 340;
  });
  const [leftBottomPct, setLeftBottomPct] = useState<number>(() => {
    const saved = Number(localStorage.getItem('uecfi_layout_left_split'));
    return saved >= 25 && saved <= 75 ? saved : 52;
  });

  useEffect(() => {
    localStorage.setItem('uecfi_layout_left_w', String(leftWidth));
  }, [leftWidth]);

  useEffect(() => {
    localStorage.setItem('uecfi_layout_right_w', String(rightWidth));
  }, [rightWidth]);

  useEffect(() => {
    localStorage.setItem('uecfi_layout_left_split', String(leftBottomPct));
  }, [leftBottomPct]);

  const startColumnResize = (side: 'left' | 'right', e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = side === 'left' ? leftWidth : rightWidth;
    document.body.style.cursor = 'col-resize';

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (side === 'left') {
        setLeftWidth(Math.max(260, Math.min(680, startW + dx)));
      } else {
        setRightWidth(Math.max(240, Math.min(560, startW - dx)));
      }
    };

    const onUp = () => {
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startLeftVerticalResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const parent = e.currentTarget.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    document.body.style.cursor = 'row-resize';

    const onMove = (ev: PointerEvent) => {
      const bottomPx = rect.bottom - ev.clientY;
      const pct = (bottomPx / rect.height) * 100;
      setLeftBottomPct(Math.max(25, Math.min(75, Math.round(pct))));
    };

    const onUp = () => {
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Load persisted Program playlists & Library (single storage) on startup
  useEffect(() => {
    loadAppState().then((persisted) => {
      if (persisted.programs.length > 0) {
        setPrograms(persisted.programs);
      }
      const activeProg =
        persisted.programs.find((p) => p.id === persisted.activeProgramId) ??
        persisted.programs[0];
      if (activeProg) {
        setActiveProgramId(activeProg.id);
        const firstEntry = activeProg.entries[0];
        const firstId = firstEntry
          ? firstEntry.kind === 'slide' || firstEntry.kind === 'verse'
            ? firstEntry.item.id
            : firstEntry.itemId
          : '';
        if (firstId) {
          setBrowsingItemId(firstId);
        }
      }
      setLibrary(persisted.library);
      if (persisted.logoSlide) {
        setLogoSlide(persisted.logoSlide);
      }
      setStateLoaded(true);
    });
  }, []);

  // Auto-save Program playlists & single-storage Library
  useEffect(() => {
    if (!stateLoaded) return;
    saveAppState({
      programs,
      activeProgramId: programRef.id,
      library,
      logoSlide
    });
  }, [programs, programRef.id, library, logoSlide, stateLoaded]);

  const allProgramItems = useMemo(
    () => programs.flatMap((p) => hydrateProgram(p, library).items),
    [programs, library]
  );

  const selectedItem = useMemo(
    () =>
      browsingAdHocItem ??
      program.items.find((item) => item.id === browsingItemId) ??
      library.find((item) => item.id === browsingItemId) ??
      null,
    [browsingAdHocItem, program.items, library, browsingItemId]
  );

  const liveItem = useMemo(
    () =>
      liveAdHocItem ??
      program.items.find((item) => item.id === liveItemId) ??
      library.find((item) => item.id === liveItemId) ??
      allProgramItems.find((item) => item.id === liveItemId) ??
      null,
    [liveAdHocItem, program.items, library, allProgramItems, liveItemId]
  );

  // Persistent timed-audio item driven by what is currently Live (not what is browsed in the Content Grid).
  const liveTimedAudioItem = useMemo(
    () => (liveItem?.type === 'song' && liveItem.lyricsMode === 'timed' && liveItem.audioUrl ? liveItem : null),
    [liveItem]
  );

  const nextItem = useMemo(() => {
    if (liveAdHocItem) return null;
    const idx = program.items.findIndex((item) => item.id === liveItemId);
    if (idx >= 0 && idx + 1 < program.items.length) {
      return program.items[idx + 1];
    }
    return null;
  }, [liveAdHocItem, program.items, liveItemId]);

  const programItemSummaries = useMemo(
    () =>
      program.items.map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: item.subtitle,
        type: item.type,
        lyricsMode: item.lyricsMode,
        blockCount: item.blocks.length
      })),
    [program.items]
  );

  const audioTimeRef = useRef(audioTime);
  audioTimeRef.current = audioTime;

  const liveState: LiveState = useMemo(
    () => ({
      programId: program.id,
      programName: program.name,
      activeItemId: liveItem?.id ?? null,
      activeBlockIndex,
      override,
      lyricsMode: liveItem?.lyricsMode ?? 'slide',
      audioCurrentTimeSec:
        liveItem?.type === 'song' && liveItem?.lyricsMode === 'timed'
          ? audioTimeRef.current
          : undefined,
      audioPlaying:
        liveItem?.type === 'song' && liveItem?.lyricsMode === 'timed' ? audioPlaying : undefined,
      audioVolume:
        liveItem?.type === 'song' && liveItem?.lyricsMode === 'timed' ? audioVolume : undefined,
      bibleLayout: liveItem?.bibleLayout ?? 'stacked',
      verseMaxFontSize: liveItem?.verseMaxFontSize ?? 72,
      activeItem: liveItem,
      programItems: programItemSummaries,
      nextItemTitle: nextItem?.title ?? null,
      logoSlide,
      participants: participantStageConfig,
      participantList: participants,
      overflow: overflowConfig,
      returnAudioActive:
        Boolean(returnFeedConfig.audioDeviceId) &&
        participantStageConfig.liveParticipantIds.length > 0,
      returnAudioMuted:
        Boolean(returnFeedConfig.audioDeviceId) &&
        participantStageConfig.liveParticipantIds.length > 0 &&
        returnFeedConfig.autoMuteWhenLive &&
        !returnAudioManualUnmute,
      updatedAt: Date.now()
    }),
    [
      program.id,
      program.name,
      liveItem,
      programItemSummaries,
      activeBlockIndex,
      override,
      audioPlaying,
      audioVolume,
      nextItem,
      logoSlide,
      participantStageConfig,
      participants,
      overflowConfig,
      returnFeedConfig.audioDeviceId,
      returnFeedConfig.autoMuteWhenLive,
      returnAudioManualUnmute
    ]
  );

  const contentGridRef = useRef<HTMLDivElement>(null);

  // Sync structural liveState to Electron main process (Main Screen + LAN Remote Server)
  // and push live verse/slide text to online remote speakers via uecfi-signaling.
  useEffect(() => {
    window.presenterAPI?.updateLiveState(liveState);

    const relayWs = relaySocketRef.current;
    if (relayWs && relayWs.readyState === WebSocket.OPEN) {
      const item = liveState.activeItem;
      const block = item?.blocks?.[liveState.activeBlockIndex] ?? item?.blocks?.[0];
      const text =
        block?.lines && block.lines.length > 0
          ? block.lines.join('\n')
          : block?.canvasElements
              ?.filter((el) => el.kind === 'text' && el.text)
              .map((el) => el.text)
              .join('\n') || '';
      const reference =
        item?.type === 'verse' && block?.label
          ? block.label.replace(/\s*\([^)]*\)\s*$/, '').trim()
          : item?.title || '';
      relayWs.send(
        JSON.stringify({
          type: 'program-update',
          programState: {
            title: item?.title || '',
            reference,
            text,
            override: liveState.override
          }
        })
      );
    }
  }, [liveState]);

  // Load persisted participant network settings (Internet Relay + STUN/TURN)
  // Auto-generate a permanent UECFI-XXXXX Centro Code and default Access Code (1905) if not set.
  useEffect(() => {
    window.presenterAPI?.getSecret('participant_network_settings').then((raw) => {
      let parsed: Partial<ParticipantNetworkSettings> = {};
      if (raw) {
        try {
          parsed = JSON.parse(raw) as Partial<ParticipantNetworkSettings>;
        } catch {
          // Ignore malformed saved settings
        }
      }
      setParticipantSettings((prev) => {
        const merged: ParticipantNetworkSettings = {
          ...prev,
          ...parsed,
          onlineSessionCode: parsed.onlineSessionCode?.trim()
            ? parsed.onlineSessionCode.trim().toUpperCase()
            : generateCentroCode(),
          onlinePin: parsed.onlinePin?.trim() ? parsed.onlinePin.trim() : '1905'
        };
        if (!parsed.onlineSessionCode?.trim() || !parsed.onlinePin?.trim()) {
          window.presenterAPI?.setSecret('participant_network_settings', JSON.stringify(merged));
        }
        return merged;
      });
    });
  }, []);

  const participantsRef = useRef<RemoteParticipant[]>(participants);
  participantsRef.current = participants;

  const dispatchSignalToRelayOrLan = useCallback(
    (msg: ParticipantSignalMessage) => {
      window.presenterAPI?.sendParticipantSignal(msg);
      const relayWs = relaySocketRef.current;
      if (!relayWs || relayWs.readyState !== WebSocket.OPEN) return;

      const roomId = participantSettings.onlineSessionCode.trim().toLowerCase();
      if (msg.type === 'PARTICIPANT_MODERATION' && onlineGuestsRef.current.has(msg.participantId)) {
        if (msg.action === 'PUT_LIVE' || msg.action === 'MOVE_TO_GREEN_ROOM') {
          relayWs.send(
            JSON.stringify({
              type: 'set-stage-status',
              roomId,
              targetGuestId: msg.participantId,
              onStage: msg.action === 'PUT_LIVE'
            })
          );
        } else if (msg.action === 'SET_MUTED' || msg.action === 'SET_VIDEO_HIDDEN') {
          const target = participantsRef.current.find((p) => p.id === msg.participantId);
          const mutedByOperator =
            msg.action === 'SET_MUTED' ? Boolean(msg.value) : Boolean(target?.mutedByOperator);
          const videoHiddenByOperator =
            msg.action === 'SET_VIDEO_HIDDEN'
              ? Boolean(msg.value)
              : Boolean(target?.videoHiddenByOperator);
          relayWs.send(
            JSON.stringify({
              type: 'operator-moderation',
              roomId,
              targetGuestId: msg.participantId,
              mutedByOperator,
              videoHiddenByOperator
            })
          );
        }
        return;
      }

      if (msg.type === 'RTC_ANSWER' && msg.toId.startsWith('participant:')) {
        const guestId = msg.toId.slice('participant:'.length);
        if (onlineGuestsRef.current.has(guestId)) {
          relayWs.send(
            JSON.stringify({
              type: 'sdp-answer',
              roomId,
              targetGuestId: guestId,
              data: msg.sdp
            })
          );
        }
        return;
      }

      if (msg.type === 'RTC_ICE' && msg.toId.startsWith('participant:')) {
        const guestId = msg.toId.slice('participant:'.length);
        if (onlineGuestsRef.current.has(guestId)) {
          relayWs.send(
            JSON.stringify({
              type: 'ice-candidate',
              roomId,
              targetGuestId: guestId,
              data: msg.candidate
            })
          );
        }
      }
    },
    [participantSettings.onlineSessionCode]
  );

  const ensureBridgeForViewer = useCallback(
    (guestId: string, viewerId: string, stream?: MediaStream, forceSubscribe = true) => {
      const targetStream = stream ?? operatorStreamsRef.current.get(guestId);
      if (!targetStream || !onlineGuestsRef.current.has(guestId)) return;
      if (targetStream.getTracks().length === 0) return;

      let bridge = onlineBridgeRef.current.get(guestId);
      if (!bridge) {
        bridge = new ParticipantBroadcaster({
          participantId: guestId,
          localStream: targetStream,
          iceServers: [],
          sendSignal: (outMsg) => {
            window.presenterAPI?.sendParticipantSignal(outMsg);
          }
        });
        onlineBridgeRef.current.set(guestId, bridge);
        bridge.handleSubscribe(viewerId).catch(() => {});
        return;
      }

      if (!forceSubscribe && bridge.hasPeerWithStream(viewerId, targetStream)) {
        return;
      }

      bridge.setLocalStream(targetStream);
      bridge.handleSubscribe(viewerId).catch(() => {});
    },
    []
  );

  const handleIncomingParticipantSignal = useCallback((msg: ParticipantSignalMessage) => {
    if (msg.type === 'PARTICIPANT_JOIN') {
      const pid = msg.pin; // Server/Relay passes assigned participantId in pin field
      if (!pid) return;
      setParticipants((prev) => {
        if (prev.some((p) => p.id === pid)) return prev;
        return [
          ...prev,
          {
            id: pid,
            name: msg.name || 'Guest',
            joinedAt: Date.now(),
            status: 'greenRoom',
            audioEnabled: msg.audioEnabled,
            videoEnabled: msg.videoEnabled,
            mutedByOperator: false,
            videoHiddenByOperator: false,
            source: msg.source ?? 'lan'
          }
        ];
      });
      return;
    }

    if (msg.type === 'PARTICIPANT_MEDIA_STATE') {
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === msg.participantId
            ? { ...p, audioEnabled: msg.audioEnabled, videoEnabled: msg.videoEnabled }
            : p
        )
      );
      return;
    }

    if (msg.type === 'PARTICIPANT_MODERATION' && msg.action === 'KICK') {
      setParticipants((prev) => prev.filter((p) => p.id !== msg.participantId));
      setParticipantStageConfig((prev) => ({
        ...prev,
        liveParticipantIds: prev.liveParticipantIds.filter((id) => id !== msg.participantId)
      }));
      operatorReceiverRef.current?.removeParticipant(msg.participantId);
      onlineBridgeRef.current.get(msg.participantId)?.dispose();
      onlineBridgeRef.current.delete(msg.participantId);
      bridgeSubscriptionsRef.current.delete(msg.participantId);
      return;
    }

    if (msg.type === 'RTC_SUBSCRIBE') {
      if (msg.participantId === MAIN_ROOM_CAMERA_ID) {
        overflowSubscribedViewersRef.current.add(msg.viewerId);
        mainRoomBroadcasterRef.current?.handleSubscribe(msg.viewerId).catch(() => {});
        return;
      }
      if (
        (msg.viewerId === 'screen:main' ||
          msg.viewerId === 'screen:overflow' ||
          msg.viewerId.startsWith('screen:remote:')) &&
        onlineGuestsRef.current.has(msg.participantId)
      ) {
        const viewers = bridgeSubscriptionsRef.current.get(msg.participantId) ?? new Set<string>();
        viewers.add(msg.viewerId);
        bridgeSubscriptionsRef.current.set(msg.participantId, viewers);
        ensureBridgeForViewer(msg.participantId, msg.viewerId);
      }
      return;
    }

    if (msg.type === 'RTC_OFFER' || msg.type === 'RTC_ANSWER' || msg.type === 'RTC_ICE') {
      if (msg.toId === `participant:${MAIN_ROOM_CAMERA_ID}`) {
        mainRoomBroadcasterRef.current?.handleSignal(msg);
        return;
      }
      if (msg.toId === 'screen:operator') {
        operatorReceiverRef.current?.handleSignal(msg);
      } else if (msg.toId === 'screen:main' || msg.toId === 'screen:overflow') {
        window.presenterAPI?.sendParticipantSignal(msg);
      } else if (msg.toId.startsWith('participant:')) {
        const guestId = msg.toId.slice('participant:'.length);
        if (
          (msg.fromId === 'screen:main' ||
            msg.fromId === 'screen:overflow' ||
            msg.fromId.startsWith('screen:remote:')) &&
          onlineGuestsRef.current.has(guestId)
        ) {
          onlineBridgeRef.current.get(guestId)?.handleSignal(msg);
        } else {
          dispatchSignalToRelayOrLan(msg);
        }
      }
    }
  }, [dispatchSignalToRelayOrLan, ensureBridgeForViewer]);

  // Keep latest return-feed media, whisper mic, & live guest state in refs for WebRTC getReturnMedia
  const returnMediaStateRef = useRef({
    mainRoomVideoTrack: null as MediaStreamTrack | null,
    returnAudioTrack: null as MediaStreamTrack | null,
    whisperAudioTrack: null as MediaStreamTrack | null,
    whisperParticipantIds: [] as string[],
    returnFeedConfig,
    returnAudioManualUnmute,
    liveParticipantIds: [] as string[]
  });
  returnMediaStateRef.current = {
    mainRoomVideoTrack: mainRoomPreviewStream?.getVideoTracks()[0] ?? null,
    returnAudioTrack,
    whisperAudioTrack,
    whisperParticipantIds: monitoredParticipantIds,
    returnFeedConfig,
    returnAudioManualUnmute,
    liveParticipantIds: participantStageConfig.liveParticipantIds
  };

  // Reset manual return-audio unmute override when no remote speaker is live
  useEffect(() => {
    if (participantStageConfig.liveParticipantIds.length === 0) {
      setReturnAudioManualUnmute(false);
    }
  }, [participantStageConfig.liveParticipantIds.length]);

  // When operator enables manual Return Audio unmute (Megaphone), override any
  // local "Mute Room Audio" setting on connected online guests.
  useEffect(() => {
    if (!returnAudioManualUnmute) return;
    const relayWs = relaySocketRef.current;
    const roomId = participantSettings.onlineSessionCode.trim().toLowerCase();
    if (!relayWs || relayWs.readyState !== WebSocket.OPEN || !roomId) return;
    relayWs.send(
      JSON.stringify({
        type: 'return-audio-override',
        roomId,
        forceUnmute: true
      })
    );
  }, [returnAudioManualUnmute, participantSettings.onlineSessionCode]);

  // Capture configurable Room Return Audio when an audio source is selected and guests are connected
  useEffect(() => {
    if (!returnFeedConfig.audioDeviceId || participants.length === 0) {
      returnAudioStreamRef.current?.getTracks().forEach((t) => t.stop());
      returnAudioStreamRef.current = null;
      setReturnAudioTrack(null);
      return;
    }

    let cancelled = false;
    const constraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...(returnFeedConfig.audioDeviceId !== 'default'
        ? { deviceId: { exact: returnFeedConfig.audioDeviceId } }
        : {})
    };
    navigator.mediaDevices
      ?.getUserMedia({ audio: constraints, video: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        returnAudioStreamRef.current?.getTracks().forEach((t) => t.stop());
        returnAudioStreamRef.current = stream;
        setReturnAudioTrack(stream.getAudioTracks()[0] ?? null);
        // Re-enumerate audio inputs after permission is granted so labels/deviceIds populate
        navigator.mediaDevices
          ?.enumerateDevices()
          .then((devs) => {
            const mics = devs
              .filter((d) => d.kind === 'audioinput' && d.deviceId)
              .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Audio Input ${i + 1}` }));
            setReturnAudioDevices(mics);
          })
          .catch(() => {});
      })
      .catch(() => {
        if (!cancelled) setReturnAudioTrack(null);
      });

    return () => {
      cancelled = true;
    };
  }, [returnFeedConfig.audioDeviceId, participants.length > 0]);

  // Capture Operator Whisper Microphone only while at least one participant has Whisper active
  useEffect(() => {
    if (monitoredParticipantIds.length === 0 || !whisperInputDeviceId) {
      whisperAudioStreamRef.current?.getTracks().forEach((t) => t.stop());
      whisperAudioStreamRef.current = null;
      setWhisperAudioTrack(null);
      return;
    }

    let cancelled = false;
    const constraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...(whisperInputDeviceId !== 'default'
        ? { deviceId: { exact: whisperInputDeviceId } }
        : {})
    };
    navigator.mediaDevices
      ?.getUserMedia({ audio: constraints, video: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        whisperAudioStreamRef.current?.getTracks().forEach((t) => t.stop());
        whisperAudioStreamRef.current = stream;
        setWhisperAudioTrack(stream.getAudioTracks()[0] ?? null);
        // Re-enumerate audio inputs after permission is granted so labels populate
        navigator.mediaDevices
          ?.enumerateDevices()
          .then((devs) => {
            const mics = devs
              .filter((d) => d.kind === 'audioinput' && d.deviceId)
              .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Audio Input ${i + 1}` }));
            setReturnAudioDevices(mics);
          })
          .catch(() => {});
      })
      .catch(() => {
        if (!cancelled) setWhisperAudioTrack(null);
      });

    return () => {
      cancelled = true;
    };
  }, [whisperInputDeviceId, monitoredParticipantIds.length > 0]);

  // Push return video/audio & 2-way whisper track updates seamlessly to all connected remote speakers
  useEffect(() => {
    operatorReceiverRef.current?.syncReturnMedia();
  }, [
    mainRoomPreviewStream,
    returnAudioTrack,
    whisperAudioTrack,
    monitoredParticipantIds,
    returnFeedConfig.sendVideo,
    returnFeedConfig.autoMuteWhenLive,
    returnAudioManualUnmute,
    participantStageConfig.liveParticipantIds
  ]);

  // Setup Operator muted WebRTC receiver + Electron IPC listener
  useEffect(() => {
    const api = window.presenterAPI;
    if (!api) return;

    const receiver = new ScreenStreamReceiver({
      viewerId: 'screen:operator',
      iceServers: buildIceServers(participantSettings),
      sendSignal: dispatchSignalToRelayOrLan,
      getReturnMedia: (participantId) => {
        const cur = returnMediaStateRef.current;
        const videoTrack = cur.returnFeedConfig.sendVideo ? cur.mainRoomVideoTrack : null;
        // 2-Way Whisper takes priority over Room Return Audio for whispered participants
        const isWhispering = cur.whisperParticipantIds.includes(participantId);
        if (isWhispering && cur.whisperAudioTrack) {
          return { videoTrack, audioTrack: cur.whisperAudioTrack };
        }
        const isLive = cur.liveParticipantIds.includes(participantId);
        const shouldAutoMuteAudio =
          isLive && cur.returnFeedConfig.autoMuteWhenLive && !cur.returnAudioManualUnmute;
        const audioTrack = shouldAutoMuteAudio ? null : cur.returnAudioTrack;
        return { videoTrack, audioTrack };
      },
      onStreamsChange: (nextStreams) => {
        operatorStreamsRef.current = nextStreams;
        setParticipantStreams(nextStreams);
        for (const [guestId, viewerIds] of bridgeSubscriptionsRef.current.entries()) {
          const stream = nextStreams.get(guestId);
          if (stream && onlineGuestsRef.current.has(guestId)) {
            for (const viewerId of viewerIds) {
              ensureBridgeForViewer(guestId, viewerId, stream, false);
            }
          }
        }
      }
    });
    operatorReceiverRef.current = receiver;

    const unsub = api.onParticipantSignal(handleIncomingParticipantSignal);
    return () => {
      unsub();
      receiver.dispose();
      operatorReceiverRef.current = null;
      for (const bridge of onlineBridgeRef.current.values()) {
        bridge.dispose();
      }
      onlineBridgeRef.current.clear();
    };
  }, [dispatchSignalToRelayOrLan, ensureBridgeForViewer, handleIncomingParticipantSignal, participantSettings]);

  // Subscribe Operator receiver to all connected participants (muted thumbnails)
  const participantIdsKey = participants.map((p) => p.id).join(',');
  useEffect(() => {
    const ids = participantIdsKey ? participantIdsKey.split(',') : [];
    operatorReceiverRef.current?.syncSubscriptions(ids);
  }, [participantIdsKey]);

  // Broadcast updated participant list & stage config to LAN & Relay
  useEffect(() => {
    dispatchSignalToRelayOrLan({
      type: 'PARTICIPANT_STATE',
      participants,
      stage: participantStageConfig
    });
  }, [participants, participantStageConfig, dispatchSignalToRelayOrLan]);

  // Connect to uecfi-signaling server (e.g. wss://remote.uecfi.net/ws)
  useEffect(() => {
    const url = participantSettings.signalingRelayUrl.trim();
    const roomId = participantSettings.onlineSessionCode.trim().toLowerCase();
    const secretKey = participantSettings.onlinePin.trim();
    if (!url || !roomId || !secretKey) {
      relaySocketRef.current?.close();
      relaySocketRef.current = null;
      return;
    }

    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const connectRelay = () => {
      if (disposed) return;
      try {
        const ws = new WebSocket(url);
        relaySocketRef.current = ws;
        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              type: 'join-host',
              roomId,
              secretKey,
              hostName: program.name || 'UECFI Presenter'
            })
          );
          heartbeatTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'heartbeat' }));
            }
          }, 25000);
        };
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string) as {
              type?: string;
              guestId?: string;
              guestName?: string;
              centroOrPosition?: string;
              onStage?: boolean;
              guests?: Array<{
                guestId: string;
                guestName: string;
                centroOrPosition?: string;
                onStage?: boolean;
              }>;
              data?: unknown;
            };

            if (msg.type === 'host-joined' && Array.isArray(msg.guests)) {
              for (const g of msg.guests) {
                onlineGuestsRef.current.add(g.guestId);
                setParticipants((prev) =>
                  prev.some((p) => p.id === g.guestId)
                    ? prev
                    : [
                        ...prev,
                        {
                          id: g.guestId,
                          name: g.guestName || 'Remote Guest',
                          centroOrPosition: g.centroOrPosition || undefined,
                          joinedAt: Date.now(),
                          status: g.onStage ? 'live' : 'greenRoom',
                          audioEnabled: true,
                          videoEnabled: true,
                          mutedByOperator: false,
                          videoHiddenByOperator: false,
                          source: 'online'
                        }
                      ]
                );
              }
              return;
            }

            if (msg.type === 'guest-joined' && msg.guestId) {
              onlineGuestsRef.current.add(msg.guestId);
              setParticipants((prev) =>
                prev.some((p) => p.id === msg.guestId)
                  ? prev
                  : [
                      ...prev,
                      {
                        id: msg.guestId!,
                        name: msg.guestName || 'Remote Guest',
                        centroOrPosition: msg.centroOrPosition || undefined,
                        joinedAt: Date.now(),
                        status: msg.onStage ? 'live' : 'greenRoom',
                        audioEnabled: true,
                        videoEnabled: true,
                        mutedByOperator: false,
                        videoHiddenByOperator: false,
                        source: 'online'
                      }
                    ]
              );
              return;
            }

            if (msg.type === 'operator-alert' && msg.guestId) {
              const alertGuestId = msg.guestId;
              const alertGuestName = msg.guestName || 'Remote Speaker';
              const alertCentro = msg.centroOrPosition || undefined;
              const now = Date.now();
              setOperatorAlerts((prev) => [
                {
                  id: `${alertGuestId}_${now}`,
                  guestId: alertGuestId,
                  guestName: alertGuestName,
                  centroOrPosition: alertCentro,
                  timestamp: now
                },
                ...prev.filter((a) => a.guestId !== alertGuestId)
              ]);
              return;
            }

            if (msg.type === 'guest-left' && msg.guestId) {
              onlineGuestsRef.current.delete(msg.guestId);
              handleIncomingParticipantSignal({
                type: 'PARTICIPANT_MODERATION',
                participantId: msg.guestId,
                action: 'KICK'
              });
              return;
            }

            if (msg.type === 'sdp-offer' && msg.guestId && msg.data) {
              const sdp = msg.data as { type: 'offer'; sdp: string };
              operatorReceiverRef.current?.handleSignal({
                type: 'RTC_OFFER',
                fromId: `participant:${msg.guestId}`,
                toId: 'screen:operator',
                sdp
              });
              return;
            }

            if (msg.type === 'ice-candidate' && msg.guestId && msg.data) {
              const candidate = msg.data as {
                candidate: string;
                sdpMid?: string | null;
                sdpMLineIndex?: number | null;
              };
              operatorReceiverRef.current?.handleSignal({
                type: 'RTC_ICE',
                fromId: `participant:${msg.guestId}`,
                toId: 'screen:operator',
                candidate
              });
            }
          } catch {
            // Ignore malformed relay messages
          }
        };
        ws.onclose = () => {
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
          }
          if (!disposed) {
            reconnectTimer = setTimeout(connectRelay, 3000);
          }
        };
      } catch {
        // Ignore invalid relay URL
      }
    };

    connectRelay();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      relaySocketRef.current?.close();
      relaySocketRef.current = null;
    };
  }, [
    participantSettings.signalingRelayUrl,
    participantSettings.onlineSessionCode,
    participantSettings.onlinePin,
    program.name,
    handleIncomingParticipantSignal
  ]);

  const handleModerateParticipant = useCallback(
    (participantId: string, action: ParticipantModerationAction, value?: boolean) => {
      if (action === 'KICK') {
        setParticipants((prev) => prev.filter((p) => p.id !== participantId));
        setParticipantStageConfig((prev) => ({
          ...prev,
          liveParticipantIds: prev.liveParticipantIds.filter((id) => id !== participantId)
        }));
        operatorReceiverRef.current?.removeParticipant(participantId);
      } else if (action === 'PUT_LIVE') {
        setParticipants((prev) =>
          prev.map((p) => (p.id === participantId ? { ...p, status: 'live' } : p))
        );
        setParticipantStageConfig((prev) => ({
          ...prev,
          liveParticipantIds: prev.liveParticipantIds.includes(participantId)
            ? prev.liveParticipantIds
            : [...prev.liveParticipantIds, participantId]
        }));
      } else if (action === 'MOVE_TO_GREEN_ROOM') {
        setParticipants((prev) =>
          prev.map((p) => (p.id === participantId ? { ...p, status: 'greenRoom' } : p))
        );
        setParticipantStageConfig((prev) => ({
          ...prev,
          liveParticipantIds: prev.liveParticipantIds.filter((id) => id !== participantId)
        }));
      } else if (action === 'SET_MUTED') {
        setParticipants((prev) =>
          prev.map((p) => (p.id === participantId ? { ...p, mutedByOperator: Boolean(value) } : p))
        );
      } else if (action === 'SET_VIDEO_HIDDEN') {
        setParticipants((prev) =>
          prev.map((p) =>
            p.id === participantId ? { ...p, videoHiddenByOperator: Boolean(value) } : p
          )
        );
      }

      dispatchSignalToRelayOrLan({
        type: 'PARTICIPANT_MODERATION',
        participantId,
        action,
        value
      });
    },
    [dispatchSignalToRelayOrLan]
  );

  // Send 120ms timed-lyrics audio clock ticks over a lightweight IPC channel
  // instead of re-cloning and serializing the full LiveState on every tick.
  useEffect(() => {
    if (liveItem?.type !== 'song' || liveItem?.lyricsMode !== 'timed') return;
    window.presenterAPI?.updateAudioTime({
      timeSec: audioTime,
      activeBlockIndex
    });
  }, [audioTime, activeBlockIndex, liveItem?.id, liveItem?.type, liveItem?.lyricsMode]);

  // Keep the active/live item centered in the Content Grid (verses, slides, songs),
  // or reset to the top when browsing a new non-live item.
  const prevSelectedItemIdRef = useRef<string | undefined>(selectedItem?.id);
  useEffect(() => {
    const container = contentGridRef.current;
    const itemChanged = prevSelectedItemIdRef.current !== selectedItem?.id;
    prevSelectedItemIdRef.current = selectedItem?.id;
    if (!container) return;

    const activeEl = container.querySelector<HTMLElement>('[data-live-block="true"]');
    if (activeEl) {
      const containerRect = container.getBoundingClientRect();
      const elRect = activeEl.getBoundingClientRect();
      const targetTop =
        container.scrollTop +
        (elRect.top - containerRect.top) -
        (container.clientHeight - elRect.height) / 2;
      container.scrollTo({
        top: Math.max(0, targetTop),
        behavior: itemChanged ? 'auto' : 'smooth'
      });
    } else if (itemChanged) {
      container.scrollTop = 0;
    }
  }, [selectedItem?.id, liveItem?.id, activeBlockIndex, override]);

  // Capture Main Room Camera (video-only) when Overflow camera is enabled OR
  // when sending the Main Room return feed to connected remote speakers.
  // Pre-warms configured angles when Overflow is active and uses WebRTC replaceTrack for seamless switching.
  const shouldCaptureMainRoomCamera =
    overflowConfig.enabled || (returnFeedConfig.sendVideo && participants.length > 0);

  useEffect(() => {
    const stopAllAngleStreams = () => {
      for (const s of overflowAngleStreamsRef.current.values()) {
        s.getTracks().forEach((t) => t.stop());
      }
      overflowAngleStreamsRef.current.clear();
    };

    if (!shouldCaptureMainRoomCamera) {
      mainRoomBroadcasterRef.current?.dispose();
      mainRoomBroadcasterRef.current = null;
      stopAllAngleStreams();
      setOverflowCameraStreams(new Map());
      mainRoomStreamRef.current?.getTracks().forEach((t) => t.stop());
      mainRoomStreamRef.current = null;
      setMainRoomPreviewStream(null);
      return;
    }

    let cancelled = false;

    const applyActiveStream = (stream: MediaStream) => {
      if (cancelled) return;
      mainRoomStreamRef.current = stream;
      setMainRoomPreviewStream(stream);

      if (!mainRoomBroadcasterRef.current) {
        mainRoomBroadcasterRef.current = new ParticipantBroadcaster({
          participantId: MAIN_ROOM_CAMERA_ID,
          localStream: stream,
          iceServers: [],
          sendSignal: (outMsg) => {
            window.presenterAPI?.sendParticipantSignal(outMsg);
          }
        });
      } else {
        mainRoomBroadcasterRef.current.setLocalStream(stream);
      }

      for (const viewerId of overflowSubscribedViewersRef.current) {
        if (!mainRoomBroadcasterRef.current.hasPeer(viewerId)) {
          mainRoomBroadcasterRef.current.handleSubscribe(viewerId).catch(() => {});
        }
      }
    };

    const isStreamLive = (stream?: MediaStream | null) =>
      Boolean(stream && stream.getVideoTracks().some((t) => t.readyState === 'live'));

    const openCameraStream = async (deviceId: string): Promise<MediaStream | null> => {
      if (!navigator.mediaDevices?.getUserMedia) return null;
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      };
      return navigator.mediaDevices.getUserMedia(constraints);
    };

    const activeKey = selectedOverflowCameraId || '__default__';

    const prewarmOtherAngles = async () => {
      const targetIds = Array.from(
        new Set(
          overflowAngles
            .map((a) => a.deviceId)
            .filter((id) => id && id !== selectedOverflowCameraId)
        )
      );
      // Release any cached streams whose deviceId is no longer configured (except active)
      for (const [key, cached] of Array.from(overflowAngleStreamsRef.current.entries())) {
        if (key !== activeKey && !targetIds.includes(key)) {
          cached.getTracks().forEach((t) => t.stop());
          overflowAngleStreamsRef.current.delete(key);
        }
      }
      for (const devId of targetIds) {
        if (cancelled) return;
        const existing = overflowAngleStreamsRef.current.get(devId);
        if (isStreamLive(existing)) continue;
        try {
          const warmStream = await openCameraStream(devId);
          if (!warmStream) continue;
          if (cancelled) {
            warmStream.getTracks().forEach((t) => t.stop());
            return;
          }
          overflowAngleStreamsRef.current.set(devId, warmStream);
          setOverflowCameraStreams(new Map(overflowAngleStreamsRef.current));
        } catch {
          // Ignore if a camera is busy or shares USB bandwidth with the active camera
        }
      }
    };

    const cachedActive = overflowAngleStreamsRef.current.get(activeKey);
    if (isStreamLive(cachedActive) && cachedActive) {
      applyActiveStream(cachedActive);
      void prewarmOtherAngles();
    } else {
      openCameraStream(selectedOverflowCameraId)
        .catch(async () => {
          // Fallback: if opening failed due to USB hub limits while other angles were warm,
          // release other cached streams and retry opening only the active camera.
          for (const [key, cached] of Array.from(overflowAngleStreamsRef.current.entries())) {
            if (key !== activeKey) {
              cached.getTracks().forEach((t) => t.stop());
              overflowAngleStreamsRef.current.delete(key);
            }
          }
          return openCameraStream(selectedOverflowCameraId);
        })
        .then((stream) => {
          if (!stream) return;
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          setCameraError(null);
          overflowAngleStreamsRef.current.set(activeKey, stream);
          setOverflowCameraStreams(new Map(overflowAngleStreamsRef.current));
          applyActiveStream(stream);
          void prewarmOtherAngles();
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const errName = err instanceof Error ? err.name : '';
          // On Windows, cameras are exclusive-access and throw NotReadableError when another app
          // (Zoom, OBS, Teams, etc.) already holds the device.
          if (errName === 'NotReadableError') {
            setCameraError(
              'Camera is in use by another app (e.g. Zoom, OBS, or Teams). Close it or pick a different camera.'
            );
          } else if (errName === 'NotAllowedError') {
            setCameraError('Camera access was denied. Check OS camera privacy permissions.');
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [shouldCaptureMainRoomCamera, selectedOverflowCameraId, overflowAngles]);

  const refreshDisplaysAndRemote = useCallback(async () => {
    if (!window.presenterAPI) return;
    const [dList, rInfo, isOpen, isOverflowOpen] = await Promise.all([
      window.presenterAPI.getDisplays(),
      window.presenterAPI.getRemoteInfo(),
      window.presenterAPI.isMainScreenOpen(),
      window.presenterAPI.isOverflowScreenOpen()
    ]);
    setDisplays(dList);
    setRemoteInfo(rInfo);
    setMainScreenOpen(isOpen);
    setOverflowScreenOpen(isOverflowOpen);
    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devs) => {
          const cams = devs
            .filter((d) => d.kind === 'videoinput')
            .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
          setOverflowCameras(cams);
          const mics = devs
            .filter((d) => d.kind === 'audioinput' && d.deviceId)
            .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Audio Input ${i + 1}` }));
          setReturnAudioDevices(mics);
          const outputs = devs
            .filter(
              (d) =>
                d.kind === 'audiooutput' &&
                d.deviceId &&
                d.deviceId !== 'default' &&
                d.deviceId !== 'communications'
            )
            .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Audio Output ${i + 1}` }));
          setAudioOutputDevices(outputs);
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    refreshDisplaysAndRemote();
    const unsub = window.presenterAPI?.onRemoteClientCount((count) => {
      setRemoteInfo((prev) => (prev ? { ...prev, connectedClients: count } : prev));
    });
    const handleDeviceChange = () => {
      refreshDisplaysAndRemote();
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    return () => {
      unsub?.();
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
    };
  }, [refreshDisplaysAndRemote]);

  // Match the Operator Live Monitor & Content Grid preview aspect ratio to the assigned Main Screen display
  // so 4:3, 16:10, or 16:9 projectors preview with identical proportions and line wrapping.
  const mainScreenAspectRatio = useMemo(() => {
    const target = displays.find((d) => d.isMainScreen) ?? displays[0];
    if (target && target.bounds.width > 0 && target.bounds.height > 0) {
      return `${target.bounds.width} / ${target.bounds.height}`;
    }
    return '16 / 9';
  }, [displays]);

  // Selecting a Program Item loads it into Content Grid WITHOUT changing Live output
  const handleSelectProgramItem = (item: ProgramItem) => {
    setBrowsingAdHocItem(null);
    setBrowsingItemId(item.id);
    setCenterMode('grid');
  };

  // Double-clicking a program item selects it, pushes it Live, and autoplays attached song audio.
  const handlePresentProgramItem = (item: ProgramItem) => {
    guardLiveSwitch(item.id, item.title, () => {
      const isTimedSongWithAudio =
        item.type === 'song' && item.lyricsMode === 'timed' && Boolean(item.audioUrl);
      const startIdx = isTimedSongWithAudio
        ? (findBlockIndexForTime(item.blocks, 0) ?? 0)
        : 0;

      if (isTimedSongWithAudio) {
        if (liveTimedAudioItem?.id === item.id && audioRef.current) {
          audioRef.current.currentTime = 0;
          setAudioTime(0);
          audioRef.current.play().catch(() => {});
        } else {
          pendingAutoPlayRef.current = true;
        }
      } else {
        pendingAutoPlayRef.current = false;
      }

      setBrowsingAdHocItem(null);
      setBrowsingItemId(item.id);
      setCenterMode('grid');
      setLiveAdHocItem(null);
      setLiveItemId(item.id);
      setActiveBlockIndex(startIdx);
      setOverride('none');
      autoSwitchFullToStudio();
    });
  };

  // Guard switching Live to a different item while a song's audio is actively playing.
  const guardLiveSwitch = (targetItemId: string, targetTitle: string, action: () => void) => {
    if (audioPlaying && liveTimedAudioItem && liveTimedAudioItem.id !== targetItemId) {
      setPendingLiveSwitch({ targetTitle, onConfirm: action });
      return;
    }
    action();
  };

  // Clicking a card in Content Grid triggers presentation (pushes to Live)
  const autoSwitchFullToStudio = useCallback(() => {
    setParticipantStageConfig((prev) => {
      if (prev.liveParticipantIds.length === 0 || prev.layout !== 'full') return prev;
      autoSwitchedMainRef.current = true;
      const updated: ParticipantStageConfig = { ...prev, layout: 'custom' };
      try {
        localStorage.setItem(
          'uecfi_studio_layout_v1',
          JSON.stringify({ ...updated, liveParticipantIds: undefined })
        );
      } catch {
        // Ignore storage quota errors
      }
      return updated;
    });
    setOverflowConfig((prev) => {
      const hasOverflowFeed = prev.enabled || hasLiveMainGuestRef.current;
      if (!hasOverflowFeed || prev.layout !== 'full') return prev;
      autoSwitchedOverflowRef.current = true;
      const updated: OverflowStageConfig = { ...prev, layout: 'custom' };
      try {
        localStorage.setItem(
          'uecfi_overflow_layout_v1',
          JSON.stringify({ ...updated, enabled: false })
        );
      } catch {
        // Ignore storage quota errors
      }
      return updated;
    });
  }, []);

  const restoreAutoSwitchedFull = useCallback(() => {
    if (autoSwitchedMainRef.current) {
      autoSwitchedMainRef.current = false;
      setParticipantStageConfig((prev) => {
        if (prev.layout !== 'custom') return prev;
        const updated: ParticipantStageConfig = { ...prev, layout: 'full' };
        try {
          localStorage.setItem(
            'uecfi_studio_layout_v1',
            JSON.stringify({ ...updated, liveParticipantIds: undefined })
          );
        } catch {
          // Ignore storage quota errors
        }
        return updated;
      });
    }
    if (autoSwitchedOverflowRef.current) {
      autoSwitchedOverflowRef.current = false;
      setOverflowConfig((prev) => {
        if (prev.layout !== 'custom') return prev;
        const updated: OverflowStageConfig = { ...prev, layout: 'full' };
        try {
          localStorage.setItem(
            'uecfi_overflow_layout_v1',
            JSON.stringify({ ...updated, enabled: false })
          );
        } catch {
          // Ignore storage quota errors
        }
        return updated;
      });
    }
  }, []);

  const handleSelectBlock = (index: number) => {
    if (!selectedItem) return;
    if (selectedItem.type === 'verse') {
      setHighlightedVerseBlockIndex(index);
    }
    guardLiveSwitch(selectedItem.id, selectedItem.title, () => {
      if (browsingAdHocItem && browsingAdHocItem.id === selectedItem.id) {
        setLiveAdHocItem(browsingAdHocItem);
      } else {
        setLiveAdHocItem(null);
        setLiveItemId(selectedItem.id);
      }
      setActiveBlockIndex(index);
      if (override !== 'none') setOverride('none');
      autoSwitchFullToStudio();
    });
  };

  const handleNext = useCallback(() => {
    if (!liveItem) return;
    if (activeBlockIndex + 1 < liveItem.blocks.length) {
      setActiveBlockIndex((prev) => prev + 1);
      setOverride('none');
      autoSwitchFullToStudio();
    }
  }, [liveItem, activeBlockIndex, autoSwitchFullToStudio]);

  const handlePrevious = useCallback(() => {
    if (!liveItem) return;
    if (activeBlockIndex > 0) {
      setActiveBlockIndex((prev) => prev - 1);
      setOverride('none');
      autoSwitchFullToStudio();
    }
  }, [liveItem, activeBlockIndex, autoSwitchFullToStudio]);

  const remoteCmdHandlerRef = useRef<(cmd: RemoteCommandMessage) => void>(() => {});
  remoteCmdHandlerRef.current = (cmd) => {
    if (cmd.action === 'NEXT') {
      handleNext();
    } else if (cmd.action === 'PREV') {
      handlePrevious();
    } else if (cmd.action === 'SELECT_BLOCK' && typeof cmd.blockIndex === 'number') {
      if (liveItem && cmd.blockIndex >= 0 && cmd.blockIndex < liveItem.blocks.length) {
        setActiveBlockIndex(cmd.blockIndex);
        setOverride('none');
        autoSwitchFullToStudio();
      }
    } else if (cmd.action === 'SELECT_ITEM' && typeof cmd.itemId === 'string') {
      const targetItem = program.items.find((it) => it.id === cmd.itemId);
      if (targetItem) {
        const isTimedSongWithAudio =
          targetItem.type === 'song' &&
          targetItem.lyricsMode === 'timed' &&
          Boolean(targetItem.audioUrl);
        const startIdx = isTimedSongWithAudio
          ? (findBlockIndexForTime(targetItem.blocks, 0) ?? 0)
          : 0;

        // Autoplay the attached audio track when an audio-synced song is selected from the Android app.
        if (isTimedSongWithAudio) {
          if (liveTimedAudioItem?.id === targetItem.id && audioRef.current) {
            audioRef.current.currentTime = 0;
            setAudioTime(0);
            audioRef.current.play().catch(() => {});
          } else {
            pendingAutoPlayRef.current = true;
          }
        } else {
          pendingAutoPlayRef.current = false;
        }

        setBrowsingAdHocItem(null);
        setBrowsingItemId(targetItem.id);
        setLiveAdHocItem(null);
        setLiveItemId(targetItem.id);
        setActiveBlockIndex(startIdx);
        setOverride('none');
        autoSwitchFullToStudio();
      }
    } else if (cmd.action === 'TOGGLE_BLACKOUT') {
      setOverride((prev) => (prev === 'blackout' ? 'none' : 'blackout'));
    } else if (cmd.action === 'TOGGLE_CLEAR_TEXT') {
      toggleOverride('clearText');
    } else if (cmd.action === 'TOGGLE_LOGO') {
      setOverride((prev) => (prev === 'showLogo' ? 'none' : 'showLogo'));
    } else if (cmd.action === 'CLEAR_OVERRIDE') {
      setOverride('none');
    } else if (cmd.action === 'TOGGLE_RETURN_AUDIO') {
      if (returnFeedConfig.autoMuteWhenLive) {
        setReturnAudioManualUnmute((prev) => !prev);
      } else {
        // Enable autoMuteWhenLive so the pulpit speaker can mute Centro return audio too
        setReturnFeedConfig((prev) => {
          const updated = { ...prev, autoMuteWhenLive: true };
          try {
            localStorage.setItem('uecfi_return_feed_v1', JSON.stringify(updated));
          } catch {
            // Ignore storage quota errors
          }
          return updated;
        });
        setReturnAudioManualUnmute(false);
      }
    } else if (cmd.action === 'AUDIO_TOGGLE_PLAY') {
      handleToggleLiveAudio();
    } else if (cmd.action === 'AUDIO_STOP') {
      const audio = audioRef.current;
      if (audio && liveTimedAudioItem) {
        audio.pause();
        audio.currentTime = 0;
        setAudioTime(0);
        const startIdx = findBlockIndexForTime(liveTimedAudioItem.blocks, 0) ?? 0;
        setActiveBlockIndex(startIdx);
      }
    } else if (cmd.action === 'AUDIO_RESTART') {
      const audio = audioRef.current;
      if (audio && liveTimedAudioItem?.audioUrl) {
        audio.currentTime = 0;
        setAudioTime(0);
        const startIdx = findBlockIndexForTime(liveTimedAudioItem.blocks, 0) ?? 0;
        setActiveBlockIndex(startIdx);
        audio.play().catch(() => {});
      }
    } else if (cmd.action === 'AUDIO_SET_VOLUME' && typeof cmd.volume === 'number') {
      const clamped = Math.max(0, Math.min(1, cmd.volume));
      setAudioVolume(clamped);
      if (audioRef.current) {
        audioRef.current.volume = clamped;
      }
    }
  };

  useEffect(() => {
    const unsub = window.presenterAPI?.onRemoteCommand((cmd) => {
      remoteCmdHandlerRef.current(cmd);
    });
    return () => unsub?.();
  }, []);

  // Keyboard shortcuts for live presentation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        // Clear lingering focus ring on a previously clicked Content Grid card
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        handleNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        handlePrevious();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleNext, handlePrevious]);

  // Automatically switch Overflow feedSource back to 'auto' whenever the last live guest speaker
  // is taken offline (moved to Green Room, kicked, or disconnected).
  const prevLiveGuestCountRef = useRef(0);
  useEffect(() => {
    const liveCount = participantStageConfig.liveParticipantIds.length;
    if (prevLiveGuestCountRef.current > 0 && liveCount === 0) {
      setOverflowConfig((prev) => {
        if ((prev.feedSource ?? 'auto') === 'auto') return prev;
        const updated: OverflowStageConfig = { ...prev, feedSource: 'auto' };
        try {
          localStorage.setItem(
            'uecfi_overflow_layout_v1',
            JSON.stringify({ ...updated, enabled: false })
          );
        } catch {
          // Ignore storage quota errors
        }
        return updated;
      });
    }
    prevLiveGuestCountRef.current = liveCount;
  }, [participantStageConfig.liveParticipantIds.length]);

  const handleToggleOverflowScreen = async () => {
    if (!window.presenterAPI) return;
    if (overflowScreenOpen) {
      await window.presenterAPI.closeOverflowScreen();
      setOverflowScreenOpen(false);
    } else {
      await window.presenterAPI.openOverflowScreen();
      setOverflowScreenOpen(true);
    }
  };

  const handleToggleMainScreen = async () => {
    if (!window.presenterAPI) return;
    if (mainScreenOpen) {
      await window.presenterAPI.closeMainScreen();
      setMainScreenOpen(false);
    } else {
      await window.presenterAPI.openMainScreen();
      setMainScreenOpen(true);
    }
  };

  // Single-storage update: editing a Library item updates it in Library; editing a Program
  // slide or verse updates it across all Program entries (including converting legacy 'ref'
  // verse/slide entries to inline entries) as well as any ad-hoc browsing/live state.
  // Using functional setPrograms state updates avoids stale closures when activeProgramId changes.
  const syncItemChange = useCallback((updated: ProgramItem) => {
    setBrowsingAdHocItem((prev) => (prev && prev.id === updated.id ? updated : prev));
    setLiveAdHocItem((prev) => (prev && prev.id === updated.id ? updated : prev));

    if (updated.type === 'slide' || updated.type === 'verse') {
      const entryKind = updated.type === 'slide' ? 'slide' : 'verse';
      setPrograms((prev) =>
        prev.map((prog) => ({
          ...prog,
          entries: prog.entries.map((entry) => {
            if ((entry.kind === 'slide' || entry.kind === 'verse') && entry.item.id === updated.id) {
              return { kind: entryKind, item: updated };
            }
            if (entry.kind === 'ref' && entry.itemId === updated.id) {
              return { kind: entryKind, item: updated };
            }
            return entry;
          })
        }))
      );
    }
    setLibrary((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
  }, []);

  const handleSetLyricsMode = (mode: LyricsDisplayMode) => {
    if (!selectedItem) return;
    syncItemChange({ ...selectedItem, lyricsMode: mode });
  };

  const handleUpdateSongStyle = (
    patch: Partial<
      Pick<
        ProgramItem,
        | 'songTextColor'
        | 'songTitleColor'
        | 'songHighlightColor'
        | 'songOutlineWidth'
        | 'songOutlineColor'
        | 'songHighlightOutlineWidth'
        | 'songHighlightOutlineColor'
        | 'songBgDim'
        | 'themeBackground'
      >
    >
  ) => {
    if (!selectedItem || selectedItem.type !== 'song') return;
    const updated: ProgramItem = { ...selectedItem, ...patch };
    if (browsingAdHocItem && browsingAdHocItem.id === selectedItem.id) {
      setBrowsingAdHocItem(updated);
    }
    if (liveAdHocItem && liveAdHocItem.id === selectedItem.id) {
      setLiveAdHocItem(updated);
    }
    syncItemChange(updated);
  };

  const handleUpdateDocStyle = (
    patch: Partial<
      Pick<
        ProgramItem,
        | 'docMaxFontSize'
        | 'docTextColor'
        | 'docTitleColor'
        | 'docOutlineWidth'
        | 'docOutlineColor'
        | 'docBulletStyle'
        | 'docBulletColor'
        | 'docBgDim'
        | 'themeBackground'
      >
    >
  ) => {
    if (!selectedItem || selectedItem.type !== 'programItem') return;
    const updated: ProgramItem = { ...selectedItem, ...patch };
    if (browsingAdHocItem && browsingAdHocItem.id === selectedItem.id) {
      setBrowsingAdHocItem(updated);
    }
    if (liveAdHocItem && liveAdHocItem.id === selectedItem.id) {
      setLiveAdHocItem(updated);
    }
    syncItemChange(updated);
  };

  const handleInspectorBgImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedItem || (selectedItem.type !== 'song' && selectedItem.type !== 'verse')) return;
    const mediaUrl = await saveUserMediaFile(file);
    const bgValue = `url("${mediaUrl}") center/cover no-repeat`;
    const isStackedVerse =
      selectedItem.type === 'verse' &&
      selectedItem.blocks.some((b) => b.secondaryLines && b.secondaryLines.length > 0) &&
      (selectedItem.bibleLayout ?? 'stacked') === 'stacked';
    const updated: ProgramItem = isStackedVerse
      ? { ...selectedItem, verseStackedThemeBackground: bgValue }
      : { ...selectedItem, themeBackground: bgValue };
    if (browsingAdHocItem && browsingAdHocItem.id === selectedItem.id) {
      setBrowsingAdHocItem(updated);
    }
    if (liveAdHocItem && liveAdHocItem.id === selectedItem.id) {
      setLiveAdHocItem(updated);
    }
    syncItemChange(updated);
  };

  // Reset audio playback only when the live timed-audio item itself changes, not when browsing other items.
  useEffect(() => {
    const shouldAutoPlay = pendingAutoPlayRef.current && Boolean(liveTimedAudioItem?.audioUrl);
    const audio = audioRef.current;
    if (audio) {
      if (!shouldAutoPlay) {
        audio.pause();
      }
      if (audio.readyState > 0) {
        audio.currentTime = 0;
      }
    }
    setAudioPlaying(false);
    setAudioTime(0);
    setAudioDuration(0);
    if (shouldAutoPlay) {
      // Attempt immediate playback on the next frame; if the audio resource is still loading,
      // the <audio onCanPlay> handler will complete the autoplay once buffered.
      window.requestAnimationFrame(() => {
        const el = audioRef.current;
        if (!el) return;
        el.play()
          .then(() => {
            pendingAutoPlayRef.current = false;
          })
          .catch(() => {});
      });
    } else {
      pendingAutoPlayRef.current = false;
    }
  }, [liveTimedAudioItem?.id]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = audioVolume;
    }
  }, [audioVolume, liveTimedAudioItem?.audioUrl]);

  const updateAudioVolume = (nextVolume: number) => {
    const clamped = Math.max(0, Math.min(1, nextVolume));
    setAudioVolume(clamped);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
  };

  const renderAudioVolumeControl = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <button
        type="button"
        onClick={() => updateAudioVolume(audioVolume <= 0.01 ? 1 : 0)}
        title={audioVolume <= 0.01 ? 'Unmute live audio' : 'Mute live audio'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          padding: 0,
          color: 'var(--text-secondary)',
          cursor: 'pointer'
        }}
      >
        {audioVolume <= 0.01 ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={audioVolume}
        aria-label="Live audio volume"
        onChange={(e) => updateAudioVolume(Number(e.target.value))}
        style={{ flex: 1 }}
      />
      <span
        style={{
          fontSize: '0.72rem',
          color: 'var(--text-muted)',
          fontVariantNumeric: 'tabular-nums',
          minWidth: '34px',
          textAlign: 'right'
        }}
      >
        {Math.round(audioVolume * 100)}%
      </span>
    </div>
  );

  const handleToggleLiveAudio = () => {
    const audio = audioRef.current;
    if (!audio || !liveTimedAudioItem?.audioUrl) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  };

  const handleToggleTimedAudio = () => {
    // If the operator clicks Play on a different timed song in the Inspector, make it Live and start playing it.
    if (
      selectedItem?.type === 'song' &&
      selectedItem.lyricsMode === 'timed' &&
      selectedItem.audioUrl &&
      liveItem?.id !== selectedItem.id
    ) {
      guardLiveSwitch(selectedItem.id, selectedItem.title, () => {
        pendingAutoPlayRef.current = true;
        if (browsingAdHocItem && browsingAdHocItem.id === selectedItem.id) {
          setLiveAdHocItem(selectedItem);
        } else {
          setLiveAdHocItem(null);
          setLiveItemId(selectedItem.id);
        }
        const matchedIdx = findBlockIndexForTime(selectedItem.blocks, 0);
        setActiveBlockIndex(matchedIdx ?? 0);
        setOverride('none');
        autoSwitchFullToStudio();
      });
      return;
    }

    handleToggleLiveAudio();
  };

  const handleRestartTimedAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setAudioTime(0);
    if (liveTimedAudioItem) {
      setActiveBlockIndex(0);
    }
  };

  const handleInspectorAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedItem || selectedItem.type !== 'song') return;
    const mediaUrl = await saveUserMediaFile(file);
    syncItemChange({
      ...selectedItem,
      lyricsMode: 'timed',
      audioUrl: mediaUrl,
      audioFileName: file.name
    });
  };

  useEffect(() => {
    if (!audioPlaying || !liveTimedAudioItem) return;
    const timer = window.setInterval(() => {
      const audio = audioRef.current;
      if (!audio || audio.paused || scrubberSeekingRef.current) return;
      const current = audio.currentTime;
      setAudioTime(current);
      const idx = findBlockIndexForTime(liveTimedAudioItem.blocks, current);
      if (idx !== null && idx !== activeBlockIndex) {
        setActiveBlockIndex(idx);
        setOverride('none');
      }
    }, 120);
    return () => window.clearInterval(timer);
  }, [audioPlaying, liveTimedAudioItem, activeBlockIndex]);

  const handleStampNextBlockTime = () => {
    if (!selectedItem || selectedItem.type !== 'song') return;
    const currentSec = Math.round((audioRef.current?.currentTime ?? audioTime) * 10) / 10;
    const flatLines = flattenSongTimedLines(selectedItem.blocks);
    if (flatLines.length === 0) return;

    const currentLineIdx = findActiveTimedLineIndex(flatLines, currentSec, activeBlockIndex);
    // Stamp the first unstamped line, or the next line after the active one
    const firstUnstamped = flatLines.findIndex((l) => l.timeSec === undefined);
    const targetFlatIdx =
      firstUnstamped >= 0
        ? firstUnstamped
        : Math.min(currentLineIdx + 1, flatLines.length - 1);
    const targetLine = flatLines[targetFlatIdx];
    if (!targetLine) return;

    const updatedBlocks = selectedItem.blocks.map((b, bIdx) => {
      if (bIdx !== targetLine.blockIndex) return b;
      const nextTimings = [...(b.lineTimingsSec ?? [])];
      nextTimings[targetLine.lineIndex] = currentSec;
      return {
        ...b,
        lineTimingsSec: nextTimings,
        startTimeSec: targetLine.lineIndex === 0 ? currentSec : b.startTimeSec
      };
    });

    syncItemChange({ ...selectedItem, blocks: updatedBlocks });
    if (liveItem?.id === selectedItem.id) {
      setActiveBlockIndex(targetLine.blockIndex);
      setOverride('none');
    }
  };

  // Persistent default style for Bible tab / ad-hoc verses so customizations stick across chapters & restarts
  type SavedVerseStyle = Partial<
    Pick<
      ProgramItem,
      | 'bibleLayout'
      | 'verseMaxFontSize'
      | 'verseTextColor'
      | 'verseRefColor'
      | 'verseStackedPrimaryTextColor'
      | 'verseStackedPrimaryRefColor'
      | 'verseStackedSecondaryTextColor'
      | 'verseStackedSecondaryRefColor'
      | 'verseBgDim'
      | 'verseStackedThemeBackground'
      | 'verseStackedBgDim'
      | 'themeBackground'
    >
  >;
  const defaultVerseStyleRef = useRef<SavedVerseStyle>((() => {
    try {
      const raw = localStorage.getItem('uecfi_bible_verse_style_v1');
      if (raw) return JSON.parse(raw) as SavedVerseStyle;
    } catch {
      // Ignore malformed saved verse style
    }
    return {};
  })());

  const persistVerseStylePatch = useCallback((patch: SavedVerseStyle) => {
    const next: SavedVerseStyle = { ...defaultVerseStyleRef.current, ...patch };
    // Remove keys explicitly reset to undefined
    for (const key of Object.keys(next) as Array<keyof SavedVerseStyle>) {
      if (next[key] === undefined) {
        delete next[key];
      }
    }
    defaultVerseStyleRef.current = next;
    try {
      localStorage.setItem('uecfi_bible_verse_style_v1', JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
  }, []);

  const applySavedVerseStyle = useCallback((item: ProgramItem): ProgramItem => {
    if (item.type !== 'verse') return item;
    return { ...item, ...defaultVerseStyleRef.current };
  }, []);

  const handleSetBibleLayout = (layout: BibleLayoutMode) => {
    if (!selectedItem) return;
    persistVerseStylePatch({ bibleLayout: layout });
    const updated = { ...selectedItem, bibleLayout: layout };
    if (browsingAdHocItem && browsingAdHocItem.id === selectedItem.id) {
      setBrowsingAdHocItem(updated);
    }
    if (liveAdHocItem && liveAdHocItem.id === selectedItem.id) {
      setLiveAdHocItem(updated);
    }
    syncItemChange(updated);
  };

  const handleSetVerseMaxFontSize = (size: number) => {
    if (!selectedItem) return;
    persistVerseStylePatch({ verseMaxFontSize: size });
    const updated = { ...selectedItem, verseMaxFontSize: size };
    if (browsingAdHocItem && browsingAdHocItem.id === selectedItem.id) {
      setBrowsingAdHocItem(updated);
    }
    if (liveAdHocItem && liveAdHocItem.id === selectedItem.id) {
      setLiveAdHocItem(updated);
    }
    syncItemChange(updated);
  };

  const handleUpdateVerseStyle = (
    patch: Partial<
      Pick<
        ProgramItem,
        | 'verseTextColor'
        | 'verseRefColor'
        | 'verseStackedPrimaryTextColor'
        | 'verseStackedPrimaryRefColor'
        | 'verseStackedSecondaryTextColor'
        | 'verseStackedSecondaryRefColor'
        | 'verseBgDim'
        | 'verseStackedThemeBackground'
        | 'verseStackedBgDim'
        | 'themeBackground'
      >
    >
  ) => {
    if (!selectedItem || selectedItem.type !== 'verse') return;
    persistVerseStylePatch(patch);
    const updated: ProgramItem = { ...selectedItem, ...patch };
    if (browsingAdHocItem && browsingAdHocItem.id === selectedItem.id) {
      setBrowsingAdHocItem(updated);
    }
    if (liveAdHocItem && liveAdHocItem.id === selectedItem.id) {
      setLiveAdHocItem(updated);
    }
    syncItemChange(updated);
  };

  const renderColorRow = (
    label: string,
    value: string | undefined,
    defaultColor: string,
    swatches: string[],
    onChange: (color: string) => void
  ) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
      <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        {swatches.map((swatch) => (
          <button
            key={swatch}
            type="button"
            onClick={() => onChange(swatch)}
            title={swatch}
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '999px',
              background: swatch,
              border:
                (value || defaultColor).toLowerCase() === swatch
                  ? '2px solid var(--accent)'
                  : '1px solid rgba(255,255,255,0.28)',
              padding: 0
            }}
          />
        ))}
        <input
          type="color"
          aria-label={label}
          value={value || defaultColor}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '24px',
            height: '20px',
            padding: 0,
            border: '1px solid var(--border-subtle)',
            borderRadius: '4px',
            background: 'transparent',
            cursor: 'pointer'
          }}
        />
      </div>
    </div>
  );

  const handleProjectVerseItem = (item: ProgramItem, startBlockIndex: number) => {
    const styledItem = applySavedVerseStyle(item);
    guardLiveSwitch(styledItem.id, styledItem.title, () => {
      setBrowsingAdHocItem(styledItem);
      setLiveAdHocItem(styledItem);
      setActiveBlockIndex(startBlockIndex);
      setOverride('none');
    });
  };

  // Cmd/Ctrl+K toggles the Smart Bible Search page in place of the Content Grid
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCenterMode((prev) => (prev === 'search' ? 'grid' : 'search'));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Clicking a chapter or verse in the Verses tab populates the Content Grid without changing Live output
  const handleSelectVerseChapter = (item: ProgramItem, highlightBlockIndex?: number) => {
    setBrowsingAdHocItem(applySavedVerseStyle(item));
    setHighlightedVerseBlockIndex(
      typeof highlightBlockIndex === 'number' ? highlightBlockIndex : null
    );
    setCenterMode('grid');
  };

  useEffect(() => {
    if (highlightedVerseBlockIndex === null) return;
    const raf = window.requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>('[data-highlighted-block="true"]');
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [highlightedVerseBlockIndex, browsingAdHocItem?.id]);

  // Clicking a Library item loads it into Content Grid WITHOUT changing Live output
  const handleSelectLibraryItem = (item: ProgramItem) => {
    setBrowsingAdHocItem(null);
    setBrowsingItemId(item.id);
    setCenterMode('grid');
  };

  const handleDeleteLibraryItem = (itemId: string) => {
    setLibrary((prev) => prev.filter((it) => it.id !== itemId));
    setPrograms((prev) =>
      prev.map((p) => ({
        ...p,
        entries: p.entries.filter((e) => !(e.kind === 'ref' && e.itemId === itemId))
      }))
    );
    if (browsingItemId === itemId) {
      setBrowsingItemId(program.items.find((it) => it.id !== itemId)?.id ?? '');
    }
  };

  const handleDeleteAllLibrary = (filter: 'all' | 'song' | 'programItem') => {
    const removedIds = new Set(
      library
        .filter(
          (it) =>
            (it.type === 'song' || it.type === 'programItem') &&
            (filter === 'all' || it.type === filter)
        )
        .map((it) => it.id)
    );
    if (removedIds.size === 0) return;

    setLibrary((prev) => prev.filter((it) => !removedIds.has(it.id)));
    setPrograms((prev) =>
      prev.map((p) => ({
        ...p,
        entries: p.entries.filter((e) => !(e.kind === 'ref' && removedIds.has(e.itemId)))
      }))
    );
    if (removedIds.has(browsingItemId)) {
      setBrowsingItemId('');
    }
    setLibraryIoNotice({
      ok: true,
      text: `Deleted ${removedIds.size} item${removedIds.size === 1 ? '' : 's'}.`
    });
  };

  const handleExportProgramPlaylist = async () => {
    const mediaAssets = await bundleLocalMediaForExport(program.items);
    const payload = {
      app: 'UECFI Presenter',
      type: 'program-playlist',
      exportedAt: new Date().toISOString(),
      name: program.name,
      date: program.date,
      items: program.items,
      ...(Object.keys(mediaAssets).length > 0 ? { mediaAssets } : {})
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = program.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'program';
    a.href = url;
    a.download = `uecfi-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setProgramIoMenuOpen(false);
    setProgramIoNotice({
      ok: true,
      text: `Exported "${program.name}" (${program.items.length} items).`
    });
  };

  const handleImportProgramPlaylist = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const rawItems = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)
          ? (raw as { items: unknown[] }).items
          : null;

      if (!rawItems) {
        setProgramIoNotice({ ok: false, text: 'Invalid program playlist JSON file.' });
        return;
      }

      const validItems = rawItems.filter(
        (it): it is ProgramItem =>
          Boolean(it) &&
          typeof it === 'object' &&
          typeof (it as ProgramItem).type === 'string' &&
          typeof (it as ProgramItem).title === 'string' &&
          Array.isArray((it as ProgramItem).blocks)
      );

      if (validItems.length === 0) {
        setProgramIoNotice({ ok: false, text: 'No valid program items found in file.' });
        return;
      }

      const rawMediaAssets =
        raw && typeof raw === 'object' ? (raw as { mediaAssets?: unknown }).mediaAssets : undefined;
      const restoredItems = await restoreBundledMediaOnImport(validItems, rawMediaAssets);

      const importedName =
        raw && typeof raw === 'object' && typeof (raw as { name?: unknown }).name === 'string'
          ? (raw as { name: string }).name.trim() || file.name.replace(/\.json$/i, '')
          : file.name.replace(/\.json$/i, '');

      const newLibraryAdditions: ProgramItem[] = [];
      const existingLibById = new Map(library.map((it) => [it.id, it]));
      const entries: PersistedProgramRef['entries'] = restoredItems.map((it, idx) => {
        if (it.type === 'slide') {
          return {
            kind: 'slide',
            item: { ...it, id: `prog-slide-${Date.now()}-${idx}` }
          };
        }
        if (it.type === 'verse') {
          return {
            kind: 'verse',
            item: { ...it, id: `prog-verse-${Date.now()}-${idx}` }
          };
        }
        const targetId = it.sourceId ?? it.id;
        if (existingLibById.has(targetId)) {
          return { kind: 'ref', itemId: targetId };
        }
        const newLibId = targetId || `lib-import-${Date.now()}-${idx}`;
        const libItem: ProgramItem = { ...it, id: newLibId, sourceId: undefined };
        existingLibById.set(newLibId, libItem);
        newLibraryAdditions.push(libItem);
        return { kind: 'ref', itemId: newLibId };
      });

      if (newLibraryAdditions.length > 0) {
        setLibrary((prev) => [...newLibraryAdditions, ...prev]);
      }

      const newProg: PersistedProgramRef = {
        id: `prog-${Date.now()}`,
        name: importedName,
        date: new Date().toISOString().slice(0, 10),
        entries
      };

      setPrograms((prev) => [...prev, newProg]);
      setActiveProgramId(newProg.id);
      setBrowsingAdHocItem(null);
      const firstEntry = entries[0];
      const firstId = firstEntry
        ? firstEntry.kind === 'slide' || firstEntry.kind === 'verse'
          ? firstEntry.item.id
          : firstEntry.itemId
        : '';
      setBrowsingItemId(firstId);
      setProgramIoNotice({
        ok: true,
        text: `Imported "${importedName}" (${validItems.length} items).`
      });
    } catch {
      setProgramIoNotice({ ok: false, text: 'Failed to parse JSON file.' });
    }
  };

  const handleClearProgramPlaylist = () => {
    const count = program.items.length;
    setProgramRef((prev) => ({ ...prev, entries: [] }));
    if (!browsingAdHocItem && program.items.some((it) => it.id === browsingItemId)) {
      setBrowsingItemId('');
    }
    setProgramIoNotice({
      ok: true,
      text: `Cleared ${count} item${count === 1 ? '' : 's'} from "${program.name}".`
    });
  };

  const handleExportLibrary = async (filter: 'all' | 'song' | 'programItem') => {
    const itemsToExport = library.filter(
      (it) =>
        (it.type === 'song' || it.type === 'programItem') &&
        (filter === 'all' || it.type === filter)
    );
    const mediaAssets = await bundleLocalMediaForExport(itemsToExport);
    const payload = {
      app: 'UECFI Presenter',
      exportedAt: new Date().toISOString(),
      items: itemsToExport,
      ...(Object.keys(mediaAssets).length > 0 ? { mediaAssets } : {})
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const suffix = filter === 'song' ? 'songs' : filter === 'programItem' ? 'docs' : 'library';
    a.href = url;
    a.download = `uecfi-${suffix}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setLibraryIoMenuOpen(false);
    setLibraryIoNotice({
      ok: true,
      text: `Exported ${itemsToExport.length} item${itemsToExport.length === 1 ? '' : 's'}.`
    });
  };

  const handleImportLibraryFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const rawItems = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)
          ? (raw as { items: unknown[] }).items
          : null;

      if (!rawItems) {
        setLibraryIoNotice({ ok: false, text: 'Invalid library JSON file.' });
        return;
      }

      const validItems = rawItems.filter(
        (it): it is ProgramItem =>
          Boolean(it) &&
          typeof it === 'object' &&
          ((it as ProgramItem).type === 'song' || (it as ProgramItem).type === 'programItem') &&
          typeof (it as ProgramItem).title === 'string' &&
          Array.isArray((it as ProgramItem).blocks)
      );

      if (validItems.length === 0) {
        setLibraryIoNotice({ ok: false, text: 'No valid Songs or Docs found in file.' });
        return;
      }

      const rawMediaAssets =
        raw && typeof raw === 'object' ? (raw as { mediaAssets?: unknown }).mediaAssets : undefined;
      const restoredItems = await restoreBundledMediaOnImport(validItems, rawMediaAssets);

      setLibrary((prev) => {
        const existingIds = new Set(prev.map((it) => it.id));
        const additions: ProgramItem[] = restoredItems.map((it, idx) => {
          const id =
            it.id && !existingIds.has(it.id)
              ? it.id
              : `lib-import-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
          existingIds.add(id);
          return { ...it, id, sourceId: undefined };
        });
        return [...additions, ...prev];
      });

      setLibraryIoNotice({
        ok: true,
        text: `Imported ${validItems.length} item${validItems.length === 1 ? '' : 's'}.`
      });
    } catch {
      setLibraryIoNotice({ ok: false, text: 'Failed to parse JSON file.' });
    }
  };

  const handleSelectPlaylist = (playlistId: string) => {
    const target = programs.find((p) => p.id === playlistId);
    if (!target) return;
    setActiveProgramId(target.id);
    setBrowsingAdHocItem(null);
    const firstEntry = target.entries[0];
    const firstId = firstEntry
      ? firstEntry.kind === 'slide' || firstEntry.kind === 'verse'
        ? firstEntry.item.id
        : firstEntry.itemId
      : '';
    setBrowsingItemId(firstId);
    setPlaylistMenuOpen(false);
    setRenamingPlaylistId(null);
  };

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPlaylistName.trim();
    if (!trimmed) return;
    const newProg: PersistedProgramRef = {
      id: `prog-${Date.now()}`,
      name: trimmed,
      date: new Date().toISOString().slice(0, 10),
      entries: []
    };
    setPrograms((prev) => [...prev, newProg]);
    setActiveProgramId(newProg.id);
    setBrowsingAdHocItem(null);
    setBrowsingItemId('');
    setNewPlaylistName('');
    setPlaylistMenuOpen(false);
  };

  const handleRenamePlaylist = (playlistId: string) => {
    const trimmed = renamePlaylistValue.trim();
    if (!trimmed) {
      setRenamingPlaylistId(null);
      return;
    }
    setPrograms((prev) =>
      prev.map((p) => (p.id === playlistId ? { ...p, name: trimmed } : p))
    );
    setRenamingPlaylistId(null);
    setRenamePlaylistValue('');
  };

  const handleDuplicatePlaylist = (source: PersistedProgramRef) => {
    const copyId = `prog-${Date.now()}`;
    const clonedEntries = source.entries.map((entry, idx) =>
      entry.kind === 'slide' || entry.kind === 'verse'
        ? {
            ...entry,
            item: {
              ...entry.item,
              id: `${entry.item.id}-copy-${Date.now()}-${idx}`
            }
          }
        : { ...entry }
    );
    const copy: PersistedProgramRef = {
      id: copyId,
      name: `${source.name} (Copy)`,
      date: new Date().toISOString().slice(0, 10),
      entries: clonedEntries
    };
    setPrograms((prev) => [...prev, copy]);
    setActiveProgramId(copyId);
    setBrowsingAdHocItem(null);
    const firstEntry = clonedEntries[0];
    const firstId = firstEntry
      ? firstEntry.kind === 'slide' || firstEntry.kind === 'verse'
        ? firstEntry.item.id
        : firstEntry.itemId
      : '';
    setBrowsingItemId(firstId);
    setPlaylistMenuOpen(false);
  };

  const handleDeletePlaylist = (playlistId: string) => {
    if (programs.length <= 1) return;
    const remaining = programs.filter((p) => p.id !== playlistId);
    setPrograms(remaining);
    if (programRef.id === playlistId && remaining[0]) {
      setActiveProgramId(remaining[0].id);
      setBrowsingAdHocItem(null);
      const firstEntry = remaining[0].entries[0];
      const firstId = firstEntry
        ? firstEntry.kind === 'slide' || firstEntry.kind === 'verse'
          ? firstEntry.item.id
          : firstEntry.itemId
        : '';
      setBrowsingItemId(firstId);
    }
  };

  const handleAddFromLibrary = (item: ProgramItem) => {
    setLibrary((prev) => (prev.some((it) => it.id === item.id) ? prev : [item, ...prev]));
    setProgramRef((prev) => ({
      ...prev,
      entries: [...prev.entries, { kind: 'ref', itemId: item.id }]
    }));
  };

  const handleMoveProgramItem = (index: number, delta: -1 | 1) => {
    setProgramRef((prev) => {
      const targetIdx = index + delta;
      if (targetIdx < 0 || targetIdx >= prev.entries.length) return prev;
      const nextEntries = [...prev.entries];
      const [moved] = nextEntries.splice(index, 1);
      nextEntries.splice(targetIdx, 0, moved);
      return { ...prev, entries: nextEntries };
    });
  };

  const handleReorderProgramItem = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
    setProgramRef((prev) => {
      if (fromIdx >= prev.entries.length || toIdx >= prev.entries.length) return prev;
      const nextEntries = [...prev.entries];
      const [moved] = nextEntries.splice(fromIdx, 1);
      nextEntries.splice(toIdx, 0, moved);
      return { ...prev, entries: nextEntries };
    });
  };

  const handleAddVerseToProgram = (item: ProgramItem) => {
    const styledItem = applySavedVerseStyle(item);
    setProgramRef((prev) => ({
      ...prev,
      entries: [...prev.entries, { kind: 'verse', item: styledItem }]
    }));
  };

  const handleRemoveProgramItem = (itemId: string) => {
    setProgramRef((prev) => {
      const nextEntries = prev.entries.filter((e) =>
        e.kind === 'slide' || e.kind === 'verse' ? e.item.id !== itemId : e.itemId !== itemId
      );
      const firstId = nextEntries[0]
        ? nextEntries[0].kind === 'slide' || nextEntries[0].kind === 'verse'
          ? nextEntries[0].item.id
          : nextEntries[0].itemId
        : '';
      if (browsingItemId === itemId) {
        setBrowsingItemId(firstId);
      }
      if (liveItemId === itemId) {
        setLiveItemId('');
        setActiveBlockIndex(0);
      }
      return { ...prev, entries: nextEntries };
    });
  };

  const handleOpenNewEditor = (type: ContentType) => {
    setEditingItem(null);
    setEditorDefaultType(type);
    if (type === 'slide') {
      setSlideBuilderOpen(true);
    } else {
      setEditorOpen(true);
    }
  };

  const handleOpenEditEditor = (item: ProgramItem) => {
    setEditingItem(item);
    setEditorDefaultType(item.type);
    if (item.type === 'slide') {
      setSlideBuilderOpen(true);
    } else if (item.type === 'verse') {
      setProgramPickerMode('bible');
      setProgramPickerOpen(true);
    } else {
      setEditorOpen(true);
    }
  };

  const handleSaveEditorItem = (saved: ProgramItem) => {
    const existsInProgram = programRef.entries.some((e) =>
      e.kind === 'slide' || e.kind === 'verse' ? e.item.id === saved.id : e.itemId === saved.id
    );
    if (editingItem || existsInProgram) {
      syncItemChange(saved);
    } else if (saved.type === 'slide') {
      setProgramRef((prev) => ({
        ...prev,
        entries: [...prev.entries, { kind: 'slide', item: saved }]
      }));
      setBrowsingAdHocItem(null);
      setBrowsingItemId(saved.id);
    } else {
      setLibrary((prev) => [saved, ...prev]);
    }
  };

  const toggleOverride = (target: OutputOverride) => {
    setOverride((prev) => {
      const next = prev === target ? 'none' : target;
      if (target === 'clearText') {
        if (next === 'clearText') {
          restoreAutoSwitchedFull();
        } else {
          autoSwitchFullToStudio();
        }
      }
      return next;
    });
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-app)' }}>
      {/* Persistent live timed-lyrics audio player; stays mounted while browsing other items */}
      {liveTimedAudioItem?.audioUrl && (
        <audio
          ref={audioRef}
          src={liveTimedAudioItem.audioUrl}
          onPlay={() => {
            pendingAutoPlayRef.current = false;
            setAudioPlaying(true);
          }}
          onCanPlay={(e) => {
            if (pendingAutoPlayRef.current) {
              pendingAutoPlayRef.current = false;
              e.currentTarget.play().catch(() => {});
            }
          }}
          onPause={() => setAudioPlaying(false)}
          onEnded={() => setAudioPlaying(false)}
          onLoadedMetadata={(e) => setAudioDuration(e.currentTarget.duration || 0)}
          onTimeUpdate={(e) => {
            if (scrubberSeekingRef.current) return;
            const current = e.currentTarget.currentTime;
            setAudioTime(current);
            if (!e.currentTarget.paused) {
              const idx = findBlockIndexForTime(liveTimedAudioItem.blocks, current);
              if (idx !== null && idx !== activeBlockIndex) {
                setActiveBlockIndex(idx);
                setOverride('none');
              }
            }
          }}
        />
      )}

      {/* Top Bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border-subtle)',
          gap: '12px',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img
              src={uecfiLogoTiny}
              alt=""
              width={24}
              height={24}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                objectFit: 'contain',
                flexShrink: 0
              }}
            />
            <strong style={{ fontSize: '1rem', letterSpacing: '0.02em' }}>{t.appName}</strong>
          </div>
          <button
            type="button"
            onClick={handleToggleMainScreen}
            title={mainScreenOpen ? t.screens.closeMainScreen : t.screens.openMainScreen}
            aria-label={mainScreenOpen ? t.screens.closeMainScreen : t.screens.openMainScreen}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '7px 10px',
              borderRadius: '8px',
              border: 'none',
              background: mainScreenOpen ? '#dc2626' : '#2563eb',
              color: '#ffffff'
            }}
          >
            {mainScreenOpen ? <Square size={15} fill="currentColor" /> : <Cast size={16} />}
          </button>
          <button
            type="button"
            onClick={handlePrevious}
            disabled={!liveItem || activeBlockIndex <= 0}
            style={{
              ...toolbarBtnStyle(false),
              padding: '7px 9px',
              opacity: !liveItem || activeBlockIndex <= 0 ? 0.45 : 1
            }}
            title={t.controls.previous}
            aria-label={t.controls.previous}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={!liveItem || activeBlockIndex + 1 >= liveItem.blocks.length}
            style={{
              ...toolbarBtnStyle(false),
              padding: '7px 9px',
              opacity: !liveItem || activeBlockIndex + 1 >= liveItem.blocks.length ? 0.45 : 1
            }}
            title={t.controls.next}
            aria-label={t.controls.next}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Live Output Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => toggleOverride('clearText')}
            style={toolbarBtnStyle(override === 'clearText', '#f59e0b')}
          >
            <Eraser size={14} />
            {t.controls.clearText}
          </button>
          <button
            type="button"
            onClick={() => toggleOverride('blackout')}
            style={toolbarBtnStyle(override === 'blackout', '#ef4444')}
          >
            <MonitorOff size={14} />
            {t.controls.blackout}
          </button>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'stretch',
              borderRadius: '8px',
              overflow: 'hidden',
              border: `1px solid ${override === 'showLogo' ? '#3b82f6' : 'var(--border-subtle)'}`,
              background: override === 'showLogo' ? 'rgba(59, 130, 246, 0.16)' : 'var(--bg-panel-elevated)'
            }}
          >
            <button
              type="button"
              onClick={() => toggleOverride('showLogo')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 11px',
                border: 'none',
                background: 'transparent',
                color: override === 'showLogo' ? '#93c5fd' : 'var(--text-primary)',
                fontSize: '0.82rem',
                fontWeight: 600
              }}
            >
              <Church size={14} />
              Logo
            </button>
            <div
              style={{
                width: '1px',
                background: override === 'showLogo' ? 'rgba(59, 130, 246, 0.45)' : 'var(--border-subtle)'
              }}
            />
            <button
              type="button"
              onClick={() => setLogoBuilderOpen(true)}
              title="Customize Logo Slide"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '7px 9px',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-secondary)'
              }}
            >
              <Pencil size={13} />
            </button>
          </div>

          <div style={{ width: '1px', height: '22px', background: 'var(--border-subtle)', margin: '0 2px' }} />

          <button
            type="button"
            onClick={() => {
              refreshDisplaysAndRemote();
              setParticipantsModalOpen((prev) => !prev);
            }}
            style={toolbarBtnStyle(
              participantsModalOpen ||
                participantStageConfig.liveParticipantIds.length > 0 ||
                overflowConfig.enabled
            )}
            title="Toggle Video Feeds Panel (Green Room & Centro Cam)"
          >
            <Users size={14} />
            Video Feeds
            {(participants.length > 0 || overflowConfig.enabled) && (
              <span
                style={{
                  background:
                    participantStageConfig.liveParticipantIds.length > 0
                      ? '#dc2626'
                      : overflowConfig.enabled
                        ? '#059669'
                        : '#eab308',
                  color:
                    participantStageConfig.liveParticipantIds.length > 0 || overflowConfig.enabled
                      ? '#fff'
                      : '#0f172a',
                  borderRadius: '999px',
                  padding: '1px 6px',
                  fontSize: '0.7rem',
                  fontWeight: 700
                }}
              >
                {participants.length + (overflowConfig.enabled ? 1 : 0)}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              refreshDisplaysAndRemote();
              setSetupModalOpen(true);
            }}
            title="Settings (Displays, Local Remote, Online Relay)"
            aria-label="Settings"
            style={toolbarBtnStyle(false)}
          >
            <Settings size={15} />
            <span>Settings</span>
            {remoteInfo && remoteInfo.connectedClients > 0 && (
              <span
                style={{
                  background: '#1d4ed8',
                  color: '#fff',
                  borderRadius: '999px',
                  padding: '1px 6px',
                  fontSize: '0.7rem'
                }}
              >
                {remoteInfo.connectedClients}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={handleToggleOverflowScreen}
            title="Open/Close HDMI Overflow Room Screen"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              background: overflowScreenOpen ? '#059669' : 'var(--bg-panel-elevated)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.8rem'
            }}
          >
            <Monitor size={14} />
            {overflowScreenOpen ? 'Close Overflow' : 'Overflow'}
          </button>
        </div>
      </header>

      {remoteInfo?.serverError && (
        <div
          role="alert"
          style={{
            padding: '6px 16px',
            background: 'rgba(220, 38, 38, 0.16)',
            borderBottom: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#fca5a5',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          <span>
            LAN Remote Server failed to start ({remoteInfo.serverError}). Local presentation and media still work, but phones/tablets cannot connect.
          </span>
        </div>
      )}

      {/* Main 3-Column Presenter Workspace with Resizable Dividers */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: `${leftWidth}px 5px 1fr 5px ${rightWidth}px`,
          background: 'var(--bg-app)'
        }}
      >
        {/* Left Column: Program + Library */}
        <aside style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden', background: 'var(--bg-panel)' }}>
          {/* Program Section */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={panelHeaderStyle}>
              <div ref={playlistMenuRef} style={{ position: 'relative', minWidth: 0, flex: 1 }}>
                <button
                  type="button"
                  onClick={() => {
                    setPlaylistMenuOpen((prev) => !prev);
                    setRenamingPlaylistId(null);
                  }}
                  title="Switch or manage program playlists"
                  style={{
                    maxWidth: '100%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'transparent',
                    border: '1px solid transparent',
                    borderRadius: '6px',
                    padding: '2px 4px',
                    marginLeft: '-4px',
                    color: 'var(--text-primary)',
                    fontSize: 'inherit',
                    fontWeight: 'inherit',
                    letterSpacing: 'inherit',
                    textTransform: 'inherit',
                    textAlign: 'left',
                    minWidth: 0
                  }}
                >
                  <ListMusic size={13} style={{ flexShrink: 0, color: '#93c5fd' }} />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {program.name}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', flexShrink: 0 }}>
                    ({program.items.length})
                  </span>
                  <ChevronDown size={13} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                </button>

                {playlistMenuOpen && (
                  <div
                    style={{
                      ...popupMenuStyle,
                      left: 0,
                      right: 'auto',
                      width: '270px',
                      maxWidth: 'calc(100vw - 32px)',
                      padding: '8px',
                      gap: '6px',
                      textTransform: 'none',
                      letterSpacing: 'normal'
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        padding: '2px 4px'
                      }}
                    >
                      {t.workspace.program} Playlists ({programs.length})
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '3px',
                        maxHeight: '220px',
                        overflowY: 'auto'
                      }}
                    >
                      {programs.map((p) => {
                        const isActive = p.id === programRef.id;
                        const isRenaming = renamingPlaylistId === p.id;
                        return (
                          <div
                            key={p.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 6px',
                              borderRadius: '7px',
                              border: '1px solid',
                              borderColor: isActive ? 'var(--accent)' : 'transparent',
                              background: isActive
                                ? 'rgba(59,130,246,0.16)'
                                : 'var(--bg-app)'
                            }}
                          >
                            {isRenaming ? (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  handleRenamePlaylist(p.id);
                                }}
                                style={{ display: 'flex', flex: 1, gap: '4px', minWidth: 0 }}
                              >
                                <input
                                  type="text"
                                  value={renamePlaylistValue}
                                  onChange={(e) => setRenamePlaylistValue(e.target.value)}
                                  autoFocus
                                  style={{
                                    flex: 1,
                                    minWidth: 0,
                                    padding: '3px 6px',
                                    borderRadius: '5px',
                                    border: '1px solid var(--accent)',
                                    background: 'var(--bg-panel)',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.76rem'
                                  }}
                                />
                                <button
                                  type="submit"
                                  title="Save name"
                                  style={miniIconBtnStyle(false)}
                                >
                                  <Check size={12} />
                                </button>
                              </form>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleSelectPlaylist(p.id)}
                                  style={{
                                    flex: 1,
                                    minWidth: 0,
                                    textAlign: 'left',
                                    background: 'transparent',
                                    border: 'none',
                                    padding: '2px 4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '6px'
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: '0.78rem',
                                      fontWeight: isActive ? 700 : 500,
                                      color: isActive ? '#93c5fd' : 'var(--text-primary)',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis'
                                    }}
                                  >
                                    {p.name}
                                  </span>
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                                    {p.entries.length}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRenamingPlaylistId(p.id);
                                    setRenamePlaylistValue(p.name);
                                  }}
                                  title="Rename playlist"
                                  style={miniIconBtnStyle(false)}
                                >
                                  <Edit3 size={11} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDuplicatePlaylist(p)}
                                  title="Duplicate playlist"
                                  style={miniIconBtnStyle(false)}
                                >
                                  <Copy size={11} />
                                </button>
                                {programs.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePlaylist(p.id)}
                                    title="Delete playlist"
                                    style={miniIconBtnStyle(true)}
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <form
                      onSubmit={handleCreatePlaylist}
                      style={{
                        display: 'flex',
                        gap: '4px',
                        paddingTop: '6px',
                        borderTop: '1px solid var(--border-subtle)'
                      }}
                    >
                      <input
                        type="text"
                        value={newPlaylistName}
                        onChange={(e) => setNewPlaylistName(e.target.value)}
                        placeholder="New playlist name..."
                        style={{
                          flex: 1,
                          minWidth: 0,
                          padding: '5px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          background: 'var(--bg-app)',
                          color: 'var(--text-primary)',
                          fontSize: '0.76rem'
                        }}
                      />
                      <button
                        type="submit"
                        disabled={!newPlaylistName.trim()}
                        style={{
                          padding: '5px 9px',
                          borderRadius: '6px',
                          border: '1px solid var(--accent)',
                          background: 'rgba(59,130,246,0.18)',
                          color: '#93c5fd',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          opacity: newPlaylistName.trim() ? 1 : 0.5
                        }}
                      >
                        <Plus size={12} /> New
                      </button>
                    </form>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <div ref={programAddMenuRef} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setProgramAddMenuOpen((prev) => !prev)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 9px',
                      borderRadius: '5px',
                      border: 'none',
                      background: '#2563eb',
                      color: '#ffffff',
                      fontSize: '0.72rem',
                      fontWeight: 600
                    }}
                  >
                    <Plus size={12} /> Add
                  </button>

                  {programAddMenuOpen && (
                    <div style={popupMenuStyle}>
                      <button
                        type="button"
                        onClick={() => {
                          setProgramAddMenuOpen(false);
                          handleOpenNewEditor('slide');
                        }}
                        style={menuItemBtnStyle}
                      >
                        <Presentation size={13} />
                        <span>{t.editor.newSlide}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setProgramAddMenuOpen(false);
                          setPickerQuery('');
                          setPickerFilter('all');
                          setProgramPickerMode('library');
                          setProgramPickerOpen(true);
                        }}
                        style={menuItemBtnStyle}
                      >
                        <Music size={13} />
                        <span>From {t.workspace.library}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setProgramAddMenuOpen(false);
                          setEditingItem(null);
                          setProgramPickerMode('bible');
                          setProgramPickerOpen(true);
                        }}
                        style={menuItemBtnStyle}
                      >
                        <BookOpen size={13} />
                        <span>{t.contentTypes.verse}</span>
                      </button>
                    </div>
                  )}
                </div>

                <div ref={programIoMenuRef} style={{ position: 'relative' }}>
                  <input
                    ref={programImportInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleImportProgramPlaylist}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => setProgramIoMenuOpen((prev) => !prev)}
                    aria-label="Export, import, or clear program"
                    title="Export / Import / Clear Program"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '4px 5px',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: programIoMenuOpen ? 'var(--accent)' : 'var(--border-subtle)',
                      background: programIoMenuOpen
                        ? 'rgba(59,130,246,0.16)'
                        : 'var(--bg-panel-elevated)',
                      color: programIoMenuOpen ? '#93c5fd' : 'var(--text-secondary)'
                    }}
                  >
                    <MoreVertical size={13} />
                  </button>

                  {programIoMenuOpen && (
                    <div style={{ ...popupMenuStyle, minWidth: '180px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setProgramIoMenuOpen(false);
                          programImportInputRef.current?.click();
                        }}
                        style={menuItemBtnStyle}
                      >
                        <Upload size={13} />
                        <span>Import {t.workspace.program}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleExportProgramPlaylist}
                        style={menuItemBtnStyle}
                      >
                        <Download size={13} />
                        <span>Export {t.workspace.program}</span>
                      </button>
                      <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '2px 0' }} />
                      <button
                        type="button"
                        disabled={program.items.length === 0}
                        onClick={() => {
                          setProgramIoMenuOpen(false);
                          setConfirmDeleteItem({
                            id: program.id,
                            title: `all items in "${program.name}"`,
                            target: 'program-clear'
                          });
                        }}
                        style={{
                          ...menuItemBtnStyle,
                          color: '#fca5a5',
                          opacity: program.items.length === 0 ? 0.45 : 1
                        }}
                      >
                        <Trash2 size={13} />
                        <span>Clear All Items</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {programIoNotice && (
              <div
                style={{
                  padding: '5px 10px',
                  fontSize: '0.73rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '6px',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: programIoNotice.ok
                    ? 'rgba(16, 185, 129, 0.12)'
                    : 'rgba(239, 68, 68, 0.12)',
                  color: programIoNotice.ok ? '#6ee7b7' : '#fca5a5'
                }}
              >
                <span>{programIoNotice.text}</span>
                <button
                  type="button"
                  onClick={() => setProgramIoNotice(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'inherit',
                    fontSize: '0.72rem',
                    padding: '0 4px'
                  }}
                >
                  Dismiss
                </button>
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {program.items.map((item, idx) => {
                const isSelected = !browsingAdHocItem && item.id === browsingItemId;
                const isDragOver =
                  dragOverProgramIdx === idx &&
                  draggedProgramIdx !== null &&
                  draggedProgramIdx !== idx;
                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => {
                      setDraggedProgramIdx(idx);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(idx));
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverProgramIdx !== idx) setDragOverProgramIdx(idx);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedProgramIdx !== null) {
                        handleReorderProgramItem(draggedProgramIdx, idx);
                      }
                      setDraggedProgramIdx(null);
                      setDragOverProgramIdx(null);
                    }}
                    onDragEnd={() => {
                      setDraggedProgramIdx(null);
                      setDragOverProgramIdx(null);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px',
                      borderRadius: '8px',
                      border: '1px solid',
                      borderColor: isDragOver
                        ? '#38bdf8'
                        : isSelected
                          ? 'var(--accent)'
                          : 'transparent',
                      background: isDragOver
                        ? 'rgba(56,189,248,0.12)'
                        : isSelected
                          ? 'rgba(59,130,246,0.16)'
                          : 'transparent',
                      opacity: draggedProgramIdx === idx ? 0.5 : 1
                    }}
                  >
                    <span
                      title="Drag to reorder"
                      style={{
                        color: 'var(--text-muted)',
                        display: 'inline-flex',
                        paddingLeft: '2px',
                        cursor: 'grab'
                      }}
                    >
                      <GripVertical size={13} />
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSelectProgramItem(item)}
                      onDoubleClick={() => handlePresentProgramItem(item)}
                      title="Click to preview · Double-click to present"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        textAlign: 'left',
                        padding: '6px 8px',
                        border: 'none',
                        background: 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                      }}
                    >
                      <span style={{ color: isSelected ? '#60a5fa' : 'var(--text-secondary)' }}>
                        {getTypeIcon(item.type)}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '0.84rem',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {item.title}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {t.contentTypes[item.type]}
                          {item.type === 'song' && item.lyricsMode
                            ? ` • ${item.lyricsMode === 'timed' ? t.lyricsModes.timedMode : t.lyricsModes.slideMode}`
                            : ''}
                        </div>
                      </div>
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <button
                        type="button"
                        onClick={() => handleMoveProgramItem(idx, -1)}
                        disabled={idx === 0}
                        title="Move Up"
                        style={miniIconBtnStyle(idx === 0)}
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveProgramItem(idx, 1)}
                        disabled={idx === program.items.length - 1}
                        title="Move Down"
                        style={miniIconBtnStyle(idx === program.items.length - 1)}
                      >
                        <ArrowDown size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEditEditor(item)}
                        title={t.editor.edit}
                        style={miniIconBtnStyle(false)}
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmDeleteItem({ id: item.id, title: item.title, target: 'program' })
                        }
                        title={t.editor.delete}
                        style={miniIconBtnStyle(false)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Resizable Vertical Divider between Program and Verses/Library */}
          <div
            onPointerDown={startLeftVerticalResize}
            title="Drag to resize"
            style={{
              height: '5px',
              background: 'var(--border-subtle)',
              cursor: 'row-resize',
              flexShrink: 0
            }}
          />

          {/* Library / Verses Section */}
          <div
            style={{
              height: `${leftBottomPct}%`,
              minHeight: '180px',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ ...panelHeaderStyle, gap: '6px', padding: '6px 8px' }}>
              <button
                type="button"
                onClick={() => setLibraryTab('verses')}
                style={{
                  flex: 1,
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: '1px solid',
                  borderColor: libraryTab === 'verses' ? 'var(--accent)' : 'transparent',
                  background: libraryTab === 'verses' ? 'rgba(59,130,246,0.16)' : 'transparent',
                  fontSize: '0.78rem',
                  fontWeight: 700
                }}
              >
                {t.workspace.bible}
              </button>
              <button
                type="button"
                onClick={() => setLibraryTab('library')}
                style={{
                  flex: 1,
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: '1px solid',
                  borderColor: libraryTab === 'library' ? 'var(--accent)' : 'transparent',
                  background: libraryTab === 'library' ? 'rgba(59,130,246,0.16)' : 'transparent',
                  fontSize: '0.78rem',
                  fontWeight: 700
                }}
              >
                {t.workspace.library}
              </button>
            </div>

            {libraryTab === 'verses' ? (
              <div style={{ flex: 1, minHeight: 0 }}>
                <BibleLibraryPanel
                  onProjectVerseItem={handleProjectVerseItem}
                  onSelectVerseChapter={handleSelectVerseChapter}
                  onOpenAiSearch={() => setCenterMode((prev) => (prev === 'search' ? 'grid' : 'search'))}
                  aiSearchOpen={centerMode === 'search'}
                  liveVerseLabel={
                    liveItem?.type === 'verse' && override === 'none'
                      ? liveItem.blocks[activeBlockIndex]?.label
                      : selectedItem?.type === 'verse' && highlightedVerseBlockIndex !== null
                        ? selectedItem.blocks[highlightedVerseBlockIndex]?.label
                        : undefined
                  }
                />
              </div>
            ) : (
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    padding: '6px 8px',
                    display: 'flex',
                    gap: '4px',
                    borderBottom: '1px solid var(--border-subtle)',
                    alignItems: 'center',
                    position: 'relative'
                  }}
                >
                  {(
                    [
                      { id: 'song', label: t.contentTypes.song },
                      { id: 'programItem', label: t.contentTypes.programItem }
                    ] as const
                  ).map((f) => {
                    const active = libraryFilter === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setLibraryFilter((prev) => (prev === f.id ? 'all' : f.id))}
                        style={{
                          ...createBtnStyle,
                          borderColor: active ? 'var(--live-green)' : 'var(--border-subtle)',
                          background: active ? 'rgba(34, 197, 94, 0.2)' : 'var(--bg-panel-elevated)',
                          color: active ? '#86efac' : 'var(--text-primary)'
                        }}
                      >
                        {f.label}
                      </button>
                    );
                  })}

                  <div ref={addMenuRef} style={{ position: 'relative' }}>
                    <button
                      type="button"
                      onClick={() => setAddMenuOpen((prev) => !prev)}
                      style={{
                        ...createBtnStyle,
                        flex: 'none',
                        padding: '5px 10px',
                        borderRadius: '5px',
                        border: 'none',
                        background: '#2563eb',
                        color: '#ffffff',
                        fontWeight: 600
                      }}
                    >
                      <Plus size={12} /> Add
                    </button>

                    {addMenuOpen && (
                      <div style={popupMenuStyle}>
                        {(
                          [
                            { type: 'song', label: t.editor.newSong },
                            { type: 'programItem', label: t.editor.newProgramItem }
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.type}
                            type="button"
                            onClick={() => {
                              setAddMenuOpen(false);
                              handleOpenNewEditor(opt.type);
                            }}
                            style={menuItemBtnStyle}
                          >
                            {getTypeIcon(opt.type)}
                            <span>{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div ref={libraryIoMenuRef} style={{ position: 'relative' }}>
                    <input
                      ref={libraryImportInputRef}
                      type="file"
                      accept=".json,application/json"
                      onChange={handleImportLibraryFile}
                      style={{ display: 'none' }}
                    />
                    <button
                      type="button"
                      onClick={() => setLibraryIoMenuOpen((prev) => !prev)}
                      aria-label="Export or import songs and docs"
                      title="Export / Import Songs & Docs"
                      style={{
                        ...createBtnStyle,
                        flex: 'none',
                        padding: '5px 6px',
                        borderColor: libraryIoMenuOpen ? 'var(--accent)' : 'var(--border-subtle)',
                        background: libraryIoMenuOpen
                          ? 'rgba(59,130,246,0.16)'
                          : 'var(--bg-panel-elevated)',
                        color: libraryIoMenuOpen ? '#93c5fd' : 'var(--text-secondary)'
                      }}
                    >
                      <MoreVertical size={13} />
                    </button>

                    {libraryIoMenuOpen && (
                      <div style={{ ...popupMenuStyle, minWidth: '185px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setLibraryIoMenuOpen(false);
                            libraryImportInputRef.current?.click();
                          }}
                          style={menuItemBtnStyle}
                        >
                          <Upload size={13} />
                          <span>Import {t.contentTypes.song} / {t.contentTypes.programItem}</span>
                        </button>
                        <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '2px 0' }} />
                        <button
                          type="button"
                          onClick={() => handleExportLibrary('all')}
                          style={menuItemBtnStyle}
                        >
                          <Download size={13} />
                          <span>Export All ({t.contentTypes.song} &amp; {t.contentTypes.programItem})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportLibrary('song')}
                          style={menuItemBtnStyle}
                        >
                          <Music size={13} />
                          <span>Export {t.contentTypes.song}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportLibrary('programItem')}
                          style={menuItemBtnStyle}
                        >
                          <FileText size={13} />
                          <span>Export {t.contentTypes.programItem}</span>
                        </button>
                        <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '2px 0' }} />
                        <button
                          type="button"
                          onClick={() => {
                            setLibraryIoMenuOpen(false);
                            setConfirmDeleteItem({
                              id: 'song',
                              title: `all ${t.contentTypes.song}`,
                              target: 'library-bulk'
                            });
                          }}
                          style={{ ...menuItemBtnStyle, color: '#fca5a5' }}
                        >
                          <Trash2 size={13} />
                          <span>Delete All {t.contentTypes.song}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setLibraryIoMenuOpen(false);
                            setConfirmDeleteItem({
                              id: 'programItem',
                              title: `all ${t.contentTypes.programItem}`,
                              target: 'library-bulk'
                            });
                          }}
                          style={{ ...menuItemBtnStyle, color: '#fca5a5' }}
                        >
                          <Trash2 size={13} />
                          <span>Delete All {t.contentTypes.programItem}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setLibraryIoMenuOpen(false);
                            setConfirmDeleteItem({
                              id: 'all',
                              title: `all ${t.contentTypes.song} & ${t.contentTypes.programItem}`,
                              target: 'library-bulk'
                            });
                          }}
                          style={{ ...menuItemBtnStyle, color: '#fca5a5' }}
                        >
                          <Trash2 size={13} />
                          <span>Delete All ({t.contentTypes.song} &amp; {t.contentTypes.programItem})</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {libraryIoNotice && (
                  <div
                    style={{
                      padding: '5px 10px',
                      fontSize: '0.73rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '6px',
                      borderBottom: '1px solid var(--border-subtle)',
                      background: libraryIoNotice.ok
                        ? 'rgba(16, 185, 129, 0.12)'
                        : 'rgba(239, 68, 68, 0.12)',
                      color: libraryIoNotice.ok ? '#6ee7b7' : '#fca5a5'
                    }}
                  >
                    <span>{libraryIoNotice.text}</span>
                    <button
                      type="button"
                      onClick={() => setLibraryIoNotice(null)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'inherit',
                        fontSize: '0.72rem',
                        padding: '0 4px'
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {library
                    .filter((item) => libraryFilter === 'all' || item.type === libraryFilter)
                    .sort((a, b) =>
                      a.title.localeCompare(b.title, undefined, {
                        sensitivity: 'base',
                        numeric: true
                      })
                    )
                    .map((item) => {
                      const isBrowsing = !browsingAdHocItem && browsingItemId === item.id;
                      return (
                        <div
                          key={item.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '5px 7px',
                            borderRadius: '8px',
                            border: '1px solid',
                            borderColor: isBrowsing ? 'var(--accent)' : 'transparent',
                            background: isBrowsing
                              ? 'rgba(59,130,246,0.16)'
                              : 'var(--bg-panel-elevated)',
                            gap: '6px'
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => handleSelectLibraryItem(item)}
                            title={`Open in ${t.workspace.contentGrid}`}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              textAlign: 'left',
                              background: 'transparent',
                              border: 'none',
                              padding: '3px 4px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}
                          >
                            <span
                              style={{
                                color: isBrowsing ? '#60a5fa' : 'var(--text-secondary)',
                                display: 'inline-flex'
                              }}
                            >
                              {getTypeIcon(item.type)}
                            </span>
                            <span
                              style={{
                                fontSize: '0.8rem',
                                fontWeight: isBrowsing ? 700 : 500,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                            >
                              {item.title}
                            </span>
                          </button>
                          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                            <button
                              type="button"
                              onClick={() => handleOpenEditEditor(item)}
                              title={t.editor.edit}
                              style={miniIconBtnStyle(false)}
                            >
                              <Edit3 size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAddFromLibrary(item)}
                              title={`Add to ${t.workspace.program}`}
                              style={miniIconBtnStyle(false)}
                            >
                              <Plus size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmDeleteItem({ id: item.id, title: item.title, target: 'library' })
                              }
                              title={t.editor.delete}
                              style={miniIconBtnStyle(false)}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Left Column Resizable Divider */}
        <div
          onPointerDown={(e) => startColumnResize('left', e)}
          title="Drag to resize"
          style={colDividerStyle}
        />

        {/* Center Column: Content Grid or Smart Bible Search */}
        <main style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden', background: 'var(--bg-app)' }}>
          <div
            style={{
              display: centerMode === 'search' ? 'flex' : 'none',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0
            }}
          >
            <BibleSearchPanel
              isOpen={centerMode === 'search'}
              onClose={() => setCenterMode('grid')}
              onProjectVerseItem={handleProjectVerseItem}
              onOpenChapterInGrid={(item) => {
                setBrowsingAdHocItem(applySavedVerseStyle(item));
                setCenterMode('grid');
              }}
              onAddVerseToProgram={handleAddVerseToProgram}
            />
          </div>
          <div
            style={{
              display: centerMode === 'grid' ? 'flex' : 'none',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0,
              minWidth: 0
            }}
          >
              <div style={{ ...panelHeaderStyle, gap: '8px' }}>
                <span
                  style={{
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {t.workspace.contentGrid} {selectedItem ? `— ${selectedItem.title}` : ''}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                  Click any card to project ({t.workspace.directToLive})
                </span>
              </div>

              <div
                ref={contentGridRef}
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  padding: '16px',
                  display: selectedItem?.type === 'verse' ? 'flex' : 'grid',
                  flexDirection: selectedItem?.type === 'verse' ? 'column' : undefined,
                  gridTemplateColumns:
                    selectedItem?.type === 'verse'
                      ? undefined
                      : 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))',
                  gap: selectedItem?.type === 'verse' ? '8px' : '12px',
                  alignContent: 'start'
                }}
              >
                {selectedItem?.blocks.map((block, index) => {
              const isLive =
                liveItem?.id === selectedItem.id &&
                index === activeBlockIndex &&
                override === 'none';
              const isVerse = selectedItem.type === 'verse';
              const hasSecondary = Boolean(block.secondaryLines && block.secondaryLines.length > 0);

              if (isVerse) {
                const isPreviewHighlighted = !isLive && highlightedVerseBlockIndex === index;
                const verseNumMatch = block.label?.match(/:(\d+)/);
                const verseBadge = verseNumMatch ? verseNumMatch[1] : String(index + 1);
                const deriveHeader = (b?: typeof block) =>
                  b?.groupHeader || b?.label?.replace(/:\d+.*$/, '').trim() || undefined;
                const currentGroup = deriveHeader(block);
                const prevGroup = index > 0 ? deriveHeader(selectedItem.blocks[index - 1]) : undefined;
                const showGroupHeader = Boolean(currentGroup && currentGroup !== prevGroup);

                return (
                  <React.Fragment key={block.id}>
                    {showGroupHeader && (
                      <div
                        style={{
                          padding: '7px 12px',
                          marginTop: index === 0 ? 0 : '10px',
                          borderRadius: '8px',
                          background: 'var(--bg-panel-elevated)',
                          border: '1px solid var(--border-subtle)',
                          borderLeft: '4px solid var(--accent)',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          color: '#93c5fd',
                          letterSpacing: '0.03em'
                        }}
                      >
                        {currentGroup}
                      </div>
                    )}
                    <button
                      type="button"
                      data-live-block={isLive ? 'true' : undefined}
                      data-highlighted-block={isPreviewHighlighted ? 'true' : undefined}
                      onClick={() => handleSelectBlock(index)}
                      style={{
                        textAlign: 'left',
                        borderRadius: '10px',
                        border: '2px solid',
                        borderColor: isLive
                          ? 'var(--live-red)'
                          : isPreviewHighlighted
                            ? 'var(--accent)'
                            : 'var(--border-subtle)',
                        background: isPreviewHighlighted
                          ? 'rgba(59, 130, 246, 0.12)'
                          : 'var(--bg-panel)',
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '14px',
                        boxShadow: isLive
                          ? '0 0 0 2px rgba(239,68,68,0.25)'
                          : isPreviewHighlighted
                            ? '0 0 0 2px rgba(59,130,246,0.22)'
                            : 'none'
                      }}
                    >
                      <span
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '999px',
                          background: isLive
                            ? 'var(--live-red)'
                            : isPreviewHighlighted
                              ? 'var(--accent)'
                              : 'var(--bg-panel-elevated)',
                          color: isLive || isPreviewHighlighted ? '#fff' : 'var(--text-secondary)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          flexShrink: 0,
                          marginTop: '1px'
                        }}
                      >
                        {verseBadge}
                      </span>

                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: 'grid',
                          gridTemplateColumns: hasSecondary ? '1fr 1fr' : '1fr',
                          gap: '16px',
                          alignItems: 'start',
                          fontSize: '0.84rem',
                          lineHeight: 1.45
                        }}
                      >
                        <div
                          style={{
                            color: 'var(--text-primary)',
                            paddingRight: hasSecondary ? '14px' : 0,
                            borderRight: hasSecondary ? '1px solid var(--border-subtle)' : 'none'
                          }}
                        >
                          {block.lines.map((line, i) => (
                            <div key={i}>{line}</div>
                          ))}
                        </div>
                        {hasSecondary && (
                          <div style={{ color: '#86efac' }}>
                            {block.secondaryLines?.map((line, i) => (
                              <div key={i}>{line}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                  </React.Fragment>
                );
              }

              return (
                <button
                  key={block.id}
                  type="button"
                  data-live-block={isLive ? 'true' : undefined}
                  onClick={() => handleSelectBlock(index)}
                  style={{
                    textAlign: 'left',
                    borderRadius: '10px',
                    border: '2px solid',
                    borderColor: isLive ? 'var(--live-red)' : 'var(--border-subtle)',
                    background: 'var(--bg-panel)',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    minWidth: 0,
                    width: '100%',
                    boxShadow: isLive ? '0 0 0 2px rgba(239,68,68,0.25)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', minWidth: 0, width: '100%' }}>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: isLive ? '#f87171' : '#60a5fa',
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {block.label || `Slide ${index + 1}`}
                    </span>
                    {isLive && (
                      <span
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 800,
                          background: 'var(--live-red)',
                          color: '#fff',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          flexShrink: 0
                        }}
                      >
                        {t.controls.live}
                      </span>
                    )}
                  </div>

                  {block.canvasElements && block.canvasElements.length > 0 ? (
                    <div
                      style={{
                        width: '100%',
                        aspectRatio: mainScreenAspectRatio,
                        borderRadius: '6px',
                        overflow: 'hidden',
                        border: '1px solid var(--border-subtle)'
                      }}
                    >
                      <CanvasSlideStage
                        elements={block.canvasElements}
                        background={
                          selectedItem.themeBackground ||
                          'linear-gradient(135deg, #090d16 0%, #1e293b 100%)'
                        }
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        aspectRatio: mainScreenAspectRatio,
                        borderRadius: '6px',
                        overflow: 'hidden',
                        border: '1px solid var(--border-subtle)',
                        position: 'relative'
                      }}
                    >
                      <ScaledMainScreenPreview
                        liveState={{
                          ...liveState,
                          activeItem: selectedItem,
                          activeBlockIndex: index,
                          override: 'none',
                          lyricsMode: selectedItem.lyricsMode ?? 'slide',
                          audioCurrentTimeSec:
                            selectedItem.type === 'song' && selectedItem.lyricsMode === 'timed'
                              ? isLive
                                ? audioTime
                                : block.startTimeSec
                              : undefined,
                          bibleLayout: selectedItem.bibleLayout ?? 'stacked',
                          verseMaxFontSize: selectedItem.verseMaxFontSize ?? 72
                        }}
                      />
                      {selectedItem.type === 'song' &&
                        selectedItem.lyricsMode === 'timed' &&
                        block.startTimeSec !== undefined && (
                          <span
                            style={{
                              position: 'absolute',
                              top: '5px',
                              right: '6px',
                              padding: '2px 6px',
                              borderRadius: '5px',
                              background: 'rgba(15, 23, 42, 0.85)',
                              border: '1px solid rgba(96, 165, 250, 0.45)',
                              color: '#93c5fd',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              fontVariantNumeric: 'tabular-nums'
                            }}
                          >
                            {formatTimestamp(block.startTimeSec)}
                          </span>
                        )}
                    </div>
                  )}
                </button>
              );
            })}
              </div>
          </div>

          <RemoteParticipantsPanel
            open={participantsModalOpen}
            onClose={() => setParticipantsModalOpen(false)}
            onToggleOpen={() => {
              refreshDisplaysAndRemote();
              setParticipantsModalOpen((prev) => !prev);
            }}
            onOpenSetup={() => {
              refreshDisplaysAndRemote();
              setSetupModalOpen(true);
            }}
            onOpenStudioEditor={() => setStudioLayoutModalOpen(true)}
            participants={participants}
            stageConfig={participantStageConfig}
            streams={participantStreams}
            monitoredParticipantIds={monitoredParticipantIds}
            onToggleMonitorParticipant={handleToggleMonitorParticipant}
            audioOutputDevices={audioOutputDevices}
            monitorOutputDeviceId={monitorOutputDeviceId}
            onSelectMonitorOutputDevice={(deviceId) => {
              setMonitorOutputDeviceId(deviceId);
              try {
                localStorage.setItem('uecfi_monitor_output_device_v1', deviceId);
              } catch {
                // Ignore storage quota errors
              }
            }}
            whisperInputDeviceId={whisperInputDeviceId}
            onSelectWhisperInputDevice={(deviceId) => {
              setWhisperInputDeviceId(deviceId);
              try {
                localStorage.setItem('uecfi_whisper_input_device_v1', deviceId);
              } catch {
                // Ignore storage quota errors
              }
            }}
            onModerate={handleModerateParticipant}
            overflowConfig={overflowConfig}
            overflowCameras={overflowCameras}
            overflowAngles={overflowAngles}
            overflowCameraStreams={overflowCameraStreams}
            mainRoomPreviewStream={mainRoomPreviewStream}
            activeOverflowAngleId={activeOverflowAngleId}
            onSelectOverflowAngle={(angleId) => {
              setActiveOverflowAngleId(angleId);
              try {
                localStorage.setItem('uecfi_overflow_active_angle_v1', angleId);
              } catch {
                // Ignore storage quota errors
              }
            }}
            onUpdateOverflowAngles={(angles) => {
              setOverflowAngles(angles);
              try {
                localStorage.setItem('uecfi_overflow_angles_v1', JSON.stringify(angles));
              } catch {
                // Ignore storage quota errors
              }
            }}
            onUpdateOverflowConfig={(next) => {
              if (next.layout !== undefined) {
                autoSwitchedOverflowRef.current = false;
                if (layoutsLinked) {
                  autoSwitchedMainRef.current = false;
                  setParticipantStageConfig((prev) => {
                    const updated = { ...prev, layout: next.layout! };
                    try {
                      localStorage.setItem(
                        'uecfi_studio_layout_v1',
                        JSON.stringify({ ...updated, liveParticipantIds: undefined })
                      );
                    } catch {
                      // Ignore storage quota errors
                    }
                    return updated;
                  });
                }
              }
              setOverflowConfig((prev) => {
                const updated = { ...prev, ...next };
                try {
                  localStorage.setItem(
                    'uecfi_overflow_layout_v1',
                    JSON.stringify({ ...updated, enabled: false })
                  );
                } catch {
                  // Ignore storage quota errors
                }
                return updated;
              });
            }}
            onOpenOverflowStudioEditor={() => setOverflowStudioModalOpen(true)}
            onCopyParticipantsStudioToOverflow={() => {
              setOverflowConfig((prev) => {
                const updated: OverflowStageConfig = {
                  ...prev,
                  layout: 'custom',
                  studioBackground: participantStageConfig.studioBackground,
                  studioPresentationBox: participantStageConfig.studioPresentationBox
                    ? { ...participantStageConfig.studioPresentationBox }
                    : undefined,
                  studioParticipantBox: participantStageConfig.studioParticipantBox
                    ? { ...participantStageConfig.studioParticipantBox }
                    : undefined,
                  studioElements: participantStageConfig.studioElements
                    ? participantStageConfig.studioElements.map((el) => ({ ...el }))
                    : undefined
                };
                try {
                  localStorage.setItem(
                    'uecfi_overflow_layout_v1',
                    JSON.stringify({ ...updated, enabled: false })
                  );
                } catch {
                  // Ignore storage quota errors
                }
                return updated;
              });
            }}
            displays={displays}
            remoteInfo={remoteInfo}
            overflowScreenOpen={overflowScreenOpen}
            onSelectOverflowDisplay={async (displayId) => {
              await window.presenterAPI?.openOverflowScreen(displayId);
              await refreshDisplaysAndRemote();
            }}
            onCloseOverflowScreen={async () => {
              await window.presenterAPI?.closeOverflowScreen();
              await refreshDisplaysAndRemote();
            }}
            onUpdateParticipantInfo={(participantId, info) => {
              setParticipants((prev) =>
                prev.map((p) => (p.id === participantId ? { ...p, ...info } : p))
              );
            }}
            onUpdateStageConfig={(next) => {
              if (next.layout !== undefined) {
                autoSwitchedMainRef.current = false;
                if (layoutsLinked) {
                  autoSwitchedOverflowRef.current = false;
                  setOverflowConfig((prev) => {
                    const updated = { ...prev, layout: next.layout! };
                    try {
                      localStorage.setItem(
                        'uecfi_overflow_layout_v1',
                        JSON.stringify({ ...updated, enabled: false })
                      );
                    } catch {
                      // Ignore storage quota errors
                    }
                    return updated;
                  });
                }
              }
              setParticipantStageConfig((prev) => {
                const updated = { ...prev, ...next };
                try {
                  localStorage.setItem(
                    'uecfi_studio_layout_v1',
                    JSON.stringify({ ...updated, liveParticipantIds: undefined })
                  );
                } catch {
                  // Ignore storage quota errors
                }
                return updated;
              });
            }}
            onClearAllLive={() => {
              participantStageConfig.liveParticipantIds.forEach((id) =>
                handleModerateParticipant(id, 'MOVE_TO_GREEN_ROOM')
              );
            }}
            returnAudioDevices={returnAudioDevices}
            returnFeedConfig={returnFeedConfig}
            returnAudioManualUnmute={returnAudioManualUnmute}
            onToggleReturnAudioManualUnmute={() => setReturnAudioManualUnmute((prev) => !prev)}
            onUpdateReturnFeedConfig={(next) => {
              setReturnFeedConfig((prev) => {
                const updated = { ...prev, ...next };
                try {
                  localStorage.setItem('uecfi_return_feed_v1', JSON.stringify(updated));
                } catch {
                  // Ignore storage quota errors
                }
                return updated;
              });
            }}
          />
        </main>

        {/* Right Column Resizable Divider */}
        <div
          onPointerDown={(e) => startColumnResize('right', e)}
          title="Drag to resize"
          style={colDividerStyle}
        />

        {/* Right Column: Live Monitor + Quick Settings */}
        <aside
          style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
            background: 'var(--bg-panel)'
          }}
        >
          <div style={{ ...panelHeaderStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <Radio size={14} color="#ef4444" />
              <div style={{ display: 'inline-flex', background: 'var(--bg-app)', borderRadius: '7px', padding: '2px', border: '1px solid var(--border-subtle)' }}>
                <button
                  type="button"
                  onClick={() => setLiveMonitorTarget('main')}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '5px',
                    border: 'none',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    background: liveMonitorTarget === 'main' ? '#2563eb' : 'transparent',
                    color: liveMonitorTarget === 'main' ? '#fff' : 'var(--text-secondary)'
                  }}
                >
                  Main
                </button>
                <button
                  type="button"
                  onClick={() => setLiveMonitorTarget('overflow')}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '5px',
                    border: 'none',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    background: liveMonitorTarget === 'overflow' ? '#059669' : 'transparent',
                    color: liveMonitorTarget === 'overflow' ? '#fff' : 'var(--text-secondary)'
                  }}
                >
                  Overflow
                </button>
              </div>
            </div>

            {(() => {
              const activeLayout =
                liveMonitorTarget === 'overflow'
                  ? overflowConfig.layout
                  : participantStageConfig.layout;
              const setTargetLayout = (layout: 'full' | 'custom', forceBoth = false) => {
                const applyBoth = forceBoth || layoutsLinked;
                if (applyBoth || liveMonitorTarget === 'overflow') {
                  autoSwitchedOverflowRef.current = false;
                  setOverflowConfig((prev) => {
                    const updated = { ...prev, layout };
                    try {
                      localStorage.setItem(
                        'uecfi_overflow_layout_v1',
                        JSON.stringify({ ...updated, enabled: false })
                      );
                    } catch {
                      // Ignore storage quota errors
                    }
                    return updated;
                  });
                }
                if (applyBoth || liveMonitorTarget !== 'overflow') {
                  autoSwitchedMainRef.current = false;
                  setParticipantStageConfig((prev) => {
                    const updated = { ...prev, layout };
                    try {
                      localStorage.setItem(
                        'uecfi_studio_layout_v1',
                        JSON.stringify({ ...updated, liveParticipantIds: undefined })
                      );
                    } catch {
                      // Ignore storage quota errors
                    }
                    return updated;
                  });
                }
              };

              return (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const nextLinked = !layoutsLinked;
                      setLayoutsLinked(nextLinked);
                      try {
                        localStorage.setItem('uecfi_layouts_linked_v1', String(nextLinked));
                      } catch {
                        // Ignore storage quota errors
                      }
                      if (nextLinked) {
                        setTargetLayout(activeLayout, true);
                      }
                    }}
                    title={
                      layoutsLinked
                        ? 'Layouts linked: Full/Studio controls both Main and Overflow together (click to unlink)'
                        : 'Link Main & Overflow layouts together'
                    }
                    style={{
                      padding: '4px 6px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-subtle)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: layoutsLinked ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                      color: layoutsLinked ? '#7dd3fc' : 'var(--text-muted)'
                    }}
                  >
                    {layoutsLinked ? <Link2 size={12} /> : <Unlink size={12} />}
                  </button>
                  <div style={{ display: 'inline-flex', background: 'var(--bg-app)', borderRadius: '7px', padding: '2px', border: '1px solid var(--border-subtle)' }}>
                    <button
                      type="button"
                      onClick={() => setTargetLayout('full')}
                      title="Full Layout"
                      style={{
                        padding: '3px 7px',
                        borderRadius: '5px',
                        border: 'none',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: activeLayout === 'full' ? '#2563eb' : 'transparent',
                        color: activeLayout === 'full' ? '#fff' : 'var(--text-secondary)'
                      }}
                    >
                      <Maximize2 size={11} /> Full
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetLayout('custom')}
                      title="Studio Layout"
                      style={{
                        padding: '3px 7px',
                        borderRadius: '5px',
                        border: 'none',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: activeLayout === 'custom' ? '#2563eb' : 'transparent',
                        color: activeLayout === 'custom' ? '#fff' : 'var(--text-secondary)'
                      }}
                    >
                      <LayoutTemplate size={11} /> Studio
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>

          <div style={{ padding: '12px', flexShrink: 0 }}>
            <div
              style={{
                width: '100%',
                aspectRatio: mainScreenAspectRatio,
                borderRadius: '10px',
                overflow: 'hidden',
                border: '1px solid var(--border-subtle)',
                background: '#000'
              }}
            >
              <ScaledMainScreenPreview
                liveState={(() => {
                  const previewState: LiveState =
                    liveItem?.type === 'song' && liveItem?.lyricsMode === 'timed'
                      ? { ...liveState, audioCurrentTimeSec: audioTime }
                      : liveState;
                  return liveMonitorTarget === 'overflow'
                    ? buildOverflowLiveState(previewState)
                    : previewState;
                })()}
                participantStreams={
                  liveMonitorTarget === 'overflow' && mainRoomPreviewStream
                    ? new Map([...participantStreams, [MAIN_ROOM_CAMERA_ID, mainRoomPreviewStream]])
                    : participantStreams
                }
              />
            </div>
          </div>

          {/* Live Feeds Quick Dock */}
          <div
            style={{
              padding: '8px 12px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              flexShrink: 0
            }}
          >
            {overflowAngles.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {overflowAngles.map((angle) => {
                  const isOn = overflowConfig.enabled && angle.id === activeOverflowAngleId;
                  return (
                    <button
                      key={`quick-angle-${angle.id}`}
                      type="button"
                      onClick={() => {
                        if (isOn) {
                          setOverflowConfig((prev) => ({
                            ...prev,
                            enabled: false,
                            ...(prev.feedSource === 'camera' ? { feedSource: 'auto' } : {})
                          }));
                        } else {
                          setActiveOverflowAngleId(angle.id);
                          try {
                            localStorage.setItem('uecfi_overflow_active_angle_v1', angle.id);
                          } catch {
                            // Ignore storage quota errors
                          }
                          setOverflowConfig((prev) => ({ ...prev, enabled: true }));
                        }
                      }}
                      style={{
                        flex: '1 1 auto',
                        minWidth: '64px',
                        padding: '5px 8px',
                        borderRadius: '7px',
                        border: '1px solid',
                        borderColor: isOn ? '#10b981' : 'var(--border-subtle)',
                        background: isOn ? '#059669' : 'var(--bg-panel-elevated)',
                        color: isOn ? '#fff' : 'var(--text-secondary)',
                        fontSize: '0.73rem',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                      title={isOn ? `Turn off ${angle.label || 'Camera'}` : `Turn on ${angle.label || 'Camera'}`}
                    >
                      <Camera size={12} style={{ flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {angle.label || 'Camera'}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setOverflowConfig((prev) => {
                    const nextEnabled = !prev.enabled;
                    return {
                      ...prev,
                      enabled: nextEnabled,
                      ...(!nextEnabled && prev.feedSource === 'camera'
                        ? { feedSource: 'auto' }
                        : {})
                    };
                  })
                }
                style={{
                  width: '100%',
                  padding: '5px 8px',
                  borderRadius: '7px',
                  border: '1px solid',
                  borderColor: overflowConfig.enabled ? '#10b981' : 'var(--border-subtle)',
                  background: overflowConfig.enabled ? '#059669' : 'var(--bg-panel-elevated)',
                  color: overflowConfig.enabled ? '#fff' : 'var(--text-secondary)',
                  fontSize: '0.73rem',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Camera size={12} />
                Centro Cam
              </button>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                Overflow Feed
              </span>
              <div
                style={{
                  display: 'inline-flex',
                  background: 'var(--bg-app)',
                  borderRadius: '6px',
                  padding: '2px',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                {(
                  [
                    { id: 'auto', label: 'Auto' },
                    { id: 'camera', label: 'Room Cam' },
                    { id: 'remote', label: 'Remote' }
                  ] as const
                ).map((opt) => {
                  const active = (overflowConfig.feedSource ?? 'auto') === opt.id;
                  return (
                    <button
                      key={`overflow-src-${opt.id}`}
                      type="button"
                      onClick={() => {
                        setOverflowConfig((prev) => {
                          const updated = {
                            ...prev,
                            feedSource: opt.id,
                            enabled: opt.id === 'camera' ? true : prev.enabled
                          };
                          try {
                            localStorage.setItem(
                              'uecfi_overflow_layout_v1',
                              JSON.stringify({ ...updated, enabled: false })
                            );
                          } catch {
                            // Ignore storage quota errors
                          }
                          return updated;
                        });
                      }}
                      style={{
                        padding: '2px 7px',
                        borderRadius: '4px',
                        border: 'none',
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        background: active ? '#2563eb' : 'transparent',
                        color: active ? '#fff' : 'var(--text-secondary)'
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {participants.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  maxHeight: '132px',
                  overflowY: 'auto'
                }}
              >
                {participants.map((p) => {
                  const isLive = p.status === 'live';
                  return (
                    <div
                      key={`dock-${p.id}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 7px',
                        borderRadius: '7px',
                        background: 'var(--bg-panel-elevated)',
                        border: `1px solid ${isLive ? 'rgba(239, 68, 68, 0.45)' : 'var(--border-subtle)'}`
                      }}
                    >
                      <span
                        style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '999px',
                          background: isLive ? '#ef4444' : '#eab308',
                          flexShrink: 0
                        }}
                      />
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontSize: '0.74rem',
                          fontWeight: 600
                        }}
                        title={`${p.title ? `${p.title} ` : ''}${p.name}`}
                      >
                        {p.title ? `${p.title} ` : ''}
                        {p.name}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleModerateParticipant(
                            p.id,
                            isLive ? 'MOVE_TO_GREEN_ROOM' : 'PUT_LIVE'
                          )
                        }
                        title={isLive ? 'Send back to Green Room' : 'Put On Screen'}
                        style={{
                          padding: '3px 7px',
                          borderRadius: '6px',
                          border: 'none',
                          background: isLive ? '#334155' : '#2563eb',
                          color: '#fff',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        {isLive ? <UserMinus size={11} /> : <UserCheck size={11} />}
                        {isLive ? 'Green Room' : 'Go Live'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleMonitorParticipant(p.id)}
                        title={
                          monitoredParticipantIds.includes(p.id)
                            ? 'End Whisper (2-way audio)'
                            : 'Whisper (2-way private audio with speaker)'
                        }
                        style={{
                          padding: '3px 5px',
                          borderRadius: '6px',
                          border: monitoredParticipantIds.includes(p.id)
                            ? '1px solid rgba(56, 189, 248, 0.55)'
                            : '1px solid var(--border-subtle)',
                          background: monitoredParticipantIds.includes(p.id)
                            ? 'rgba(14, 165, 233, 0.22)'
                            : 'transparent',
                          color: monitoredParticipantIds.includes(p.id)
                            ? '#7dd3fc'
                            : 'var(--text-secondary)',
                          display: 'inline-flex'
                        }}
                      >
                        {monitoredParticipantIds.includes(p.id) ? (
                          <Volume2 size={12} />
                        ) : (
                          <VolumeX size={12} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleModerateParticipant(p.id, 'SET_MUTED', !p.mutedByOperator)
                        }
                        title={p.mutedByOperator ? 'Unmute' : 'Mute'}
                        style={{
                          padding: '3px 5px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          background: p.mutedByOperator ? 'rgba(220, 38, 38, 0.2)' : 'transparent',
                          color: p.mutedByOperator ? '#fca5a5' : 'var(--text-secondary)',
                          display: 'inline-flex'
                        }}
                      >
                        {p.mutedByOperator ? <MicOff size={12} /> : <Mic size={12} />}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleModerateParticipant(
                            p.id,
                            'SET_VIDEO_HIDDEN',
                            !p.videoHiddenByOperator
                          )
                        }
                        title={p.videoHiddenByOperator ? 'Show Video' : 'Hide Video'}
                        style={{
                          padding: '3px 5px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          background: p.videoHiddenByOperator
                            ? 'rgba(220, 38, 38, 0.2)'
                            : 'transparent',
                          color: p.videoHiddenByOperator ? '#fca5a5' : 'var(--text-secondary)',
                          display: 'inline-flex'
                        }}
                      >
                        {p.videoHiddenByOperator ? <CameraOff size={12} /> : <Camera size={12} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Settings */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={panelHeaderStyle}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Sliders size={14} />
                {t.workspace.inspector}
              </span>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}
            >
              {selectedItem?.type === 'verse' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      <span>Max Font Size</span>
                      <span>{selectedItem.verseMaxFontSize ?? 72}px</span>
                    </div>
                    <input
                      type="range"
                      min={44}
                      max={104}
                      step={2}
                      value={selectedItem.verseMaxFontSize ?? 72}
                      onChange={(e) => handleSetVerseMaxFontSize(Number(e.target.value))}
                      style={{ width: '100%' }}
                    />
                  </div>

                  {selectedItem.blocks.some((b) => b.secondaryLines && b.secondaryLines.length > 0) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        {t.bible.verseLayout}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                        {(
                          [
                            { id: 'primary', label: t.bible.primary },
                            { id: 'secondary', label: t.bible.secondary },
                            { id: 'stacked', label: t.bible.stacked }
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => handleSetBibleLayout(opt.id)}
                            style={{
                              padding: '7px 6px',
                              borderRadius: '8px',
                              border: '1px solid',
                              borderColor:
                                (selectedItem.bibleLayout ?? 'stacked') === opt.id
                                  ? 'var(--accent)'
                                  : 'var(--border-subtle)',
                              background:
                                (selectedItem.bibleLayout ?? 'stacked') === opt.id
                                  ? 'rgba(59,130,246,0.16)'
                                  : 'var(--bg-panel-elevated)',
                              fontSize: '0.74rem',
                              fontWeight: 600
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Show color controls matching the currently selected verse layout */}
                  {(() => {
                    const hasSecondary = selectedItem.blocks.some(
                      (b) => b.secondaryLines && b.secondaryLines.length > 0
                    );
                    const isStackedLayout =
                      hasSecondary && (selectedItem.bibleLayout ?? 'stacked') === 'stacked';

                    if (isStackedLayout) {
                      return (
                        <div
                          style={{
                            padding: '10px',
                            borderRadius: '10px',
                            background: 'var(--bg-panel-elevated)',
                            border: '1px solid var(--border-subtle)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                              Stacked Bible Colors
                            </span>
                            {(selectedItem.verseStackedPrimaryTextColor ||
                              selectedItem.verseStackedPrimaryRefColor ||
                              selectedItem.verseStackedSecondaryTextColor ||
                              selectedItem.verseStackedSecondaryRefColor) && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateVerseStyle({
                                    verseStackedPrimaryTextColor: undefined,
                                    verseStackedPrimaryRefColor: undefined,
                                    verseStackedSecondaryTextColor: undefined,
                                    verseStackedSecondaryRefColor: undefined
                                  })
                                }
                                style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 600,
                                  color: 'var(--text-muted)',
                                  background: 'transparent',
                                  border: 'none',
                                  padding: 0
                                }}
                              >
                                Reset
                              </button>
                            )}
                          </div>
                          {renderColorRow(
                            'Primary Text',
                            selectedItem.verseStackedPrimaryTextColor,
                            '#ffffff',
                            ['#ffffff', '#fde047', '#93c5fd', '#f1f5f9'],
                            (c) => handleUpdateVerseStyle({ verseStackedPrimaryTextColor: c })
                          )}
                          {renderColorRow(
                            'Primary Ref',
                            selectedItem.verseStackedPrimaryRefColor,
                            '#93c5fd',
                            ['#93c5fd', '#cbd5e1', '#fde047', '#86efac'],
                            (c) => handleUpdateVerseStyle({ verseStackedPrimaryRefColor: c })
                          )}
                          {renderColorRow(
                            'Secondary Text',
                            selectedItem.verseStackedSecondaryTextColor,
                            '#f1f5f9',
                            ['#f1f5f9', '#ffffff', '#fde047', '#86efac'],
                            (c) => handleUpdateVerseStyle({ verseStackedSecondaryTextColor: c })
                          )}
                          {renderColorRow(
                            'Secondary Ref',
                            selectedItem.verseStackedSecondaryRefColor,
                            '#86efac',
                            ['#86efac', '#cbd5e1', '#93c5fd', '#fde047'],
                            (c) => handleUpdateVerseStyle({ verseStackedSecondaryRefColor: c })
                          )}
                        </div>
                      );
                    }

                    return (
                      <div
                        style={{
                          padding: '10px',
                          borderRadius: '10px',
                          background: 'var(--bg-panel-elevated)',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                            Single Bible Colors
                          </span>
                          {(selectedItem.verseTextColor || selectedItem.verseRefColor) && (
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateVerseStyle({
                                  verseTextColor: undefined,
                                  verseRefColor: undefined
                                })
                              }
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 600,
                                color: 'var(--text-muted)',
                                background: 'transparent',
                                border: 'none',
                                padding: 0
                              }}
                            >
                              Reset
                            </button>
                          )}
                        </div>
                        {renderColorRow(
                          'Scripture',
                          selectedItem.verseTextColor,
                          '#ffffff',
                          ['#ffffff', '#fde047', '#93c5fd', '#f1f5f9'],
                          (c) => handleUpdateVerseStyle({ verseTextColor: c })
                        )}
                        {renderColorRow(
                          'Reference',
                          selectedItem.verseRefColor,
                          '#cbd5e1',
                          ['#cbd5e1', '#93c5fd', '#fde047', '#86efac'],
                          (c) => handleUpdateVerseStyle({ verseRefColor: c })
                        )}
                      </div>
                    );
                  })()}

                  {/* Verse Background + Dimming Overlay (separate for Single vs Stacked layout) */}
                  {(() => {
                    const hasSecondary = selectedItem.blocks.some(
                      (b) => b.secondaryLines && b.secondaryLines.length > 0
                    );
                    const isStackedLayout =
                      hasSecondary && (selectedItem.bibleLayout ?? 'stacked') === 'stacked';
                    const activeBg = isStackedLayout
                      ? selectedItem.verseStackedThemeBackground ?? selectedItem.themeBackground
                      : selectedItem.themeBackground;
                    const activeDim = isStackedLayout
                      ? selectedItem.verseStackedBgDim ?? 0
                      : selectedItem.verseBgDim ?? 0;
                    const updateBg = (bg: string) =>
                      handleUpdateVerseStyle(
                        isStackedLayout
                          ? { verseStackedThemeBackground: bg }
                          : { themeBackground: bg }
                      );
                    const updateDim = (dim: number) =>
                      handleUpdateVerseStyle(
                        isStackedLayout ? { verseStackedBgDim: dim } : { verseBgDim: dim }
                      );

                    return (
                      <div
                        style={{
                          padding: '10px',
                          borderRadius: '10px',
                          background: 'var(--bg-panel-elevated)',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                            {isStackedLayout ? 'Stacked Background' : 'Single Background'}
                          </span>
                          <input
                            type="color"
                            aria-label="Solid verse background color"
                            value={activeBg?.startsWith('#') ? activeBg : '#0f172a'}
                            onChange={(e) => updateBg(e.target.value)}
                            style={{
                              width: '24px',
                              height: '20px',
                              padding: 0,
                              border: '1px solid var(--border-subtle)',
                              borderRadius: '4px',
                              background: 'transparent',
                              cursor: 'pointer'
                            }}
                          />
                        </div>
                        <BackgroundImagePicker
                          value={activeBg}
                          onSelect={updateBg}
                          compact
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          {[
                            { name: 'Deep Navy', value: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)' },
                            { name: 'Royal Indigo', value: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)' },
                            { name: 'Sanctuary Emerald', value: 'linear-gradient(135deg, #111827 0%, #064e3b 100%)' },
                            { name: 'Midnight Slate', value: 'linear-gradient(135deg, #090d16 0%, #1e293b 100%)' },
                            { name: 'Warm Crimson', value: 'linear-gradient(135deg, #1f1018 0%, #7f1d1d 100%)' }
                          ].map((preset) => (
                            <button
                              key={preset.name}
                              type="button"
                              onClick={() => updateBg(preset.value)}
                              title={preset.name}
                              style={{
                                width: '22px',
                                height: '22px',
                                borderRadius: '6px',
                                background: preset.value,
                                border:
                                  activeBg === preset.value
                                    ? '2px solid var(--accent)'
                                    : '1px solid rgba(255,255,255,0.22)',
                                padding: 0
                              }}
                            />
                          ))}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '2px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            <span>Dim Overlay</span>
                            <span>{activeDim}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={85}
                            step={5}
                            aria-label="Verse background dim overlay"
                            value={activeDim}
                            onChange={(e) => updateDim(Number(e.target.value))}
                            style={{ width: '100%' }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {liveTimedAudioItem && selectedItem?.id !== liveTimedAudioItem.id && (
                <div
                  style={{
                    padding: '10px',
                    borderRadius: '10px',
                    background: 'var(--bg-panel-elevated)',
                    border: '1px solid rgba(59,130,246,0.4)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: '#93c5fd',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em'
                      }}
                    >
                      Live Audio
                    </span>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                      title={liveTimedAudioItem.title}
                    >
                      {liveTimedAudioItem.title}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={handleToggleLiveAudio}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '5px 10px',
                        borderRadius: '7px',
                        border: '1px solid var(--accent)',
                        background: 'rgba(59,130,246,0.18)',
                        color: '#93c5fd',
                        fontSize: '0.75rem',
                        fontWeight: 700
                      }}
                    >
                      {audioPlaying ? <Pause size={12} /> : <Play size={12} />}
                      {audioPlaying ? 'Pause' : 'Play'}
                    </button>
                    <button
                      type="button"
                      onClick={handleRestartTimedAudio}
                      title="Restart live audio"
                      style={miniIconBtnStyle(false)}
                    >
                      <RotateCcw size={12} />
                    </button>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', marginLeft: 'auto' }}>
                      {formatTimestamp(audioTime) || '0:00'} / {formatTimestamp(audioDuration) || '0:00'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, audioDuration)}
                    step={0.1}
                    value={audioTime}
                    onPointerDown={() => {
                      scrubberSeekingRef.current = true;
                    }}
                    onPointerUp={() => {
                      scrubberSeekingRef.current = false;
                    }}
                    onBlur={() => {
                      scrubberSeekingRef.current = false;
                    }}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setAudioTime(next);
                      if (audioRef.current) {
                        audioRef.current.currentTime = next;
                      }
                      const idx = findBlockIndexForTime(liveTimedAudioItem.blocks, next);
                      if (idx !== null) {
                        setActiveBlockIndex(idx);
                      }
                    }}
                    style={{ width: '100%' }}
                  />
                  {renderAudioVolumeControl()}
                </div>
              )}

              {selectedItem?.type === 'song' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    Lyrics Display
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => handleSetLyricsMode('slide')}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: selectedItem.lyricsMode !== 'timed' ? 'var(--accent)' : 'var(--border-subtle)',
                        background: selectedItem.lyricsMode !== 'timed' ? 'rgba(59,130,246,0.16)' : 'var(--bg-panel-elevated)',
                        fontSize: '0.8rem',
                        fontWeight: 600
                      }}
                    >
                      {t.lyricsModes.slideMode}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetLyricsMode('timed')}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: selectedItem.lyricsMode === 'timed' ? 'var(--accent)' : 'var(--border-subtle)',
                        background: selectedItem.lyricsMode === 'timed' ? 'rgba(59,130,246,0.16)' : 'var(--bg-panel-elevated)',
                        fontSize: '0.8rem',
                        fontWeight: 600
                      }}
                    >
                      {t.lyricsModes.timedMode}
                    </button>
                  </div>

                  {selectedItem.lyricsMode === 'timed' && (
                    <div
                      style={{
                        marginTop: '4px',
                        padding: '10px',
                        borderRadius: '10px',
                        background: 'var(--bg-panel-elevated)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <input
                        ref={inspectorAudioUploadRef}
                        type="file"
                        accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac"
                        onChange={handleInspectorAudioUpload}
                        style={{ display: 'none' }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            color: selectedItem.audioUrl ? '#93c5fd' : 'var(--text-muted)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {selectedItem.audioFileName ?? 'No audio track attached'}
                        </span>
                        <button
                          type="button"
                          onClick={() => inspectorAudioUploadRef.current?.click()}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-subtle)',
                            background: 'var(--bg-app)',
                            color: 'var(--text-primary)',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            flexShrink: 0
                          }}
                        >
                          {selectedItem.audioUrl ? 'Change' : 'Upload Audio'}
                        </button>
                      </div>

                      {selectedItem.audioUrl && (
                        <>
                          {(() => {
                            const isLiveSelected = liveTimedAudioItem?.id === selectedItem.id;
                            const displayedTime = isLiveSelected ? audioTime : 0;
                            const displayedDuration = isLiveSelected ? audioDuration : 0;
                            const displayedPlaying = isLiveSelected && audioPlaying;
                            return (
                              <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <button
                                    type="button"
                                    onClick={handleToggleTimedAudio}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      padding: '5px 10px',
                                      borderRadius: '7px',
                                      border: '1px solid var(--accent)',
                                      background: 'rgba(59,130,246,0.18)',
                                      color: '#93c5fd',
                                      fontSize: '0.75rem',
                                      fontWeight: 700
                                    }}
                                  >
                                    {displayedPlaying ? <Pause size={12} /> : <Play size={12} />}
                                    {displayedPlaying ? 'Pause' : isLiveSelected ? 'Play' : 'Play Live'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleRestartTimedAudio}
                                    disabled={!isLiveSelected}
                                    title="Restart audio"
                                    style={{
                                      ...miniIconBtnStyle(false),
                                      opacity: isLiveSelected ? 1 : 0.45
                                    }}
                                  >
                                    <RotateCcw size={12} />
                                  </button>
                                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', marginLeft: 'auto' }}>
                                    {formatTimestamp(displayedTime) || '0:00'} / {formatTimestamp(displayedDuration) || '0:00'}
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min={0}
                                  max={Math.max(1, displayedDuration)}
                                  step={0.1}
                                  disabled={!isLiveSelected}
                                  value={displayedTime}
                                  onPointerDown={() => {
                                    if (isLiveSelected) scrubberSeekingRef.current = true;
                                  }}
                                  onPointerUp={() => {
                                    scrubberSeekingRef.current = false;
                                  }}
                                  onBlur={() => {
                                    scrubberSeekingRef.current = false;
                                  }}
                                  onChange={(e) => {
                                    if (!isLiveSelected) return;
                                    const next = Number(e.target.value);
                                    setAudioTime(next);
                                    if (audioRef.current) {
                                      audioRef.current.currentTime = next;
                                    }
                                    const idx = findBlockIndexForTime(selectedItem.blocks, next);
                                    if (idx !== null) {
                                      setActiveBlockIndex(idx);
                                    }
                                  }}
                                  style={{ width: '100%' }}
                                />
                                {renderAudioVolumeControl()}
                                <button
                                  type="button"
                                  onClick={handleStampNextBlockTime}
                                  disabled={!isLiveSelected}
                                  title="Stamp current audio time onto the next line and advance"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '5px',
                                    padding: '5px 8px',
                                    borderRadius: '7px',
                                    border: '1px solid var(--border-subtle)',
                                    background: 'var(--bg-app)',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.74rem',
                                    fontWeight: 600,
                                    opacity: isLiveSelected ? 1 : 0.5
                                  }}
                                >
                                  <Clock size={12} />
                                  Stamp Next Line ({formatTimestamp(displayedTime) || '0:00'})
                                </button>
                              </>
                            );
                          })()}
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setSyncModalOpen(true)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '5px',
                          padding: '6px 10px',
                          borderRadius: '7px',
                          border: '1px solid rgba(168, 85, 247, 0.55)',
                          background: 'rgba(147, 51, 234, 0.16)',
                          color: '#d8b4fe',
                          fontSize: '0.75rem',
                          fontWeight: 700
                        }}
                      >
                        <Clock size={12} />
                        Open Sync Studio
                      </button>
                    </div>
                  )}

                  {/* Song Text, Highlight & Dots, and Text Outline Customization */}
                  <div
                    style={{
                      marginTop: '4px',
                      padding: '10px',
                      borderRadius: '10px',
                      background: 'var(--bg-panel-elevated)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        Song Appearance
                      </span>
                      {(selectedItem.songTextColor ||
                        selectedItem.songTitleColor ||
                        selectedItem.songHighlightColor ||
                        (selectedItem.songOutlineWidth ?? 0) > 0 ||
                        selectedItem.songOutlineColor ||
                        (selectedItem.songHighlightOutlineWidth ?? 0) > 0 ||
                        selectedItem.songHighlightOutlineColor) && (
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateSongStyle({
                              songTextColor: undefined,
                              songTitleColor: undefined,
                              songHighlightColor: undefined,
                              songOutlineWidth: undefined,
                              songOutlineColor: undefined,
                              songHighlightOutlineWidth: undefined,
                              songHighlightOutlineColor: undefined
                            })
                          }
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            color: 'var(--text-muted)',
                            background: 'transparent',
                            border: 'none',
                            padding: 0
                          }}
                        >
                          Reset
                        </button>
                      )}
                    </div>

                    {/* Text Color */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        Text Color
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        {['#ffffff', '#fde047', '#93c5fd', '#e2e8f0'].map((swatch) => (
                          <button
                            key={swatch}
                            type="button"
                            onClick={() => handleUpdateSongStyle({ songTextColor: swatch })}
                            title={swatch}
                            style={{
                              width: '16px',
                              height: '16px',
                              borderRadius: '999px',
                              background: swatch,
                              border:
                                (selectedItem.songTextColor || '#ffffff').toLowerCase() === swatch
                                  ? '2px solid var(--accent)'
                                  : '1px solid rgba(255,255,255,0.28)',
                              padding: 0
                            }}
                          />
                        ))}
                        <input
                          type="color"
                          aria-label="Song text color"
                          value={selectedItem.songTextColor || '#ffffff'}
                          onChange={(e) => handleUpdateSongStyle({ songTextColor: e.target.value })}
                          style={{
                            width: '24px',
                            height: '20px',
                            padding: 0,
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '4px',
                            background: 'transparent',
                            cursor: 'pointer'
                          }}
                        />
                      </div>
                    </div>

                    {/* Title Color */}
                    {renderColorRow(
                      'Title Color',
                      selectedItem.songTitleColor,
                      '#cbd5e1',
                      ['#cbd5e1', '#ffffff', '#fde047', '#93c5fd'],
                      (c) => handleUpdateSongStyle({ songTitleColor: c })
                    )}

                    {/* Highlight & Count-in Dots Color */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        Highlight &amp; Dots
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        {['#93c5fd', '#fde047', '#86efac', '#f9a8d4'].map((swatch) => (
                          <button
                            key={swatch}
                            type="button"
                            onClick={() => handleUpdateSongStyle({ songHighlightColor: swatch })}
                            title={swatch}
                            style={{
                              width: '16px',
                              height: '16px',
                              borderRadius: '999px',
                              background: swatch,
                              border:
                                (selectedItem.songHighlightColor || '#93c5fd').toLowerCase() === swatch
                                  ? '2px solid var(--accent)'
                                  : '1px solid rgba(255,255,255,0.28)',
                              padding: 0
                            }}
                          />
                        ))}
                        <input
                          type="color"
                          aria-label="Highlight and dots color"
                          value={selectedItem.songHighlightColor || '#93c5fd'}
                          onChange={(e) => handleUpdateSongStyle({ songHighlightColor: e.target.value })}
                          style={{
                            width: '24px',
                            height: '20px',
                            padding: 0,
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '4px',
                            background: 'transparent',
                            cursor: 'pointer'
                          }}
                        />
                      </div>
                    </div>

                    {/* Text Outline */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          Text Outline ({selectedItem.songOutlineWidth ?? 0}px)
                        </span>
                        <input
                          type="color"
                          aria-label="Text outline color"
                          value={selectedItem.songOutlineColor || '#000000'}
                          onChange={(e) => handleUpdateSongStyle({ songOutlineColor: e.target.value })}
                          style={{
                            width: '24px',
                            height: '20px',
                            padding: 0,
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '4px',
                            background: 'transparent',
                            cursor: 'pointer'
                          }}
                        />
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={8}
                        step={1}
                        aria-label="Text outline width"
                        value={selectedItem.songOutlineWidth ?? 0}
                        onChange={(e) =>
                          handleUpdateSongStyle({ songOutlineWidth: Number(e.target.value) })
                        }
                        style={{ width: '100%' }}
                      />
                    </div>

                    {/* Highlighted Text Outline */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          Highlight Outline ({selectedItem.songHighlightOutlineWidth ?? 0}px)
                        </span>
                        <input
                          type="color"
                          aria-label="Highlighted text outline color"
                          value={selectedItem.songHighlightOutlineColor || '#000000'}
                          onChange={(e) =>
                            handleUpdateSongStyle({ songHighlightOutlineColor: e.target.value })
                          }
                          style={{
                            width: '24px',
                            height: '20px',
                            padding: 0,
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '4px',
                            background: 'transparent',
                            cursor: 'pointer'
                          }}
                        />
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={8}
                        step={1}
                        aria-label="Highlighted text outline width"
                        value={selectedItem.songHighlightOutlineWidth ?? 0}
                        onChange={(e) =>
                          handleUpdateSongStyle({ songHighlightOutlineWidth: Number(e.target.value) })
                        }
                        style={{ width: '100%' }}
                      />
                    </div>

                    {/* Background */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        paddingTop: '4px',
                        borderTop: '1px solid var(--border-subtle)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          Background
                        </span>
                        <input
                          type="color"
                          aria-label="Solid background color"
                          value={
                            selectedItem.themeBackground?.startsWith('#')
                              ? selectedItem.themeBackground
                              : '#0f172a'
                          }
                          onChange={(e) =>
                            handleUpdateSongStyle({ themeBackground: e.target.value })
                          }
                          style={{
                            width: '24px',
                            height: '20px',
                            padding: 0,
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '4px',
                            background: 'transparent',
                            cursor: 'pointer'
                          }}
                        />
                      </div>
                      <BackgroundImagePicker
                        value={selectedItem.themeBackground}
                        onSelect={(bg) => handleUpdateSongStyle({ themeBackground: bg })}
                        compact
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {[
                          { name: 'Deep Navy', value: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)' },
                          { name: 'Royal Indigo', value: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)' },
                          { name: 'Sanctuary Emerald', value: 'linear-gradient(135deg, #111827 0%, #064e3b 100%)' },
                          { name: 'Midnight Slate', value: 'linear-gradient(135deg, #090d16 0%, #1e293b 100%)' },
                          { name: 'Warm Crimson', value: 'linear-gradient(135deg, #1f1018 0%, #7f1d1d 100%)' }
                        ].map((preset) => (
                          <button
                            key={preset.name}
                            type="button"
                            onClick={() => handleUpdateSongStyle({ themeBackground: preset.value })}
                            title={preset.name}
                            style={{
                              width: '22px',
                              height: '22px',
                              borderRadius: '6px',
                              background: preset.value,
                              border:
                                selectedItem.themeBackground === preset.value
                                  ? '2px solid var(--accent)'
                                  : '1px solid rgba(255,255,255,0.22)',
                              padding: 0
                            }}
                          />
                        ))}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '2px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          <span>Dim Overlay</span>
                          <span>{selectedItem.songBgDim ?? 0}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={85}
                          step={5}
                          aria-label="Song background dim overlay"
                          value={selectedItem.songBgDim ?? 0}
                          onChange={(e) => handleUpdateSongStyle({ songBgDim: Number(e.target.value) })}
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedItem?.type === 'programItem' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      <span>Max Font Size</span>
                      <span>{selectedItem.docMaxFontSize ?? 72}px</span>
                    </div>
                    <input
                      type="range"
                      min={36}
                      max={110}
                      step={2}
                      value={selectedItem.docMaxFontSize ?? 72}
                      onChange={(e) => handleUpdateDocStyle({ docMaxFontSize: Number(e.target.value) })}
                      style={{ width: '100%' }}
                    />
                  </div>

                  {/* Doc Text & Outline */}
                  <div
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      background: 'var(--bg-panel-elevated)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        Doc Appearance
                      </span>
                      {(selectedItem.docTextColor ||
                        selectedItem.docTitleColor ||
                        (selectedItem.docOutlineWidth ?? 0) > 0 ||
                        selectedItem.docOutlineColor ||
                        selectedItem.docBulletStyle ||
                        selectedItem.docBulletColor) && (
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateDocStyle({
                              docTextColor: undefined,
                              docTitleColor: undefined,
                              docOutlineWidth: undefined,
                              docOutlineColor: undefined,
                              docBulletStyle: undefined,
                              docBulletColor: undefined
                            })
                          }
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            color: 'var(--text-muted)',
                            background: 'transparent',
                            border: 'none',
                            padding: 0
                          }}
                        >
                          Reset
                        </button>
                      )}
                    </div>
                    {renderColorRow(
                      'Text Color',
                      selectedItem.docTextColor,
                      '#ffffff',
                      ['#ffffff', '#fde047', '#93c5fd', '#e2e8f0'],
                      (c) => handleUpdateDocStyle({ docTextColor: c })
                    )}
                    {renderColorRow(
                      'Title Color',
                      selectedItem.docTitleColor,
                      '#cbd5e1',
                      ['#cbd5e1', '#ffffff', '#fde047', '#93c5fd'],
                      (c) => handleUpdateDocStyle({ docTitleColor: c })
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          Text Outline ({selectedItem.docOutlineWidth ?? 0}px)
                        </span>
                        <input
                          type="color"
                          aria-label="Doc text outline color"
                          value={selectedItem.docOutlineColor || '#000000'}
                          onChange={(e) => handleUpdateDocStyle({ docOutlineColor: e.target.value })}
                          style={{
                            width: '24px',
                            height: '20px',
                            padding: 0,
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '4px',
                            background: 'transparent',
                            cursor: 'pointer'
                          }}
                        />
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={8}
                        step={1}
                        aria-label="Doc text outline width"
                        value={selectedItem.docOutlineWidth ?? 0}
                        onChange={(e) => handleUpdateDocStyle({ docOutlineWidth: Number(e.target.value) })}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '2px', borderTop: '1px solid var(--border-subtle)' }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        Bullet Style
                      </span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                        {(
                          [
                            { id: 'accent', label: 'Accent' },
                            { id: 'pill', label: 'Badge' },
                            { id: 'superscript', label: 'Superscript' },
                            { id: 'plain', label: 'Plain' }
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => handleUpdateDocStyle({ docBulletStyle: opt.id })}
                            style={{
                              padding: '5px 6px',
                              borderRadius: '7px',
                              border: '1px solid',
                              borderColor:
                                (selectedItem.docBulletStyle ?? 'accent') === opt.id
                                  ? 'var(--accent)'
                                  : 'var(--border-subtle)',
                              background:
                                (selectedItem.docBulletStyle ?? 'accent') === opt.id
                                  ? 'rgba(59,130,246,0.16)'
                                  : 'var(--bg-app)',
                              fontSize: '0.72rem',
                              fontWeight: 600
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {(selectedItem.docBulletStyle ?? 'accent') !== 'plain' &&
                        renderColorRow(
                          'Bullet Color',
                          selectedItem.docBulletColor,
                          '#93c5fd',
                          ['#93c5fd', '#fbbf24', '#86efac', '#f9a8d4'],
                          (c) => handleUpdateDocStyle({ docBulletColor: c })
                        )}
                    </div>
                  </div>

                  {/* Doc Background + Dimming Overlay */}
                  <div
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      background: 'var(--bg-panel-elevated)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        Background
                      </span>
                      <input
                        type="color"
                        aria-label="Solid doc background color"
                        value={
                          selectedItem.themeBackground?.startsWith('#')
                            ? selectedItem.themeBackground
                            : '#0f172a'
                        }
                        onChange={(e) => handleUpdateDocStyle({ themeBackground: e.target.value })}
                        style={{
                          width: '24px',
                          height: '20px',
                          padding: 0,
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '4px',
                          background: 'transparent',
                          cursor: 'pointer'
                        }}
                      />
                    </div>
                    <BackgroundImagePicker
                      value={selectedItem.themeBackground}
                      onSelect={(bg) => handleUpdateDocStyle({ themeBackground: bg })}
                      compact
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      {[
                        { name: 'Deep Navy', value: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)' },
                        { name: 'Royal Indigo', value: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)' },
                        { name: 'Sanctuary Emerald', value: 'linear-gradient(135deg, #111827 0%, #064e3b 100%)' },
                        { name: 'Midnight Slate', value: 'linear-gradient(135deg, #090d16 0%, #1e293b 100%)' },
                        { name: 'Warm Crimson', value: 'linear-gradient(135deg, #1f1018 0%, #7f1d1d 100%)' }
                      ].map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => handleUpdateDocStyle({ themeBackground: preset.value })}
                          title={preset.name}
                          style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '6px',
                            background: preset.value,
                            border:
                              selectedItem.themeBackground === preset.value
                                ? '2px solid var(--accent)'
                                : '1px solid rgba(255,255,255,0.22)',
                            padding: 0
                          }}
                        />
                      ))}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '2px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        <span>Dim Overlay</span>
                        <span>{selectedItem.docBgDim ?? 0}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={85}
                        step={5}
                        aria-label="Doc background dim overlay"
                        value={selectedItem.docBgDim ?? 0}
                        onChange={(e) => handleUpdateDocStyle({ docBgDim: Number(e.target.value) })}
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <DisplaySetupModal
        open={setupModalOpen}
        onClose={() => setSetupModalOpen(false)}
        displays={displays}
        remoteInfo={remoteInfo}
        participantSettings={participantSettings}
        onSaveParticipantSettings={(next) => {
          setParticipantSettings(next);
          window.presenterAPI?.setSecret('participant_network_settings', JSON.stringify(next));
        }}
        onRefreshDisplays={refreshDisplaysAndRemote}
        onRegenerateRemotePin={async () => {
          const updated = await window.presenterAPI?.regenerateRemotePin();
          if (updated) {
            setRemoteInfo(updated);
          }
        }}
        onSelectMainDisplay={async (displayId) => {
          await window.presenterAPI?.openMainScreen(displayId);
          await refreshDisplaysAndRemote();
        }}
        onSelectOverflowDisplay={async (displayId) => {
          await window.presenterAPI?.openOverflowScreen(displayId);
          await refreshDisplaysAndRemote();
        }}
      />

      <StudioLayoutModal
        open={overflowStudioModalOpen}
        onClose={() => setOverflowStudioModalOpen(false)}
        stageConfig={{
          layout: overflowConfig.layout,
          liveParticipantIds: [],
          studioBackground: overflowConfig.studioBackground,
          studioPresentationBox: overflowConfig.studioPresentationBox,
          studioParticipantBox: overflowConfig.studioParticipantBox,
          studioElements: overflowConfig.studioElements
        }}
        onSave={(next) => {
          setOverflowConfig((prev) => {
            const updated: OverflowStageConfig = {
              ...prev,
              layout: next.layout === 'full' ? 'full' : 'custom',
              studioBackground: next.studioBackground,
              studioPresentationBox: next.studioPresentationBox,
              studioParticipantBox: next.studioParticipantBox,
              studioElements: next.studioElements
            };
            try {
              localStorage.setItem(
                'uecfi_overflow_layout_v1',
                JSON.stringify({ ...updated, enabled: false })
              );
            } catch {
              // Ignore storage quota errors
            }
            return updated;
          });
        }}
      />

      {/* Dismissible Camera Access Warning (e.g. Windows exclusive camera lock by OBS/Zoom) */}
      {cameraError && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            bottom: '18px',
            right: '18px',
            zIndex: 9998,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            maxWidth: '420px',
            padding: '10px 14px',
            borderRadius: '10px',
            border: '1px solid rgba(248, 113, 113, 0.55)',
            background: 'rgba(127, 29, 29, 0.95)',
            color: '#fee2e2',
            fontSize: '0.82rem',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)'
          }}
        >
          <span style={{ flex: 1 }}>{cameraError}</span>
          <button
            type="button"
            onClick={() => setCameraError(null)}
            style={{
              background: 'transparent',
              border: '1px solid rgba(254, 226, 226, 0.35)',
              color: '#fee2e2',
              borderRadius: '6px',
              padding: '3px 8px',
              fontSize: '0.75rem',
              cursor: 'pointer'
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Persistent, Silent High-Visibility Toast Notifications when a Remote Speaker Alerts Operator */}
      {operatorAlerts.length > 0 && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            position: 'fixed',
            top: '18px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            width: 'min(92vw, 560px)',
            pointerEvents: 'none'
          }}
        >
          {operatorAlerts.map((alert) => {
            const isWhispering = monitoredParticipantIds.includes(alert.guestId);
            const timeLabel = new Date(alert.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            });
            return (
              <div
                key={alert.id}
                className="operator-alert-toast"
                style={{
                  pointerEvents: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '14px',
                  padding: '14px 16px',
                  borderRadius: '14px',
                  border: '2px solid rgba(251, 191, 36, 0.95)',
                  background:
                    'linear-gradient(135deg, rgba(120, 53, 15, 0.97) 0%, rgba(127, 29, 29, 0.97) 100%)',
                  color: '#fff',
                  backdropFilter: 'blur(8px)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: 'rgba(251, 191, 36, 0.22)',
                      border: '1px solid rgba(251, 191, 36, 0.6)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fde68a',
                      flexShrink: 0
                    }}
                  >
                    <Bell size={20} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: '#fde68a'
                      }}
                    >
                      Speaker Wants to Talk • {timeLabel}
                    </div>
                    <div
                      style={{
                        fontSize: '1.02rem',
                        fontWeight: 800,
                        color: '#ffffff',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {alert.guestName}
                      {alert.centroOrPosition ? ` — ${alert.centroOrPosition}` : ''}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => handleToggleMonitorParticipant(alert.guestId)}
                    style={{
                      padding: '7px 12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(125, 211, 252, 0.7)',
                      background: isWhispering ? '#0284c7' : 'rgba(14, 165, 233, 0.25)',
                      color: '#fff',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      cursor: 'pointer'
                    }}
                  >
                    {isWhispering ? <Volume2 size={14} /> : <VolumeX size={14} />}
                    {isWhispering ? 'Whispering' : 'Whisper'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setOperatorAlerts((prev) => prev.filter((a) => a.id !== alert.id))
                    }
                    title="Dismiss alert"
                    style={{
                      padding: '7px 10px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.35)',
                      background: 'rgba(0, 0, 0, 0.35)',
                      color: '#fff',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    <X size={14} />
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Authoritative Remote Participant Audio Output:
          - LIVE speakers always play to System Default (House PA / Sanctuary speakers).
          - Operator "Listen" routes to the selected Listen-In Output (e.g. Headphones) so
            Green Room soundchecks stay private and never double-play on the House PA. */}
      {participants.map((participant) => {
        const isLive = participantStageConfig.liveParticipantIds.includes(participant.id);
        const isMonitored = monitoredParticipantIds.includes(participant.id);
        if (!isLive && !isMonitored) return null;
        const stream = participantStreams.get(participant.id);
        if (!stream) return null;
        const isMuted = !participant.audioEnabled || participant.mutedByOperator;
        const shouldRenderSeparateMonitor = isMonitored && (!isLive || Boolean(monitorOutputDeviceId));
        return (
          <React.Fragment key={participant.id}>
            {isLive && <ParticipantMonitorAudio stream={stream} muted={isMuted} />}
            {shouldRenderSeparateMonitor && (
              <ParticipantMonitorAudio
                stream={stream}
                muted={isMuted}
                sinkId={monitorOutputDeviceId}
              />
            )}
          </React.Fragment>
        );
      })}

      <StudioLayoutModal
        open={studioLayoutModalOpen}
        onClose={() => setStudioLayoutModalOpen(false)}
        stageConfig={participantStageConfig}
        onSave={(next) => {
          setParticipantStageConfig((prev) => {
            const updated = { ...prev, ...next };
            try {
              localStorage.setItem(
                'uecfi_studio_layout_v1',
                JSON.stringify({ ...updated, liveParticipantIds: undefined })
              );
            } catch {
              // Ignore storage quota errors
            }
            return updated;
          });
        }}
      />

      <ItemEditorModal
        open={editorOpen}
        initialItem={editingItem}
        defaultType={editorDefaultType}
        onClose={() => setEditorOpen(false)}
        onSave={handleSaveEditorItem}
      />

      <SlideBuilderModal
        open={slideBuilderOpen}
        initialItem={editingItem}
        onClose={() => setSlideBuilderOpen(false)}
        onSave={handleSaveEditorItem}
      />

      <SlideBuilderModal
        open={logoBuilderOpen}
        initialItem={
          logoSlide ?? {
            id: 'logo-slide-default',
            title: 'Logo Screen',
            subtitle: 'Logo',
            type: 'slide',
            themeBackground: 'radial-gradient(circle at center, #1e293b 0%, #020617 100%)',
            blocks: [
              {
                id: 'logo-block-1',
                label: 'Logo',
                lines: [t.appName],
                canvasElements: [
                  {
                    id: 'logo-title',
                    kind: 'text',
                    x: 10,
                    y: 40,
                    width: 80,
                    height: 20,
                    zIndex: 1,
                    anchor: 'center',
                    text: t.appName.toUpperCase(),
                    fontSize: 76,
                    fontWeight: '800',
                    color: '#f8fafc',
                    letterSpacing: 0.08,
                    textAlign: 'center'
                  }
                ]
              }
            ]
          }
        }
        onClose={() => setLogoBuilderOpen(false)}
        onSave={(saved) => setLogoSlide({ ...saved, id: 'logo-slide-custom' })}
      />

      {/* Program Add Modal (New Slide / Library / Biblical References) */}
      <dialog
        ref={programPickerRef}
        aria-label={`Add to ${t.workspace.program}`}
        style={{
          maxWidth: programPickerMode === 'bible' ? '720px' : '520px',
          width: programPickerMode === 'bible' ? 'min(94vw, 720px)' : 'min(92vw, 520px)'
        }}
        onClose={() => {
          if (programPickerRef.current) programPickerRef.current.returnValue = '';
          setProgramPickerOpen(false);
          setEditingItem(null);
        }}
      >
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px', height: programPickerMode === 'bible' ? '78vh' : 'auto', maxHeight: '80vh' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
              {programPickerMode === 'bible'
                ? editingItem
                  ? `${t.editor.edit}: ${editingItem.title}`
                  : `Add ${t.contentTypes.verse} to ${t.workspace.program}`
                : `Add from ${t.workspace.library} to ${t.workspace.program}`}
            </h2>
            <form method="dialog" style={{ margin: 0 }}>
              <button
                type="submit"
                value="close"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '7px',
                  padding: '5px 10px',
                  fontSize: '0.78rem'
                }}
              >
                Close
              </button>
            </form>
          </div>

          {programPickerMode === 'bible' ? (
            <BibleProgramPicker
              initialItem={editingItem?.type === 'verse' ? editingItem : null}
              onAddReferences={(item) => {
                if (editingItem?.type === 'verse') {
                  syncItemChange(item);
                } else {
                  handleAddVerseToProgram(item);
                }
                setProgramPickerOpen(false);
                setEditingItem(null);
              }}
            />
          ) : (
            <>
              <input
                type="search"
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder={`Search ${t.workspace.library}...`}
                autoFocus
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-app)',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem'
                }}
              />

              <div style={{ display: 'flex', gap: '6px' }}>
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'song', label: t.contentTypes.song },
                    { id: 'programItem', label: t.contentTypes.programItem }
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setPickerFilter(f.id)}
                    style={{
                      ...createBtnStyle,
                      borderColor: pickerFilter === f.id ? 'var(--accent)' : 'var(--border-subtle)',
                      background:
                        pickerFilter === f.id ? 'rgba(59,130,246,0.2)' : 'var(--bg-panel-elevated)',
                      color: pickerFilter === f.id ? '#93c5fd' : 'var(--text-primary)'
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {library
                  .filter(
                    (item) =>
                      (pickerFilter === 'all' || item.type === pickerFilter) &&
                      (!pickerQuery.trim() ||
                        item.title.toLowerCase().includes(pickerQuery.trim().toLowerCase()))
                  )
                  .sort((a, b) =>
                    a.title.localeCompare(b.title, undefined, {
                      sensitivity: 'base',
                      numeric: true
                    })
                  )
                  .map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        handleAddFromLibrary(item);
                        setProgramPickerOpen(false);
                      }}
                      style={{
                        textAlign: 'left',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-panel-elevated)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{getTypeIcon(item.type)}</span>
                        <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>{item.title}</span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {t.contentTypes[item.type]}
                      </span>
                    </button>
                  ))}
              </div>
            </>
          )}
        </div>
      </dialog>

      {/* Delete Confirmation Dialog (Program & Library items) */}
      <dialog
        ref={confirmDialogRef}
        aria-labelledby={confirmTitleId}
        style={{ maxWidth: '400px', width: 'min(90vw, 400px)' }}
        onClose={() => {
          if (confirmDialogRef.current) {
            if (confirmDialogRef.current.returnValue === 'delete' && confirmDeleteItem) {
              if (confirmDeleteItem.target === 'program') {
                handleRemoveProgramItem(confirmDeleteItem.id);
              } else if (confirmDeleteItem.target === 'program-clear') {
                handleClearProgramPlaylist();
              } else if (confirmDeleteItem.target === 'library-bulk') {
                handleDeleteAllLibrary(confirmDeleteItem.id as 'all' | 'song' | 'programItem');
              } else {
                handleDeleteLibraryItem(confirmDeleteItem.id);
              }
            }
            confirmDialogRef.current.returnValue = '';
          }
          setConfirmDeleteItem(null);
        }}
      >
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h2 id={confirmTitleId} style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
            {confirmDeleteItem?.target === 'program'
              ? `Remove from ${t.workspace.program}?`
              : `Delete from ${t.workspace.library}?`}
          </h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            Are you sure you want to {confirmDeleteItem?.target === 'program' ? 'remove' : 'delete'}{' '}
            <strong>{confirmDeleteItem?.title}</strong>?
            {confirmDeleteItem?.target !== 'program' ? ' This cannot be undone.' : ''}
          </p>
          <form method="dialog" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', margin: 0 }}>
            <button
              type="submit"
              value="cancel"
              autoFocus
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-panel-elevated)',
                fontSize: '0.82rem',
                fontWeight: 600
              }}
            >
              {t.editor.cancel}
            </button>
            <button
              type="submit"
              value="delete"
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                border: 'none',
                background: '#dc2626',
                color: '#fff',
                fontSize: '0.82rem',
                fontWeight: 700
              }}
            >
              {t.editor.delete}
            </button>
          </form>
        </div>
      </dialog>

      {/* Switch Live Item Confirmation Dialog while a song is playing */}
      <dialog
        ref={switchLiveDialogRef}
        aria-labelledby={switchLiveTitleId}
        style={{ maxWidth: '420px', width: 'min(90vw, 420px)' }}
        onClose={() => {
          if (switchLiveDialogRef.current) {
            if (switchLiveDialogRef.current.returnValue === 'confirm' && pendingLiveSwitch) {
              pendingLiveSwitch.onConfirm();
            }
            switchLiveDialogRef.current.returnValue = '';
          }
          setPendingLiveSwitch(null);
        }}
      >
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h2 id={switchLiveTitleId} style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
            Switch Live Item?
          </h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            <strong>{liveTimedAudioItem?.title ?? 'Current song'}</strong> is currently playing.
            Switching to <strong>{pendingLiveSwitch?.targetTitle}</strong> will stop the current song.
          </p>
          <form method="dialog" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', margin: 0 }}>
            <button
              type="submit"
              value="cancel"
              autoFocus
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-panel-elevated)',
                fontSize: '0.82rem',
                fontWeight: 600
              }}
            >
              Keep Playing
            </button>
            <button
              type="submit"
              value="confirm"
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                fontSize: '0.82rem',
                fontWeight: 700
              }}
            >
              Switch Item
            </button>
          </form>
        </div>
      </dialog>

      {/* First-Launch No Bibles Imported Prompt */}
      <dialog
        ref={bibleImportPromptRef}
        aria-labelledby={bibleImportPromptTitleId}
        style={{ maxWidth: '450px', width: 'min(92vw, 450px)' }}
        onCancel={(e) => {
          if (bibleImportPromptStep === 'prompt') {
            e.preventDefault();
            handleDeferBibleImport();
          }
        }}
        onClose={() => {
          if (bibleImportPromptRef.current) {
            bibleImportPromptRef.current.returnValue = '';
          }
          setBibleStartupImportError(null);
          setBibleImportPromptStep('closed');
        }}
      >
        <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <input
            ref={bibleStartupFileInputRef}
            type="file"
            accept=".xml,text/xml,application/xml"
            multiple
            onChange={handleStartupBibleFileChange}
            style={{ display: 'none' }}
          />
          {bibleImportPromptStep === 'prompt' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: 'rgba(59, 130, 246, 0.16)',
                    border: '1px solid rgba(59, 130, 246, 0.35)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#60a5fa',
                    flexShrink: 0
                  }}
                >
                  <BookOpen size={18} />
                </div>
                <h2 id={bibleImportPromptTitleId} style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                  No Bibles Imported Yet
                </h2>
              </div>
              <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                You don&apos;t have any Bible XML files imported yet. Would you like to start importing a Bible now?
              </p>
              {bibleStartupImportError && (
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: 'rgba(220, 38, 38, 0.14)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: '#fca5a5',
                    fontSize: '0.78rem'
                  }}
                >
                  {bibleStartupImportError}
                </div>
              )}
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.82rem',
                  color: 'var(--text-secondary)',
                  userSelect: 'none'
                }}
              >
                <input
                  type="checkbox"
                  checked={dontShowBiblePromptAgain}
                  onChange={(e) => setDontShowBiblePromptAgain(e.target.checked)}
                />
                <span>Don&apos;t show this again</span>
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <button
                  type="button"
                  disabled={bibleStartupImporting}
                  onClick={handleDeferBibleImport}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-panel-elevated)',
                    fontSize: '0.82rem',
                    fontWeight: 600
                  }}
                >
                  Remind Me Later
                </button>
                <button
                  type="button"
                  autoFocus
                  disabled={bibleStartupImporting}
                  onClick={() => bibleStartupFileInputRef.current?.click()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--accent)',
                    color: '#fff',
                    fontSize: '0.82rem',
                    fontWeight: 700
                  }}
                >
                  <Upload size={14} />
                  {bibleStartupImporting ? 'Importing…' : 'Start Importing'}
                </button>
              </div>
            </>
          ) : bibleImportPromptStep === 'success' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: 'rgba(34, 197, 94, 0.14)',
                    border: '1px solid rgba(34, 197, 94, 0.35)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#4ade80',
                    flexShrink: 0
                  }}
                >
                  <Check size={18} />
                </div>
                <h2 id={bibleImportPromptTitleId} style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                  Bible Imported Successfully
                </h2>
              </div>
              <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                Imported{' '}
                <strong>{bibleStartupImportedTitles.join(', ')}</strong>. You can start browsing verses right away or import another Bible XML.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <button
                  type="button"
                  disabled={bibleStartupImporting}
                  onClick={() => bibleStartupFileInputRef.current?.click()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-panel-elevated)',
                    fontSize: '0.82rem',
                    fontWeight: 600
                  }}
                >
                  <Upload size={14} />
                  Import Another
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => setBibleImportPromptStep('closed')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--accent)',
                    color: '#fff',
                    fontSize: '0.82rem',
                    fontWeight: 700
                  }}
                >
                  Done
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: 'rgba(34, 197, 94, 0.14)',
                    border: '1px solid rgba(34, 197, 94, 0.35)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#4ade80',
                    flexShrink: 0
                  }}
                >
                  <Settings2 size={18} />
                </div>
                <h2 id={bibleImportPromptTitleId} style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                  Import Anytime Later
                </h2>
              </div>
              <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                No problem! Whenever you&apos;re ready, open the <strong>{t.workspace.bible}</strong> tab in the left panel, click the{' '}
                <strong>Settings</strong> (gear) button, and choose <strong>{t.bible.importXml}</strong>.
              </p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                {dontShowBiblePromptAgain
                  ? "We won't show this reminder again on startup."
                  : "We'll remind you again next time you launch the app."}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button
                  type="button"
                  autoFocus
                  onClick={() => setBibleImportPromptStep('closed')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--accent)',
                    color: '#fff',
                    fontSize: '0.82rem',
                    fontWeight: 700
                  }}
                >
                  Got It
                </button>
              </div>
            </>
          )}
        </div>
      </dialog>
      <LyricsSyncModal
        open={syncModalOpen && selectedItem?.type === 'song'}
        title={selectedItem?.title ?? ''}
        audioUrl={selectedItem?.audioUrl}
        blocks={selectedItem?.blocks ?? []}
        onClose={() => setSyncModalOpen(false)}
        onApply={(updatedBlocks) => {
          if (selectedItem) {
            syncItemChange({ ...selectedItem, blocks: updatedBlocks });
          }
        }}
      />
    </div>
  );
};

const popupMenuStyle: React.CSSProperties = {
  position: 'absolute',
  right: 0,
  top: 'calc(100% + 4px)',
  zIndex: 40,
  minWidth: '150px',
  background: 'var(--bg-panel)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  padding: '4px',
  boxShadow: '0 10px 28px rgba(0, 0, 0, 0.55)',
  display: 'flex',
  flexDirection: 'column',
  gap: '2px'
};

const menuItemBtnStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 9px',
  borderRadius: '6px',
  border: 'none',
  background: 'transparent',
  color: 'var(--text-primary)',
  fontSize: '0.76rem',
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  gap: '7px',
  whiteSpace: 'nowrap'
};

const createBtnStyle: React.CSSProperties = {
  flex: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  padding: '5px 6px',
  borderRadius: '6px',
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-panel-elevated)',
  fontSize: '0.73rem',
  fontWeight: 600
};

function miniIconBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    background: 'transparent',
    border: '1px solid var(--border-subtle)',
    borderRadius: '5px',
    padding: '4px',
    display: 'inline-flex',
    opacity: disabled ? 0.35 : 1
  };
}

const colDividerStyle: React.CSSProperties = {
  width: '5px',
  background: 'var(--border-subtle)',
  cursor: 'col-resize'
};

const panelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 12px',
  fontSize: '0.8rem',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  borderBottom: '1px solid var(--border-subtle)',
  background: 'var(--bg-panel)'
};

function toolbarBtnStyle(active: boolean, activeColor = '#3b82f6'): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 11px',
    borderRadius: '8px',
    border: '1px solid',
    borderColor: active ? activeColor : 'var(--border-subtle)',
    background: active ? `${activeColor}26` : 'var(--bg-panel-elevated)',
    fontSize: '0.8rem',
    fontWeight: 600
  };
}
