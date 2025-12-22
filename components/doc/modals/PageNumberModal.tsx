
import React, { useState } from 'react';
import { X, Hash } from 'lucide-react';

export interface PageNumberSettings {
  position: 'header' | 'footer';
  showOnFirstPage: boolean;
  startAt: number | null; // null means 'continue' (auto), number means explicit start
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onApply: (settings: PageNumberSettings) => void;
}

export const PageNumberModal: React.FC<Props> = ({ isOpen, onClose, onApply }) => {
  const [position, setPosition] = useState<'header' | 'footer'>('header');
  const [showOnFirstPage, setShowOnFirstPage] = useState(true);
  const [numberingMode, setNumberingMode] = useState<'continue' | 'start'>('continue');
  const [startValue, setStartValue] = useState(1);

  if (!isOpen) return null;

  const handleApply = () => {
    onApply({
      position,
      showOnFirstPage,
      startAt: numberingMode === 'start' ? startValue : null
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
       <div className="bg-[#1e1e1e] text-[#e3e3e3] rounded-3xl shadow-2xl p-6 w-full max-w-[380px] relative animate-in zoom-in-95 border border-[#444746]">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-normal">Números de página</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors"><X size={20}/></button>
          </div>

          <div className="space-y-6">
             {/* Posição */}
             <div className="space-y-3">
                 <label className="text-sm font-medium text-gray-300">Posição</label>
                 <div className="flex flex-col gap-3">
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${position === 'header' ? 'border-[#a8c7fa]' : 'border-gray-500 group-hover:border-gray-400'}`}>
                            {position === 'header' && <div className="w-2.5 h-2.5 rounded-full bg-[#a8c7fa]"></div>}
                        </div>
                        <input type="radio" name="position" className="hidden" checked={position === 'header'} onChange={() => setPosition('header')} />
                        <span>Cabeçalho</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${position === 'footer' ? 'border-[#a8c7fa]' : 'border-gray-500 group-hover:border-gray-400'}`}>
                            {position === 'footer' && <div className="w-2.5 h-2.5 rounded-full bg-[#a8c7fa]"></div>}
                        </div>
                        <input type="radio" name="position" className="hidden" checked={position === 'footer'} onChange={() => setPosition('footer')} />
                        <span>Rodapé</span>
                    </label>
                 </div>

                 <div className="pt-2">
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors ${showOnFirstPage ? 'bg-[#a8c7fa] border-[#a8c7fa]' : 'border-gray-500 group-hover:border-gray-400'}`}>
                            {showOnFirstPage && <Hash size={14} className="text-[#0b141a]" />}
                        </div>
                        <input type="checkbox" className="hidden" checked={showOnFirstPage} onChange={(e) => setShowOnFirstPage(e.target.checked)} />
                        <span>Mostrar na primeira página</span>
                    </label>
                 </div>
             </div>

             {/* Numeração */}
             <div className="space-y-3">
                 <label className="text-sm font-medium text-gray-300">Numeração</label>
                 <div className="flex flex-col gap-3">
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${numberingMode === 'start' ? 'border-[#a8c7fa]' : 'border-gray-500 group-hover:border-gray-400'}`}>
                            {numberingMode === 'start' && <div className="w-2.5 h-2.5 rounded-full bg-[#a8c7fa]"></div>}
                        </div>
                        <input type="radio" name="numbering" className="hidden" checked={numberingMode === 'start'} onChange={() => setNumberingMode('start')} />
                        <div className="flex items-center gap-2">
                            <span>Iniciar em</span>
                            <input 
                                type="number" 
                                className={`w-16 bg-[#2c2c2c] border border-gray-600 rounded px-2 py-1 text-center outline-none focus:border-[#a8c7fa] transition-opacity ${numberingMode !== 'start' ? 'opacity-50 pointer-events-none' : ''}`}
                                value={startValue}
                                onChange={(e) => setStartValue(parseInt(e.target.value) || 1)}
                            />
                        </div>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${numberingMode === 'continue' ? 'border-[#a8c7fa]' : 'border-gray-500 group-hover:border-gray-400'}`}>
                            {numberingMode === 'continue' && <div className="w-2.5 h-2.5 rounded-full bg-[#a8c7fa]"></div>}
                        </div>
                        <input type="radio" name="numbering" className="hidden" checked={numberingMode === 'continue'} onChange={() => setNumberingMode('continue')} />
                        <span>Continuar da seção anterior</span>
                    </label>
                 </div>
             </div>
          </div>

          <div className="mt-8 flex justify-end gap-3">
              <button onClick={onClose} className="text-[#a8c7fa] font-medium px-6 py-2 hover:bg-[#a8c7fa]/10 rounded-full transition-colors border border-transparent">Cancelar</button>
              <button onClick={handleApply} className="bg-[#a8c7fa] text-[#0b141a] font-medium px-8 py-2 rounded-full hover:bg-[#d8e5ff] transition-colors">Aplicar</button>
          </div>
       </div>
    </div>
  );
};
