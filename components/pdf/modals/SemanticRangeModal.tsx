import React, { useState, useEffect } from 'react';
import { Layers, Check, AlertTriangle, Info, BrainCircuit, Languages } from 'lucide-react';
import { BaseModal } from '../../shared/BaseModal';
import { useGlobalContext } from '../../../context/GlobalContext';
import { usePdfContext } from '../../../context/PdfContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  numPages: number;
  currentPage: number;
  mode: 'single' | 'batch';
}

const MAX_BATCH_SIZE = 50;

const LANGUAGES = [
    { code: 'pt-BR', name: 'Português' },
    { code: 'en-US', name: 'Inglês' },
    { code: 'es', name: 'Espanhol' },
    { code: 'fr', name: 'Francês' },
    { code: 'de', name: 'Alemão' },
    { code: 'it', name: 'Italiano' },
];

export const SemanticRangeModal: React.FC<Props> = ({ 
  isOpen, onClose, numPages, currentPage, mode
}) => {
  const [startPage, setStartPage] = useState(currentPage);
  const [endPage, setEndPage] = useState(currentPage);
  
  // Translation State
  const [isTranslationEnabled, setIsTranslationEnabled] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState('pt-BR');
  
  const { startGlobalOcr, isOcrRunning, addNotification } = useGlobalContext();
  const { fileId, currentBlobRef } = usePdfContext();

  // Reset e Configuração Inicial baseada no Modo
  useEffect(() => {
    if (isOpen) {
        setStartPage(currentPage);
        if (mode === 'single') {
            setEndPage(currentPage);
        } else {
            setEndPage(Math.min(currentPage + 4, numPages));
        }
        // Reset tradução
        setIsTranslationEnabled(false);
    }
  }, [isOpen, currentPage, mode, numPages]);

  const handleStartSemanticBatch = () => {
    let s = Math.max(1, Math.min(startPage, numPages));
    let e = Math.max(1, Math.min(endPage, numPages));
    if (s > e) { const temp = s; s = e; e = temp; }

    const count = e - s + 1;

    if (count > MAX_BATCH_SIZE) {
        alert(`Por segurança técnica e limites da API, processamos no máximo ${MAX_BATCH_SIZE} páginas por vez.\n\nPor favor, ajuste o intervalo.`);
        return;
    }

    const blob = currentBlobRef.current;
    
    if (blob && fileId) {
        // Usa a estrutura de OCR Global mas com flag de 'semantic'
        // Passamos um callback para injetar os resultados no contexto assim que prontos
        const langParam = isTranslationEnabled ? LANGUAGES.find(l => l.code === targetLanguage)?.name : undefined;
        
        startGlobalOcr(fileId, "Semantic Batch", blob, s, e, langParam);
        
        onClose();
    } else {
        addNotification("Documento não disponível.", "error");
    }
  };

  if (!isOpen) return null;

  const isBatch = mode === 'batch';

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={isBatch ? "Análise em Lote (Batch)" : "Analisar Página Atual"}
      icon={<BrainCircuit size={20} />}
      maxWidth="max-w-sm"
      footer={
        <div className="flex gap-2 justify-end w-full">
            <button onClick={onClose} className="px-4 py-2 text-text-sec hover:text-white transition-colors text-sm">Cancelar</button>
            <button 
                onClick={handleStartSemanticBatch} 
                disabled={isOcrRunning}
                className={`bg-purple-600 text-white px-6 py-2 rounded-xl font-bold hover:brightness-110 transition-all text-sm flex items-center gap-2 ${isOcrRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <Check size={16} /> {isOcrRunning ? 'Ocupado' : (isTranslationEnabled ? (isBatch ? 'Traduzir Lote' : 'Traduzir Página') : 'Iniciar Processamento')}
            </button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-xl">
            <p className="text-xs text-purple-200 leading-relaxed font-medium">
                O Gemini Vision analisará o conteúdo para extrair <strong>Markdown estruturado</strong> e layout preciso.
            </p>
        </div>
        
        {isBatch && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-lg flex gap-3 items-start">
                <AlertTriangle size={16} className="text-yellow-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-yellow-500/90 leading-tight">
                    <strong>Limite de Segurança:</strong> Máximo de {MAX_BATCH_SIZE} páginas por lote para evitar bloqueios da API (Erro 429).
                </p>
            </div>
        )}

        <div className="space-y-4">
            <h4 className="text-sm font-bold text-white">Intervalo de Páginas</h4>
            <div className="flex items-center gap-4">
                <div className="flex-1 space-y-1">
                    <label className="text-xs text-text-sec">De</label>
                    <input 
                        type="number" 
                        min="1" 
                        max={numPages}
                        value={startPage}
                        onChange={(e) => setStartPage(parseInt(e.target.value))}
                        className="w-full bg-[#2c2c2c] border border-gray-600 rounded-lg p-2.5 text-sm text-white focus:border-brand outline-none text-center"
                    />
                </div>
                <div className="pt-5 text-text-sec">-</div>
                <div className="flex-1 space-y-1">
                    <label className="text-xs text-text-sec">Até</label>
                    <input 
                        type="number" 
                        min="1" 
                        max={numPages}
                        value={endPage}
                        onChange={(e) => setEndPage(parseInt(e.target.value))}
                        className="w-full bg-[#2c2c2c] border border-gray-600 rounded-lg p-2.5 text-sm text-white focus:border-brand outline-none text-center"
                    />
                </div>
            </div>
            {(endPage - startPage + 1) > MAX_BATCH_SIZE && (
                <p className="text-xs text-red-400 text-center font-bold">
                    Intervalo muito grande ({endPage - startPage + 1} pgs). Reduza para {MAX_BATCH_SIZE}.
                </p>
            )}
        </div>

        {/* Translation Toggle */}
        <div className="pt-4 border-t border-[#333] space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Languages size={16} className="text-blue-400" />
                    <span className="text-sm font-bold text-white">Traduzir Documento</span>
                </div>
                <button 
                    onClick={() => setIsTranslationEnabled(!isTranslationEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isTranslationEnabled ? 'bg-blue-500' : 'bg-[#333]'}`}
                >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isTranslationEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
            </div>

            {isTranslationEnabled && (
                <div className="animate-in fade-in slide-in-from-top-2">
                    <label className="text-xs text-text-sec block mb-1.5">Idioma de destino</label>
                    <select 
                        value={targetLanguage}
                        onChange={(e) => setTargetLanguage(e.target.value)}
                        className="w-full bg-[#2c2c2c] border border-gray-600 rounded-lg p-2.5 text-sm text-white focus:border-blue-500 outline-none appearance-none"
                    >
                        {LANGUAGES.map(lang => (
                            <option key={lang.code} value={lang.code}>{lang.name}</option>
                        ))}
                    </select>
                    <p className="text-[10px] text-gray-500 mt-2">
                        A IA irá substituir o texto original pela tradução na sidebar e tentará sobrepor o texto traduzido no documento visual.
                    </p>
                </div>
            )}
        </div>
      </div>
    </BaseModal>
  );
};