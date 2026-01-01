
import React from 'react';
import { X, Download, Copy, AlertTriangle, CloudOff } from 'lucide-react';

interface SaveDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (mode: 'local' | 'overwrite' | 'copy') => void;
  isOffline: boolean;
}

export const SaveDocumentModal: React.FC<SaveDocumentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  isOffline
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#1e1e1e] border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-text-sec hover:text-text"><X size={20}/></button>
        <h3 className="text-xl font-bold mb-4 text-white">Salvar Arquivo</h3>
        <div className="space-y-3">
          <button onClick={() => onSave('local')} className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-transparent hover:border-brand/50 hover:bg-white/10 text-left transition-all group">
             <div className="bg-black border border-white/10 text-text p-2.5 rounded-lg group-hover:text-brand transition-colors"><Download size={20}/></div>
             <div><div className="font-bold text-gray-200 group-hover:text-white">Fazer Download</div><div className="text-xs text-gray-500">Baixar cópia no dispositivo</div></div>
          </button>
          <button onClick={() => onSave('copy')} className="w-full flex items-center gap-4 p-4 rounded-xl bg-brand/5 border border-brand/20 hover:bg-brand/10 text-left transition-all group">
            <div className="bg-brand/10 text-brand p-2.5 rounded-lg"><Copy size={20}/></div>
            <div><div className="font-bold text-brand">Salvar como Cópia</div><div className="text-xs text-text-sec opacity-80">Criar novo arquivo no Drive</div></div>
          </button>
          <button onClick={() => onSave('overwrite')} className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-transparent hover:border-red-500/50 hover:bg-red-500/10 text-left transition-all group">
            <div className="bg-black text-red-500 p-2.5 rounded-lg border border-white/10"><AlertTriangle size={20}/></div>
            <div><div className="font-bold text-gray-200 group-hover:text-red-200">Substituir Original</div><div className="text-xs text-gray-500">Sobrescrever o arquivo existente</div></div>
          </button>
        </div>
        {isOffline && <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center gap-2 text-xs text-yellow-500"><CloudOff size={16} /><span>Modo Offline: Alterações serão sincronizadas quando online.</span></div>}
      </div>
    </div>
  );
};
