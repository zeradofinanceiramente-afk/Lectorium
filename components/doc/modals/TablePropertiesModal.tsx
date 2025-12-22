
import React, { useState } from 'react';
import { Editor } from '@tiptap/react';
import { 
  Table, ArrowDown, ArrowUp, ArrowLeft, ArrowRight, 
  Trash2, Merge, Split, Palette, Check, GripHorizontal, 
  Layout, Grid3X3
} from 'lucide-react';
import { BaseModal } from '../../shared/BaseModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editor: Editor | null;
}

const CELL_COLORS = [
  'transparent',
  '#f8f9fa', '#e9ecef', '#dee2e6', // Grays
  '#f8d7da', '#f1aeb5', // Reds
  '#d1e7dd', '#a3cfbb', // Greens
  '#cfe2ff', '#9ec5fe', // Blues
  '#fff3cd', '#ffe69c', // Yellows
];

export const TablePropertiesModal: React.FC<Props> = ({ isOpen, onClose, editor }) => {
  const [activeTab, setActiveTab] = useState<'structure' | 'cells' | 'style'>('structure');

  if (!isOpen || !editor) return null;

  const setCellColor = (color: string) => {
    if (color === 'transparent') {
       editor.chain().focus().setCellAttribute('backgroundColor', null).run();
    } else {
       editor.chain().focus().setCellAttribute('backgroundColor', color).run();
    }
  };

  const ActionButton = ({ onClick, icon: Icon, label, danger }: any) => (
    <button 
      onClick={onClick}
      className={`flex items-center gap-3 w-full p-3 rounded-xl transition-colors border ${
        danger 
          ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20' 
          : 'bg-[#2c2c2c] border-transparent hover:bg-[#363636] text-gray-200'
      }`}
    >
      <Icon size={18} />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Propriedades da Tabela"
      icon={<Table size={20} />}
      maxWidth="max-w-md"
    >
      <div className="flex border-b border-[#444746] mb-4">
         <button onClick={() => setActiveTab('structure')} className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'structure' ? 'border-[#a8c7fa] text-[#a8c7fa]' : 'border-transparent text-gray-400 hover:text-white'}`}>Estrutura</button>
         <button onClick={() => setActiveTab('cells')} className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'cells' ? 'border-[#a8c7fa] text-[#a8c7fa]' : 'border-transparent text-gray-400 hover:text-white'}`}>Células</button>
         <button onClick={() => setActiveTab('style')} className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'style' ? 'border-[#a8c7fa] text-[#a8c7fa]' : 'border-transparent text-gray-400 hover:text-white'}`}>Estilo</button>
      </div>

      <div className="min-h-[250px]">
        {activeTab === 'structure' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
               <div className="space-y-2">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Linhas</span>
                  <ActionButton onClick={() => editor.chain().focus().addRowBefore().run()} icon={ArrowUp} label="Adicionar Acima" />
                  <ActionButton onClick={() => editor.chain().focus().addRowAfter().run()} icon={ArrowDown} label="Adicionar Abaixo" />
                  <ActionButton onClick={() => editor.chain().focus().deleteRow().run()} icon={Trash2} label="Excluir Linha" danger />
               </div>
               <div className="space-y-2">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Colunas</span>
                  <ActionButton onClick={() => editor.chain().focus().addColumnBefore().run()} icon={ArrowLeft} label="Adicionar à Esq." />
                  <ActionButton onClick={() => editor.chain().focus().addColumnAfter().run()} icon={ArrowRight} label="Adicionar à Dir." />
                  <ActionButton onClick={() => editor.chain().focus().deleteColumn().run()} icon={Trash2} label="Excluir Coluna" danger />
               </div>
            </div>
            
            <div className="pt-2 border-t border-[#444746]">
               <ActionButton onClick={() => { editor.chain().focus().deleteTable().run(); onClose(); }} icon={Trash2} label="Excluir Tabela Inteira" danger />
            </div>
          </div>
        )}

        {activeTab === 'cells' && (
          <div className="space-y-3">
             <div className="grid grid-cols-2 gap-3">
                <ActionButton onClick={() => editor.chain().focus().mergeCells().run()} icon={Merge} label="Mesclar Células" />
                <ActionButton onClick={() => editor.chain().focus().splitCell().run()} icon={Split} label="Dividir Célula" />
             </div>
             
             <div className="h-px bg-[#444746] my-2"></div>
             
             <div className="space-y-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Distribuição</span>
                <ActionButton onClick={() => editor.chain().focus().fixTables().run()} icon={GripHorizontal} label="Normalizar Colunas" />
             </div>

             <div className="h-px bg-[#444746] my-2"></div>

             <div className="grid grid-cols-2 gap-3">
                <ActionButton onClick={() => editor.chain().focus().toggleHeaderRow().run()} icon={Layout} label="Cabeçalho Linha" />
                <ActionButton onClick={() => editor.chain().focus().toggleHeaderColumn().run()} icon={Grid3X3} label="Cabeçalho Coluna" />
             </div>
          </div>
        )}

        {activeTab === 'style' && (
          <div className="space-y-4">
             <div>
                <label className="text-sm text-gray-300 block mb-3 flex items-center gap-2">
                   <Palette size={16} className="text-brand"/> Cor de Fundo da Célula
                </label>
                <div className="grid grid-cols-5 gap-2">
                   {CELL_COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => setCellColor(color)}
                        className="aspect-square rounded-lg border border-white/10 hover:scale-110 transition-transform relative group"
                        style={{ backgroundColor: color === 'transparent' ? 'transparent' : color }}
                        title={color}
                      >
                         {color === 'transparent' && (
                            <div className="absolute inset-0 flex items-center justify-center">
                               <div className="w-full h-px bg-red-400 rotate-45 transform scale-75"></div>
                            </div>
                         )}
                      </button>
                   ))}
                </div>
             </div>
             
             <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <p className="text-xs text-blue-200">
                   Dica: Selecione múltiplas células arrastando o mouse para aplicar cores em massa.
                </p>
             </div>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-4 mt-4 border-t border-[#444746]">
         <button onClick={onClose} className="px-6 py-2 bg-brand text-[#0b141a] font-bold rounded-full hover:brightness-110 flex items-center gap-2">
            <Check size={16} /> Concluído
         </button>
      </div>
    </BaseModal>
  );
};
