
import { useState, useEffect, useCallback, useRef } from 'react';
import { Annotation, PdfMetadataV2 } from '../types';
import { 
  loadAnnotations, 
  saveAnnotation, 
  deleteAnnotation as deleteLocalAnnotation, 
  getAuditRecord,
  saveAuditRecord
} from '../services/storageService';
import { PDFDocumentProxy } from 'pdfjs-dist';
import { computeSparseHash } from '../utils/hashUtils';

// Helper de decode seguro
function fromBase64(str: string) {
    return decodeURIComponent(atob(str).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}

export const usePdfAnnotations = (fileId: string, uid: string, pdfDoc: PDFDocumentProxy | null, currentBlob?: Blob | null) => {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  
  // Integrity States
  const [conflictDetected, setConflictDetected] = useState(false);
  const [isCheckingIntegrity, setIsCheckingIntegrity] = useState(true);
  const [hasPageMismatch, setHasPageMismatch] = useState(false);
  
  const localAnnsRef = useRef<Annotation[]>([]);
  const embeddedAnnsRef = useRef<Annotation[]>([]);

  // 1. Carregar Anotações Iniciais e Verificar Integridade
  useEffect(() => {
    if (!pdfDoc || !currentBlob) {
        if (!pdfDoc && !currentBlob) setIsCheckingIntegrity(false); // No data to check
        return;
    }

    const loadAndVerify = async () => {
      setIsCheckingIntegrity(true);
      setConflictDetected(false);
      setHasPageMismatch(false);

      // A. Local Cache (IDB)
      const localAnns = await loadAnnotations(uid, fileId);
      localAnnsRef.current = localAnns;

      // B. Verification (Audit Log vs Current Blob)
      const currentHash = await computeSparseHash(currentBlob);
      const auditRecord = await getAuditRecord(fileId);
      
      let embedded: Annotation[] = [];
      let metadataPageCount: number | undefined = undefined;

      // C. Extract Embedded Metadata
      try {
        const metadata = await pdfDoc.getMetadata();
        const info = metadata.info as any;
        const keywords = info?.Keywords || '';
        
        // V2.1 Base64 Format (Safe)
        const v2B64Prefix = "LECTORIUM_V2_B64:::";
        // V2 Format (Legacy Text)
        const v2Prefix = "LECTORIUM_META:::";
        // V1 Format (Legacy)
        const v1Prefix = "PDF_ANNOTATOR_DATA:::";

        if (typeof keywords === 'string') {
            if (keywords.includes(v2B64Prefix)) {
                const parts = keywords.split(v2B64Prefix);
                if (parts.length > 1) {
                    const jsonStr = fromBase64(parts[1]);
                    const parsed: PdfMetadataV2 = JSON.parse(jsonStr);
                    embedded = parsed.annotations || [];
                    metadataPageCount = parsed.pageCount;
                }
            }
            else if (keywords.includes(v2Prefix)) {
                const parts = keywords.split(v2Prefix);
                if (parts.length > 1) {
                    const parsed: PdfMetadataV2 = JSON.parse(parts[1]);
                    embedded = parsed.annotations || [];
                    metadataPageCount = parsed.pageCount;
                }
            } else if (keywords.includes(v1Prefix)) {
                const parts = keywords.split(v1Prefix);
                if (parts.length > 1) {
                    const parsed = JSON.parse(parts[1]);
                    if (Array.isArray(parsed)) {
                        embedded = parsed.map(a => ({ ...a, isBurned: a.type !== 'note' }));
                    }
                }
            }
        }
      } catch (e) { console.warn("Meta error:", e); }
      
      embeddedAnnsRef.current = embedded;

      // D. Conflict Detection Logic
      let conflict = false;
      if (auditRecord) {
          if (auditRecord.contentHash !== currentHash) {
              console.warn("[Integrity] Hash Mismatch! External edit detected.");
              conflict = true;
          } else {
              // Hash OK -> Atualiza Timestamp
              await saveAuditRecord(fileId, currentHash, embedded.length);
          }
      } else {
          // Primeiro acesso
          await saveAuditRecord(fileId, currentHash, embedded.length);
      }

      // Validação de Geometria (Page Mismatch)
      // Se houver conflito E o número de páginas mudou, é um hard conflict
      if (metadataPageCount !== undefined && metadataPageCount !== pdfDoc.numPages) {
          console.warn(`[Integrity] Page Count Mismatch! Meta: ${metadataPageCount}, PDF: ${pdfDoc.numPages}`);
          // Se o hash mudou E as páginas mudaram, com certeza é conflito
          // Se o hash não mudou (raro, colisão?), mas páginas sim, algo está muito errado
          conflict = true; 
          setHasPageMismatch(true);
      }

      setConflictDetected(conflict);
      setIsCheckingIntegrity(false);
      if (!conflict) mergeAndSet();
    };

    loadAndVerify();
  }, [fileId, uid, pdfDoc, currentBlob]); 

  // Removed: useEffect hook for Firestore subscription

  const mergeAndSet = useCallback(() => {
    const map = new Map<string, Annotation>();

    // Priority: Local > Embedded
    // A lógica é: O que está no arquivo (Embedded) é a base.
    // O que está no cache Local (IDB) são edições recentes ainda não salvas no arquivo.
    embeddedAnnsRef.current.forEach(a => { if (a.id) map.set(a.id, a); });
    localAnnsRef.current.forEach(a => { if (a.id) map.set(a.id, a); });

    setAnnotations(Array.from(map.values()));
  }, []);

  const resolveConflict = useCallback(async (action: 'use_external' | 'restore_lectorium' | 'merge') => {
      if (action === 'use_external') {
          // Limpa estado Lectorium, usa o PDF como está
          setAnnotations([]); 
          localAnnsRef.current = [];
          // TODO: Limpar DB
      } 
      else if (action === 'merge') {
          // Tenta aplicar as anotações
          mergeAndSet();
      }
      else if (action === 'restore_lectorium') {
          // Mantém estado local (idealmente deveria reverter o blob, mas isso requer versionamento de blob)
          // Aqui assumimos que o usuário vai salvar por cima para "consertar" o PDF
          mergeAndSet();
      }
      
      // Aceita o novo estado como válido
      if (currentBlob) {
          const newHash = await computeSparseHash(currentBlob);
          await saveAuditRecord(fileId, newHash, annotations.length);
      }
      setConflictDetected(false);
  }, [fileId, annotations.length, currentBlob, mergeAndSet]);

  const addAnnotation = useCallback(async (ann: Annotation) => {
    if (isCheckingIntegrity || conflictDetected) return; // Bloqueia edição

    const finalId = ann.id || `ann-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newAnn = { ...ann, id: finalId };
    
    setAnnotations(prev => [...prev, newAnn]);
    localAnnsRef.current.push(newAnn);

    try {
      // Salva apenas localmente (IndexedDB)
      await saveAnnotation(uid, fileId, newAnn);
    } catch (e) { console.error("Save error:", e); }
  }, [fileId, uid, isCheckingIntegrity, conflictDetected]);

  const removeAnnotation = useCallback(async (target: Annotation) => {
    if (isCheckingIntegrity || conflictDetected) return;

    if (target.isBurned) {
      alert("Anotações salvas no arquivo original não podem ser removidas.");
      return;
    }
    const id = target.id;
    if (!id) return;

    setAnnotations(prev => prev.filter(a => a.id !== id));
    localAnnsRef.current = localAnnsRef.current.filter(a => a.id !== id);

    try {
      // Remove apenas localmente
      await deleteLocalAnnotation(id);
    } catch (e) { console.error("Delete error:", e); }
  }, [uid, fileId, isCheckingIntegrity, conflictDetected]);

  return { annotations, addAnnotation, removeAnnotation, conflictDetected, resolveConflict, isCheckingIntegrity, hasPageMismatch };
};
