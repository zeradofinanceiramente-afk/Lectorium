
import { openDB } from "idb";
import { Annotation, DriveFile, SyncQueueItem } from "../types";

export const APP_VERSION = '1.3.1'; 
const BLOB_CACHE_LIMIT = 500 * 1024 * 1024;

interface OfflineRecord extends DriveFile {
    blob: Blob;
    storedAt: number;
    lastAccessed: number;
    pinned: boolean;
}

interface OcrRecord {
    id: string; // fileId-page
    fileId: string;
    page: number;
    words: any[];
    updatedAt: number;
}

const dbPromise = openDB("pwa-drive-annotator", 12, {
  upgrade(db, oldVersion) {
    if (!db.objectStoreNames.contains("annotations")) {
      const store = db.createObjectStore("annotations", { keyPath: "id" });
      store.createIndex("fileId", "fileId", { unique: false });
    }
    if (!db.objectStoreNames.contains("recentFiles")) {
      const store = db.createObjectStore("recentFiles", { keyPath: "id" });
      store.createIndex("lastOpened", "lastOpened");
    }
    if (!db.objectStoreNames.contains("offlineFiles")) {
      const store = db.createObjectStore("offlineFiles", { keyPath: "id" });
      store.createIndex("lastAccessed", "lastAccessed");
      store.createIndex("pinned", "pinned");
    }
    if (!db.objectStoreNames.contains("syncQueue")) {
      const store = db.createObjectStore("syncQueue", { keyPath: "id" });
      store.createIndex("createdAt", "createdAt");
    }
    if (!db.objectStoreNames.contains("documentCache")) {
      db.createObjectStore("documentCache", { keyPath: "id" });
    }
    if (!db.objectStoreNames.contains("active_locks")) {
      db.createObjectStore("active_locks", { keyPath: "id" });
    }
    if (!db.objectStoreNames.contains("ocrCache")) {
      const store = db.createObjectStore("ocrCache", { keyPath: "id" });
      store.createIndex("fileId", "fileId", { unique: false });
    }
    // New Settings Store for persisting folder handles
    if (!db.objectStoreNames.contains("settings")) {
      db.createObjectStore("settings");
    }
  }
});

export async function saveLocalDirectoryHandle(handle: any): Promise<void> {
  const idb = await dbPromise;
  await idb.put("settings", handle, "last_local_dir");
}

export async function getLocalDirectoryHandle(): Promise<any | undefined> {
  const idb = await dbPromise;
  return await idb.get("settings", "last_local_dir");
}

export async function acquireFileLock(fileId: string): Promise<boolean> {
  const idb = await dbPromise;
  const LOCK_TIMEOUT = 60 * 1000;
  
  const tx = idb.transaction("active_locks", "readwrite");
  const store = tx.objectStore("active_locks");
  const existing = await store.get(fileId);

  if (existing && (Date.now() - existing.timestamp < LOCK_TIMEOUT)) {
    return false;
  }
  
  await store.put({ id: fileId, timestamp: Date.now() });
  await tx.done;
  return true;
}

export async function releaseFileLock(fileId: string): Promise<void> {
  const idb = await dbPromise;
  await idb.delete("active_locks", fileId);
}

export async function runJanitor(): Promise<void> {
  try {
    const idb = await dbPromise;
    const estimate = await navigator.storage.estimate();
    const currentUsage = (estimate as any).usageDetails?.indexedDB || 0;

    if (currentUsage < BLOB_CACHE_LIMIT) return;

    const tx = idb.transaction(["offlineFiles", "ocrCache"], "readwrite");
    const offlineStore = tx.objectStore("offlineFiles");
    const ocrStore = tx.objectStore("ocrCache");
    const index = offlineStore.index("lastAccessed");
    
    let cursor = await index.openCursor();
    let deletedBytes = 0;
    const targetToDelete = currentUsage - (BLOB_CACHE_LIMIT * 0.7); 

    while (cursor && deletedBytes < targetToDelete) {
      const file: OfflineRecord = cursor.value;
      if (!file.pinned) {
        deletedBytes += (file.blob?.size || 0);
        
        const ocrIndex = ocrStore.index("fileId");
        let ocrCursor = await ocrIndex.openCursor(IDBKeyRange.only(file.id));
        while (ocrCursor) {
            await ocrCursor.delete();
            ocrCursor = await ocrCursor.continue();
        }

        await cursor.delete();
      }
      cursor = await cursor.continue();
    }
    await tx.done;
  } catch (e) {
    console.warn("Janitor error:", e);
  }
}

export async function saveOfflineFile(file: DriveFile, blob: Blob, pinned: boolean = false): Promise<void> {
  const idb = await dbPromise;
  const { blob: _, ...metadata } = file;
  await idb.put("offlineFiles", { 
    ...metadata,
    id: file.id, 
    blob, 
    storedAt: Date.now(),
    lastAccessed: Date.now(),
    pinned: pinned || !!file.pinned
  });
}

export async function touchOfflineFile(fileId: string): Promise<void> {
  const idb = await dbPromise;
  const record: OfflineRecord | undefined = await idb.get("offlineFiles", fileId);
  if (record) {
    record.lastAccessed = Date.now();
    await idb.put("offlineFiles", record);
  }
}

