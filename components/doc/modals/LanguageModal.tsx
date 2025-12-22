
import React from 'react';
import { X, Globe, Check } from 'lucide-react';

interface Props {
  isOpen: boolean;
  currentLanguage: string;
  onSelect: (lang: string) => void;
  onClose: () => void;
}

const LANGUAGES = [
  { code: 'pt-BR', name: 'Português (Brasil)' },
  { code: 'en-US', name: 'English (United States)' },
  { code: 'es-ES', name: 'Español' },
  { code: 'fr-FR', name: 'Français' },
  { code: 'de-DE', name: 'Deutsch' },
];

export const LanguageModal: React.FC<Props> = ({ isOpen, currentLanguage, onSelect, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
       <div className="bg-surface border border-border rounded-xl shadow-2xl p-6 w-full max-w-sm relative animate-in zoom-in-95">
          <button onClick={onClose} className="absolute top-4 right-4 text-text-sec hover:text-text"><X size={20}/></button>
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Globe size={20} className="text-brand"/> Idioma do Documento</h3>
          
          <div className="space-y-2">
             {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => { onSelect(lang.code); onClose(); }}
                  className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${
                    currentLanguage === lang.code 
                      ? 'bg-brand/10 border border-brand/20 text-brand' 
                      : 'hover:bg-white/5 border border-transparent text-text'
                  }`}
                >
                   <span>{lang.name}</span>
                   {currentLanguage === lang.code && <Check size={16} />}
                </button>
             ))}
          </div>
          
          <div className="mt-4 pt-4 border-t border-border text-xs text-text-sec">
             Isso afetará a verificação ortográfica do editor.
          </div>
       </div>
    </div>
  );
};
