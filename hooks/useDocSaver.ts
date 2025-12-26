
import { useState } from 'react';
import { Editor } from '@tiptap/react';
import JSZip from 'jszip';
import { updateDriveFile, uploadFileToDrive } from '../services/driveService';
import { 
  saveOfflineFile, addToSyncQueue, cacheDocumentData, 
  acquireFileLock, releaseFileLock 
} from '../services/storageService';
import { generateDocxBlob } from '../services/docxService';
import { packLectoriumFile } from '../services/lectService';
import { MIME_TYPES, Reference } from '../types';
import { PageSettings } from '../components/doc/modals/PageSetupModal';
import { CommentData } from '../components/doc/CommentsSidebar';

interface UseDocSaverProps {
  fileId: string;
  accessToken: string;
  isLocalFile: boolean;
  currentName: string;
  fileParents?: string[]; // Novo: Recebe a lista de pais
  onAuthError?: () => void;
}

export const useDocSaver = ({ fileId, accessToken, isLocalFile, currentName, fileParents = [], onAuthError }: UseDocSaverProps) => {
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'error'>('saved');
  const [isOfflineSaved, setIsOfflineSaved] = useState(false);
  const [originalZip, setOriginalZip] = useState<JSZip | undefined>(undefined);

  const save = async (editor: Editor, pageSettings?: PageSettings, comments?: CommentData[], references?: Reference[]) => {
      setIsSaving(true);
      
      const isLect = currentName.endsWith(MIME_TYPES.LECT_EXT);
      let blob: Blob;
      let mimeType: string;
      let nameToSave: string;
      let jsonContent: any;
      
      try {
        jsonContent = editor.getJSON();
        
        if (isLect) {
            // Se for .lect, salvamos como container Lectorium
            nameToSave = currentName;
            mimeType = MIME_TYPES.LECTORIUM;
            
            // 1. Dados estruturados (Source of Truth)
            const lectData = { content: jsonContent, pageSettings, comments, references };
            
            // 2. Backup DOCX (Compatibilidade)
            const docxSnapshot = await generateDocxBlob(jsonContent, pageSettings, comments, references, originalZip);
            
            // 3. Pack
            blob = await packLectoriumFile('document', lectData, nameToSave, {}, docxSnapshot);
        } else {
            // Padrão DOCX
            nameToSave = currentName.endsWith('.docx') ? currentName : `${currentName}.docx`;
            mimeType = MIME_TYPES.DOCX;
            blob = await generateDocxBlob(jsonContent, pageSettings, comments, references, originalZip);
        }

      } catch (e) {
          console.error(e);
          alert("Erro crítico ao gerar arquivo.");
          setIsSaving(false);
          setSaveStatus('error');
          return;
      }

      // Caso 1: Arquivo Local (Sem necessidade de locks complexos por enquanto)
      if (isLocalFile) {
          // Em modo local, o save geralmente é um download explícito ou cache
          // Aqui apenas atualizamos status para feedback visual se usado em contexto de auto-save
          setSaveStatus('saved');
          setIsSaving(false);
          // O download real é disparado pela UI chamando save com handleDownload, mas se for auto-save, paramos aqui.
          // Se fosse Native File System API, escreveríamos no handle aqui.
          return;
      }

      // Tenta adquirir o Lock para evitar conflito com background sync
      // Implementa uma pequena espera de retry se estiver travado
      let lockAcquired = await acquireFileLock(fileId);
      if (!lockAcquired) {
          // Aguarda 500ms e tenta novamente uma vez antes de falhar
          await new Promise(r => setTimeout(r, 500));
          lockAcquired = await acquireFileLock(fileId);
      }

      if (!lockAcquired) {
          console.warn("[Saver] Arquivo está sendo sincronizado em segundo plano. Aguarde um instante.");
          // Se não conseguir o lock, ainda atualizamos o cache local para que a sincronização seguinte pegue a versão nova
          try {
              await cacheDocumentData(fileId, {
                  content: jsonContent,
                  contentType: 'json',
                  settings: pageSettings,
                  comments: comments,
                  references: references
              });
          } catch(e) {}
          setIsSaving(false);
          return;
      }

      try {
          // Atualiza o Cache Local (Atomicidade Local)
          try {
              await cacheDocumentData(fileId, {
                  content: jsonContent,
                  contentType: 'json',
                  settings: pageSettings,
                  comments: comments,
                  references: references
              });
          } catch (e) {
              console.warn("Failed to update cache on save", e);
          }

          // Caso 2: Sem Internet -> Offline Mode
          if (!navigator.onLine) {
              try {
                  await saveOfflineFile({ id: fileId, name: nameToSave, mimeType: mimeType, parents: fileParents }, blob);
                  await addToSyncQueue({ fileId: fileId, action: 'update', blob: blob, name: nameToSave, mimeType: mimeType, parents: fileParents });
                  setSaveStatus('saved');
                  setIsOfflineSaved(true);
              } catch (e) {
                  console.error("Offline save failed", e);
                  setSaveStatus('error');
              }
              return;
          }

          // Caso 3: Online -> Drive
          try {
              // Se o arquivo é novo (criado localmente mas agora sendo salvo no drive), usamos uploadFileToDrive na primeira vez?
              // O App trata "local-" como isLocalFile=true, mas se quisermos "Salvar no Drive" explicitamente,
              // a lógica estaria no botão "Salvar cópia". 
              // A função updateDriveFile assume que o ID já existe no Drive.
              
              await updateDriveFile(accessToken, fileId, blob, mimeType);
              setSaveStatus('saved');
              setIsOfflineSaved(false);
          } catch (e: any) {
              console.error("Drive save failed", e);
              if (e.message !== "Unauthorized") {
                  try {
                      await saveOfflineFile({ id: fileId, name: nameToSave, mimeType: mimeType, parents: fileParents }, blob);
                      await addToSyncQueue({ fileId: fileId, action: 'update', blob: blob, name: nameToSave, mimeType: mimeType, parents: fileParents });
                      setSaveStatus('saved');
                      setIsOfflineSaved(true);
                  } catch (offlineErr) {
                      setSaveStatus('error');
                  }
              } else {
                  setSaveStatus('error');
                  if (onAuthError) onAuthError();
              }
          }
      } finally {
          await releaseFileLock(fileId);
          setIsSaving(false);
      }
  };

  /**
   * Força o download do DOCX gerado (Exportação)
   */
  const downloadDocx = async (editor: Editor, pageSettings?: PageSettings, comments?: CommentData[], references?: Reference[]) => {
      setIsSaving(true);
      try {
          const jsonContent = editor.getJSON();
          const nameToSave = currentName.endsWith('.docx') ? currentName : `${currentName}.docx`;
          
          const blob = await generateDocxBlob(jsonContent, pageSettings, comments, references, originalZip);
          
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = nameToSave;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          setSaveStatus('saved');
      } catch (e) {
          console.error("Download failed", e);
          alert("Erro ao gerar o arquivo DOCX.");
          setSaveStatus('error');
      } finally {
          setIsSaving(false);
      }
  };

  const saveAsLect = async (editor: Editor, pageSettings?: PageSettings, comments?: CommentData[]) => {
      setIsSaving(true);
      const jsonContent = editor.getJSON();
      
      // 1. Dados estruturados para o app (Carregamento rápido)
      const lectData = { content: jsonContent, pageSettings, comments };
      const lectName = currentName.replace('.docx', '') + MIME_TYPES.LECT_EXT;

      try {
          // 2. Gerar Snapshot DOCX para backup dentro do container (Interoperabilidade)
          // Isso garante que o arquivo .lect tenha uma cópia legível por Word dentro dele (source.bin)
          const docxSnapshot = await generateDocxBlob(jsonContent, pageSettings, comments, [], originalZip);

          // 3. Empacotar tudo
          const blob = await packLectoriumFile(
              'document', 
              lectData, 
              currentName, 
              {}, // Assets map (futuro: extrair imagens do JSON para aqui)
              docxSnapshot // Passa o DOCX como sourceBlob
          );

          if (isLocalFile || !navigator.onLine) {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = lectName;
              document.body.appendChild(a);
              a.click();
              URL.revokeObjectURL(url);
              document.body.removeChild(a);
          } else {
              // AQUI ESTÁ A CORREÇÃO: Usar fileParents ao invés de array vazio
              await uploadFileToDrive(
                  accessToken, 
                  blob, 
                  lectName, 
                  fileParents && fileParents.length > 0 ? fileParents : [], 
                  MIME_TYPES.LECTORIUM
              );
              alert("Arquivo Lectorium (.lect) salvo no Drive com sucesso!\nSalvo na mesma pasta do arquivo original.");
          }
      } catch (e) {
          console.error("Failed to save .lect", e);
          alert("Erro ao salvar formato Lectorium.");
      } finally {
          setIsSaving(false);
      }
  };

  return {
    save,
    downloadDocx,
    saveAsLect,
    isSaving,
    saveStatus,
    setSaveStatus,
    isOfflineSaved,
    setOriginalZip,
    originalZip
  };
};
