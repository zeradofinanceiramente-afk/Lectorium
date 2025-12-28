
import React, { useState, useEffect } from 'react';
import { X, Hash, AlignLeft, AlignCenter, AlignRight, CheckCircle, Info, ArrowRight } from 'lucide-react';
import { PageNumberConfig } from './PageSetupModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onApply: (config: PageNumberConfig) => void;
}

export const PageNumberModal: React.FC<Props> = ({ isOpen, onClose, onApply }) => {
  const [position, setPosition] = useState<'header' | 'footer'>('header');
  const [alignment, setAlignment] = useState<'left' | 'center' | 'right'>('right');
  const [displayFromPage, setDisplayFromPage] = useState(2); 
  const [startValue, setStartValue] = useState(1);

  const isAbntCompliant = position === 'header' && alignment === 'right';

  // Reset/Init logic needed here if we passed initialValues, but for now we rely on user setting it
  // Ideally, we should receive current config from props to pre-fill.

  if (!isOpen) return null;

  const handleApply = () => {
    onApply({
      enabled: true,
      position,
      alignment,
      displayFromPage,
      startAt: startValue
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
       <div className="bg-[#1e1e1e] text-white rounded-3xl shadow-2xl w-full max-w-[420px] relative animate-in zoom-in-95 border border-[#333] overflow-hidden">
          
          <div className="flex justify-between items-center p-6 border-b border-[#333] bg-[#252525]">
            <h3 className="text-xl font-bold flex items-center gap-2">
                <div className="bg-[#4ade80]/10 p-2 rounded-lg text-[#4ade80]">
                    <Hash size={20} />
                </div>
                Paginação
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-full"><X size={20}/></button>
          </div>

          <div className="p-6 space-y-6">
             
             <div className={`p-3 rounded-xl border flex items-start gap-3 transition-colors ${isAbntCompliant ? 'bg-[#4ade80]/10 border-[#4ade80]/30' : 'bg-yellow-500/10 border-yellow-500/20'}`}>
                 {isAbntCompliant ? <CheckCircle size={18} className="text-[#4ade80] shrink-0 mt-0.5" /> : <Info size={18} className="text-yellow-500 shrink-0 mt-0.5" />}
                 <div>
                     <p className={`text-xs font-bold mb-1 ${isAbntCompliant ? 'text-[#4ade80]' : 'text-yellow-500'}`}>
                         {isAbntCompliant ? 'Compatível com ABNT NBR 14724' : 'Atenção à Norma ABNT'}
                     </p>
                     <p className="text-[10px] text-gray-400 leading-relaxed">
                         {isAbntCompliant 
                            ? 'A numeração no canto superior direito é o padrão para trabalhos acadêmicos.'
                            : 'Pela norma, a numeração deve figurar no canto superior direito da folha.'}
                     </p>
                 </div>
             </div>

             <div className="space-y-2">
                 <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Posição na Folha</label>
                 <div className="grid grid-cols-2 gap-3">
                    <button 
                        onClick={() => setPosition('header')}
                        className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${position === 'header' ? 'border-[#4ade80] bg-[#4ade80]/5 text-white' : 'border-[#333] bg-[#2c2c2c] text-gray-400 hover:border-gray-500'}`}
                    >
                        <div className="w-full h-2 bg-current rounded-full opacity-20 mb-1"></div>
                        <span className="text-sm font-medium">Cabeçalho</span>
                    </button>
                    <button 
                        onClick={() => setPosition('footer')}
                        className={`p-3 rounded-xl border-2 transition-all flex flex-col-reverse items-center gap-2 ${position === 'footer' ? 'border-[#4ade80] bg-[#4ade80]/5 text-white' : 'border-[#333] bg-[#2c2c2c] text-gray-400 hover:border-gray-500'}`}
                    >
                        <div className="w-full h-2 bg-current rounded-full opacity-20 mt-1"></div>
                        <span className="text-sm font-medium">Rodapé</span>
                    </button>
                 </div>
             </div>

             <div className="space-y-2">
                 <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Alinhamento</label>
                 <div className="flex bg-[#2c2c2c] p-1 rounded-lg border border-[#333]">
                    <button onClick={() => setAlignment('left')} className={`flex-1 py-1.5 rounded flex justify-center transition-all ${alignment === 'left' ? 'bg-[#4ade80] text-black' : 'text-gray-400 hover:text-white'}`}><AlignLeft size={18} /></button>
                    <button onClick={() => setAlignment('center')} className={`flex-1 py-1.5 rounded flex justify-center transition-all ${alignment === 'center' ? 'bg-[#4ade80] text-black' : 'text-gray-400 hover:text-white'}`}><AlignCenter size={18} /></button>
                    <button onClick={() => setAlignment('right')} className={`flex-1 py-1.5 rounded flex justify-center transition-all ${alignment === 'right' ? 'bg-[#4ade80] text-black' : 'text-gray-400 hover:text-white'}`}><AlignRight size={18} /></button>
                 </div>
             </div>

             <div className="space-y-4 pt-2 border-t border-[#333]">
                 <div className="flex items-center justify-between">
                    <label className="text-sm text-white font-medium">Começar a mostrar na página:</label>
                    <input 
                        type="number" 
                        min="1"
                        className="w-16 bg-[#2c2c2c] border border-gray-600 rounded-lg px-2 py-1.5 text-center text-white focus:border-[#4ade80] outline-none font-mono"
                        value={displayFromPage}
                        onChange={(e) => setDisplayFromPage(parseInt(e.target.value) || 1)}
                    />
                 </div>
                 <p className="text-[10px] text-gray-500 bg-[#252525] p-2 rounded-lg leading-relaxed">
                    <strong>Dica:</strong> Se você tem Capa e Folha de Rosto, coloque "3". As páginas 1 e 2 serão contadas, mas o número só aparecerá visível na página 3.
                 </p>

                 <div className="flex items-center justify-between opacity-60 hover:opacity-100 transition-opacity">
                    <label className="text-xs text-gray-400">Contagem inicia em:</label>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500">(Raro alterar)</span>
                        <input 
                            type="number" 
                            min="1"
                            className="w-12 bg-[#2c2c2c] border border-gray-600 rounded px-1 py-1 text-center text-xs text-white focus:border-[#4ade80] outline-none"
                            value={startValue}
                            onChange={(e) => setStartValue(parseInt(e.target.value) || 1)}
                        />
                    </div>
                 </div>
             </div>
          </div>

          <div className="p-6 pt-0 flex justify-end gap-3">
              <button onClick={onClose} className="text-gray-400 hover:text-white font-medium px-4 py-2 transition-colors text-sm">Cancelar</button>
              <button onClick={handleApply} className="bg-[#4ade80] text-[#0b141a] font-bold px-8 py-2.5 rounded-full hover:brightness-110 transition-all shadow-[0_0_20px_-5px_rgba(74,222,128,0.4)] flex items-center gap-2 text-sm">
                  Aplicar Configuração <ArrowRight size={14}/>
              </button>
          </div>
       </div>
    </div>
  );
};
