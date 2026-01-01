
import React, { useState } from 'react';
import { burnAnnotationsToPdf } from '../services/pdfModifierService';
import { updateDriveFile, uploadFileToDrive } from '../services/driveService';
import { 
  saveOfflineFile, addToSyncQueue, 
  acquireFileLock, releaseFileLock, saveAuditRecord 
} from '../services/storageService';
import { computeSparseHash } from '../utils/hashUtils';
import { Annotation } from '../types';

interface UsePdfSaverProps {
  fileId: string;
  fileName: string;
  fileParents?: string[];
  accessToken?: string | null;
  annotations: Annotation[];
  currentBlobRef: React.MutableRefObject<Blob | null>;
  originalBlob: Blob | null;
  ocrToBurn: Record<number, any[]>;
  docPageOffset: number;
  onUpdateOriginalBlob: (blob: Blob) => void;
  onOcrSaved: () => void;
  setHasUnsavedOcr: (v: boolean) => void;
}

export const usePdfSaver = ({
  fileId,
  fileName,
  fileParents,
  accessToken,
  annotations,
  currentBlobRef,
  originalBlob,
  ocrToBurn,
  docPageOffset,
  onUpdateOriginalBlob,
  onOcrSaved,
  setHasUnsavedOcr
}: UsePdfSaverProps) => {
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isOfflineAvailable, setIsOfflineAvailable] = useState(false);

  const handleDownload = async () => {
     const sourceBlob = currentBlobRef.current || originalBlob;
     if (!sourceBlob) return;
     const newBlob = await burnAnnotationsToPdf(sourceBlob, annotations, ocrToBurn, docPageOffset);
     const url = URL.createObjectURL(newBlob);
     const a = document.createElement('a');
     a.href = url;
     a.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
     document.body.appendChild(a);
     a.click();
     document.body.removeChild(a);
     URL.revokeObjectURL(url);
  };

  const handleSave = async (mode: 'local' | 'overwrite' | 'copy') => {
    const sourceBlob = currentBlobRef.current || originalBlob;
    if (!sourceBlob) return;
    if (isSaving) return;

    setIsSaving(true);
    setShowPermissionModal(false);

    if (mode === 'local') setSaveMessage("Gerando PDF...");
    else if (mode === 'copy') setSaveMessage("Criando Cópia...");
    else setSaveMessage("Sincronizando...");

    try {
        if (mode === 'local') {
            await handleDownload();
            return;
        }

        const hasLock = await acquireFileLock(fileId);
        if (!hasLock && mode === 'overwrite') {
            alert("O arquivo está sendo sincronizado em segundo plano. Tente novamente em alguns segundos.");
            return;
        }

        const newBlob = await burnAnnotationsToPdf(sourceBlob, annotations, ocrToBurn, docPageOffset);
        const newHash = await computeSparseHash(newBlob);
        
        const isLocal = fileId.startsWith('local-') || !accessToken;

        if (!isLocal && !navigator.onLine && accessToken) {
            setSaveMessage("Salvando Offline...");
            const fileMeta = { id: fileId, name: fileName, mimeType: 'application/pdf', parents: fileParents };
            await saveOfflineFile(fileMeta, newBlob);
            setIsOfflineAvailable(true);
            await saveAuditRecord(fileId, newHash, annotations.length);
            await addToSyncQueue({
                fileId: mode === 'overwrite' ? fileId : `new-${Date.now()}`,
                action: mode === 'overwrite' ? 'update' : 'create',
                blob: newBlob,
                name: mode === 'overwrite' ? fileName : fileName.replace('.pdf', '') + ' (Anotado).pdf',
                parents: fileParents,
                mimeType: 'application/pdf'
            });
            alert("Sem internet. Arquivo atualizado offline e salvo na fila de sincronização.");
            setHasUnsavedOcr(false);
            if (mode === 'overwrite') {
                onOcrSaved();
                onUpdateOriginalBlob(newBlob);
            }
            return;
        }

        if (accessToken && !isLocal) {
            if (mode === 'overwrite') {
               setSaveMessage("Enviando ao Drive...");
               try {
                  await updateDriveFile(accessToken, fileId, newBlob);
                  onUpdateOriginalBlob(newBlob);
                  onOcrSaved();
                  await saveAuditRecord(fileId, newHash, annotations.length);
                  if (isOfflineAvailable) {
                      const fileMeta = { id: fileId, name: fileName, mimeType: 'application/pdf', parents: fileParents };
                      await saveOfflineFile(fileMeta, newBlob);
                      alert("Arquivo atualizado no Drive e na cópia Offline!");
                  } else {
                      alert("Arquivo atualizado com sucesso!");
                  }
                  setHasUnsavedOcr(false);
               } catch (e: any) {
                  if (e.message.includes('403') || e.message.includes('permission')) {
                     setShowPermissionModal(true);
                  } else {
                     throw e;
                  }
               }
            } else {
               setSaveMessage("Enviando Cópia...");
               const name = fileName.replace('.pdf', '') + ' (Anotado).pdf';
               await uploadFileToDrive(accessToken, newBlob, name, fileParents);
               alert("Cópia salva com sucesso!");
            }
        }
    } catch (e: any) {
        console.error(e);
        alert("Erro ao salvar: " + e.message);
    } finally {
        await releaseFileLock(fileId);
        setIsSaving(false);
        setSaveMessage("");
    }
  };

  return {
    handleSave,
    isSaving,
    saveMessage,
    showPermissionModal,
    setShowPermissionModal,
    setIsOfflineAvailable
  };
};
