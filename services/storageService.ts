
import { openDB } from "idb";
import { Annotation, DriveFile, SyncQueueItem, AuditRecord, VectorIndex } from "../types";

export const APP_VERSION = '1.3.1'; 
const BLOB_CACHE_LIMIT = 500 * 1024 * 1024;

interface OfflineRecord extends DriveFile {
    blob?: Blob; // Blob agora é opcional (pastas não têm blob)
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

export interface DocVersion {
  id: string;
  fileId: string;
  timestamp: number;
  author: string;
  content: any; // Tiptap JSON
  name?: string; // "Manual Save", "Auto-save", etc.
}

// Upgrade to version 16 for document_versions
const dbPromise = openDB("pwa-drive-annotator", 16, {
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
    if (!db.objectStoreNames.contains("settings")) {
      db.createObjectStore("settings");
    }
    if (!db.objectStoreNames.contains("audit_log")) {
      db.createObjectStore("audit_log", { keyPath: "fileId" });
    }
    // Vector Store for Semantic Search (RAG)
    if (!db.objectStoreNames.contains("vector_store")) {
      db.createObjectStore("vector_store", { keyPath: "fileId" });
    }
    // Version History Store
    if (!db.objectStoreNames.contains("document_versions")) {
      const store = db.createObjectStore("document_versions", { keyPath: "id" });
      store.createIndex("fileId", "fileId", { unique: false });
      store.createIndex("timestamp", "timestamp", { unique: false });
    }
  }
});

// --- VERSION HISTORY METHODS ---

export async function saveDocVersion(fileId: string, content: any, author: string, name: string = "Salvamento Automático"): Promise<void> {
  const idb = await dbPromise;
  
  // Limite de versões por arquivo (ex: manter as últimas 50)
  const MAX_VERSIONS = 50;
  
  const version: DocVersion = {
    id: `ver-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    fileId,
    timestamp: Date.now(),
    author,
    content,
    name
  };

  await idb.put("document_versions", version);

  // Limpeza de versões antigas
  const index = idb.transaction("document_versions").store.index("fileId");
  let versions = await index.getAll(fileId);
  if (versions.length > MAX_VERSIONS) {
    versions.sort((a, b) => a.timestamp - b.timestamp); // Mais antigas primeiro
    const toDelete = versions.slice(0, versions.length - MAX_VERSIONS);
    const tx = idb.transaction("document_versions", "readwrite");
    for (const v of toDelete) {
      await tx.store.delete(v.id);
    }
    await tx.done;
  }
}

export async function getDocVersions(fileId: string): Promise<DocVersion[]> {
  const idb = await dbPromise;
  const versions = await idb.getAllFromIndex("document_versions", "fileId", fileId);
  // Retorna do mais recente para o mais antigo
  return versions.sort((a, b) => b.timestamp - a.timestamp);
}

// --- RAG / VECTOR METHODS ---

export async function saveVectorIndex(index: VectorIndex): Promise<void> {
  const idb = await dbPromise;
  await idb.put("vector_store", index);
}

export async function getVectorIndex(fileId: string): Promise<VectorIndex | undefined> {
  const idb = await dbPromise;
  return await idb.get("vector_store", fileId);
}

export async function deleteVectorIndex(fileId: string): Promise<void> {
  const idb = await dbPromise;
  await idb.delete("vector_store", fileId);
}

// --- AUDIT LOG METHODS ---

export async function saveAuditRecord(fileId: string, contentHash: string, annotationCount: number): Promise<void> {
  const idb = await dbPromise;
  const record: AuditRecord = {
    fileId,
    contentHash,
    lastModified: Date.now(),
    annotationCount
  };
  await idb.put("audit_log", record);
}

export async function getAuditRecord(fileId: string): Promise<AuditRecord | undefined> {
  const idb = await dbPromise;
  return await idb.get("audit_log", fileId);
}

// --- EXISTING METHODS ---

export async function saveWallpaper(orientation: 'landscape' | 'portrait', blob: Blob): Promise<void> {
  const idb = await dbPromise;
  await idb.put("settings", blob, `wallpaper_${orientation}`);
}

export async function getWallpaper(orientation: 'landscape' | 'portrait'): Promise<Blob | undefined> {
  const idb = await dbPromise;
  return await idb.get("settings", `wallpaper_${orientation}`);
}

export async function removeWallpaper(orientation: 'landscape' | 'portrait'): Promise<void> {
  const idb = await dbPromise;
  await idb.delete("settings", `wallpaper_${orientation}`);
}

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

    const tx = idb.transaction(["offlineFiles", "ocrCache", "vector_store", "document_versions"], "readwrite");
    const offlineStore = tx.objectStore("offlineFiles");
    const ocrStore = tx.objectStore("ocrCache");
    const vectorStore = tx.objectStore("vector_store");
    const versionStore = tx.objectStore("document_versions");
    
    const index = offlineStore.index("lastAccessed");
    
    let cursor = await index.openCursor();
    let deletedBytes = 0;
    const targetToDelete = currentUsage - (BLOB_CACHE_LIMIT * 0.7); 

    while (cursor && deletedBytes < targetToDelete) {
      const file: OfflineRecord = cursor.value;
      if (!file.pinned) {
        deletedBytes += (file.blob?.size || 0);
        
        // Limpa OCR
        const ocrIndex = ocrStore.index("fileId");
        let ocrCursor = await ocrIndex.openCursor(IDBKeyRange.only(file.id));
        while (ocrCursor) {
            await ocrCursor.delete();
            ocrCursor = await ocrCursor.continue();
        }

        // Limpa Vetores
        await vectorStore.delete(file.id);

        // Limpa Histórico de Versões
        const verIndex = versionStore.index("fileId");
        let verCursor = await verIndex.openCursor(IDBKeyRange.only(file.id));
        while (verCursor) {
            await verCursor.delete();
            verCursor = await verCursor.continue();
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

export async function saveOfflineFile(file: DriveFile, blob: Blob | null, pinned: boolean = false): Promise<void> {
  const idb = await dbPromise;
  const { blob: _, ...metadata } = file;
  
  const record: OfflineRecord = { 
    ...metadata,
    id: file.id, 
    storedAt: Date.now(),
    lastAccessed: Date.now(),
    pinned: pinned || !!file.pinned
  };

  if (blob) {
      record.blob = blob;
  }

  await idb.put("offlineFiles", record);
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
  await idb.delete("audit_log", fileId); // Clean up audit log
  await idb.delete("vector_store", fileId); // Clean up vectors
  
  // Limpa Histórico de Versões
  const tx = idb.transaction("document_versions", "readwrite");
  const verIndex = tx.objectStore("document_versions").index("fileId");
  let verCursor = await verIndex.openCursor(IDBKeyRange.only(fileId));
  while (verCursor) {
      await verCursor.delete();
      verCursor = await verCursor.continue();
  }
  await tx.done;
  
  const ocrTx = idb.transaction("ocrCache", "readwrite");
  const index = ocrTx.objectStore("ocrCache").index("fileId");
  let cursor = await index.openCursor(IDBKeyRange.only(fileId));
  while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
  }
  await ocrTx.done;
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
