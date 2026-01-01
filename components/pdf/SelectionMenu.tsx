
import React from 'react';
import { Highlighter, Sparkles, Book, Copy, X, Eraser } from 'lucide-react';

export interface SelectionState {
  page: number;
  text: string;
  popupX: number; // Mantido para compatibilidade de tipo, mas ignorado no render
  popupY: number; // Mantido para compatibilidade de tipo, mas ignorado no render
  relativeRects: { x: number; y: number; width: number; height: number }[];
  position: 'top' | 'bottom';
}

interface Props {
  selection: SelectionState;
  onHighlight: () => void;
  onExplainAi: () => void;
  onDefine: () => void;
  onCopy: () => void;
  onDelete?: () => void;
  onClose: () => void;
}

export const SelectionMenu: React.FC<Props> = ({
  selection,
  onHighlight,
  onExplainAi,
  onDefine,
  onCopy,
  onDelete,
  onClose
}) => {
  
  const MenuBtn = ({ onClick, icon: Icon, label, colorClass, hoverClass }: any) => (
    <button 
      onClick={onClick}
      className={`
        flex items-center gap-2 px-3 py-2 rounded-lg 
        text-xs font-bold transition-all duration-200 group
        hover:bg-[#21262d] ${hoverClass || 'hover:text-white'}
      `}
    >
      <Icon size={14} className={`${colorClass} transition-transform group-hover:scale-110`} />
      <span className="text-[#c9d1d9] group-hover:text-white">{label}</span>
    </button>
  );

  return (
    <div 
      className="fixed z-[60] flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-300"
      style={{ 
        left: '50%',
        bottom: '100px', /* Posição fixa acima da Toolbar */
        transform: 'translateX(-50%)',
        width: 'max-content',
        pointerEvents: 'auto'
      }}
    >
      <div className="
        flex items-center gap-0.5 p-1
        bg-[#0d1117]/95 backdrop-blur-xl 
        border border-[#30363d] 
        rounded-xl 
        shadow-[0_8px_32px_rgba(0,0,0,0.6)]
        ring-1 ring-white/5
      ">
          <MenuBtn 
            onClick={onHighlight} 
            icon={Highlighter} 
            label="Destacar" 
            colorClass="text-emerald-400"
          />
          
          <MenuBtn 
            onClick={onExplainAi} 
            icon={Sparkles} 
            label="IA" 
            colorClass="text-purple-400"
          />

          <MenuBtn 
            onClick={onDefine} 
            icon={Book} 
            label="Definir" 
            colorClass="text-amber-400"
          />

          <MenuBtn 
            onClick={onCopy} 
            icon={Copy} 
            label="Copiar" 
            colorClass="text-blue-400"
          />

          {onDelete && (
            <MenuBtn 
              onClick={onDelete} 
              icon={Eraser} 
              label="Apagar" 
              colorClass="text-red-400"
              hoverClass="hover:text-red-400"
            />
          )}

          <div className="w-px h-4 bg-[#30363d] mx-1"></div>

          <button 
            onClick={onClose}
            className="p-2 hover:bg-[#21262d] text-[#8b949e] hover:text-red-400 rounded-lg transition-colors"
          >
            <X size={14} />
          </button>
      </div>
    </div>
  );
};
