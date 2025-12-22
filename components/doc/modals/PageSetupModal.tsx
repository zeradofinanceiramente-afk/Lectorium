
import React, { useState, useEffect } from 'react';
import { PAPER_SIZES } from '../constants';

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
}

interface Props {
  isOpen: boolean;
  initialSettings: PageSettings;
  initialViewMode: 'paged' | 'continuous';
  onClose: () => void;
  onApply: (settings: PageSettings, viewMode: 'paged' | 'continuous') => void;
}

export const PageSetupModal: React.FC<Props> = ({ isOpen, initialSettings, initialViewMode, onClose, onApply }) => {
  const [tempSettings, setTempSettings] = useState<PageSettings>(initialSettings);
  const [viewMode, setViewMode] = useState<'paged' | 'continuous'>(initialViewMode);

  // Sync internal state when modal opens or props change
  useEffect(() => {
    if (isOpen) {
      setTempSettings(initialSettings);
      setViewMode(initialViewMode);
    }
  }, [isOpen, initialSettings, initialViewMode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
       <div className="bg-[#1e1e1e] text-white rounded-3xl shadow-2xl p-6 w-full max-w-md relative animate-in zoom-in-95 border border-[#444746]">
          <h3 className="text-2xl font-normal mb-6">Configuração da página</h3>
          
          {/* Tabs */}
          <div className="flex border-b border-[#444746] mb-6">
              <button 
                onClick={() => setViewMode('paged')}
                className={`px-4 py-2 font-medium border-b-2 transition-colors ${viewMode === 'paged' ? 'text-[#a8c7fa] border-[#a8c7fa]' : 'text-gray-400 border-transparent hover:text-gray-300'}`}
              >
                Páginas
              </button>
              <button 
                onClick={() => setViewMode('continuous')}
                className={`px-4 py-2 font-medium border-b-2 transition-colors ${viewMode === 'continuous' ? 'text-[#a8c7fa] border-[#a8c7fa]' : 'text-gray-400 border-transparent hover:text-gray-300'}`}
              >
                Sem páginas
              </button>
          </div>

          <div className="space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
             {viewMode === 'continuous' && (
               <div className="bg-[#a8c7fa]/10 p-3 rounded-lg text-sm text-[#a8c7fa] mb-4">
                 O modo sem páginas permite visualizar o documento como um fluxo contínuo, sem quebras de página.
               </div>
             )}

             {/* Orientação */}
             <div className={`space-y-2 ${viewMode === 'continuous' ? 'opacity-50 pointer-events-none' : ''}`}>
                 <label className="text-sm font-medium text-gray-300">Orientação</label>
                 <div className="flex gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${tempSettings.orientation === 'portrait' ? 'border-[#a8c7fa]' : 'border-gray-500'}`}>
                            {tempSettings.orientation === 'portrait' && <div className="w-2 h-2 rounded-full bg-[#a8c7fa]"></div>}
                        </div>
                        <input type="radio" name="orientation" className="hidden" checked={tempSettings.orientation === 'portrait'} onChange={() => setTempSettings(p => ({...p, orientation: 'portrait'}))} disabled={viewMode === 'continuous'} />
                        <span>Retrato</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${tempSettings.orientation === 'landscape' ? 'border-[#a8c7fa]' : 'border-gray-500'}`}>
                            {tempSettings.orientation === 'landscape' && <div className="w-2 h-2 rounded-full bg-[#a8c7fa]"></div>}
                        </div>
                        <input type="radio" name="orientation" className="hidden" checked={tempSettings.orientation === 'landscape'} onChange={() => setTempSettings(p => ({...p, orientation: 'landscape'}))} disabled={viewMode === 'continuous'} />
                        <span>Paisagem</span>
                    </label>
                 </div>
             </div>

             {/* Tamanho do papel & Cor */}
             <div className="grid grid-cols-2 gap-4">
                <div className={`space-y-2 ${viewMode === 'continuous' ? 'opacity-50 pointer-events-none' : ''}`}>
                     <label className="text-sm font-medium text-gray-300">Tamanho do papel</label>
                     <div className="relative">
                        <select 
                            className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm appearance-none outline-none focus:border-[#a8c7fa] truncate pr-8"
                            value={tempSettings.paperSize}
                            onChange={(e) => setTempSettings(p => ({...p, paperSize: e.target.value}))}
                            disabled={viewMode === 'continuous'}
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
                         <div className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 flex items-center gap-2 cursor-pointer relative group">
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
                    className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm focus:border-[#a8c7fa] outline-none"
                    value={tempSettings.watermark || ''}
                    onChange={(e) => setTempSettings(p => ({...p, watermark: e.target.value}))}
                 />
             </div>

             {/* Margens */}
             <div className={`space-y-2 ${viewMode === 'continuous' ? 'opacity-50 pointer-events-none' : ''}`}>
                <label className="text-sm font-medium text-gray-300">Margens (centímetros)</label>
                <div className="grid grid-cols-4 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs text-gray-400">Início</label>
                        <input type="number" step="0.1" value={tempSettings.marginTop} onChange={e => setTempSettings(p => ({...p, marginTop: parseFloat(e.target.value)}))} className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-2 py-1.5 text-sm focus:border-[#a8c7fa] outline-none" disabled={viewMode === 'continuous'} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-gray-400">Fim</label>
                        <input type="number" step="0.1" value={tempSettings.marginBottom} onChange={e => setTempSettings(p => ({...p, marginBottom: parseFloat(e.target.value)}))} className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-2 py-1.5 text-sm focus:border-[#a8c7fa] outline-none" disabled={viewMode === 'continuous'} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-gray-400">Esquerda</label>
                        <input type="number" step="0.1" value={tempSettings.marginLeft} onChange={e => setTempSettings(p => ({...p, marginLeft: parseFloat(e.target.value)}))} className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-2 py-1.5 text-sm focus:border-[#a8c7fa] outline-none" disabled={viewMode === 'continuous'} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-gray-400">Direita</label>
                        <input type="number" step="0.1" value={tempSettings.marginRight} onChange={e => setTempSettings(p => ({...p, marginRight: parseFloat(e.target.value)}))} className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-2 py-1.5 text-sm focus:border-[#a8c7fa] outline-none" disabled={viewMode === 'continuous'} />
                    </div>
                </div>
             </div>
          </div>

          <div className="mt-8 flex justify-end gap-3">
              <button className="text-[#a8c7fa] font-medium px-4 py-2 hover:bg-[#a8c7fa]/10 rounded transition-colors text-sm">Salvo como padrão</button>
              <button onClick={onClose} className="text-[#a8c7fa] font-medium px-6 py-2 hover:bg-[#a8c7fa]/10 rounded-full transition-colors border border-transparent">Cancelar</button>
              <button onClick={() => onApply(tempSettings, viewMode)} className="bg-[#a8c7fa] text-[#0b141a] font-medium px-6 py-2 rounded-full hover:bg-[#d8e5ff] transition-colors">OK</button>
          </div>
       </div>
    </div>
  );
};
