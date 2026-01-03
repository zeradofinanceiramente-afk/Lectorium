
import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Annotation, SemanticLensData } from '../types';
import { loadOcrData, saveOcrData, touchOfflineFile } from '../services/storageService';
import { PDFDocumentProxy } from 'pdfjs-dist';
import { OcrManager, OcrStatus, OcrEngineType } from '../services/ocrManager';
import { refineOcrWords, performSemanticOcr } from '../services/aiService';
import { indexDocumentForSearch } from '../services/ragService';
import { scheduleWork, cancelWork } from '../utils/scheduler';
import { SelectionState } from '../components/pdf/SelectionMenu';
import { usePdfSelection } from '../hooks/usePdfSelection';
import { usePdfStore } from '../stores/usePdfStore';

export type ToolType = 'cursor' | 'text' | 'ink' | 'eraser' | 'note' | 'brush';

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
  // OCR Config
  ocrEngine: OcrEngineType;
}

// Simplified Context State (Removidos estados de UI como scale/currentPage que agora estão no Zustand)
interface PdfContextState {
  // Legacy accessors proxied to Zustand for compatibility during migration
  scale: number;
  setScale: (s: number | ((p:number)=>number)) => void;
  currentPage: number;
  setCurrentPage: (p: number) => void;
  numPages: number;
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
  isSpread: boolean;
  setIsSpread: (v: boolean) => void;
  spreadSide: 'left' | 'right';
  setSpreadSide: (s: 'left' | 'right') => void;
  goNext: () => void;
  goPrev: () => void;
  jumpToPage: (page: number) => void;

  // Data State (Continues in Context)
  settings: PdfSettings;
  updateSettings: (newSettings: Partial<PdfSettings>) => void;
  annotations: Annotation[];
  addAnnotation: (ann: Annotation) => void;
  removeAnnotation: (ann: Annotation) => void;
  ocrMap: Record<number, any[]>;
  nativeTextMap: Record<number, string>; 
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
  accessToken?: string | null;
  fileId: string;
  updateSourceBlob: (newBlob: Blob) => void;
  currentBlobRef: React.MutableRefObject<Blob | null>;
  getUnburntOcrMap: () => Record<number, any[]>;
  markOcrAsSaved: (pages: number[]) => void;
  chatRequest: string | null;
  setChatRequest: (msg: string | null) => void;
  generateSearchIndex: (fullText: string) => Promise<void>;
  docPageOffset: number;
  setDocPageOffset: (offset: number) => void;
  selection: SelectionState | null;
  setSelection: (s: SelectionState | null) => void;
  onSmartTap: (t: HTMLElement) => void;
  
  // Semantic Lens
  lensData: Record<number, SemanticLensData>;
  isLensLoading: boolean;
  triggerSemanticLens: (page: number) => Promise<void>;
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
  onUpdateSourceBlob: (blob: Blob) => void;
  currentBlob: Blob | null;
  initialPageOffset: number;
  onSetPageOffset: (offset: number) => void;
}

const DEFAULT_SETTINGS: PdfSettings = {
  pageOffset: 1, 
  disableColorFilter: false, 
  detectColumns: false, 
  showOcrDebug: false,
  showConfidenceOverlay: false,
  pageColor: "#ffffff", 
  textColor: "#000000", 
  highlightColor: "#4ade80",
  highlightOpacity: 0.4, 
  inkColor: "#a855f7", 
  inkStrokeWidth: 42, 
  inkOpacity: 0.35,
  toolbarScale: 1, 
  toolbarYOffset: 0,
  ocrEngine: 'tesseract'
};

