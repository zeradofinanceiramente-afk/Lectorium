
import React, { useState, useEffect, useRef } from 'react';
import { Editor } from '@tiptap/react';
import { X, ArrowDown, ArrowUp, Replace, Search, ReplaceAll } from 'lucide-react';

interface Props {
  editor: Editor | null;
  isOpen: boolean;
  onClose: () => void;
}

export const FindReplaceBar: React.FC<Props> = ({ editor, isOpen, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [results, setResults] = useState<{ from: number; to: number }[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Limpar resultados quando fechar ou mudar termo
  useEffect(() => {
    if (!searchTerm) {
      setResults([]);
      setCurrentIndex(-1);
    }
  }, [searchTerm]);

  const find = () => {
    if (!editor || !searchTerm) return;

    const { doc } = editor.state;
    const matches: { from: number; to: number }[] = [];

    // Varredura simples nos nós de texto
    doc.descendants((node, pos) => {
      if (node.isText && node.text) {
        const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        let match;
        while ((match = regex.exec(node.text)) !== null) {
          matches.push({
            from: pos + match.index,
            to: pos + match.index + match[0].length,
          });
        }
      }
    });

    setResults(matches);
    
    if (matches.length > 0) {
      // Encontrar o match mais próximo após a seleção atual
      const currentSelection = editor.state.selection.from;
      let nextIndex = matches.findIndex(m => m.from >= currentSelection);
      
      if (nextIndex === -1) nextIndex = 0; // Wrap around
      
      setCurrentIndex(nextIndex);
      selectMatch(matches[nextIndex]);
    } else {
      setCurrentIndex(-1);
    }
  };

  const selectMatch = (match: { from: number; to: number }) => {
    if (!editor) return;
    editor.chain()
      .setTextSelection({ from: match.from, to: match.to })
      .scrollIntoView()
      .run();
  };

  const next = () => {
    if (results.length === 0) {
      find();
      return;
    }
    const nextIdx = (currentIndex + 1) % results.length;
    setCurrentIndex(nextIdx);
    selectMatch(results[nextIdx]);
  };

  const previous = () => {
    if (results.length === 0) {
      find();
      return;
    }
    const prevIdx = (currentIndex - 1 + results.length) % results.length;
    setCurrentIndex(prevIdx);
    selectMatch(results[prevIdx]);
  };

  const replace = () => {
    if (!editor || results.length === 0 || currentIndex === -1) return;

    const currentMatch = results[currentIndex];
    
    // Verificar se a seleção atual ainda corresponde ao match (segurança)
    const { from, to } = editor.state.selection;
    if (from !== currentMatch.from || to !== currentMatch.to) {
      selectMatch(currentMatch); // Reselecionar se o usuário moveu o cursor
    }

    editor.chain()
      .insertContent(replaceTerm) // Substitui a seleção atual
      .run();

    // Re-executar busca para atualizar índices (pois o documento mudou de tamanho)
    // Pequeno delay para garantir que o editor atualizou
    setTimeout(() => {
        find();
    }, 50);
  };

  const replaceAll = () => {
    if (!editor || !searchTerm) return;

    const { doc } = editor.state;
    const transactions: any[] = [];
    
    // Coletar todas as posições primeiro (de trás para frente para não quebrar índices)
    const matches: { from: number; to: number }[] = [];
    doc.descendants((node, pos) => {
      if (node.isText && node.text) {
        const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        let match;
        while ((match = regex.exec(node.text)) !== null) {
          matches.push({
            from: pos + match.index,
            to: pos + match.index + match[0].length,
          });
        }
      }
    });

    if (matches.length === 0) return;

    // Executar substituições em uma única transação usando chain
    const chain = editor.chain();
    // Inverter ordem para que as substituições no final não afetem os índices do início
    for (let i = matches.length - 1; i >= 0; i--) {
        const m = matches[i];
        chain.deleteRange({ from: m.from, to: m.to }).insertContentAt(m.from, replaceTerm);
    }
    chain.run();
    
    // Atualizar UI
    setResults([]);
    setCurrentIndex(-1);
    alert(`${matches.length} ocorrências substituídas.`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
        if (e.shiftKey) previous();
        else next();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute top-20 right-8 z-[60] w-80 bg-[#1e1e1e] border border-[#444746] rounded-xl shadow-2xl p-4 flex flex-col gap-3 animate-in slide-in-from-top-2 fade-in">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-[#e3e3e3] flex items-center gap-2">
            <Search size={14} className="text-brand"/> Localizar e substituir
        </h3>
        <button onClick={onClose} className="text-text-sec hover:text-white transition-colors">
            <X size={16} />
        </button>
      </div>

      {/* Busca */}
      <div className="relative group">
        <input 
            ref={inputRef}
            type="text" 
            placeholder="Localizar..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-brand outline-none"
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <span className="text-xs text-gray-500 font-mono mr-1">
                {results.length > 0 ? `${currentIndex + 1}/${results.length}` : '0/0'}
            </span>
            <div className="h-4 w-px bg-gray-600 mx-1"></div>
            <button onClick={previous} className="p-1 hover:bg-white/10 rounded text-gray-300" title="Anterior">
                <ArrowUp size={14} />
            </button>
            <button onClick={next} className="p-1 hover:bg-white/10 rounded text-gray-300" title="Próximo">
                <ArrowDown size={14} />
            </button>
        </div>
      </div>

      {/* Substituir */}
      <div className="flex flex-col gap-2">
        <input 
            type="text" 
            placeholder="Substituir por..." 
            value={replaceTerm}
            onChange={(e) => setReplaceTerm(e.target.value)}
            className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-brand outline-none"
        />
        <div className="flex gap-2 mt-1">
            <button 
                onClick={replace}
                disabled={results.length === 0}
                className="flex-1 bg-[#2c2c2c] hover:bg-[#3c3c3c] border border-gray-600 text-white py-1.5 px-3 rounded text-xs font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
            >
                <Replace size={12} /> Substituir
            </button>
            <button 
                onClick={replaceAll}
                disabled={results.length === 0}
                className="flex-1 bg-[#2c2c2c] hover:bg-[#3c3c3c] border border-gray-600 text-white py-1.5 px-3 rounded text-xs font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
            >
                <ReplaceAll size={12} /> Tudo
            </button>
        </div>
      </div>
    </div>
  );
};
