
import React from 'react';
import { ArrowLeft, Menu, Save, Minimize, Maximize } from 'lucide-react';

interface PdfHeaderProps {
  isVisible: boolean;
  fileName: string;
  currentPage: number;
  numPages: number;
  isSaving: boolean;
  isFullscreen: boolean;
  onToggleNavigation?: () => void;
  onBack: () => void;
  onSave: () => void;
  onToggleFullscreen: () => void;
  headerRef: React.RefObject<HTMLDivElement>;
}

export const PdfHeader: React.FC<PdfHeaderProps> = ({
  isVisible,
  fileName,
  currentPage,
  numPages,
  isSaving,
  isFullscreen,
  onToggleNavigation,
  onBack,
  onSave,
  onToggleFullscreen,
  headerRef
}) => {
  return (
    <div 
      ref={headerRef}
      className={`fixed top-4 left-1/2 -translate-x-1/2 w-[95%] max-w-5xl z-[50] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isVisible ? 'translate-y-0 opacity-100 pointer-events-auto' : '-translate-y-32 opacity-0 pointer-events-none'}`}
    >
       <div className="bg-[#0a0a0a] border border-[#333] flex items-center justify-between px-2 py-1.5 rounded-full shadow-2xl relative z-20">
           <div className="flex items-center gap-1 pl-1">
              {onToggleNavigation && <button onClick={onToggleNavigation} className="p-2.5 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors"><Menu size={20}/></button>}
              <button onClick={onBack} className="p-2.5 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors"><ArrowLeft size={20}/></button>
              <div className="h-6 w-px bg-white/10 mx-1"></div>
              <div className="flex flex-col px-2 max-w-[150px] md:max-w-[400px]">
                  <span className="text-xs font-bold text-white truncate">{fileName}</span>
                  <span className="text-[10px] text-brand/80 font-mono flex items-center gap-1">
                      PÁGINA {currentPage} <span className="text-white/30">/</span> {numPages}
                  </span>
              </div>
           </div>
           
           <div className="flex items-center gap-1 pr-1">
              <button 
                onClick={onSave} 
                disabled={isSaving}
                className="flex items-center gap-2 bg-brand text-[#0b141a] px-4 py-2 rounded-full text-xs font-bold shadow-lg shadow-brand/20 hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100"
              >
                  <Save size={16}/> <span className="hidden sm:inline">{isSaving ? 'SALVANDO...' : 'SALVAR'}</span>
              </button>
              <button onClick={onToggleFullscreen} className="p-2.5 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors" title={isFullscreen ? "Sair da Tela Cheia" : "Tela Cheia"}>
                  {isFullscreen ? <Minimize size={20}/> : <Maximize size={20}/>}
              </button>
           </div>
       </div>
    </div>
  );
};
