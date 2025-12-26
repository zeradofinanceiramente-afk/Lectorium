
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useDocEditorConfig } from '../../hooks/useDocEditorConfig';
import { useDocFileHandler } from '../../hooks/useDocFileHandler';
import { usePageLayout } from '../../hooks/usePageLayout';
import { useDocUI } from '../../hooks/useDocUI';
import { EditorContent } from '@tiptap/react';
import { TopMenuBar } from './doc/TopMenuBar';
import { DocToolbar } from './doc/DocToolbar';
import { CommentsSidebar, CommentData } from './doc/CommentsSidebar';
import { OutlineSidebar } from './doc/OutlineSidebar';
import { DocAiSidebar } from './DocAiSidebar';
import { PageSetupModal } from './doc/modals/PageSetupModal';
import { WordCountModal } from './doc/modals/WordCountModal';
import { CitationModal } from './doc/modals/CitationModal';
import { ShareModal } from './doc/modals/ShareModal';
import { TablePropertiesModal } from './doc/modals/TablePropertiesModal';
import { HeaderFooterModal } from './doc/modals/HeaderFooterModal';
import { ImageOptionsSidebar } from './doc/ImageOptionsSidebar';
import { TableBubbleMenu } from './doc/TableBubbleMenu';
import { ImageBubbleMenu } from './doc/ImageBubbleMenu';
import { AiBubbleMenu } from './doc/AiBubbleMenu';
import { SuggestionBubbleMenu } from './doc/SuggestionBubbleMenu';
import { FootnoteBubbleMenu } from './doc/FootnoteBubbleMenu';
import { FindReplaceBar } from './doc/FindReplaceBar';
import { Ruler } from './doc/Ruler';
import { VerticalRuler } from './doc/VerticalRuler';
import { Loader2, ArrowLeft, FileText, Cloud, Sparkles, Users, Share2, Lock } from 'lucide-react';
import { Reference, EditorStats, MIME_TYPES } from '../../types';
import { auth } from '../../firebase';
import { generateDocxBlob } from '../../services/docxService';
import { useSlideNavigation } from '../../hooks/useSlideNavigation';
import { SlideNavigationControls } from './SlideNavigationControls';
import { ColumnsModal } from './doc/modals/ColumnsModal';

interface Props {
  fileId: string;
  fileName: string;
  fileBlob?: Blob;
  accessToken: string;
  onToggleMenu: () => void;
  onAuthError?: () => void;
  onBack?: () => void;
}

const ViewLoader = () => (
  <div className="flex-1 flex flex-col items-center justify-center bg-bg">
    <Loader2 size={40} className="animate-spin text-brand mb-4" />
    <p className="text-sm text-text-sec">Preparando editor...</p>
  </div>
);

