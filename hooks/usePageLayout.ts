
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Editor } from '@tiptap/react';
import { PAPER_SIZES, CM_TO_PX } from '../components/doc/constants';
import { PageSettings } from '../components/doc/modals/PageSetupModal';

interface UsePageLayoutProps {
  editor: Editor | null;
  initialSettings: PageSettings;
  contentRef: React.RefObject<HTMLDivElement>;
}

export interface PageLayoutState {
    widthPx: number;
    heightPx: number;
}

export const usePageLayout = ({ editor, initialSettings, contentRef }: UsePageLayoutProps) => {
  // Zoom padrão 1.1 (110%) para leitura confortável em desktop
  const [zoom, setZoom] = useState(1.1);
  const [viewMode, setViewMode] = useState<'slide' | 'continuous'>('slide');
  const [showRuler, setShowRuler] = useState(true);
  
  // Apenas a contagem de páginas importa agora, o conteúdo é gerenciado pela extensão
  const [pageCount, setPageCount] = useState(1);
  
  const [pageSettings, setPageSettings] = useState<PageSettings>({
      ...initialSettings,
      pageColor: '#ffffff', 
  });
  
  const getDimensions = (settings: any) => {
      const size = PAPER_SIZES[settings.paperSize] || PAPER_SIZES['a4'];
      const isPortrait = settings.orientation === 'portrait';
      const widthCm = isPortrait ? size.widthCm : size.heightCm;
      const heightCm = isPortrait ? size.heightCm : size.widthCm;
      return {
          widthPx: widthCm * CM_TO_PX,
          heightPx: heightCm * CM_TO_PX,
          widthCm,
          heightCm
      };
  };

  const currentPaper = useMemo(() => {
      const dims = getDimensions(pageSettings);
      return { ...dims, pageGap: 20 };
  }, [pageSettings]);

  // Sincroniza Configurações com a Extensão de Paginação
  useEffect(() => {
    if (editor && (editor.commands as any).setPaginationOptions) {
        (editor.commands as any).setPaginationOptions({
            pageHeight: currentPaper.heightPx,
            pageMarginTop: pageSettings.marginTop * CM_TO_PX,
            pageMarginBottom: pageSettings.marginBottom * CM_TO_PX,
            pageGap: currentPaper.pageGap,
        });
    }
  }, [editor, currentPaper, pageSettings]);

  // Ouve evento da extensão para atualizar número de páginas
  useEffect(() => {
      if (!editor || !editor.view) return;

      const handlePaginationUpdate = (e: Event) => {
          const customEvent = e as CustomEvent;
          if (customEvent.detail && typeof customEvent.detail.count === 'number') {
              setPageCount(customEvent.detail.count);
          }
      };

      editor.view.dom.addEventListener('pagination-calculated', handlePaginationUpdate);
      return () => {
          editor.view.dom.removeEventListener('pagination-calculated', handlePaginationUpdate);
      };
  }, [editor]);

  // Gera array de páginas para renderização do background
  const pages = useMemo(() => {
      const arr = [];
      for (let i = 0; i < pageCount; i++) {
          arr.push({
              widthPx: currentPaper.widthPx,
              heightPx: currentPaper.heightPx,
          });
      }
      return arr;
  }, [pageCount, currentPaper]);

  // "Fit Width" inteligente: detecta mobile para ajustar zoom ao tamanho da tela
  const handleFitWidth = useCallback(() => {
      const containerWidth = window.innerWidth;
      const isMobile = containerWidth < 768;
      
      if (isMobile) {
          // Mobile: Calcula zoom para caber na tela com pequena margem (16px total de padding)
          const availableWidth = containerWidth - 16;
          const targetZoom = availableWidth / currentPaper.widthPx;
          // Limita o zoom mínimo para não ficar ilegível, mas permite fit
          setZoom(targetZoom);
          setShowRuler(false); // Esconde régua em mobile para ganhar espaço
      } else {
          // Desktop: Reseta para 100% ou um valor confortável
          setZoom(1);
          setShowRuler(true);
      }
  }, [currentPaper.widthPx]);

  // Auto-ajuste inicial em Mobile
  useEffect(() => {
      if (window.innerWidth < 768) {
          handleFitWidth();
      }
  }, []);

  return {
    zoom, setZoom,
    viewMode, setViewMode,
    showRuler, setShowRuler,
    totalPages: pageCount,
    pages,
    pageSettings, setPageSettings,
    currentPaper,
    handleFitWidth
  };
};
