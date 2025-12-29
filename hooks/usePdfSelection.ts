
import React, { useState, useCallback, useEffect } from 'react';
import { SelectionState } from '../components/pdf/SelectionMenu';

interface UsePdfSelectionProps {
  activeTool: string;
  scale: number;
  containerRef?: React.RefObject<HTMLDivElement>;
}

// Armazena a referência lógica da âncora em vez do nó DOM instável
interface AnchorData {
    page: number;
    index: number; // Índice do span dentro da página
}

export const usePdfSelection = ({ activeTool, scale, containerRef }: UsePdfSelectionProps) => {
  const [selection, setSelection] = useState<SelectionState | null>(null);
  
  // Estado da Máquina de Seleção (Lógico)
  const [anchorData, setAnchorData] = useState<AnchorData | null>(null);

  // Limpeza de segurança quando a seleção é fechada externamente (pelo menu) ou ferramenta muda
  useEffect(() => {
    if (!selection) {
        setAnchorData(null);
        document.querySelectorAll('.selection-anchor').forEach(el => el.classList.remove('selection-anchor'));
    }
  }, [selection]);

  // Limpeza ao mudar ferramenta
  useEffect(() => {
    setSelection(null); 
    // O effect acima cuidará do resto
  }, [activeTool]);

  // Função pura para calcular geometria baseada nos nós DOM e data-attributes
  const calculateGeometry = useCallback((spans: HTMLElement[], startIndex: number, endIndex: number, pageNum: number) => {
      // Normaliza ordem (pode ter clicado de baixo pra cima)
      const first = Math.min(startIndex, endIndex);
      const last = Math.max(startIndex, endIndex);
      
      const selectedSpans = spans.slice(first, last + 1);
      const fullText = selectedSpans.map(s => s.textContent).join('');

      // Calcular Rects relativos
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

      return {
        page: pageNum,
        text: fullText,
        popupX: 0, 
        popupY: 0,
        relativeRects,
        position: 'bottom'
      };

  }, [scale]);

  // --- MÁQUINA DE ESTADOS DO TAP (USANDO ÍNDICES) ---
  const onSmartTap = useCallback((target: HTMLElement) => {
      // Ignora se não for cursor ou se clicou fora de texto
      if (activeTool !== 'cursor') return;
      
      const isTextNode = target.tagName === 'SPAN' && target.parentElement?.classList.contains('textLayer');

      // CASO 1: Clique fora
      if (!isTextNode) {
          // NÃO faz nada. A seleção persiste até o usuário fechar o menu explicitamente.
          return;
      }

      // Identificar Página e Índice
      const pageElement = target.closest('.pdf-page, [data-page-number]');
      if (!pageElement) return;
      const pageNum = parseInt(pageElement.getAttribute('data-page-number') || '1');
      
      const textLayer = target.parentElement;
      if (!textLayer) return;
      
      const allSpans = Array.from(textLayer.querySelectorAll('span')) as HTMLElement[];
      const targetIndex = allSpans.indexOf(target);
      
      if (targetIndex === -1) return; // Erro de integridade

      // CASO 2: Definindo a Âncora (Ou nova âncora se mudou de página)
      if (!anchorData || anchorData.page !== pageNum) {
          // Limpa âncoras antigas visuais
          document.querySelectorAll('.selection-anchor').forEach(el => el.classList.remove('selection-anchor'));
          
          setAnchorData({ page: pageNum, index: targetIndex });
          target.classList.add('selection-anchor');

          // Abre menu imediato para a palavra única
          const menuState = calculateGeometry(allSpans, targetIndex, targetIndex, pageNum);
          if (menuState) setSelection(menuState as any);
          return;
      }

      // CASO 3: Âncora já existe na mesma página -> Define/Atualiza Range
      if (anchorData && anchorData.page === pageNum) {
          // Calcular Range Virtual e Atualizar Seleção
          const menuState = calculateGeometry(allSpans, anchorData.index, targetIndex, pageNum);
          if (menuState) {
              setSelection(menuState as any);
          }
          // Mantemos anchorData ativo para permitir "Pivot" (selecionar outra palavra final sem perder o início)
      }

  }, [activeTool, anchorData, calculateGeometry]);

  return { selection, setSelection, onSmartTap };
};