export const PdfProvider: React.FC<PdfProviderProps> = ({ 
  children, initialScale, numPages, annotations, onAddAnnotation, onRemoveAnnotation, onJumpToPage, accessToken, fileId, pdfDoc,
  onUpdateSourceBlob, currentBlob, initialPageOffset, onSetPageOffset
}) => {
  // Sync Data Props to Store on Mount/Change
  useEffect(() => {
    usePdfStore.getState().setNumPages(numPages);
    usePdfStore.getState().setScale(initialScale);
  }, [numPages, initialScale]);

  // Read State from Store for Legacy Context Consumers
  // Note: This causes re-renders in Context consumers, but we will migrate heavy components to useStore directly
  const scale = usePdfStore(s => s.scale);
  const currentPage = usePdfStore(s => s.currentPage);
  const activeTool = usePdfStore(s => s.activeTool);
  const isSpread = usePdfStore(s => s.isSpread);
  const spreadSide = usePdfStore(s => s.spreadSide);

  const { setScale, setCurrentPage, setActiveTool, setIsSpread, setSpreadSide, nextPage, prevPage, jumpToPage: storeJump } = usePdfStore();

  const [ocrMap, setOcrMap] = useState<Record<number, any[]>>({});
  const [nativeTextMap, setNativeTextMap] = useState<Record<number, string>>({}); 
  const [ocrStatusMap, setOcrStatusMap] = useState<Record<number, OcrStatus>>({});
  const [hasUnsavedOcr, setHasUnsavedOcr] = useState(false);
  const [ocrNotification, setOcrNotificationState] = useState<string | null>(null);
  const notificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ocrManagerRef = useRef<OcrManager | null>(null);
  const [chatRequest, setChatRequest] = useState<string | null>(null);
  const [showOcrModal, setShowOcrModal] = useState(false);
  
  // Semantic Lens State
  const [lensData, setLensData] = useState<Record<number, SemanticLensData>>({});
  const [isLensLoading, setIsLensLoading] = useState(false);
  
  const currentBlobRef = useRef<Blob | null>(currentBlob);
  useEffect(() => {
      currentBlobRef.current = currentBlob;
  }, [currentBlob]);

  const burnedPagesRef = useRef<Set<number>>(new Set());

  const [settings, setSettings] = useState<PdfSettings>(() => {
    try {
        const saved = localStorage.getItem('pdf_tool_preferences');
        if (saved) {
            const parsed = JSON.parse(saved);
            return { ...DEFAULT_SETTINGS, ...parsed };
        }
    } catch (e) {
        console.warn("Falha ao carregar preferências do PDF:", e);
    }
    return DEFAULT_SETTINGS;
  });

  // --- SELECTION SYSTEM ---
  const { selection, setSelection, onSmartTap } = usePdfSelection({ 
      activeTool, 
      scale 
  });

  // --- NATIVE TEXT EXTRACTION ENGINE (Background) ---
  useEffect(() => {
    if (!pdfDoc || numPages === 0) return;

    setNativeTextMap({});
    let workId: number;
    let pageIndex = 1;
    let isCancelled = false;

    const extractNextPage = async (deadline: { timeRemaining: () => number, didTimeout: boolean }) => {
        if (isCancelled) return;
        while (pageIndex <= numPages && (deadline.timeRemaining() > 1 || deadline.didTimeout)) {
            try {
                // Check if page already has OCR data to avoid redundant native extraction
                if (!ocrMap[pageIndex]) {
                    const page = await pdfDoc.getPage(pageIndex);
                    const textContent = await page.getTextContent();
                    const text = textContent.items.map((item: any) => item.str).join(' ');
                    if (text.trim().length > 0) {
                        setNativeTextMap(prev => ({ ...prev, [pageIndex]: text }));
                    }
                }
            } catch (e) {}
            pageIndex++;
        }
        if (pageIndex <= numPages) {
            workId = scheduleWork(extractNextPage);
        }
    };
    workId = scheduleWork(extractNextPage);
    return () => { isCancelled = true; cancelWork(workId); };
  }, [pdfDoc, numPages]);

  const getUnburntOcrMap = useCallback(() => {
      const fullMap = ocrMap || {};
      const filteredMap: Record<number, any[]> = {};
      Object.entries(fullMap).forEach(([pageStr, words]) => {
          const page = parseInt(pageStr);
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
                burnedPagesRef.current.add(p);
            });
            setOcrStatusMap(prev => ({ ...prev, ...statusUpdate }));
        }
    });
  }, [fileId]);

  // OCR Manager Lifecycle - Agora reage a mudanças no settings.ocrEngine
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
            },
            // Passa o motor selecionado
            settings.ocrEngine
        );
        Object.keys(ocrMap).forEach(p => manager.markAsProcessed(parseInt(p)));
        ocrManagerRef.current = manager;
    }
    return () => { ocrManagerRef.current = null; };
  }, [pdfDoc, fileId, showOcrNotification, settings.ocrEngine]);

  const updateSettings = useCallback((newSettings: Partial<PdfSettings>) => {
    setSettings(prev => {
        const next = { ...prev, ...newSettings };
        localStorage.setItem('pdf_tool_preferences', JSON.stringify(next));
        return next;
    });
  }, []);

  // Sync Jump: Quando a UI pede jump (via toolbar ou sidebar), atualiza o store e notifica o pai
  const handleJumpToPage = useCallback((page: number) => {
    storeJump(page);
    onJumpToPage(page);
  }, [onJumpToPage, storeJump]);

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
            if (burnedPagesRef.current.has(page)) burnedPagesRef.current.delete(page);
        }
        return next;
    });
  }, [fileId]);

  const triggerOcr = useCallback((page: number) => {
    if (ocrManagerRef.current) {
        // NUCLEAR OPTION: Eliminar camada nativa defeituosa
        // Removemos o texto nativo do mapa para garantir que a UI não tente renderizá-lo
        // enquanto o OCR processa ou após a conclusão.
        setNativeTextMap(prev => {
            const copy = { ...prev };
            delete copy[page];
            return copy;
        });
        
        // Limpar OCR anterior se houver (reset visual para 'processing')
        setOcrMap(prev => {
            const copy = { ...prev };
            delete copy[page];
            return copy;
        });

        ocrManagerRef.current.schedule(page, 'high');
        const engineName = settings.ocrEngine === 'florence' ? 'Neural (Florence)' : 'Padrão (Tesseract)';
        showOcrNotification(`Lendo Página ${page} (${engineName})...`);
    }
  }, [showOcrNotification, settings.ocrEngine]);

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

  const triggerSemanticLens = useCallback(async (pageNumber: number) => {
    if (!pdfDoc) return;
    // Verifica cache em memória
    if (lensData[pageNumber]) return;

    setIsLensLoading(true);
    showOcrNotification("Lente Semântica: Digitalizando página...");

    try {
        const page = await pdfDoc.getPage(pageNumber);
        const scale = 2.0; // Alta resolução para o Gemini
        const viewport = page.getViewport({ scale });
        
        // Renderiza para imagem
        const isOffscreenSupported = typeof OffscreenCanvas !== 'undefined';
        const canvas = isOffscreenSupported 
            ? new OffscreenCanvas(viewport.width, viewport.height) 
            : document.createElement('canvas');
        
        if (!isOffscreenSupported) {
            (canvas as HTMLCanvasElement).width = viewport.width;
            (canvas as HTMLCanvasElement).height = viewport.height;
        }

        const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true }) as any;
        await page.render({ canvasContext: ctx, viewport }).promise;

        const blob = await (canvas as any).convertToBlob({ type: 'image/jpeg', quality: 0.8 });
        
        // Conversão para Base64
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64 = (reader.result as string).split(',')[1];
            try {
                showOcrNotification("Lente Semântica: Analisando layout...");
                const markdown = await performSemanticOcr(base64);
                
                setLensData(prev => ({
                    ...prev,
                    [pageNumber]: {
                        markdown,
                        processedAt: Date.now()
                    }
                }));
                showOcrNotification("Análise completa.");
            } catch (err: any) {
                showOcrNotification(`Erro na Lente: ${err.message}`);
            } finally {
                setIsLensLoading(false);
            }
        };
        reader.readAsDataURL(blob);

    } catch (e: any) {
        console.error("Lens error", e);
        showOcrNotification("Erro ao capturar página.");
        setIsLensLoading(false);
    }
  }, [pdfDoc, lensData, showOcrNotification]);

  const generateSearchIndex = useCallback(async (fullText: string) => {
      const blob = currentBlobRef.current;
      if (fileId && blob && fullText.trim().length > 100) {
          showOcrNotification("Gerando índice semântico (RAG)...");
          try {
              await indexDocumentForSearch(fileId, blob, fullText);
              showOcrNotification("Índice semântico criado.");
          } catch (e) {
              console.error("Index failed", e);
              showOcrNotification("Erro na indexação.");
          }
      }
  }, [fileId, showOcrNotification]);

  const value = useMemo(() => ({
    // Proxied to Zustand
    scale, setScale, currentPage, setCurrentPage, numPages, activeTool, setActiveTool,
    isSpread, setIsSpread, spreadSide, setSpreadSide, goNext: nextPage, goPrev: prevPage, jumpToPage: handleJumpToPage,
    
    // Data Context
    settings, updateSettings, annotations, addAnnotation: onAddAnnotation, removeAnnotation: onRemoveAnnotation,
    ocrMap, nativeTextMap, ocrStatusMap, setPageOcrData, updateOcrWord, 
    triggerOcr, showOcrModal, setShowOcrModal,
    refinePageOcr, hasUnsavedOcr, setHasUnsavedOcr, ocrNotification,
    accessToken, fileId, updateSourceBlob: onUpdateSourceBlob, currentBlobRef, 
    getUnburntOcrMap, markOcrAsSaved,
    chatRequest, setChatRequest,
    generateSearchIndex,
    docPageOffset: initialPageOffset, 
    setDocPageOffset: onSetPageOffset,
    selection, setSelection, onSmartTap,
    
    // Semantic Lens
    lensData, isLensLoading, triggerSemanticLens
  }), [scale, currentPage, numPages, activeTool, isSpread, spreadSide, nextPage, prevPage, handleJumpToPage, settings, annotations, onAddAnnotation, onRemoveAnnotation, ocrMap, nativeTextMap, ocrStatusMap, setPageOcrData, updateOcrWord, triggerOcr, showOcrModal, refinePageOcr, hasUnsavedOcr, setHasUnsavedOcr, ocrNotification, accessToken, fileId, onUpdateSourceBlob, getUnburntOcrMap, markOcrAsSaved, chatRequest, generateSearchIndex, initialPageOffset, onSetPageOffset, selection, setSelection, onSmartTap, lensData, isLensLoading, triggerSemanticLens]);

  return <PdfContext.Provider value={value}>{children}</PdfContext.Provider>;
};
