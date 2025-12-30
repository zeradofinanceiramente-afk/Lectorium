
import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { Loader2, ArrowLeft, Menu, Save, Copy, Lock, AlertTriangle, X, Download, CloudOff, Cloud, ScanLine, ShieldCheck, Maximize, Minimize, ChevronDown, ChevronUp, Rows, FileText as FileTextIcon, Check } from 'lucide-react';
import { PDFDocumentProxy } from 'pdfjs-dist';

// Hooks & Context
import { usePdfDocument } from '../hooks/usePdfDocument';
import { usePdfAnnotations } from '../hooks/usePdfAnnotations';
import { PdfProvider, usePdfContext } from '../context/PdfContext';
import { usePdfStore } from '../stores/usePdfStore'; // Zustand Store

// Components
import { PdfPage } from './pdf/PdfPage';
import { PdfToolbar } from './pdf/PdfToolbar';
import { PdfSidebar, SidebarTab } from './pdf/PdfSidebar';
import { SelectionMenu } from './pdf/SelectionMenu';
import { OcrRangeModal } from './pdf/modals/OcrRangeModal';
import { ConflictResolutionModal } from './pdf/modals/ConflictResolutionModal';

// Services
import { burnAnnotationsToPdf } from '../services/pdfModifierService';
import { updateDriveFile, uploadFileToDrive } from '../services/driveService';
import { fetchDefinition } from '../services/dictionaryService';
import { 
  saveOfflineFile, isFileOffline, addToSyncQueue, 
  acquireFileLock, releaseFileLock, saveAuditRecord 
} from '../services/storageService';
import { computeSparseHash } from '../utils/hashUtils';
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
  conflictDetected: boolean;
  isCheckingIntegrity: boolean;
  hasPageMismatch: boolean;
  resolveConflict: (action: 'use_external' | 'restore_lectorium' | 'merge') => void;
}

