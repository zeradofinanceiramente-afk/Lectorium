
import { useState, useEffect, useCallback, useRef } from 'react';
import { Annotation } from '../types';
import { loadAnnotations, saveAnnotation, deleteAnnotation as deleteLocalAnnotation } from '../services/storageService';
import { syncAnnotationToCloud, deleteAnnotationFromCloud, subscribeToAnnotations } from '../services/firestoreService';
import { PDFDocumentProxy } from 'pdfjs-dist';

export const usePdfAnnotations = (fileId: string, uid: string, pdfDoc: PDFDocumentProxy | null) => {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const cloudAnnsRef = useRef<Annotation[]>([]);
  const localAnnsRef = useRef<Annotation[]>([]);
  const embeddedAnnsRef = useRef<Annotation[]>([]);

  // 1. Carregar Anotações Iniciais (Local + PDF)
  useEffect(() => {
    if (!pdfDoc) return;

    const loadInitial = async () => {
      // A. Local Cache
      const localAnns = await loadAnnotations(uid, fileId);
      localAnnsRef.current = localAnns;

      // B. Embedded (PDF Metadata)
      let embedded: Annotation[] = [];
      try {
        const metadata = await pdfDoc.getMetadata();
        const info = metadata.info as any;
        const keywords = info?.Keywords || '';
        const prefix = "PDF_ANNOTATOR_DATA:::";
        if (typeof keywords === 'string' && keywords.includes(prefix)) {
          const parts = keywords.split(prefix);
          if (parts.length > 1) {
            const parsed = JSON.parse(parts[1]);
            if (Array.isArray(parsed)) {
              embedded = parsed.map(a => ({ ...a, isBurned: a.type !== 'note' }));
            }
          }
        }
      } catch (e) { console.warn("Meta error:", e); }
      embeddedAnnsRef.current = embedded;

      mergeAndSet();
    };

    loadInitial();
  }, [fileId, uid, pdfDoc]);

  // 2. Sincronização em Tempo Real (Firestore)
  useEffect(() => {
    if (uid === 'guest' || !fileId) return;

    const unsubscribe = subscribeToAnnotations(uid, fileId, (cloudAnns) => {
      cloudAnnsRef.current = cloudAnns;
      mergeAndSet();
    });

    return () => unsubscribe();
  }, [fileId, uid]);

  // Função de Merge Robusta: Cloud > Local > Embedded
  const mergeAndSet = useCallback(() => {
    const map = new Map<string, Annotation>();

    // 1. Prioridade Baixa: Metadados do PDF (Burned)
    embeddedAnnsRef.current.forEach(a => {
        if (a.id) map.set(a.id, a);
    });

    // 2. Prioridade Média: Local IDB
    localAnnsRef.current.forEach(a => {
        if (a.id) map.set(a.id, a);
    });

    // 3. Prioridade Alta: Cloud (Firestore)
    cloudAnnsRef.current.forEach(a => {
        if (a.id) map.set(a.id, a);
    });

    setAnnotations(Array.from(map.values()));
  }, []);

  // Adicionar Anotação (IDB + Firestore)
  const addAnnotation = useCallback(async (ann: Annotation) => {
    const finalId = ann.id || `ann-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newAnn = { ...ann, id: finalId };
    
    // Update local state optimistic
    setAnnotations(prev => [...prev, newAnn]);
    localAnnsRef.current.push(newAnn);

    try {
      // Persistir Local
      await saveAnnotation(uid, fileId, newAnn);
      // Persistir Cloud
      if (navigator.onLine) {
          await syncAnnotationToCloud(uid, fileId, newAnn);
      }
    } catch (e) {
      console.error("Sync error:", e);
    }
  }, [fileId, uid]);

  // Remover Anotação
  const removeAnnotation = useCallback(async (target: Annotation) => {
    if (target.isBurned) {
      alert("Anotações salvas no arquivo original não podem ser removidas.");
      return;
    }

    const id = target.id;
    if (!id) return;

    setAnnotations(prev => prev.filter(a => a.id !== id));
    localAnnsRef.current = localAnnsRef.current.filter(a => a.id !== id);

    try {
      await deleteLocalAnnotation(id);
      if (navigator.onLine) {
        await deleteAnnotationFromCloud(uid, fileId, id);
      }
    } catch (e) { console.error("Delete error:", e); }
  }, [uid, fileId]);

  return { annotations, addAnnotation, removeAnnotation };
};
