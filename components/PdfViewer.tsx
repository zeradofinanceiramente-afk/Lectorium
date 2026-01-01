
import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { Loader2, ShieldCheck, ScanLine, Save, Lock } from 'lucide-react';
import { PDFDocumentProxy } from 'pdfjs-dist';

// Hooks & Context
import { usePdfDocument } from '../hooks/usePdfDocument';
import { usePdfAnnotations } from '../hooks/usePdfAnnotations';
import { PdfProvider, usePdfContext } from '../context/PdfContext';
import { usePdfStore } from '../stores/usePdfStore';
import { usePdfSaver } from '../hooks/usePdfSaver';
import { usePdfGestures } from '../hooks/usePdfGestures'; // Novo Hook

// Components
import { PdfPage } from './pdf/PdfPage';
import { PdfToolbar } from './pdf/PdfToolbar';
import { PdfSidebar, SidebarTab } from './pdf/PdfSidebar';
import { SelectionMenu } from './pdf/SelectionMenu';
import { OcrRangeModal } from './pdf/modals/OcrRangeModal';
import { ConflictResolutionModal } from './pdf/modals/ConflictResolutionModal';
import { PdfHeader } from './pdf/PdfHeader';
import { SaveDocumentModal } from './pdf/modals/SaveDocumentModal';
import { DefinitionModal } from './pdf/modals/DefinitionModal';

