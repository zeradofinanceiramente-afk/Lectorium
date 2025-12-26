
import React, { useState, useEffect, useRef } from 'react';
import { SelectionState } from '../components/pdf/SelectionMenu';

interface UsePdfSelectionProps {
  activeTool: string;
  scale: number;
  containerRef: React.RefObject<HTMLDivElement>;
}

export const usePdfSelection = ({ activeTool, scale, containerRef }: UsePdfSelectionProps) => {
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const selectionDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const processSelection = () => {
      if (activeTool !== 'cursor') return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelection(null);
        return;
      }

      const range = sel.getRangeAt(0);
      const text = sel.toString().trim();
      if (text.length === 0) {
        setSelection(null);
        return;
      }

      let containerNode = range.commonAncestorContainer;
      if (containerNode.nodeType === 3) containerNode = containerNode.parentNode as Node;
      
      const pageElement = (containerNode as Element)?.closest('.pdf-page, [data-page-number]');
      if (!pageElement || !containerRef.current) return;

      const pageNumAttr = pageElement.getAttribute('data-page-number');
      if (!pageNumAttr) return;
      const pageNum = parseInt(pageNumAttr);

      const textLayer = pageElement.querySelector('.textLayer');
      if (!textLayer) return;

      const spans = Array.from(textLayer.querySelectorAll('span'));
      const relativeRects: { x: number; y: number; width: number; height: number }[] = [];
      
      const effectiveScale = scale; 

      for (const span of spans) {
        if (range.intersectsNode(span)) {
          const spanRange = document.createRange();
          spanRange.selectNodeContents(span);

          const pdfX = parseFloat(span.dataset.pdfX || '0');
          const pdfTop = parseFloat(span.dataset.pdfTop || '0');
          const pdfW = parseFloat(span.dataset.pdfWidth || '0');
          const pdfH = parseFloat(span.dataset.pdfHeight || '0');

          if (pdfW > 0) {
            let startRatio = 0;
            let endRatio = 1;

            if (range.compareBoundaryPoints(Range.START_TO_START, spanRange) > 0) {
                if (range.startContainer === span || span.contains(range.startContainer)) {
                     const len = range.startContainer.textContent?.length || 1;
                     startRatio = range.startOffset / len;
                } else if (range.startContainer.nodeType === 3) {
                     // Caso o container seja um nó de texto dentro do span
                     const len = range.startContainer.textContent?.length || 1;
                     startRatio = range.startOffset / len;
                }
            }
            if (range.compareBoundaryPoints(Range.END_TO_END, spanRange) < 0) {
                 if (range.endContainer === span || span.contains(range.endContainer)) {
                      const len = range.endContainer.textContent?.length || 1;
                      endRatio = range.endOffset / len;
                 } else if (range.endContainer.nodeType === 3) {
                      const len = range.endContainer.textContent?.length || 1;
                      endRatio = range.endOffset / len;
                 }
            }
            
            startRatio = Math.max(0, Math.min(1, startRatio));
            endRatio = Math.max(0, Math.min(1, endRatio));

            if (endRatio > startRatio) {
                const rectX = pdfX + (pdfW * startRatio);
                const rectW = pdfW * (endRatio - startRatio);
                
                relativeRects.push({
                    x: rectX / effectiveScale,
                    y: pdfTop / effectiveScale,
                    width: rectW / effectiveScale,
                    height: pdfH / effectiveScale
                });
            }
          }
        }
      }

      // --- MAGNETIC POSITIONING SYSTEM ---
      const clientRects = range.getClientRects();
      const boundingRect = range.getBoundingClientRect();
      
      const anchorRect = clientRects.length > 0 
        ? clientRects[clientRects.length - 1] 
        : boundingRect;

      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      
      const anchorBottom = anchorRect.bottom - containerRect.top + container.scrollTop;
      const anchorLeft = anchorRect.left - containerRect.left + container.scrollLeft;
      const anchorWidth = anchorRect.width;

      let popupY = anchorBottom + 8;
      let position: 'top' | 'bottom' = 'bottom';

      const viewportHeight = container.clientHeight;
      const visibleBottom = container.scrollTop + viewportHeight;
      const menuEstimatedHeight = 60;

      if (popupY + menuEstimatedHeight > visibleBottom) {
         const wholeBlockTop = boundingRect.top - containerRect.top + container.scrollTop;
         popupY = wholeBlockTop - menuEstimatedHeight; 
         position = 'top';
      }

      const popupX = anchorLeft + (anchorWidth / 2);

      setSelection({
        page: pageNum,
        text,
        popupX,
        popupY,
        relativeRects,
        position
      });
    };

    const handleSelectionChange = () => {
      if (selectionDebounce.current) clearTimeout(selectionDebounce.current);
      
      // OCULTAR IMEDIATAMENTE: Garante que o menu suma enquanto arrasta
      setSelection(null);

      // DELAY AUMENTADO: Só processa após 500ms de inatividade
      selectionDebounce.current = setTimeout(processSelection, 500);
    };

    const handleInteractionEnd = (e: Event) => {
      if (e.target instanceof Element && e.target.closest('button, input, textarea, .ui-panel')) return;
      
      // Ao soltar o mouse, podemos ser mais rápidos que o debounce de 500ms
      // para dar feedback de conclusão, mas limpamos o timer anterior.
      if (selectionDebounce.current) clearTimeout(selectionDebounce.current);
      setTimeout(processSelection, 10);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('mouseup', handleInteractionEnd);
    document.addEventListener('touchend', handleInteractionEnd);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('mouseup', handleInteractionEnd);
      document.removeEventListener('touchend', handleInteractionEnd);
      if (selectionDebounce.current) clearTimeout(selectionDebounce.current);
    };
  }, [activeTool, scale]);

  return { selection, setSelection };
};
