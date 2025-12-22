
import React, { useState, useEffect } from 'react';
import { X, PanelTop, PanelBottom } from 'lucide-react';
import { BaseModal } from '../../shared/BaseModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialHeader?: string;
  initialFooter?: string;
  onApply: (header: string, footer: string) => void;
  activeTab?: 'header' | 'footer';
}

export const HeaderFooterModal: React.FC<Props> = ({ 
  isOpen, onClose, initialHeader = '', initialFooter = '', onApply, activeTab = 'header' 
}) => {
  const [header, setHeader] = useState(initialHeader);
  const [footer, setFooter] = useState(initialFooter);
  const [currentTab, setCurrentTab] = useState<'header' | 'footer'>(activeTab);

  useEffect(() => {
    if (isOpen) {
      setHeader(initialHeader);
      setFooter(initialFooter);
      setCurrentTab(activeTab);
    }
  }, [isOpen, initialHeader, initialFooter, activeTab]);

  const handleSave = () => {
    onApply(header, footer);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Cabeçalho e Rodapé"
      icon={currentTab === 'header' ? <PanelTop size={20} /> : <PanelBottom size={20} />}
      maxWidth="max-w-lg"
      footer={
        <div className="flex justify-end gap-3 w-full">
            <button onClick={onClose} className="px-4 py-2 text-text-sec hover:text-white transition-colors text-sm">Cancelar</button>
            <button onClick={handleSave} className="bg-brand text-[#0b141a] px-6 py-2 rounded-full font-bold hover:brightness-110 transition-all text-sm">
                Aplicar
            </button>
        </div>
      }
    >
      <div className="flex border-b border-[#444746] mb-4">
         <button 
            onClick={() => setCurrentTab('header')} 
            className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${currentTab === 'header' ? 'border-[#a8c7fa] text-[#a8c7fa]' : 'border-transparent text-gray-400 hover:text-white'}`}
         >
            <PanelTop size={16} /> Cabeçalho
         </button>
         <button 
            onClick={() => setCurrentTab('footer')} 
            className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${currentTab === 'footer' ? 'border-[#a8c7fa] text-[#a8c7fa]' : 'border-transparent text-gray-400 hover:text-white'}`}
         >
            <PanelBottom size={16} /> Rodapé
         </button>
      </div>

      <div className="space-y-4">
        {currentTab === 'header' ? (
            <div className="space-y-2 animate-in fade-in slide-in-from-left-2">
                <label className="text-sm text-gray-300">Texto do Cabeçalho</label>
                <textarea 
                    value={header}
                    onChange={(e) => setHeader(e.target.value)}
                    className="w-full h-32 bg-[#2c2c2c] border border-gray-600 rounded-xl p-3 text-sm text-white focus:border-[#a8c7fa] outline-none resize-none custom-scrollbar leading-relaxed"
                    placeholder="Digite o texto que aparecerá no topo de todas as páginas..."
                />
                <p className="text-xs text-text-sec">Este texto será aplicado a todas as páginas da seção atual.</p>
            </div>
        ) : (
            <div className="space-y-2 animate-in fade-in slide-in-from-right-2">
                <label className="text-sm text-gray-300">Texto do Rodapé</label>
                <textarea 
                    value={footer}
                    onChange={(e) => setFooter(e.target.value)}
                    className="w-full h-32 bg-[#2c2c2c] border border-gray-600 rounded-xl p-3 text-sm text-white focus:border-[#a8c7fa] outline-none resize-none custom-scrollbar leading-relaxed"
                    placeholder="Digite o texto que aparecerá no rodapé de todas as páginas..."
                />
                <p className="text-xs text-text-sec">Este texto será aplicado a todas as páginas da seção atual.</p>
            </div>
        )}
      </div>
    </BaseModal>
  );
};