// Services
import { fetchDefinition } from '../services/dictionaryService';
import { isFileOffline } from '../services/storageService';

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
    ocrNotification,
    currentBlobRef,
    getUnburntOcrMap,
    markOcrAsSaved,
    setChatRequest,
    showOcrModal, setShowOcrModal,
    setHasUnsavedOcr,
    selection, setSelection
  } = usePdfContext();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const visualContentRef = useRef<HTMLDivElement>(null);

  // --- Logic Extraction: Gestures ---
  const { handlers: gestureHandlers } = usePdfGestures(visualContentRef);

  // Expose Jump Logic to Parent Ref
  useEffect(() => {
    jumpToPageRef.current = (page: number) => {
        setCurrentPage(page);
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

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isOfflineAvailable, setIsOfflineAvailableState] = useState(false);
  const [showDefinitionModal, setShowDefinitionModal] = useState(false);
  const [definition, setDefinition] = useState<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // --- Logic Extraction: Saver Hook ---
  const { 
    handleSave, isSaving, saveMessage, showPermissionModal, 
    setShowPermissionModal, setIsOfflineAvailable 
  } = usePdfSaver({
    fileId, fileName, fileParents, accessToken, annotations, 
    currentBlobRef, originalBlob, 
    ocrToBurn: getUnburntOcrMap(), 
    docPageOffset: 0, 
    onUpdateOriginalBlob: setOriginalBlob,
    onOcrSaved: () => markOcrAsSaved(Object.keys(getUnburntOcrMap()).map(Number)),
    setHasUnsavedOcr
  });

  useEffect(() => {
    setIsOfflineAvailableState(false);
    isFileOffline(fileId).then(setIsOfflineAvailableState);
  }, [fileId]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
    } else {
        document.exitFullscreen().catch(() => {});
    }
  };

  // Keyboard Shortcuts
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
        .map(ann => `(Pág ${ann.page}) ${ann.text}`)
        .join('\n\n');
  }, [sidebarAnnotations]);

  const handleDownloadFichamento = () => { const blob = new Blob([fichamentoText], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `Fichamento.txt`; a.click(); URL.revokeObjectURL(url); };
  const filterValues = useMemo(() => { const hexToRgb = (hex: string) => { const bigint = parseInt(hex.slice(1), 16); return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255]; }; const [tr, tg, tb] = hexToRgb(settings.textColor); const [br, bg, bb] = hexToRgb(settings.pageColor); const rScale = (br - tr) / 255, gScale = (bg - tg) / 255, bScale = (bb - tb) / 255; const rOffset = tr / 255, gOffset = tg / 255, bOffset = tb / 255; return `${rScale} 0 0 0 ${rOffset} 0 ${gScale} 0 0 ${gOffset} 0 0 ${bScale} 0 ${bOffset} 0 0 0 1 0`; }, [settings.textColor, settings.pageColor]);
  
  const handleOcrConfirm = useCallback(() => { setShowOcrModal(false); onBack(); }, [onBack, setShowOcrModal]);

  const PAGE_GAP = 40; 
  const itemHeight = pageDimensions ? (pageDimensions.height * scale) + PAGE_GAP : 1100;
  const totalHeight = numPages * itemHeight;

  return (
    <div className="flex flex-col h-screen bg-[#050505] text-text relative overflow-hidden font-sans" onContextMenu={(e) => e.preventDefault()}>
      <svg style={{ width: 0, height: 0, position: 'absolute' }}>
        <filter id="pdf-recolor"><feColorMatrix type="matrix" values={filterValues} /></filter>
      </svg>
      
      {/* Background Effect */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20" style={{ backgroundImage: 'radial-gradient(#333 1px, transparent 1px)', backgroundSize: '40px 40px', backgroundPosition: '0 0' }} />
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
      
      <PdfHeader 
        isVisible={isHeaderVisible}
        fileName={fileName}
        currentPage={currentPage}
        numPages={numPages}
        isSaving={isSaving}
        isFullscreen={isFullscreen}
        onToggleNavigation={onToggleNavigation}
        onBack={onBack}
        onSave={() => setShowSaveModal(true)}
        onToggleFullscreen={toggleFullscreen}
        headerRef={headerRef}
      />

      {/* THE TACTICAL PULLER */}
      <div 
        className={`fixed left-1/2 -translate-x-1/2 z-[60] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] flex justify-center cursor-pointer ${isHeaderVisible ? 'top-[4.5rem]' : 'top-0'}`}
        onClick={() => setIsHeaderVisible(!isHeaderVisible)}
        title={isHeaderVisible ? "Retrair Menu" : "Mostrar Menu"}
      >
          <div className="bg-black border-b border-x border-brand/50 shadow-[0_5px_20px_-5px_rgba(0,0,0,0.8)] rounded-b-2xl px-6 py-1.5 hover:pt-3 hover:pb-2 transition-all duration-200 group flex items-center justify-center">
              <div className="w-8 h-1 bg-white/20 rounded-full group-hover:bg-brand group-hover:shadow-[0_0_8px_var(--brand)] transition-colors" />
          </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        <PdfSidebar isOpen={showSidebar} onClose={() => setShowSidebar(!showSidebar)} activeTab={sidebarTab} onTabChange={setSidebarTab} sidebarAnnotations={sidebarAnnotations} fichamentoText={fichamentoText} onCopyFichamento={() => navigator.clipboard.writeText(fichamentoText)} onDownloadFichamento={handleDownloadFichamento} />
        
        <div 
            ref={containerRef} 
            className={`flex-1 overflow-auto relative flex flex-col items-center p-4 md:p-8 pt-[3.5cm] ${(activeTool === 'ink' || activeTool === 'brush') ? 'touch-none' : ''} ${viewMode === 'continuous' ? 'scroll-smooth' : ''}`} 
            {...gestureHandlers} // Applying Gestures
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
                <div 
                    ref={visualContentRef}
                    className="relative w-full flex flex-col items-center" 
                    style={{ height: totalHeight }}
                >
                    {Array.from({ length: visibleRange.end - visibleRange.start + 1 }).map((_, i) => {
                        const pageIndex = visibleRange.start + i;
                        const pageNum = pageIndex + 1;
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

      <DefinitionModal 
        isOpen={showDefinitionModal} 
        onClose={() => setShowDefinitionModal(false)} 
        definition={definition}
      />
      
      <SaveDocumentModal 
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={handleSave}
        isOffline={!navigator.onLine}
      />
      
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
                  <button onClick={() => { handleSave('copy'); setShowPermissionModal(false); }} className="w-full bg-brand text-bg py-3 rounded-xl font-bold">Salvar Cópia</button>
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
  const { pdfDoc, originalBlob, setOriginalBlob, numPages, loading, error, scale: docScale, pageDimensions } = usePdfDocument({
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
