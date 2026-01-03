
import React, { useState } from 'react';
import { Sparkles, X, BrainCircuit, AlignLeft, ArrowRight } from 'lucide-react';
import { BaseModal } from '../shared/BaseModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (text: string) => void;
}

export const MindMapGeneratorModal: React.FC<Props> = ({ isOpen, onClose, onGenerate }) => {
  const [inputText, setInputText] = useState('');

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!inputText.trim()) return;
    onGenerate(inputText);
    setInputText('');
    onClose();
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Gerar Mapa Mental com IA"
      icon={<Sparkles size={20} />}
      maxWidth="max-w-lg"
      footer={
        <div className="flex justify-end gap-3 w-full">
            <button 
                onClick={onClose} 
                className="px-4 py-2 text-text-sec hover:text-white transition-colors text-sm"
            >
                Cancelar
            </button>
            <button 
                onClick={handleSubmit} 
                disabled={!inputText.trim()}
                className="bg-purple-600 text-white px-6 py-2 rounded-xl font-bold hover:brightness-110 transition-all text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-900/20"
            >
                <BrainCircuit size={16} /> Gerar Estrutura
            </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-xl">
            <h4 className="text-sm font-bold text-purple-200 flex items-center gap-2 mb-2">
                <BrainCircuit size={16} /> Contexto Acadêmico
            </h4>
            <p className="text-xs text-purple-200/70 leading-relaxed">
                A IA analisará seu texto para identificar conceitos centrais e conexões.
                Você pode colar anotações do PDF, um resumo, ou apenas um tópico (ex: "Revolução Francesa").
            </p>
        </div>

        <div className="space-y-2">
            <label className="text-xs font-bold text-text-sec uppercase tracking-wider flex items-center gap-2">
                <AlignLeft size={14} /> Seu Conteúdo
            </label>
            <textarea 
                autoFocus
                className="w-full h-48 bg-[#2c2c2c] border border-gray-600 rounded-xl p-4 text-sm text-white focus:border-purple-500 outline-none resize-none custom-scrollbar leading-relaxed placeholder:text-gray-500"
                placeholder="Cole aqui suas anotações, fichamento ou descreva o tema..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.ctrlKey) {
                        e.preventDefault();
                        handleSubmit();
                    }
                }}
            />
            <div className="flex justify-between items-center px-1">
                <span className="text-[10px] text-text-sec">
                    {inputText.length} caracteres
                </span>
                <span className="text-[10px] text-text-sec flex items-center gap-1">
                    <span className="bg-[#333] px-1.5 py-0.5 rounded border border-[#444] font-mono">Ctrl + Enter</span> para enviar
                </span>
            </div>
        </div>
      </div>
    </BaseModal>
  );
};
