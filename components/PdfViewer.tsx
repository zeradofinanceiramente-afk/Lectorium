
import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { Loader2, ArrowLeft, Menu, Save, Copy, Lock, AlertTriangle, X, Download, CloudOff, Cloud, ScanLine } from 'lucide-react';
import { PDFDocumentProxy } from 'pdfjs-dist';

// Hooks & Context
import { usePdfDocument } from '../hooks/usePdfDocument';
import { usePdfAnnotations } from '../hooks/usePdfAnnotations';
import { usePdfSelection } from '../hooks/usePdfSelection';
import { PdfProvider, usePdfContext } from '../context/PdfContext';

// Components
import { PdfPage } from './pdf/PdfPage';
import { PdfToolbar } from './pdf/PdfToolbar';
import { PdfSidebar, SidebarTab } from './pdf/PdfSidebar';
import { SelectionMenu } from './pdf/SelectionMenu';
import { OcrRangeModal } from './pdf/modals/OcrRangeModal';

// Services
import { burnAnnotationsToPdf } from '../services/pdfModifierService';
import { updateDriveFile, uploadFileToDrive } from '../services/driveService';
import { fetchDefinition } from '../services/dictionaryService';
import { 
  saveOfflineFile, isFileOffline, addToSyncQueue, 
  acquireFileLock, releaseFileLock 
} from '../services/storageService';
import { Annotation } from '../types';

interface Props {
  accessToken?: string | null;
  fileId: string;
  fileName: string;
  fileParents?: string[];
  uid: string;
  onBack: () => void;
  fileBlob?: Blob;
  isPopup?: boolean;
  onToggleNavigation?: () => void;
  onAuthError?: () => void;
}

interface PdfViewerContentProps extends Props {
  originalBlob: Blob | null;
  setOriginalBlob: (b: Blob) => void;
  pdfDoc: PDFDocumentProxy | null;
  pageDimensions: { width: number, height: number } | null;
  jumpToPageRef: React.MutableRefObject<((page: number) => void) | null>;
}

