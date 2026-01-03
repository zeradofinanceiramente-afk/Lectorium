import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Annotation, SemanticLensData } from '../types';
import { loadOcrData, saveOcrData } from '../services/storageService';
import { PDFDocumentProxy } from 'pdfjs-dist';
import { performSemanticOcr, performLayoutOcr, performTranslatedLayoutOcr } from '../services/aiService';
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

// Simplified Context State
interface PdfContextState {
  // Legacy accessors proxied to Zustand
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

  // Data State
  settings: PdfSettings;
  updateSettings: (newSettings: Partial<PdfSettings>) => void;
  annotations: Annotation[];
  addAnnotation: (ann: Annotation) => void;
  removeAnnotation: (ann: Annotation) => void;
  ocrMap: Record<number, any[]>;
  nativeTextMap: Record<number, string>; 
  setPageOcrData: (page: number, words: any[]) => void;
  updateOcrWord: (page: number, wordIndex: number, newText: string) => void;
  showOcrModal: boolean;
  setShowOcrModal: (v: boolean) => void;
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
  setPageLensData: (page: number, data: SemanticLensData) => void; // New helper for batch updates

  // Translation
  translationMap: Record<number, any[]>; // Similar to ocrMap but translated
  triggerTranslation: (page: number) => Promise<void>;
  isTranslationMode: boolean;
  toggleTranslationMode: () => void;
}

const PdfContext = createContext<PdfContextState | null>(null);

export const usePdfContext = () => {
  const context = useContext(PdfContext);
  if (!context) throw new Error('usePdfContext must be used within a PdfProvider');
  return context;
};

export const useOptionalPdfContext = () => {
  return useContext(PdfContext);
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
  showConfidenceOverlay: false,
  pageColor: "#ffffff", 
  textColor: "#000000", 
  highlightColor: "#4ade80",
  highlightOpacity: 0.4, 
  inkColor: "#a855f7", 
  inkStrokeWidth: 42, 
  inkOpacity: 0.35,
  toolbarScale: 1, 
  toolbarYOffset: 0
};

