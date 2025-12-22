
import React, { useState } from 'react';
import { Editor, BubbleMenu } from '@tiptap/react';
import { 
  ArrowLeft, ArrowRight, ArrowUp, ArrowDown, 
  Trash2, Merge, Split, Palette, Rows, Columns, GripHorizontal, Settings2
} from 'lucide-react';

interface Props {
  editor: Editor;
  onOpenProperties?: () => void;
}

const CELL_COLORS = [
  '#f8f9fa', '#e9ecef', '#dee2e6', // Grays
  '#f8d7da', '#f1aeb5', // Reds
  '#d1e7dd', '#a3cfbb', // Greens
  '#cfe2ff', '#9ec5fe', // Blues
  '#fff3cd', '#ffe69c', // Yellows
  'transparent'
];

export const TableBubbleMenu: React.FC<Props> = ({ editor, onOpenProperties }) => {
  const [activeTab, setActiveTab] = useState<'main' | 'style'>('main');

  const shouldShow = ({ editor }: { editor: Editor }) => {
    // Check specifically for any table part to ensure menu shows on cell selection too
    return editor.isActive('table') || editor.isActive('tableCell') || editor.isActive('tableHeader');
  };

  const Btn = ({ onClick, icon: Icon, title, danger = false, active = false }: any) => (
    <button 
      onClick={onClick}
      className={`p-1.5 rounded transition-all ${
        active 
          ? 'bg-brand/20 text-brand' 
          : danger 
            ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300' 
            : 'text-gray-200 hover:bg-white/10'
      }`}
      title={title}
    >
      <Icon size={16} />
    </button>
  );

  const Divider = () => <div className="w-px bg-white/10 mx-1 h-4 self-center" />;

  const setCellColor = (color: string) => {
    if (color === 'transparent') {
       editor.chain().focus().setCellAttribute('backgroundColor', null).run();
    } else {
       editor.chain().focus().setCellAttribute('backgroundColor', color).run();
    }
  };

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ 
        duration: 100, 
        zIndex: 9999, // Increased Z-Index to stay above headers/modals
        maxWidth: 500, 
        placement: 'top',
        moveTransition: 'transform 0.2s ease-out'
      }}
      shouldShow={shouldShow}
      className="flex flex-col bg-[#262626] shadow-2xl border border-border rounded-xl overflow-hidden animate-in fade-in zoom-in duration-200 min-w-[320px] pointer-events-auto ring-1 ring-white/10"
    >
      {/* Tabs Header */}
      <div className="flex bg-black/20 border-b border-white/5">
         <button 
           onClick={() => setActiveTab('main')}
           className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'main' ? 'text-brand bg-white/5' : 'text-text-sec hover:text-text'}`}
         >
            Estrutura
         </button>
         <button 
           onClick={() => setActiveTab('style')}
           className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'style' ? 'text-brand bg-white/5' : 'text-text-sec hover:text-text'}`}
         >
            Estilo
         </button>
         {onOpenProperties && (
             <button 
               onClick={onOpenProperties}
               className="px-3 py-2 text-text-sec hover:text-text hover:bg-white/5 border-l border-white/5"
               title="Propriedades Avançadas"
             >
                <Settings2 size={14} />
             </button>
         )}
      </div>

      <div className="p-2 flex gap-1 items-center justify-center flex-wrap">
        {activeTab === 'main' ? (
            <>
                <div className="flex items-center gap-0.5 bg-white/5 rounded p-0.5">
                    <Btn onClick={() => editor.chain().focus().addColumnBefore().run()} icon={ArrowLeft} title="Adicionar coluna antes" />
                    <Btn onClick={() => editor.chain().focus().addColumnAfter().run()} icon={ArrowRight} title="Adicionar coluna depois" />
                    <Btn onClick={() => editor.chain().focus().deleteColumn().run()} icon={Trash2} title="Excluir coluna" danger />
                </div>
                
                <Divider />

                <div className="flex items-center gap-0.5 bg-white/5 rounded p-0.5">
                    <Btn onClick={() => editor.chain().focus().addRowBefore().run()} icon={ArrowUp} title="Adicionar linha antes" />
                    <Btn onClick={() => editor.chain().focus().addRowAfter().run()} icon={ArrowDown} title="Adicionar linha depois" />
                    <Btn onClick={() => editor.chain().focus().deleteRow().run()} icon={Trash2} title="Excluir linha" danger />
                </div>

                <Divider />

                <Btn onClick={() => editor.chain().focus().mergeCells().run()} icon={Merge} title="Mesclar células" />
                <Btn onClick={() => editor.chain().focus().splitCell().run()} icon={Split} title="Dividir célula" />
                
                <Divider />
                
                <Btn onClick={() => editor.chain().focus().deleteTable().run()} icon={Trash2} title="Excluir tabela inteira" danger />
            </>
        ) : (
            <>
                {/* Headers Toggle */}
                <Btn 
                    onClick={() => editor.chain().focus().toggleHeaderRow().run()} 
                    icon={Rows} 
                    title="Cabeçalho de Linha" 
                    active={editor.can().toggleHeaderRow()}
                />
                <Btn 
                    onClick={() => editor.chain().focus().toggleHeaderColumn().run()} 
                    icon={Columns} 
                    title="Cabeçalho de Coluna" 
                    active={editor.can().toggleHeaderColumn()}
                />
                
                <Divider />

                {/* Distribution */}
                <Btn onClick={() => editor.chain().focus().fixTables().run()} icon={GripHorizontal} title="Distribuir Colunas" />

                <Divider />

                {/* Colors */}
                <div className="flex gap-1 items-center bg-white/5 rounded px-2 py-1">
                    <Palette size={14} className="text-text-sec mr-1"/>
                    {CELL_COLORS.map(color => (
                        <button
                            key={color}
                            onClick={() => setCellColor(color)}
                            className={`w-4 h-4 rounded-full border border-white/20 hover:scale-125 transition-transform ${color === 'transparent' ? 'bg-transparent relative' : ''}`}
                            style={{ backgroundColor: color }}
                            title={color === 'transparent' ? 'Sem cor' : color}
                        >
                            {color === 'transparent' && <div className="absolute inset-0 border-r border-red-400 rotate-45 transform origin-center scale-125 opacity-50" />}
                        </button>
                    ))}
                </div>
            </>
        )}
      </div>
    </BubbleMenu>
  );
};
