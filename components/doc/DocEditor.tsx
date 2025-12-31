
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useDocEditorConfig } from '../../hooks/useDocEditorConfig';
import { useDocFileHandler } from '../../hooks/useDocFileHandler';
import { usePageLayout } from '../../hooks/usePageLayout';
import { useDocUI } from '../../hooks/useDocUI';
import { EditorContent } from '@tiptap/react';
import { TopMenuBar } from './TopMenuBar';
import { DocToolbar } from './DocToolbar';
import { CommentsSidebar, CommentData } from './CommentsSidebar';
import { OutlineSidebar } from './OutlineSidebar';
import { DocAiSidebar } from '../DocAiSidebar';
import { PageSetupModal } from './modals/PageSetupModal';
import { WordCountModal } from './modals/WordCountModal';
import { CitationModal } from './modals/CitationModal';
import { ShareModal } from './modals/ShareModal';
import { ColumnsModal } from './modals/ColumnsModal';
import { HeaderFooterModal } from './modals/HeaderFooterModal';
import { VersionHistoryModal } from './modals/VersionHistoryModal';
import { ImageOptionsSidebar } from './ImageOptionsSidebar';
import { TableBubbleMenu } from './TableBubbleMenu';
import { ImageBubbleMenu } from './ImageBubbleMenu';
import { AiBubbleMenu } from './AiBubbleMenu';
import { SuggestionBubbleMenu } from './SuggestionBubbleMenu';
import { FootnoteBubbleMenu } from './FootnoteBubbleMenu';
import { FindReplaceBar } from './FindReplaceBar';
import { Ruler } from './Ruler';
import { VerticalRuler } from './VerticalRuler';
import { FootnotesLayer } from './FootnotesLayer';
import { Loader2, ArrowLeft, FileText, Cloud, Sparkles, Users, Share2, Lock } from 'lucide-react';
import { Reference, EditorStats, MIME_TYPES } from '../../types';
import { auth } from '../../firebase';
import { generateDocxBlob } from '../../services/docxService';
import { useSlideNavigation } from '../../hooks/useSlideNavigation';
import { SlideNavigationControls } from './SlideNavigationControls';
import { TablePropertiesModal } from './modals/TablePropertiesModal';
import { CM_TO_PX } from './constants';

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
  const isSlideMode = true; // Always true as requested

  const { nextPage, prevPage } = useSlideNavigation({
    currentPage,
    totalPages: pageLayout.totalPages,
    isSlideMode,
    onPageChange: (newPage) => {
      setCurrentPage(newPage);
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

  const handleRegionClick = (type: 'header' | 'footer', e: React.MouseEvent) => {
      if (e.detail === 2) { // Double click is enough
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

  const handleVersionRestore = useCallback((content: any) => {
      if (editor) {
          editor.commands.setContent(content);
      }
  }, [editor]);

  const handleHeaderFooterApply = (header: string, footer: string) => {
      pageLayout.setPageSettings(prev => ({ ...prev, headerText: header, footerText: footer }));
  };

  if (!editor) return <ViewLoader />;

  // Translate content to simulate slide view
  const effectivePageHeight = pageLayout.currentPaper.heightPx + 20; // Altura + Gap
  const contentTranslateY = -((currentPage - 1) * effectivePageHeight);

  // Render Page Number Helper
  const renderPageNumber = (pageIndex: number) => {
      const config = pageLayout.pageSettings.pageNumber;
      if (!config || !config.enabled) return null;

      // Logic: Show from X page (e.g. start showing on page 2)
      // Logic: Start counting from Y (e.g. page 2 displays "1")
      const physicalPageNum = pageIndex + 1; // 1-based index
      
      if (physicalPageNum < (config.displayFromPage || 1)) return null;

      // Calculate the number to display
      // If startAt is set, we adjust. Usually startAt=1 means the first counted page is "1".
      // offset is how many pages we skipped before starting to count/show
      const offset = (config.displayFromPage || 1) - 1;
      const displayNum = (physicalPageNum - offset) + (config.startAt - 1);

      // Positioning styles
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
          style.top = `${pageLayout.pageSettings.marginTop / 2}cm`; // Center vertically in margin
      } else {
          style.bottom = `${pageLayout.pageSettings.marginBottom / 2}cm`;
      }

      // Horizontal Positioning based on margins
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

  return (
    <div className={`flex flex-col h-full bg-bg relative overflow-hidden text-text ${modes.focus ? 'focus-mode' : ''}`}>
       <div className="bg-surface border-b border-border z-50 shrink-0">
             <div className="flex flex-col md:flex-row md:items-center justify-between px-2 md:px-4 pt-2 md:pt-3 pb-1 gap-2">
                <div className="flex items-start gap-2 md:gap-4 overflow-hidden">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full text-text-sec mt-1 shrink-0"><ArrowLeft size={20} /></button>
                    <div className="pt-2 text-blue-400 shrink-0"><FileText size={24} className="md:w-7 md:h-7" /></div>
                    <div className="flex flex-col min-w-0 flex-1">
                        <input 
                            value={fileHandler.currentName} 
                            onChange={e => fileHandler.setCurrentName(e.target.value)} 
                            onBlur={