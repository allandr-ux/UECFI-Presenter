import { contextBridge, ipcRenderer } from 'electron';
import type {
  DisplayInfo,
  LiveState,
  ParticipantSignalMessage,
  ProgramItem,
  RemoteCommandMessage,
  RemoteConnectionInfo,
  WhitelistedDevice
} from '../shared/types';

contextBridge.exposeInMainWorld('presenterAPI', {
  isElectron: true,
  getDisplays: (): Promise<DisplayInfo[]> => ipcRenderer.invoke('displays:list'),
  openMainScreen: (displayId?: number): Promise<boolean> =>
    ipcRenderer.invoke('mainScreen:open', displayId),
  closeMainScreen: (): Promise<boolean> => ipcRenderer.invoke('mainScreen:close'),
  isMainScreenOpen: (): Promise<boolean> => ipcRenderer.invoke('mainScreen:isOpen'),
  openOverflowScreen: (displayId?: number): Promise<boolean> =>
    ipcRenderer.invoke('overflowScreen:open', displayId),
  closeOverflowScreen: (): Promise<boolean> => ipcRenderer.invoke('overflowScreen:close'),
  isOverflowScreenOpen: (): Promise<boolean> => ipcRenderer.invoke('overflowScreen:isOpen'),
  updateLiveState: (state: LiveState): void => {
    ipcRenderer.send('liveState:update', state);
  },
  updateProgramSyncBundle: (bundle: {
    programId: string;
    programName: string;
    items: ProgramItem[];
    logoSlide: ProgramItem | null;
  }): void => {
    ipcRenderer.send('programSync:update', bundle);
  },
  updateAudioTime: (payload: { timeSec?: number; activeBlockIndex: number }): void => {
    ipcRenderer.send('liveState:audioTime', payload);
  },
  getInitialLiveState: (): Promise<LiveState | null> =>
    ipcRenderer.invoke('liveState:get'),
  onLiveStateUpdate: (callback: (state: LiveState) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: LiveState) => callback(state);
    ipcRenderer.on('liveState:sync', handler);
    return () => ipcRenderer.removeListener('liveState:sync', handler);
  },
  onAudioTimeUpdate: (
    callback: (payload: { timeSec?: number; activeBlockIndex: number }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { timeSec?: number; activeBlockIndex: number }
    ) => callback(payload);
    ipcRenderer.on('liveState:audioTimeSync', handler);
    return () => ipcRenderer.removeListener('liveState:audioTimeSync', handler);
  },
  getRemoteInfo: (): Promise<RemoteConnectionInfo> =>
    ipcRenderer.invoke('remote:info'),
  regenerateRemotePin: (): Promise<RemoteConnectionInfo> =>
    ipcRenderer.invoke('remote:regeneratePin'),
  getWhitelistedDevices: (): Promise<WhitelistedDevice[]> =>
    ipcRenderer.invoke('remote:whitelist'),
  revokeWhitelistedDevice: (deviceId: string): Promise<WhitelistedDevice[]> =>
    ipcRenderer.invoke('remote:revokeDevice', deviceId),
  onWhitelistChange: (callback: (devices: WhitelistedDevice[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, devices: WhitelistedDevice[]) =>
      callback(devices);
    ipcRenderer.on('remote:whitelistChanged', handler);
    return () => ipcRenderer.removeListener('remote:whitelistChanged', handler);
  },
  saveMediaFile: (name: string, data: Uint8Array): Promise<{ fileName: string; url: string }> =>
    ipcRenderer.invoke('media:save', { name, data }),
  listMediaImages: (): Promise<Array<{ fileName: string; url: string; mtimeMs: number }>> =>
    ipcRenderer.invoke('media:listImages'),
  deleteMediaFile: (fileName: string): Promise<boolean> =>
    ipcRenderer.invoke('media:delete', fileName),
  getSecret: (key: string): Promise<string | null> =>
    ipcRenderer.invoke('secrets:get', key),
  setSecret: (key: string, value: string | null): Promise<boolean> =>
    ipcRenderer.invoke('secrets:set', { key, value }),
  onRemoteClientCount: (callback: (count: number) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, count: number) => callback(count);
    ipcRenderer.on('remote:clientCount', handler);
    return () => ipcRenderer.removeListener('remote:clientCount', handler);
  },
  onRemoteCommand: (callback: (cmd: RemoteCommandMessage) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, cmd: RemoteCommandMessage) =>
      callback(cmd);
    ipcRenderer.on('remote:command', handler);
    return () => ipcRenderer.removeListener('remote:command', handler);
  },
  sendParticipantSignal: (msg: ParticipantSignalMessage): void => {
    ipcRenderer.send('participants:signal', msg);
  },
  onParticipantSignal: (callback: (msg: ParticipantSignalMessage) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, msg: ParticipantSignalMessage) =>
      callback(msg);
    ipcRenderer.on('participants:signal', handler);
    return () => ipcRenderer.removeListener('participants:signal', handler);
  }
});
