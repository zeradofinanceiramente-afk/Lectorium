
import React, { useState, useEffect } from 'react';
import { MousePointer2, StickyNote, Pen, Eraser, ChevronLeft, ChevronRight, MoveHorizontal, Minus, Plus, Search, ZoomIn, Paintbrush } from 'lucide-react';
import { usePdfContext } from '../../context/PdfContext';
import { usePdfStore } from '../../stores/usePdfStore';

interface Props {
  onFitWidth: () => void;
}

export const PdfToolbar: React.FC<Props> = ({ onFitWidth }) => {
  // Consumindo ESTADOS diretamente do Store (Zustand)
  const activeTool = usePdfStore(s => s.activeTool);
  const setActiveTool = usePdfStore(s => s.setActiveTool);
  
  const currentPage = usePdfStore(s => s.currentPage);
  const numPages = usePdfStore(s => s.numPages);
  const jumpToPage = usePdfStore(s => s.jumpToPage);
  const goNext = usePdfStore(s => s.nextPage);
  const goPrev = usePdfStore(s => s.prevPage);
  
  const scale = usePdfStore(s => s.scale);
  const setScale = usePdfStore(s => s.setScale);

  // Consumindo DADOS do Context (ainda necessário para settings e callbacks complexos)
  const { settings, docPageOffset } = usePdfContext();

  const [isEditingPage, setIsEditingPage] = useState(false);
  const [tempPageInput, setTempPageInput] = useState("1");

  // Display Logic: If offset exists, show Logical (Physical)
  const displayPage = currentPage + docPageOffset;
  const hasOffset = docPageOffset !== 0;

  useEffect(() => {
    if (!isEditingPage) {
      setTempPageInput(currentPage.toString());
    }
  }, [currentPage, isEditingPage]);

  const handlePageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const page = parseInt(tempPageInput);
    if (!isNaN(page) && page >= 1 && page <= numPages) {
      jumpToPage(page);
    } else {
      setTempPageInput(currentPage.toString());
    }
    setIsEditingPage(false);
  };

  const ToolbarBtn = ({ active, onClick, icon: Icon, title, className = "" }: any) => (
      <button 
        onClick={onClick} 
        className={`
            relative p-2.5 rounded-xl transition-all duration-200 group
            flex items-center justify-center
            ${active 
                ? 'text-brand bg-brand/10 border border-brand/50' 
                : 'text-[#8b949e] hover:bg-[#21262d] hover:text-white border border-transparent'}
            ${className}
        `} 
        title={title}
      >
        <Icon size={18} strokeWidth={2.5} className="relative z-10" />
      </button>
  );

  return (
    <div 
        className="fixed left-1/2 z-[50] animate-in slide-in-from-bottom-6 fade-in duration-500 origin-bottom"
        style={{
            bottom: `${32 + settings.toolbarYOffset}px`,
            transform: `translateX(-50%) scale(${settings.toolbarScale})`
        }}
    >
        <div className="
            flex items-center gap-3 p-1.5 px-2
            bg-[#0d1117]
            border border-[#30363d] 
            rounded-2xl 
        ">
            
            {/* Zone 1: Tools */}
            <div className="flex items-center gap-1 bg-[#161b22] p-1 rounded-xl border border-[#30363d]">
                <ToolbarBtn active={activeTool === 'cursor'} onClick={() => setActiveTool('cursor')} icon={MousePointer2} title="Selecionar" />
                <ToolbarBtn active={activeTool === 'brush'} onClick={() => setActiveTool('brush')} icon={Paintbrush} title="Pincel de Destaque (Área)" />
                <ToolbarBtn active={activeTool === 'note'} onClick={() => setActiveTool('note')} icon={StickyNote} title="Nota" />
                <ToolbarBtn active={activeTool === 'ink'} onClick={() => setActiveTool('ink')} icon={Pen} title="Desenhar" />
                <ToolbarBtn active={activeTool === 'eraser'} onClick={() => setActiveTool('eraser')} icon={Eraser} title="Apagar" />
            </div>
            
            <div className="h-8 w-px bg-[#30363d] mx-1"></div>

            {/* Zone 2: Navigation */}
            <div className="flex items-center gap-1 px-1">
                <button 
                    onClick={goPrev} 
                    className="p-2 hover:bg-[#21262d] rounded-lg text-[#8b949e] hover:text-white transition-colors"
                    title="Página Anterior"
                >
                    <ChevronLeft size={20}/>
                </button>
                
                <div className="flex items-center bg-[#010409] border border-[#30363d] rounded-lg px-2 py-1 gap-2 min-w-[100px] justify-center shadow-inner relative">
                    {isEditingPage ? (
                    <form onSubmit={handlePageSubmit} className="flex items-center justify-center">
                        <input 
                        autoFocus
                        type="number"
                        min="1"
                        max={numPages}
                        value={tempPageInput}
                        onChange={(e) => setTempPageInput(e.target.value)}
                        onBlur={() => setIsEditingPage(false)}
                        className="w-8 bg-transparent text-center font-mono text-sm font-bold text-white outline-none p-0 selection:bg-brand/30"
                        />
                    </form>
                    ) : (
                    <button 
                        onClick={() => {
                        setTempPageInput(currentPage.toString());
                        setIsEditingPage(true);
                        }}
                        className="font-mono text-sm font-bold text-white hover:text-brand transition-colors text-center px-1"
                    >
                        {hasOffset ? displayPage : currentPage}
                    </button>
                    )}
                    <span className="text-[#484f58] text-xs font-mono select-none">/</span>
                    <span className="text-[#8b949e] text-xs font-mono select-none">{numPages}</span>
                </div>

                <button 
                    onClick={goNext} 
                    className="p-2 hover:bg-[#21262d] rounded-lg text-[#8b949e] hover:text-white transition-colors"
                    title="Próxima Página"
                >
                    <ChevronRight size={20}/>
                </button>
            </div>

            <div className="h-8 w-px bg-[#30363d] mx-1"></div>

            {/* Zone 3: Zoom */}
            <div className="flex items-center gap-1 pr-1">
                <button 
                    onClick={onFitWidth} 
                    className="p-2 hover:bg-[#21262d] rounded-lg text-[#8b949e] hover:text-brand transition-colors group" 
                    title="Ajustar à Largura"
                >
                    <MoveHorizontal size={18} className="group-hover:scale-110 transition-transform"/>
                </button>

                <div className="flex items-center gap-1 bg-[#161b22] rounded-lg p-0.5 border border-[#30363d]">
                    <button 
                        onClick={() => setScale(s => Math.max(0.5, s - 0.2))} 
                        className="p-1.5 hover:bg-[#21262d] rounded-md text-[#8b949e] hover:text-white transition-colors"
                    >
                        <Minus size={14}/>
                    </button>
                    
                    <span className="text-[10px] font-mono font-bold w-[4ch] text-center text-[#8b949e] select-none">
                        {Math.round(scale * 100)}%
                    </span>
                    
                    <button 
                        onClick={() => setScale(s => Math.min(3, s + 0.2))} 
                        className="p-1.5 hover:bg-[#21262d] rounded-md text-[#8b949e] hover:text-white transition-colors"
                    >
                        <Plus size={14}/>
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};
