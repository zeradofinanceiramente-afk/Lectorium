
import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2, Sparkles, ScanLine, X, Save, RefreshCw, Columns, ArrowLeft, ArrowRight, CheckCircle2, FileSearch, AlertCircle, Wand2, Check } from 'lucide-react';
import { renderCustomTextLayer } from '../../utils/pdfRenderUtils';
import { usePageOcr } from '../../hooks/usePageOcr';
import { NoteMarker } from './NoteMarker';
import { usePdfContext } from '../../context/PdfContext';
import { PDFDocumentProxy } from 'pdfjs-dist';
import { BaseModal } from '../shared/BaseModal';
import { scheduleWork, cancelWork } from '../../utils/scheduler';

interface PdfPageProps {
  pageNumber: number;
  filterValues: string;
  pdfDoc?: PDFDocumentProxy | null;
}

interface ConfidenceWordProps {
  word: any;
  scale: number;
  wordIndex: number;
  onCorrect: (idx: number, txt: string) => void;
}

const ConfidenceWord: React.FC<ConfidenceWordProps> = ({ word, scale, wordIndex, onCorrect }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [tempText, setTempText] = useState(word.text);

    const getConfidenceColor = (conf: number) => {
        if (conf >= 85) return 'rgba(34, 197, 94, 0.15)'; 
        if (conf >= 60) return 'rgba(234, 179, 8, 0.25)'; 
        return 'rgba(239, 68, 68, 0.25)'; 
    };

    const getBorderColor = (conf: number) => {
        if (conf >= 85) return 'rgba(34, 197, 94, 0.4)';
        if (conf >= 60) return 'rgba(234, 179, 8, 0.5)';
        return 'rgba(239, 68, 68, 0.5)';
    };

    const style: React.CSSProperties = {
        position: 'absolute',
        left: word.bbox.x0 * scale,
        top: word.bbox.y0 * scale,
        width: (word.bbox.x1 - word.bbox.x0) * scale,
        height: (word.bbox.y1 - word.bbox.y0) * scale,
        backgroundColor: getConfidenceColor(word.confidence),
        border: `1px solid ${getBorderColor(word.confidence)}`,
        cursor: 'pointer',
        zIndex: isEditing ? 200 : 25,
        transition: 'all 0.1s'
    };

    return (
        <>
            <div 
                style={style} 
                className="hover:scale-105 hover:bg-opacity-40 group"
                onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                title={`Confiança: ${Math.round(word.confidence)}%`}
            />
            {isEditing && (
                <div 
                    className="absolute z-[300] bg-surface p-2 rounded-xl shadow-2xl border border-brand animate-in zoom-in-95"
                    style={{ left: word.bbox.x0 * scale, top: (word.bbox.y1 * scale) + 5 }}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex gap-2 items-center">
                        <input 
                            autoFocus
                            className="bg-bg border border-border rounded px-2 py-1 text-xs text-white focus:border-brand outline-none min-w-[120px]"
                            value={tempText}
                            onChange={e => setTempText(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') { onCorrect(wordIndex, tempText); setIsEditing(false); }
                                if (e.key === 'Escape') setIsEditing(false);
                            }}
                        />
                        <button onClick={() => { onCorrect(wordIndex, tempText); setIsEditing(false); }} className="p-1 bg-brand text-bg rounded hover:brightness-110"><Check size={14}/></button>
                        <button onClick={() => setIsEditing(false)} className="p-1 text-text-sec hover:text-white"><X size={14}/></button>
                    </div>
                </div>
            )}
        </>
    );
};

