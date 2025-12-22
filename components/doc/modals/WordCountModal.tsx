
import React from 'react';
import { Type } from 'lucide-react';
import { BaseModal } from '../../shared/BaseModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  stats: { words: number; chars: number; charsNoSpace: number };
}

export const WordCountModal: React.FC<Props> = ({ isOpen, onClose, stats }) => {
  return (
    <BaseModal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Contagem de Palavras" 
      icon={<Type size={20} />}
      maxWidth="max-w-sm"
      footer={<button onClick={onClose} className="w-full bg-brand text-bg font-bold py-2 rounded-xl">OK</button>}
    >
      <div className="space-y-4">
          <div className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-text-sec">Palavras</span>
              <span className="text-2xl font-mono font-bold">{stats.words}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-text-sec">Caracteres</span>
              <span className="text-2xl font-mono font-bold">{stats.chars}</span>
          </div>
          <div className="flex justify-between items-center py-2">
              <span className="text-text-sec">Caracteres (sem espaço)</span>
              <span className="text-2xl font-mono font-bold">{stats.charsNoSpace}</span>
          </div>
      </div>
    </BaseModal>
  );
};
