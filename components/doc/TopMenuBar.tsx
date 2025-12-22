
import React, { useState, useRef, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { 
  FileText, Printer, 
  Undo, Redo, Scissors, Copy, Clipboard, Trash2, Search,
  Ruler, Maximize, ZoomIn, Check,
  Image as ImageIcon, Table, Workflow,
  Superscript, Subscript, Baseline, Highlighter, ArrowUpFromLine,
  Type, Minus, Sigma, QrCode, Link, PenTool,
  Bold, Italic, Underline, Strikethrough, Code, Eraser, 
  AlignLeft, AlignCenter, AlignRight, AlignJustify, 
  List, ListOrdered, CheckSquare, 
  ChevronRight, FilePlus, FolderOpen, Share2, Mail, Download, Edit2, FolderInput, WifiOff, Info, Globe, Settings,
  ArrowLeft, Indent, Outdent, MoveVertical, Languages, SpellCheck, Target,
  PanelTop, PanelBottom, Hash, Stamp, MessageSquareQuote, LayoutTemplate, Keyboard, MessageSquarePlus, SplitSquareHorizontal, Book,
  Calculator, Braces, Terminal, Columns, FileCode, History, Mic, BarChart3, ListTree, Package, Palette, RotateCcw, Save, FunctionSquare,
  Settings2
} from 'lucide-react';
import { HelpModal } from './modals/HelpModal';
import { SymbolModal } from './modals/SymbolModal';
import { VersionHistoryModal } from './modals/VersionHistoryModal';
import { StyleConfigModal, StyleConfig } from './modals/StyleConfigModal';

interface Props {
  editor: Editor | null;
  fileName: string;
  onSave: () => void;
  onShare: () => void;
  onNew: () => void;
  onRename: () => void;
  onWordCount: () => void;
  onDownload: () => void;
  onDownloadLect?: () => void; 
  onExportPdf: () => void;
  onExportHtml: () => void;
  onInsertImage: () => void;
  onTrash: () => void;
  onPageSetup: () => void;
  onPageNumber: () => void;
  onHeader: () => void; 
  onFooter: () => void; 
  onAddFootnote: () => void;
  onAddCitation?: () => void;
  onInsertBibliography?: () => void;
  onPrint: () => void;
  onLanguage: () => void;
  onSpellCheck: () => void;
  onFindReplace: () => void;
  showRuler: boolean;
  setShowRuler: (s: boolean) => void;
  zoom: number;
  setZoom: (z: number) => void;
  onFitWidth: () => void;
  viewMode: 'paged' | 'continuous';
  setViewMode: (v: 'paged' | 'continuous') => void;
  showComments?: boolean;
  setShowComments?: (v: boolean) => void;
  
  // New features
  suggestionMode: boolean;
  toggleSuggestionMode: () => void;
  toggleOutline: () => void;
  isOutlineOpen: boolean;
  toggleDictation: () => void;
  isDictationActive: boolean;
}

// Configuração Inicial Padrão (Factory)
const getInitialStyles = (): StyleConfig[] => [
  {
    id: 'normal',
    label: 'Normal (ABNT)',
    type: 'paragraph',
    fontFamily: 'Times New Roman',
    fontSize: 12,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textTransform: 'none',
    textAlign: 'justify',
    marginTop: 0,
    marginBottom: 0,
    lineHeight: 1.5,
    textIndent: '1.25cm'
  },
  {
    id: 'heading1',
    label: '1. TÍTULO 1 (PRIMÁRIO)',
    type: 'heading',
    level: 1,
    fontFamily: 'Times New Roman',
    fontSize: 12,
    fontWeight: 'bold',
    fontStyle: 'normal',
    textTransform: 'uppercase',
    textAlign: 'left',
    marginTop: 12,
    marginBottom: 12,
    lineHeight: 1.5,
    textIndent: '0px'
  },
  {
    id: 'heading2',
    label: '1.1 TÍTULO 2 (SECUNDÁRIO)',
    type: 'heading',
    level: 2,
    fontFamily: 'Times New Roman',
    fontSize: 12,
    fontWeight: 'bold', // Alterado para bold por convenção comum, embora NBR varie
    fontStyle: 'normal',
    textTransform: 'uppercase',
    textAlign: 'left',
    marginTop: 12,
    marginBottom: 12,
    lineHeight: 1.5,
    textIndent: '0px'
  },
  {
    id: 'heading3',
    label: '1.1.1 Título 3 (Terciário)',
    type: 'heading',
    level: 3,
    fontFamily: 'Times New Roman',
    fontSize: 12,
    fontWeight: 'bold',
    fontStyle: 'normal',
    textTransform: 'none',
    textAlign: 'left',
    marginTop: 12,
    marginBottom: 6,
    lineHeight: 1.5,
    textIndent: '0px'
  },
  {
    id: 'quote',
    label: 'Citação Longa (>3 linhas)',
    type: 'paragraph',
    fontFamily: 'Times New Roman',
    fontSize: 10,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textTransform: 'none',
    textAlign: 'justify',
    marginTop: 12,
    marginBottom: 12,
    lineHeight: 1.0,
    textIndent: '0cm',
    marginLeft: '4cm'
  }
];

const MenuButton = ({ label, isActive, onClick, onMouseEnter }: { label: string, isActive: boolean, onClick: () => void, onMouseEnter: () => void }) => (
  <button
    onClick={onClick}
    onMouseEnter={onMouseEnter}
    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors cursor-default select-none ${
      isActive 
        ? 'bg-[#444746] text-[#e3e3e3]' 
        : 'text-[#e3e3e3] hover:bg-[#303033]'
    }`}
  >
    {label}
  </button>
);

const MenuDropdown: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className = "" }) => (
  <div className={`absolute top-full left-0 mt-1 bg-[#1e1e1e] border border-[#444746] rounded-lg shadow-xl py-1.5 min-w-[280px] z-50 flex flex-col text-[#e3e3e3] animate-in fade-in zoom-in-95 duration-100 origin-top-left ${className}`}>
    {children}
  </div>
);

const MenuDivider = () => <div className="h-px bg-[#444746] my-1.5 mx-0" />;

interface MenuItemProps {
  icon?: React.ElementType;
  label: string;
  onClick?: (e: React.MouseEvent) => void;
  shortcut?: string;
  hasSubmenu?: boolean;
  isActive?: boolean;
  isDanger?: boolean;
  className?: string;
  rightElement?: React.ReactNode;
}

const MenuItem: React.FC<MenuItemProps> = ({ icon: Icon, label, onClick, shortcut, hasSubmenu, isActive, isDanger, className = '', rightElement }) => (
  <button 
    onClick={(e) => {
      e.stopPropagation();
      onClick?.(e);
    }}
    className={`w-full text-left px-4 py-1.5 text-sm flex items-center gap-3 hover:bg-[#303033] transition-colors relative group
      ${isActive ? 'bg-[#303033]' : ''} 
      ${isDanger ? 'text-red-400 hover:text-red-300' : 'text-[#e3e3e3]'}
      ${className}
    `}
  >
    <div className={`w-5 flex items-center justify-center shrink-0 ${isDanger ? 'text-red-400' : isActive ? 'text-brand' : 'text-[#c4c7c5] group-hover:text-[#e3e3e3]'}`}>
       {Icon && <Icon size={18} />}
       {!Icon && isActive && <Check size={16} />}
    </div>
    
    <span className="flex-1 truncate">{label}</span>
    
    {shortcut && <span className="text-xs text-[#8e918f] ml-4 font-mono">{shortcut}</span>}
    {hasSubmenu && <ChevronRight size={14} className="text-[#8e918f]" />}
    {rightElement}
  </button>
);

const MenuSubHeader = ({ label, onBack }: { label: string, onBack: () => void }) => (
  <div className="flex flex-col">
    <button 
      onClick={(e) => { e.stopPropagation(); onBack(); }}
      className="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-[#303033] transition-colors text-[#e3e3e3] font-medium border-b border-[#444746] mb-1"
    >
        <ArrowLeft size={16} className="text-[#c4c7c5]" />
        {label}
    </button>
  </div>
);

export const TopMenuBar: React.FC<Props> = (props) => {
  const { editor } = props;
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [activeSubMenu, setActiveSubMenu] = useState<string | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showSymbolModal, setShowSymbolModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Dynamic Styles State
  const [customStyles, setCustomStyles] = useState<StyleConfig[]>(getInitialStyles());
  const [editingStyle, setEditingStyle] = useState<StyleConfig | null>(null);
  const [showStyleConfig, setShowStyleConfig] = useState(false);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const closeMenu = () => {
    setActiveMenu(null);
    setActiveSubMenu(null);
  };

  const toggleMenu = (name: string) => {
    if (activeMenu === name) closeMenu();
    else {
      setActiveMenu(name);
      setActiveSubMenu(null);
    }
  };

  const handleMouseEnter = (name: string) => {
    if (activeMenu) {
      setActiveMenu(name);
      setActiveSubMenu(null);
    }
  };

  const exec = (action?: () => void) => {
    if (action && typeof action === 'function') {
        action();
    } else {
        console.warn("Ação de menu não implementada ou indisponível.");
    }
    closeMenu();
  };

  // --- STYLE APPLICATION LOGIC ---
  const applyStyle = (style: StyleConfig) => {
    if (!editor) return;
    
    // Create generic attributes object
    const attrs: any = {
      textIndent: style.textIndent,
      marginTop: `${style.marginTop}pt`,
      marginBottom: `${style.marginBottom}pt`,
      marginLeft: style.marginLeft || '0pt',
      textAlign: style.textAlign,
      // For Heading extension override logic if needed
    };

    const chain = editor.chain().focus();

    if (style.type === 'heading') {
        chain.toggleHeading({ level: style.level as any }).updateAttributes('heading', attrs);
    } else {
        chain.setParagraph().updateAttributes('paragraph', attrs);
    }

    // Apply text styling marks
    chain
      .setFontFamily(style.fontFamily)
      .setFontSize(`${style.fontSize}pt`)
      .setLineHeight(style.lineHeight.toString())
      .setColor('#000000'); // Force black for ABNT

    if (style.fontWeight === 'bold') chain.setBold(); else chain.unsetBold();
    if (style.fontStyle === 'italic') chain.setItalic(); else chain.unsetItalic();
    
    // We don't have a direct 'text-transform' extension in starter-kit, usually handled via specific node attributes or custom marks.
    // For now we assume the HeadingExtended handles text-transform via CSS class or we skip visual transform in editor.
    
    chain.run();
    closeMenu();
  };

  const handleUpdateStyleConfig = (newConfig: StyleConfig) => {
    setCustomStyles(prev => prev.map(s => s.id === newConfig.id ? newConfig : s));
  };

  const handleMarkdownImport = async () => {
      try {
          const text = await navigator.clipboard.readText();
          if (confirm("Importar conteúdo da área de transferência como Markdown?")) {
              editor?.chain().focus().insertContent(text).run(); 
          }
      } catch {
          alert("Não foi possível ler a área de transferência.");
      }
      closeMenu();
  };

  if (!editor) return null;

  // Renderers
  const renderFileMenu = () => (
    <MenuDropdown>
      {!activeSubMenu ? (
        <>
          <MenuItem icon={FilePlus} label="Novo" onClick={props.onNew} />
          <MenuItem icon={FolderOpen} label="Abrir" onClick={() => window.location.href = '/?mode=browser'} shortcut="Ctrl+O" />
          <MenuItem icon={FileText} label="Salvar" onClick={() => exec(props.onSave)} shortcut="Ctrl+S" />
          <MenuItem icon={FileText} label="Fazer uma cópia" onClick={() => exec(props.onSave)} />
          <MenuDivider />
          <MenuItem icon={Share2} label="Compartilhar" onClick={() => exec(props.onShare)} />
          <MenuItem icon={Mail} label="Enviar por e-mail" onClick={() => exec(() => window.location.href = `mailto:?subject=${encodeURIComponent(props.fileName)}`)} />
          
          <MenuItem icon={Download} label="Fazer download" hasSubmenu onClick={() => setActiveSubMenu('Download')} />
          
          <MenuDivider />
          <MenuItem icon={History} label="Histórico de versões" onClick={() => exec(() => setShowHistoryModal(true))} />
          <MenuDivider />
          <MenuItem icon={Edit2} label="Renomear" onClick={() => exec(props.onRename)} />
          <MenuItem icon={FolderInput} label="Mover" onClick={() => exec(() => alert("Funcionalidade disponível apenas na visualização de pastas."))} />
          <MenuItem icon={Trash2} label="Mover para lixeira" onClick={() => exec(props.onTrash)} isDanger />
          <MenuDivider />
          <MenuItem icon={WifiOff} label="Tornar disponível off-line" onClick={() => exec(props.onSave)} />
          <MenuDivider />
          <MenuItem icon={Globe} label="Idioma" onClick={() => exec(props.onLanguage)} />
          <MenuItem icon={Settings} label="Configuração da página" onClick={() => exec(props.onPageSetup)} />
          <MenuItem icon={Printer} label="Imprimir / Canvas Mode" onClick={() => exec(props.onPrint)} shortcut="Ctrl+P" />
        </>
      ) : activeSubMenu === 'Download' ? (
        <>
          <MenuSubHeader label="Fazer download" onBack={() => setActiveSubMenu(null)} />
          <MenuItem icon={FileText} label="Microsoft Word (.docx)" onClick={() => exec(props.onDownload)} />
          <MenuItem icon={FileText} label="Documento PDF (.pdf)" onClick={() => exec(props.onExportPdf)} />
          <MenuDivider />
          <MenuItem icon={Package} label="Arquivo Lectorium (.lect)" onClick={() => exec(props.onDownloadLect)} />
        </>
      ) : null}
    </MenuDropdown>
  );

  const renderEditMenu = () => (
    <MenuDropdown>
      <MenuItem icon={Undo} label="Desfazer" onClick={() => exec(() => editor.chain().focus().undo().run())} shortcut="Ctrl+Z" />
      <MenuItem icon={Redo} label="Refazer" onClick={() => exec(() => editor.chain().focus().redo().run())} shortcut="Ctrl+Y" />
      <MenuDivider />
      <MenuItem icon={Scissors} label="Recortar" onClick={() => exec(() => { navigator.clipboard.writeText(window.getSelection()?.toString() || ''); editor.chain().focus().deleteSelection().run(); })} shortcut="Ctrl+X" />
      <MenuItem icon={Copy} label="Copiar" onClick={() => exec(() => navigator.clipboard.writeText(window.getSelection()?.toString() || ''))} shortcut="Ctrl+C" />
      <MenuItem icon={Clipboard} label="Colar" onClick={() => exec(async () => { try { const t = await navigator.clipboard.readText(); editor.chain().focus().insertContent(t).run(); } catch { alert("Use Ctrl+V"); } })} shortcut="Ctrl+V" />
      <MenuItem icon={Clipboard} label="Colar sem formatação" onClick={() => exec(async () => { try { const t = await navigator.clipboard.readText(); editor.chain().focus().insertContent(t).run(); } catch { alert("Use Ctrl+Shift+V"); } })} shortcut="Ctrl+Shift+V" />
      <MenuDivider />
      <MenuItem icon={CheckSquare} label="Selecionar tudo" onClick={() => exec(() => editor.chain().focus().selectAll().run())} shortcut="Ctrl+A" />
      <MenuItem icon={Trash2} label="Excluir" onClick={() => exec(() => editor.chain().focus().deleteSelection().run())} isDanger />
      <MenuDivider />
      <MenuItem icon={Search} label="Localizar e substituir" onClick={() => exec(props.onFindReplace)} shortcut="Ctrl+H" />
    </MenuDropdown>
  );

  const renderViewMenu = () => (
    <MenuDropdown>
      {!activeSubMenu ? (
        <>
          <MenuItem icon={FileText} label={`Modo: ${editor.isEditable ? 'Edição' : 'Visualização'}`} onClick={() => exec(() => editor.setEditable(!editor.isEditable))} />
          <MenuItem icon={MessageSquarePlus} label="Comentários" onClick={() => exec(() => props.setShowComments && props.setShowComments(!props.showComments))} isActive={props.showComments} />
          <MenuItem icon={ListTree} label="Estrutura (Outline)" onClick={() => exec(props.toggleOutline)} isActive={props.isOutlineOpen} />
          <MenuDivider />
          <MenuItem icon={ZoomIn} label="Zoom" hasSubmenu onClick={() => setActiveSubMenu('Zoom')} />
          <MenuItem icon={Printer} label="Layout de impressão" onClick={() => exec(() => props.setViewMode(props.viewMode === 'paged' ? 'continuous' : 'paged'))} isActive={props.viewMode === 'paged'} />
          <MenuItem icon={Ruler} label="Exibir régua" onClick={() => exec(() => props.setShowRuler(!props.showRuler))} isActive={props.showRuler} />
          <MenuDivider />
          <MenuItem icon={Maximize} label="Tela inteira" onClick={() => exec(() => { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); })} />
        </>
      ) : activeSubMenu === 'Zoom' ? (
        <>
          <MenuSubHeader label="Zoom" onBack={() => setActiveSubMenu(null)} />
          <MenuItem icon={Maximize} label="Ajustar à largura" onClick={() => exec(props.onFitWidth)} />
          <MenuDivider />
          {[50, 75, 100, 125, 150, 200].map(z => (
            <MenuItem 
              key={z} 
              label={`${z}%`} 
              onClick={() => exec(() => props.setZoom(z / 100))} 
              isActive={Math.round(props.zoom * 100) === z} 
            />
          ))}
        </>
      ) : null}
    </MenuDropdown>
  );

  const renderInsertMenu = () => (
    <MenuDropdown>
      {!activeSubMenu ? (
        <>
          <MenuItem icon={ImageIcon} label="Imagem" onClick={() => exec(props.onInsertImage)} />
          <MenuItem icon={Table} label="Tabela" onClick={() => exec(() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())} />
          <MenuItem icon={BarChart3} label="Gráfico" onClick={() => exec(() => (editor.chain().focus() as any).insertChart().run())} />
          <MenuItem icon={Link} label="Link" onClick={() => exec(() => { const url = window.prompt('URL'); if (url) editor.chain().focus().setLink({ href: url }).run(); })} shortcut="Ctrl+K" />
          
          <MenuDivider />
          <MenuItem icon={MessageSquarePlus} label="Comentário" onClick={() => exec(() => { if (props.setShowComments) props.setShowComments(true); })} shortcut="Ctrl+Alt+M" />
          
          <MenuDivider />
          <MenuItem 
            icon={LayoutTemplate} 
            label="Elementos de página" 
            hasSubmenu 
            onClick={() => setActiveSubMenu('PageElements')} 
            className="bg-brand/5 text-brand"
          />

          <MenuDivider />
          <MenuItem icon={Columns} label="Colunas (2)" onClick={() => exec(() => (editor.chain().focus() as any).setColumns(2).run())} />
          <MenuItem icon={SplitSquareHorizontal} label="Quebra de Seção (Próx. Pág.)" onClick={() => exec(() => (editor.chain().focus() as any).setSectionBreak({ orientation: 'landscape' }).run())} className="text-orange-400" />
          <MenuItem icon={MoveVertical} label="Quebra de página" onClick={() => exec(() => (editor.chain().focus() as any).setPageBreak().run())} />
          <MenuItem icon={Minus} label="Linha horizontal" onClick={() => exec(() => editor.chain().focus().setHorizontalRule().run())} />
          
          <MenuDivider />
          <MenuItem icon={QrCode} label="QR Code" onClick={() => exec(() => editor.chain().focus().insertContent({ type: 'qrCodeNode', attrs: { value: 'https://' } }).run())} />
        </>
      ) : activeSubMenu === 'PageElements' ? (
        <>
          <MenuSubHeader label="Elementos de página" onBack={() => setActiveSubMenu(null)} />
          
          <MenuItem 
            icon={List} 
            label="Sumário (Table of Contents)" 
            onClick={() => exec(() => {
               (editor.chain().focus() as any).insertTableOfContents().run();
            })} 
          />
          
          <MenuDivider />
          
          <MenuItem 
            icon={PanelTop} 
            label="Cabeçalho" 
            shortcut="Ctrl+Alt+H" 
            onClick={() => exec(props.onHeader)} 
          />
          <MenuItem 
            icon={PanelBottom} 
            label="Rodapé" 
            shortcut="Ctrl+Alt+F" 
            onClick={() => exec(props.onFooter)} 
          />
          
          <MenuDivider />
          
          <MenuItem 
            icon={Hash} 
            label="Números de página" 
            onClick={() => exec(props.onPageNumber)} 
          />
          
          <MenuDivider />
          
          <MenuItem 
            icon={MessageSquareQuote} 
            label="Nota de rodapé (ABNT)" 
            shortcut="Ctrl+Alt+F" 
            onClick={() => exec(props.onAddFootnote)} 
          />

          <MenuItem 
            icon={Book} 
            label="Citação / Referência" 
            onClick={() => exec(props.onAddCitation || (() => {}))} 
            className="text-brand font-medium"
          />

          <MenuItem 
            icon={List} 
            label="Bibliografia (ABNT)" 
            onClick={() => exec(props.onInsertBibliography || (() => {}))} 
          />
        </>
      ) : null}
    </MenuDropdown>
  );

  const renderStylesMenu = () => (
    <MenuDropdown className="min-w-[340px]">
      <div className="px-4 py-2 text-xs font-bold text-brand uppercase tracking-wider border-b border-[#444746] mb-1">
        Estilos ABNT (Padrão Oficial)
      </div>
      {customStyles.map((style) => (
        <div 
          key={style.id} 
          className="relative group hover:bg-[#303033] transition-colors flex items-center"
        >
             <button 
                onClick={() => applyStyle(style)}
                className="flex-1 text-left px-4 py-2.5 truncate"
             >
                {/* Visual Preview */}
                <span 
                  style={{ 
                    fontFamily: style.fontFamily, 
                    fontSize: `${Math.min(style.fontSize, 16)}px`, // Cap visual size for menu
                    fontWeight: style.fontWeight,
                    fontStyle: style.fontStyle,
                    textTransform: style.textTransform,
                    color: '#e3e3e3'
                  }}
                >
                  {style.label}
                </span>
             </button>
             
             {/* Settings Trigger - ALWAYS VISIBLE */}
             <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingStyle(style);
                  setShowStyleConfig(true);
                  closeMenu();
                }}
                className="p-3 text-[#8e918f] hover:text-white hover:bg-white/10 transition-colors border-l border-white/5 shrink-0"
                title="Configurar Estilo"
             >
                <Settings2 size={16} />
             </button>
        </div>
      ))}
      <MenuDivider />
      <MenuItem icon={Save} label="Salvar como meus estilos padrão" onClick={() => exec(() => alert("Estilos salvos."))} className="text-xs text-[#a8c7fa]" />
    </MenuDropdown>
  );

  const renderFormatMenu = () => (
    <MenuDropdown>
      {!activeSubMenu ? (
        <>
          <MenuItem icon={Bold} label="Texto" hasSubmenu onClick={() => setActiveSubMenu('Texto')} />
          <MenuItem icon={AlignLeft} label="Alinhar e recuar" hasSubmenu onClick={() => setActiveSubMenu('Alinhar')} />
          <MenuItem icon={List} label="Marcadores e numeração" hasSubmenu onClick={() => setActiveSubMenu('Listas')} />
          <MenuDivider />
          <MenuItem icon={Eraser} label="Limpar formatação" onClick={() => exec(() => editor.chain().focus().unsetAllMarks().clearNodes().run())} shortcut="Ctrl+\" />
        </>
      ) : activeSubMenu === 'Texto' ? (
        <>
          <MenuSubHeader label="Texto" onBack={() => setActiveSubMenu(null)} />
          <MenuItem icon={Bold} label="Negrito" onClick={() => exec(() => editor.chain().focus().toggleBold().run())} isActive={editor.isActive('bold')} shortcut="Ctrl+B" />
          <MenuItem icon={Italic} label="Itálico" onClick={() => exec(() => editor.chain().focus().toggleItalic().run())} isActive={editor.isActive('italic')} shortcut="Ctrl+I" />
          <MenuItem icon={Underline} label="Sublinhado" onClick={() => exec(() => editor.chain().focus().toggleUnderline().run())} isActive={editor.isActive('underline')} shortcut="Ctrl+U" />
          <MenuItem icon={Strikethrough} label="Tachado" onClick={() => exec(() => editor.chain().focus().toggleStrike().run())} isActive={editor.isActive('strike')} />
          <MenuItem icon={Superscript} label="Sobrescrito" onClick={() => exec(() => editor.chain().focus().toggleSuperscript().run())} isActive={editor.isActive('superscript')} />
          <MenuItem icon={Subscript} label="Subscrito" onClick={() => exec(() => editor.chain().focus().toggleSubscript().run())} isActive={editor.isActive('subscript')} />
          <MenuItem icon={Code} label="Código Inline" onClick={() => exec(() => editor.chain().focus().toggleCode().run())} isActive={editor.isActive('code')} />
        </>
      ) : activeSubMenu === 'Alinhar' ? (
        <>
          <MenuSubHeader label="Alinhamento" onBack={() => setActiveSubMenu(null)} />
          <MenuItem icon={AlignLeft} label="Esquerda" onClick={() => exec(() => editor.chain().focus().setTextAlign('left').run())} isActive={editor.isActive({ textAlign: 'left' })} />
          <MenuItem icon={AlignCenter} label="Centro" onClick={() => exec(() => editor.chain().focus().setTextAlign('center').run())} isActive={editor.isActive({ textAlign: 'center' })} />
          <MenuItem icon={AlignRight} label="Direita" onClick={() => exec(() => editor.chain().focus().setTextAlign('right').run())} isActive={editor.isActive({ textAlign: 'right' })} />
          <MenuItem icon={AlignJustify} label="Justificado" onClick={() => exec(() => editor.chain().focus().setTextAlign('justify').run())} isActive={editor.isActive({ textAlign: 'justify' })} />
          <MenuDivider />
          <MenuItem icon={Indent} label="Aumentar recuo" onClick={() => exec(() => (editor.chain().focus() as any).indent().run())} shortcut="Tab" />
          <MenuItem icon={Outdent} label="Diminuir recuo" onClick={() => exec(() => (editor.chain().focus() as any).outdent().run())} shortcut="Shift+Tab" />
        </>
      ) : activeSubMenu === 'Listas' ? (
        <>
          <MenuSubHeader label="Listas" onBack={() => setActiveSubMenu(null)} />
          <MenuItem icon={List} label="Lista com marcadores" onClick={() => exec(() => editor.chain().focus().toggleBulletList().run())} isActive={editor.isActive('bulletList')} />
          <MenuItem icon={ListOrdered} label="Lista numerada" onClick={() => exec(() => editor.chain().focus().toggleOrderedList().run())} isActive={editor.isActive('orderedList')} />
          <MenuItem icon={CheckSquare} label="Checklist" onClick={() => exec(() => editor.chain().focus().toggleTaskList().run())} isActive={editor.isActive('taskList')} />
        </>
      ) : null}
    </MenuDropdown>
  );

  const renderMathMenu = () => (
    <MenuDropdown>
      <div className="px-4 py-1.5 text-xs font-bold text-brand uppercase tracking-wider mb-1 flex items-center gap-2">
         <Calculator size={14} /> Ciências Exatas
      </div>
      <MenuItem icon={Sigma} label="Inserir Equação (LaTeX)" onClick={() => exec(() => editor.chain().focus().insertContent({ type: 'mathNode', attrs: { latex: '' } }).run())} />
      <MenuItem icon={Keyboard} label="Painel de Símbolos" onClick={() => exec(() => setShowSymbolModal(true))} />
      <MenuItem icon={Terminal} label="Bloco de Código" onClick={() => exec(() => editor.chain().focus().toggleCodeBlock().run())} />
      
      <MenuDivider />
      
      <MenuItem 
        icon={FunctionSquare} 
        label="Fórmula de Bhaskara" 
        onClick={() => exec(() => editor.chain().focus().insertContent({ 
            type: 'mathNode', 
            attrs: { latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' } 
        }).run())} 
      />

      <MenuDivider />
      <MenuItem icon={Workflow} label="Diagrama Lógico (Mermaid)" onClick={() => exec(() => editor.chain().focus().insertContent({ type: 'mermaidNode', attrs: { chart: '' } }).run())} />
    </MenuDropdown>
  );

  const renderToolsMenu = () => (
    <MenuDropdown>
      <MenuItem icon={Type} label="Contagem de palavras" onClick={() => exec(props.onWordCount)} shortcut="Ctrl+Shift+C" />
      <MenuItem icon={SpellCheck} label="Verificação ortográfica" onClick={() => exec(props.onSpellCheck)} />
      <MenuItem icon={PenTool} label="Sugestões (Review)" onClick={() => exec(props.toggleSuggestionMode)} isActive={props.suggestionMode} />
      <MenuItem icon={Mic} label="Digitação por voz" onClick={() => exec(props.toggleDictation)} isActive={props.isDictationActive} />
      <MenuDivider />
      <MenuItem icon={FileCode} label="Importar Markdown" onClick={handleMarkdownImport} />
      <MenuItem icon={Languages} label="Traduzir documento" onClick={() => exec(() => alert("Recurso de tradução em breve."))} />
    </MenuDropdown>
  );

  const renderHelpMenu = () => (
    <MenuDropdown>
      <MenuItem icon={Info} label="Atalhos do teclado" onClick={() => exec(() => setShowHelpModal(true))} shortcut="Ctrl+/" />
      <MenuItem icon={Mail} label="Informar um problema" onClick={() => exec(() => {})} />
    </MenuDropdown>
  );

  return (
    <div className="flex items-center gap-1 select-none px-2" ref={menuRef}>
      
      {/* Undo/Redo Buttons (Visible & Neon White) */}
      <div className="flex items-center gap-1 mr-2 border-r border-[#444746] pr-2">
         <button 
           onClick={() => editor.chain().focus().undo().run()}
           disabled={!editor.can().undo()}
           className={`p-1.5 rounded-md transition-all ${!editor.can().undo() ? 'opacity-30 cursor-not-allowed text-gray-400' : 'text-white hover:bg-white/10 hover:shadow-[0_0_8px_rgba(255,255,255,0.6)]'}`}
           title="Desfazer (Ctrl+Z)"
         >
           <Undo size={18} />
         </button>
         <button 
           onClick={() => editor.chain().focus().redo().run()}
           disabled={!editor.can().redo()}
           className={`p-1.5 rounded-md transition-all ${!editor.can().redo() ? 'opacity-30 cursor-not-allowed text-gray-400' : 'text-white hover:bg-white/10 hover:shadow-[0_0_8px_rgba(255,255,255,0.6)]'}`}
           title="Refazer (Ctrl+Y)"
         >
           <Redo size={18} />
         </button>
      </div>

      <div className="relative">
        <MenuButton label="Arquivo" isActive={activeMenu === 'file'} onClick={() => toggleMenu('file')} onMouseEnter={() => handleMouseEnter('file')} />
        {activeMenu === 'file' && renderFileMenu()}
      </div>

      <div className="relative">
        <MenuButton label="Editar" isActive={activeMenu === 'edit'} onClick={() => toggleMenu('edit')} onMouseEnter={() => handleMouseEnter('edit')} />
        {activeMenu === 'edit' && renderEditMenu()}
      </div>

      <div className="relative">
        <MenuButton label="Ver" isActive={activeMenu === 'view'} onClick={() => toggleMenu('view')} onMouseEnter={() => handleMouseEnter('view')} />
        {activeMenu === 'view' && renderViewMenu()}
      </div>

      <div className="relative">
        <MenuButton label="Inserir" isActive={activeMenu === 'insert'} onClick={() => toggleMenu('insert')} onMouseEnter={() => handleMouseEnter('insert')} />
        {activeMenu === 'insert' && renderInsertMenu()}
      </div>

      <div className="relative">
        <MenuButton label="Estilos" isActive={activeMenu === 'styles'} onClick={() => toggleMenu('styles')} onMouseEnter={() => handleMouseEnter('styles')} />
        {activeMenu === 'styles' && renderStylesMenu()}
      </div>

      <div className="relative">
        <MenuButton label="Formatar" isActive={activeMenu === 'format'} onClick={() => toggleMenu('format')} onMouseEnter={() => handleMouseEnter('format')} />
        {activeMenu === 'format' && renderFormatMenu()}
      </div>

      <div className="relative">
        <MenuButton label="Exatas" isActive={activeMenu === 'math'} onClick={() => toggleMenu('math')} onMouseEnter={() => handleMouseEnter('math')} />
        {activeMenu === 'math' && renderMathMenu()}
      </div>

      <div className="relative">
        <MenuButton label="Ferramentas" isActive={activeMenu === 'tools'} onClick={() => toggleMenu('tools')} onMouseEnter={() => handleMouseEnter('tools')} />
        {activeMenu === 'tools' && renderToolsMenu()}
      </div>

      <div className="relative">
        <MenuButton label="Ajuda" isActive={activeMenu === 'help'} onClick={() => toggleMenu('help')} onMouseEnter={() => handleMouseEnter('help')} />
        {activeMenu === 'help' && renderHelpMenu()}
      </div>

      <HelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />
      <SymbolModal isOpen={showSymbolModal} onClose={() => setShowSymbolModal(false)} onInsert={(char) => editor.chain().focus().insertContent(char).run()} />
      <VersionHistoryModal isOpen={showHistoryModal} onClose={() => setShowHistoryModal(false)} />
      <StyleConfigModal 
        isOpen={showStyleConfig} 
        onClose={() => setShowStyleConfig(false)} 
        styleConfig={editingStyle}
        onSave={handleUpdateStyleConfig}
      />
    </div>
  );
};