export const PdfPage: React.FC<PdfPageProps> = ({ 
  pageNumber, filterValues, pdfDoc 
}) => {
  const { 
    scale, activeTool, setActiveTool, settings, 
    annotations, addAnnotation, removeAnnotation,
    setIsSpread, spreadSide, ocrMap, updateOcrWord, refinePageOcr,
    setShowOcrModal
  } = usePdfContext();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  
  const renderTaskRef = useRef<any>(null);
  const lastInjectedOcrRef = useRef<string>("");

  const [rendered, setRendered] = useState(false);
  const [hasText, setHasText] = useState(true); 
  const [isVisible, setIsVisible] = useState(false);
  const [pageProxy, setPageProxy] = useState<any>(null);
  const [showOcrDebug, setShowOcrDebug] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  
  const isDrawing = useRef(false);
  const [currentPoints, setCurrentPoints] = useState<number[][]>([]);
  const [draftNote, setDraftNote] = useState<{x: number, y: number, text: string} | null>(null);

  const isDarkPage = useMemo(() => {
    if (settings.disableColorFilter) return false;
    const hex = settings.pageColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 128;
  }, [settings.pageColor, settings.disableColorFilter]);

  useEffect(() => {
    const element = pageContainerRef.current;
    if (!element) return;
    // Aumentamos a margem para pre-load, mas gerenciamos o render com cuidado
    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), { rootMargin: '50% 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdfDoc) return;
    let active = true;
    pdfDoc.getPage(pageNumber).then(page => { if (active) setPageProxy(page); });
    return () => { active = false; };
  }, [pdfDoc, pageNumber]);

  const pageDimensions = useMemo(() => {
    if (!pageProxy) return null;
    const viewport = pageProxy.getViewport({ scale: scale });
    return { width: viewport.width, height: viewport.height };
  }, [pageProxy, scale]);

  useEffect(() => {
    if (pageDimensions) {
        setIsSpread(pageDimensions.width > pageDimensions.height * 1.1);
    }
  }, [pageDimensions, setIsSpread]);

  const isSplitActive = settings.detectColumns && (pageDimensions ? pageDimensions.width > pageDimensions.height * 1.1 : false);

  useEffect(() => {
    if (!isVisible || !pageDimensions || !pageProxy || !canvasRef.current) return;
    let active = true;
    
    // --- ENERGY SAVER PROTOCOL ---
    // Em dispositivos móveis de alta densidade (Retina/OLED), renderizar a 3x ou 4x consome muita bateria.
    // Limitamos o DPR a 2.0 (que já é excelente) para salvar GPU. Em telas desktop normais, usa-se 1.0.
    const nativeDpr = window.devicePixelRatio || 1;
    const cappedDpr = Math.min(nativeDpr, 2.0); 

    const render = async () => {
      try {
        const viewport = pageProxy.getViewport({ scale: scale });
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
        if (!ctx) return;
        if (renderTaskRef.current) try { renderTaskRef.current.cancel(); } catch {}

        canvas.width = Math.floor(viewport.width * cappedDpr);
        canvas.height = Math.floor(viewport.height * cappedDpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(cappedDpr, cappedDpr);

        const task = pageProxy.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
        if (renderTaskRef.current !== task || !active) return;

        const textContent = await pageProxy.getTextContent();
        if (!active) return;
        
        const fullText = textContent.items.map((i: any) => i.str).join('').replace(/\s/g, '').trim();
        const pdfHasGoodText = fullText.length > 20;
        setHasText(pdfHasGoodText);

        if (textLayerRef.current) {
           textLayerRef.current.innerHTML = '';
           textLayerRef.current.style.width = `${viewport.width}px`;
           textLayerRef.current.style.height = `${viewport.height}px`;
           if (pdfHasGoodText) {
             renderCustomTextLayer(textContent, textLayerRef.current, viewport, settings.detectColumns);
           }
        }
        setRendered(true);
      } catch (e: any) { if (e?.name !== 'RenderingCancelledException') console.error(e); }
    };
    render();
    return () => { 
        active = false; 
        if (renderTaskRef.current) try { renderTaskRef.current.cancel(); } catch {}
    };
  }, [pageProxy, scale, isVisible, settings.detectColumns]);

  const { status: ocrStatus, ocrData, requestOcr } = usePageOcr({ pageNumber });

  const rawExtractedText = useMemo(() => {
    if (!ocrData || ocrData.length === 0) return "";
    return ocrData.map(w => w.text).join(' ');
  }, [ocrData]);

  const isPageRefined = useMemo(() => {
    return ocrData.some(w => w.isRefined);
  }, [ocrData]);

  // PERFORMANCE: Injeção Assíncrona via Time-Slicing (Garantia de 60fps)
  useEffect(() => {
    if (ocrData && ocrData.length > 0 && textLayerRef.current && rendered && pageDimensions) {
        const sideKey = isSplitActive ? spreadSide : 'full';
        const dataHash = `ocr-v10-perf-${pageNumber}-${ocrData.length}-${scale}-${sideKey}-${isPageRefined ? 'r' : 'u'}`;
        
        if (lastInjectedOcrRef.current === dataHash) return;

        const container = textLayerRef.current;
        
        // OPTIMIZATION 1: Ocultar container durante injeção para evitar repaints intermediários
        container.style.visibility = 'hidden';
        container.innerHTML = ''; 
        
        const visibleWords = isSplitActive 
            ? ocrData.filter(w => w.column === (spreadSide === 'right' ? 1 : 0))
            : ocrData;

        // --- SCHEDULER ENGINE (The 60fps Guarantee) ---
        let currentIndex = 0;
        let workId: number;

        const injectWork = (deadline: { timeRemaining: () => number, didTimeout: boolean }) => {
            const fragment = document.createDocumentFragment();
            // Processa enquanto houver tempo (1ms buffer)
            while (currentIndex < visibleWords.length && (deadline.timeRemaining() > 1 || deadline.didTimeout)) {
                const word = visibleWords[currentIndex];
                currentIndex++;

                const x = Math.floor(word.bbox.x0 * scale);
                const y = Math.floor(word.bbox.y0 * scale);
                const w = Math.ceil((word.bbox.x1 - word.bbox.x0) * scale);
                const h = Math.ceil((word.bbox.y1 - word.bbox.y0) * scale);

                // GHOST BLOCK FILTER (Otimização para páginas duplas e artefatos)
                const maxAllowedW = isSplitActive ? pageDimensions.width * 0.48 : pageDimensions.width * 0.8;
                if (w > maxAllowedW || (w > pageDimensions.width * 0.4 && h > pageDimensions.height * 0.3)) {
                    continue; 
                }

                const span = document.createElement('span');
                span.textContent = word.text + ' ';
                span.className = 'ocr-word-span';
                
                // CSS Batching
                span.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;font-size:${h*0.95}px;position:absolute;color:transparent;cursor:text;line-height:1;white-space:pre;text-rendering:optimizeSpeed;`;
                
                span.dataset.pdfX = String(x);
                span.dataset.pdfTop = String(y);
                span.dataset.pdfWidth = String(w);
                span.dataset.pdfHeight = String(h);
                
                fragment.appendChild(span);
            }
            
            container.appendChild(fragment);

            if (currentIndex < visibleWords.length) {
                workId = scheduleWork(injectWork);
            } else {
                lastInjectedOcrRef.current = dataHash;
                // Restaurar visibilidade no final
                container.style.visibility = 'visible';
            }
        };

        workId = scheduleWork(injectWork);
        return () => cancelWork(workId);
    }
  }, [ocrData, rendered, scale, pageNumber, spreadSide, isSplitActive, isPageRefined, pageDimensions]);

  const getRelativeCoords = (e: React.PointerEvent) => {
      const rect = pageContainerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      let x = (e.clientX - rect.left) / scale;
      let y = (e.clientY - rect.top) / scale;
      return { x, y };
  };

  const handleRefine = async () => {
    if (isRefining) return;
    setIsRefining(true);
    await refinePageOcr(pageNumber);
    setIsRefining(false);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (activeTool === 'cursor' && (target.closest('.textLayer') || target.classList.contains('ocr-word-span'))) {
        return;
    }
    if (activeTool === 'note') {
        if (target.closest('.annotation-item, .note-editor')) return;
        const { x, y } = getRelativeCoords(e);
        setDraftNote({ x, y, text: '' });
        return;
    }
    if (activeTool !== 'ink') return;
    isDrawing.current = true;
    const { x, y } = getRelativeCoords(e);
    setCurrentPoints([[x, y]]);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing.current) return;
    const { x, y } = getRelativeCoords(e);
    setCurrentPoints(prev => [...prev, [x, y]]);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    
    if (currentPoints.length > 1) {
        addAnnotation({
            id: `ink-${Date.now()}`,
            page: pageNumber,
            bbox: [0, 0, 0, 0],
            type: 'ink',
            points: currentPoints,
            color: settings.inkColor,
            strokeWidth: settings.inkStrokeWidth / 5,
            opacity: settings.inkOpacity,
            createdAt: new Date().toISOString(),
            text: "" 
        });
    }
    setCurrentPoints([]);
  };

  const outerWidth = isSplitActive ? (pageDimensions?.width || 800) / 2 : (pageDimensions?.width || 800);
  const innerTransform = isSplitActive ? `translateX(${spreadSide === 'right' ? '-50%' : '0'})` : 'none';
  const pageAnnotations = annotations.filter(a => a.page === pageNumber);

  return (
    <div 
        className="pdf-page-wrapper mx-auto mb-8 relative shadow-2xl rounded-sm bg-[#18181b]" 
        style={{ width: outerWidth, height: pageDimensions?.height || 1100, overflow: 'hidden' }}
    >
        <div 
            ref={pageContainerRef}
            className={`pdf-page pdf-page-content relative transition-transform duration-300 ease-out origin-top-left bg-white ${activeTool === 'cursor' ? 'select-text' : 'select-none'}`}
            style={{ width: pageDimensions?.width || 800, height: pageDimensions?.height || 1100, transform: innerTransform }}
            data-page-number={pageNumber}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
            {!hasText && rendered && isVisible && (
                <div className="absolute top-4 left-4 flex items-center gap-2 text-xs bg-black/80 text-white px-4 py-2 rounded-full backdrop-blur-md z-[100] shadow-2xl border border-white/10 group animate-in fade-in duration-300 pointer-events-auto">
                    {ocrStatus === 'processing' ? (
                      <div className="flex items-center gap-3">
                        <Loader2 size={16} className="animate-spin text-brand" />
                        <span className="font-bold">Analisando imagem...</span>
                      </div>
                    ) : ocrStatus === 'done' ? (
                      <button onClick={() => setShowOcrDebug(true)} className="flex items-center gap-2 text-brand hover:text-white transition-colors font-bold">
                        {isPageRefined ? <Sparkles size={16} className="text-purple-400" /> : <CheckCircle2 size={16} className="text-brand" />}
                        <span className={isPageRefined ? "text-purple-400" : "text-brand"}>{isPageRefined ? "Leitura Refinada" : "Leitura Concluída"}</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-3">
                          <span className="text-brand/80 font-medium hidden group-hover:inline">OCR Disponível</span>
                          <div className="h-4 w-px bg-white/20 hidden group-hover:block"></div>
                          <button onClick={(e) => { e.stopPropagation(); setShowOcrModal(true); }} className="flex items-center gap-2 hover:text-white transition-colors text-brand font-bold">
                            <ScanLine size={18} />
                            <span>Extrair Texto</span>
                          </button>
                      </div>
                    )}
                </div>
            )}

            <canvas ref={canvasRef} className="select-none absolute top-0 left-0" style={{ filter: settings.disableColorFilter ? 'none' : 'url(#pdf-recolor)', display: 'block', visibility: isVisible ? 'visible' : 'hidden', zIndex: 5 }} />
            
            {/* Confidence Mapping Layer */}
            {settings.showConfidenceOverlay && ocrData && ocrData.length > 0 && rendered && ocrData.length < 1500 && (
                <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
                    {ocrData
                        .filter(w => !isSplitActive || w.column === (spreadSide === 'right' ? 1 : 0))
                        .map((word, idx) => (
                            <ConfidenceWord 
                                key={idx} 
                                word={word} 
                                scale={scale} 
                                wordIndex={idx}
                                onCorrect={(wIdx, newTxt) => updateOcrWord(pageNumber, wIdx, newTxt)} 
                            />
                        ))}
                </div>
            )}

            {/* ANNOTATIONS LAYER */}
            <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 40 }}>
                <svg className="absolute inset-0 w-full h-full">
                    <g transform={`scale(${scale})`}>
                        {currentPoints.length > 0 && <path d={currentPoints.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ')} stroke={settings.inkColor} strokeWidth={settings.inkStrokeWidth / 5} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={settings.inkOpacity} />}
                        
                        {pageAnnotations.filter(a => a.type === 'ink' && !a.isBurned).map(ann => (
                            <path 
                                key={ann.id} 
                                d={(ann.points || []).map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ')} 
                                stroke={ann.color} 
                                strokeWidth={ann.strokeWidth || 3} 
                                fill="none" 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                opacity={ann.opacity} 
                                className={activeTool === 'eraser' ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'} 
                                onClick={e => { if(activeTool === 'eraser') { e.stopPropagation(); removeAnnotation(ann); }}} 
                            />
                        ))}
                    </g>
                </svg>
                
                {pageAnnotations.filter(a => a.type === 'highlight' && !a.isBurned).map((ann, i) => (
                    <div 
                        key={ann.id || i} 
                        className={`absolute ${activeTool === 'eraser' ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'} ${isDarkPage ? 'mix-blend-screen' : 'mix-blend-multiply'}`} 
                        style={{ 
                            left: ann.bbox[0] * scale, 
                            top: ann.bbox[1] * scale, 
                            width: ann.bbox[2] * scale, 
                            height: ann.bbox[3] * scale, 
                            backgroundColor: ann.color, 
                            opacity: ann.opacity 
                        }} 
                        onClick={e => { if(activeTool === 'eraser') { e.stopPropagation(); removeAnnotation(ann); }}} 
                    />
                ))}
                
                {pageAnnotations.filter(a => a.type === 'note' && !a.isBurned).map((ann, i) => (
                    <NoteMarker key={ann.id || i} ann={ann} scale={scale} activeTool={activeTool} onDelete={removeAnnotation} />
                ))}
            </div>

            <div 
                ref={textLayerRef} 
                className="textLayer notranslate select-text" 
                style={{ 
                    zIndex: 30, 
                    pointerEvents: activeTool === 'cursor' ? 'auto' : 'none', 
                    visibility: isVisible ? 'visible' : 'hidden'
                }} 
            />

            {draftNote && (
                <div className="absolute z-50 bg-yellow-100 p-3 rounded-lg shadow-2xl border border-yellow-300 animate-in zoom-in-95 pointer-events-auto" style={{ left: draftNote.x * scale, top: draftNote.y * scale }}>
                    <textarea 
                        autoFocus 
                        className="bg-transparent border-none outline-none text-sm text-yellow-900 resize-none w-48 h-24" 
                        placeholder="Digite sua nota..." 
                        onKeyDown={e => { 
                            if (e.key === 'Enter' && !e.shiftKey) { 
                                e.preventDefault(); 
                                if (e.currentTarget.value.trim()) {
                                    addAnnotation({ 
                                        id: `note-${Date.now()}`, 
                                        page: pageNumber, 
                                        bbox: [draftNote.x, draftNote.y, 0, 0], 
                                        type: 'note', 
                                        text: e.currentTarget.value, 
                                        color: '#fef9c3', 
                                        createdAt: new Date().toISOString() 
                                    }); 
                                }
                                setDraftNote(null);
                                setActiveTool('cursor'); 
                            } 
                            if (e.key === 'Escape') setDraftNote(null); 
                        }} 
                    />
                </div>
            )}
        </div>

        <BaseModal
            isOpen={showOcrDebug}
            onClose={() => setShowOcrDebug(false)}
            title={`Inspeção OCR - Página ${pageNumber}`}
            icon={<FileSearch size={20} />}
            maxWidth="max-w-2xl"
        >
            <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-border pb-2">
                    <div className="flex items-center gap-2">
                        <p className="text-xs text-text-sec uppercase font-bold tracking-widest">Texto Extraído:</p>
                        {isPageRefined && <span className="bg-purple-500/20 text-purple-400 text-[9px] font-bold px-1.5 py-0.5 rounded border border-purple-500/30 flex items-center gap-1"><Sparkles size={10}/> Refinado</span>}
                    </div>
                    <span className="bg-brand/10 text-brand text-[10px] font-bold px-2 py-0.5 rounded-full border border-brand/20">
                        {ocrData.length} palavras encontradas
                    </span>
                </div>
                
                <div className="bg-black/40 border border-border p-6 rounded-xl font-serif text-lg leading-relaxed text-gray-200 whitespace-pre-wrap max-h-[400px] overflow-y-auto custom-scrollbar">
                    {rawExtractedText || (
                        <div className="flex flex-col items-center justify-center py-10 opacity-50 text-center">
                            <AlertCircle size={32} className="mb-2" />
                            <p>Nenhum texto pôde ser extraído.</p>
                        </div>
                    )}
                </div>
                
                <div className="flex flex-wrap justify-end gap-2 pt-2">
                    <button 
                        onClick={handleRefine} 
                        disabled={isRefining || !rawExtractedText || isPageRefined}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-purple-700 transition-all shadow-lg disabled:opacity-50"
                    >
                        {isRefining ? <Loader2 size={16} className="animate-spin"/> : <Wand2 size={16} />}
                        {isPageRefined ? "Refinado com IA" : "Refinar com IA"}
                    </button>
                    <button onClick={() => { requestOcr(); setShowOcrDebug(false); }} className="px-4 py-2 bg-brand/10 border border-brand/20 text-brand rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-brand/20"><RefreshCw size={14} /> Redigitalizar</button>
                    <button onClick={() => { navigator.clipboard.writeText(rawExtractedText); alert("Copiado!"); }} disabled={!rawExtractedText} className="px-4 py-2 bg-brand text-bg rounded-lg text-sm font-bold disabled:opacity-30">Copiar Tudo</button>
                    <button onClick={() => setShowOcrDebug(false)} className="px-4 py-2 bg-surface border border-border text-text rounded-lg text-sm font-bold">Fechar</button>
                </div>
                
                {!isPageRefined && rawExtractedText && (
                    <div className="bg-purple-500/5 border border-purple-500/20 p-3 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                        <Sparkles size={18} className="text-purple-400 shrink-0 mt-1" />
                        <p className="text-[11px] text-purple-200/70 leading-relaxed">
                            <strong>Dica Archivist:</strong> O refinamento por IA corrige erros de "leitura suja" (como trocar 'l' por '1') e reconstrói o sentido das frases sem perder a posição das palavras na página.
                        </p>
                    </div>
                )}
            </div>
        </BaseModal>
    </div>
  );
};
