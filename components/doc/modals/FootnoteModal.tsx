
import React, { useState } from 'react';
import { BaseModal } from '../../shared/BaseModal';
import { MessageSquareQuote, Check } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (content: string) => void;
}

export const FootnoteModal: React.FC<Props> = ({ isOpen, onClose, onInsert }) => {
  const [content, setContent] = useState('');

  if (!isOpen) return null;

  const handleSubmit = () => {
    onInsert(content);
    setContent('');
    onClose();
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Inserir Nota de Rodapé"
      icon={<MessageSquareQuote size={20} />}
      maxWidth="max-w-md"
      footer={
        <div className="flex justify-end gap-2 w-full">
            <button onClick={onClose} className="px-4 py-2 text-text-sec hover:text-white transition-colors text-sm">Cancelar</button>
            <button onClick={handleSubmit} className="bg-brand text-[#0b141a] px-6 py-2 rounded-full font-bold hover:brightness-110 transition-all text-sm flex items-center gap-2">
                <Check size={16} /> Inserir
            </button>
        </div>
      }
    >
      <div className="space-y-4">
        <textarea 
            autoFocus
            className="w-full h-32 bg-[#2c2c2c] border border-gray-600 rounded-xl p-3 text-sm text-white focus:border-brand outline-none resize-none custom-scrollbar leading-relaxed placeholder:text-gray-500"
            placeholder="Digite o texto da nota..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
                if(e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                }
            }}
        />
        <p className="text-xs text-text-sec">
            A numeração será ajustada automaticamente de acordo com a posição no texto.
        </p>
      </div>
    </BaseModal>
  );
};
