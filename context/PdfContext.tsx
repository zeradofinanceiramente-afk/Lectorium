import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Annotation } from '../types';
import { loadOcrData, saveOcrData, touchOfflineFile } from '../services/storageService';
import { PDFDocumentProxy } from 'pdfjs-dist';
import { OcrManager, OcrStatus } from '../services/ocrManager';
import { refineOcrWords } from '../services/aiService';
import { burnPageOcrToPdf } from '../services/pdfModifierService';

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
  refinePageOcr: (page: number) => Promise<void>;
  hasUnsavedOcr: boolean;
  setHasUnsavedOcr: (val: boolean) => void;
  ocrNotification: string | null;
  jumpToPage: (page: number) => void;
  accessToken?: string | null;
  // Permite atualizar o blob principal (Single Source of Truth)
  updateSourceBlob: (newBlob: Blob) => void;
  currentBlobRef: React.MutableRefObject<Blob | null>;
  // Novo: Retorna apenas OCR pendente para evitar duplicação no save
  getUnburntOcrMap: () => Record<number, any[]>;
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
  
  // Ref para acessar o blob mais atual dentro das funções assíncronas/fila
  const currentBlobRef = useRef<Blob | null>(currentBlob);
  useEffect(() => {
      currentBlobRef.current = currentBlob;
  }, [currentBlob]);

  // --- FILA DE QUEIMA DE OCR (Single Source Update) ---
  const burnQueueRef = useRef<{page: number, words: any[]}[]>([]);
  const isBurningRef = useRef(false);
  const burnedPagesRef = useRef<Set<number>>(new Set());

  const [settings, setSettings] = useState<PdfSettings>({
    pageOffset: 1, disableColorFilter: false, detectColumns: false, showOcrDebug: false,
    showConfidenceOverlay: false,
    pageColor: "#ffffff", textColor: "#000000", highlightColor: "#4ade80",
    highlightOpacity: 0.4, inkColor: "#22c55e", inkStrokeWidth: 20, inkOpacity: 0.35,
  });

  const processBurnQueue = async () => {
      if (isBurningRef.current || burnQueueRef.current.length === 0 || !currentBlobRef.current) return;
      
      isBurningRef.current = true;
      const task = burnQueueRef.current.shift(); // FIFO
      
      if (task) {
          try {
              console.log(`[OCR] Injetando texto na página ${task.page} (Source Update)...`);
              // Usa sempre o blob mais atual da ref
              const newBlob = await burnPageOcrToPdf(currentBlobRef.current, task.page, task.words);
              
              // Atualiza a fonte global. Isso causará um re-render do PDF Viewer (piscada).
              // Mas garante uso mínimo de RAM (apenas 1 versão do arquivo na memória).
              onUpdateSourceBlob(newBlob);
              
              burnedPagesRef.current.add(task.page);
              console.log(`[OCR] Página ${task.page} salva no binário.`);
          } catch (e) {
              console.error(`[OCR] Falha ao injetar página ${task.page}:`, e);
          }
      }

      isBurningRef.current = false;
      
      // Se houver mais itens, processa.
      // Adicionamos um pequeno delay para não travar a UI em caso de fila longa
      if (burnQueueRef.current.length > 0) {
          setTimeout(processBurnQueue, 500); 
      }
  };

  const schedulePageBurn = useCallback((page: number, words: any[]) => {
      if (burnedPagesRef.current.has(page)) return;
      if (!currentBlobRef.current) return;

      burnQueueRef.current.push({ page, words });
      processBurnQueue();
  }, []);

  const getUnburntOcrMap = useCallback(() => {
      const fullMap = ocrMap || {};
      // Ensure strictly typed Record to prevent assignment of incompatible types
      const filteredMap: Record<number, any[]> = {};
      
      Object.entries(fullMap).forEach(([pageStr, words]) => {
          const page = parseInt(pageStr);
          // Só inclui se AINDA NÃO foi queimado no blob
          if (!burnedPagesRef.current.has(page) && Array.isArray(words)) {
              filteredMap[page] = words;
          }
      });
      
      return filteredMap;
  }, [ocrMap]);

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
                // CRÍTICO: Se carregamos do cache, assumimos que o arquivo salvo no disco
                // já contém esse OCR (de um save anterior). Marcamos como queimado para não duplicar.
                // Se o arquivo for novo/limpo mas tiver cache órfão, o usuário precisará reprocessar
                // ou salvar uma vez (o que não gera duplicação pois o unburnt filtra)
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
        // DISPARA A ATUALIZAÇÃO DO BLOB ORIGINAL
        schedulePageBurn(page, words);
    }
  }, [fileId, schedulePageBurn]);

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
            // Re-queima para atualizar o texto invisível (remove do set para permitir reprocessamento)
            if (burnedPagesRef.current.has(page)) burnedPagesRef.current.delete(page);
            schedulePageBurn(page, pageWords);
        }
        return next;
    });
  }, [fileId, schedulePageBurn]);

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
    ocrMap, ocrStatusMap, setPageOcrData, updateOcrWord, triggerOcr, refinePageOcr, hasUnsavedOcr, setHasUnsavedOcr, ocrNotification,
    jumpToPage, accessToken, isSpread, setIsSpread, spreadSide, setSpreadSide, goNext, goPrev,
    updateSourceBlob: onUpdateSourceBlob, currentBlobRef, getUnburntOcrMap
  }), [scale, currentPage, numPages, activeTool, settings, annotations, onAddAnnotation, onRemoveAnnotation, ocrMap, ocrStatusMap, setPageOcrData, updateOcrWord, triggerOcr, refinePageOcr, hasUnsavedOcr, setHasUnsavedOcr, ocrNotification, jumpToPage, accessToken, isSpread, spreadSide, goNext, goPrev, onUpdateSourceBlob, getUnburntOcrMap]);

  return <PdfContext.Provider value={value}>{children}</PdfContext.Provider>;
};