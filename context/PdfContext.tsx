
import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Annotation } from '../types';
import { loadOcrData, saveOcrData, touchOfflineFile } from '../services/storageService';
import { PDFDocumentProxy } from 'pdfjs-dist';
import { OcrManager, OcrStatus } from '../services/ocrManager';
import { refineOcrWords } from '../services/aiService';

export type ToolType = 'cursor' | 'text' | 'ink' | 'eraser' | 'note';

interface PdfSettings {
  pageOffset: number;
  disableColorFilter: boolean;
  detectColumns: boolean;
  showOcrDebug: boolean;
  showConfidenceOverlay: boolean;
  pageColor: string;
  textColor: string;
  highlightColor: string;
  highlightOpacity: number;
  inkColor: string;
  inkStrokeWidth: number;
  inkOpacity: number;
  // Interface Customization
  toolbarScale: number;
  toolbarYOffset: number;
}

interface PdfContextState {
  scale: number;
  setScale: React.Dispatch<React.SetStateAction<number>>;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  numPages: number;
  isSpread: boolean;
  setIsSpread: (v: boolean) => void;
  spreadSide: 'left' | 'right';
  setSpreadSide: (side: 'left' | 'right') => void;
  goNext: () => void;
  goPrev: () => void;
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
  settings: PdfSettings;
  updateSettings: (newSettings: Partial<PdfSettings>) => void;
  annotations: Annotation[];
  addAnnotation: (ann: Annotation) => void;
  removeAnnotation: (ann: Annotation) => void;
  ocrMap: Record<number, any[]>;
  ocrStatusMap: Record<number, OcrStatus>;
  setPageOcrData: (page: number, words: any[]) => void;
  updateOcrWord: (page: number, wordIndex: number, newText: string) => void;
  triggerOcr: (page: number) => void;
  showOcrModal: boolean;
  setShowOcrModal: (v: boolean) => void;
  refinePageOcr: (page: number) => Promise<void>;
  hasUnsavedOcr: boolean;
  setHasUnsavedOcr: (val: boolean) => void;
  ocrNotification: string | null;
  jumpToPage: (page: number) => void;
  accessToken?: string | null;
  fileId: string;
  // Permite atualizar o blob principal (Single Source of Truth)
  updateSourceBlob: (newBlob: Blob) => void;
  currentBlobRef: React.MutableRefObject<Blob | null>;
  // Novo: Retorna apenas OCR pendente para evitar duplicação no save
  getUnburntOcrMap: () => Record<number, any[]>;
  // Marca páginas como salvas no blob atual
  markOcrAsSaved: (pages: number[]) => void;
  // Chat Bridge
  chatRequest: string | null;
  setChatRequest: (msg: string | null) => void;
}

const PdfContext = createContext<PdfContextState | null>(null);

export const usePdfContext = () => {
  const context = useContext(PdfContext);
  if (!context) throw new Error('usePdfContext must be used within a PdfProvider');
  return context;
};

interface PdfProviderProps {
  children: React.ReactNode;
  initialScale: number;
  numPages: number;
  annotations: Annotation[];
  onAddAnnotation: (ann: Annotation) => void;
  onRemoveAnnotation: (ann: Annotation) => void;
  onJumpToPage: (page: number) => void;
  accessToken?: string | null;
  fileId: string;
  pdfDoc: PDFDocumentProxy | null;
  // Callbacks para manipular o blob original no componente pai
  onUpdateSourceBlob: (blob: Blob) => void;
  currentBlob: Blob | null;
}