const PdfViewerContent: React.FC<PdfViewerContentProps> = ({ 
  accessToken, fileId, fileName, fileParents, onBack, originalBlob, setOriginalBlob, pdfDoc, pageDimensions, jumpToPageRef, onToggleNavigation 
}) => {
  const { 
    scale, setScale, activeTool, settings, 
    annotations, addAnnotation,
    currentPage, setCurrentPage, numPages,
    ocrMap, setHasUnsavedOcr, ocrNotification,
    goNext, goPrev,
    currentBlobRef, // Acesso direto ao blob via ref do contexto
    getUnburntOcrMap, // Acesso ao mapa filtrado para save
    markOcrAsSaved, // Confirmação de consolidação
    setChatRequest,
    showOcrModal, setShowOcrModal
  } = usePdfContext();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    jumpToPageRef.current = (page: number) => {
        setCurrentPage(page);
    };
  }, [jumpToPageRef, setCurrentPage]);

  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('annotations');
  
  // Immersive Mode State: Retracted by default
  const [isHeaderVisible, setIsHeaderVisible] = useState(false);

  const { selection, setSelection } = usePdfSelection({
    activeTool, scale, containerRef
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  
  const [isOfflineAvailable, setIsOfflineAvailable] = useState(false);

  const [showDefinitionModal, setShowDefinitionModal] = useState(false);
  const [definition, setDefinition] = useState<any>(null);
  
  const pointersRef = useRef<Map<number, { x: number, y: number }>>(new Map());
  const prevPinchDistRef = useRef<number | null>(null);
  const touchStartRef = useRef<{ x: number, y: number } | null>(null);

  useEffect(() => {
    isFileOffline(fileId).then(setIsOfflineAvailable);
  }, [fileId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goPrev, goNext]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (activeTool === 'ink' || activeTool === 'eraser') return;
    if (scale <= 1.2) {
      const x = e.touches[0].clientX;
      const width = window.innerWidth;
      const threshold = 50; // Zona de ativação nas bordas

      // Permite o gesto apenas se começar nas beiradas
      if (x < threshold || x > width - threshold) {
        touchStartRef.current = { x, y: e.touches[0].clientY };
      } else {
        touchStartRef.current = null;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const hasNativeSelection = window.getSelection() && window.getSelection()!.toString().length > 0;
    if (selection || hasNativeSelection || activeTool === 'ink' || activeTool === 'eraser') {
        touchStartRef.current = null;
        return;
    }
    const touchEnd = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    const diffX = touchStartRef.current.x - touchEnd.x;
    const diffY = touchStartRef.current.y - touchEnd.y;
    const startX = touchStartRef.current.x;
    const width = window.innerWidth;
    const threshold = 50;

    if (Math.abs(diffX) > 50 && Math.abs(diffY) < 100) {
      // Gesto para Esquerda (Avançar) - Só funciona se começou na borda direita
      if (diffX > 0 && startX > width - threshold) {
        goNext();
      }
      // Gesto para Direita (Voltar) - Só funciona se começou na borda esquerda
      else if (diffX < 0 && startX < threshold) {
        goPrev();
      }
    }
    touchStartRef.current = null;
  };

  const createHighlight = () => {
    if (!selection) return;
    selection.relativeRects.forEach(rect => {
      addAnnotation({
        id: `hl-${Date.now()}-${Math.random()}`,
        page: selection.page,
        bbox: [rect.x, rect.y, rect.width, rect.height],
        type: 'highlight',
        text: selection.text,
        color: settings.highlightColor,
        opacity: settings.highlightOpacity
      });
    });
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleDownload = async () => {
     // Usa o blob atual (que pode já ter o OCR queimado)
     const sourceBlob = currentBlobRef.current || originalBlob;
     if (!sourceBlob) return;
     
     // Usa getUnburntOcrMap para enviar apenas OCR que AINDA NÃO está no blob
     const ocrToBurn = getUnburntOcrMap();
     
     const newBlob = await burnAnnotationsToPdf(sourceBlob, annotations, ocrToBurn);
     
     const url = URL.createObjectURL(newBlob);
     const a = document.createElement('a');
     a.href = url;
     a.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
     document.body.appendChild(a);
     a.click();
     document.body.removeChild(a);
     URL.revokeObjectURL(url);
     // Não atualizamos o hasUnsavedOcr aqui pois o download não altera o estado persistente do app
  };

  const handleSave = async (mode: 'local' | 'overwrite' | 'copy') => {
    const sourceBlob = currentBlobRef.current || originalBlob;
    if (!sourceBlob) return;
    if (isSaving) return;

    setIsSaving(true);
    setShowSaveModal(false);
    setShowPermissionModal(false);

    if (mode === 'local') setSaveMessage("Gerando PDF...");
    else if (mode === 'copy') setSaveMessage("Criando Cópia...");
    else setSaveMessage("Sincronizando...");

    try {
        if (mode === 'local') {
            await handleDownload();
            return;
        }

        const hasLock = await acquireFileLock(fileId);
        if (!hasLock && mode === 'overwrite') {
            alert("O arquivo está sendo sincronizado em segundo plano. Tente novamente em alguns segundos.");
            return;
        }

        // 1. Obtém apenas o OCR novo (delta)
        const ocrToBurn = getUnburntOcrMap();
        // 2. Queima anotações e o novo OCR no PDF
        const newBlob = await burnAnnotationsToPdf(sourceBlob, annotations, ocrToBurn);
        
        const isLocal = fileId.startsWith('local-') || !accessToken;

        if (!isLocal && !navigator.onLine && accessToken) {
            setSaveMessage("Salvando Offline...");
            const fileMeta = { id: fileId, name: fileName, mimeType: 'application/pdf', parents: fileParents };
            await saveOfflineFile(fileMeta, newBlob);
            setIsOfflineAvailable(true);
            
            await addToSyncQueue({
                fileId: mode === 'overwrite' ? fileId : `new-${Date.now()}`,
                action: mode === 'overwrite' ? 'update' : 'create',
                blob: newBlob,
                name: mode === 'overwrite' ? fileName : fileName.replace('.pdf', '') + ' (Anotado).pdf',
                parents: fileParents,
                mimeType: 'application/pdf'
            });
            
            alert("Sem internet. Arquivo atualizado offline e salvo na fila de sincronização.");
            setHasUnsavedOcr(false);
            
            // Marca OCR como salvo no contexto para evitar re-processamento
            if (mode === 'overwrite') {
                markOcrAsSaved(Object.keys(ocrToBurn).map(Number));
                setOriginalBlob(newBlob);
            }
            return;
        }

        if (accessToken && !isLocal) {
            if (mode === 'overwrite') {
               setSaveMessage("Enviando ao Drive...");
               try {
                  await updateDriveFile(accessToken, fileId, newBlob);
                  
                  // Atualiza o blob original (Single Source of Truth)
                  setOriginalBlob(newBlob);
                  
                  // CRÍTICO: Informa ao contexto que essas páginas agora fazem parte do Blob
                  markOcrAsSaved(Object.keys(ocrToBurn).map(Number));
                  
                  if (isOfflineAvailable) {
                      const fileMeta = { id: fileId, name: fileName, mimeType: 'application/pdf', parents: fileParents };
                      await saveOfflineFile(fileMeta, newBlob);
                      alert("Arquivo atualizado no Drive e na cópia Offline!");
                  } else {
                      alert("Arquivo atualizado com sucesso!");
                  }
                  setHasUnsavedOcr(false);
               } catch (e: any) {
                  if (e.message.includes('403') || e.message.includes('permission')) {
                     setShowPermissionModal(true);
                  } else {
                     throw e;
                  }
               }
            } else {
               setSaveMessage("Enviando Cópia...");
               const name = fileName.replace('.pdf', '') + ' (Anotado).pdf';
               await uploadFileToDrive(accessToken, newBlob, name, fileParents);
               alert("Cópia salva com sucesso!");
               // Nota: No modo cópia, não atualizamos o originalBlob nem marcamos OCR como salvo no original
            }
        }
    } catch (e: any) {
        console.error(e);
        alert("Erro ao salvar: " + e.message);
    } finally {
        await releaseFileLock(fileId);
        setIsSaving(false);
        setSaveMessage("");
    }
  };

  const handleFitWidth = async () => {
    if (!pdfDoc || !containerRef.current) return;
    try {
        // Busca o viewport da página ATUAL, não da primeira
        const page = await pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale: 1 });
        
        const containerWidth = containerRef.current.clientWidth;
        const isMobile = window.innerWidth < 768;
        const padding = isMobile ? 20 : 100;
        
        // Calcula escala baseada na página atual
        const newScale = (containerWidth - padding) / viewport.width;
        setScale(newScale);
    } catch (e) {
        console.error("Erro ao ajustar largura:", e);
    }
  };

  const handleExplainAi = () => {
    if (!selection) return;
    const text = selection.text;
    const prompt = `Explique este trecho: "${text}"`;
    
    setSelection(null);
    // Envia o pedido para o Chat Context
    setChatRequest(prompt);
    setSidebarTab('chat');
    setShowSidebar(true);
  };

  const handleDefine = async () => {
    if (!selection) return;
    const word = selection.text;
    setSelection(null);
    setDefinition(null);
    setShowDefinitionModal(true);
    try {
        const def = await fetchDefinition(word);
        setDefinition(def || { word, meanings: ["Definição não encontrada"] });
    } catch (e) {
        setDefinition({ word, meanings: ["Erro ao buscar"] });
    }
  };

  const sidebarAnnotations = useMemo(() => {
    const unique: Annotation[] = [];
    const seen = new Set<string>();
    const sorted = [...annotations].sort((a, b) => {
       if (a.page !== b.page) return a.page - b.page;
       return a.bbox[1] - b.bbox[1];
    });

    sorted.forEach(ann => {
       if (ann.type === 'highlight' && ann.text) {
          const key = `${ann.page}-${ann.color}-${ann.text.trim()}`;
          if (seen.has(key)) return;
          seen.add(key);
          unique.push(ann);
       } else {
          unique.push(ann);
       }
    });
    return unique;
  }, [annotations]);

  const fichamentoText = useMemo(() => {
    return sidebarAnnotations
        .filter(ann => ann.text && ann.text.trim())
        .map(ann => `(Pág ${ann.page}) ${ann.text}`)
        .join('\n\n');
  }, [sidebarAnnotations]);

  const handleDownloadFichamento = () => {
      const blob = new Blob([fichamentoText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Fichamento - ${fileName}.txt`;
      a.click();
      URL.revokeObjectURL(url);
  };

  const filterValues = useMemo(() => {
    const hexToRgb = (hex: string) => {
        const bigint = parseInt(hex.slice(1), 16);
        return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
    };
    const [tr, tg, tb] = hexToRgb(settings.textColor);
    const [br, bg, bb] = hexToRgb(settings.pageColor);
    const rScale = (br - tr) / 255, gScale = (bg - tg) / 255, bScale = (bb - tb) / 255;
    const rOffset = tr / 255, gOffset = tg / 255, bOffset = tb / 255;
    return `${rScale} 0 0 0 ${rOffset} 0 ${gScale} 0 0 ${gOffset} 0 0 ${bScale} 0 ${bOffset} 0 0 0 1 0`;
  }, [settings.textColor, settings.pageColor]);

  const handlePointerDown = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      prevPinchDistRef.current = null;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const points = Array.from(pointersRef.current.values()) as { x: number, y: number }[];
      const dist = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      if (prevPinchDistRef.current) {
        const scaleFactor = dist / prevPinchDistRef.current;
        const adjustedFactor = 1 + (scaleFactor - 1);
        setScale(prev => Math.min(Math.max(0.25, prev * adjustedFactor), 5));
      }
      prevPinchDistRef.current = dist;
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      prevPinchDistRef.current = null;
    }
  };

  // Callback quando o OCR global é iniciado no modal
  const handleOcrConfirm = useCallback(() => {
      // Fecha o modal
      setShowOcrModal(false);
      // Volta para o Dashboard para permitir o processamento em background sem pesar a UI
      onBack();
  }, [onBack, setShowOcrModal]);

  return (
    <div className="flex flex-col h-screen bg-[#2e2e2e] text-text relative" onContextMenu={(e) => e.preventDefault()}>
      <svg style={{ width: 0, height: 0, position: 'absolute' }}>
        <filter id="pdf-recolor"><feColorMatrix type="matrix" values={filterValues} /></filter>
      </svg>
      
      {/* OCR Status Notification */}
      {ocrNotification && (
        <div className="fixed top-28 left-1/2 -translate-x-1/2 z-[80] animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="bg-black/60 backdrop-blur-md border border-white/10 px-6 py-2.5 rounded-full shadow-2xl flex items-center gap-3">
                <ScanLine size={16} className={`text-brand ${ocrNotification.includes('Iniciando') || ocrNotification.includes('Processando') ? 'animate-pulse' : ''}`} />
                <span className="text-sm font-medium text-white tracking-wide">
                    {ocrNotification}
                </span>
            </div>
        </div>
      )}
      
      {/* Header Container deslizante */}
      <div 
        ref={headerRef}
        className={`fixed top-0 left-0 right-0 z-[50] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform ${isHeaderVisible ? 'translate-y-0' : '-translate-y-full'}`}
      >
         {/* Barra Principal */}
         <div className="bg-black border-b border-border flex flex-wrap items-center justify-between px-4 py-2 relative z-20 shadow-2xl">
             <div className="flex items-center gap-1 py-1">
                {onToggleNavigation && (
                    <button onClick={onToggleNavigation} className="p-2 hover:bg-white/10 rounded-full text-white mr-1" title="Menu Principal"><Menu size={20}/></button>
                )}
                <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full text-white" title="Voltar"><ArrowLeft size={20}/></button>
                <div className="flex flex-col ml-2"><span className="text-sm font-medium truncate max-w-[150px] md:max-w-[300px] text-white">{fileName}</span><span className="text-xs text-text-sec">{currentPage} / {numPages}</span></div>
             </div>
             <div className="flex items-center gap-1 md:gap-2 py-1">
                <button onClick={() => setShowSaveModal(true)} className="flex items-center gap-2 bg-brand text-bg px-3 py-1.5 rounded-full text-sm font-bold shadow-lg hover:brightness-110 transition-all ml-1">
                    <Save size={16}/> <span className="hidden sm:inline">Salvar</span>
                </button>
                <button onClick={() => setShowSidebar(true)} className="p-2 hover:bg-white/10 rounded-full text-white" title="Ferramentas"><Menu size={20}/></button>
             </div>
         </div>

         {/* Puxador (Handle) */}
         <button
            onClick={() => setIsHeaderVisible(!isHeaderVisible)}
            className={`absolute -bottom-6 left-1/2 -translate-x-1/2 z-10
                       bg-black border-b-2 border-l-2 border-r-2 border-brand
                       rounded-b-2xl px-10 py-2 cursor-pointer pointer-events-auto
                       hover:bg-brand/10 transition-all duration-300 group
                       flex flex-col items-center gap-1
                       ${isHeaderVisible ? 'shadow-[0_10px_30px_-10px_rgba(74,222,128,0.4)]' : 'shadow-[0_4px_15px_rgba(0,0,0,0.5)]'}
                       `}
            title={isHeaderVisible ? "Recolher menu" : "Expandir menu"}
         >
            <div className={`w-10 h-1 rounded-full transition-all duration-300 ${
                isHeaderVisible 
                    ? 'bg-brand shadow-[0_0_8px_rgba(74,222,128,0.8)]' 
                    : 'bg-brand/40 group-hover:bg-brand'
            }`} />
         </button>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        <PdfSidebar isOpen={showSidebar} onClose={() => setShowSidebar(false)} activeTab={sidebarTab} onTabChange={setSidebarTab} sidebarAnnotations={sidebarAnnotations} fichamentoText={fichamentoText} onCopyFichamento={() => navigator.clipboard.writeText(fichamentoText)} onDownloadFichamento={handleDownloadFichamento} />
        
        {/* Main Content Area com Padding de Respiro Superior para evitar conflitos com a UI */}
        <div 
            ref={containerRef} 
            className={`flex-1 overflow-auto relative bg-[#1c1c1e] flex flex-col items-center p-4 md:p-8 pt-[3.5cm] ${activeTool === 'ink' ? 'touch-none' : ''}`} 
            onPointerDown={handlePointerDown} 
            onPointerMove={handlePointerMove} 
            onPointerUp={handlePointerUp} 
            onPointerLeave={handlePointerUp} 
            onTouchStart={handleTouchStart} 
            onTouchEnd={handleTouchEnd}
        >
            <PdfToolbar onFitWidth={handleFitWidth} />
            {selection && <SelectionMenu selection={selection} onHighlight={createHighlight} onExplainAi={handleExplainAi} onDefine={handleDefine} onCopy={() => navigator.clipboard.writeText(selection.text)} onClose={() => setSelection(null)} />}
            
            <div className="transition-shadow duration-200 ease-out shadow-2xl" style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
                <PdfPage pageNumber={currentPage} filterValues={filterValues} pdfDoc={pdfDoc} />
            </div>
        </div>
      </div>
      {showDefinitionModal && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
              <div className="bg-surface p-6 rounded-2xl max-w-md w-full relative">
                  <button onClick={() => setShowDefinitionModal(false)} className="absolute top-4 right-4"><X size={20}/></button>
                  <h3 className="text-xl font-bold mb-4">{definition?.word || "Carregando..."}</h3>
                  <div className="space-y-2 text-sm">{definition?.meanings.map((m: string, i: number) => <p key={i}>{m}</p>)}</div>
              </div>
          </div>
      )}
      {showSaveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-surface border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
            <button onClick={() => setShowSaveModal(false)} className="absolute top-4 right-4 text-text-sec"><X size={20}/></button>
            <h3 className="text-xl font-bold mb-4 text-white">Salvar Arquivo</h3>
            <div className="space-y-3">
              <button onClick={() => handleSave('local')} className="w-full flex items-center gap-4 p-4 rounded-xl bg-surface border border-border hover:bg-white/5 text-left transition-colors">
                 <div className="bg-surface border border-border text-text p-2 rounded"><Download size={20}/></div>
                 <div><div className="font-bold text-text">Fazer Download</div><div className="text-xs text-text-sec">Baixar cópia no dispositivo</div></div>
              </button>
              <button onClick={() => handleSave('copy')} className="w-full flex items-center gap-4 p-4 rounded-xl bg-brand/10 border border-brand/20 hover:bg-brand/20 text-left transition-colors">
                <div className="bg-brand text-bg p-2 rounded"><Copy size={20}/></div>
                <div><div className="font-bold text-brand">Salvar como Cópia</div><div className="text-xs text-text-sec opacity-80">Criar novo arquivo no Drive</div></div>
              </button>
              <button onClick={() => handleSave('overwrite')} className="w-full flex items-center gap-4 p-4 rounded-xl bg-surface border border-border hover:bg-red-500/10 text-left transition-colors">
                <div className="bg-surface text-red-500 p-2 rounded"><AlertTriangle size={20}/></div>
                <div><div className="font-bold text-text">Substituir Original</div><div className="text-xs text-text-sec">Sobrescrever o arquivo existente</div></div>
              </button>
            </div>
            {!navigator.onLine && <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center gap-2 text-xs text-yellow-500"><CloudOff size={16} /><span>Modo Offline: Alterações serão sincronizadas quando online.</span></div>}
          </div>
        </div>
      )}
      
      {/* Global Save Overlay */}
      {isSaving && (
          <div className="fixed inset-0 z-[200] bg-bg/90 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-300">
              <div className="relative mb-6">
                  <div className="absolute inset-0 bg-brand/20 rounded-full blur-xl animate-pulse"></div>
                  <div className="relative bg-surface p-4 rounded-full border border-brand/30 shadow-2xl">
                      <Save size={40} className="text-brand animate-pulse" />
                  </div>
                  <div className="absolute -bottom-2 -right-2 bg-bg rounded-full p-1 border border-border">
                      <Loader2 size={20} className="animate-spin text-white" />
                  </div>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{saveMessage}</h3>
              <p className="text-sm text-text-sec">Não feche a janela.</p>
          </div>
      )}

      {showPermissionModal && (
          <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4">
              <div className="bg-surface p-6 rounded-2xl max-sm w-full text-center">
                  <Lock size={40} className="mx-auto text-red-500 mb-4"/>
                  <h3 className="font-bold text-lg mb-2 text-white">Permissão Negada</h3>
                  <p className="text-sm text-text-sec mb-4">Não foi possível substituir o arquivo original. Salve como cópia.</p>
                  <button onClick={() => handleSave('copy')} className="w-full bg-brand text-bg py-3 rounded-xl font-bold">Salvar Cópia</button>
              </div>
          </div>
      )}

      <OcrRangeModal 
        isOpen={showOcrModal}
        onClose={() => setShowOcrModal(false)}
        numPages={numPages}
        currentPage={currentPage}
        onConfirm={handleOcrConfirm}
      />
    </div>
  );
};

export const PdfViewer: React.FC<Props> = (props) => {
  const { pdfDoc, originalBlob, setOriginalBlob, numPages, loading, error, scale: docScale, setScale: setDocScale, pageDimensions } = usePdfDocument({
    fileId: props.fileId,
    fileBlob: props.fileBlob,
    accessToken: props.accessToken,
    onAuthError: props.onAuthError
  });
  const { annotations, addAnnotation, removeAnnotation } = usePdfAnnotations(props.fileId, props.uid, pdfDoc);
  const jumpToPageRef = useRef<((page: number) => void) | null>(null);
  if (loading) return <div className="flex h-full items-center justify-center bg-bg text-text"><Loader2 className="animate-spin text-brand" size={40}/></div>;
  if (error) return <div className="flex h-full items-center justify-center text-red-500">{error}</div>;
  return (
    <PdfProvider 
      initialScale={docScale} 
      numPages={numPages} 
      annotations={annotations} 
      onAddAnnotation={addAnnotation} 
      onRemoveAnnotation={removeAnnotation} 
      onJumpToPage={(page) => jumpToPageRef.current?.(page)} 
      accessToken={props.accessToken}
      fileId={props.fileId}
      pdfDoc={pdfDoc}
      onUpdateSourceBlob={setOriginalBlob} // Conecta a função de atualização
      currentBlob={originalBlob}
    >
       <PdfViewerContent {...props} originalBlob={originalBlob} setOriginalBlob={setOriginalBlob} pdfDoc={pdfDoc} pageDimensions={pageDimensions} jumpToPageRef={jumpToPageRef} />
    </PdfProvider>
  );
};