export const PdfProvider: React.FC<PdfProviderProps> = ({ 
  children, initialScale, numPages, annotations, onAddAnnotation, onRemoveAnnotation, onJumpToPage, accessToken, fileId, pdfDoc,
  onUpdateSourceBlob, currentBlob, initialPageOffset, onSetPageOffset
}) => {
  // Sync Data Props to Store
  useEffect(() => {
    usePdfStore.getState().setNumPages(numPages);
    usePdfStore.getState().setScale(initialScale);
  }, [numPages, initialScale]);

  // Read State from Store
  const scale = usePdfStore(s => s.scale);
  const currentPage = usePdfStore(s => s.currentPage);
  const activeTool = usePdfStore(s => s.activeTool);
  const isSpread = usePdfStore(s => s.isSpread);
  const spreadSide = usePdfStore(s => s.spreadSide);

  const { setScale, setCurrentPage, setActiveTool, setIsSpread, setSpreadSide, nextPage, prevPage, jumpToPage: storeJump } = usePdfStore();

  const [ocrMap, setOcrMap] = useState<Record<number, any[]>>({});
  const [nativeTextMap, setNativeTextMap] = useState<Record<number, string>>({}); 
  const [hasUnsavedOcr, setHasUnsavedOcr] = useState(false);
  const [ocrNotification, setOcrNotificationState] = useState<string | null>(null);
  const notificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chatRequest, setChatRequest] = useState<string | null>(null);
  const [showOcrModal, setShowOcrModal] = useState(false);
  
  // Semantic Lens State
  const [lensData, setLensData] = useState<Record<number, SemanticLensData>>({});
  const [isLensLoading, setIsLensLoading] = useState(false);

  // Translation State
  const [translationMap, setTranslationMap] = useState<Record<number, any[]>>({});
  const [isTranslationMode, setIsTranslationMode] = useState(false);
  
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
            Object.keys(data).forEach(pStr => {
                const p = parseInt(pStr);
                burnedPagesRef.current.add(p);
            });
        }
    });
  }, [fileId]);

  const updateSettings = useCallback((newSettings: Partial<PdfSettings>) => {
    setSettings(prev => {
        const next = { ...prev, ...newSettings };
        localStorage.setItem('pdf_tool_preferences', JSON.stringify(next));
        return next;
    });
  }, []);

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

  const setPageLensData = useCallback((page: number, data: SemanticLensData) => {
      setLensData(prev => ({ ...prev, [page]: data }));
  }, []);

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

  // --- SEMANTIC LENS ENGINE (GEMINI 1.5) ---
  const triggerSemanticLens = useCallback(async (pageNumber: number) => {
    if (!pdfDoc) return;
    
    // Check if we already processed this page (Markdown cache)
    if (lensData[pageNumber]) return;

    setIsLensLoading(true);
    showOcrNotification("Lente Semântica: Digitalizando página...");

    try {
        const page = await pdfDoc.getPage(pageNumber);
        const scale = 2.0; // High res for Vision
        const viewport = page.getViewport({ scale });
        
        // Prepare dimensions for coordinate mapping
        const w = viewport.width;
        const h = viewport.height;

        // Render to image
        const isOffscreenSupported = typeof OffscreenCanvas !== 'undefined';
        const canvas = isOffscreenSupported 
            ? new OffscreenCanvas(w, h) 
            : document.createElement('canvas');
        
        if (!isOffscreenSupported) {
            (canvas as HTMLCanvasElement).width = w;
            (canvas as HTMLCanvasElement).height = h;
        }

        const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true }) as any;
        await page.render({ canvasContext: ctx, viewport }).promise;

        const blob = await (canvas as any).convertToBlob({ type: 'image/jpeg', quality: 0.8 });
        
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64 = (reader.result as string).split(',')[1];
            try {
                showOcrNotification("Lente Semântica: Analisando layout e extraindo texto...");
                
                // 1. Parallel Request: Standard Markdown (for sidebar) AND Structured Segments (for canvas)
                const [markdown, segments] = await Promise.all([
                    performSemanticOcr(base64),
                    performLayoutOcr(base64)
                ]);
                
                // 2. Map Gemini Segments (0-1000) to Canvas Pixels WITH WORD INTERPOLATION
                const mappedWords = mapSegmentsToWords(segments, w, h, scale);

                // 3. Update Markdown Panel
                setLensData(prev => ({
                    ...prev,
                    [pageNumber]: {
                        markdown,
                        processedAt: Date.now()
                    }
                }));

                // 4. Update Canvas Layer (Inject OCR)
                if (mappedWords.length > 0) {
                    setPageOcrData(pageNumber, mappedWords);
                    showOcrNotification("Camada de texto injetada com sucesso!");
                } else {
                    showOcrNotification("Análise completa (apenas texto sidebar).");
                }

                // 5. Update native text map with the clean semantic text (for RAG later)
                setNativeTextMap(prev => ({ ...prev, [pageNumber]: markdown }));

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
  }, [pdfDoc, lensData, showOcrNotification, setPageOcrData]);

  // --- TRANSLATION ENGINE ---
  const triggerTranslation = useCallback(async (pageNumber: number) => {
    if (!pdfDoc) return;
    if (translationMap[pageNumber]) {
        setIsTranslationMode(true);
        return;
    }

    setIsLensLoading(true);
    showOcrNotification("Traduzindo página (Gemini IA)...");

    try {
        const page = await pdfDoc.getPage(pageNumber);
        const scale = 2.0; 
        const viewport = page.getViewport({ scale });
        const w = viewport.width;
        const h = viewport.height;

        const isOffscreenSupported = typeof OffscreenCanvas !== 'undefined';
        const canvas = isOffscreenSupported 
            ? new OffscreenCanvas(w, h) 
            : document.createElement('canvas');
        
        if (!isOffscreenSupported) {
            (canvas as HTMLCanvasElement).width = w;
            (canvas as HTMLCanvasElement).height = h;
        }

        const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true }) as any;
        await page.render({ canvasContext: ctx, viewport }).promise;

        const blob = await (canvas as any).convertToBlob({ type: 'image/jpeg', quality: 0.8 });
        
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64 = (reader.result as string).split(',')[1];
            try {
                // Call Translation API
                const segments = await performTranslatedLayoutOcr(base64);
                
                // Map results (similar logic to OCR but these are sentences/paragraphs, not words)
                // We keep them as blocks for better readability overlay
                const mappedBlocks: any[] = [];
                const originalW = w / scale;
                const originalH = h / scale;

                segments.forEach((seg: any) => {
                    const [ymin, xmin, ymax, xmax] = seg.box_2d;
                    const text = seg.text;
                    
                    const x = (xmin / 1000) * originalW;
                    const y = (ymin / 1000) * originalH;
                    const width = ((xmax - xmin) / 1000) * originalW;
                    const height = ((ymax - ymin) / 1000) * originalH;

                    mappedBlocks.push({
                        text,
                        bbox: { x0: x, y0: y, x1: x + width, y1: y + height }
                    });
                });

                setTranslationMap(prev => ({ ...prev, [pageNumber]: mappedBlocks }));
                setIsTranslationMode(true);
                showOcrNotification("Tradução aplicada!");

            } catch (err: any) {
                showOcrNotification(`Erro na Tradução: ${err.message}`);
            } finally {
                setIsLensLoading(false);
            }
        };
        reader.readAsDataURL(blob);

    } catch (e: any) {
        showOcrNotification("Erro ao processar tradução.");
        setIsLensLoading(false);
    }
  }, [pdfDoc, translationMap, showOcrNotification]);

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

  // Helper duplicated from backgroundOcrService to avoid circular dependency
  // Ideally should be in a shared util
  function mapSegmentsToWords(segments: any[], w: number, h: number, scale: number) {
        const mappedWords: any[] = [];
        const originalW = w / scale;
        const originalH = h / scale;

        segments.forEach((seg: any) => {
            const [ymin, xmin, ymax, xmax] = seg.box_2d;
            const textContent = seg.text;
            
            if (!textContent) return;

            const lineX0 = (xmin / 1000) * originalW;
            const lineY0 = (ymin / 1000) * originalH;
            const lineX1 = (xmax / 1000) * originalW;
            const lineY1 = (ymax / 1000) * originalH;
            const lineWidth = lineX1 - lineX0;
            
            const words = textContent.split(/(\s+)/);
            const totalChars = textContent.length;
            const avgCharWidth = totalChars > 0 ? lineWidth / totalChars : 0;
            
            let currentX = lineX0;

            words.forEach((word: string) => {
                if (word.length === 0) return;
                const wordWidth = word.length * avgCharWidth;
                
                if (word.trim().length > 0) {
                    mappedWords.push({
                        text: word,
                        confidence: 99, 
                        bbox: { 
                            x0: currentX, 
                            y0: lineY0, 
                            x1: currentX + wordWidth, 
                            y1: lineY1 
                        },
                        isRefined: true,
                        centerScore: (currentX + (wordWidth/2))
                    });
                }
                currentX += wordWidth;
            });
        });
        return mappedWords;
    }

  const value = useMemo(() => ({
    // Proxied to Zustand
    scale, setScale, currentPage, setCurrentPage, numPages, activeTool, setActiveTool,
    isSpread, setIsSpread, spreadSide, setSpreadSide, goNext: nextPage, goPrev: prevPage, jumpToPage: handleJumpToPage,
    
    // Data Context
    settings, updateSettings, annotations, addAnnotation: onAddAnnotation, removeAnnotation: onRemoveAnnotation,
    ocrMap, nativeTextMap, ocrStatusMap: {}, setPageOcrData, updateOcrWord, 
    triggerOcr: triggerSemanticLens, showOcrModal, setShowOcrModal,
    refinePageOcr: async () => {}, // No-op
    hasUnsavedOcr, setHasUnsavedOcr, ocrNotification,
    accessToken, fileId, updateSourceBlob: onUpdateSourceBlob, currentBlobRef, 
    getUnburntOcrMap, markOcrAsSaved,
    chatRequest, setChatRequest,
    generateSearchIndex,
    docPageOffset: initialPageOffset, 
    setDocPageOffset: onSetPageOffset,
    selection, setSelection, onSmartTap,
    
    // Semantic Lens
    lensData, isLensLoading, triggerSemanticLens, setPageLensData,

    // Translation
    translationMap, triggerTranslation, isTranslationMode, toggleTranslationMode: () => setIsTranslationMode(prev => !prev)
  }), [scale, currentPage, numPages, activeTool, isSpread, spreadSide, nextPage, prevPage, handleJumpToPage, settings, annotations, onAddAnnotation, onRemoveAnnotation, ocrMap, nativeTextMap, setPageOcrData, updateOcrWord, triggerSemanticLens, showOcrModal, hasUnsavedOcr, setHasUnsavedOcr, ocrNotification, accessToken, fileId, onUpdateSourceBlob, getUnburntOcrMap, markOcrAsSaved, chatRequest, generateSearchIndex, initialPageOffset, onSetPageOffset, selection, setSelection, onSmartTap, lensData, isLensLoading, setPageLensData, translationMap, isTranslationMode]);

  return <PdfContext.Provider value={value}>{children}</PdfContext.Provider>;
};