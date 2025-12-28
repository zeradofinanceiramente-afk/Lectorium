
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
import { ColumnsModal } from './doc/modals/ColumnsModal';
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

  const handleAddComment = useCallback((text: string) => {
    if (!editor) return;
    const id = `comment-${Date.now()}`;
    (editor.chain().focus() as any).setComment(id).run();
    setComments(prev => [...prev, { id, text, author: userInfo.name, createdAt: new Date().toISOString() }]);
    setActiveCommentId(id);
  }, [editor, userInfo.name]);

  const stats = useMemo<EditorStats>(() => {
     if (!editor) return { words: 0, chars: 0, charsNoSpace: 0, readTime: 0 };
     const words = editor.storage.characterCount.words();
     return { words, chars: editor.storage.characterCount.characters(), charsNoSpace: words, readTime: Math.ceil(words / 200) };
  }, [editor]);

  const handleApplyColumns = (count: number) => {
    if (!editor) return;
    if (count === 1) {
        (editor.chain().focus() as any).unsetColumns().run();
    } else {
        (editor.chain().focus() as any).setColumns(count).run();
    }
  };

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
                            onDownload={() => fileHandler.handleDownload(pageLayout.pageSettings, comments, references)} onDownloadLect={() => fileHandler.handleDownloadLect(pageLayout.pageSettings, comments)} onExportPdf={() => window.print()}
                            onInsertImage={() => {}} onTrash={fileHandler.handleTrash} onPageSetup={() => toggleModal('pageSetup', true)}
                            onPageNumber={() => toggleModal('pageNumber', true)} onHeader={() => {}} onFooter={() => {}} onAddFootnote={() => (editor.chain().focus() as any).setFootnote().run()}
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
                    <button onClick={() => toggleModal('share', true)} className="flex items-center gap-2 bg-[#c2e7ff] text-[#0b141a] px-4 py-2 rounded-full font-medium text-sm"><Lock size={16} /><span>Compartilhar</span></button>
                </div>
             </div>
          </div>

       {!modes.focus && <DocToolbar editor={editor} onInsertImage={() => {}} onAddFootnote={() => {}} currentPage={1} totalPages={pageLayout.totalPages} onJumpToPage={() => {}} />}
       
       <div className="flex-1 overflow-hidden relative flex bg-black">
          <OutlineSidebar editor={editor} isOpen={sidebars.outline} onClose={() => toggleSidebar('outline', false)} />
          <div ref={docScrollerRef} className="flex-1 overflow-auto flex justify-center custom-scrollbar px-12 pb-12">
             <div className="relative my-8 transition-transform origin-top" style={{ transform: `scale(${pageLayout.zoom})`, width: pageLayout.currentPaper.widthPx }}>
                <div className="absolute inset-0 pointer-events-none z-0">
                    {pageLayout.pages.map((page, i) => (
                        <div key={i} className="bg-white shadow-lg w-full absolute left-0 border border-[#333]" style={{ top: i * (page.heightPx + 20), height: page.heightPx, backgroundColor: pageLayout.pageSettings.pageColor }} />
                    ))}
                </div>
                <div ref={contentRef} className="relative z-10 min-h-screen" style={{ paddingTop: `${pageLayout.pageSettings.marginTop}cm`, paddingLeft: `${pageLayout.pageSettings.marginLeft}cm`, paddingRight: `${pageLayout.pageSettings.marginRight}cm` }}><EditorContent editor={editor} /></div>
             </div>
          </div>
          <DocAiSidebar editor={editor} isOpen={sidebars.aiChat} onClose={() => toggleSidebar('aiChat', false)} documentName={fileHandler.currentName} />
          <CommentsSidebar editor={editor} isOpen={sidebars.comments} onClose={() => toggleSidebar('comments', false)} comments={comments} onAddComment={handleAddComment} onResolveComment={() => {}} onDeleteComment={() => {}} activeCommentId={activeCommentId} setActiveCommentId={setActiveCommentId} />
       </div>

       <PageSetupModal isOpen={modals.pageSetup} initialSettings={pageLayout.pageSettings} initialViewMode={pageLayout.viewMode} onClose={() => toggleModal('pageSetup', false)} onApply={(s, v) => { pageLayout.setPageSettings(s); pageLayout.setViewMode(v); toggleModal('pageSetup', false); }} />
       <WordCountModal isOpen={modals.wordCount} onClose={() => toggleModal('wordCount', false)} stats={stats} />
       <CitationModal isOpen={modals.citation} onClose={() => toggleModal('citation', false)} onInsert={ref => setReferences(prev => [...prev, ref])} references={references} />
       <ShareModal isOpen={modals.share} onClose={() => toggleModal('share', false)} fileId={fileId} fileName={fileName} isLocal={isLocalFile} />
       <ColumnsModal isOpen={modals.columns} onClose={() => toggleModal('columns', false)} onApply={handleApplyColumns} />
    </div>
  );
};
