import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../utils/cn';
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
  const overflowEnabledRef = useRef(false);
  overflowEnabledRef.current = overflowConfig.enabled;
  const [previewCamerasOn, setPreviewCamerasOn] = useState(false);
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
    // Disable AEC/NS/AGC on Return Audio so mixer/soundboard loops pass the app's own song
    // playback and live music cleanly without Electron's echo canceller stripping them out.
    const constraints: MediaTrackConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
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
    overflowConfig.enabled ||
    previewCamerasOn ||
    (returnFeedConfig.sendVideo && participants.length > 0);

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

    const openCameraStream = async (
      deviceId: string,
      previewOnly = false
    ): Promise<MediaStream | null> => {
      if (!navigator.mediaDevices?.getUserMedia) return null;
      const tiers: MediaTrackConstraints[] = previewOnly
        ? [
            {
              width: { ideal: 320, max: 640 },
              height: { ideal: 240, max: 480 },
              frameRate: { ideal: 10, max: 15 }
            },
            {
              width: { ideal: 320, max: 640 },
              height: { ideal: 180, max: 480 }
            }
          ]
        : [
            { width: { ideal: 1280 }, height: { ideal: 720 } },
            { width: { ideal: 640, max: 1280 }, height: { ideal: 360, max: 720 } }
          ];

      let lastErr: unknown = null;
      for (const tier of tiers) {
        try {
          const constraints: MediaStreamConstraints = {
            video: deviceId ? { deviceId: { exact: deviceId }, ...tier } : tier,
            audio: false
          };
          return await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr;
    };

    const isHighResStream = (stream?: MediaStream | null) => {
      const settings = stream?.getVideoTracks()[0]?.getSettings();
      return (settings?.width ?? 0) >= 1000;
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
        if (isStreamLive(existing) && existing) {
          // If this camera was previously the 720p active camera, reopen it at low-bandwidth
          // preview resolution so all 3 USB cameras fit within the USB controller budget.
          if (!isHighResStream(existing)) continue;
          existing.getTracks().forEach((t) => t.stop());
          overflowAngleStreamsRef.current.delete(devId);
        }
        try {
          const warmStream = await openCameraStream(devId, true);
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
    if (isStreamLive(cachedActive) && cachedActive && isHighResStream(cachedActive)) {
      applyActiveStream(cachedActive);
      void prewarmOtherAngles();
    } else {
      if (cachedActive) {
        cachedActive.getTracks().forEach((t) => t.stop());
        overflowAngleStreamsRef.current.delete(activeKey);
      }
      openCameraStream(selectedOverflowCameraId, false)
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
      const hasActiveFeed = prev.liveParticipantIds.length > 0 || overflowEnabledRef.current;
      if (!hasActiveFeed || prev.layout !== 'full') return prev;
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
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => updateAudioVolume(audioVolume <= 0.01 ? 1 : 0)}
        title={audioVolume <= 0.01 ? 'Unmute live audio' : 'Mute live audio'}
        className="inline-flex cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-text-secondary hover:text-text-primary"
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
        className="flex-1"
      />
      <span className="min-w-[34px] text-right text-[0.72rem] tabular-nums text-text-muted">
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
    <div className="flex items-center justify-between gap-2">
      <span className="text-[0.74rem] font-semibold text-text-secondary">
        {label}
      </span>
      <div className="flex items-center gap-[5px]">
        {swatches.map((swatch) => (
          <button
            key={swatch}
            type="button"
            onClick={() => onChange(swatch)}
            title={swatch}
            className={cn(
              'h-4 w-4 rounded-full p-0',
              (value || defaultColor).toLowerCase() === swatch
                ? 'border-2 border-accent'
                : 'border border-white/28'
            )}
            style={{ background: swatch }}
          />
        ))}
        <input
          type="color"
          aria-label={label}
          value={value || defaultColor}
          onChange={(e) => onChange(e.target.value)}
          className="h-5 w-6 cursor-pointer rounded border border-subtle bg-transparent p-0"
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
    <div className="flex h-full w-full flex-col bg-app">
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
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle bg-panel px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <img
              src={uecfiLogoTiny}
              alt=""
              width={24}
              height={24}
              className="h-6 w-6 shrink-0 rounded-md object-contain"
            />
            <strong className="text-base tracking-[0.02em]">{t.appName}</strong>
          </div>
          <button
            type="button"
            onClick={handleToggleMainScreen}
            title={mainScreenOpen ? t.screens.closeMainScreen : t.screens.openMainScreen}
            aria-label={mainScreenOpen ? t.screens.closeMainScreen : t.screens.openMainScreen}
            className={cn(
              'inline-flex items-center justify-center rounded-lg border-0 px-2.5 py-[7px] text-white transition-colors',
              mainScreenOpen ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'
            )}
          >
            {mainScreenOpen ? <Square size={15} fill="currentColor" /> : <Cast size={16} />}
          </button>
          <button
            type="button"
            onClick={handlePrevious}
            disabled={!liveItem || activeBlockIndex <= 0}
            className={cn(
              toolbarBtnCls(false),
              'px-[9px] py-[7px]',
              (!liveItem || activeBlockIndex <= 0) && 'opacity-45'
            )}
            title={t.controls.previous}
            aria-label={t.controls.previous}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={!liveItem || activeBlockIndex + 1 >= liveItem.blocks.length}
            className={cn(
              toolbarBtnCls(false),
              'px-[9px] py-[7px]',
              (!liveItem || activeBlockIndex + 1 >= liveItem.blocks.length) && 'opacity-45'
            )}
            title={t.controls.next}
            aria-label={t.controls.next}
          >
            <ChevronRight size={16} />
          </button>

          <div className="mx-0.5 h-[22px] w-px bg-subtle" />

          <button
            type="button"
            onClick={() => toggleOverride('clearText')}
            className={toolbarBtnCls(override === 'clearText', 'amber')}
          >
            <Eraser size={14} />
            {t.controls.clearText}
          </button>
          <button
            type="button"
            onClick={() => toggleOverride('blackout')}
            className={toolbarBtnCls(override === 'blackout', 'red')}
          >
            <MonitorOff size={14} />
            {t.controls.blackout}
          </button>
          <div
            className={cn(
              'inline-flex items-stretch overflow-hidden rounded-lg border',
              override === 'showLogo'
                ? 'border-blue-500 bg-blue-500/16'
                : 'border-subtle bg-panel-elevated'
            )}
          >
            <button
              type="button"
              onClick={() => toggleOverride('showLogo')}
              className={cn(
                'inline-flex items-center gap-1.5 border-0 bg-transparent px-[11px] py-[7px] text-[0.82rem] font-semibold transition-colors hover:bg-hover/60',
                override === 'showLogo' ? 'text-blue-300' : 'text-text-primary'
              )}
            >
              <Church size={14} />
              Logo
            </button>
            <div
              className={cn(
                'w-px',
                override === 'showLogo' ? 'bg-blue-500/45' : 'bg-subtle'
              )}
            />
            <button
              type="button"
              onClick={() => setLogoBuilderOpen(true)}
              title="Customize Logo Slide"
              className="inline-flex items-center justify-center border-0 bg-transparent px-[9px] py-[7px] text-text-secondary transition-colors hover:bg-hover/60 hover:text-text-primary"
            >
              <Pencil size={13} />
            </button>
          </div>
        </div>

        {/* Right Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              refreshDisplaysAndRemote();
              setSetupModalOpen(true);
            }}
            title="Settings (Displays, Local Remote, Online Relay)"
            aria-label="Settings"
            className={toolbarBtnCls(false)}
          >
            <Settings size={15} />
            <span>Settings</span>
            {remoteInfo && remoteInfo.connectedClients > 0 && (
              <span className="rounded-full bg-blue-700 px-1.5 py-px text-[0.7rem] text-white">
                {remoteInfo.connectedClients}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={handleToggleOverflowScreen}
            title="Open/Close HDMI Overflow Room Screen"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border border-subtle px-3 py-[7px] text-[0.8rem] font-bold text-white transition-colors',
              overflowScreenOpen ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-panel-elevated hover:bg-hover'
            )}
          >
            <Monitor size={14} />
            {overflowScreenOpen ? 'Close Overflow' : 'Overflow'}
          </button>
        </div>
      </header>

      {remoteInfo?.serverError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 border-b border-red-500/40 bg-red-600/16 px-4 py-1.5 text-[0.8rem] text-red-300"
        >
          <span>
            LAN Remote Server failed to start ({remoteInfo.serverError}). Local presentation and media still work, but phones/tablets cannot connect.
          </span>
        </div>
      )}

      {/* Main 3-Column Presenter Workspace with Resizable Dividers */}
      <div
        className="grid min-h-0 flex-1 overflow-hidden bg-app"
        style={{
          gridTemplateColumns: `${leftWidth}px 5px 1fr 5px ${rightWidth}px`
        }}
      >
        {/* Left Column: Program + Library */}
        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-panel">
          {/* Program Section */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className={PANEL_HEADER_CLS}>
              <div ref={playlistMenuRef} className="relative min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => {
                    setPlaylistMenuOpen((prev) => !prev);
                    setRenamingPlaylistId(null);
                  }}
                  title="Switch or manage program playlists"
                  className="-ml-1 inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-left text-inherit font-inherit tracking-inherit uppercase text-text-primary transition-colors hover:bg-hover/60"
                >
                  <ListMusic size={13} className="shrink-0 text-blue-300" />
                  <span className="truncate">
                    {program.name}
                  </span>
                  <span className="shrink-0 text-[0.75rem] text-text-muted">
                    ({program.items.length})
                  </span>
                  <ChevronDown size={13} className="shrink-0 text-text-muted" />
                </button>

                {playlistMenuOpen && (
                  <div className={cn(POPUP_MENU_CLS, 'right-auto left-0 w-[270px] max-w-[calc(100vw-32px)] gap-1.5 p-2 normal-case tracking-normal')}>
                    <div className="px-1 py-0.5 text-[0.7rem] font-bold uppercase tracking-[0.06em] text-text-muted">
                      {t.workspace.program} Playlists ({programs.length})
                    </div>

                    <div className="flex max-h-[220px] flex-col gap-[3px] overflow-y-auto">
                      {programs.map((p) => {
                        const isActive = p.id === programRef.id;
                        const isRenaming = renamingPlaylistId === p.id;
                        return (
                          <div
                            key={p.id}
                            className={cn(
                              'flex items-center gap-1 rounded-[7px] border px-1.5 py-1',
                              isActive
                                ? 'border-accent bg-blue-500/16'
                                : 'border-transparent bg-app'
                            )}
                          >
                            {isRenaming ? (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  handleRenamePlaylist(p.id);
                                }}
                                className="flex min-w-0 flex-1 gap-1"
                              >
                                <input
                                  type="text"
                                  value={renamePlaylistValue}
                                  onChange={(e) => setRenamePlaylistValue(e.target.value)}
                                  autoFocus
                                  className="min-w-0 flex-1 rounded-[5px] border border-accent bg-panel px-1.5 py-[3px] text-[0.76rem] text-text-primary focus:outline-none"
                                />
                                <button
                                  type="submit"
                                  title="Save name"
                                  className={miniIconBtnCls(false)}
                                >
                                  <Check size={12} />
                                </button>
                              </form>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleSelectPlaylist(p.id)}
                                  className="flex min-w-0 flex-1 items-center justify-between gap-1.5 border-0 bg-transparent px-1 py-0.5 text-left"
                                >
                                  <span
                                    className={cn(
                                      'truncate text-[0.78rem]',
                                      isActive ? 'font-bold text-blue-300' : 'font-medium text-text-primary'
                                    )}
                                  >
                                    {p.name}
                                  </span>
                                  <span className="shrink-0 text-[0.7rem] text-text-muted">
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
                                  className={miniIconBtnCls(false)}
                                >
                                  <Edit3 size={11} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDuplicatePlaylist(p)}
                                  title="Duplicate playlist"
                                  className={miniIconBtnCls(false)}
                                >
                                  <Copy size={11} />
                                </button>
                                {programs.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePlaylist(p.id)}
                                    title="Delete playlist"
                                    className={miniIconBtnCls(true)}
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
                      className="flex gap-1 border-t border-subtle pt-1.5"
                    >
                      <input
                        type="text"
                        value={newPlaylistName}
                        onChange={(e) => setNewPlaylistName(e.target.value)}
                        placeholder="New playlist name..."
                        className="min-w-0 flex-1 rounded-md border border-subtle bg-app px-2 py-[5px] text-[0.76rem] text-text-primary focus:border-accent focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={!newPlaylistName.trim()}
                        className={cn(
                          'inline-flex items-center gap-[3px] rounded-md border border-accent bg-blue-500/18 px-[9px] py-[5px] text-[0.74rem] font-bold text-blue-300 transition-colors hover:bg-blue-500/28',
                          !newPlaylistName.trim() && 'opacity-50'
                        )}
                      >
                        <Plus size={12} /> New
                      </button>
                    </form>
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <div ref={programAddMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setProgramAddMenuOpen((prev) => !prev)}
                    className="inline-flex items-center gap-1 rounded-[5px] border-0 bg-blue-600 px-[9px] py-1 text-[0.72rem] font-semibold text-white transition-colors hover:bg-blue-500"
                  >
                    <Plus size={12} /> Add
                  </button>

                  {programAddMenuOpen && (
                    <div className={POPUP_MENU_CLS}>
                      <button
                        type="button"
                        onClick={() => {
                          setProgramAddMenuOpen(false);
                          handleOpenNewEditor('slide');
                        }}
                        className={MENU_ITEM_BTN_CLS}
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
                        className={MENU_ITEM_BTN_CLS}
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
                        className={MENU_ITEM_BTN_CLS}
                      >
                        <BookOpen size={13} />
                        <span>{t.contentTypes.verse}</span>
                      </button>
                    </div>
                  )}
                </div>

                <div ref={programIoMenuRef} className="relative">
                  <input
                    ref={programImportInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleImportProgramPlaylist}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setProgramIoMenuOpen((prev) => !prev)}
                    aria-label="Export, import, or clear program"
                    title="Export / Import / Clear Program"
                    className={cn(
                      'inline-flex items-center justify-center rounded-md border px-[5px] py-1 transition-colors',
                      programIoMenuOpen
                        ? 'border-accent bg-blue-500/16 text-blue-300'
                        : 'border-subtle bg-panel-elevated text-text-secondary hover:bg-hover'
                    )}
                  >
                    <MoreVertical size={13} />
                  </button>

                  {programIoMenuOpen && (
                    <div className={cn(POPUP_MENU_CLS, 'min-w-[180px]')}>
                      <button
                        type="button"
                        onClick={() => {
                          setProgramIoMenuOpen(false);
                          programImportInputRef.current?.click();
                        }}
                        className={MENU_ITEM_BTN_CLS}
                      >
                        <Upload size={13} />
                        <span>Import {t.workspace.program}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleExportProgramPlaylist}
                        className={MENU_ITEM_BTN_CLS}
                      >
                        <Download size={13} />
                        <span>Export {t.workspace.program}</span>
                      </button>
                      <div className="my-0.5 h-px bg-subtle" />
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
                        className={cn(
                          MENU_ITEM_BTN_CLS,
                          'text-red-300',
                          program.items.length === 0 && 'opacity-45'
                        )}
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
                className={cn(
                  'flex items-center justify-between gap-1.5 border-b border-subtle px-2.5 py-[5px] text-[0.73rem]',
                  programIoNotice.ok
                    ? 'bg-emerald-500/12 text-emerald-300'
                    : 'bg-red-500/12 text-red-300'
                )}
              >
                <span>{programIoNotice.text}</span>
                <button
                  type="button"
                  onClick={() => setProgramIoNotice(null)}
                  className="border-0 bg-transparent px-1 py-0 text-[0.72rem] text-inherit"
                >
                  Dismiss
                </button>
              </div>
            )}
            <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
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
                    className={cn(
                      'flex items-center gap-1 rounded-lg border p-1 transition-colors',
                      isDragOver
                        ? 'border-sky-400 bg-sky-400/12'
                        : isSelected
                          ? 'border-accent bg-blue-500/16'
                          : 'border-transparent bg-transparent hover:bg-hover/40',
                      draggedProgramIdx === idx && 'opacity-50'
                    )}
                  >
                    <span
                      title="Drag to reorder"
                      className="inline-flex cursor-grab pl-0.5 text-text-muted"
                    >
                      <GripVertical size={13} />
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSelectProgramItem(item)}
                      onDoubleClick={() => handlePresentProgramItem(item)}
                      title="Click to preview · Double-click to present"
                      className="flex min-w-0 flex-1 items-center gap-2.5 border-0 bg-transparent px-2 py-1.5 text-left"
                    >
                      <span className={isSelected ? 'text-blue-400' : 'text-text-secondary'}>
                        {getTypeIcon(item.type)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[0.84rem] font-semibold">
                          {item.title}
                        </div>
                        <div className="text-[0.7rem] text-text-muted">
                          {t.contentTypes[item.type]}
                          {item.type === 'song' && item.lyricsMode
                            ? ` • ${item.lyricsMode === 'timed' ? t.lyricsModes.timedMode : t.lyricsModes.slideMode}`
                            : ''}
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => handleMoveProgramItem(idx, -1)}
                        disabled={idx === 0}
                        title="Move Up"
                        className={miniIconBtnCls(idx === 0)}
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveProgramItem(idx, 1)}
                        disabled={idx === program.items.length - 1}
                        title="Move Down"
                        className={miniIconBtnCls(idx === program.items.length - 1)}
                      >
                        <ArrowDown size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEditEditor(item)}
                        title={t.editor.edit}
                        className={miniIconBtnCls(false)}
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmDeleteItem({ id: item.id, title: item.title, target: 'program' })
                        }
                        title={t.editor.delete}
                        className={miniIconBtnCls(false)}
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
            className="h-[5px] shrink-0 cursor-row-resize bg-subtle"
          />

          {/* Library / Verses Section */}
          <div
            className="flex min-h-[180px] flex-col"
            style={{ height: `${leftBottomPct}%` }}
          >
            <div className={cn(PANEL_HEADER_CLS, 'gap-1.5 px-2 py-1.5')}>
              <button
                type="button"
                onClick={() => setLibraryTab('verses')}
                className={cn(
                  'flex-1 rounded-md border px-2 py-[5px] text-[0.78rem] font-bold transition-colors',
                  libraryTab === 'verses'
                    ? 'border-accent bg-blue-500/16'
                    : 'border-transparent bg-transparent hover:bg-hover/50'
                )}
              >
                {t.workspace.bible}
              </button>
              <button
                type="button"
                onClick={() => setLibraryTab('library')}
                className={cn(
                  'flex-1 rounded-md border px-2 py-[5px] text-[0.78rem] font-bold transition-colors',
                  libraryTab === 'library'
                    ? 'border-accent bg-blue-500/16'
                    : 'border-transparent bg-transparent hover:bg-hover/50'
                )}
              >
                {t.workspace.library}
              </button>
            </div>

            {libraryTab === 'verses' ? (
              <div className="min-h-0 flex-1">
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
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="relative flex items-center gap-1 border-b border-subtle px-2 py-1.5">
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
                        className={cn(
                          CREATE_BTN_CLS,
                          active
                            ? 'border-live-green bg-green-500/20 text-green-300'
                            : 'border-subtle bg-panel-elevated text-text-primary hover:bg-hover'
                        )}
                      >
                        {f.label}
                      </button>
                    );
                  })}

                  <div ref={addMenuRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setAddMenuOpen((prev) => !prev)}
                      className={cn(
                        CREATE_BTN_CLS,
                        'flex-none rounded-[5px] border-0 bg-blue-600 px-2.5 py-[5px] font-semibold text-white hover:bg-blue-500'
                      )}
                    >
                      <Plus size={12} /> Add
                    </button>

                    {addMenuOpen && (
                      <div className={POPUP_MENU_CLS}>
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
                            className={MENU_ITEM_BTN_CLS}
                          >
                            {getTypeIcon(opt.type)}
                            <span>{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div ref={libraryIoMenuRef} className="relative">
                    <input
                      ref={libraryImportInputRef}
                      type="file"
                      accept=".json,application/json"
                      onChange={handleImportLibraryFile}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => setLibraryIoMenuOpen((prev) => !prev)}
                      aria-label="Export or import songs and docs"
                      title="Export / Import Songs & Docs"
                      className={cn(
                        CREATE_BTN_CLS,
                        'flex-none px-1.5 py-[5px]',
                        libraryIoMenuOpen
                          ? 'border-accent bg-blue-500/16 text-blue-300'
                          : 'border-subtle bg-panel-elevated text-text-secondary hover:bg-hover'
                      )}
                    >
                      <MoreVertical size={13} />
                    </button>

                    {libraryIoMenuOpen && (
                      <div className={cn(POPUP_MENU_CLS, 'min-w-[185px]')}>
                        <button
                          type="button"
                          onClick={() => {
                            setLibraryIoMenuOpen(false);
                            libraryImportInputRef.current?.click();
                          }}
                          className={MENU_ITEM_BTN_CLS}
                        >
                          <Upload size={13} />
                          <span>Import {t.contentTypes.song} / {t.contentTypes.programItem}</span>
                        </button>
                        <div className="my-0.5 h-px bg-subtle" />
                        <button
                          type="button"
                          onClick={() => handleExportLibrary('all')}
                          className={MENU_ITEM_BTN_CLS}
                        >
                          <Download size={13} />
                          <span>Export All ({t.contentTypes.song} &amp; {t.contentTypes.programItem})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportLibrary('song')}
                          className={MENU_ITEM_BTN_CLS}
                        >
                          <Music size={13} />
                          <span>Export {t.contentTypes.song}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportLibrary('programItem')}
                          className={MENU_ITEM_BTN_CLS}
                        >
                          <FileText size={13} />
                          <span>Export {t.contentTypes.programItem}</span>
                        </button>
                        <div className="my-0.5 h-px bg-subtle" />
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
                          className={cn(MENU_ITEM_BTN_CLS, 'text-red-300')}
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
                          className={cn(MENU_ITEM_BTN_CLS, 'text-red-300')}
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
                          className={cn(MENU_ITEM_BTN_CLS, 'text-red-300')}
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
                    className={cn(
                      'flex items-center justify-between gap-1.5 border-b border-subtle px-2.5 py-[5px] text-[0.73rem]',
                      libraryIoNotice.ok
                        ? 'bg-emerald-500/12 text-emerald-300'
                        : 'bg-red-500/12 text-red-300'
                    )}
                  >
                    <span>{libraryIoNotice.text}</span>
                    <button
                      type="button"
                      onClick={() => setLibraryIoNotice(null)}
                      className="border-0 bg-transparent px-1 py-0 text-[0.72rem] text-inherit"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
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
                          className={cn(
                            'flex items-center justify-between gap-1.5 rounded-lg border px-[7px] py-[5px] transition-colors',
                            isBrowsing
                              ? 'border-accent bg-blue-500/16'
                              : 'border-transparent bg-panel-elevated hover:bg-hover/60'
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => handleSelectLibraryItem(item)}
                            title={`Open in ${t.workspace.contentGrid}`}
                            className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent px-1 py-[3px] text-left"
                          >
                            <span
                              className={cn(
                                'inline-flex',
                                isBrowsing ? 'text-blue-400' : 'text-text-secondary'
                              )}
                            >
                              {getTypeIcon(item.type)}
                            </span>
                            <span
                              className={cn(
                                'truncate text-[0.8rem]',
                                isBrowsing ? 'font-bold' : 'font-medium'
                              )}
                            >
                              {item.title}
                            </span>
                          </button>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditEditor(item)}
                              title={t.editor.edit}
                              className={miniIconBtnCls(false)}
                            >
                              <Edit3 size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAddFromLibrary(item)}
                              title={`Add to ${t.workspace.program}`}
                              className={miniIconBtnCls(false)}
                            >
                              <Plus size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmDeleteItem({ id: item.id, title: item.title, target: 'library' })
                              }
                              title={t.editor.delete}
                              className={miniIconBtnCls(false)}
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
          className={COL_DIVIDER_CLS}
        />

        {/* Center Column: Content Grid or Smart Bible Search */}
        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-app">
          <div
            className={cn(
              'min-h-0 flex-1 flex-col',
              centerMode === 'search' ? 'flex' : 'hidden'
            )}
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
            className={cn(
              'min-h-0 min-w-0 flex-1 flex-col',
              centerMode === 'grid' ? 'flex' : 'hidden'
            )}
          >
              <div className={cn(PANEL_HEADER_CLS, 'gap-2')}>
                <span className="min-w-0 truncate">
                  {t.workspace.contentGrid} {selectedItem ? `— ${selectedItem.title}` : ''}
                </span>
                <span className="shrink-0 text-[0.75rem] text-text-muted">
                  Click any card to project ({t.workspace.directToLive})
                </span>
              </div>

              <div
                ref={contentGridRef}
                className={cn(
                  'min-w-0 flex-1 content-start overflow-x-hidden overflow-y-auto p-4',
                  selectedItem?.type === 'verse'
                    ? 'flex flex-col gap-2'
                    : 'grid grid-cols-[repeat(auto-fill,minmax(min(200px,100%),1fr))] gap-3'
                )}
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
                        className={cn(
                          'rounded-lg border border-subtle border-l-4 border-l-accent bg-panel-elevated px-3 py-[7px] text-[0.78rem] font-bold tracking-[0.03em] text-blue-300',
                          index === 0 ? 'mt-0' : 'mt-2.5'
                        )}
                      >
                        {currentGroup}
                      </div>
                    )}
                    <button
                      type="button"
                      data-live-block={isLive ? 'true' : undefined}
                      data-highlighted-block={isPreviewHighlighted ? 'true' : undefined}
                      onClick={() => handleSelectBlock(index)}
                      className={cn(
                        'flex items-start gap-3.5 rounded-[10px] border-2 px-3.5 py-3 text-left transition-colors',
                        isLive
                          ? 'border-live-red bg-panel shadow-[0_0_0_2px_rgba(239,68,68,0.25)]'
                          : isPreviewHighlighted
                            ? 'border-accent bg-blue-500/12 shadow-[0_0_0_2px_rgba(59,130,246,0.22)]'
                            : 'border-subtle bg-panel hover:border-subtle/80 hover:bg-hover/40'
                      )}
                    >
                      <span
                        className={cn(
                          'mt-px inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[0.75rem] font-bold',
                          isLive
                            ? 'bg-live-red text-white'
                            : isPreviewHighlighted
                              ? 'bg-accent text-white'
                              : 'bg-panel-elevated text-text-secondary'
                        )}
                      >
                        {verseBadge}
                      </span>

                      <div
                        className={cn(
                          'grid min-w-0 flex-1 items-start gap-4 text-[0.84rem] leading-[1.45]',
                          hasSecondary ? 'grid-cols-2' : 'grid-cols-1'
                        )}
                      >
                        <div
                          className={cn(
                            'text-text-primary',
                            hasSecondary && 'border-r border-subtle pr-3.5'
                          )}
                        >
                          {block.lines.map((line, i) => (
                            <div key={i}>{line}</div>
                          ))}
                        </div>
                        {hasSecondary && (
                          <div className="text-green-300">
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
                  className={cn(
                    'flex w-full min-w-0 flex-col gap-2 rounded-[10px] border-2 bg-panel p-3 text-left transition-colors',
                    isLive
                      ? 'border-live-red shadow-[0_0_0_2px_rgba(239,68,68,0.25)]'
                      : 'border-subtle hover:bg-hover/40'
                  )}
                >
                  <div className="flex w-full min-w-0 items-center justify-between gap-1.5">
                    <span
                      className={cn(
                        'min-w-0 truncate text-[0.72rem] font-bold uppercase tracking-[0.06em]',
                        isLive ? 'text-red-400' : 'text-blue-400'
                      )}
                    >
                      {block.label || `Slide ${index + 1}`}
                    </span>
                    {isLive && (
                      <span className="shrink-0 rounded bg-live-red px-1.5 py-0.5 text-[0.65rem] font-extrabold text-white">
                        {t.controls.live}
                      </span>
                    )}
                  </div>

                  {block.canvasElements && block.canvasElements.length > 0 ? (
                    <div
                      className="w-full overflow-hidden rounded-md border border-subtle"
                      style={{ aspectRatio: mainScreenAspectRatio }}
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
                      className="relative w-full overflow-hidden rounded-md border border-subtle"
                      style={{ aspectRatio: mainScreenAspectRatio }}
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
                          <span className="absolute top-[5px] right-1.5 rounded-[5px] border border-blue-400/45 bg-slate-900/85 px-1.5 py-0.5 text-[0.68rem] font-bold tabular-nums text-blue-300">
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
            previewCamerasOn={previewCamerasOn}
            onTogglePreviewCameras={() => setPreviewCamerasOn((prev) => !prev)}
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
          className={COL_DIVIDER_CLS}
        />

        {/* Right Column: Live Monitor + Quick Settings */}
        <aside className="flex min-h-0 flex-col overflow-hidden bg-panel">
          <div className={cn(PANEL_HEADER_CLS, 'gap-2')}>
            <div className="inline-flex items-center gap-2">
              <Radio size={14} color="#ef4444" />
              <div className="inline-flex rounded-[7px] border border-subtle bg-app p-0.5">
                <button
                  type="button"
                  onClick={() => setLiveMonitorTarget('main')}
                  className={cn(
                    'rounded-[5px] border-0 px-2 py-[3px] text-[0.72rem] font-semibold transition-colors',
                    liveMonitorTarget === 'main'
                      ? 'bg-blue-600 text-white'
                      : 'bg-transparent text-text-secondary hover:text-text-primary'
                  )}
                >
                  Main
                </button>
                <button
                  type="button"
                  onClick={() => setLiveMonitorTarget('overflow')}
                  className={cn(
                    'rounded-[5px] border-0 px-2 py-[3px] text-[0.72rem] font-semibold transition-colors',
                    liveMonitorTarget === 'overflow'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-transparent text-text-secondary hover:text-text-primary'
                  )}
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
                <div className="inline-flex items-center gap-1">
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
                    className={cn(
                      'inline-flex items-center justify-center rounded-md border border-subtle px-1.5 py-1 transition-colors',
                      layoutsLinked
                        ? 'bg-sky-400/20 text-sky-300'
                        : 'bg-transparent text-text-muted hover:bg-hover'
                    )}
                  >
                    {layoutsLinked ? <Link2 size={12} /> : <Unlink size={12} />}
                  </button>
                  <div className="inline-flex rounded-[7px] border border-subtle bg-app p-0.5">
                    <button
                      type="button"
                      onClick={() => setTargetLayout('full')}
                      title="Full Layout"
                      className={cn(
                        'inline-flex items-center gap-1 rounded-[5px] border-0 px-[7px] py-[3px] text-[0.7rem] font-semibold transition-colors',
                        activeLayout === 'full'
                          ? 'bg-blue-600 text-white'
                          : 'bg-transparent text-text-secondary hover:text-text-primary'
                      )}
                    >
                      <Maximize2 size={11} /> Full
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetLayout('custom')}
                      title="Studio Layout"
                      className={cn(
                        'inline-flex items-center gap-1 rounded-[5px] border-0 px-[7px] py-[3px] text-[0.7rem] font-semibold transition-colors',
                        activeLayout === 'custom'
                          ? 'bg-blue-600 text-white'
                          : 'bg-transparent text-text-secondary hover:text-text-primary'
                      )}
                    >
                      <LayoutTemplate size={11} /> Studio
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="shrink-0 p-3">
            <div
              className="w-full overflow-hidden rounded-[10px] border border-subtle bg-black"
              style={{ aspectRatio: mainScreenAspectRatio }}
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

          {/* Quick Settings */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-subtle">
            <div className={PANEL_HEADER_CLS}>
              <span className="inline-flex items-center gap-1.5">
                <Sliders size={14} />
                {t.workspace.inspector}
              </span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-3.5">
              {selectedItem?.type === 'verse' && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[0.78rem] font-semibold text-text-secondary">
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
                      className="w-full"
                    />
                  </div>

                  {selectedItem.blocks.some((b) => b.secondaryLines && b.secondaryLines.length > 0) && (
                    <div className="flex flex-col gap-2">
                      <div className="text-[0.78rem] font-semibold text-text-secondary">
                        {t.bible.verseLayout}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
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
                            className={cn(
                              'rounded-lg border px-1.5 py-[7px] text-[0.74rem] font-semibold transition-colors',
                              (selectedItem.bibleLayout ?? 'stacked') === opt.id
                                ? 'border-accent bg-blue-500/16'
                                : 'border-subtle bg-panel-elevated hover:bg-hover'
                            )}
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
                        <div className="flex flex-col gap-2 rounded-[10px] border border-subtle bg-panel-elevated p-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[0.75rem] font-bold text-text-secondary">
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
                                className="border-0 bg-transparent p-0 text-[0.68rem] font-semibold text-text-muted hover:text-text-primary"
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
                      <div className="flex flex-col gap-2 rounded-[10px] border border-subtle bg-panel-elevated p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[0.75rem] font-bold text-text-secondary">
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
                              className="border-0 bg-transparent p-0 text-[0.68rem] font-semibold text-text-muted hover:text-text-primary"
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
                      <div className="flex flex-col gap-2 rounded-[10px] border border-subtle bg-panel-elevated p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[0.75rem] font-bold text-text-secondary">
                            {isStackedLayout ? 'Stacked Background' : 'Single Background'}
                          </span>
                          <input
                            type="color"
                            aria-label="Solid verse background color"
                            value={activeBg?.startsWith('#') ? activeBg : '#0f172a'}
                            onChange={(e) => updateBg(e.target.value)}
                            className="h-5 w-6 cursor-pointer rounded border border-subtle bg-transparent p-0"
                          />
                        </div>
                        <BackgroundImagePicker
                          value={activeBg}
                          onSelect={updateBg}
                          compact
                        />
                        <div className="flex flex-wrap items-center gap-1.5">
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
                              className={cn(
                                'h-[22px] w-[22px] rounded-md p-0',
                                activeBg === preset.value
                                  ? 'border-2 border-accent'
                                  : 'border border-white/22'
                              )}
                              style={{ background: preset.value }}
                            />
                          ))}
                        </div>
                        <div className="flex flex-col gap-1 pt-0.5">
                          <div className="flex justify-between text-[0.74rem] font-semibold text-text-secondary">
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
                            className="w-full"
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {liveTimedAudioItem && selectedItem?.id !== liveTimedAudioItem.id && (
                <div className="flex flex-col gap-2 rounded-[10px] border border-blue-500/40 bg-panel-elevated p-2.5">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[0.72rem] font-bold uppercase tracking-[0.04em] text-blue-300">
                      Live Audio
                    </span>
                    <span
                      className="truncate text-[0.74rem] font-semibold text-text-primary"
                      title={liveTimedAudioItem.title}
                    >
                      {liveTimedAudioItem.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleToggleLiveAudio}
                      className="inline-flex items-center gap-1 rounded-[7px] border border-accent bg-blue-500/18 px-2.5 py-[5px] text-[0.75rem] font-bold text-blue-300 transition-colors hover:bg-blue-500/28"
                    >
                      {audioPlaying ? <Pause size={12} /> : <Play size={12} />}
                      {audioPlaying ? 'Pause' : 'Play'}
                    </button>
                    <button
                      type="button"
                      onClick={handleRestartTimedAudio}
                      title="Restart live audio"
                      className={miniIconBtnCls(false)}
                    >
                      <RotateCcw size={12} />
                    </button>
                    <span className="ml-auto text-[0.72rem] tabular-nums text-text-muted">
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
                    className="w-full"
                  />
                  {renderAudioVolumeControl()}
                </div>
              )}

              {selectedItem?.type === 'song' && (
                <div className="flex flex-col gap-2">
                  <div className="text-[0.78rem] font-semibold text-text-secondary">
                    Lyrics Display
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleSetLyricsMode('slide')}
                      className={cn(
                        'rounded-lg border px-2.5 py-2 text-[0.8rem] font-semibold transition-colors',
                        selectedItem.lyricsMode !== 'timed'
                          ? 'border-accent bg-blue-500/16'
                          : 'border-subtle bg-panel-elevated hover:bg-hover'
                      )}
                    >
                      {t.lyricsModes.slideMode}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetLyricsMode('timed')}
                      className={cn(
                        'rounded-lg border px-2.5 py-2 text-[0.8rem] font-semibold transition-colors',
                        selectedItem.lyricsMode === 'timed'
                          ? 'border-accent bg-blue-500/16'
                          : 'border-subtle bg-panel-elevated hover:bg-hover'
                      )}
                    >
                      {t.lyricsModes.timedMode}
                    </button>
                  </div>

                  {selectedItem.lyricsMode === 'timed' && (
                    <div className="mt-1 flex flex-col gap-2 rounded-[10px] border border-subtle bg-panel-elevated p-2.5">
                      <input
                        ref={inspectorAudioUploadRef}
                        type="file"
                        accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac"
                        onChange={handleInspectorAudioUpload}
                        className="hidden"
                      />
                      <div className="flex items-center justify-between gap-1.5">
                        <span
                          className={cn(
                            'truncate text-[0.74rem] font-semibold',
                            selectedItem.audioUrl ? 'text-blue-300' : 'text-text-muted'
                          )}
                        >
                          {selectedItem.audioFileName ?? 'No audio track attached'}
                        </span>
                        <button
                          type="button"
                          onClick={() => inspectorAudioUploadRef.current?.click()}
                          className="shrink-0 rounded-md border border-subtle bg-app px-2 py-1 text-[0.72rem] font-semibold text-text-primary transition-colors hover:bg-hover"
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
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={handleToggleTimedAudio}
                                    className="inline-flex items-center gap-1 rounded-[7px] border border-accent bg-blue-500/18 px-2.5 py-[5px] text-[0.75rem] font-bold text-blue-300 transition-colors hover:bg-blue-500/28"
                                  >
                                    {displayedPlaying ? <Pause size={12} /> : <Play size={12} />}
                                    {displayedPlaying ? 'Pause' : isLiveSelected ? 'Play' : 'Play Live'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleRestartTimedAudio}
                                    disabled={!isLiveSelected}
                                    title="Restart audio"
                                    className={cn(miniIconBtnCls(false), !isLiveSelected && 'opacity-45')}
                                  >
                                    <RotateCcw size={12} />
                                  </button>
                                  <span className="ml-auto text-[0.72rem] tabular-nums text-text-muted">
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
                                  className="w-full"
                                />
                                {renderAudioVolumeControl()}
                                <button
                                  type="button"
                                  onClick={handleStampNextBlockTime}
                                  disabled={!isLiveSelected}
                                  title="Stamp current audio time onto the next line and advance"
                                  className={cn(
                                    'inline-flex items-center justify-center gap-[5px] rounded-[7px] border border-subtle bg-app px-2 py-[5px] text-[0.74rem] font-semibold text-text-primary transition-colors hover:bg-hover',
                                    !isLiveSelected && 'opacity-50'
                                  )}
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
                        className="inline-flex items-center justify-center gap-[5px] rounded-[7px] border border-purple-500/55 bg-purple-600/16 px-2.5 py-1.5 text-[0.75rem] font-bold text-purple-300 transition-colors hover:bg-purple-600/24"
                      >
                        <Clock size={12} />
                        Open Sync Studio
                      </button>
                    </div>
                  )}

                  {/* Song Text, Highlight & Dots, and Text Outline Customization */}
                  <div className="mt-1 flex flex-col gap-2.5 rounded-[10px] border border-subtle bg-panel-elevated p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[0.75rem] font-bold text-text-secondary">
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
                          className="border-0 bg-transparent p-0 text-[0.68rem] font-semibold text-text-muted hover:text-text-primary"
                        >
                          Reset
                        </button>
                      )}
                    </div>

                    {/* Text Color */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[0.74rem] font-semibold text-text-secondary">
                        Text Color
                      </span>
                      <div className="flex items-center gap-[5px]">
                        {['#ffffff', '#fde047', '#93c5fd', '#e2e8f0'].map((swatch) => (
                          <button
                            key={swatch}
                            type="button"
                            onClick={() => handleUpdateSongStyle({ songTextColor: swatch })}
                            title={swatch}
                            className={cn(
                              'h-4 w-4 rounded-full p-0',
                              (selectedItem.songTextColor || '#ffffff').toLowerCase() === swatch
                                ? 'border-2 border-accent'
                                : 'border border-white/28'
                            )}
                            style={{ background: swatch }}
                          />
                        ))}
                        <input
                          type="color"
                          aria-label="Song text color"
                          value={selectedItem.songTextColor || '#ffffff'}
                          onChange={(e) => handleUpdateSongStyle({ songTextColor: e.target.value })}
                          className="h-5 w-6 cursor-pointer rounded border border-subtle bg-transparent p-0"
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
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[0.74rem] font-semibold text-text-secondary">
                        Highlight &amp; Dots
                      </span>
                      <div className="flex items-center gap-[5px]">
                        {['#93c5fd', '#fde047', '#86efac', '#f9a8d4'].map((swatch) => (
                          <button
                            key={swatch}
                            type="button"
                            onClick={() => handleUpdateSongStyle({ songHighlightColor: swatch })}
                            title={swatch}
                            className={cn(
                              'h-4 w-4 rounded-full p-0',
                              (selectedItem.songHighlightColor || '#93c5fd').toLowerCase() === swatch
                                ? 'border-2 border-accent'
                                : 'border border-white/28'
                            )}
                            style={{ background: swatch }}
                          />
                        ))}
                        <input
                          type="color"
                          aria-label="Highlight and dots color"
                          value={selectedItem.songHighlightColor || '#93c5fd'}
                          onChange={(e) => handleUpdateSongStyle({ songHighlightColor: e.target.value })}
                          className="h-5 w-6 cursor-pointer rounded border border-subtle bg-transparent p-0"
                        />
                      </div>
                    </div>

                    {/* Text Outline */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[0.74rem] font-semibold text-text-secondary">
                          Text Outline ({selectedItem.songOutlineWidth ?? 0}px)
                        </span>
                        <input
                          type="color"
                          aria-label="Text outline color"
                          value={selectedItem.songOutlineColor || '#000000'}
                          onChange={(e) => handleUpdateSongStyle({ songOutlineColor: e.target.value })}
                          className="h-5 w-6 cursor-pointer rounded border border-subtle bg-transparent p-0"
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
                        className="w-full"
                      />
                    </div>

                    {/* Highlighted Text Outline */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[0.74rem] font-semibold text-text-secondary">
                          Highlight Outline ({selectedItem.songHighlightOutlineWidth ?? 0}px)
                        </span>
                        <input
                          type="color"
                          aria-label="Highlighted text outline color"
                          value={selectedItem.songHighlightOutlineColor || '#000000'}
                          onChange={(e) =>
                            handleUpdateSongStyle({ songHighlightOutlineColor: e.target.value })
                          }
                          className="h-5 w-6 cursor-pointer rounded border border-subtle bg-transparent p-0"
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
                        className="w-full"
                      />
                    </div>

                    {/* Background */}
                    <div className="flex flex-col gap-1.5 border-t border-subtle pt-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[0.74rem] font-semibold text-text-secondary">
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
                          className="h-5 w-6 cursor-pointer rounded border border-subtle bg-transparent p-0"
                        />
                      </div>
                      <BackgroundImagePicker
                        value={selectedItem.themeBackground}
                        onSelect={(bg) => handleUpdateSongStyle({ themeBackground: bg })}
                        compact
                      />
                      <div className="flex flex-wrap items-center gap-1.5">
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
                            className={cn(
                              'h-[22px] w-[22px] rounded-md p-0',
                              selectedItem.themeBackground === preset.value
                                ? 'border-2 border-accent'
                                : 'border border-white/22'
                            )}
                            style={{ background: preset.value }}
                          />
                        ))}
                      </div>
                      <div className="flex flex-col gap-1 pt-0.5">
                        <div className="flex justify-between text-[0.74rem] font-semibold text-text-secondary">
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
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedItem?.type === 'programItem' && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[0.78rem] font-semibold text-text-secondary">
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
                      className="w-full"
                    />
                  </div>

                  {/* Doc Text & Outline */}
                  <div className="flex flex-col gap-2.5 rounded-[10px] border border-subtle bg-panel-elevated p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[0.75rem] font-bold text-text-secondary">
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
                          className="border-0 bg-transparent p-0 text-[0.68rem] font-semibold text-text-muted hover:text-text-primary"
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
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[0.74rem] font-semibold text-text-secondary">
                          Text Outline ({selectedItem.docOutlineWidth ?? 0}px)
                        </span>
                        <input
                          type="color"
                          aria-label="Doc text outline color"
                          value={selectedItem.docOutlineColor || '#000000'}
                          onChange={(e) => handleUpdateDocStyle({ docOutlineColor: e.target.value })}
                          className="h-5 w-6 cursor-pointer rounded border border-subtle bg-transparent p-0"
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
                        className="w-full"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 border-t border-subtle pt-0.5">
                      <span className="text-[0.74rem] font-semibold text-text-secondary">
                        Bullet Style
                      </span>
                      <div className="grid grid-cols-2 gap-1.5">
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
                            className={cn(
                              'rounded-[7px] border px-1.5 py-[5px] text-[0.72rem] font-semibold transition-colors',
                              (selectedItem.docBulletStyle ?? 'accent') === opt.id
                                ? 'border-accent bg-blue-500/16'
                                : 'border-subtle bg-app hover:bg-hover'
                            )}
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
                  <div className="flex flex-col gap-2 rounded-[10px] border border-subtle bg-panel-elevated p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[0.75rem] font-bold text-text-secondary">
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
                        className="h-5 w-6 cursor-pointer rounded border border-subtle bg-transparent p-0"
                      />
                    </div>
                    <BackgroundImagePicker
                      value={selectedItem.themeBackground}
                      onSelect={(bg) => handleUpdateDocStyle({ themeBackground: bg })}
                      compact
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
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
                          className={cn(
                            'h-[22px] w-[22px] rounded-md p-0',
                            selectedItem.themeBackground === preset.value
                              ? 'border-2 border-accent'
                              : 'border border-white/22'
                          )}
                          style={{ background: preset.value }}
                        />
                      ))}
                    </div>
                    <div className="flex flex-col gap-1 pt-0.5">
                      <div className="flex justify-between text-[0.74rem] font-semibold text-text-secondary">
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
                        className="w-full"
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
          className="fixed right-[18px] bottom-[18px] z-[9998] flex max-w-[420px] items-center gap-3 rounded-[10px] border border-red-400/55 bg-red-900/95 px-3.5 py-2.5 text-[0.82rem] text-red-100 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
        >
          <span className="flex-1">{cameraError}</span>
          <button
            type="button"
            onClick={() => setCameraError(null)}
            className="cursor-pointer rounded-md border border-red-100/35 bg-transparent px-2 py-[3px] text-[0.75rem] text-red-100 hover:bg-red-800/60"
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
          className="pointer-events-none fixed top-[18px] left-1/2 z-[9999] flex w-[min(92vw,560px)] -translate-x-1/2 flex-col gap-2.5"
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
                className="operator-alert-toast pointer-events-auto flex items-center justify-between gap-3.5 rounded-[14px] border-2 border-amber-400/95 bg-[linear-gradient(135deg,rgba(120,53,15,0.97)_0%,rgba(127,29,29,0.97)_100%)] px-4 py-3.5 text-white backdrop-blur-sm"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-amber-400/60 bg-amber-400/22 text-amber-200">
                    <Bell size={20} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[0.7rem] font-extrabold uppercase tracking-[0.08em] text-amber-200">
                      Speaker Wants to Talk • {timeLabel}
                    </div>
                    <div className="truncate text-[1.02rem] font-extrabold text-white">
                      {alert.guestName}
                      {alert.centroOrPosition ? ` — ${alert.centroOrPosition}` : ''}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleMonitorParticipant(alert.guestId)}
                    className={cn(
                      'inline-flex cursor-pointer items-center gap-[5px] rounded-lg border border-sky-300/70 px-3 py-[7px] text-[0.78rem] font-bold text-white transition-colors',
                      isWhispering ? 'bg-sky-600' : 'bg-sky-500/25 hover:bg-sky-500/40'
                    )}
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
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/35 bg-black/35 px-2.5 py-[7px] text-[0.78rem] font-bold text-white transition-colors hover:bg-black/55"
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
        className={
          programPickerMode === 'bible'
            ? 'w-[min(94vw,720px)] max-w-[720px]'
            : 'w-[min(92vw,520px)] max-w-[520px]'
        }
        onClose={() => {
          if (programPickerRef.current) programPickerRef.current.returnValue = '';
          setProgramPickerOpen(false);
          setEditingItem(null);
        }}
      >
        <div
          className={cn(
            'flex max-h-[80vh] flex-col gap-3 px-5 py-[18px]',
            programPickerMode === 'bible' ? 'h-[78vh]' : 'h-auto'
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="m-0 text-base font-bold">
              {programPickerMode === 'bible'
                ? editingItem
                  ? `${t.editor.edit}: ${editingItem.title}`
                  : `Add ${t.contentTypes.verse} to ${t.workspace.program}`
                : `Add from ${t.workspace.library} to ${t.workspace.program}`}
            </h2>
            <form method="dialog" className="m-0">
              <button
                type="submit"
                value="close"
                className="rounded-[7px] border border-subtle bg-transparent px-2.5 py-[5px] text-[0.78rem] transition-colors hover:bg-hover"
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
                className="w-full rounded-lg border border-subtle bg-app px-2.5 py-[7px] text-[0.82rem] text-text-primary focus:border-accent focus:outline-none"
              />

              <div className="flex gap-1.5">
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
                    className={cn(
                      CREATE_BTN_CLS,
                      pickerFilter === f.id
                        ? 'border-accent bg-blue-500/20 text-blue-300'
                        : 'border-subtle bg-panel-elevated text-text-primary hover:bg-hover'
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
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
                      className="flex items-center justify-between gap-2.5 rounded-lg border border-subtle bg-panel-elevated px-3 py-[9px] text-left transition-colors hover:bg-hover"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="text-text-secondary">{getTypeIcon(item.type)}</span>
                        <span className="text-[0.84rem] font-semibold">{item.title}</span>
                      </div>
                      <span className="text-[0.72rem] text-text-muted">
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
        className="w-[min(90vw,400px)] max-w-[400px]"
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
        <div className="flex flex-col gap-3.5 px-[22px] py-5">
          <h2 id={confirmTitleId} className="m-0 text-base font-bold">
            {confirmDeleteItem?.target === 'program'
              ? `Remove from ${t.workspace.program}?`
              : `Delete from ${t.workspace.library}?`}
          </h2>
          <p className="m-0 text-[0.85rem] leading-[1.4] text-text-secondary">
            Are you sure you want to {confirmDeleteItem?.target === 'program' ? 'remove' : 'delete'}{' '}
            <strong>{confirmDeleteItem?.title}</strong>?
            {confirmDeleteItem?.target !== 'program' ? ' This cannot be undone.' : ''}
          </p>
          <form method="dialog" className="m-0 flex justify-end gap-2">
            <button
              type="submit"
              value="cancel"
              autoFocus
              className="rounded-lg border border-subtle bg-panel-elevated px-3.5 py-[7px] text-[0.82rem] font-semibold transition-colors hover:bg-hover"
            >
              {t.editor.cancel}
            </button>
            <button
              type="submit"
              value="delete"
              className="rounded-lg border-0 bg-red-600 px-3.5 py-[7px] text-[0.82rem] font-bold text-white transition-colors hover:bg-red-500"
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
        className="w-[min(90vw,420px)] max-w-[420px]"
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
        <div className="flex flex-col gap-3.5 px-[22px] py-5">
          <h2 id={switchLiveTitleId} className="m-0 text-base font-bold">
            Switch Live Item?
          </h2>
          <p className="m-0 text-[0.85rem] leading-[1.45] text-text-secondary">
            <strong>{liveTimedAudioItem?.title ?? 'Current song'}</strong> is currently playing.
            Switching to <strong>{pendingLiveSwitch?.targetTitle}</strong> will stop the current song.
          </p>
          <form method="dialog" className="m-0 flex justify-end gap-2">
            <button
              type="submit"
              value="cancel"
              autoFocus
              className="rounded-lg border border-subtle bg-panel-elevated px-3.5 py-[7px] text-[0.82rem] font-semibold transition-colors hover:bg-hover"
            >
              Keep Playing
            </button>
            <button
              type="submit"
              value="confirm"
              className="rounded-lg border-0 bg-accent px-3.5 py-[7px] text-[0.82rem] font-bold text-white transition-colors hover:bg-accent-hover"
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
        className="w-[min(92vw,450px)] max-w-[450px]"
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
        <div className="flex flex-col gap-3.5 px-6 py-[22px]">
          <input
            ref={bibleStartupFileInputRef}
            type="file"
            accept=".xml,text/xml,application/xml"
            multiple
            onChange={handleStartupBibleFileChange}
            className="hidden"
          />
          {bibleImportPromptStep === 'prompt' ? (
            <>
              <div className="flex items-center gap-2.5">
                <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-blue-500/35 bg-blue-500/16 text-blue-400">
                  <BookOpen size={18} />
                </div>
                <h2 id={bibleImportPromptTitleId} className="m-0 text-[1.05rem] font-bold">
                  No Bibles Imported Yet
                </h2>
              </div>
              <p className="m-0 text-[0.86rem] leading-normal text-text-secondary">
                You don&apos;t have any Bible XML files imported yet. Would you like to start importing a Bible now?
              </p>
              {bibleStartupImportError && (
                <div className="rounded-lg border border-red-500/35 bg-red-600/14 px-2.5 py-2 text-[0.78rem] text-red-300">
                  {bibleStartupImportError}
                </div>
              )}
              <label className="inline-flex select-none items-center gap-2 text-[0.82rem] text-text-secondary">
                <input
                  type="checkbox"
                  checked={dontShowBiblePromptAgain}
                  onChange={(e) => setDontShowBiblePromptAgain(e.target.checked)}
                />
                <span>Don&apos;t show this again</span>
              </label>
              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={bibleStartupImporting}
                  onClick={handleDeferBibleImport}
                  className="rounded-lg border border-subtle bg-panel-elevated px-3.5 py-2 text-[0.82rem] font-semibold transition-colors hover:bg-hover"
                >
                  Remind Me Later
                </button>
                <button
                  type="button"
                  autoFocus
                  disabled={bibleStartupImporting}
                  onClick={() => bibleStartupFileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border-0 bg-accent px-3.5 py-2 text-[0.82rem] font-bold text-white transition-colors hover:bg-accent-hover"
                >
                  <Upload size={14} />
                  {bibleStartupImporting ? 'Importing…' : 'Start Importing'}
                </button>
              </div>
            </>
          ) : bibleImportPromptStep === 'success' ? (
            <>
              <div className="flex items-center gap-2.5">
                <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-green-500/35 bg-green-500/14 text-green-400">
                  <Check size={18} />
                </div>
                <h2 id={bibleImportPromptTitleId} className="m-0 text-[1.05rem] font-bold">
                  Bible Imported Successfully
                </h2>
              </div>
              <p className="m-0 text-[0.86rem] leading-[1.55] text-text-secondary">
                Imported{' '}
                <strong>{bibleStartupImportedTitles.join(', ')}</strong>. You can start browsing verses right away or import another Bible XML.
              </p>
              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={bibleStartupImporting}
                  onClick={() => bibleStartupFileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-subtle bg-panel-elevated px-3.5 py-2 text-[0.82rem] font-semibold transition-colors hover:bg-hover"
                >
                  <Upload size={14} />
                  Import Another
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => setBibleImportPromptStep('closed')}
                  className="rounded-lg border-0 bg-accent px-4 py-2 text-[0.82rem] font-bold text-white transition-colors hover:bg-accent-hover"
                >
                  Done
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2.5">
                <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-green-500/35 bg-green-500/14 text-green-400">
                  <Settings2 size={18} />
                </div>
                <h2 id={bibleImportPromptTitleId} className="m-0 text-[1.05rem] font-bold">
                  Import Anytime Later
                </h2>
              </div>
              <p className="m-0 text-[0.86rem] leading-[1.55] text-text-secondary">
                No problem! Whenever you&apos;re ready, open the <strong>{t.workspace.bible}</strong> tab in the left panel, click the{' '}
                <strong>Settings</strong> (gear) button, and choose <strong>{t.bible.importXml}</strong>.
              </p>
              <p className="m-0 text-[0.8rem] leading-[1.45] text-text-muted">
                {dontShowBiblePromptAgain
                  ? "We won't show this reminder again on startup."
                  : "We'll remind you again next time you launch the app."}
              </p>
              <div className="mt-1 flex justify-end">
                <button
                  type="button"
                  autoFocus
                  onClick={() => setBibleImportPromptStep('closed')}
                  className="rounded-lg border-0 bg-accent px-4 py-2 text-[0.82rem] font-bold text-white transition-colors hover:bg-accent-hover"
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

const POPUP_MENU_CLS =
  'absolute top-[calc(100%+4px)] right-0 z-40 flex min-w-[150px] flex-col gap-0.5 rounded-lg border border-subtle bg-panel p-1 shadow-[0_10px_28px_rgba(0,0,0,0.55)]';

const MENU_ITEM_BTN_CLS =
  'flex items-center gap-[7px] whitespace-nowrap rounded-md border-0 bg-transparent px-[9px] py-1.5 text-left text-[0.76rem] font-semibold text-text-primary transition-colors hover:bg-hover';

const CREATE_BTN_CLS =
  'inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-subtle bg-panel-elevated px-1.5 py-[5px] text-[0.73rem] font-semibold transition-colors';

function miniIconBtnCls(disabled: boolean): string {
  return cn(
    'inline-flex rounded-[5px] border border-subtle bg-transparent p-1 transition-colors hover:bg-hover',
    disabled && 'opacity-35'
  );
}

const COL_DIVIDER_CLS = 'w-[5px] cursor-col-resize bg-subtle';

const PANEL_HEADER_CLS =
  'flex items-center justify-between border-b border-subtle bg-panel px-3 py-2.5 text-[0.8rem] font-bold text-text-secondary';

function toolbarBtnCls(active: boolean, tone: 'blue' | 'amber' | 'red' = 'blue'): string {
  return cn(
    'inline-flex items-center gap-1.5 rounded-lg border px-[11px] py-1.5 text-[0.8rem] font-semibold transition-colors',
    !active && 'border-subtle bg-panel-elevated hover:bg-hover',
    active && tone === 'blue' && 'border-blue-500 bg-blue-500/15',
    active && tone === 'amber' && 'border-amber-500 bg-amber-500/15',
    active && tone === 'red' && 'border-red-500 bg-red-500/15'
  );
}
