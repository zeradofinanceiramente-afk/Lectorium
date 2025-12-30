
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
  pageDimensions: { width: number, height: number } | null;
  
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
    setViewMode: (viewMode) => set({ viewMode }),

    // Lógica de Virtualização Otimizada
    handleScroll: (scrollTop, viewportHeight) => {
        const { numPages, pageDimensions, scale } = get();
        if (!pageDimensions || numPages === 0) return;

        // Altura estimada de cada página + gap (assumindo altura uniforme por enquanto)
        // Otimização: Em PDFs mistos, isso precisaria de um mapa de alturas, mas p/ MVP usamos a pág 1.
        const PAGE_GAP = 40; 
        const itemHeight = (pageDimensions.height * scale) + PAGE_GAP;
        
        // Cálculo da Janela Visível
        const startIndex = Math.floor(scrollTop / itemHeight);
        const endIndex = Math.min(
            numPages - 1,
            Math.floor((scrollTop + viewportHeight) / itemHeight)
        );

        // Adiciona Buffer (1 página acima, 1 abaixo) para scroll suave
        const bufferedStart = Math.max(0, startIndex - 1);
        const bufferedEnd = Math.min(numPages - 1, endIndex + 1);

        set({ 
            scrollTop, 
            visibleRange: { start: bufferedStart, end: bufferedEnd } 
        });

        // Atualiza página atual baseada no centro da tela (para sincronizar com HUD)
        const centerPage = Math.floor((scrollTop + (viewportHeight / 2)) / itemHeight) + 1;
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
        const { setNumPages, setCurrentPage, setSpreadSide, setIsSpread, viewMode } = get();
        
        setCurrentPage(page);
        
        if (viewMode === 'single') {
            setSpreadSide('left');
            setIsSpread(false);
        } else {
            // Em modo contínuo, jumpToPage precisa ser tratado pela UI para rolar o container
            // O estado é atualizado aqui, mas o efeito colateral de scroll fica no componente
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
