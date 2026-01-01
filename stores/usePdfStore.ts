
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { ToolType } from '../context/PdfContext'; 

// Definição dos Estados de Alta Frequência (UI State)
interface PdfUiState {
  // Viewport State (High Frequency)
  scale: number;
  rotation: number;
  currentPage: number;
  numPages: number;
  
  // Layout State
  viewMode: 'single' | 'continuous'; // Novo: Modo de visualização
  isSpread: boolean;
  spreadSide: 'left' | 'right';
  
  // Dimensions State (Variable Page Size Support)
  pageDimensions: { width: number, height: number } | null; // Fallback (Página 1)
  pageSizes: { width: number, height: number }[]; // Mapa exato de todas as páginas
  
  // Virtualization State (Novo)
  scrollTop: number;
  visibleRange: { start: number; end: number }; // Índices 0-based das páginas visíveis
  
  // Tool State
  activeTool: ToolType;
  
  // Actions (Atomic Setters)
  setScale: (scale: number | ((prev: number) => number)) => void;
  setRotation: (rotation: number) => void;
  setCurrentPage: (page: number | ((prev: number) => number)) => void;
  setNumPages: (num: number) => void;
  setIsSpread: (isSpread: boolean) => void;
  setSpreadSide: (side: 'left' | 'right') => void;
  setActiveTool: (tool: ToolType) => void;
  setPageDimensions: (dims: { width: number, height: number } | null) => void;
  setPageSizes: (sizes: { width: number, height: number }[]) => void;
  setViewMode: (mode: 'single' | 'continuous') => void;
  
  // Virtualization Logic
  handleScroll: (scrollTop: number, viewportHeight: number) => void;
  
  // Helper Actions
  zoomIn: () => void;
  zoomOut: () => void;
  fitWidth: (containerWidth: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  jumpToPage: (page: number) => void;
}

// Criação da Store com Middleware de Seletor
export const usePdfStore = create<PdfUiState>()(
  subscribeWithSelector((set, get) => ({
    // Initial State
    scale: 1.0,
    rotation: 0,
    currentPage: 1,
    numPages: 0,
    viewMode: 'single', // Default atual
    isSpread: false,
    spreadSide: 'left',
    pageDimensions: null,
    pageSizes: [], // Inicialmente vazio
    activeTool: 'cursor',
    scrollTop: 0,
    visibleRange: { start: 0, end: 1 },

    // Atomic Setters
    setScale: (input) => set((state) => {
        const nextScale = typeof input === 'function' ? input(state.scale) : input;
        return { scale: Math.min(Math.max(0.25, nextScale), 5.0) };
    }),
    
    setRotation: (rotation) => set({ rotation }),
    
    setCurrentPage: (input) => set((state) => {
        const next = typeof input === 'function' ? input(state.currentPage) : input;
        const safePage = Math.max(1, Math.min(next, state.numPages || 1));
        return { currentPage: safePage };
    }),

    setNumPages: (numPages) => set({ numPages }),
    setIsSpread: (isSpread) => set({ isSpread }),
    setSpreadSide: (spreadSide) => set({ spreadSide }),
    setActiveTool: (activeTool) => set({ activeTool }),
    setPageDimensions: (pageDimensions) => set({ pageDimensions }),
    setPageSizes: (pageSizes) => set({ pageSizes }),
    setViewMode: (viewMode) => set({ viewMode }),

    // Lógica de Virtualização Otimizada (Suporta Altura Variável)
    handleScroll: (scrollTop, viewportHeight) => {
        const { numPages, pageDimensions, scale, pageSizes } = get();
        if (!pageDimensions || numPages === 0) return;

        const PAGE_GAP = 40; 
        
        let start = 0;
        let end = 0;
        let centerPage = 1;

        // Modo 1: Altura Variável (Precision Mode)
        if (pageSizes.length === numPages) {
            let currentY = 0;
            let foundStart = false;
            let foundCenter = false;
            const centerY = scrollTop + (viewportHeight / 2);

            for (let i = 0; i < numPages; i++) {
                const h = (pageSizes[i].height * scale) + PAGE_GAP;
                const top = currentY;
                const bottom = currentY + h;

                // Detect Start (First visible pixel)
                if (!foundStart && bottom > scrollTop) {
                    start = i;
                    foundStart = true;
                }

                // Detect Center Page
                if (!foundCenter && top <= centerY && bottom >= centerY) {
                    centerPage = i + 1;
                    foundCenter = true;
                }

                // Detect End (Last visible pixel)
                if (top < scrollTop + viewportHeight) {
                    end = i;
                } else if (foundStart) {
                    // Se já passamos do viewport e já achamos o inicio, podemos parar
                    break;
                }

                currentY += h;
            }
        } 
        // Modo 2: Altura Uniforme (Fallback Fast Mode)
        else {
            const itemHeight = (pageDimensions.height * scale) + PAGE_GAP;
            start = Math.floor(scrollTop / itemHeight);
            end = Math.min(numPages - 1, Math.floor((scrollTop + viewportHeight) / itemHeight));
            centerPage = Math.floor((scrollTop + (viewportHeight / 2)) / itemHeight) + 1;
        }

        // Buffer de segurança (1 página acima/abaixo)
        const bufferedStart = Math.max(0, start - 1);
        const bufferedEnd = Math.min(numPages - 1, end + 1);

        set({ 
            scrollTop, 
            visibleRange: { start: bufferedStart, end: bufferedEnd } 
        });

        // Atualiza HUD da página atual
        const safePage = Math.max(1, Math.min(numPages, centerPage));
        if (safePage !== get().currentPage) {
            set({ currentPage: safePage });
        }
    },

    // Helper Actions
    zoomIn: () => {
        const { setScale } = get();
        setScale(s => s + 0.25);
    },

    zoomOut: () => {
        const { setScale } = get();
        setScale(s => s - 0.25);
    },

    fitWidth: (containerWidth) => {
        const { pageDimensions, setScale } = get();
        if (!pageDimensions) return;
        
        const padding = containerWidth < 768 ? 20 : 60;
        const availableWidth = containerWidth - padding;
        const newScale = availableWidth / pageDimensions.width;
        
        setScale(newScale);
    },

    jumpToPage: (page: number) => {
        const { setCurrentPage, setSpreadSide, setIsSpread, viewMode } = get();
        
        setCurrentPage(page);
        
        if (viewMode === 'single') {
            setSpreadSide('left');
            setIsSpread(false);
        }
    },

    nextPage: () => {
        const { currentPage, numPages, isSpread, spreadSide, setCurrentPage, setSpreadSide, viewMode } = get();
        
        if (viewMode === 'continuous') {
             const nextPage = Math.min(numPages, currentPage + 1);
             setCurrentPage(nextPage);
             return;
        }

        // Lógica de Página Dupla (Single Mode)
        if (isSpread && spreadSide === 'left') {
            setSpreadSide('right');
            return;
        }
        
        if (currentPage < numPages) {
            setCurrentPage(currentPage + 1);
            if (isSpread) setSpreadSide('left');
        }
    },

    prevPage: () => {
        const { currentPage, isSpread, spreadSide, setCurrentPage, setSpreadSide, viewMode } = get();
        
        if (viewMode === 'continuous') {
             const prevPage = Math.max(1, currentPage - 1);
             setCurrentPage(prevPage);
             return;
        }

        // Lógica de Página Dupla (Single Mode)
        if (isSpread && spreadSide === 'right') {
            setSpreadSide('left');
            return;
        }
        
        if (currentPage > 1) {
            setCurrentPage(currentPage - 1);
            if (isSpread) setSpreadSide('right');
        }
    }
  }))
);
