
import React, { useEffect } from 'react';
import { Editor, EditorContent } from '@tiptap/react';
import { OutlineSidebar } from '../OutlineSidebar';
import { SlideNavigationControls } from '../SlideNavigationControls';
import { TableBubbleMenu } from '../TableBubbleMenu';
import { ImageBubbleMenu } from '../ImageBubbleMenu';
import { AiBubbleMenu } from '../AiBubbleMenu';
import { SuggestionBubbleMenu } from '../SuggestionBubbleMenu';
import { FootnoteBubbleMenu } from '../FootnoteBubbleMenu';
import { FindReplaceBar } from '../FindReplaceBar';
import { Ruler } from '../Ruler';
import { VerticalRuler } from '../VerticalRuler';
import { FootnotesLayer } from '../FootnotesLayer';
import { DocAiSidebar } from '../../DocAiSidebar';
import { CommentsSidebar, CommentData } from '../CommentsSidebar';
import { ImageOptionsSidebar } from '../ImageOptionsSidebar';
import { PageSettings } from '../modals/PageSetupModal';

interface DocCanvasProps {
  editor: Editor;
  fileHandler: any;
  pageLayout: any;
  modes: any;
  modals: any;
  sidebars: any;
  toggleModal: (name: string, value?: boolean) => void;
  toggleSidebar: (name: string, value?: boolean) => void;
  currentPage: number;
  docScrollerRef: React.RefObject<HTMLDivElement>;
  contentRef: React.RefObject<HTMLDivElement>;
  nextPage: () => void;
  prevPage: () => void;
  handleJumpToPage: (page: number) => void;
  comments: CommentData[];
  handleAddComment: (text: string) => void;
  onResolveComment: (id: string) => void;
  onDeleteComment: (id: string) => void;
  activeCommentId: string | null;
  setActiveCommentId: (id: string | null) => void;
  userInfo: any;
}

