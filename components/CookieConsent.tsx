
import React, { useState, useEffect } from 'react';
import { ShieldCheck, Cookie, Check, Info, Lock } from 'lucide-react';

export const CookieConsent: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Check if user has already consented
    const consent = localStorage.getItem('cookie_consent_accepted');
    if (!consent) {
      setIsVisible(true);
      // Desabilita scroll no body enquanto o modal estiver ativo
      document.body.style.overflow = 'hidden';
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('cookie_consent_accepted', 'true');
    setIsVisible(false);
    // Reabilita scroll
    document.body.style.overflow = 'unset';
  };

  const getStoredItemsAudit = () => {
    const items = [
      { key: 'app-theme', desc: 'Preferência de tema visual', type: 'Preferência' },
      { key: 'drive_access_token', desc: 'Token de acesso ao Google Drive', type: 'Autenticação' },
      { key: 'firebase:authUser:*', desc: 'Sessão de login do Firebase', type: 'Autenticação' },
      { key: 'IndexedDB (offlineFiles)', desc: 'Cache de arquivos PDF/Docx', type: 'Essencial' },
    ];
    return items;
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-500">
      <div className="max-w-md w-full bg-[#1e1e1e] border border-brand/30 rounded-3xl shadow-2xl p-8 relative overflow-hidden text-center">
        
        {/* Decorative Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-brand/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col items-center">
          <div className="w-16 h-16 bg-brand/10 rounded-full flex items-center justify-center text-brand mb-6 border border-brand/20 shadow-[0_0_15px_rgba(74,222,128,0.1)]">
            <Lock size={32} />
          </div>

          <h3 className="text-2xl font-bold text-white mb-3">
            Acesso Restrito
          </h3>
          
          <p className="text-gray-300 leading-relaxed mb-6 text-sm">
            Para garantir a segurança dos seus data e o funcionamento offline do Lectorium, precisamos armazenar informações no seu dispositivo.
            <br/><br/>
            <span className="opacity-70">Você só poderá interagir com o Workspace após concordar.</span>
          </p>

          <div className="w-full space-y-3">
            <button 
              onClick={handleAccept}
              className="w-full py-4 rounded-xl bg-brand text-[#0b141a] font-bold text-base hover:brightness-110 transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-brand/20 hover:scale-[1.02] active:scale-95"
            >
              <Check size={20} />
              Concordar e Acessar
            </button>

            <button 
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-gray-500 hover:text-gray-300 flex items-center justify-center gap-1 transition-colors mt-4 pb-2"
            >
              <Info size={12} />
              {showDetails ? 'Ocultar dados técnicos' : 'Ver o que será salvo'}
            </button>
          </div>

          {showDetails && (
            <div className="mt-4 w-full bg-[#141414] rounded-xl p-4 border border-[#333] text-left animate-in slide-in-from-top-2">
              <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                {getStoredItemsAudit().map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start text-xs border-b border-[#333] pb-2 last:border-0 last:pb-0">
                    <div>
                      <span className="font-mono text-brand block mb-0.5">{item.key}</span>
                      <span className="text-gray-400">{item.desc}</span>
                    </div>
                    <span className="px-2 py-1 rounded bg-[#2c2c2c] text-gray-300 text-[9px] uppercase font-bold tracking-wider">
                      {item.type}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-[#333] text-[10px] text-gray-500 text-center">
                 Não utilizamos cookies de rastreamento ou publicidade.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
