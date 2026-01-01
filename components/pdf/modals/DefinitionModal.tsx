
import React, { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';

interface DefinitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  definition: any;
}

export const DefinitionModal: React.FC<DefinitionModalProps> = ({
  isOpen,
  onClose,
  definition
}) => {
  const [isCopied, setIsCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!definition) return;
    const textToCopy = `${definition.word}\n\n${definition.meanings.join('\n')}`;
    navigator.clipboard.writeText(textToCopy);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#1e1e1e] p-6 rounded-2xl max-w-md w-full relative border border-white/10 shadow-2xl">
              <div className="flex justify-between items-start mb-4">
                 <h3 className="text-xl font-bold text-brand">{definition?.word || "Carregando..."}</h3>
                 <div className="flex items-center gap-1">
                    <button
                        onClick={handleCopy}
                        className="p-2 text-text-sec hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                        title="Copiar definição"
                    >
                        {isCopied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                    </button>
                    <button onClick={onClose} className="p-2 text-text-sec hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                        <X size={20}/>
                    </button>
                 </div>
              </div>
              
              <div className="space-y-3 text-sm max-h-[60vh] overflow-y-auto custom-scrollbar">
                 {definition?.meanings.map((m: string, i: number) => (
                     <p key={i} className="text-gray-300 leading-relaxed bg-black/20 p-3 rounded-lg border border-white/5">{m}</p>
                 ))}
              </div>
              
              {definition?.source && (
                  <div className="mt-4 pt-3 border-t border-white/5 text-[10px] text-text-sec flex justify-between">
                      <span>Fonte: {definition.source}</span>
                      {definition.url && <a href={definition.url} target="_blank" rel="noreferrer" className="hover:text-brand underline">Ver original</a>}
                  </div>
              )}
          </div>
      </div>
  );
};
