import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { runBackgroundOcr } from '../services/backgroundOcrService';

interface OcrCompletionState {
    fileId: string;
    filename: string;
    sourceBlob: Blob;
    stoppedAtPage?: number; // Indica se parou no meio
}

interface GlobalContextType {
  isOcrRunning: boolean;
  ocrProgress: { current: number; total: number; filename: string } | null;
  startGlobalOcr: (fileId: string, filename: string, blob: Blob, start: number, end: number, targetLanguage?: string) => void;
  notifications: Array<{ id: string; message: string; type: 'info' | 'success' | 'error' }>;
  addNotification: (message: string, type?: 'info' | 'success' | 'error') => void;
  removeNotification: (id: string) => void;
  // OCR Completion Modal State
  ocrCompletion: OcrCompletionState | null;
  clearOcrCompletion: () => void;
  // Dashboard Layout Config
  dashboardScale: number;
  setDashboardScale: (scale: number) => void;
}

const GlobalContext = createContext<GlobalContextType | null>(null);

export const useGlobalContext = () => {
  const context = useContext(GlobalContext);
  if (!context) throw new Error("useGlobalContext must be used within a GlobalProvider");
  return context;
};

export const GlobalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<{ current: number; total: number; filename: string } | null>(null);
  const [notifications, setNotifications] = useState<Array<{ id: string; message: string; type: 'info' | 'success' | 'error' }>>([]);
  const [ocrCompletion, setOcrCompletion] = useState<OcrCompletionState | null>(null);
  
  // Dashboard Scale State (1-5, Default 3)
  const [dashboardScale, setDashboardScaleState] = useState(3);

  useEffect(() => {
    const savedScale = localStorage.getItem('dashboard_scale');
    if (savedScale) {
        const parsed = parseInt(savedScale);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 5) {
            setDashboardScaleState(parsed);
        }
    }
  }, []);

  const setDashboardScale = useCallback((scale: number) => {
      setDashboardScaleState(scale);
      localStorage.setItem('dashboard_scale', scale.toString());
  }, []);

  const addNotification = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const id = Date.now().toString() + Math.random();
    setNotifications(prev => [...prev, { id, message, type }]);
    
    // Auto-remove após 4 segundos
    setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearOcrCompletion = useCallback(() => {
    setOcrCompletion(null);
  }, []);

  const startGlobalOcr = useCallback((fileId: string, filename: string, blob: Blob, start: number, end: number, targetLanguage?: string) => {
    if (isOcrRunning) {
        addNotification("Já existe um processo de OCR em andamento.", 'error');
        return;
    }

    // Detect if semantic mode based on filename hint (hack for context simplicity)
    const isSemantic = filename === "Semantic Batch";
    const displayFilename = isSemantic 
        ? (targetLanguage ? `Tradução (${targetLanguage})` : "Análise Semântica") 
        : filename;

    setIsOcrRunning(true);
    setOcrProgress({ current: 0, total: end - start + 1, filename: displayFilename });
    addNotification(`Iniciando ${isSemantic ? (targetLanguage ? 'Tradução' : 'Análise Semântica') : 'OCR'} (Páginas ${start}-${end})...`, 'info');

    runBackgroundOcr({
        fileId,
        blob,
        startPage: start,
        endPage: end,
        mode: isSemantic ? 'semantic' : 'simple',
        targetLanguage,
        onProgress: (page) => {
            setOcrProgress(prev => prev ? { ...prev, current: prev.current + 1 } : null);
        },
        onSemanticResult: (page, markdown, segments) => {
            // Dispara evento para que o PdfContext atualize a UI em tempo real
            window.dispatchEvent(new CustomEvent('semantic-page-processed', { 
                detail: { fileId, page, markdown, segments }
            }));
        },
        onComplete: () => {
            setIsOcrRunning(false);
            setOcrProgress(null);
            if (!isSemantic) {
                setOcrCompletion({ fileId, filename, sourceBlob: blob });
            } else {
                addNotification("Processamento concluído. Os dados foram salvos.", "success");
            }
        },
        onQuotaExceeded: (lastPage) => {
            setIsOcrRunning(false);
            setOcrProgress(null);
            
            // Abre o modal de conclusão, mas com flag de parada
            setOcrCompletion({ 
                fileId, 
                filename, 
                sourceBlob: blob,
                stoppedAtPage: lastPage
            });
            
            addNotification(`Limite da API atingido. Processo pausado na página ${lastPage}.`, 'error');
        },
        onError: (err) => {
            setIsOcrRunning(false);
            setOcrProgress(null);
            addNotification(`Erro no processamento: ${err}`, 'error');
        }
    });
  }, [isOcrRunning, addNotification]);

  return (
    <GlobalContext.Provider value={{ 
        isOcrRunning, 
        ocrProgress, 
        startGlobalOcr, 
        notifications, 
        addNotification,
        removeNotification,
        ocrCompletion,
        clearOcrCompletion,
        dashboardScale,
        setDashboardScale
    }}>
      {children}
    </GlobalContext.Provider>
  );
};