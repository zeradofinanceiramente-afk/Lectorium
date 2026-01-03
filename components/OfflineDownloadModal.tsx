
import React, { useState } from 'react';
import { X, Download, Database, Check, Server, Calculator, FileText, Trash2, HardDrive } from 'lucide-react';
import { AVAILABLE_RESOURCES, ResourceCategory } from '../services/offlineService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selected: ResourceCategory[]) => void;
  onClear: () => void;
  currentSize?: string | null;
  isDownloading?: boolean;
  progress?: number;
}

const ICONS: Record<string, React.ElementType> = {
  'core': Server,
  'pdf_office': FileText,
  'tools': Calculator
};

export const OfflineDownloadModal: React.FC<Props> = ({ 
  isOpen, onClose, onConfirm, onClear, currentSize, isDownloading = false, progress = 0 
}) => {
  const [selected, setSelected] = useState<Set<ResourceCategory>>(new Set(['core', 'pdf_office', 'tools']));

  if (!isOpen) return null;

  const toggleCategory = (id: ResourceCategory, required?: boolean) => {
    if (required) return;
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelected(next);
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selected));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-surface border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-text-sec hover:text-text"><X size={20}/></button>
        
        <div className="flex items-center gap-3 mb-4 text-brand">
          <div className="bg-brand/10 p-2 rounded-lg">
            <Download size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-text">Recursos Offline</h3>
            {currentSize && (
              <p className="text-xs text-brand font-bold flex items-center gap-1 mt-0.5">
                <HardDrive size={10} /> Em uso: {currentSize}
              </p>
            )}
          </div>
        </div>

        <p className="text-text-sec text-sm mb-6 leading-relaxed">
          Otimize o armazenamento escolhendo o que baixar. 
        </p>

        {isDownloading ? (
          <div className="py-8 text-center space-y-4">
             <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-brand transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
             </div>
             <p className="text-sm font-bold text-white animate-pulse">Baixando recursos... {progress}%</p>
             <p className="text-xs text-text-sec">Por favor, aguarde.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 mb-6 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
              {AVAILABLE_RESOURCES.map((group) => {
                const Icon = ICONS[group.id] || Database;
                const isSelected = selected.has(group.id) || group.required;
                
                return (
                  <div 
                    key={group.id}
                    onClick={() => toggleCategory(group.id, group.required)}
                    className={`
                      flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none
                      ${isSelected 
                        ? 'bg-brand/5 border-brand/30' 
                        : 'bg-[#1a1a1a] border-border hover:border-gray-600'}
                      ${group.required ? 'opacity-80 cursor-default' : ''}
                    `}
                  >
                    <div className={`p-2 rounded-lg shrink-0 transition-colors ${isSelected ? 'bg-brand text-bg' : 'bg-[#333] text-gray-500'}`}>
                      {isSelected ? <Check size={16} /> : <Icon size={16} />}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <span className={`font-bold text-sm ${isSelected ? 'text-text' : 'text-text-sec'}`}>
                          {group.label}
                        </span>
                        {group.required && (
                          <span className="text-[10px] uppercase bg-[#333] text-gray-400 px-1.5 py-0.5 rounded font-bold">Obrigatório</span>
                        )}
                      </div>
                      <p className="text-xs text-text-sec leading-relaxed">{group.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-2">
              <button 
                onClick={handleConfirm}
                className="w-full py-3 bg-brand text-bg rounded-xl font-bold text-sm hover:brightness-110 transition-all flex items-center justify-center gap-2"
              >
                <Download size={18} />
                {currentSize ? 'Atualizar Recursos' : 'Baixar Tudo'}
              </button>
              
              {currentSize && (
                <button 
                  onClick={() => { if(confirm('Isso apagará os arquivos do sistema para uso offline. Continuar?')) onClear(); }}
                  className="w-full py-2 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl font-bold text-xs hover:bg-red-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <Trash2 size={14} />
                  Remover Recursos Offline
                </button>
              )}
            </div>
            
            <p className="text-[10px] text-center text-text-sec mt-3 opacity-60">
              Download total estimado: ~5MB. Recomendado usar Wi-Fi.
            </p>
          </>
        )}
      </div>
    </div>
  );
};