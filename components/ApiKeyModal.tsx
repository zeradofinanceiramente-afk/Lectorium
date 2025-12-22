
import React, { useState, useEffect } from 'react';
import { X, Key, Check, ShieldCheck, Trash2, ExternalLink } from 'lucide-react';
import { BaseModal } from './shared/BaseModal';
import { getStoredApiKey, saveApiKey, removeApiKey } from '../utils/apiKeyUtils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const ApiKeyModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [key, setKey] = useState('');
  const [savedKey, setSavedKey] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const stored = getStoredApiKey();
      setSavedKey(stored);
      setKey('');
    }
  }, [isOpen]);

  const handleSave = () => {
    if (!key.trim()) return;
    saveApiKey(key);
    setSavedKey(key);
    setKey('');
    onClose();
  };

  const handleRemove = () => {
    removeApiKey();
    setSavedKey(null);
  };

  if (!isOpen) return null;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Configuração de IA"
      icon={<Key size={20} />}
      maxWidth="max-w-md"
    >
      <div className="space-y-6">
        <div className="bg-brand/10 border border-brand/20 p-4 rounded-xl">
          <h4 className="text-sm font-bold text-brand flex items-center gap-2 mb-2">
            <ShieldCheck size={16} /> Privacidade & Performance
          </h4>
          <p className="text-xs text-text-sec leading-relaxed">
            Para analisar documentos grandes sem limites e com total privacidade, utilize sua própria chave da API do Google Gemini.
            <br /><br />
            <strong>Sua chave é salva apenas no armazenamento local do seu navegador.</strong> Ela nunca é enviada para nossos servidores.
          </p>
        </div>

        {savedKey ? (
          <div className="bg-[#2c2c2c] p-4 rounded-xl border border-green-500/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-500">
                <Check size={16} />
              </div>
              <div>
                <div className="text-sm font-bold text-white">Chave Ativa</div>
                <div className="text-xs text-text-sec">••••••••••••••••••••{savedKey.slice(-4)}</div>
              </div>
            </div>
            <button 
              onClick={handleRemove}
              className="p-2 hover:bg-red-500/10 text-text-sec hover:text-red-400 rounded-lg transition-colors"
              title="Remover Chave"
            >
              <Trash2 size={18} />
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-300">Sua API Key do Gemini</label>
            <input 
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Cole sua chave aqui (Ex: AIzaSy...)"
              className="w-full bg-[#2c2c2c] border border-gray-600 rounded-xl p-3 text-sm text-white focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all"
            />
            <div className="flex justify-end">
               <a 
                 href="https://aistudio.google.com/app/apikey" 
                 target="_blank" 
                 rel="noreferrer"
                 className="text-xs text-brand hover:underline flex items-center gap-1"
               >
                 Obter chave gratuitamente <ExternalLink size={10} />
               </a>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          {savedKey ? (
             <button onClick={onClose} className="px-6 py-2 bg-surface border border-border rounded-xl text-sm hover:bg-white/5 transition-colors">
               Fechar
             </button>
          ) : (
             <button 
                onClick={handleSave} 
                disabled={!key.trim()}
                className="w-full bg-brand text-[#0b141a] font-bold py-3 rounded-xl hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
             >
               Salvar e Ativar
             </button>
          )}
        </div>
      </div>
    </BaseModal>
  );
};