export async function getOfflineFile(fileId: string): Promise<Blob | undefined> {
  const idb = await dbPromise;
  const record: OfflineRecord | undefined = await idb.get("offlineFiles", fileId);
  if (record) {
    record.lastAccessed = Date.now();
    idb.put("offlineFiles", record);
    return record.blob;
  }
  return undefined;
}

export async function toggleFilePin(fileId: string, pinned: boolean): Promise<void> {
  const idb = await dbPromise;
  const record: OfflineRecord | undefined = await idb.get("offlineFiles", fileId);
  if (record) {
    record.pinned = pinned;
    await idb.put("offlineFiles", record);
  }
}

export async function isFilePinned(fileId: string): Promise<boolean> {
  const idb = await dbPromise;
  const record: OfflineRecord | undefined = await idb.get("offlineFiles", fileId);
  return !!record?.pinned;
}

export async function addRecentFile(file: DriveFile): Promise<void> {
  const idb = await dbPromise;
  await idb.put("recentFiles", { ...file, lastOpened: new Date() });
}

export async function getRecentFiles(): Promise<(DriveFile & { lastOpened: Date })[]> {
  const idb = await dbPromise;
  const files = await idb.getAll("recentFiles");
  return files.sort((a, b) => (b.lastOpened as any) - (a.lastOpened as any));
}

export async function saveAnnotation(uid: string, fileId: string, ann: Annotation): Promise<Annotation> {
  const idb = await dbPromise;
  const finalId = ann.id || `ann-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const annotationToSave = { ...ann, id: finalId, fileId: fileId, userId: uid, updatedAt: new Date().toISOString() };
  await idb.put("annotations", annotationToSave);
  return annotationToSave;
}

export async function loadAnnotations(uid: string, fileId: string): Promise<Annotation[]> {
  const idb = await dbPromise;
  return await idb.getAllFromIndex("annotations", "fileId", fileId);
}

export async function deleteAnnotation(id: string): Promise<void> {
  const idb = await dbPromise;
  await idb.delete("annotations", id);
}

export async function listOfflineFiles(): Promise<DriveFile[]> {
  const idb = await dbPromise;
  return await idb.getAll("offlineFiles");
}

export async function deleteOfflineFile(fileId: string): Promise<void> {
  const idb = await dbPromise;
  await idb.delete("offlineFiles", fileId);
  await idb.delete("documentCache", fileId);
  
  const tx = idb.transaction("ocrCache", "readwrite");
  const index = tx.objectStore("ocrCache").index("fileId");
  let cursor = await index.openCursor(IDBKeyRange.only(fileId));
  while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
  }
  await tx.done;
}

export async function isFileOffline(fileId: string): Promise<boolean> {
  const idb = await dbPromise;
  const record = await idb.get("offlineFiles", fileId);
  return !!record;
}

export async function cacheDocumentData(id: string, data: any): Promise<void> {
  const idb = await dbPromise;
  await idb.put("documentCache", { id, ...data, cachedAt: Date.now() });
}

export async function getCachedDocumentData(id: string): Promise<any | undefined> {
  const idb = await dbPromise;
  return await idb.get("documentCache", id);
}

// Fixed: Added return statement to getSyncQueue function to match its declared return type.
export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const idb = await dbPromise;
  return await idb.getAll("syncQueue");
}

export async function removeSyncQueueItem(id: string): Promise<void> {
  const idb = await dbPromise;
  await idb.delete("syncQueue", id);
}

export async function addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'createdAt'>): Promise<void> {
    const idb = await dbPromise;
    await idb.put("syncQueue", { ...item, createdAt: Date.now(), id: `sync-${Date.now()}` });
}

export async function saveOcrData(fileId: string, page: number, words: any[]): Promise<void> {
    const idb = await dbPromise;
    await idb.put("ocrCache", {
        id: `${fileId}-${page}`,
        fileId,
        page,
        words,
        updatedAt: Date.now()
    });
}

export async function loadOcrData(fileId: string): Promise<Record<number, any[]>> {
    const idb = await dbPromise;
    const records: OcrRecord[] = await idb.getAllFromIndex("ocrCache", "fileId", fileId);
    
    const map: Record<number, any[]> = {};
    records.forEach(rec => {
        map[rec.page] = rec.words;
    });
    return map;
}

export async function clearAppStorage(): Promise<void> {
  const idb = await dbPromise;
  const stores = Array.from(idb.objectStoreNames);
  const tx = idb.transaction(stores, "readwrite");
  for (const name of stores) {
    await tx.objectStore(name).clear();
  }
  await tx.done;
  localStorage.clear();
  window.location.reload();
}

export interface StorageBreakdown {
  usage: number;
  quota: number;
  details: { offlineFiles: number; cache: number; system: number; }
}

export async function getStorageEstimate(): Promise<StorageBreakdown | null> {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  const estimate = await navigator.storage.estimate();
  const details = (estimate as any).usageDetails || {};
  return {
    usage: estimate.usage || 0,
    quota: estimate.quota || 0,
    details: {
      offlineFiles: details.indexedDB || 0,
      cache: details.caches || 0,
      system: (estimate.usage || 0) - (details.indexedDB || 0) - (details.caches || 0)
    }
  };
}

export async function performAppUpdateCleanup(): Promise<boolean> {
  const storedVersion = localStorage.getItem('app_version');
  if (storedVersion !== APP_VERSION) {
    localStorage.setItem('app_version', APP_VERSION);
    return true;
  }
  return false;
}
