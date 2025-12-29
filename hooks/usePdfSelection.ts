
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
      // Dupla verificação de ferramenta ativa
      if (activeTool !== 'cursor') return;

      const sel = window.getSelection();
      
      // STRICT MODE: Se não houver seleção válida, limpa imediatamente.
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelection(null);
        return;
      }

      const range = sel.getRangeAt(0);
      const text = sel.toString().trim();
      
      // STRICT MODE: Texto vazio limpa o menu
      if (text.length === 0) {
        setSelection(null);
        return;
      }

      // STRICT CONTEXT CHECK (Adobe Behavior)
      // Verifica estritamente se o início E o fim da seleção estão dentro da camada de texto.
      // Se o usuário arrastar para a margem (void), limpamos a seleção visual customizada.
      const anchorNode = sel.anchorNode;
      const focusNode = sel.focusNode;
      
      const isAnchorValid = anchorNode && (anchorNode.nodeType === 3 ? anchorNode.parentElement : (anchorNode as Element))?.closest('.textLayer');
      const isFocusValid = focusNode && (focusNode.nodeType === 3 ? focusNode.parentElement : (focusNode as Element))?.closest('.textLayer');

      if (!isAnchorValid || !isFocusValid) {
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

      // SAFETY CHECK: Se o range container for o próprio textLayer, o browser selecionou o fundo entre spans.
      if (containerNode === textLayer) {
          // Validação Estrita: Só aceita se a seleção contiver nós de texto reais
          const walker = document.createTreeWalker(range.cloneContents(), NodeFilter.SHOW_TEXT);
          if (!walker.nextNode()) {
              setSelection(null);
              return;
          }
      }

      const spans = Array.from(textLayer.querySelectorAll('span'));
      const relativeRects: { x: number; y: number; width: number; height: number }[] = [];
      
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
                }
            }
            
            if (range.compareBoundaryPoints(Range.END_TO_END, spanRange) < 0) {
                 if (range.endContainer === span || span.contains(range.endContainer)) {
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
                    x: rectX / scale,
                    y: pdfTop / scale,
                    width: rectW / scale,
                    height: pdfH / scale
                });
            }
          }
        }
      }

      if (relativeRects.length === 0) {
          setSelection(null);
          return;
      }

      // --- MAGNETIC POSITIONING SYSTEM (V2) ---
      const lastRect = relativeRects[relativeRects.length - 1];
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      
      const pageRect = pageElement.getBoundingClientRect();
      
      const anchorLeftPagePx = lastRect.x * scale;
      const anchorTopPagePx = lastRect.y * scale;
      const anchorHeightPagePx = lastRect.height * scale;
      const anchorWidthPagePx = lastRect.width * scale;

      const screenLeft = pageRect.left + anchorLeftPagePx;
      const screenTop = pageRect.top + anchorTopPagePx;
      
      const relativeLeft = screenLeft - containerRect.left + container.scrollLeft;
      const relativeTop = screenTop - containerRect.top + container.scrollTop;
      const relativeBottom = relativeTop + anchorHeightPagePx;

      let popupY = relativeBottom + 8;
      let position: 'top' | 'bottom' = 'bottom';

      const viewportHeight = container.clientHeight;
      const visibleBottom = container.scrollTop + viewportHeight;
      const menuEstimatedHeight = 60;

      if (popupY + menuEstimatedHeight > visibleBottom) {
         popupY = relativeTop - menuEstimatedHeight; 
         position = 'top';
      }

      const popupX = relativeLeft + (anchorWidthPagePx / 2);

      // Validação final de coordenadas para evitar NaN
      if (isNaN(popupX) || isNaN(popupY)) {
          setSelection(null);
          return;
      }

      setSelection({
        page: pageNum,
        text,
        popupX,
        popupY,
        relativeRects,
        position
      });
    };

    // --- EVENT HANDLERS ---

    const handleSelectionChange = () => {
      // Limpa imediatamente ao mudar a seleção para dar feedback rápido
      if (selectionDebounce.current) clearTimeout(selectionDebounce.current);
      // Não limpa o estado imediatamente para evitar piscar, a menos que a seleção esteja vazia
      // setSelection(null); 
      
      // Debounce curto para recalcular apenas quando o usuário parar
      selectionDebounce.current = setTimeout(processSelection, 200);
    };

    // Listeners globais
    document.addEventListener('selectionchange', handleSelectionChange);
    
    // Resize também recalcula posição
    window.addEventListener('resize', handleSelectionChange);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      window.removeEventListener('resize', handleSelectionChange);
      if (selectionDebounce.current) clearTimeout(selectionDebounce.current);
    };
  }, [activeTool, scale]);

  return { selection, setSelection };
};
