
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { runBackgroundOcr } from '../services/backgroundOcrService';

interface GlobalContextType {
  isOcrRunning: boolean;
  ocrProgress: { current: number; total: number; filename: string } | null;
  startGlobalOcr: (fileId: string, filename: string, blob: Blob, start: number, end: number) => void;
  notifications: Array<{ id: string; message: string; type: 'info' | 'success' | 'error' }>;
  addNotification: (message: string, type?: 'info' | 'success' | 'error') => void;
  removeNotification: (id: string) => void;
  // OCR Completion Modal State
  ocrCompletion: { fileId: string; filename: string; sourceBlob: Blob } | null;
  clearOcrCompletion: () => void;
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
  const [ocrCompletion, setOcrCompletion] = useState<{ fileId: string; filename: string; sourceBlob: Blob } | null>(null);

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

  const startGlobalOcr = useCallback((fileId: string, filename: string, blob: Blob, start: number, end: number) => {
    if (isOcrRunning) {
        addNotification("Já existe um processo de OCR em andamento.", 'error');
        return;
    }

    setIsOcrRunning(true);
    setOcrProgress({ current: 0, total: end - start + 1, filename });
    addNotification(`Iniciando OCR de "${filename}" (Páginas ${start}-${end})...`, 'info');

    runBackgroundOcr({
        fileId,
        blob,
        startPage: start,
        endPage: end,
        onProgress: (page) => {
            setOcrProgress(prev => prev ? { ...prev, current: prev.current + 1 } : null);
            // Opcional: Não notificar cada página para não poluir, apenas progresso visual
        },
        onComplete: () => {
            setIsOcrRunning(false);
            setOcrProgress(null);
            // Trigger Modal instead of just a toast
            setOcrCompletion({ fileId, filename, sourceBlob: blob });
        },
        onError: (err) => {
            setIsOcrRunning(false);
            setOcrProgress(null);
            addNotification(`Erro no OCR: ${err}`, 'error');
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
        clearOcrCompletion
    }}>
      {children}
    </GlobalContext.Provider>
  );
};
