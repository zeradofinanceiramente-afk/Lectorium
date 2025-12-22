
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
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useState<'paged' | 'continuous'>('paged');
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

  const handleFitWidth = useCallback(() => {
    const isMobile = window.innerWidth < 768;
    if (viewMode === 'paged' && isMobile) {
      const padding = 32; 
      const availableWidth = window.innerWidth - padding;
      const requiredWidth = currentPaper.widthPx; 
      let newZoom = availableWidth / requiredWidth;
      newZoom = Math.max(0.25, Math.min(newZoom, 5.0));
      setZoom(newZoom);
    } else if (isMobile) {
       setZoom(window.innerWidth / (currentPaper.widthPx + 40));
    } else {
       setZoom(1);
    }
  }, [viewMode, currentPaper]);

  useEffect(() => {
    handleFitWidth();
    window.addEventListener('resize', handleFitWidth);
    return () => window.removeEventListener('resize', handleFitWidth);
  }, [handleFitWidth]);

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
