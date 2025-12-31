
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useDocEditorConfig } from '../hooks/useDocEditorConfig';
import { useDocFileHandler } from '../hooks/useDocFileHandler';
import { usePageLayout } from '../hooks/usePageLayout';
import { useDocUI } from '../hooks/useDocUI';
import { TopMenuBar } from './doc/TopMenuBar';
import { DocToolbar } from './doc/DocToolbar';
import { DocCanvas } from './doc/layout/DocCanvas';
import { DocModals } from './doc/layout/DocModals';
import { CommentData } from './doc/CommentsSidebar';
import { Loader2, ArrowLeft, FileText, Cloud, Sparkles, Users, Share2, Lock } from 'lucide-react';
import { Reference, EditorStats, MIME_TYPES } from '../types';
import { auth } from '../firebase';
import { generateDocxBlob } from '../services/docxService';
import { useSlideNavigation } from '../hooks/useSlideNavigation';

interface Props {
  fileId: string;
  fileName: string;
  fileBlob?: Blob;
  accessToken: string;
  onToggleMenu: () => void;
  onAuthError?: () => void;
  onBack?: () => void;
  fileParents?: string[];
}

const ViewLoader = () => (
  <div className="flex-1 flex flex-col items-center justify-center bg-bg">
    <Loader2 size={40} className="animate-spin text-brand mb-4" />
    <p className="text-sm text-text-sec">Preparando editor...</p>
  </div>
);

