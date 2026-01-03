
import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2, Sparkles, ScanLine, X, Save, RefreshCw, Columns, ArrowLeft, ArrowRight, CheckCircle2, FileSearch, AlertCircle, Wand2, Check } from 'lucide-react';
import { renderCustomTextLayer } from '../../utils/pdfRenderUtils';
import { usePageOcr } from '../../hooks/usePageOcr';
import { NoteMarker } from './NoteMarker';
import { usePdfContext } from '../../context/PdfContext';
import { usePdfStore } from '../../stores/usePdfStore'; 
import { PDFDocumentProxy } from 'pdfjs-dist';
import { BaseModal } from '../shared/BaseModal';
import { scheduleWork, cancelWork } from '../../utils/scheduler';
import { bitmapCache } from '../../services/bitmapCacheService';

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
                    className="absolute z-[300] bg-surface p-2 rounded-xl border border-brand animate-in zoom-in-95"
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

// Helper: Desenha traços suaves usando curvas de Bézier quadráticas
const drawSmoothStroke = (ctx: CanvasRenderingContext2D, points: number[][], scale: number) => {
    if (points.length < 2) return;

    ctx.beginPath();
    // Move para o primeiro ponto
    ctx.moveTo(points[0][0] * scale, points[0][1] * scale);

    // Se tiver poucos pontos, desenha linha simples
    if (points.length < 3) {
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i][0] * scale, points[i][1] * scale);
        }
    } else {
        // Interpolação suave usando pontos médios como controle
        for (let i = 1; i < points.length - 1; i++) {
            const p0 = points[i];
            const p1 = points[i+1];
            
            // Ponto médio entre o atual e o próximo
            const midX = (p0[0] + p1[0]) / 2;
            const midY = (p0[1] + p1[1]) / 2;
            
            // Desenha curva do ponto anterior até o ponto médio
            ctx.quadraticCurveTo(
                p0[0] * scale, p0[1] * scale, 
                midX * scale, midY * scale
            );
        }
        // Conecta o último trecho
        const last = points[points.length - 1];
        ctx.lineTo(last[0] * scale, last[1] * scale);
    }
    ctx.stroke();
};

