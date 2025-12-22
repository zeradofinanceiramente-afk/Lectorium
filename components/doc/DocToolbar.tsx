
import React, { useState, useRef, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { 
  Bold, Italic, Strikethrough, 
  Quote, 
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Image as ImageIcon, Table,
  Superscript, Subscript, Baseline, Highlighter, ArrowUpFromLine,
  Type, MessageSquareQuote,
  Check, ArrowDownToLine,
  Minus, Terminal, Indent as IndentIcon,
  ChevronLeft, ChevronRight
} from 'lucide-react';

interface Props {
  editor: Editor | null;
  onInsertImage: () => void;
  onAddFootnote: () => void;
  // Pagination Props
  currentPage: number;
  totalPages: number;
  onJumpToPage: (page: number) => void;
}

// Lista de fontes
const FONTS = [
  { name: 'Times New Roman', value: 'Times New Roman' },
  { name: 'Arial', value: 'Arial' },
  { name: 'Inter', value: 'Inter' },
  { name: 'Roboto', value: 'Roboto' },
  { name: 'Lora', value: 'Lora' },
  { name: 'Calibri', value: 'Calibri' },
  { name: 'Courier New', value: 'Courier New' },
  { name: 'Georgia', value: 'Georgia' },
  { name: 'Verdana', value: 'Verdana' },
  { name: 'Merriweather', value: 'Merriweather' },
  { name: 'Fira Code', value: '"Fira Code"' },
];

export const DocToolbar: React.FC<Props> = ({ 
  editor, onInsertImage, onAddFootnote,
  currentPage, totalPages, onJumpToPage
}) => {
  const [activeMenu, setActiveMenu] = useState<'align' | 'format' | 'spacing' | null>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  
  // Page Input State
  const [isEditingPage, setIsEditingPage] = useState(false);
  const [tempPageInput, setTempPageInput] = useState("1");

  useEffect(() => {
    if (!isEditingPage) {
        setTempPageInput((currentPage ?? 1).toString());
    }
  }, [currentPage, isEditingPage]);

  // Fecha menus ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!editor) return null;

  const toggleMenu = (menu: 'align' | 'format' | 'spacing') => {
    setActiveMenu(activeMenu === menu ? null : menu);
  };

  const handlePageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const page = parseInt(tempPageInput);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      onJumpToPage(page);
    } else {
      setTempPageInput((currentPage ?? 1).toString());
    }
    setIsEditingPage(false);
  };

  const Button = ({ onClick, isActive, title, children, className }: any) => (
    <button 
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()} // Previne perda de foco do editor
      className={`p-2 rounded-lg transition-all flex items-center justify-center shrink-0 ${
        isActive 
          ? 'bg-brand text-bg shadow-sm' 
          : 'hover:bg-white/10 text-text-sec hover:text-text'
      } ${className || ''}`}
      title={title}
    >
      {children}
    </button>
  );

  // --- Actions ---

  const addTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const setFont = (font: string) => {
    editor.chain().focus().setFontFamily(font).run();
  };

  const setFontSize = (size: string) => {
    if (!size) (editor.chain().focus() as any).unsetFontSize().run();
    else (editor.chain().focus() as any).setFontSize(size).run();
  };

  const setLineHeight = (height: string) => {
    // Aplica tanto para parágrafos quanto headings
    (editor.chain().focus() as any).setLineHeight(height).run();
  };

  const toggleAttribute = (attr: string) => {
    const current = editor.getAttributes('paragraph')[attr];
    editor.chain().focus().updateAttributes('paragraph', { [attr]: !current }).run();
  };

  const setParagraphSpacing = (type: 'before' | 'after') => {
    // Usa os atributos definidos no ParagraphExtended (marginTop/marginBottom)
    const attr = type === 'before' ? 'marginTop' : 'marginBottom';
    const current = editor.getAttributes('paragraph')[attr];
    
    // Toggle: Se existe valor, remove. Se não, aplica padrão 12pt.
    const hasSpace = current && current !== '0pt' && current !== '0px' && current !== '0';
    const newVal = hasSpace ? null : '12pt';
    
    editor.chain().focus().updateAttributes('paragraph', { [attr]: newVal }).run();
  };

  const setFirstLineIndent = (valStr: string) => {
    if (editor.isActive('paragraph')) {
        editor.chain().focus().updateAttributes('paragraph', { textIndent: valStr }).run();
    }
  };

  // --- Current States ---
  const currentFont = editor.getAttributes('textStyle').fontFamily || 'Times New Roman';
  const currentFontSize = editor.getAttributes('textStyle').fontSize || '12';
  const currentLineHeight = editor.getAttributes('paragraph').lineHeight || '1.5';
  
  const paragraphAttrs = editor.getAttributes('paragraph');
  const marginTop = paragraphAttrs.marginTop;
  const marginBottom = paragraphAttrs.marginBottom;
  const hasSpaceBefore = marginTop && marginTop !== '0pt' && marginTop !== '0px';
  const hasSpaceAfter = marginBottom && marginBottom !== '0pt' && marginBottom !== '0px';
  
  const currentTextIndent = paragraphAttrs.textIndent;
  const hasFirstLineIndent = currentTextIndent && currentTextIndent !== '0px' && currentTextIndent !== '0';

  return (
    <div 
        ref={menuContainerRef}
        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 bg-black border border-border p-2 rounded-2xl shadow-2xl flex items-center gap-1 animate-in slide-in-from-bottom-4 fade-in duration-500 overflow-visible max-w-[95vw] print:hidden"
    >
      
      {/* Font Family & Size */}
      <div className="flex items-center gap-1 shrink-0 px-2 bg-white/5 rounded-lg mr-1">
        <select 
            className="bg-transparent text-text text-sm font-medium outline-none cursor-pointer max-w-[110px] truncate"
            onChange={(e) => setFont(e.target.value)}
            value={currentFont.replace(/['"]/g, '')} // Remove aspas para comparar
        >
            {FONTS.map((font) => (
              <option key={font.name} value={font.value} className="bg-bg text-text">
                {font.name}
              </option>
            ))}
        </select>
        <div className="w-px h-4 bg-white/20 mx-1"></div>
        <select 
            className="bg-transparent text-text text-sm font-medium outline-none cursor-pointer w-10"
            onChange={(e) => setFontSize(e.target.value)}
            value={currentFontSize}
            title="Tamanho da fonte"
        >
            {['8','9','10','11','12','14','16','18','20','24','30','36','48','72'].map(s => (
                <option key={s} value={s} className="bg-bg text-text">{s}</option>
            ))}
        </select>
      </div>

      {/* Spacing Menu */}
      <div className="relative">
         <Button 
            onClick={() => toggleMenu('spacing')}
            isActive={activeMenu === 'spacing'}
            title="Espaçamento e Paginação"
         >
            <ArrowUpFromLine size={16} />
         </Button>

         {activeMenu === 'spacing' && (
            <div className="absolute bottom-full left-0 mb-2 bg-[#1e1e1e] border border-border rounded-xl shadow-xl flex flex-col min-w-[240px] animate-in slide-in-from-bottom-2 fade-in overflow-hidden z-50">
               {/* Line Height */}
               <div className="p-2 border-b border-[#444746]">
                  <div className="text-[10px] font-bold text-text-sec uppercase tracking-wider px-2 mb-1">Entrelinhas</div>
                  {['1.0', '1.15', '1.5', '2.0'].map(val => (
                      <button 
                        key={val}
                        onClick={() => { setLineHeight(val); setActiveMenu(null); }}
                        className="w-full text-left px-2 py-1.5 hover:bg-white/10 rounded flex items-center justify-between text-sm text-[#e3e3e3]"
                      >
                         <span>{val}</span>
                         {currentLineHeight === val && <Check size={14} className="text-brand"/>}
                      </button>
                  ))}
               </div>

               {/* Indentation (Recuo) */}
               <div className="p-2 border-b border-[#444746]">
                  <div className="text-[10px] font-bold text-text-sec uppercase tracking-wider px-2 mb-1 flex items-center gap-2">
                      <IndentIcon size={12}/> Recuo Especial
                  </div>
                  
                  <div className="flex flex-col gap-2 px-1">
                      <button 
                        onClick={() => setFirstLineIndent('1.25cm')}
                        disabled={!editor.isActive('paragraph')}
                        className={`w-full text-left px-2 py-1.5 hover:bg-white/10 rounded flex items-center justify-between text-sm transition-colors ${!editor.isActive('paragraph') ? 'text-gray-500 cursor-not-allowed' : 'text-[#e3e3e3]'}`}
                        title="Aplica recuo de 1.25cm na primeira linha (Padrão ABNT)"
                      >
                         <span>Padrão (1.25 cm)</span>
                         {currentTextIndent === '1.25cm' && <Check size={14} className="text-brand"/>}
                      </button>

                      <div className="flex items-center gap-2 pl-2">
                          <span className="text-[10px] text-text-sec whitespace-nowrap">Personalizar:</span>
                          <input 
                            type="number"
                            step="0.1"
                            className="w-14 bg-[#2c2c2c] border border-gray-600 rounded px-2 py-0.5 text-xs text-white focus:border-brand outline-none"
                            placeholder="1.25"
                            disabled={!editor.isActive('paragraph')}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    const val = (e.target as HTMLInputElement).value;
                                    setFirstLineIndent(`${val}cm`);
                                }
                            }}
                          />
                          <span className="text-[10px] text-text-sec">cm</span>
                      </div>
                      
                      {hasFirstLineIndent && (
                          <button 
                            onClick={() => setFirstLineIndent('0px')}
                            className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2 py-1 rounded w-full text-left flex items-center gap-1"
                          >
                              <Minus size={10} /> Remover recuo
                          </button>
                      )}
                  </div>
               </div>

               {/* Margins */}
               <div className="p-2 border-b border-[#444746]">
                  <div className="text-[10px] font-bold text-text-sec uppercase tracking-wider px-2 mb-1">Parágrafo</div>
                  <button 
                    onClick={() => setParagraphSpacing('before')}
                    className="w-full text-left px-2 py-1.5 hover:bg-white/10 rounded flex items-center gap-2 text-sm text-[#e3e3e3]"
                  >
                     {hasSpaceBefore ? <ArrowDownToLine size={14} className="text-brand"/> : <ArrowUpFromLine size={14}/>}
                     <span>{hasSpaceBefore ? 'Remover espaço antes' : 'Adicionar espaço antes'}</span>
                  </button>
                  <button 
                    onClick={() => setParagraphSpacing('after')}
                    className="w-full text-left px-2 py-1.5 hover:bg-white/10 rounded flex items-center gap-2 text-sm text-[#e3e3e3]"
                  >
                     {hasSpaceAfter ? <ArrowUpFromLine size={14} className="text-brand"/> : <ArrowDownToLine size={14}/>}
                     <span>{hasSpaceAfter ? 'Remover espaço depois' : 'Adicionar espaço depois'}</span>
                  </button>
               </div>

               {/* Pagination */}
               <div className="p-2">
                  <div className="text-[10px] font-bold text-text-sec uppercase tracking-wider px-2 mb-1">Paginação</div>
                  
                  <button onClick={() => toggleAttribute('keepWithNext')} className="w-full text-left px-2 py-1.5 hover:bg-white/10 rounded flex items-center justify-between text-sm text-[#e3e3e3]">
                     <span>Manter com o próximo</span>
                     {paragraphAttrs.keepWithNext && <Check size={14} className="text-brand"/>}
                  </button>
                  
                  <button onClick={() => toggleAttribute('keepLinesTogether')} className="w-full text-left px-2 py-1.5 hover:bg-white/10 rounded flex items-center justify-between text-sm text-[#e3e3e3]">
                     <span>Manter linhas juntas</span>
                     {paragraphAttrs.keepLinesTogether && <Check size={14} className="text-brand"/>}
                  </button>

                  <button onClick={() => toggleAttribute('pageBreakBefore')} className="w-full text-left px-2 py-1.5 hover:bg-white/10 rounded flex items-center justify-between text-sm text-[#e3e3e3]">
                     <span>Quebra de pág. antes</span>
                     {paragraphAttrs.pageBreakBefore && <Check size={14} className="text-brand"/>}
                  </button>
               </div>
            </div>
         )}
      </div>

      <div className="w-px h-6 bg-border shrink-0 mx-1"></div>

      {/* Advanced Format Menu */}
      <div className="relative">
        <Button 
          onClick={() => toggleMenu('format')}
          isActive={activeMenu === 'format' || editor.isActive('code') || editor.isActive('subscript') || editor.isActive('superscript')}
          title="Mais Formatação"
        >
          <Type size={16} />
        </Button>

        {activeMenu === 'format' && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-surface border border-border rounded-xl shadow-xl flex items-center p-1 gap-1 animate-in slide-in-from-bottom-2 fade-in whitespace-nowrap z-50">
            <Button onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title="Negrito"><Bold size={16} /></Button>
            <Button onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="Itálico"><Italic size={16} /></Button>
            <Button onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} title="Tachado"><Strikethrough size={16} /></Button>
            <div className="w-px h-4 bg-border mx-1"></div>
            <Button onClick={() => editor.chain().focus().toggleSubscript().run()} isActive={editor.isActive('subscript')} title="Subscrito"><Subscript size={16} /></Button>
            <Button onClick={() => editor.chain().focus().toggleSuperscript().run()} isActive={editor.isActive('superscript')} title="Sobrescrito"><Superscript size={16} /></Button>
            <div className="w-px h-4 bg-border mx-1"></div>
            <Button onClick={() => editor.chain().focus().toggleCode().run()} isActive={editor.isActive('code')} title="Código Inline"><Terminal size={16} /></Button>
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-border shrink-0 mx-1"></div>
      
      {/* Color & Highlight */}
      <div className="flex items-center gap-1 shrink-0">
         <div className="relative group flex items-center justify-center p-2 hover:bg-white/10 rounded-lg cursor-pointer">
             <input 
                type="color" 
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                onInput={(e) => editor.chain().focus().setColor((e.target as HTMLInputElement).value).run()}
                value={editor.getAttributes('textStyle').color || '#000000'}
                title="Cor do Texto"
             />
             <Baseline size={16} className="text-text-sec group-hover:text-text" style={{ color: editor.getAttributes('textStyle').color }} />
         </div>
         <div className="relative group flex items-center justify-center p-2 hover:bg-white/10 rounded-lg cursor-pointer">
             <input 
                type="color" 
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                onInput={(e) => editor.chain().focus().toggleHighlight({ color: (e.target as HTMLInputElement).value }).run()}
                title="Cor de Destaque"
             />
             <Highlighter size={16} className="text-text-sec group-hover:text-text" />
         </div>
      </div>

      <div className="w-px h-6 bg-border shrink-0 mx-1"></div>

      {/* Alignment */}
      <div className="relative">
        <Button 
          onClick={() => toggleMenu('align')}
          isActive={activeMenu === 'align'}
          title="Alinhamento"
        >
          {editor.isActive({ textAlign: 'center' }) ? <AlignCenter size={16}/> :
           editor.isActive({ textAlign: 'right' }) ? <AlignRight size={16}/> :
           editor.isActive({ textAlign: 'justify' }) ? <AlignJustify size={16}/> :
           <AlignLeft size={16}/>}
        </Button>

        {activeMenu === 'align' && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-surface border border-border rounded-xl shadow-xl flex flex-col p-1 gap-1 animate-in slide-in-from-bottom-2 fade-in min-w-[40px] z-50">
            <Button onClick={() => { editor.chain().focus().setTextAlign('left').run(); setActiveMenu(null); }} isActive={editor.isActive({ textAlign: 'left' })} title="Esq"><AlignLeft size={16} /></Button>
            <Button onClick={() => { editor.chain().focus().setTextAlign('center').run(); setActiveMenu(null); }} isActive={editor.isActive({ textAlign: 'center' })} title="Cen"><AlignCenter size={16} /></Button>
            <Button onClick={() => { editor.chain().focus().setTextAlign('right').run(); setActiveMenu(null); }} isActive={editor.isActive({ textAlign: 'right' })} title="Dir"><AlignRight size={16} /></Button>
            <Button onClick={() => { editor.chain().focus().setTextAlign('justify').run(); setActiveMenu(null); }} isActive={editor.isActive({ textAlign: 'justify' })} title="Just"><AlignJustify size={16} /></Button>
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-border shrink-0 mx-1"></div>

      {/* Block Elements */}
      <Button onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive('blockquote')} title="Citação (ABNT)"><Quote size={16} /></Button>
      <Button onClick={onAddFootnote} title="Nota de Rodapé"><MessageSquareQuote size={16} /></Button>

      <div className="w-px h-6 bg-border shrink-0 mx-1"></div>

      {/* Insertables (Modified: No Math/Mermaid) */}
      <div className="flex items-center gap-0.5 bg-brand/5 p-1 rounded-lg shrink-0 border border-brand/20">
        <Button onClick={onInsertImage} title="Imagem"><ImageIcon size={16} className="text-brand" /></Button>
        <Button onClick={addTable} title="Tabela"><Table size={16} className="text-brand" /></Button>
        
        {/* Page Counter & Jumper */}
        <div className="flex items-center gap-2 px-2 bg-brand/10 rounded-lg ml-1 h-[32px] border border-brand/30">
            {isEditingPage ? (
              <form onSubmit={handlePageSubmit} className="flex items-center">
                <input 
                  autoFocus
                  type="number"
                  min="1"
                  max={totalPages}
                  value={tempPageInput}
                  onChange={(e) => setTempPageInput(e.target.value)}
                  onBlur={() => setIsEditingPage(false)}
                  className="w-10 bg-transparent text-center font-mono text-sm font-bold outline-none text-white p-0 m-0 border-b border-brand"
                />
              </form>
            ) : (
              <button 
                onClick={() => {
                  setTempPageInput((currentPage ?? 1).toString());
                  setIsEditingPage(true);
                }}
                className="font-mono text-xs font-bold text-brand hover:text-white transition-colors"
                title="Ir para página"
              >
                Pág {currentPage}
              </button>
            )}
            <span className="text-text-sec text-[10px]">/ {totalPages}</span>
        </div>
      </div>
    </div>
  );
};