export const DocEditor: React.FC<Props> = ({ 
  fileId, fileName, fileBlob, accessToken, 
  onToggleMenu, onAuthError, onBack, fileParents 
}) => {
  const isLocalFile = fileId.startsWith('local-') || !accessToken;
  const { modals, sidebars, modes, toggleModal, toggleSidebar, toggleMode } = useDocUI();
  
  const [comments, setComments] = useState<CommentData[]>([]);
  const [references, setReferences] = useState<Reference[]>([]);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [activeHeaderFooterTab, setActiveHeaderFooterTab] = useState<'header' | 'footer'>('header');
  const [isSharing, setIsSharing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

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
    editor, fileId, fileName, fileBlob, accessToken, isLocalFile, fileParents, onAuthError, onBack,
    onFitWidth: pageLayout.handleFitWidth, onLoadSettings: pageLayout.setPageSettings,
    onLoadComments: setComments, onLoadReferences: setReferences
  });

  const handleApplyColumns = (count: number) => {
    if (!editor) return;
    if (count === 1) {
        (editor.chain().focus() as any).unsetColumns().run();
    } else {
        (editor.chain().focus() as any).setColumns(count).run();
    }
  };

  // --- SLIDE NAVIGATION (Hooks) ---
  const isSlideMode = true; // Always true

  const { nextPage, prevPage } = useSlideNavigation({
    currentPage,
    totalPages: pageLayout.totalPages,
    isSlideMode,
    onPageChange: (newPage) => {
      setCurrentPage(newPage);
      // Reset scroll is handled inside DocCanvas effect
    }
  });

  // --- AUTO-PAGINATION & REDIRECT LOGIC ---
  useEffect(() => {
    if (!editor || !isSlideMode) return;

    const checkCursorPage = () => {
        if (!editor || editor.isDestroyed || !editor.view) return;

        const { selection, doc } = editor.state;
        const { from } = selection;

        if (from < 0 || from > doc.content.size) return;

        try {
            const pageHeight = pageLayout.currentPaper.heightPx;
            const pageGap = 20;
            const totalUnit = pageHeight + pageGap;

            const domResult = editor.view.domAtPos(from);
            const domNode = domResult.node;
            const element = (domNode instanceof HTMLElement ? domNode : domNode.parentElement) as HTMLElement;
            
            if (element) {
                let offsetTop = element.offsetTop;
                let currentEl = element;
                
                while(currentEl && !currentEl.classList.contains('ProseMirror') && currentEl.parentElement) {
                    currentEl = currentEl.parentElement;
                    offsetTop += currentEl.offsetTop;
                }

                const calculatedPage = Math.floor(offsetTop / totalUnit) + 1;

                if (calculatedPage !== currentPage && calculatedPage >= 1 && calculatedPage <= pageLayout.totalPages) {
                    setCurrentPage(calculatedPage);
                    if (docScrollerRef.current) docScrollerRef.current.scrollTop = 0;
                }
            }
        } catch (e) {
            // Ignore transient errors
        }
    };

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
      if (e.name !== 'AbortError') { alert("Não foi possível compartilhar o arquivo."); }
    } finally {
      setIsSharing(false);
    }
  }, [editor, fileHandler.currentName, pageLayout.pageSettings, comments, references]);

  const handleVersionRestore = useCallback((content: any) => {
      if (editor) {
          editor.commands.setContent(content);
      }
  }, [editor]);

  const handleHeaderFooterApply = (header: string, footer: string) => {
      pageLayout.setPageSettings(prev => ({ ...prev, headerText: header, footerText: footer }));
  };

  const insertFootnote = (content: string) => {
      if (editor) {
          (editor.chain().focus() as any).setFootnote({ content }).run();
      }
  };

  // Event listener for double click on header/footer regions
  useEffect(() => {
      const handleRegionEdit = (e: Event) => {
          const detail = (e as CustomEvent).detail;
          if (detail && detail.type) {
              setActiveHeaderFooterTab(detail.type);
              toggleModal('headerFooter', true);
          }
      };
      window.addEventListener('edit-region', handleRegionEdit);
      return () => window.removeEventListener('edit-region', handleRegionEdit);
  }, []);

  if (!editor) return <ViewLoader />;

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
                            onDownload={() => fileHandler.handleDownload(pageLayout.pageSettings, comments, references)} onDownloadLect={() => fileHandler.handleDownloadLect(pageLayout.pageSettings, comments)} onExportPdf={() => window.print()}
                            onInsertImage={triggerImageUpload} onTrash={fileHandler.handleTrash} onPageSetup={() => toggleModal('pageSetup', true)}
                            onPageNumber={() => toggleModal('pageNumber', true)} 
                            currentPage={currentPage}
                            onHeader={() => { setActiveHeaderFooterTab('header'); toggleModal('headerFooter', true); }} 
                            onFooter={() => { setActiveHeaderFooterTab('footer'); toggleModal('headerFooter', true); }} 
                            onAddFootnote={() => toggleModal('footnote', true)}
                            onAddCitation={() => toggleModal('citation', true)} onPrint={() => window.print()} onLanguage={() => toggleModal('language', true)}
                            onSpellCheck={() => setSpellCheck(!spellCheck)} onFindReplace={() => toggleModal('findReplace', true)}
                            onColumns={() => toggleModal('columns', true)}
                            showRuler={pageLayout.showRuler} setShowRuler={pageLayout.setShowRuler} zoom={pageLayout.zoom} setZoom={pageLayout.setZoom}
                            onFitWidth={pageLayout.handleFitWidth} viewMode={pageLayout.viewMode} setViewMode={pageLayout.setViewMode}
                            focusMode={modes.focus} setFocusMode={v => toggleMode('focus', v)} showComments={sidebars.comments} setShowComments={v => toggleSidebar('comments', v)}
                            suggestionMode={modes.suggestion} toggleSuggestionMode={() => toggleMode('suggestion')} toggleOutline={() => toggleSidebar('outline')} isOutlineOpen={sidebars.outline}
                            toggleDictation={() => toggleMode('dictation')} isDictationActive={modes.dictation} onExportHtml={() => {}}
                        />
                    </div>
                </div>
                <div className="flex items-center gap-4 mt-2">
                    <div className="text-text-sec">{fileHandler.isSaving ? <Loader2 size={20} className="animate-spin" /> : <Cloud size={20} />}</div>
                    <button onClick={() => toggleSidebar('aiChat')} className={`p-2 rounded-full ${sidebars.aiChat ? 'bg-brand/20 text-brand' : 'text-text-sec'}`}><Sparkles size={20} /></button>
                    <button onClick={() => toggleSidebar('comments')} className={`p-2 rounded-full ${sidebars.comments ? 'bg-brand/20 text-brand' : 'text-text-sec'}`}><Users size={20} /></button>
                    <button onClick={() => toggleModal('share', true)} className="flex items-center gap-2 bg-[#c2e7ff] text-[#0b141a] px-4 py-2 rounded-full font-medium text-sm hover:brightness-110 transition-all disabled:opacity-50">
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
               onAddFootnote={() => toggleModal('footnote', true)} 
               currentPage={currentPage} 
               totalPages={pageLayout.totalPages} 
               onJumpToPage={handleJumpToPage} 
           />
       )}
       
       <DocCanvas 
          editor={editor}
          fileHandler={fileHandler}
          pageLayout={pageLayout}
          modes={modes}
          modals={modals}
          sidebars={sidebars}
          toggleModal={toggleModal}
          toggleSidebar={toggleSidebar}
          currentPage={currentPage}
          docScrollerRef={docScrollerRef}
          contentRef={contentRef}
          nextPage={nextPage}
          prevPage={prevPage}
          handleJumpToPage={handleJumpToPage}
          comments={comments}
          handleAddComment={handleAddComment}
          onResolveComment={() => {}}
          onDeleteComment={() => {}}
          activeCommentId={activeCommentId}
          setActiveCommentId={setActiveCommentId}
          userInfo={userInfo}
       />

       <DocModals 
          modals={modals}
          toggleModal={toggleModal}
          editor={editor}
          pageLayout={pageLayout}
          stats={stats}
          references={references}
          setReferences={setReferences}
          fileId={fileId}
          fileName={fileName}
          isLocalFile={isLocalFile}
          activeHeaderFooterTab={activeHeaderFooterTab}
          handleHeaderFooterApply={handleHeaderFooterApply}
          handleVersionRestore={handleVersionRestore}
          insertFootnote={insertFootnote}
          handleApplyColumns={handleApplyColumns}
          spellCheck={spellCheck}
          setSpellCheck={setSpellCheck}
       />
       
       <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
    </div>
  );
};
