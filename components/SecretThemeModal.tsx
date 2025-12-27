
import React, { useState, useEffect } from 'react';
import { Terminal, Upload, Save, X, Cpu, AlertTriangle, CheckCircle } from 'lucide-react';
import { BaseModal } from './shared/BaseModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const SecretThemeModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [jsonContent, setJsonContent] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');

  // Carrega tema existente ao abrir
  useEffect(() => {
    if (isOpen) {
      const existing = localStorage.getItem('god_mode_theme');
      if (existing) {
        setJsonContent(existing);
      } else {
        // Template padrão
        setJsonContent(JSON.stringify({
          name: "Custom Theme",
          vars: {
            "--bg-main": "#000000",
            "--bg-surface": "#111111",
            "--bg-sidebar": "#050505",
            "--text-main": "#ffffff",
            "--text-sec": "#888888",
            "--border-color": "#333333",
            "--brand": "#00ff00",
            "--brand-to": "#00cc00"
          }
        }, null, 2));
      }
    }
  }, [isOpen]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        // Validação básica de JSON
        JSON.parse(text);
        setJsonContent(text);
        setStatus('idle');
      } catch (err) {
        setStatus('error');
        setStatusMsg("Arquivo JSON inválido/corrompido.");
      }
    };
    reader.readAsText(file);
  };

  const applyTheme = () => {
    try {
      const parsed = JSON.parse(jsonContent);
      const root = document.documentElement;

      if (!parsed.vars) throw new Error("Objeto 'vars' não encontrado no JSON.");

      // Injeta variáveis CSS
      Object.entries(parsed.vars).forEach(([key, value]) => {
        root.style.setProperty(key, value as string);
      });

      // Salva persistência
      localStorage.setItem('god_mode_theme', jsonContent);
      localStorage.setItem('app-theme', 'god_mode'); // Marca flag especial

      setStatus('success');
      setStatusMsg(`Protocolo "${parsed.name || 'Desconhecido'}" ativado.`);
      
      // Feedback visual tático
      setTimeout(() => onClose(), 1500);

    } catch (e: any) {
      setStatus('error');
      setStatusMsg(`Falha na injeção: ${e.message}`);
    }
  };

  const clearTheme = () => {
    localStorage.removeItem('god_mode_theme');
    localStorage.setItem('app-theme', 'forest'); // Volta ao padrão
    window.location.reload(); // Recarrega para limpar CSS vars
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-2xl bg-[#0a0a0a] border border-green-500/30 rounded-lg shadow-[0_0_50px_-10px_rgba(0,255,0,0.1)] flex flex-col overflow-hidden font-mono">
        
        {/* Terminal Header */}
        <div className="bg-[#111] border-b border-green-900/30 p-3 flex justify-between items-center select-none">
          <div className="flex items-center gap-2 text-green-500 text-xs tracking-widest uppercase">
            <Terminal size={14} />
            <span>OPERATOR: ZERO // THEME INJECTOR</span>
          </div>
          <button onClick={onClose} className="text-green-900 hover:text-green-500 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Status Display */}
          <div className={`border p-3 rounded text-xs flex items-center gap-3 ${
            status === 'error' ? 'border-red-500/30 bg-red-900/10 text-red-400' :
            status === 'success' ? 'border-green-500/30 bg-green-900/10 text-green-400' :
            'border-gray-800 bg-black text-gray-500'
          }`}>
            {status === 'error' ? <AlertTriangle size={14}/> : 
             status === 'success' ? <CheckCircle size={14}/> : 
             <Cpu size={14}/>}
            <span>{statusMsg || "Aguardando payload..."}</span>
          </div>

          {/* Editor Area */}
          <div className="relative group">
            <textarea
              value={jsonContent}
              onChange={(e) => setJsonContent(e.target.value)}
              className="w-full h-64 bg-[#050505] border border-gray-800 rounded p-4 text-xs text-gray-300 font-mono focus:border-green-500/50 focus:text-green-100 outline-none resize-none custom-scrollbar leading-relaxed"
              spellCheck={false}
            />
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <label className="cursor-pointer bg-[#222] hover:bg-[#333] text-white px-3 py-1 rounded text-[10px] flex items-center gap-2 border border-gray-700">
                    <Upload size={10} /> Upload JSON
                    <input type="file" className="hidden" accept=".json" onChange={handleFileUpload} />
                </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center pt-2">
            <button 
                onClick={clearTheme}
                className="text-xs text-red-900 hover:text-red-500 underline decoration-dotted underline-offset-4 transition-colors"
            >
                Purge System (Reset)
            </button>
            <div className="flex gap-3">
                <button onClick={onClose} className="px-4 py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors">
                    Abort
                </button>
                <button 
                    onClick={applyTheme}
                    className="px-6 py-2 bg-green-900/20 border border-green-500/50 text-green-400 hover:bg-green-500 hover:text-black rounded text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 shadow-[0_0_15px_-5px_rgba(0,255,0,0.3)]"
                >
                    <Save size={14} /> Execute Patch
                </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