export const DocCanvas: React.FC<DocCanvasProps> = ({
  editor,
  fileHandler,
  pageLayout,
  modes,
  modals,
  sidebars,
  toggleModal,
  toggleSidebar,
  currentPage,
  docScrollerRef,
  contentRef,
  nextPage,
  prevPage,
  handleJumpToPage,
  comments,
  handleAddComment,
  onResolveComment,
  onDeleteComment,
  activeCommentId,
  setActiveCommentId,
  userInfo
}) => {
  
  // Translate content to simulate slide view (Single Page Focus)
  // This logic aligns the current page to the top of the view window
  const effectivePageHeight = pageLayout.currentPaper.heightPx + 20; // Altura + Gap
  const contentTranslateY = -((currentPage - 1) * effectivePageHeight);

  // Scaled dimensions for the wrapper
  const scaledWidth = pageLayout.currentPaper.widthPx * pageLayout.zoom;
  const scaledHeight = pageLayout.currentPaper.heightPx * pageLayout.zoom;

  // Reset scroll on mount to ensure top visibility
  useEffect(() => {
    if (docScrollerRef.current) {
      docScrollerRef.current.scrollTop = 0;
    }
  }, [currentPage]); // Also reset when page changes to ensure top alignment

  // Render Page Number Helper
  const renderPageNumber = (pageIndex: number) => {
      const config = pageLayout.pageSettings.pageNumber;
      if (!config || !config.enabled) return null;

      const physicalPageNum = pageIndex + 1;
      
      if (physicalPageNum < (config.displayFromPage || 1)) return null;

      const offset = (config.displayFromPage || 1) - 1;
      const displayNum = (physicalPageNum - offset) + (config.startAt - 1);

      const isHeader = config.position === 'header';
      const align = config.alignment || 'right';
      
      const style: React.CSSProperties = {
          position: 'absolute',
          pointerEvents: 'none',
          fontSize: '10pt',
          fontFamily: '"Times New Roman", Times, serif',
          color: '#000000',
          zIndex: 20
      };

      if (isHeader) {
          style.top = `${pageLayout.pageSettings.marginTop / 2}cm`;
      } else {
          style.bottom = `${pageLayout.pageSettings.marginBottom / 2}cm`;
      }

      const marginLeft = `${pageLayout.pageSettings.marginLeft}cm`;
      const marginRight = `${pageLayout.pageSettings.marginRight}cm`;

      if (align === 'left') style.left = marginLeft;
      else if (align === 'right') style.right = marginRight;
      else {
          style.left = '50%';
          style.transform = 'translateX(-50%)';
      }

      return (
          <div style={style}>
              {displayNum}
          </div>
      );
  };

  const handleRegionClick = (type: 'header' | 'footer', e: React.MouseEvent) => {
      if (e.detail === 2) { 
          e.preventDefault();
          e.stopPropagation();
          const event = new CustomEvent('edit-region', { detail: { type } });
          window.dispatchEvent(event);
      }
  };

  return (
    <div className="flex-1 overflow-hidden relative flex bg-black">
      {/* UI Elements Fixed/Overlay */}
      <OutlineSidebar editor={editor} isOpen={sidebars.outline} onClose={() => toggleSidebar('outline', false)} />
      
      <SlideNavigationControls 
        isVisible={true}
        currentPage={currentPage}
        totalPages={pageLayout.totalPages}
        onNext={nextPage}
        onPrev={prevPage}
      />

      <TableBubbleMenu editor={editor} onOpenProperties={() => toggleModal('tableProperties', true)} />
      <ImageBubbleMenu editor={editor} onOpenOptions={() => toggleSidebar('imageOptions', true)} />
      <AiBubbleMenu editor={editor} />
      <SuggestionBubbleMenu editor={editor} />
      <FootnoteBubbleMenu editor={editor} />
      <FindReplaceBar editor={editor} isOpen={modals.findReplace} onClose={() => toggleModal('findReplace', false)} />

      {/* Main Scroll Container with Padding for Breathing Room */}
      <div 
        ref={docScrollerRef} 
        className="flex-1 overflow-auto relative custom-scrollbar flex bg-[#0a0a0a]"
      >
         {/* Centering Wrapper: m-auto centers content when smaller than viewport. 
             p-12 adds the critical breathing room at top/bottom/sides. 
             min-h-full ensures it stretches to allow centering vertically. */}
         <div className="m-auto p-12 min-h-full flex flex-col justify-start items-center">
             
             {/* Sizing Wrapper: Reserves the exact scaled space in the flow. 
                 This forces the scroller to show scrollbars if the page + padding is larger than the viewport. */}
             <div style={{ width: scaledWidth, height: scaledHeight, position: 'relative', flexShrink: 0 }}>
                 
                 {/* Visual Viewport: Clips content to show only ONE page */}
                 <div 
                    className="origin-top-left transition-transform will-change-transform bg-transparent"
                    style={{ 
                        transform: `scale(${pageLayout.zoom})`, 
                        width: pageLayout.currentPaper.widthPx,
                        height: pageLayout.currentPaper.heightPx, 
                        overflow: 'hidden', // CRITICAL: This enables the "Slide Mode" effect by hiding other pages
                        boxShadow: '0 20px 50px -12px rgba(0,0,0,0.5)'
                    }}
                 >
                    {/* Horizontal Ruler (Sticky to top of page context) */}
                    {pageLayout.showRuler && (
                        <div className="absolute top-0 left-0 right-0 z-[60]">
                            <Ruler 
                                editor={editor} 
                                width={pageLayout.currentPaper.widthPx} 
                                marginLeft={pageLayout.pageSettings.marginLeft}
                                marginRight={pageLayout.pageSettings.marginRight}
                            />
                        </div>
                    )}

                    {/* --- TRANSLATION LAYER --- 
                        Moves the entire document (all pages) up so the current page aligns with the top of the Viewport. */}
                    <div 
                        className="transition-transform duration-300 ease-out relative" 
                        style={{ 
                            transform: `translateY(${contentTranslateY}px)` 
                        }}
                    >
                        {/* Backgrounds & Vertical Rulers */}
                        <div className="absolute inset-0 pointer-events-none z-0">
                            {pageLayout.pages.map((page: any, i: number) => {
                                // Optimization: Only render background for current, prev, next pages to save DOM
                                if (Math.abs(i + 1 - currentPage) > 1) return null;
                                
                                const topPos = i * (page.heightPx + 20);

                                return (
                                    <div key={i} className="absolute left-0 w-full" style={{ top: topPos, height: page.heightPx }}>
                                        
                                        {pageLayout.showRuler && (i + 1 === currentPage) && (
                                            <div className="absolute left-0 top-0 bottom-0 h-full z-[50] pointer-events-auto">
                                                <VerticalRuler 
                                                    heightPx={page.heightPx} 
                                                    marginTop={pageLayout.pageSettings.marginTop}
                                                    marginBottom={pageLayout.pageSettings.marginBottom}
                                                />
                                            </div>
                                        )}

                                        <div 
                                            className={`bg-white shadow-lg w-full h-full border border-[#333] relative transition-opacity duration-300`} 
                                            style={{ backgroundColor: pageLayout.pageSettings.pageColor }}
                                        >
                                            {/* HEADER */}
                                            <div 
                                                className="absolute left-0 right-0 pointer-events-auto cursor-pointer hover:bg-blue-50/50 transition-colors z-20 overflow-hidden"
                                                style={{ 
                                                    top: 0, 
                                                    height: `${pageLayout.pageSettings.marginTop}cm`,
                                                    padding: `0.5cm ${pageLayout.pageSettings.marginRight}cm 0 ${pageLayout.pageSettings.marginLeft}cm`
                                                }}
                                                onClick={(e) => handleRegionClick('header', e)}
                                                title="Cabeçalho (Clique duplo para editar)"
                                            >
                                                {renderPageNumber(i)}
                                                {pageLayout.pageSettings.headerText ? (
                                                    <div className="text-sm text-gray-600 text-center whitespace-pre-wrap font-serif">
                                                        {pageLayout.pageSettings.headerText}
                                                    </div>
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center opacity-0 hover:opacity-100 text-[10px] text-blue-400 font-bold uppercase tracking-wider border-b border-dashed border-blue-200">
                                                        Área do Cabeçalho
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {/* FOOTER */}
                                            <div 
                                                className="absolute left-0 right-0 bottom-0 pointer-events-auto cursor-pointer hover:bg-blue-50/50 transition-colors z-20 overflow-hidden"
                                                style={{ 
                                                    height: `${pageLayout.pageSettings.marginBottom}cm`,
                                                    padding: `0.5cm ${pageLayout.pageSettings.marginRight}cm 0 ${pageLayout.pageSettings.marginLeft}cm`
                                                }}
                                                onClick={(e) => handleRegionClick('footer', e)}
                                                title="Rodapé (Clique duplo para editar)"
                                            >
                                                {pageLayout.pageSettings.pageNumber?.position === 'footer' && renderPageNumber(i)}
                                                {pageLayout.pageSettings.footerText ? (
                                                    <div className="text-sm text-gray-600 text-center whitespace-pre-wrap font-serif">
                                                        {pageLayout.pageSettings.footerText}
                                                    </div>
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center opacity-0 hover:opacity-100 text-[10px] text-blue-400 font-bold uppercase tracking-wider border-t border-dashed border-blue-200">
                                                        Área do Rodapé
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        
                        {/* Footnotes Layer */}
                        <FootnotesLayer 
                            editor={editor}
                            pageHeight={pageLayout.currentPaper.heightPx}
                            pageGap={20}
                            marginBottom={pageLayout.pageSettings.marginBottom}
                            marginLeft={pageLayout.pageSettings.marginLeft}
                            marginRight={pageLayout.pageSettings.marginRight}
                        />

                        {/* Main Content (Editor) */}
                        <div 
                            ref={contentRef} 
                            className="relative z-10 h-full gpu-layer transition-transform duration-300 ease-out" 
                            style={{ 
                                paddingTop: `${pageLayout.pageSettings.marginTop}cm`, 
                                paddingLeft: `${pageLayout.pageSettings.marginLeft}cm`, 
                                paddingRight: `${pageLayout.pageSettings.marginRight}cm`,
                                paddingBottom: `${pageLayout.pageSettings.marginBottom}cm`,
                                // Removed min-h-screen to prevent forced expansion beyond clip area
                            }}
                        >
                            <EditorContent editor={editor} />
                        </div>
                    </div>
                 </div>
             </div>
         </div>
      </div>
      
      <DocAiSidebar editor={editor} isOpen={sidebars.aiChat} onClose={() => toggleSidebar('aiChat', false)} documentName={fileHandler.currentName} />
      <CommentsSidebar editor={editor} isOpen={sidebars.comments} onClose={() => toggleSidebar('comments', false)} comments={comments} onAddComment={handleAddComment} onResolveComment={() => {}} onDeleteComment={() => {}} activeCommentId={activeCommentId} setActiveCommentId={setActiveCommentId} />
      <ImageOptionsSidebar editor={editor} isOpen={sidebars.imageOptions} onClose={() => toggleSidebar('imageOptions', false)} />
    </div>
  );
};
