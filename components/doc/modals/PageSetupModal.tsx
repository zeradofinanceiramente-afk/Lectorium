
import React, { useState, useEffect } from 'react';
import { PAPER_SIZES } from '../constants';

export interface PageNumberConfig {
  enabled: boolean;
  position: 'header' | 'footer';
  alignment: 'left' | 'center' | 'right';
  displayFromPage: number; // Substitui showOnFirstPage por controle granular
  startAt: number; // Número inicial da contagem (geralmente 1)
}

export interface PageSettings {
  paperSize: string;
  orientation: 'portrait' | 'landscape';
  pageColor: string;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  watermark?: string;
  headerText?: string;
  footerText?: string;
  pageNumber?: PageNumberConfig;
}

interface Props {
  isOpen: boolean;
  initialSettings: PageSettings;
  // initialViewMode prop kept for interface compatibility but ignored in UI
  initialViewMode: 'slide' | 'continuous'; 
  onClose: () => void;
  onApply: (settings: PageSettings, viewMode: 'slide' | 'continuous') => void;
}

export const PageSetupModal: React.FC<Props> = ({ isOpen, initialSettings, initialViewMode, onClose, onApply }) => {
  const [tempSettings, setTempSettings] = useState<PageSettings>(initialSettings);
  
  // Sync internal state when modal opens or props change
  useEffect(() => {
    if (isOpen) {
      setTempSettings(initialSettings);
    }
  }, [isOpen, initialSettings]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
       <div className="bg-[#1e1e1e] text-white rounded-3xl shadow-2xl p-6 w-full max-w-lg relative animate-in zoom-in-95 border border-[#444746]">
          <h3 className="text-2xl font-normal mb-6 text-[#4ade80]">Configuração da página</h3>
          
          <div className="space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
             {/* Orientação */}
             <div className="space-y-2">
                 <label className="text-sm font-medium text-gray-300">Orientação</label>
                 <div className="flex gap-6">
                    <label className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors">
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${tempSettings.orientation === 'portrait' ? 'border-[#4ade80]' : 'border-gray-500'}`}>
                            {tempSettings.orientation === 'portrait' && <div className="w-2 h-2 rounded-full bg-[#4ade80]"></div>}
                        </div>
                        <input type="radio" name="orientation" className="hidden" checked={tempSettings.orientation === 'portrait'} onChange={() => setTempSettings(p => ({...p, orientation: 'portrait'}))} />
                        <span>Retrato</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors">
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${tempSettings.orientation === 'landscape' ? 'border-[#4ade80]' : 'border-gray-500'}`}>
                            {tempSettings.orientation === 'landscape' && <div className="w-2 h-2 rounded-full bg-[#4ade80]"></div>}
                        </div>
                        <input type="radio" name="orientation" className="hidden" checked={tempSettings.orientation === 'landscape'} onChange={() => setTempSettings(p => ({...p, orientation: 'landscape'}))} />
                        <span>Paisagem</span>
                    </label>
                 </div>
             </div>

             {/* Tamanho do papel & Cor */}
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                     <label className="text-sm font-medium text-gray-300">Tamanho do papel</label>
                     <div className="relative">
                        <select 
                            className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm appearance-none outline-none focus:border-[#4ade80] truncate pr-8 text-white"
                            value={tempSettings.paperSize}
                            onChange={(e) => setTempSettings(p => ({...p, paperSize: e.target.value}))}
                        >
                            {Object.entries(PAPER_SIZES).map(([key, size]) => (
                                <option key={key} value={key}>{size.name}</option>
                            ))}
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">▼</div>
                     </div>
                </div>
                <div className="space-y-2">
                     <label className="text-sm font-medium text-gray-300">Cor da página</label>
                     <div className="relative">
                         <div className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 flex items-center gap-2 cursor-pointer relative group focus-within:border-[#4ade80]">
                             <div className="w-4 h-4 rounded-full border border-gray-500" style={{ backgroundColor: tempSettings.pageColor }}></div>
                             <input 
                                type="color" 
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                value={tempSettings.pageColor}
                                onChange={(e) => setTempSettings(p => ({...p, pageColor: e.target.value}))}
                             />
                             <div className="ml-auto text-gray-400 text-xs">▼</div>
                         </div>
                     </div>
                </div>
             </div>

             {/* Marca D'água */}
             <div className="space-y-2">
                 <label className="text-sm font-medium text-gray-300">Marca D'água</label>
                 <input 
                    type="text"
                    placeholder="Ex: RASCUNHO"
                    className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm focus:border-[#4ade80] outline-none text-white placeholder:text-gray-600"
                    value={tempSettings.watermark || ''}
                    onChange={(e) => setTempSettings(p => ({...p, watermark: e.target.value}))}
                 />
             </div>

             {/* Margens */}
             <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Margens (centímetros)</label>
                <div className="grid grid-cols-4 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs text-gray-400">Início</label>
                        <input type="number" step="0.1" value={tempSettings.marginTop} onChange={e => setTempSettings(p => ({...p, marginTop: parseFloat(e.target.value)}))} className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-2 py-1.5 text-sm focus:border-[#4ade80] outline-none text-white text-center" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-gray-400">Fim</label>
                        <input type="number" step="0.1" value={tempSettings.marginBottom} onChange={e => setTempSettings(p => ({...p, marginBottom: parseFloat(e.target.value)}))} className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-2 py-1.5 text-sm focus:border-[#4ade80] outline-none text-white text-center" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-text-sec">Esquerda</label>
                        <input type="number" step="0.1" value={tempSettings.marginLeft} onChange={e => setTempSettings(p => ({...p, marginLeft: parseFloat(e.target.value)}))} className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-2 py-1.5 text-sm focus:border-[#4ade80] outline-none text-white text-center" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-text-sec">Direita</label>
                        <input type="number" step="0.1" value={tempSettings.marginRight} onChange={e => setTempSettings(p => ({...p, marginRight: parseFloat(e.target.value)}))} className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-2 py-1.5 text-sm focus:border-[#4ade80] outline-none text-white text-center" />
                    </div>
                </div>
             </div>
          </div>

          <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-[#333]">
              <button onClick={onClose} className="text-[#4ade80] font-medium px-6 py-2 hover:bg-[#4ade80]/10 rounded-full transition-colors border border-transparent">Cancelar</button>
              <button onClick={() => onApply(tempSettings, 'slide')} className="bg-[#4ade80] text-[#0b141a] font-bold px-8 py-2 rounded-full hover:bg-[#22c55e] transition-colors shadow-lg shadow-green-900/20">Aplicar</button>
          </div>
       </div>
    </div>
  );
};