export const PdfProvider: React.FC<PdfProviderProps> = ({ 
  children, initialScale, numPages, annotations, onAddAnnotation, onRemoveAnnotation, onJumpToPage, accessToken, fileId, pdfDoc,
  onUpdateSourceBlob, currentBlob
}) => {
  const [scale, setScale] = useState(initialScale);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTool, setActiveTool] = useState<ToolType>('cursor');
  const [ocrMap, setOcrMap] = useState<Record<number, any[]>>({});
  const [ocrStatusMap, setOcrStatusMap] = useState<Record<number, OcrStatus>>({});
  const [hasUnsavedOcr, setHasUnsavedOcr] = useState(false);
  const [ocrNotification, setOcrNotificationState] = useState<string | null>(null);
  const notificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSpread, setIsSpread] = useState(false);
  const [spreadSide, setSpreadSide] = useState<'left' | 'right'>('left');
  const ocrManagerRef = useRef<OcrManager | null>(null);
  const [chatRequest, setChatRequest] = useState<string | null>(null);
  const [showOcrModal, setShowOcrModal] = useState(false);
  
  // Ref para acessar o blob mais atual dentro das funções assíncronas/fila
  const currentBlobRef = useRef<Blob | null>(currentBlob);
  useEffect(() => {
      currentBlobRef.current = currentBlob;
  }, [currentBlob]);

  // --- CONTROLE DE ESTADO DO BLOB ---
  // Rastreia quais páginas já tiveram seu OCR "queimado" (injetado) no currentBlobRef
  const burnedPagesRef = useRef<Set<number>>(new Set());

  const [settings, setSettings] = useState<PdfSettings>({
    pageOffset: 1, disableColorFilter: false, detectColumns: false, showOcrDebug: false,
    showConfidenceOverlay: false,
    pageColor: "#ffffff", textColor: "#000000", highlightColor: "#4ade80",
    highlightOpacity: 0.4, inkColor: "#a855f7", inkStrokeWidth: 42, inkOpacity: 0.35,
    toolbarScale: 1, toolbarYOffset: 0
  });

  const getUnburntOcrMap = useCallback(() => {
      const fullMap = ocrMap || {};
      const filteredMap: Record<number, any[]> = {};
      
      Object.entries(fullMap).forEach(([pageStr, words]) => {
          const page = parseInt(pageStr);
          // Só inclui se AINDA NÃO foi queimado no blob atual
          if (!burnedPagesRef.current.has(page) && Array.isArray(words)) {
              filteredMap[page] = words;
          }
      });
      
      return filteredMap;
  }, [ocrMap]);

  const markOcrAsSaved = useCallback((pages: number[]) => {
      pages.forEach(p => burnedPagesRef.current.add(p));
  }, []);

  const showOcrNotification = useCallback((message: string) => {
    if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
    setOcrNotificationState(message);
    notificationTimeoutRef.current = setTimeout(() => setOcrNotificationState(null), 3000);
  }, []);

  useEffect(() => {
    if (!fileId) return;
    loadOcrData(fileId).then(data => {
        if (data && Object.keys(data).length > 0) {
            setOcrMap(prev => ({ ...prev, ...data }));
            const statusUpdate: Record<number, OcrStatus> = {};
            
            Object.keys(data).forEach(pStr => {
                const p = parseInt(pStr);
                statusUpdate[p] = 'done';
                // CRÍTICO: Se carregamos do cache, assumimos que o arquivo salvo no disco/drive
                // já contém esse OCR (de um save anterior). Marcamos como queimado para não duplicar.
                // Se o arquivo for novo/limpo mas tiver cache órfão, o usuário precisará salvar uma vez.
                burnedPagesRef.current.add(p);
            });
            
            setOcrStatusMap(prev => ({ ...prev, ...statusUpdate }));
        }
    });
  }, [fileId]);

  useEffect(() => {
    if (pdfDoc) {
        const manager = new OcrManager(
            pdfDoc, 
            (page, words) => {
                setPageOcrData(page, words);
                showOcrNotification(`OCR da Página ${page} concluído.`);
            },
            (statusMap) => {
                setOcrStatusMap(prev => ({ ...prev, ...statusMap }));
            },
            () => {
                if (fileId) touchOfflineFile(fileId).catch(() => {});
            }
        );
        Object.keys(ocrMap).forEach(p => manager.markAsProcessed(parseInt(p)));
        ocrManagerRef.current = manager;
    }
    return () => { ocrManagerRef.current = null; };
  }, [pdfDoc, fileId, showOcrNotification]);

  const updateSettings = useCallback((newSettings: Partial<PdfSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const jumpToPage = useCallback((page: number) => {
    setCurrentPage(page);
    onJumpToPage(page);
    setSpreadSide('left');
    setIsSpread(false);
  }, [onJumpToPage]);

  const goNext = useCallback(() => {
    if (settings.detectColumns && isSpread && spreadSide === 'left') {
        setSpreadSide('right');
        return;
    }
    if (currentPage < numPages) {
        setCurrentPage(p => p + 1);
        setSpreadSide('left');
        setIsSpread(false);
        onJumpToPage(currentPage + 1);
    }
  }, [isSpread, spreadSide, currentPage, numPages, settings.detectColumns, onJumpToPage]);

  const goPrev = useCallback(() => {
    if (settings.detectColumns && isSpread && spreadSide === 'right') {
        setSpreadSide('left');
        return;
    }
    if (currentPage > 1) {
        setCurrentPage(p => p - 1);
        setSpreadSide('right'); 
        setIsSpread(false);
        onJumpToPage(currentPage - 1);
    }
  }, [isSpread, spreadSide, currentPage, settings.detectColumns, onJumpToPage]);

  const setPageOcrData = useCallback((page: number, words: any[]) => {
    setOcrMap(prev => ({ ...prev, [page]: words }));
    if (fileId) {
        saveOcrData(fileId, page, words).catch(e => console.error("OCR Save Failed", e));
        setHasUnsavedOcr(true);
    }
  }, [fileId]);

  const updateOcrWord = useCallback((page: number, wordIndex: number, newText: string) => {
    setOcrMap(prev => {
        const pageWords = [...(prev[page] || [])];
        if (pageWords[wordIndex]) {
            pageWords[wordIndex] = { ...pageWords[wordIndex], text: newText, confidence: 100, isManuallyCorrected: true };
        }
        const next = { ...prev, [page]: pageWords };
        if (fileId) {
            saveOcrData(fileId, page, pageWords).catch(() => {});
            setHasUnsavedOcr(true);
            
            // Se editamos, precisamos garantir que será re-queimado no próximo save
            if (burnedPagesRef.current.has(page)) {
                burnedPagesRef.current.delete(page);
            }
        }
        return next;
    });
  }, [fileId]);

  const triggerOcr = useCallback((page: number) => {
    if (ocrManagerRef.current) {
        ocrManagerRef.current.schedule(page, 'high');
        showOcrNotification(`Lendo Página ${page}...`);
    }
  }, [showOcrNotification]);

  const refinePageOcr = useCallback(async (page: number) => {
    const rawWords = ocrMap[page];
    if (!rawWords || rawWords.length === 0) return;

    showOcrNotification(`IA: Refinando texto da Página ${page}...`);
    setOcrStatusMap(prev => ({ ...prev, [page]: 'processing' }));
    
    try {
        const textArray = rawWords.map(w => w.text);
        const refinedTexts = await refineOcrWords(textArray);
        
        const refinedWords = rawWords.map((word, i) => ({
            ...word,
            text: refinedTexts[i] || word.text,
            isRefined: true
        }));

        setPageOcrData(page, refinedWords);
        setOcrStatusMap(prev => ({ ...prev, [page]: 'done' }));
        showOcrNotification(`Refinamento concluído.`);
    } catch (e) {
        console.error("Refinement failed", e);
        setOcrStatusMap(prev => ({ ...prev, [page]: 'done' }));
        showOcrNotification("Erro ao refinar com IA.");
    }
  }, [ocrMap, showOcrNotification, setPageOcrData]);

  const value = useMemo(() => ({
    scale, setScale, currentPage, setCurrentPage, numPages, activeTool, setActiveTool,
    settings, updateSettings, annotations, addAnnotation: onAddAnnotation, removeAnnotation: onRemoveAnnotation,
    ocrMap, ocrStatusMap, setPageOcrData, updateOcrWord, 
    triggerOcr, showOcrModal, setShowOcrModal,
    refinePageOcr, hasUnsavedOcr, setHasUnsavedOcr, ocrNotification,
    jumpToPage, accessToken, fileId, isSpread, setIsSpread, spreadSide, setSpreadSide, goNext, goPrev,
    updateSourceBlob: onUpdateSourceBlob, currentBlobRef, 
    getUnburntOcrMap, markOcrAsSaved,
    chatRequest, setChatRequest
  }), [scale, currentPage, numPages, activeTool, settings, annotations, onAddAnnotation, onRemoveAnnotation, ocrMap, ocrStatusMap, setPageOcrData, updateOcrWord, triggerOcr, showOcrModal, refinePageOcr, hasUnsavedOcr, setHasUnsavedOcr, ocrNotification, jumpToPage, accessToken, fileId, isSpread, spreadSide, goNext, goPrev, onUpdateSourceBlob, getUnburntOcrMap, markOcrAsSaved, chatRequest]);

  return <PdfContext.Provider value={value}>{children}</PdfContext.Provider>;
};
