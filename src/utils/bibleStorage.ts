import type { BibleVersion } from '../../shared/types';

const DB_NAME = 'uecfi_presenter_db';
const STORE_NAME = 'bibles';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Omit version so existing higher-version DBs (e.g. v2) open without VersionError.
    const req = indexedDB.open(DB_NAME);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      if (db.objectStoreNames.contains(STORE_NAME)) {
        resolve(db);
        return;
      }
      // Self-heal if an older/existing DB version lacked the 'bibles' object store.
      const nextVersion = db.version + 1;
      db.close();
      const upgradeReq = indexedDB.open(DB_NAME, nextVersion);
      upgradeReq.onupgradeneeded = () => {
        const upgradedDb = upgradeReq.result;
        if (!upgradedDb.objectStoreNames.contains(STORE_NAME)) {
          upgradedDb.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      upgradeReq.onsuccess = () => resolve(upgradeReq.result);
      upgradeReq.onerror = () => reject(upgradeReq.error);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function loadImportedBibles(): Promise<BibleVersion[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as BibleVersion[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function saveImportedBible(bible: BibleVersion): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(bible);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deleteImportedBible(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
