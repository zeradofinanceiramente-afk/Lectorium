import React, { useState, useMemo } from 'react';
import { X, Search, Keyboard, Command } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  label: string;
  keys: string[];
  category: string;
}

const SHORTCUTS: ShortcutItem[] = [
  // Geral
  { category: 'Geral', label: 'Desfazer', keys: ['Ctrl', 'Z'] },
  { category: 'Geral', label: 'Refazer', keys: ['Ctrl', 'Shift', 'Z'] }, // ou Ctrl+Y
  { category: 'Geral', label: 'Salvar', keys: ['Ctrl', 'S'] },
  { category: 'Geral', label: 'Imprimir', keys: ['Ctrl', 'P'] },
  { category: 'Geral', label: 'Localizar', keys: ['Ctrl', 'H'] },
  
  // Formatação
  { category: 'Formatação', label: 'Negrito', keys: ['Ctrl', 'B'] },
  { category: 'Formatação', label: 'Itálico', keys: ['Ctrl', 'I'] },
  { category: 'Formatação', label: 'Sublinhado', keys: ['Ctrl', 'U'] },
  { category: 'Formatação', label: 'Tachado', keys: ['Ctrl', 'Shift', 'X'] },
  { category: 'Formatação', label: 'Código', keys: ['Ctrl', 'E'] },
  { category: 'Formatação', label: 'Limpar formatação', keys: ['Ctrl', '\\'] },

  // Parágrafo
  { category: 'Parágrafo', label: 'Alinhar à Esquerda', keys: ['Ctrl', 'Shift', 'L'] },
  { category: 'Parágrafo', label: 'Centralizar', keys: ['Ctrl', 'Shift', 'E'] },
  { category: 'Parágrafo', label: 'Alinhar à Direita', keys: ['Ctrl', 'Shift', 'R'] },
  { category: 'Parágrafo', label: 'Justificar', keys: ['Ctrl', 'Shift', 'J'] },
  { category: 'Parágrafo', label: 'Título 1', keys: ['Ctrl', 'Alt', '1'] },
  { category: 'Parágrafo', label: 'Título 2', keys: ['Ctrl', 'Alt', '2'] },
  { category: 'Parágrafo', label: 'Título 3', keys: ['Ctrl', 'Alt', '3'] },
  { category: 'Parágrafo', label: 'Parágrafo Normal', keys: ['Ctrl', 'Alt', '0'] },

  // Inserção e Listas
  { category: 'Inserção', label: 'Quebra de página', keys: ['Ctrl', 'Enter'] },
  { category: 'Inserção', label: 'Link', keys: ['Ctrl', 'K'] },
  { category: 'Inserção', label: 'Lista com marcadores', keys: ['Ctrl', 'Shift', '8'] },
  { category: 'Inserção', label: 'Lista numerada', keys: ['Ctrl', 'Shift', '7'] },
  { category: 'Inserção', label: 'Checklist', keys: ['Ctrl', 'Shift', '9'] },

  // Seleção
  { category: 'Seleção', label: 'Selecionar tudo', keys: ['Ctrl', 'A'] },
  { category: 'Seleção', label: 'Copiar', keys: ['Ctrl', 'C'] },
  { category: 'Seleção', label: 'Colar', keys: ['Ctrl', 'V'] },
  { category: 'Seleção', label: 'Colar sem formatação', keys: ['Ctrl', 'Shift', 'V'] },
  { category: 'Seleção', label: 'Recortar', keys: ['Ctrl', 'X'] },
];

export const HelpModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredShortcuts = useMemo(() => {
    if (!searchTerm) return SHORTCUTS;
    const lower = searchTerm.toLowerCase();
    return SHORTCUTS.filter(s => 
      s.label.toLowerCase().includes(lower) || 
      s.category.toLowerCase().includes(lower)
    );
  }, [searchTerm]);

  // Agrupar por categoria
  const groupedShortcuts = useMemo(() => {
    const groups: Record<string, ShortcutItem[]> = {};
    filteredShortcuts.forEach(item => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    });
    return groups;
  }, [filteredShortcuts]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
       <div className="bg-[#1e1e1e] text-[#e3e3e3] rounded-2xl shadow-2xl w-full max-w-2xl relative animate-in zoom-in-95 border border-[#444746] flex flex-col max-h-[85vh]">
          
          {/* Header */}
          <div className="p-6 border-b border-[#444746] flex justify-between items-center bg-[#1e1e1e] rounded-t-2xl sticky top-0 z-10">
            <div className="flex items-center gap-3">
                <div className="bg-brand/10 p-2 rounded-lg text-brand">
                    <Keyboard size={24} />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white">Ajuda & Atalhos</h3>
                    <p className="text-sm text-text-sec">Pesquise funções e veja os atalhos disponíveis</p>
                </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-text-sec hover:text-white transition-colors">
                <X size={20}/>
            </button>
          </div>

          {/* Search Bar */}
          <div className="p-4 bg-[#141414] border-b border-[#444746]">
            <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-sec" />
                <input 
                    autoFocus
                    type="text" 
                    placeholder="Pesquisar função (ex: negrito, salvar, copiar)..." 
                    className="w-full bg-[#262626] border border-[#444746] rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all placeholder:text-text-sec"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
          </div>

          {/* List Content */}
          <div className="overflow-y-auto p-6 custom-scrollbar flex-1 bg-[#141414] rounded-b-2xl">
             {Object.keys(groupedShortcuts).length === 0 ? (
                 <div className="text-center py-10 text-text-sec flex flex-col items-center gap-3">
                     <Command size={48} className="opacity-20" />
                     <p>Nenhum atalho encontrado para "{searchTerm}"</p>
                 </div>
             ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-8">
                    {Object.entries(groupedShortcuts).map(([category, items]) => (
                        <div key={category} className="space-y-3">
                            <h4 className="text-xs font-bold text-brand uppercase tracking-wider flex items-center gap-2 mb-2">
                                {category}
                            </h4>
                            <div className="space-y-1">
                                {(items as ShortcutItem[]).map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between py-2 border-b border-[#444746]/50 last:border-0 group">
                                        <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{item.label}</span>
                                        <div className="flex gap-1">
                                            {item.keys.map((key, k) => (
                                                <kbd key={k} className="bg-[#2c2c2c] border border-[#444746] rounded px-1.5 py-0.5 text-[10px] font-mono text-gray-400 font-bold min-w-[20px] text-center shadow-sm">
                                                    {key}
                                                </kbd>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                 </div>
             )}
          </div>
          
          {/* Footer Hint */}
          <div className="p-3 bg-[#1e1e1e] border-t border-[#444746] text-center rounded-b-2xl">
             <p className="text-[10px] text-text-sec">
                Dica: Você também pode usar <kbd className="bg-[#2c2c2c] px-1 rounded text-gray-400">/</kbd> no editor para abrir o menu de comandos rápidos.
             </p>
          </div>
       </div>
    </div>
  );
};