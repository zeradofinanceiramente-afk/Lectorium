
import React, { useState } from 'react';
import { Columns, X, Check, LayoutTemplate, Square, Columns as ColumnsIcon, Layout } from 'lucide-react';
import { BaseModal } from '../../shared/BaseModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onApply: (count: number) => void;
}

export const ColumnsModal: React.FC<Props> = ({ isOpen, onClose, onApply }) => {
  const [selectedCount, setSelectedCount] = useState(1);

  if (!isOpen) return null;

  const handleApply = () => {
    onApply(selectedCount);
    onClose();
  };

  const PresetCard = ({ count, icon: Icon, label }: { count: number, icon: any, label: string }) => (
    <button
      onClick={() => setSelectedCount(count)}
      className={`
        flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all w-full
        ${selectedCount === count 
          ? 'border-brand bg-brand/10 text-brand shadow-[0_0_15px_-5px_var(--brand)]' 
          : 'border-white/10 bg-[#2c2c2c] text-gray-400 hover:border-white/30 hover:bg-[#333] hover:text-white'}
      `}
    >
      <div className="p-3 bg-black/20 rounded-lg">
        <Icon size={24} strokeWidth={selectedCount === count ? 2.5 : 1.5} />
      </div>
      <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
    </button>
  );

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Configurar Colunas"
      icon={<Columns size={20} />}
      maxWidth="max-w-lg"
      footer={
        <div className="flex justify-end gap-3 w-full">
            <button onClick={onClose} className="px-4 py-2 text-text-sec hover:text-white transition-colors text-sm">Cancelar</button>
            <button 
                onClick={handleApply} 
                className="bg-brand text-[#0b141a] px-6 py-2 rounded-full font-bold hover:brightness-110 transition-all text-sm flex items-center gap-2 shadow-lg hover:shadow-brand/20"
            >
                <Check size={16} /> Aplicar Layout
            </button>
        </div>
      }
    >
      <div className="space-y-6">
         {/* Presets Grid */}
         <div className="grid grid-cols-3 gap-4">
            <PresetCard count={1} icon={Square} label="1 Coluna" />
            <PresetCard count={2} icon={ColumnsIcon} label="2 Colunas" />
            <PresetCard count={3} icon={Layout} label="3 Colunas" />
         </div>

         {/* Visual Preview */}
         <div className="bg-[#141414] border border-white/10 rounded-xl p-6 relative overflow-hidden group">
            <div className="absolute top-3 left-3 text-[10px] text-text-sec font-bold uppercase tracking-widest flex items-center gap-2">
                <LayoutTemplate size={12} /> Pré-visualização
            </div>
            
            <div 
                className="bg-white text-[6px] text-justify p-4 rounded-sm shadow-md h-32 text-gray-800 leading-relaxed font-serif overflow-hidden opacity-90 mx-auto max-w-[80%]"
                style={{ 
                    columnCount: selectedCount, 
                    columnGap: '1.5rem',
                    columnRule: selectedCount > 1 ? '1px solid #eee' : 'none'
                }}
            >
                <p className="mb-2">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
                </p>
                <p className="mb-2">
                    Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
                </p>
                <p>
                    Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.
                </p>
            </div>
         </div>

         <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg">
            <p className="text-xs text-blue-200/80 leading-relaxed">
                <strong>Nota:</strong> As colunas serão aplicadas ao parágrafo atual ou ao texto selecionado. Para aplicar em todo o documento, selecione todo o texto (Ctrl+A).
            </p>
         </div>
      </div>
    </BaseModal>
  );
};
