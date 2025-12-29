
import React, { useState, useCallback, useEffect } from 'react';
import { SelectionState } from '../components/pdf/SelectionMenu';

interface UsePdfSelectionProps {
  activeTool: string;
  scale: number;
  containerRef?: React.RefObject<HTMLDivElement>;
}

export const usePdfSelection = ({ activeTool, scale, containerRef }: UsePdfSelectionProps) => {
  const [selection, setSelection] = useState<SelectionState | null>(null);
  
  // Estado da Máquina de Seleção
  const [anchorNode, setAnchorNode] = useState<HTMLElement | null>(null);

  // Limpeza de segurança: Se a ferramenta mudar, reseta tudo
  useEffect(() => {
    setSelection(null);
    if (anchorNode) {
        anchorNode.classList.remove('selection-anchor');
        setAnchorNode(null);
    }
    window.getSelection()?.removeAllRanges();
  }, [activeTool]);

  // Função pura para calcular geometria baseada nos nós DOM (sem depender do objeto Range nativo instável)
  const calculateGeometry = useCallback((startNode: HTMLElement, endNode: HTMLElement) => {
      const pageElement = startNode.closest('.pdf-page, [data-page-number]');
      if (!pageElement) return null;

      const pageNumAttr = pageElement.getAttribute('data-page-number');
      const pageNum = pageNumAttr ? parseInt(pageNumAttr) : 1;

      // 1. Identificar todos os spans entre Start e End
      const textLayer = startNode.parentElement;
      if (!textLayer) return null;
      
      const allSpans = Array.from(textLayer.querySelectorAll('span'));
      const startIndex = allSpans.indexOf(startNode);
      const endIndex = allSpans.indexOf(endNode);

      if (startIndex === -1 || endIndex === -1) return null;

      // Normaliza ordem (pode ter clicado de baixo pra cima)
      const first = Math.min(startIndex, endIndex);
      const last = Math.max(startIndex, endIndex);
      
      const selectedSpans = allSpans.slice(first, last + 1);
      const fullText = selectedSpans.map(s => s.textContent).join('');

      // 2. Calcular Rects relativos (CRÍTICO para o Highlight funcionar)
      const relativeRects: { x: number; y: number; width: number; height: number }[] = [];
      
      selectedSpans.forEach(span => {
          const pdfX = parseFloat(span.dataset.pdfX || '0');
          const pdfTop = parseFloat(span.dataset.pdfTop || '0');
          const pdfW = parseFloat(span.dataset.pdfWidth || '0');
          const pdfH = parseFloat(span.dataset.pdfHeight || '0');

          if (pdfW > 0) {
              relativeRects.push({
                  x: pdfX / scale,
                  y: pdfTop / scale,
                  width: pdfW / scale,
                  height: pdfH / scale
              });
          }
      });

      if (relativeRects.length === 0) return null;

      // Retorna estado. popupX e popupY são irrelevantes agora pois o menu é fixo via CSS.
      return {
        page: pageNum,
        text: fullText,
        popupX: 0, 
        popupY: 0,
        relativeRects,
        position: 'bottom'
      };

  }, [scale]);

  // --- MÁQUINA DE ESTADOS DO TAP ---
  const onSmartTap = useCallback((target: HTMLElement) => {
      // Ignora se não for cursor ou se clicou fora de texto
      if (activeTool !== 'cursor') return;
      
      const isTextNode = target.tagName === 'SPAN' && target.parentElement?.classList.contains('textLayer');

      // CASO 1: Clique fora (Reset)
      if (!isTextNode) {
          if (anchorNode) {
              anchorNode.classList.remove('selection-anchor');
              setAnchorNode(null);
          }
          setSelection(null);
          window.getSelection()?.removeAllRanges();
          return;
      }

      // CASO 2: Primeiro Clique (Definir Âncora)
      if (!anchorNode) {
          // Limpa seleção anterior
          window.getSelection()?.removeAllRanges();
          setSelection(null);
          
          setAnchorNode(target);
          target.classList.add('selection-anchor');
          return;
      }

      // CASO 3: Segundo Clique (Definir Range e Mostrar Menu)
      if (anchorNode) {
          // Validação: Devem estar na mesma página (mesmo pai)
          if (anchorNode.parentElement !== target.parentElement) {
              // Se clicou em outra página, reseta e começa nova âncora lá
              anchorNode.classList.remove('selection-anchor');
              setAnchorNode(target);
              target.classList.add('selection-anchor');
              return;
          }

          // 3.1 Criar Range Nativo (Para feedback visual azul do browser e copy/paste funcionar)
          const range = document.createRange();
          const position = anchorNode.compareDocumentPosition(target);
          
          if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
              range.setStartBefore(anchorNode);
              range.setEndAfter(target);
          } else {
              range.setStartBefore(target);
              range.setEndAfter(anchorNode);
          }
          
          const sel = window.getSelection();
          if (sel) {
              sel.removeAllRanges();
              sel.addRange(range);
          }

          // 3.2 Calcular Geometria e Mostrar Menu
          const menuState = calculateGeometry(anchorNode, target);
          if (menuState) {
              setSelection(menuState as any);
          }

          // 3.3 Limpeza de Estado
          anchorNode.classList.remove('selection-anchor');
          setAnchorNode(null);
      }

  }, [activeTool, anchorNode, calculateGeometry]);

  return { selection, setSelection, onSmartTap };
};
