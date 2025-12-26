
import { useState, useEffect, useRef, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { renameDriveFile, deleteDriveFile } from '../services/driveService';
import { deleteOfflineFile } from '../services/storageService';
import { generateDocxBlob } from '../services/docxService';
import { packLectoriumFile } from '../services/lectService';
import { MIME_TYPES, Reference, LoadingStatus } from '../types';
import { useDocLoader } from './useDocLoader';
import { useDocSaver } from './useDocSaver';
import { PageSettings } from '../components/doc/modals/PageSetupModal';
import { CommentData } from '../components/doc/CommentsSidebar';

interface UseDocFileHandlerProps {
  editor: Editor | null;
  fileId: string;
  fileName: string;
  fileBlob?: Blob;
  accessToken: string;
  isLocalFile: boolean;
  fileParents?: string[]; // Novo
  onAuthError?: () => void;
  onBack?: () => void;
  onFitWidth?: () => void;
  onLoadSettings?: (settings: PageSettings) => void;
  onLoadComments?: (comments: CommentData[]) => void;
  onLoadReferences?: (refs: Reference[]) => void;
}

export const useDocFileHandler = ({ 
  editor, fileId, fileName, fileBlob, accessToken, isLocalFile, fileParents, onAuthError, onBack, onFitWidth, onLoadSettings, onLoadComments, onLoadReferences 
}: UseDocFileHandlerProps) => {
  
  const [currentName, setCurrentName] = useState(fileName.replace('.docx', ''));
  const [loadingState, setLoadingState] = useState<LoadingStatus>('init');
  const [displayProgress, setDisplayProgress] = useState(0);
  const [displayMessage, setDisplayMessage] = useState("");
  
  const [isStreaming, setIsStreaming] = useState(false);
  const contentQueueRef = useRef<any[]>([]);
  const totalContentSizeRef = useRef(0);

  const loader = useDocLoader({ fileId, fileBlob, accessToken, isLocalFile });
  // Passamos fileParents para o Saver
  const saver = useDocSaver({ fileId, accessToken, isLocalFile, currentName, fileParents, onAuthError });

  // Processamento de Chunks (Time-Slicing para 60fps)
  const processChunk = useCallback(() => {
      if (!editor || editor.isDestroyed) return;

      const queue = contentQueueRef.current;
      if (queue.length === 0) {
          setIsStreaming(false);
          finalizeLoading();
          return;
      }

      const startTime = performance.now();
      const CHUNK_TIME_LIMIT = 10; // 10ms por frame para não travar main thread
      const batch = [];
      
      while (queue.length > 0 && (performance.now() - startTime) < CHUNK_TIME_LIMIT) {
          batch.push(queue.shift());
      }

      if (batch.length > 0) {
          const tr = editor.state.tr;
          const endPos = tr.doc.content.size;
          editor.chain().insertContentAt(endPos, batch).run();
          
          const processed = totalContentSizeRef.current - queue.length;
          const percent = Math.round((processed / totalContentSizeRef.current) * 100);
          setDisplayProgress(percent);
      }

      requestAnimationFrame(processChunk);
  }, [editor]);

  const finalizeLoading = useCallback(() => {
        setLoadingState('layout');
        setDisplayMessage("Finalizando layout...");
        
        const onPaginationDone = () => {
            setDisplayProgress(100);
            if (onFitWidth) onFitWidth();
            
            // Força o foco e blur para garantir que o ProseMirror recalcule as posições
            // Isso resolve o problema de margens ignoradas na carga inicial de DOCX
            if (editor && !editor.isDestroyed) {
                editor.commands.focus('start');
                setTimeout(() => {
                    // Trigger extra layout check for pagination extension
                    (editor.commands as any).setPaginationOptions({}); 
                }, 100);
            }

            setTimeout(() => setLoadingState('ready'), 50);
        };

        if (editor?.view?.dom) {
            editor.view.dom.addEventListener('pagination-calculated', onPaginationDone, { once: true });
            
            // Dispara o primeiro recálculo forçado
            setTimeout(() => { 
                (editor.commands as any).setPaginationOptions({}); 
            }, 50);

            // Fallback de segurança 5s
            setTimeout(() => { if (loadingState !== 'ready') onPaginationDone(); }, 5000);
        } else {
            setLoadingState('ready');
        }
  }, [editor, onFitWidth, loadingState]);

  useEffect(() => {
    if (loader.status !== 'ready') {
        setLoadingState(loader.status as LoadingStatus);
        setDisplayProgress(loader.progress);
        setDisplayMessage(loader.message);
    }

    if (loader.status === 'ready' && loader.content && editor && !editor.isDestroyed) {
        if (isStreaming || loadingState === 'ready') return;

        if (loader.detectedSettings && onLoadSettings) onLoadSettings(loader.detectedSettings);
        if (loader.comments && onLoadComments) onLoadComments(loader.comments);
        if (loader.originalZip) saver.setOriginalZip(loader.originalZip);

        const fullContent = loader.content;
        
        if (loader.contentType === 'json' && fullContent.type === 'doc') {
             const nodes = fullContent.content || [];
             
             if (fullContent.meta) {
                 if (fullContent.meta.comments && onLoadComments) onLoadComments(fullContent.meta.comments);
                 if (fullContent.meta.references && onLoadReferences) onLoadReferences(fullContent.meta.references);
             }

             if (nodes.length < 30) {
                 editor.commands.setContent(fullContent);
                 finalizeLoading();
             } else {
                 setLoadingState('layout');
                 setDisplayMessage("Processando estrutura...");
                 setIsStreaming(true);
                 editor.commands.clearContent(false);
                 contentQueueRef.current = [...nodes];
                 totalContentSizeRef.current = nodes.length;
                 requestAnimationFrame(processChunk);
             }
        } else {
             editor.commands.setContent(loader.content);
             finalizeLoading();
        }
    } else if (loader.status === 'ready' && loader.content === null) {
        setLoadingState('ready');
    }
  }, [loader.status, loader.content, editor, processChunk, finalizeLoading]);

  const handleSave = useCallback((pageSettings?: PageSettings, comments?: CommentData[], references?: Reference[]) => {
      if (editor) saver.save(editor, pageSettings, comments, references);
  }, [editor, saver]);

  const handleRename = useCallback(async () => {
      if (isLocalFile || !currentName.trim()) return;
      const newName = currentName.endsWith('.docx') ? currentName : `${currentName}.docx`;
      try {
          await renameDriveFile(accessToken, fileId, newName);
      } catch (e) { console.error("Rename failed", e); }
  }, [accessToken, fileId, currentName, isLocalFile]);

  const handleTrash = useCallback(async () => {
      if (!window.confirm(`Excluir permanentemente "${currentName}"?`)) return;
      try {
          if (!isLocalFile) {
              if (navigator.onLine) await deleteDriveFile(accessToken, fileId);
              else await deleteOfflineFile(fileId);
          }
          if (onBack) onBack();
      } catch (e: any) { alert("Erro ao excluir arquivo."); }
  }, [accessToken, fileId, currentName, isLocalFile, onBack]);

  return {
    isSaving: saver.isSaving,
    saveStatus: saver.saveStatus,
    currentName,
    setCurrentName,
    loadingState,
    loadingProgress: displayProgress,
    loadingMessage: displayMessage,
    handleSave,
    handleRename,
    handleTrash,
    // Alterado para usar downloadDocx explicitamente para exportação física
    handleDownload: (ps: any, c: any, r: any) => saver.downloadDocx(editor!, ps, c, r),
    handleDownloadLect: (ps: any, c: any) => saver.saveAsLect(editor!, ps, c)
  };
};