const PdfViewerContent: React.FC<PdfViewerContentProps> = ({ 
  accessToken, fileId, fileName, fileParents, onBack, originalBlob, setOriginalBlob, pdfDoc, pageDimensions, jumpToPageRef, onToggleNavigation,
  conflictDetected, isCheckingIntegrity, hasPageMismatch, resolveConflict 
}) => {
  // Zustand State
  const viewMode = usePdfStore(state => state.viewMode);
  const setViewMode = usePdfStore(state => state.setViewMode);
  const scale = usePdfStore(state => state.scale);
  const setScale = usePdfStore(state => state.setScale);
  const currentPage = usePdfStore(state => state.currentPage);
  const setCurrentPage = usePdfStore(state => state.setCurrentPage);
  const numPages = usePdfStore(state => state.numPages);
  const activeTool = usePdfStore(state => state.activeTool);
  const visibleRange = usePdfStore(state => state.visibleRange);
  const handleScroll = usePdfStore(state => state.handleScroll);
  const goNext = usePdfStore(state => state.nextPage);
  const goPrev = usePdfStore(state => state.prevPage);

  // Context Data
  const { 
    settings, 
    annotations, addAnnotation,
    ocrMap, setHasUnsavedOcr, ocrNotification,
    currentBlobRef,
    getUnburntOcrMap,
    markOcrAsSaved,
    setChatRequest,
    showOcrModal, setShowOcrModal,
    docPageOffset,
    selection, setSelection
  } = usePdfContext();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  
  // TRANSIENT ZOOM REFS
  // Usamos refs para manipular o DOM diretamente durante gestos, evitando re-renders do React
  const visualContentRef = useRef<HTMLDivElement>(null);
  const startPinchDistRef = useRef<number>(0);
  const startScaleRef = useRef<number>(1);
  const pointersRef = useRef<Map<number, { x: number, y: number }>>(new Map());
  const touchStartRef = useRef<{ x: number, y: number } | null>(null);

  // Expose Jump Logic to Parent Ref
  useEffect(() => {
    jumpToPageRef.current = (page: number) => {
        setCurrentPage(page);
        // Em modo contínuo, precisamos rolar o container manualmente
        if (viewMode === 'continuous' && containerRef.current && pageDimensions) {
            const PAGE_GAP = 40;
            const itemHeight = (pageDimensions.height * scale) + PAGE_GAP;
            containerRef.current.scrollTo({ top: (page - 1) * itemHeight, behavior: 'auto' });
        }
    };
  }, [jumpToPageRef, setCurrentPage, viewMode, scale, pageDimensions]);

  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('annotations');
  const [isHeaderVisible, setIsHeaderVisible] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  
  const [isOfflineAvailable, setIsOfflineAvailable] = useState(false);
  const [showDefinitionModal, setShowDefinitionModal] = useState(false);
  const [definition, setDefinition] = useState<any>(null);
  const [isDefinitionCopied, setIsDefinitionCopied] = useState(false);

  useEffect(() => {
    isFileOffline(fileId).then(setIsOfflineAvailable);
  }, [fileId]);

  // Gestures & Keyboards
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goPrev, goNext]);

  // Virtualization Scroll Handler
  const onContainerScroll = (e: React.UIEvent<HTMLDivElement>) => {
      if (viewMode === 'continuous') {
          handleScroll(e.currentTarget.scrollTop, e.currentTarget.clientHeight);
      }
  };

  const createHighlight = () => {
    if (!selection) return;
    selection.relativeRects.forEach((rect, index) => {
      addAnnotation({
        id: `hl-${Date.now()}-${Math.random()}`,
        page: selection.page,
        bbox: [rect.x, rect.y, rect.width, rect.height],
        type: 'highlight',
        text: index === 0 ? selection.text : '',
        color: settings.highlightColor,
        opacity: settings.highlightOpacity
      });
    });
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleDownload = async () => {
     const sourceBlob = currentBlobRef.current || originalBlob;
     if (!sourceBlob) return;
     const ocrToBurn = getUnburntOcrMap();
     const newBlob = await burnAnnotationsToPdf(sourceBlob, annotations, ocrToBurn, docPageOffset);
     const url = URL.createObjectURL(newBlob);
     const a = document.createElement('a');
     a.href = url;
     a.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
     document.body.appendChild(a);
     a.click();
     document.body.removeChild(a);
     URL.revokeObjectURL(url);
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

        const ocrToBurn = getUnburntOcrMap();
        const newBlob = await burnAnnotationsToPdf(sourceBlob, annotations, ocrToBurn, docPageOffset);
        const newHash = await computeSparseHash(newBlob);
        
        const isLocal = fileId.startsWith('local-') || !accessToken;

        if (!isLocal && !navigator.onLine && accessToken) {
            setSaveMessage("Salvando Offline...");
            const fileMeta = { id: fileId, name: fileName, mimeType: 'application/pdf', parents: fileParents };
            await saveOfflineFile(fileMeta, newBlob);
            setIsOfflineAvailable(true);
            await saveAuditRecord(fileId, newHash, annotations.length);
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
                  setOriginalBlob(newBlob);
                  markOcrAsSaved(Object.keys(ocrToBurn).map(Number));
                  await saveAuditRecord(fileId, newHash, annotations.length);
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
          const page = await pdfDoc.getPage(currentPage); 
          const viewport = page.getViewport({ scale: 1 }); 
          const containerWidth = containerRef.current.clientWidth; 
          const isMobile = window.innerWidth < 768; 
          const padding = isMobile ? 20 : 100; 
          const newScale = (containerWidth - padding) / viewport.width; 
          setScale(newScale); 
      } catch (e) { console.error("Erro ao ajustar largura:", e); } 
  };

  const handleExplainAi = () => { if (!selection) return; setChatRequest(`Explique este trecho: "${selection.text}"`); setSelection(null); setSidebarTab('chat'); setShowSidebar(true); };
  const handleDefine = async () => { if (!selection) return; const word = selection.text; setSelection(null); setDefinition(null); setShowDefinitionModal(true); try { const def = await fetchDefinition(word); setDefinition(def || { word, meanings: ["Definição não encontrada"] }); } catch (e) { setDefinition({ word, meanings: ["Erro ao buscar"] }); } };
  
  const handleCopyDefinition = () => {
    if (!definition) return;
    const textToCopy = `${definition.word}\n\n${definition.meanings.join('\n')}`;
    navigator.clipboard.writeText(textToCopy);
    setIsDefinitionCopied(true);
    setTimeout(() => setIsDefinitionCopied(false), 2000);
  };

  const sidebarAnnotations = useMemo(() => annotations.sort((a, b) => (a.page - b.page)), [annotations]);
  
  const fichamentoText = useMemo(() => {
      const seen = new Set<string>();
      return sidebarAnnotations
        .filter(ann => ann.text && ann.text.trim().length > 0)
        .filter(ann => ann.type !== 'note')
        .filter(ann => {
            const signature = `${ann.page}-${ann.text!.trim()}`;
            if (seen.has(signature)) return false;
            seen.add(signature);
            return true;
        })
        .map(ann => `(Pág ${ann.page + docPageOffset}) ${ann.text}`)
        .join('\n\n');
  }, [sidebarAnnotations, docPageOffset]);

  const handleDownloadFichamento = () => { const blob = new Blob([fichamentoText], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `Fichamento.txt`; a.click(); URL.revokeObjectURL(url); };
  const filterValues = useMemo(() => { const hexToRgb = (hex: string) => { const bigint = parseInt(hex.slice(1), 16); return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255]; }; const [tr, tg, tb] = hexToRgb(settings.textColor); const [br, bg, bb] = hexToRgb(settings.pageColor); const rScale = (br - tr) / 255, gScale = (bg - tg) / 255, bScale = (bb - tb) / 255; const rOffset = tr / 255, gOffset = tg / 255, bOffset = tb / 255; return `${rScale} 0 0 0 ${rOffset} 0 ${gScale} 0 0 ${gOffset} 0 0 ${bScale} 0 ${bOffset} 0 0 0 1 0`; }, [settings.textColor, settings.pageColor]);
  
  // --- TRANSIENT GESTURE HANDLING ---
  
  const handlePointerDown = (e: React.PointerEvent) => { 
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); 
      
      // Iniciando Gesto de Pinça (Zoom)
      if (pointersRef.current.size === 2) { 
          const points = Array.from(pointersRef.current.values()) as { x: number; y: number }[];
          const dist = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
          
          startPinchDistRef.current = dist;
          startScaleRef.current = scale; // Snapshot da escala inicial do gesto

          // Define a origem do zoom no ponto médio dos dedos
          if (visualContentRef.current) {
              const rect = visualContentRef.current.getBoundingClientRect();
              const centerX = ((points[0].x + points[1].x) / 2) - rect.left;
              const centerY = ((points[0].y + points[1].y) / 2) - rect.top;
              
              // Desativa transições CSS para garantir fluidez imediata
              visualContentRef.current.style.transition = 'none';
              visualContentRef.current.style.transformOrigin = `${centerX}px ${centerY}px`;
          }
      }
  };

  const handlePointerMove = (e: React.PointerEvent) => { 
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); 
      
      // Executando Gesto de Pinça (Transient Update)
      if (pointersRef.current.size === 2) { 
          const points = Array.from(pointersRef.current.values()) as { x: number; y: number }[];
          const dist = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
          
          if (startPinchDistRef.current > 0) {
              // Calcula a proporção do zoom relativo ao início do gesto
              const ratio = dist / startPinchDistRef.current;
              
              // Aplica diretamente no DOM via CSS Transform (Zero React Re-renders)
              if (visualContentRef.current) {
                  visualContentRef.current.style.transform = `scale(${ratio})`;
              }
          }
      }
  };

  const handlePointerUp = (e: React.PointerEvent) => { 
      pointersRef.current.delete(e.pointerId); 
      
      // Finalizando Gesto de Pinça (Commit State)
      if (pointersRef.current.size < 2 && startPinchDistRef.current > 0) { 
          if (visualContentRef.current) {
              const transform = visualContentRef.current.style.transform;
              const match = transform.match(/scale\((.*?)\)/);
              
              if (match) {
                  const ratio = parseFloat(match[1]);
                  const newScale = startScaleRef.current * ratio;
                  
                  // Commit final para o React/Zustand (Dispara re-render de alta qualidade)
                  setScale(newScale);
                  
                  // Reseta o transform CSS pois o novo layout será renderizado nativamente
                  visualContentRef.current.style.transform = 'none';
                  visualContentRef.current.style.transition = ''; // Restaura transições
              }
          }
          startPinchDistRef.current = 0; 
      }
  };

  const handleTouchStart = (e: React.TouchEvent) => { if (activeTool === 'ink' || activeTool === 'eraser' || activeTool === 'brush') return; if (scale <= 1.2 && viewMode === 'single') { const x = e.touches[0].clientX; const width = window.innerWidth; const threshold = 50; if (x < threshold || x > width - threshold) { touchStartRef.current = { x, y: e.touches[0].clientY }; } else { touchStartRef.current = null; } } };
  const handleTouchEnd = (e: React.TouchEvent) => { if (!touchStartRef.current) return; if (selection || (window.getSelection()?.toString() || '').length > 0 || activeTool === 'ink' || activeTool === 'eraser' || activeTool === 'brush') { touchStartRef.current = null; return; } const touchEnd = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }; const diffX = touchStartRef.current.x - touchEnd.x; const diffY = touchStartRef.current.y - touchEnd.y; const startX = touchStartRef.current.x; const width = window.innerWidth; const threshold = 50; if (Math.abs(diffX) > 50 && Math.abs(diffY) < 100) { if (diffX > 0 && startX > width - threshold) goNext(); else if (diffX < 0 && startX < threshold) goPrev(); } touchStartRef.current = null; };
  const handleOcrConfirm = useCallback(() => { setShowOcrModal(false); onBack(); }, [onBack, setShowOcrModal]);

  const toggleViewMode = () => {
      setViewMode(viewMode === 'single' ? 'continuous' : 'single');
  };

  // Virtualization Helpers
  const PAGE_GAP = 40; 
  const itemHeight = pageDimensions ? (pageDimensions.height * scale) + PAGE_GAP : 1100;
  const totalHeight = numPages * itemHeight;

  return (
    <div className="flex flex-col h-screen bg-[#050505] text-text relative overflow-hidden font-sans" onContextMenu={(e) => e.preventDefault()}>
      <svg style={{ width: 0, height: 0, position: 'absolute' }}>
        <filter id="pdf-recolor"><feColorMatrix type="matrix" values={filterValues} /></filter>
      </svg>
      
      {/* Background Effect: The Void with Grid */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none opacity-20"
        style={{
            backgroundImage: 'radial-gradient(#333 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            backgroundPosition: '0 0'
        }}
      />
      <div className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-b from-transparent via-[#050505]/50 to-[#050505]"/>
      
      {isCheckingIntegrity && (
          <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in">
              <div className="bg-surface p-6 rounded-2xl border border-brand/20 shadow-2xl flex flex-col items-center gap-4">
                  <ShieldCheck size={48} className="text-brand animate-pulse" />
                  <div className="text-center">
                      <h3 className="font-bold text-lg text-white">Verificando Integridade</h3>
                      <p className="text-sm text-text-sec">Validando assinatura digital do arquivo...</p>
                  </div>
              </div>
          </div>
      )}

      {ocrNotification && (
        <div className="fixed top-28 left-1/2 -translate-x-1/2 z-[80] animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="bg-black/60 backdrop-blur-md border border-white/10 px-6 py-2.5 rounded-full shadow-2xl flex items-center gap-3">
                <ScanLine size={16} className={`text-brand ${ocrNotification.includes('Iniciando') || ocrNotification.includes('Processando') ? 'animate-pulse' : ''}`} />
                <span className="text-sm font-medium text-white tracking-wide">{ocrNotification}</span>
            </div>
        </div>
      )}
      
      {/* HUD Header - Floating Capsule */}
      <div 
        ref={headerRef}
        className={`fixed top-4 left-1/2 -translate-x-1/2 w-[95%] max-w-5xl z-[50] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isHeaderVisible ? 'translate-y-0 opacity-100 pointer-events-auto' : '-translate-y-32 opacity-0 pointer-events-none'}`}
      >
         <div className="bg-[#121212]/80 backdrop-blur-xl border border-white/10 flex items-center justify-between px-2 py-1.5 rounded-full shadow-2xl relative z-20">
             <div className="flex items-center gap-1 pl-1">
                {onToggleNavigation && <button onClick={onToggleNavigation} className="p-2.5 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors"><Menu size={20}/></button>}
                <button onClick={onBack} className="p-2.5 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors"><ArrowLeft size={20}/></button>
                <div className="h-6 w-px bg-white/10 mx-1"></div>
                <div className="flex flex-col px-2 max-w-[150px] md:max-w-[400px]">
                    <span className="text-xs font-bold text-white truncate">{fileName}</span>
                    <span className="text-[10px] text-brand/80 font-mono flex items-center gap-1">
                        PÁGINA {currentPage} <span className="text-white/30">/</span> {numPages}
                    </span>
                </div>
             </div>
             
             <div className="flex items-center gap-1 pr-1">
                {/* View Mode Toggle */}
                <button 
                    onClick={toggleViewMode}
                    className="p-2 hover:bg-white/10 rounded-full text-white/80 hover:text-brand transition-colors"
                    title={viewMode === 'single' ? "Modo Slide" : "Modo Contínuo"}
                >
                    {viewMode === 'single' ? <FileTextIcon size={18}/> : <Rows size={18}/>}
                </button>

                <button onClick={() => setShowSaveModal(true)} className="flex items-center gap-2 bg-brand text-[#0b141a] px-4 py-2 rounded-full text-xs font-bold shadow-lg shadow-brand/20 hover:scale-105 transition-all"><Save size={16}/> <span className="hidden sm:inline">SALVAR</span></button>
                <button onClick={() => setShowSidebar(!showSidebar)} className={`p-2.5 hover:bg-white/10 rounded-full transition-colors ${showSidebar ? 'text-brand' : 'text-white/80 hover:text-white'}`}><Menu size={20}/></button>
             </div>
         </div>
      </div>

      {/* THE TACTICAL PULLER */}
      <div 
        className={`fixed left-1/2 -translate-x-1/2 z-[60] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] flex justify-center cursor-pointer ${isHeaderVisible ? 'top-[4.5rem]' : 'top-0'}`}
        onClick={() => setIsHeaderVisible(!isHeaderVisible)}
        title={isHeaderVisible ? "Retrair Menu" : "Mostrar Menu"}
      >
          <div className={`
              bg-black 
              border-b border-x border-brand/50
              shadow-[0_5px_20px_-5px_rgba(0,0,0,0.8)] 
              rounded-b-2xl 
              px-6 py-1.5
              hover:pt-3 hover:pb-2
              transition-all duration-200
              group flex items-center justify-center
          `}>
              <div className="w-8 h-1 bg-white/20 rounded-full group-hover:bg-brand group-hover:shadow-[0_0_8px_var(--brand)] transition-colors" />
          </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        <PdfSidebar isOpen={showSidebar} onClose={() => setShowSidebar(!showSidebar)} activeTab={sidebarTab} onTabChange={setSidebarTab} sidebarAnnotations={sidebarAnnotations} fichamentoText={fichamentoText} onCopyFichamento={() => navigator.clipboard.writeText(fichamentoText)} onDownloadFichamento={handleDownloadFichamento} />
        
        <div 
            ref={containerRef} 
            className={`flex-1 overflow-auto relative flex flex-col items-center p-4 md:p-8 pt-[3.5cm] ${(activeTool === 'ink' || activeTool === 'brush') ? 'touch-none' : ''} ${viewMode === 'continuous' ? 'scroll-smooth' : ''}`} 
            onPointerDown={handlePointerDown} 
            onPointerMove={handlePointerMove} 
            onPointerUp={handlePointerUp} 
            onPointerLeave={handlePointerUp} 
            onTouchStart={handleTouchStart} 
            onTouchEnd={handleTouchEnd}
            onScroll={onContainerScroll}
        >
            <PdfToolbar onFitWidth={handleFitWidth} />
            {selection && <SelectionMenu selection={selection} onHighlight={createHighlight} onExplainAi={handleExplainAi} onDefine={handleDefine} onCopy={() => navigator.clipboard.writeText(selection.text)} onClose={() => setSelection(null)} />}
            
            {viewMode === 'single' ? (
                <div 
                    ref={visualContentRef}
                    className="transition-all duration-300 ease-out" 
                    style={{ boxShadow: '0 0 50px -10px rgba(0,0,0,0.5)' }}
                >
                    <PdfPage pageNumber={currentPage} filterValues={filterValues} pdfDoc={pdfDoc} />
                </div>
            ) : (
                // --- VIRTUALIZATION ENGINE ---
                // Ref anexada ao wrapper contínuo para permitir zoom em todo o conteúdo visível
                <div 
                    ref={visualContentRef}
                    className="relative w-full flex flex-col items-center" 
                    style={{ height: totalHeight }}
                >
                    {/* Renderiza apenas as páginas no range visível */}
                    {Array.from({ length: visibleRange.end - visibleRange.start + 1 }).map((_, i) => {
                        const pageIndex = visibleRange.start + i;
                        const pageNum = pageIndex + 1;
                        // Segurança: não renderizar páginas além do limite
                        if (pageNum > numPages) return null;

                        return (
                            <div 
                                key={pageNum} 
                                className="absolute w-full flex justify-center"
                                style={{ 
                                    top: pageIndex * itemHeight,
                                    height: pageDimensions ? pageDimensions.height * scale : 'auto'
                                }}
                            >
                                <div style={{ boxShadow: '0 0 30px -10px rgba(0,0,0,0.5)' }}>
                                    <PdfPage pageNumber={pageNum} filterValues={filterValues} pdfDoc={pdfDoc} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
      </div>

      {showDefinitionModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
              <div className="bg-[#1e1e1e] p-6 rounded-2xl max-w-md w-full relative border border-white/10 shadow-2xl">
                  <div className="flex justify-between items-start mb-4">
                     <h3 className="text-xl font-bold text-brand">{definition?.word || "Carregando..."}</h3>
                     <div className="flex items-center gap-1">
                        <button
                            onClick={handleCopyDefinition}
                            className="p-2 text-text-sec hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                            title="Copiar definição"
                        >
                            {isDefinitionCopied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                        </button>
                        <button onClick={() => setShowDefinitionModal(false)} className="p-2 text-text-sec hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                            <X size={20}/>
                        </button>
                     </div>
                  </div>
                  
                  <div className="space-y-3 text-sm max-h-[60vh] overflow-y-auto custom-scrollbar">
                     {definition?.meanings.map((m: string, i: number) => (
                         <p key={i} className="text-gray-300 leading-relaxed bg-black/20 p-3 rounded-lg border border-white/5">{m}</p>
                     ))}
                  </div>
                  
                  {definition?.source && (
                      <div className="mt-4 pt-3 border-t border-white/5 text-[10px] text-text-sec flex justify-between">
                          <span>Fonte: {definition.source}</span>
                          {definition.url && <a href={definition.url} target="_blank" rel="noreferrer" className="hover:text-brand underline">Ver original</a>}
                      </div>
                  )}
              </div>
          </div>
      )}
      
      {showSaveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#1e1e1e] border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl relative">
            <button onClick={() => setShowSaveModal(false)} className="absolute top-4 right-4 text-text-sec hover:text-text"><X size={20}/></button>
            <h3 className="text-xl font-bold mb-4 text-white">Salvar Arquivo</h3>
            <div className="space-y-3">
              <button onClick={() => handleSave('local')} className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-transparent hover:border-brand/50 hover:bg-white/10 text-left transition-all group">
                 <div className="bg-black border border-white/10 text-text p-2.5 rounded-lg group-hover:text-brand transition-colors"><Download size={20}/></div>
                 <div><div className="font-bold text-gray-200 group-hover:text-white">Fazer Download</div><div className="text-xs text-gray-500">Baixar cópia no dispositivo</div></div>
              </button>
              <button onClick={() => handleSave('copy')} className="w-full flex items-center gap-4 p-4 rounded-xl bg-brand/5 border border-brand/20 hover:bg-brand/10 text-left transition-all group">
                <div className="bg-brand/10 text-brand p-2.5 rounded-lg"><Copy size={20}/></div>
                <div><div className="font-bold text-brand">Salvar como Cópia</div><div className="text-xs text-text-sec opacity-80">Criar novo arquivo no Drive</div></div>
              </button>
              <button onClick={() => handleSave('overwrite')} className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-transparent hover:border-red-500/50 hover:bg-red-500/10 text-left transition-all group">
                <div className="bg-black text-red-500 p-2.5 rounded-lg border border-white/10"><AlertTriangle size={20}/></div>
                <div><div className="font-bold text-gray-200 group-hover:text-red-200">Substituir Original</div><div className="text-xs text-gray-500">Sobrescrever o arquivo existente</div></div>
              </button>
            </div>
            {!navigator.onLine && <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center gap-2 text-xs text-yellow-500"><CloudOff size={16} /><span>Modo Offline: Alterações serão sincronizadas quando online.</span></div>}
          </div>
        </div>
      )}
      
      {isSaving && (
          <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-300">
              <div className="relative mb-6">
                  <div className="absolute inset-0 bg-brand/20 rounded-full blur-xl animate-pulse"></div>
                  <div className="relative bg-[#121212] p-6 rounded-full border border-brand/30 shadow-2xl"><Save size={48} className="text-brand animate-pulse" /></div>
                  <div className="absolute -bottom-2 -right-2 bg-black rounded-full p-1.5 border border-white/10"><Loader2 size={24} className="animate-spin text-white" /></div>
              </div>
              <h3 className="text-xl font-bold text-white mb-2 tracking-wide uppercase">{saveMessage}</h3>
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
        fileName={fileName}
        onConfirm={handleOcrConfirm} 
      />
      
      <ConflictResolutionModal 
        isOpen={conflictDetected} 
        onClose={() => {}} 
        onResolve={resolveConflict} 
        hasPageMismatch={hasPageMismatch}
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
  
  const annotationsHook = usePdfAnnotations(props.fileId, props.uid, pdfDoc, originalBlob);
  const jumpToPageRef = useRef<((page: number) => void) | null>(null);
  
  if (loading) return <div className="flex h-full items-center justify-center bg-[#050505] text-text"><div className="relative"><div className="absolute inset-0 bg-brand/20 blur-xl rounded-full"></div><Loader2 className="animate-spin text-brand relative z-10" size={48}/></div></div>;
  if (error) return <div className="flex h-full items-center justify-center text-red-500 bg-[#050505]">{error}</div>;
  
  return (
    <PdfProvider 
      initialScale={docScale} 
      numPages={numPages} 
      annotations={annotationsHook.annotations} 
      onAddAnnotation={annotationsHook.addAnnotation} 
      onRemoveAnnotation={annotationsHook.removeAnnotation} 
      onJumpToPage={(page) => jumpToPageRef.current?.(page)} 
      accessToken={props.accessToken}
      fileId={props.fileId}
      pdfDoc={pdfDoc}
      onUpdateSourceBlob={setOriginalBlob}
      currentBlob={originalBlob}
      initialPageOffset={annotationsHook.pageOffset}
      onSetPageOffset={annotationsHook.setPageOffset}
    >
       <PdfViewerContent 
         {...props} 
         originalBlob={originalBlob} 
         setOriginalBlob={setOriginalBlob} 
         pdfDoc={pdfDoc} 
         pageDimensions={pageDimensions} 
         jumpToPageRef={jumpToPageRef}
         conflictDetected={annotationsHook.conflictDetected}
         isCheckingIntegrity={annotationsHook.isCheckingIntegrity}
         hasPageMismatch={annotationsHook.hasPageMismatch}
         resolveConflict={annotationsHook.resolveConflict}
       />
    </PdfProvider>
  );
};
