import type { Program, ProgramItem } from '../../shared/types';
import { INITIAL_PROGRAM, SAMPLE_LIBRARY_ITEMS } from '../data/sampleData';

const DB_NAME = 'uecfi_presenter_app_db';
const STORE_NAME = 'state';
const DB_VERSION = 3;

export type ProgramEntry =
  | { kind: 'ref'; itemId: string }
  | { kind: 'slide'; item: ProgramItem }
  | { kind: 'verse'; item: ProgramItem };

export interface PersistedProgramRef {
  id: string;
  name: string;
  date: string;
  entries: ProgramEntry[];
}

export interface PersistedAppState {
  id: 'main';
  programs: PersistedProgramRef[];
  activeProgramId: string;
  library: ProgramItem[];
  logoSlide?: ProgramItem | null;
}

function openAppDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function defaultState(): PersistedAppState {
  const libOnly = SAMPLE_LIBRARY_ITEMS.filter((it) => it.type !== 'slide');
  const entries: ProgramEntry[] = INITIAL_PROGRAM.items.map((it) =>
    it.type === 'slide'
      ? { kind: 'slide', item: { ...it, id: `prog-slide-${Date.now()}` } }
      : { kind: 'ref', itemId: it.sourceId ?? it.id }
  );

  return {
    id: 'main',
    programs: [
      {
        id: INITIAL_PROGRAM.id,
        name: INITIAL_PROGRAM.name,
        date: INITIAL_PROGRAM.date,
        entries
      }
    ],
    activeProgramId: INITIAL_PROGRAM.id,
    library: libOnly
  };
}

export async function loadAppState(): Promise<PersistedAppState> {
  try {
    const db = await openAppDb();
    const raw = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get('main');
      req.onsuccess = () => resolve(req.result as Record<string, unknown> | undefined);
      req.onerror = () => reject(req.error);
    });

    if (raw && Array.isArray(raw.programs) && raw.programs.length > 0 && Array.isArray(raw.library)) {
      const allLib = raw.library as ProgramItem[];
      const libById = new Map(allLib.map((it) => [it.id, it]));
      const cleanLibrary = allLib.filter((it) => it.type !== 'slide');

      const programs: PersistedProgramRef[] = (raw.programs as Array<Record<string, unknown>>).map((p) => {
        if (Array.isArray(p.entries)) {
          return p as unknown as PersistedProgramRef;
        }
        if (Array.isArray(p.itemIds)) {
          const entries: ProgramEntry[] = (p.itemIds as string[])
            .map((id) => {
              const found = libById.get(id);
              if (found && found.type === 'slide') {
                return { kind: 'slide' as const, item: found };
              }
              return { kind: 'ref' as const, itemId: id };
            });
          return {
            id: String(p.id),
            name: String(p.name),
            date: String(p.date),
            entries
          };
        }
        const legacyItems = (p.items as ProgramItem[] | undefined) ?? [];
        const entries: ProgramEntry[] = legacyItems.map((it) => {
          if (it.type === 'slide') {
            return { kind: 'slide', item: it };
          }
          const targetId = it.sourceId ?? it.id;
          if (!cleanLibrary.some((libIt) => libIt.id === targetId)) {
            cleanLibrary.push({ ...it, id: targetId, sourceId: undefined });
          }
          return { kind: 'ref', itemId: targetId };
        });
        return {
          id: String(p.id),
          name: String(p.name),
          date: String(p.date),
          entries
        };
      });

      return {
        id: 'main',
        programs,
        activeProgramId: String(raw.activeProgramId || programs[0].id),
        library: cleanLibrary,
        logoSlide: (raw.logoSlide as ProgramItem | null | undefined) ?? null
      };
    }
  } catch {
    // Fall back to defaults
  }

  return defaultState();
}

export async function saveAppState(state: Omit<PersistedAppState, 'id'>): Promise<void> {
  try {
    const db = await openAppDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({ id: 'main', ...state });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Ignore storage errors gracefully
  }
}

export function hydrateProgram(ref: PersistedProgramRef, library: ProgramItem[]): Program {
  const byId = new Map(library.map((it) => [it.id, it]));
  const items: ProgramItem[] = [];
  for (const entry of ref.entries) {
    if (entry.kind === 'slide' || entry.kind === 'verse') {
      items.push(entry.item);
    } else {
      const found = byId.get(entry.itemId);
      if (found) items.push(found);
    }
  }
  return {
    id: ref.id,
    name: ref.name,
    date: ref.date,
    items
  };
}
