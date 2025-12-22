
import React, { useState } from 'react';
import { X, Users, Link, ExternalLink, Check, Copy, Lock, Info } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  isLocal: boolean;
}

export const ShareModal: React.FC<Props> = ({ isOpen, onClose, fileId, fileName, isLocal }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Gera o link direto para o app com os parâmetros necessários para abrir o arquivo
  const appUrl = `${window.location.origin}/?mode=viewer&fileId=${fileId}&fileName=${encodeURIComponent(fileName)}`;
  
  // Link para a interface de compartilhamento do Google Drive
  const driveShareUrl = `https://drive.google.com/file/d/${fileId}/share`;

  const handleCopy = () => {
    navigator.clipboard.writeText(appUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
       <div className="bg-[#1e1e1e] text-[#e3e3e3] rounded-3xl shadow-2xl p-6 w-full max-w-lg relative animate-in zoom-in-95 border border-[#444746]">
          <div className="flex justify-between items-center mb-6 border-b border-[#444746] pb-4">
            <h3 className="text-xl font-bold flex items-center gap-2">
                <Users size={20} className="text-brand" /> 
                Convidar Colaboradores
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors"><X size={20}/></button>
          </div>

          {isLocal ? (
              <div className="flex flex-col items-center text-center py-8 px-4">
                  <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mb-4">
                      <Lock size={32} />
                  </div>
                  <h4 className="text-lg font-bold mb-2">Arquivo Local</h4>
                  <p className="text-sm text-text-sec">
                      Este arquivo está salvo apenas no seu navegador. Para colaborar com outras pessoas, primeiro salve-o no Google Drive.
                  </p>
                  <button onClick={onClose} className="mt-6 bg-[#333] hover:bg-[#444] text-white px-6 py-2 rounded-full font-medium transition-colors">
                      Entendi
                  </button>
              </div>
          ) : (
              <div className="space-y-8">
                 {/* Passo 1: Permissões do Drive */}
                 <div className="space-y-3">
                     <div className="flex items-center gap-2 text-sm font-bold text-brand uppercase tracking-wider">
                        <span className="w-5 h-5 rounded-full bg-brand text-[#0b141a] flex items-center justify-center text-xs">1</span>
                        Conceder Permissão
                     </div>
                     <p className="text-sm text-gray-400 leading-relaxed">
                        O colaborador precisa ter permissão de edição no Google Drive para salvar as alterações.
                     </p>
                     <a 
                        href={driveShareUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex items-center justify-between w-full bg-[#2c2c2c] hover:bg-[#353535] border border-gray-600 rounded-xl p-4 transition-all group"
                     >
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-500/20 p-2 rounded-lg text-blue-400">
                                <Lock size={20} />
                            </div>
                            <div className="text-left">
                                <div className="font-medium text-gray-200 group-hover:text-white">Gerenciar Acesso no Drive</div>
                                <div className="text-xs text-gray-500">Adicionar e-mail do colaborador</div>
                            </div>
                        </div>
                        <ExternalLink size={18} className="text-gray-500 group-hover:text-white" />
                     </a>
                 </div>

                 <div className="w-full h-px bg-[#444746]"></div>

                 {/* Passo 2: Link do App */}
                 <div className="space-y-3">
                     <div className="flex items-center gap-2 text-sm font-bold text-brand uppercase tracking-wider">
                        <span className="w-5 h-5 rounded-full bg-brand text-[#0b141a] flex items-center justify-center text-xs">2</span>
                        Enviar Link do Editor
                     </div>
                     <p className="text-sm text-gray-400 leading-relaxed">
                        Envie este link para editarem juntos neste aplicativo com recursos avançados.
                     </p>
                     
                     <div className="flex gap-2">
                        <div className="flex-1 bg-[#0a0a0a] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 font-mono truncate select-all">
                            {appUrl}
                        </div>
                        <button 
                            onClick={handleCopy}
                            className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all ${copied ? 'bg-green-500 text-white' : 'bg-brand text-[#0b141a] hover:brightness-110'}`}
                        >
                            {copied ? <Check size={16} /> : <Copy size={16} />}
                            {copied ? 'Copiado!' : 'Copiar'}
                        </button>
                     </div>
                 </div>

                 {/* Dica de Colaboração */}
                 <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex gap-3 items-start">
                    <Info size={18} className="text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-200/80">
                        <strong className="text-blue-200">Colaboração em Tempo Real:</strong> Se ambos abrirem este link ao mesmo tempo, vocês verão o cursor um do outro e as edições aparecerão instantaneamente.
                    </p>
                 </div>
              </div>
          )}
       </div>
    </div>
  );
};
