
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useDocEditorConfig } from '../hooks/useDocEditorConfig';
import { useDocFileHandler } from '../hooks/useDocFileHandler';
import { usePageLayout } from '../hooks/usePageLayout';
import { useDocUI } from '../hooks/useDocUI';
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
import { FootnotesLayer } from './doc/FootnotesLayer';
import { Loader2, ArrowLeft, FileText, Cloud, CheckCircle, Sparkles, Users, Lock } from 'lucide-react';
import { Reference, EditorStats } from '../types';
import { auth } from '../firebase';

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

  const handleAddComment = useCallback((text: string) => {
    if (!editor) return;
    const id = `comment-${Date.now()}`;
    (editor.chain().focus() as any).setComment(id).run();
    setComments(prev => [...prev, { id, text, author: userInfo.name, createdAt: new Date().toISOString() }]);
    setActiveCommentId(id);
  }, [editor, userInfo.name]);

  // Lógica de Inserção de Imagem
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
    // Limpa o input para permitir selecionar o mesmo arquivo novamente
    e.target.value = '';
  }, [editor]);

  const stats = useMemo<EditorStats>(() => {
     if (!editor) return { words: 0, chars: 0, charsNoSpace: 0, readTime: 0 };
     const words = editor.storage.characterCount.words();
     return { words, chars: editor.storage.characterCount.characters(), charsNoSpace: words, readTime: Math.ceil(words / 200) };
  }, [editor]);

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
                            onShare={() => toggleModal('share', true)} onNew={onToggleMenu} onWordCount={() => toggleModal('wordCount', true)}
                            onDownload={fileHandler.handleDownload} onDownloadLect={fileHandler.handleDownloadLect} onExportPdf={() => window.print()}
                            onInsertImage={triggerImageUpload} onTrash={fileHandler.handleTrash} onPageSetup={() => toggleModal('pageSetup', true)}
                            onPageNumber={() => toggleModal('pageNumber', true)} 
                            onHeader={() => { setActiveHeaderFooterTab('header'); toggleModal('headerFooter', true); }} 
                            onFooter={() => { setActiveHeaderFooterTab('footer'); toggleModal('headerFooter', true); }} 
                            onAddFootnote={() => (editor.chain().focus() as any).setFootnote().run()}
                            onAddCitation={() => toggleModal('citation', true)} onPrint={() => window.print()} onLanguage={() => toggleModal('language', true)}
                            onSpellCheck={() => setSpellCheck(!spellCheck)} onFindReplace={() => toggleModal('findReplace', true)}
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
                    <button onClick={() => toggleModal('share', true)} className="flex items-center gap-2 bg-[#c2e7ff] text-[#0b141a] px-4 py-2 rounded-full font-medium text-sm"><Lock size={16} /><span>Compartilhar</span></button>
                </div>
             </div>
          </div>

       {!modes.focus && <DocToolbar editor={editor} onInsertImage={triggerImageUpload} onAddFootnote={() => (editor.chain().focus() as any).setFootnote().run()} currentPage={1} totalPages={pageLayout.totalPages} onJumpToPage={() => {}} />}
       
       <div className="flex-1 overflow-hidden relative flex bg-black">
          <OutlineSidebar editor={editor} isOpen={sidebars.outline} onClose={() => toggleSidebar('outline', false)} />
          <div ref={docScrollerRef} className="flex-1 overflow-auto flex justify-center custom-scrollbar px-12 pb-12 relative">
             
             {/* Bubble Menus & Floating Controls */}
             <TableBubbleMenu editor={editor} onOpenProperties={() => toggleModal('tableProperties', true)} />
             <ImageBubbleMenu editor={editor} onOpenOptions={() => toggleSidebar('imageOptions', true)} />
             <AiBubbleMenu editor={editor} />
             <SuggestionBubbleMenu editor={editor} />
             <FootnoteBubbleMenu editor={editor} />

             <div className="relative my-8 transition-transform origin-top" style={{ transform: `scale(${pageLayout.zoom})`, width: pageLayout.currentPaper.widthPx }}>
                {/* Page Backgrounds */}
                <div className="absolute inset-0 pointer-events-none z-0">
                    {pageLayout.pages.map((page, i) => (
                        <div key={i} className="bg-white shadow-lg w-full absolute left-0 border border-[#333] flex flex-col justify-between" style={{ top: i * (page.heightPx + 20), height: page.heightPx, backgroundColor: pageLayout.pageSettings.pageColor }}>
                            {/* Header Visualization */}
                            {pageLayout.pageSettings.headerText && (
                                <div className="px-12 py-6 text-sm text-gray-500 text-center whitespace-pre-wrap opacity-60">
                                    {pageLayout.pageSettings.headerText}
                                </div>
                            )}
                            
                            {/* Footer Visualization */}
                            {pageLayout.pageSettings.footerText && (
                                <div className="px-12 py-6 text-sm text-gray-500 text-center whitespace-pre-wrap opacity-60 mt-auto">
                                    {pageLayout.pageSettings.footerText}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                
                {/* Footnotes Visual Layer */}
                <FootnotesLayer 
                    editor={editor} 
                    pageHeight={pageLayout.currentPaper.heightPx} 
                    pageGap={pageLayout.currentPaper.pageGap} 
                    marginBottom={pageLayout.pageSettings.marginBottom}
                    marginLeft={pageLayout.pageSettings.marginLeft}
                    marginRight={pageLayout.pageSettings.marginRight}
                />

                {/* Main Content */}
                <div ref={contentRef} className="relative z-10 min-h-screen" style={{ paddingTop: `${pageLayout.pageSettings.marginTop}cm`, paddingLeft: `${pageLayout.pageSettings.marginLeft}cm`, paddingRight: `${pageLayout.pageSettings.marginRight}cm` }}><EditorContent editor={editor} /></div>
             </div>
          </div>
          
          {/* Sidebars */}
          <DocAiSidebar editor={editor} isOpen={sidebars.aiChat} onClose={() => toggleSidebar('aiChat', false)} documentName={fileHandler.currentName} />
          <CommentsSidebar editor={editor} isOpen={sidebars.comments} onClose={() => toggleSidebar('comments', false)} comments={comments} onAddComment={handleAddComment} onResolveComment={() => {}} onDeleteComment={() => {}} activeCommentId={activeCommentId} setActiveCommentId={setActiveCommentId} />
          <ImageOptionsSidebar editor={editor} isOpen={sidebars.imageOptions} onClose={() => toggleSidebar('imageOptions', false)} />
          <FindReplaceBar editor={editor} isOpen={modals.findReplace} onClose={() => toggleModal('findReplace', false)} />
       </div>

       {/* Modals */}
       <PageSetupModal isOpen={modals.pageSetup} initialSettings={pageLayout.pageSettings} initialViewMode={pageLayout.viewMode} onClose={() => toggleModal('pageSetup', false)} onApply={(s, v) => { pageLayout.setPageSettings(s); pageLayout.setViewMode(v); toggleModal('pageSetup', false); }} />
       <WordCountModal isOpen={modals.wordCount} onClose={() => toggleModal('wordCount', false)} stats={stats} />
       <CitationModal isOpen={modals.citation} onClose={() => toggleModal('citation', false)} onInsert={ref => setReferences(prev => [...prev, ref])} references={references} />
       <ShareModal isOpen={modals.share} onClose={() => toggleModal('share', false)} fileId={fileId} fileName={fileName} isLocal={isLocalFile} />
       <TablePropertiesModal isOpen={modals.tableProperties} onClose={() => toggleModal('tableProperties', false)} editor={editor} />
       
       <HeaderFooterModal 
          isOpen={modals.headerFooter}
          onClose={() => toggleModal('headerFooter', false)}
          activeTab={activeHeaderFooterTab}
          initialHeader={pageLayout.pageSettings.headerText}
          initialFooter={pageLayout.pageSettings.footerText}
          onApply={(header, footer) => {
              pageLayout.setPageSettings({ ...pageLayout.pageSettings, headerText: header, footerText: footer });
          }}
       />
       
       {/* Hidden File Input for Images */}
       <input 
         type="file" 
         ref={fileInputRef} 
         onChange={handleImageUpload} 
         className="hidden" 
         accept="image/png, image/jpeg, image/gif, image/webp" 
       />
    </div>
  );
};
