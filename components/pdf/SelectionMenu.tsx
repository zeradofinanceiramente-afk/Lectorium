
import React from 'react';
import { Highlighter, Sparkles, Book, Copy, X } from 'lucide-react';

export interface SelectionState {
  page: number;
  text: string;
  popupX: number;
  popupY: number;
  relativeRects: { x: number; y: number; width: number; height: number }[];
  position: 'top' | 'bottom';
}

interface Props {
  selection: SelectionState;
  onHighlight: () => void;
  onExplainAi: () => void;
  onDefine: () => void;
  onCopy: () => void;
  onClose: () => void;
}

export const SelectionMenu: React.FC<Props> = ({
  selection,
  onHighlight,
  onExplainAi,
  onDefine,
  onCopy,
  onClose
}) => {
  
  const MenuBtn = ({ onClick, icon: Icon, label, colorClass, hoverClass }: any) => (
    <button 
      onClick={onClick}
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-lg 
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
      className="absolute z-50 flex flex-col items-center animate-in fade-in zoom-in-95 duration-200"
      style={{ 
        left: selection.popupX,
        top: selection.popupY,
        transform: 'translateX(-50%)'
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

          <div className="w-px h-4 bg-[#30363d] mx-1"></div>

          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-[#21262d] text-[#8b949e] hover:text-red-400 rounded-lg transition-colors"
          >
            <X size={14} />
          </button>
      </div>

      {/* Arrow Pointer - Adjusted for Dark Theme */}
      {selection.position === 'top' ? (
         <div className="w-3 h-3 bg-[#0d1117] border-b border-r border-[#30363d] transform rotate-45 absolute -bottom-1.5 z-[-1]"></div>
      ) : (
         <div className="w-3 h-3 bg-[#0d1117] border-t border-l border-[#30363d] transform rotate-45 absolute -top-1.5 z-[-1]"></div>
      )}
    </div>
  );
};
