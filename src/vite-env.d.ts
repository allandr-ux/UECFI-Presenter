/// <reference types="vite/client" />
import type {
  DisplayInfo,
  LiveState,
  OperatorChatMessage,
  ParticipantSignalMessage,
  ProgramItem,
  RemoteCommandMessage,
  RemoteConnectionInfo,
  WhitelistedDevice
} from '../shared/types';

export interface PresenterAPI {
  isElectron: boolean;
  getDisplays: () => Promise<DisplayInfo[]>;
  openMainScreen: (displayId?: number) => Promise<boolean>;
  closeMainScreen: () => Promise<boolean>;
  isMainScreenOpen: () => Promise<boolean>;
  openOverflowScreen: (displayId?: number) => Promise<boolean>;
  closeOverflowScreen: () => Promise<boolean>;
  isOverflowScreenOpen: () => Promise<boolean>;
  updateLiveState: (state: LiveState) => void;
  updateProgramSyncBundle: (bundle: {
    programId: string;
    programName: string;
    items: ProgramItem[];
    logoSlide: ProgramItem | null;
  }) => void;
  updateBibleSyncBundle: (bundle: {
    primaryBible: import('../shared/types').BibleVersion | null;
    secondaryBible: import('../shared/types').BibleVersion | null;
    verseStyle?: Partial<ProgramItem>;
  }) => void;
  updateAudioTime: (payload: { timeSec?: number; activeBlockIndex: number }) => void;
  getInitialLiveState: () => Promise<LiveState | null>;
  onLiveStateUpdate: (callback: (state: LiveState) => void) => () => void;
  onAudioTimeUpdate: (
    callback: (payload: { timeSec?: number; activeBlockIndex: number }) => void
  ) => () => void;
  getRemoteInfo: () => Promise<RemoteConnectionInfo>;
  regenerateRemotePin: () => Promise<RemoteConnectionInfo>;
  getWhitelistedDevices: () => Promise<WhitelistedDevice[]>;
  revokeWhitelistedDevice: (deviceId: string) => Promise<WhitelistedDevice[]>;
  onWhitelistChange: (callback: (devices: WhitelistedDevice[]) => void) => () => void;
  saveMediaFile: (name: string, data: Uint8Array) => Promise<{ fileName: string; url: string }>;
  listMediaImages: () => Promise<Array<{ fileName: string; url: string; mtimeMs: number }>>;
  deleteMediaFile: (fileName: string) => Promise<boolean>;
  getSecret: (key: string) => Promise<string | null>;
  setSecret: (key: string, value: string | null) => Promise<boolean>;
  onRemoteClientCount: (callback: (count: number) => void) => () => void;
  onRemoteCommand: (callback: (cmd: RemoteCommandMessage) => void) => () => void;
  sendParticipantSignal: (msg: ParticipantSignalMessage) => void;
  onParticipantSignal: (callback: (msg: ParticipantSignalMessage) => void) => () => void;
  getChatHistory: () => Promise<OperatorChatMessage[]>;
  sendChatMessage: (text: string) => void;
  onChatMessage: (callback: (msg: OperatorChatMessage) => void) => () => void;
}

declare global {
  interface Window {
    presenterAPI?: PresenterAPI;
  }
}