const PdfPageComponent: React.FC<PdfPageProps> = ({ 
  pageNumber, filterValues, pdfDoc 
}) => {
  // ZUSTAND: Consuming scale/tool from store directly to avoid Context Re-Renders
  const scale = usePdfStore(state => state.scale);
  const activeTool = usePdfStore(state => state.activeTool);
  const setActiveTool = usePdfStore(state => state.setActiveTool);
  const setIsSpread = usePdfStore(state => state.setIsSpread);
  const spreadSide = usePdfStore(state => state.spreadSide);

  const { 
    settings, 
    annotations, addAnnotation, removeAnnotation,
    ocrMap, updateOcrWord, refinePageOcr,
    setShowOcrModal, onSmartTap, selection,
    fileId // Need fileId for caching keys
  } = usePdfContext();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // OPTIMIZATION: Double Buffering for Ink
  const staticInkCanvasRef = useRef<HTMLCanvasElement>(null);
  const activeInkCanvasRef = useRef<HTMLCanvasElement>(null);
  
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
  
  // Ink Tool State
  const isDrawing = useRef(false);
  const [currentPoints, setCurrentPoints] = useState<number[][]>([]);
  
  // Brush/Cursor Tools State
  const isBrushingRef = useRef(false);
  const cursorStartRef = useRef<{x: number, y: number} | null>(null);
  const [brushSelection, setBrushSelection] = useState<{ start: {x: number, y: number}, current: {x: number, y: number} } | null>(null);

  const [draftNote, setDraftNote] = useState<{x: number, y: number, text: string} | null>(null);

  // Hook OCR do componente para saber status local
  const { status: ocrStatus, ocrData, requestOcr } = usePageOcr({ pageNumber });

  const isDarkPage = useMemo(() => {
    if (settings.disableColorFilter) return false;
    const hex = settings.pageColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 128;
  }, [settings.pageColor, settings.disableColorFilter]);

  // Unique key for Bitmap Cache
  const cacheKey = useMemo(() => `${fileId}-p${pageNumber}-s${scale.toFixed(2)}`, [fileId, pageNumber, scale]);

  useEffect(() => {
    const element = pageContainerRef.current;
    if (!element) return;
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

  // --- PDF RENDERING LOOP (With Bitmap Caching & Placeholder) ---
  useEffect(() => {
    if (!isVisible || !pageDimensions || !pageProxy || !canvasRef.current) return;
    let active = true;
    
    const nativeDpr = window.devicePixelRatio || 1;
    const cappedDpr = Math.min(nativeDpr, 2.0); 

    const render = async () => {
      try {
        const viewport = pageProxy.getViewport({ scale: scale });
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
        if (!ctx) return;
        
        if (renderTaskRef.current) try { renderTaskRef.current.cancel(); } catch {}

        // 1. Prepare Canvas
        const targetWidth = Math.floor(viewport.width * cappedDpr);
        const targetHeight = Math.floor(viewport.height * cappedDpr);
        
        // Only resize if necessary (Avoids clearing if size matches)
        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
        }
        
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        // 2. OPTIMISTIC UI: Draw Cached Bitmap OR Nearest Neighbor (Placeholder)
        const cachedBitmap = bitmapCache.get(cacheKey);
        
        if (cachedBitmap) {
            // Cache Hit: Desenha exato
            ctx.drawImage(cachedBitmap, 0, 0, targetWidth, targetHeight);
        } else {
            // Cache Miss: Tenta encontrar um bitmap de outra escala (ex: zoom anterior)
            const fallbackBitmap = bitmapCache.findNearest(fileId, pageNumber);
            if (fallbackBitmap) {
                // Desenha o fallback esticado (ficará borrado, mas evita tela branca)
                ctx.drawImage(fallbackBitmap, 0, 0, targetWidth, targetHeight);
            } else {
                // Sem cache nenhum: Limpa
                ctx.fillStyle = settings.pageColor || '#ffffff';
                ctx.fillRect(0, 0, targetWidth, targetHeight);
            }
        }

        // 3. Render High-Quality PDF (Async)
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(cappedDpr, cappedDpr);

        const task = pageProxy.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
        
        if (renderTaskRef.current !== task || !active) return;

        // 4. Cache Result (Background)
        // Store the freshly rendered high-quality canvas as a bitmap
        // We use createImageBitmap which is off-main-thread friendly
        createImageBitmap(canvas).then(bitmap => {
            if (active) bitmapCache.set(cacheKey, bitmap);
            else bitmap.close(); // Cleanup if unmounted
        });

        // 5. Process Text Layer (MUTUAL EXCLUSION: Only if no OCR data)
        // Se já temos OCR (ocrData) ou estamos processando (ocrStatus !== idle), ignoramos a camada nativa defeituosa.
        if ((!ocrData || ocrData.length === 0) && ocrStatus === 'idle') {
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
        } else {
            // Se temos OCR ou estamos processando, limpamos o layer nativo para evitar fantasmas
            if (textLayerRef.current) {
                textLayerRef.current.innerHTML = '';
            }
            // Assume que não tem texto nativo útil (para mostrar UI de OCR se necessário)
            setHasText(false); 
        }
        setRendered(true);
      } catch (e: any) { if (e?.name !== 'RenderingCancelledException') console.error(e); }
    };
    
    render();
    
    return () => { 
        active = false; 
        if (renderTaskRef.current) try { renderTaskRef.current.cancel(); } catch {}
    };
  }, [pageProxy, scale, isVisible, settings.detectColumns, cacheKey, ocrData, ocrStatus]);

  // --- STATIC INK LAYER (Heavy, Cached with Smoothing) ---
  useEffect(() => {
    if (!staticInkCanvasRef.current || !pageDimensions) return;
    
    const canvas = staticInkCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Sync dimensions
    canvas.width = pageDimensions.width;
    canvas.height = pageDimensions.height;
    canvas.style.width = `${pageDimensions.width}px`;
    canvas.style.height = `${pageDimensions.height}px`;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const pageInks = annotations.filter(a => a.page === pageNumber && a.type === 'ink' && !a.isBurned);
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    pageInks.forEach(ann => {
        if (!ann.points || ann.points.length < 2) return;
        
        ctx.lineWidth = (ann.strokeWidth || 3) * scale;
        ctx.strokeStyle = ann.color || '#ff0000';
        ctx.globalAlpha = ann.opacity || 1;

        // Use Smooth Drawing
        drawSmoothStroke(ctx, ann.points, scale);
    });
  }, [annotations, pageNumber, scale, pageDimensions]); 

  // --- ACTIVE INK LAYER (Light, Fast with Smoothing) ---
  useEffect(() => {
    if (!activeInkCanvasRef.current || !pageDimensions) return;
    
    const canvas = activeInkCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Ensure dimension sync (cheap check usually)
    if (canvas.width !== pageDimensions.width || canvas.height !== pageDimensions.height) {
        canvas.width = pageDimensions.width;
        canvas.height = pageDimensions.height;
        canvas.style.width = `${pageDimensions.width}px`;
        canvas.style.height = `${pageDimensions.height}px`;
    }

    // Always clear active layer on every frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (currentPoints.length > 1) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.lineWidth = (settings.inkStrokeWidth / 5) * scale;
        ctx.strokeStyle = settings.inkColor;
        ctx.globalAlpha = settings.inkOpacity;

        // Use Smooth Drawing for active stroke too
        drawSmoothStroke(ctx, currentPoints, scale);
    }
  }, [currentPoints, scale, pageDimensions, settings.inkColor, settings.inkStrokeWidth, settings.inkOpacity]);


  const rawExtractedText = useMemo(() => {
    if (!ocrData || ocrData.length === 0) return "";
    return ocrData.map(w => w.text).join(' ');
  }, [ocrData]);

  const isPageRefined = useMemo(() => {
    return ocrData.some(w => w.isRefined);
  }, [ocrData]);

  useEffect(() => {
    if (ocrData && ocrData.length > 0 && textLayerRef.current && rendered && pageDimensions) {
        const sideKey = isSplitActive ? spreadSide : 'full';
        const dataHash = `ocr-v10-perf-${pageNumber}-${ocrData.length}-${scale}-${sideKey}-${isPageRefined ? 'r' : 'u'}`;
        
        if (lastInjectedOcrRef.current === dataHash) return;

        const container = textLayerRef.current;
        container.style.visibility = 'hidden';
        container.innerHTML = ''; 
        
        const visibleWords = isSplitActive 
            ? ocrData.filter(w => w.column === (spreadSide === 'right' ? 1 : 0))
            : ocrData;

        let currentIndex = 0;
        let workId: number;

        const injectWork = (deadline: { timeRemaining: () => number, didTimeout: boolean }) => {
            const fragment = document.createDocumentFragment();
            while (currentIndex < visibleWords.length && (deadline.timeRemaining() > 1 || deadline.didTimeout)) {
                const word = visibleWords[currentIndex];
                currentIndex++;

                const x = Math.floor(word.bbox.x0 * scale);
                const y = Math.floor(word.bbox.y0 * scale);
                const w = Math.ceil((word.bbox.x1 - word.bbox.x0) * scale);
                const h = Math.ceil((word.bbox.y1 - word.bbox.y0) * scale);

                const maxAllowedW = isSplitActive ? pageDimensions.width * 0.48 : pageDimensions.width * 0.8;
                if (w > maxAllowedW || (w > pageDimensions.width * 0.4 && h > pageDimensions.height * 0.3)) {
                    continue; 
                }

                const span = document.createElement('span');
                span.textContent = word.text + ' ';
                span.className = 'ocr-word-span';
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
    // 1. Cursor Mode (Selection)
    if (activeTool === 'cursor') {
        e.preventDefault();
        cursorStartRef.current = { x: e.clientX, y: e.clientY };
        return; 
    }

    const target = e.target as HTMLElement;
    const { x, y } = getRelativeCoords(e);

    // 2. Brush Mode
    if (activeTool === 'brush') {
        e.preventDefault(); 
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        isBrushingRef.current = true;
        cursorStartRef.current = { x, y };
        setBrushSelection({ start: {x,y}, current: {x,y} });
        return;
    }

    // 3. Note Mode
    if (activeTool === 'note') {
        if (target.closest('.annotation-item, .note-editor')) return;
        setDraftNote({ x, y, text: '' });
        return;
    }

    // 4. Ink Mode
    if (activeTool !== 'ink') return;
    isDrawing.current = true;
    setCurrentPoints([[x, y]]);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activeTool === 'cursor') return;

    const { x, y } = getRelativeCoords(e);

    if (isBrushingRef.current && cursorStartRef.current) {
        setBrushSelection({ start: cursorStartRef.current, current: {x,y} });
        return;
    }

    if (!isDrawing.current) return;
    setCurrentPoints(prev => [...prev, [x, y]]);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    // 1. Cursor Mode Logic
    if (activeTool === 'cursor') {
        if (cursorStartRef.current) {
            const dist = Math.hypot(e.clientX - cursorStartRef.current.x, e.clientY - cursorStartRef.current.y);
            if (dist < 5) {
                onSmartTap(e.target as HTMLElement);
            }
            cursorStartRef.current = null;
        }
        return;
    }

    // 2. Brush Logic (RESTORED TEXT CAPTURE)
    if (isBrushingRef.current && cursorStartRef.current) {
        e.currentTarget.releasePointerCapture(e.pointerId);
        isBrushingRef.current = false;
        
        const { x: currX, y: currY } = getRelativeCoords(e);
        const startX = cursorStartRef.current.x;
        const startY = cursorStartRef.current.y;
        
        const x = Math.min(startX, currX);
        const y = Math.min(startY, currY);
        const w = Math.abs(currX - startX);
        const h = Math.abs(currY - startY);

        if (w > 5 && h > 5) {
            let capturedText = "";
            
            // --- TEXT CAPTURE ENGINE ---
            const spans = textLayerRef.current?.querySelectorAll('span');
            if (spans) {
                const selectedWords: { text: string, x: number, y: number }[] = [];
                
                spans.forEach((span) => {
                    // Normalize Coordinates: Dataset values are SCALED (CSS pixels)
                    // We need them unscaled to compare with our unscaled selection box
                    const sx = parseFloat(span.dataset.pdfX || '0') / scale;
                    const sy = parseFloat(span.dataset.pdfTop || '0') / scale;
                    const sw = parseFloat(span.dataset.pdfWidth || '0') / scale;
                    const sh = parseFloat(span.dataset.pdfHeight || '0') / scale;

                    // Calculate Intersection Area
                    const overlapW = Math.max(0, Math.min(x + w, sx + sw) - Math.max(x, sx));
                    const overlapH = Math.max(0, Math.min(y + h, sy + sh) - Math.max(y, sy));
                    
                    // Significant Overlap Threshold (50% of height)
                    if (overlapH > sh * 0.5 && overlapW > 0) {
                        selectedWords.push({
                            text: span.textContent || '',
                            x: sx,
                            y: sy
                        });
                    }
                });

                // Reconstruct Reading Order (Top->Bottom, Left->Right)
                selectedWords.sort((a, b) => {
                    const lineDiff = Math.abs(a.y - b.y);
                    if (lineDiff < 5) return a.x - b.x; // Same line tolerance
                    return a.y - b.y;
                });

                capturedText = selectedWords.map(w => w.text).join('');
            }
            // ---------------------------

            addAnnotation({
                id: `hl-${Date.now()}`,
                page: pageNumber,
                bbox: [x, y, w, h],
                type: 'highlight',
                text: capturedText, // Captured text now correctly passed
                color: settings.highlightColor,
                opacity: settings.highlightOpacity,
                createdAt: new Date().toISOString()
            });
        }
        
        cursorStartRef.current = null;
        setBrushSelection(null);
        return;
    }

    // 3. Ink Logic (Final Commit)
    if (!isDrawing.current) return;
    isDrawing.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    
    if (currentPoints.length > 1) {
        addAnnotation({
            id: `ink-${Date.now()}`,
            page: pageNumber,
            bbox: [0, 0, 0, 0], // Ink uses points, not bbox
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
        className="pdf-page-wrapper mx-auto mb-8 relative bg-[#18181b] border border-[#333]" 
        style={{ 
            width: outerWidth, 
            height: pageDimensions?.height || 1100, 
            overflow: 'hidden',
            cursor: activeTool === 'brush' ? 'crosshair' : 'default' 
        }}
    >
        <div 
            ref={pageContainerRef}
            className={`pdf-page pdf-page-content relative transition-transform duration-300 ease-out origin-top-left bg-white ${activeTool === 'cursor' ? 'select-text' : 'select-none'}`}
            style={{ 
                width: pageDimensions?.width || 800, 
                height: pageDimensions?.height || 1100, 
                transform: innerTransform,
                touchAction: activeTool === 'brush' ? 'none' : 'pan-x pan-y'
            }}
            data-page-number={pageNumber}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
            {!hasText && rendered && isVisible && (
                <div className="absolute top-4 left-4 flex items-center gap-2 text-xs bg-black/80 text-white px-4 py-2 rounded-full z-[100] border border-white/10 group animate-in fade-in duration-300 pointer-events-auto">
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

            {/* LAYER 0: PDF Base */}
            <canvas ref={canvasRef} className="select-none absolute top-0 left-0" style={{ filter: settings.disableColorFilter ? 'none' : 'url(#pdf-recolor)', display: 'block', visibility: isVisible ? 'visible' : 'hidden', zIndex: 5 }} />
            
            {/* LAYER 1: STATIC Ink Canvas (Saved Strokes) */}
            <canvas ref={staticInkCanvasRef} className="select-none absolute top-0 left-0 pointer-events-none" style={{ zIndex: 35, display: 'block' }} />

            {/* LAYER 2: ACTIVE Ink Canvas (Drawing Now) */}
            <canvas ref={activeInkCanvasRef} className="select-none absolute top-0 left-0 pointer-events-none" style={{ zIndex: 36, display: 'block' }} />

            {/* LAYER 3: OCR Confidence Overlay */}
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

            {/* LAYER 4: Virtual Selections */}
            {selection && selection.page === pageNumber && (
                <div className="absolute inset-0 z-[35] pointer-events-none">
                    {selection.relativeRects.map((rect, i) => {
                        const isLast = i === selection.relativeRects.length - 1;
                        return (
                            <div 
                                key={i} 
                                className={`absolute transition-all duration-75 ${
                                    isLast 
                                    ? 'bg-purple-500/30 border-b-2 border-purple-500 mix-blend-multiply' 
                                    : 'bg-brand/30 mix-blend-multiply'
                                }`}
                                style={{ 
                                    left: rect.x * scale, 
                                    top: rect.y * scale, 
                                    width: rect.width * scale, 
                                    height: rect.height * scale,
                                }}
                            />
                        );
                    })}
                </div>
            )}

            {brushSelection && (
                <div 
                    className="absolute z-50 bg-brand/20 border border-brand pointer-events-none"
                    style={{
                        left: Math.min(brushSelection.start.x, brushSelection.current.x) * scale,
                        top: Math.min(brushSelection.start.y, brushSelection.current.y) * scale,
                        width: Math.abs(brushSelection.current.x - brushSelection.start.x) * scale,
                        height: Math.abs(brushSelection.current.y - brushSelection.start.y) * scale,
                    }}
                />
            )}

            {/* LAYER 5: DOM Annotations (Highlights & Notes only) */}
            <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 40 }}>
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

            {/* LAYER 6: Invisible Text Layer */}
            <div 
                ref={textLayerRef} 
                className="textLayer notranslate" 
                style={{ 
                    zIndex: 30, 
                    pointerEvents: activeTool === 'cursor' ? 'auto' : 'none', 
                    visibility: isVisible ? 'visible' : 'hidden'
                }} 
            />

            {draftNote && (
                <div className="absolute z-50 bg-yellow-100 p-3 rounded-lg border border-yellow-300 animate-in zoom-in-95 pointer-events-auto" style={{ left: draftNote.x * scale, top: draftNote.y * scale }}>
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
            </div>
        </BaseModal>
    </div>
  );
};

export const PdfPage = React.memo(PdfPageComponent, (prev, next) => {
    return (
        prev.pageNumber === next.pageNumber &&
        prev.filterValues === next.filterValues &&
        prev.pdfDoc === next.pdfDoc
    );
});
