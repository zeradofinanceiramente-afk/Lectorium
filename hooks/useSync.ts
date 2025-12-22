import { useState, useCallback, useEffect } from 'react';
import { getSyncQueue, removeSyncQueueItem, acquireFileLock, releaseFileLock, clearAppStorage } from '../services/storageService';
import { uploadFileToDrive, updateDriveFile } from '../services/driveService';
import { SyncStatus, SyncQueueItem } from '../types';

interface UseSyncProps {
  accessToken: string | null;
  onAuthError: () => void;
  autoSync?: boolean; // Novo parâmetro para permitir modo passivo (observador)
}

export const useSync = ({ accessToken, onAuthError, autoSync = true }: UseSyncProps) => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ active: false, message: null });
  const [queue, setQueue] = useState<SyncQueueItem[]>([]);

  // Carrega a fila do IndexedDB
  const refreshQueue = useCallback(async () => {
    try {
      const items = await getSyncQueue();
      setQueue(items);
    } catch (e) {
      console.warn("Error refreshing sync queue", e);
    }
  }, []);

  const processSync = useCallback(async () => {
    // Atualiza a visualização da fila antes de começar
    const currentQueue = await getSyncQueue();
    setQueue(currentQueue);

    if (!accessToken || syncStatus.active || !navigator.onLine || currentQueue.length === 0) return;

    setSyncStatus({ active: true, message: `Sincronizando ${currentQueue.length} itens...` });
    
    // Processa item a item
    for (const item of currentQueue) {
        const hasLock = await acquireFileLock(item.fileId);
        if (!hasLock) {
            console.warn(`Skipping locked file: ${item.fileId}`);
            continue;
        }
        
        try {
            if (item.action === 'create') {
                await uploadFileToDrive(accessToken, item.blob, item.name, item.parents, item.mimeType);
            } else if (item.action === 'update') {
                await updateDriveFile(accessToken, item.fileId, item.blob, item.mimeType);
            }
            // Sucesso: Remove da fila
            await removeSyncQueueItem(item.id);
            // Atualiza estado local da fila
            await refreshQueue();
        } catch (e: any) {
            console.error(`Sync failed for item ${item.id}`, e);
            if (e.message.includes('401')) { 
                onAuthError(); 
                break; 
            }
            // Em caso de erro não-auth, o item permanece na fila para retry futuro
        } finally { 
            await releaseFileLock(item.fileId); 
        }
    }
    
    setSyncStatus({ active: false, message: "Sincronizado" });
    await refreshQueue();
    setTimeout(() => setSyncStatus({ active: false, message: null }), 3000);
  }, [accessToken, syncStatus.active, onAuthError, refreshQueue]);

  const removeItem = useCallback(async (id: string) => {
      await removeSyncQueueItem(id);
      await refreshQueue();
  }, [refreshQueue]);

  const clearQueue = useCallback(async () => {
      // Método de emergência: limpa apenas a store 'syncQueue' iterando sobre ela
      const items = await getSyncQueue();
      for (const item of items) {
          await removeSyncQueueItem(item.id);
      }
      await refreshQueue();
  }, [refreshQueue]);

  // Listeners de Rede e Polling de Fila
  useEffect(() => {
    // Se autoSync for true, registra o listener de rede
    if (autoSync) {
        window.addEventListener('online', processSync);
    }
    
    // Polling periódico para manter a UI atualizada (observabilidade)
    // Isso garante que se outra aba adicionar algo à fila, esta instância verá.
    const interval = setInterval(refreshQueue, 5000);
    
    // Execução inicial
    refreshQueue();
    if (autoSync && navigator.onLine) processSync();

    return () => {
        if (autoSync) {
            window.removeEventListener('online', processSync);
        }
        clearInterval(interval);
    };
  }, [processSync, refreshQueue, autoSync]);

  return { 
      syncStatus, 
      triggerSync: processSync,
      queue,
      removeItem,
      clearQueue
  };
};