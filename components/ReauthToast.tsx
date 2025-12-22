import React from 'react';
import { RefreshCw, AlertCircle, X } from 'lucide-react';

interface ReauthToastProps {
  onReauth: () => void;
  onClose: () => void;
}

const ReauthToast: React.FC<ReauthToastProps> = ({ onReauth, onClose }) => {
  return (
    <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-right-full">
      <div className="bg-[#1e1e2e] border-l-4 border-yellow-500 p-4 rounded-lg shadow-2xl flex items-center gap-4 max-w-sm">
        <div className="bg-yellow-500/10 p-2 rounded-full">
          <AlertCircle className="text-yellow-500" size={24} />
        </div>
        
        <div className="flex-1">
          <h3 className="text-sm font-bold text-white">Sessão Expirada</h3>
          <p className="text-xs text-gray-400">O acesso ao Google Drive expirou. Reconecte para salvar seu progresso.</p>
        </div>

        <div className="flex flex-col gap-2">
          <button 
            onClick={onReauth}
            className="flex items-center gap-1 bg-yellow-500 hover:bg-yellow-600 text-[#1e1e2e] px-3 py-1.5 rounded-md text-xs font-bold transition-colors shadow-lg"
          >
            <RefreshCw size={14} />
            Reconectar
          </button>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-[10px] text-center uppercase tracking-wider">
            Depois
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReauthToast;