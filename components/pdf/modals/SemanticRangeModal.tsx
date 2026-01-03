import React, { useState } from 'react';
import { Layers, Check, AlertTriangle, Info, BrainCircuit } from 'lucide-react';
import { BaseModal } from '../../shared/BaseModal';
import { useGlobalContext } from '../../../context/GlobalContext';
import { usePdfContext } from '../../../context/PdfContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  numPages: number;
  currentPage: number;
}

const MAX_BATCH_SIZE = 50;

export const SemanticRangeModal: React.FC<Props> = ({ 
  isOpen, onClose, numPages, currentPage 
}) => {
  const [startPage, setStartPage] = useState(currentPage);
  const [endPage, setEndPage] = useState(Math.min(currentPage + 4, numPages));
  
  const { startGlobalOcr, isOcrRunning, addNotification } = useGlobalContext();
  const { fileId, currentBlobRef, setPageLensData, setPageOcrData } = usePdfContext();

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
        startGlobalOcr(fileId, "Semantic Batch", blob, s, e);
        
        onClose();
    } else {
        addNotification("Documento não disponível.", "error");
    }
  };

  if (!isOpen) return null;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Análise Semântica em Lote"
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
                <Check size={16} /> {isOcrRunning ? 'Ocupado' : 'Iniciar Processamento'}
            </button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-xl">
            <p className="text-xs text-purple-200 leading-relaxed font-medium">
                O Gemini Vision analisará cada página em sequência para extrair <strong>Markdown estruturado</strong> e layout preciso.
            </p>
        </div>
        
        <div className="bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-lg flex gap-3 items-start">
            <AlertTriangle size={16} className="text-yellow-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-yellow-500/90 leading-tight">
                <strong>Limite de Segurança:</strong> Máximo de {MAX_BATCH_SIZE} páginas por lote para evitar bloqueios da API (Erro 429) e garantir estabilidade.
            </p>
        </div>

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
      </div>
    </BaseModal>
  );
};