
import React, { useRef, useEffect, useMemo, useCallback, useReducer } from 'react';
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
import { Ruler } from './doc/Ruler';
import { VerticalRuler } from './doc/VerticalRuler';
import { Loader2, ArrowLeft, FileText, Cloud, Sparkles, Users, Lock } from 'lucide-react';
import { Reference, EditorStats } from '../types';
import { auth } from '../firebase';

// --- Reducer Types & Logic ---
interface DocState {
  comments: CommentData[];
  references: Reference[];
  activeCommentId: string | null;
  activeHeaderFooterTab: 'header' | 'footer';
}

type DocAction = 
  | { type: 'SET_COMMENTS'; payload: CommentData[] }
  | { type: 'ADD_COMMENT'; payload: CommentData }
  | { type: 'SET_ACTIVE_COMMENT'; payload: string | null }
  | { type: 'SET_REFERENCES'; payload: Reference[] }
  | { type: 'ADD_REFERENCE'; payload: Reference }
  | { type: 'SET_HEADER_FOOTER_TAB'; payload: 'header' | 'footer' };

const initialState: DocState = {
  comments: [],
  references: [],
  activeCommentId: null,
  activeHeaderFooterTab: 'header'
};

function docReducer(state: DocState, action: DocAction): DocState {
  switch (action.type) {
    case 'SET_COMMENTS':
      return { ...state, comments: action.payload };
    case 'ADD_COMMENT':
      return { 
        ...state, 
        comments: [...state.comments, action.payload],
        activeCommentId: action.payload.id 
      };
    case 'SET_ACTIVE_COMMENT':
      return { ...state, activeCommentId: action.payload };
    case 'SET_REFERENCES':
      return { ...state, references: action.payload };
    case 'ADD_REFERENCE':
      return { ...state, references: [...state.references, action.payload] };
    case 'SET_HEADER_FOOTER_TAB':
      return { ...state, activeHeaderFooterTab: action.payload };
    default:
      return state;
  }
}

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
  
  // UI Hooks
  const { modals, sidebars, modes, toggleModal, toggleSidebar, toggleMode } = useDocUI();
  
  // State Management via Reducer (Performance Optimization)
  const [state, dispatch] = useReducer(docReducer, initialState);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const docScrollerRef = useRef<HTMLDivElement>(null);

  const userInfo = useMemo(() => {
    const u = auth.currentUser;
    return { name: u?.displayName || 'Visitante', color: '#4ade80' };
  }, []);

  const { editor, spellCheck, setSpellCheck } = useDocEditorConfig({ fileId, userInfo });

  const pageLayout = usePageLayout({
    editor,
    initialSettings: { paperSize: 'a4', orientation: 'portrait', pageColor: '#ffffff', marginTop: 3, marginBottom: 2, marginLeft: 3, marginRight: 2 },
    contentRef
  });

  // Callbacks estáveis para o FileHandler
  const handleLoadComments = useCallback((comments: CommentData[]) => dispatch({ type: 'SET_COMMENTS', payload: comments }), []);
  const handleLoadReferences = useCallback((refs: Reference[]) => dispatch({ type: 'SET_REFERENCES', payload: refs }), []);

  const fileHandler = useDocFileHandler({
    editor, fileId, fileName, fileBlob, accessToken, isLocalFile, onAuthError, onBack,
    onFitWidth: pageLayout.handleFitWidth, 
    onLoadSettings: pageLayout.setPageSettings,
    onLoadComments: handleLoadComments, 
    onLoadReferences: handleLoadReferences
  });

  const handleAddComment = useCallback((text: string) => {
    if (!editor) return;
    const id = `comment-${Date.now()}`;
    (editor.chain().focus() as any).setComment(id).run();
    
    dispatch({ 
      type: 'ADD_COMMENT', 
      payload: { id, text, author: userInfo.name, createdAt: new Date().toISOString() } 
    });
  }, [editor, userInfo.name]);

  const handleInsertImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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

  const triggerImageUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const stats = useMemo<EditorStats>(() => {
     if (!editor) return { words: 0, chars: 0, charsNoSpace: 0, readTime: 0 };
     const words = editor.storage.characterCount.words();
     return { words, chars: editor.storage.characterCount.characters(), charsNoSpace: words, readTime: Math.ceil(words / 200) };
  }, [editor?.storage.characterCount.words()]); // Dependência explícita para evitar re-calc

  const handleRegionClick = useCallback((type: 'header' | 'footer', e: React.MouseEvent) => {
      if (e.detail === 3) {
          e.preventDefault();
          e.stopPropagation();
          dispatch({ type: 'SET_HEADER_FOOTER_TAB', payload: type });
          toggleModal('headerFooter', true);
      }
  }, [toggleModal]);

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
                            editor={editor} fileName={fileHandler.currentName} onSave={() => fileHandler.handleSave(pageLayout.pageSettings, state.comments, state.references)}
                            onShare={() => toggleModal('share', true)} onNew={onToggleMenu} onWordCount={() => toggleModal('wordCount', true)}
                            onDownload={fileHandler.handleDownload} onDownloadLect={fileHandler.handleDownloadLect} onExportPdf={() => window.print()}
                            onInsertImage={triggerImageUpload} onTrash={fileHandler.handleTrash} onPageSetup={() => toggleModal('pageSetup', true)}
                            onPageNumber={() => toggleModal('pageNumber', true)} 
                            onHeader={() => { dispatch({ type: 'SET_HEADER_FOOTER_TAB', payload: 'header' }); toggleModal('headerFooter', true); }} 
                            onFooter={() => { dispatch({ type: 'SET_HEADER_FOOTER_TAB', payload: 'footer' }); toggleModal('headerFooter', true); }} 
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

                {/* Page Backgrounds & Vertical Rulers */}
                <div className="absolute inset-0 pointer-events-none z-0">
                    {pageLayout.pages.map((page, i) => (
                        <div key={i} className="absolute left-0 w-full chromium-virtual-render" style={{ top: i * (page.heightPx + 20), height: page.heightPx }}>
                            
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

                            <div className="bg-white shadow-lg w-full h-full border border-[#333] flex flex-col justify-between relative" style={{ backgroundColor: pageLayout.pageSettings.pageColor }}>
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
                <div ref={contentRef} className="relative z-10 min-h-screen gpu-layer" style={{ paddingTop: `${pageLayout.pageSettings.marginTop}cm`, paddingLeft: `${pageLayout.pageSettings.marginLeft}cm`, paddingRight: `${pageLayout.pageSettings.marginRight}cm` }}><EditorContent editor={editor} /></div>
             </div>
          </div>
          
          {/* Sidebars */}
          <DocAiSidebar editor={editor} isOpen={sidebars.aiChat} onClose={() => toggleSidebar('aiChat', false)} documentName={fileHandler.currentName} />
          <CommentsSidebar editor={editor} isOpen={sidebars.comments} onClose={() => toggleSidebar('comments', false)} comments={state.comments} onAddComment={handleAddComment} onResolveComment={() => {}} onDeleteComment={() => {}} activeCommentId={state.activeCommentId} setActiveCommentId={(id) => dispatch({ type: 'SET_ACTIVE_COMMENT', payload: id })} />
          <ImageOptionsSidebar editor={editor} isOpen={sidebars.imageOptions} onClose={() => toggleSidebar('imageOptions', false)} />
          <FindReplaceBar editor={editor} isOpen={modals.findReplace} onClose={() => toggleModal('findReplace', false)} />
       </div>

       {/* Modals */}
       <PageSetupModal isOpen={modals.pageSetup} initialSettings={pageLayout.pageSettings} initialViewMode={pageLayout.viewMode} onClose={() => toggleModal('pageSetup', false)} onApply={(s, v) => { pageLayout.setPageSettings(s); pageLayout.setViewMode(v); toggleModal('pageSetup', false); }} />
       <WordCountModal isOpen={modals.wordCount} onClose={() => toggleModal('wordCount', false)} stats={stats} />
       <CitationModal isOpen={modals.citation} onClose={() => toggleModal('citation', false)} onInsert={ref => dispatch({ type: 'ADD_REFERENCE', payload: ref })} references={state.references} />
       <ShareModal isOpen={modals.share} onClose={() => toggleModal('share', false)} fileId={fileId} fileName={fileName} isLocal={isLocalFile} />
       <TablePropertiesModal isOpen={modals.tableProperties} onClose={() => toggleModal('tableProperties', false)} editor={editor} />
       
       <HeaderFooterModal 
          isOpen={modals.headerFooter}
          onClose={() => toggleModal('headerFooter', false)}
          activeTab={state.activeHeaderFooterTab}
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
         onChange={handleInsertImage} 
         className="hidden" 
         accept="image/png, image/jpeg, image/gif, image/webp" 
       />
    </div>
  );
};