export const DocEditor: React.FC<Props> = ({ 
  fileId, fileName, fileBlob, accessToken, 
  onToggleMenu, onAuthError, onBack 
}) => {
  const isLocalFile = fileId.startsWith('local-') || !accessToken;
  const { modals, sidebars, modes, toggleModal, toggleSidebar, toggleMode } = useDocUI();
  
  const [comments, setComments] = useState<CommentData[]>([]);
  const [references, setReferences] = useState<Reference[]>([]);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [activeHeaderFooterTab, setActiveHeaderFooterTab] = useState<'header' | 'footer'>('header');
  const [isSharing, setIsSharing] = useState(false);
  
  // Estado de Página Atual
  const [currentPage, setCurrentPage] = useState(1);

  // Referência para o input de arquivo oculto
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userInfo = useMemo(() => {
    const u = auth.currentUser;
    return { name: u?.displayName || 'Visitante', color: '#4ade80' };
  }, []);

  const { editor, spellCheck, setSpellCheck } = useDocEditorConfig({ fileId, userInfo });
  const contentRef = useRef<HTMLDivElement>(null);
  const docScrollerRef = useRef<HTMLDivElement>(null);

  const pageLayout = usePageLayout({
    editor,
    initialSettings: { paperSize: 'a4', orientation: 'portrait', pageColor: '#ffffff', marginTop: 3, marginBottom: 2, marginLeft: 3, marginRight: 2 },
    contentRef
  });

  const fileHandler = useDocFileHandler({
    editor, fileId, fileName, fileBlob, accessToken, isLocalFile, onAuthError, onBack,
    onFitWidth: pageLayout.handleFitWidth, onLoadSettings: pageLayout.setPageSettings,
    onLoadComments: setComments, onLoadReferences: setReferences
  });

  // --- SLIDE NAVIGATION (Hooks) ---
  const isSlideMode = true; // Always true as requested

  const { nextPage, prevPage } = useSlideNavigation({
    currentPage,
    totalPages: pageLayout.totalPages,
    isSlideMode,
    onPageChange: (newPage) => {
      setCurrentPage(newPage);
      // Reset scroll position for the container
      if (docScrollerRef.current) {
          docScrollerRef.current.scrollTo({ top: 0 });
      }
    }
  });

  // --- AUTO-PAGINATION & REDIRECT LOGIC ---
  useEffect(() => {
    if (!editor || !isSlideMode) return;

    const checkCursorPage = () => {
        if (!editor || editor.isDestroyed || !editor.view) return;

        const { selection, doc } = editor.state;
        const { from } = selection;

        // Safety: Ensure position is valid within document bounds
        if (from < 0 || from > doc.content.size) return;

        try {
            // Obter coordenadas do cursor relativas à viewport
            // Use 'side' param to avoid issues at boundaries
            const coords = editor.view.coordsAtPos(from, -1);
            
            // Altura de uma página renderizada
            const pageHeight = pageLayout.currentPaper.heightPx;
            const pageGap = 20;
            const totalUnit = pageHeight + pageGap;

            // Encontrar o elemento DOM correspondente à seleção
            // Usamos domAtPos com segurança
            const domResult = editor.view.domAtPos(from);
            const domNode = domResult.node;
            const element = (domNode instanceof HTMLElement ? domNode : domNode.parentElement) as HTMLElement;
            
            if (element) {
                // offsetTop do elemento em relação ao container do editor (que tem altura total do doc)
                // Isso funciona porque o container interno do Tiptap cresce com o conteúdo
                let offsetTop = element.offsetTop;
                let currentEl = element;
                
                // Subir até encontrar o editor-content para ter o offset relativo correto
                while(currentEl && !currentEl.classList.contains('ProseMirror') && currentEl.parentElement) {
                    currentEl = currentEl.parentElement;
                    offsetTop += currentEl.offsetTop;
                }

                // Calcular página baseada na posição Y absoluta
                const calculatedPage = Math.floor(offsetTop / totalUnit) + 1;

                // Se a página calculada for diferente da atual, REDIRECIONAR (Snap)
                if (calculatedPage !== currentPage && calculatedPage >= 1 && calculatedPage <= pageLayout.totalPages) {
                    setCurrentPage(calculatedPage);
                    // Resetar scroll visual
                    if (docScrollerRef.current) docScrollerRef.current.scrollTop = 0;
                }
            }
        } catch (e) {
            // Ignorar erros transientes de layout ou range
        }
    };

    // Use 'update' instead of 'transaction' to ensure View/DOM is synced with State
    editor.on('selectionUpdate', checkCursorPage);
    editor.on('update', checkCursorPage);

    return () => { 
        editor.off('selectionUpdate', checkCursorPage); 
        editor.off('update', checkCursorPage);
    }
  }, [editor, currentPage, pageLayout.currentPaper.heightPx, pageLayout.totalPages, isSlideMode]);

  const handleJumpToPage = useCallback((page: number) => {
      const target = Math.max(1, Math.min(page, pageLayout.totalPages));
      setCurrentPage(target);
  }, [pageLayout.totalPages]);

  const handleAddComment = useCallback((text: string) => {
    if (!editor) return;
    const id = `comment-${Date.now()}`;
    (editor.chain().focus() as any).setComment(id).run();
    setComments(prev => [...prev, { id, text, author: userInfo.name, createdAt: new Date().toISOString() }]);
    setActiveCommentId(id);
  }, [editor, userInfo.name]);

  const triggerImageUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editor) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const src = event.target?.result as string;
        if (src) {
          editor.chain().focus().setImage({ src }).run();
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  }, [editor]);

  const stats = useMemo<EditorStats>(() => {
     if (!editor) return { words: 0, chars: 0, charsNoSpace: 0, readTime: 0 };
     const words = editor.storage.characterCount.words();
     return { words, chars: editor.storage.characterCount.characters(), charsNoSpace: words, readTime: Math.ceil(words / 200) };
  }, [editor]);

  const handleRegionClick = (type: 'header' | 'footer', e: React.MouseEvent) => {
      if (e.detail === 3) {
          e.preventDefault();
          e.stopPropagation();
          setActiveHeaderFooterTab(type);
          toggleModal('headerFooter', true);
      }
  };

  const handleNativeShare = useCallback(async () => {
    if (!editor) return;
    setIsSharing(true);
    try {
      const json = editor.getJSON();
      const blob = await generateDocxBlob(json, pageLayout.pageSettings, comments, references);
      const fileNameWithExt = fileHandler.currentName.endsWith('.docx') ? fileHandler.currentName : `${fileHandler.currentName}.docx`;
      const file = new File([blob], fileNameWithExt, { type: MIME_TYPES.DOCX });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: fileHandler.currentName, text: 'Documento compartilhado via Lectorium' });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileNameWithExt;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') { console.error("Erro ao compartilhar:", e); alert("Não foi possível compartilhar o arquivo."); }
    } finally {
      setIsSharing(false);
    }
  }, [editor, fileHandler.currentName, pageLayout.pageSettings, comments, references]);

  // Handle Columns Application
  const handleApplyColumns = (count: number) => {
    if (!editor) return;
    if (count === 1) {
        (editor.chain().focus() as any).unsetColumns().run();
    } else {
        (editor.chain().focus() as any).setColumns(count).run();
    }
  };

  if (!editor) return <ViewLoader />;

  // Translate content to simulate slide view
  const effectivePageHeight = pageLayout.currentPaper.heightPx + 20; // Altura + Gap
  const contentTranslateY = -((currentPage - 1) * effectivePageHeight);

  return (
    <div className={`flex flex-col h-full bg-bg relative overflow-hidden text-text ${modes.focus ? 'focus-mode' : ''}`}>
       <div className="bg-surface border-b border-border z-50 shrink-0">
             <div className="flex items-center justify-between px-4 pt-3 pb-1">
                <div className="flex items-start gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full text-text-sec mt-1"><ArrowLeft size={20} /></button>
                    <div className="pt-2 text-blue-400"><FileText size={28} /></div>
                    <div className="flex flex-col">
                        <input value={fileHandler.currentName} onChange={e => fileHandler.setCurrentName(e.target.value)} onBlur={fileHandler.handleRename} className="bg-transparent text-text font-medium text-lg outline-none px-2 rounded -ml-2 focus:border-brand transition-colors" />
                        <TopMenuBar 
                            editor={editor} fileName={fileHandler.currentName} onSave={() => fileHandler.handleSave(pageLayout.pageSettings, comments, references)}
                            onShare={handleNativeShare} onNew={onToggleMenu} onWordCount={() => toggleModal('wordCount', true)}
                            onDownload={fileHandler.handleDownload} onDownloadLect={fileHandler.handleDownloadLect} onExportPdf={() => window.print()}
                            onInsertImage={triggerImageUpload} onTrash={fileHandler.handleTrash} onPageSetup={() => toggleModal('pageSetup', true)}
                            onPageNumber={() => toggleModal('pageNumber', true)} 
                            currentPage={currentPage}
                            onHeader={() => { setActiveHeaderFooterTab('header'); toggleModal('headerFooter', true); }} 
                            onFooter={() => { setActiveHeaderFooterTab('footer'); toggleModal('headerFooter', true); }} 
                            onAddFootnote={() => (editor.chain().focus() as any).setFootnote().run()}
                            onAddCitation={() => toggleModal('citation', true)} onPrint={() => window.print()} onLanguage={() => toggleModal('language', true)}
                            onSpellCheck={() => setSpellCheck(!spellCheck)} onFindReplace={() => toggleModal('findReplace', true)}
                            onColumns={() => toggleModal('columns', true)} // Added this
                            showRuler={pageLayout.showRuler} setShowRuler={pageLayout.setShowRuler} zoom={pageLayout.zoom} setZoom={pageLayout.setZoom}
                            onFitWidth={pageLayout.handleFitWidth} viewMode={pageLayout.viewMode} setViewMode={pageLayout.setViewMode}
                            focusMode={modes.focus} setFocusMode={v => toggleMode('focus', v)} showComments={sidebars.comments} setShowComments={v => toggleSidebar('comments', v)}
                            suggestionMode={modes.suggestion} toggleSuggestionMode={() => toggleMode('suggestion')} toggleOutline={() => toggleSidebar('outline')} isOutlineOpen={sidebars.outline}
                            toggleDictation={() => toggleMode('dictation')} isDictationActive={modes.dictation} onExportHtml={() => {}}
                        />
                    </div>
                </div>
                <div className="flex items-center gap-4 mt-2">
                    <div className="text-text-sec">{(fileHandler.isSaving || isSharing) ? <Loader2 size={20} className="animate-spin" /> : <Cloud size={20} />}</div>
                    <button onClick={() => toggleSidebar('aiChat')} className={`p-2 rounded-full ${sidebars.aiChat ? 'bg-brand/20 text-brand' : 'text-text-sec'}`}><Sparkles size={20} /></button>
                    <button onClick={() => toggleSidebar('comments')} className={`p-2 rounded-full ${sidebars.comments ? 'bg-brand/20 text-brand' : 'text-text-sec'}`}><Users size={20} /></button>
                    <button onClick={handleNativeShare} disabled={isSharing} className="flex items-center gap-2 bg-[#c2e7ff] text-[#0b141a] px-4 py-2 rounded-full font-medium text-sm hover:brightness-110 transition-all disabled:opacity-50">
                        {isSharing ? <Loader2 size={16} className="animate-spin"/> : <Share2 size={16} />}
                        <span>Compartilhar</span>
                    </button>
                </div>
             </div>
          </div>

       {!modes.focus && (
           <DocToolbar 
               editor={editor} 
               onInsertImage={triggerImageUpload} 
               onAddFootnote={() => (editor.chain().focus() as any).setFootnote().run()} 
               currentPage={currentPage} 
               totalPages={pageLayout.totalPages} 
               onJumpToPage={handleJumpToPage} 
           />
       )}
       
       <div className="flex-1 overflow-hidden relative flex bg-black">
          <OutlineSidebar editor={editor} isOpen={sidebars.outline} onClose={() => toggleSidebar('outline', false)} />
          
          {/* Controls for Slide Mode */}
          <SlideNavigationControls 
            isVisible={true}
            currentPage={currentPage}
            totalPages={pageLayout.totalPages}
            onNext={nextPage}
            onPrev={prevPage}
            onExit={() => {}} // Disabled as Slide is default
          />

          {/* Main Scroll Container - Locked scroll for slide effect */}
          <div 
            ref={docScrollerRef} 
            className="flex-1 flex justify-center px-12 pb-12 relative overflow-hidden items-center cursor-default"
          >
             
             {/* Bubble Menus & Floating Controls */}
             <TableBubbleMenu editor={editor} onOpenProperties={() => toggleModal('tableProperties', true)} />
             <ImageBubbleMenu editor={editor} onOpenOptions={() => toggleSidebar('imageOptions', true)} />
             <AiBubbleMenu editor={editor} />
             <SuggestionBubbleMenu editor={editor} />
             <FootnoteBubbleMenu editor={editor} />
             <FindReplaceBar editor={editor} isOpen={modals.findReplace} onClose={() => toggleModal('findReplace', false)} />

             <div 
                className="relative my-8 transition-transform origin-top will-change-transform bg-transparent" 
                style={{ 
                    transform: `scale(${pageLayout.zoom})`, 
                    width: pageLayout.currentPaper.widthPx,
                    height: pageLayout.currentPaper.heightPx, // Fixed height per page
                    overflow: 'hidden', // Hide overflow to simulate single page
                    boxShadow: '0 0 50px -10px rgba(0,0,0,0.5)'
                }}
             >
                {/* Horizontal Ruler (Global) */}
                {pageLayout.showRuler && (
                    <div className="absolute -top-6 left-0 right-0 z-[60]">
                        <Ruler 
                            editor={editor} 
                            width={pageLayout.currentPaper.widthPx} 
                            marginLeft={pageLayout.pageSettings.marginLeft}
                            marginRight={pageLayout.pageSettings.marginRight}
                        />
                    </div>
                )}

                {/* --- CONTENT LAYER --- */}
                <div>
                    {/* Page Backgrounds & Vertical Rulers */}
                    <div className="absolute inset-0 pointer-events-none z-0">
                        {pageLayout.pages.map((page, i) => {
                            // Virtualization: Hide backgrounds of other pages in Slide Mode
                            if (i + 1 !== currentPage) return null;

                            // In Slide mode, top position is 0 because we only render one page background at top
                            // The content (text) will be shifted to match this via TranslateY on parent
                            const topPos = 0;

                            return (
                                <div key={i} className="absolute left-0 w-full chromium-virtual-render" style={{ top: topPos, height: page.heightPx }}>
                                    
                                    {/* Vertical Ruler per Page */}
                                    {pageLayout.showRuler && (
                                        <div className="absolute -left-6 top-0 bottom-0 h-full z-[50] pointer-events-auto">
                                            <VerticalRuler 
                                                heightPx={page.heightPx} 
                                                marginTop={pageLayout.pageSettings.marginTop}
                                                marginBottom={pageLayout.pageSettings.marginBottom}
                                            />
                                        </div>
                                    )}

                                    <div 
                                        className={`bg-white shadow-lg w-full h-full border border-[#333] flex flex-col justify-between relative transition-opacity duration-300`} 
                                        style={{ backgroundColor: pageLayout.pageSettings.pageColor }}
                                    >
                                        {/* Header Visualization */}
                                        {pageLayout.pageSettings.headerText ? (
                                            <div 
                                                className="px-12 py-6 text-sm text-gray-500 text-center whitespace-pre-wrap opacity-60 cursor-pointer pointer-events-auto hover:bg-black/5 transition-colors"
                                                title="Clique 3 vezes para editar o Cabeçalho"
                                                onClick={(e) => handleRegionClick('header', e)}
                                            >
                                                {pageLayout.pageSettings.headerText}
                                            </div>
                                        ) : (
                                            <div 
                                                className="h-16 w-full cursor-pointer pointer-events-auto hover:bg-black/5 transition-colors group relative"
                                                title="Clique 3 vezes para adicionar Cabeçalho"
                                                onClick={(e) => handleRegionClick('header', e)}
                                            >
                                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-30 text-xs text-gray-400">
                                                    Cabeçalho (Clique 3x)
                                                </div>
                                            </div>
                                        )}
                                        
                                        {/* Footer Visualization */}
                                        {pageLayout.pageSettings.footerText ? (
                                            <div 
                                                className="px-12 py-6 text-sm text-gray-500 text-center whitespace-pre-wrap opacity-60 mt-auto cursor-pointer pointer-events-auto hover:bg-black/5 transition-colors"
                                                title="Clique 3 vezes para editar o Rodapé"
                                                onClick={(e) => handleRegionClick('footer', e)}
                                            >
                                                {pageLayout.pageSettings.footerText}
                                            </div>
                                        ) : (
                                            <div 
                                                className="h-16 w-full mt-auto cursor-pointer pointer-events-auto hover:bg-black/5 transition-colors group relative"
                                                title="Clique 3 vezes para adicionar Rodapé"
                                                onClick={(e) => handleRegionClick('footer', e)}
                                            >
                                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-30 text-xs text-gray-400">
                                                    Rodapé (Clique 3x)
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    
                    {/* Main Content (Shifted in Slide Mode to align text with viewport) */}
                    <div 
                        ref={contentRef} 
                        className="relative z-10 min-h-screen gpu-layer transition-transform duration-300 ease-out" 
                        style={{ 
                            paddingTop: `${pageLayout.pageSettings.marginTop}cm`, 
                            paddingLeft: `${pageLayout.pageSettings.marginLeft}cm`, 
                            paddingRight: `${pageLayout.pageSettings.marginRight}cm`,
                            transform: `translateY(${contentTranslateY}px)`
                        }}
                    >
                        <EditorContent editor={editor} />
                    </div>
                </div>
             </div>
          </div>
          
          {/* Sidebars */}
          <DocAiSidebar editor={editor} isOpen={sidebars.aiChat} onClose={() => toggleSidebar('aiChat', false)} documentName={fileHandler.currentName} />
          <CommentsSidebar editor={editor} isOpen={sidebars.comments} onClose={() => toggleSidebar('comments', false)} comments={comments} onAddComment={handleAddComment} onResolveComment={() => {}} onDeleteComment={() => {}} activeCommentId={activeCommentId} setActiveCommentId={setActiveCommentId} />
          <ImageOptionsSidebar editor={editor} isOpen={sidebars.imageOptions} onClose={() => toggleSidebar('imageOptions', false)} />
       </div>

       <PageSetupModal isOpen={modals.pageSetup} initialSettings={pageLayout.pageSettings} initialViewMode={pageLayout.viewMode} onClose={() => toggleModal('pageSetup', false)} onApply={(s, v) => { pageLayout.setPageSettings(s); pageLayout.setViewMode(v); toggleModal('pageSetup', false); }} />
       <WordCountModal isOpen={modals.wordCount} onClose={() => toggleModal('wordCount', false)} stats={stats} />
       <CitationModal isOpen={modals.citation} onClose={() => toggleModal('citation', false)} onInsert={ref => setReferences(prev => [...prev, ref])} references={references} />
       <ShareModal isOpen={modals.share} onClose={() => toggleModal('share', false)} fileId={fileId} fileName={fileName} isLocal={isLocalFile} />
       <ColumnsModal isOpen={modals.columns} onClose={() => toggleModal('columns', false)} onApply={handleApplyColumns} />
    </div>
  );
};
