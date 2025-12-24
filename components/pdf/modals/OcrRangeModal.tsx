
import React, { useState, useEffect } from 'react';
import { ScanLine, Check, AlertTriangle, Layers } from 'lucide-react';
import { BaseModal } from '../../shared/BaseModal';
import { useGlobalContext } from '../../../context/GlobalContext';
import { usePdfContext } from '../../../context/PdfContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  numPages: number;
  currentPage: number;
  onConfirm: (start: number, end: number) => void;
}

export const OcrRangeModal: React.FC<Props> = ({ 
  isOpen, onClose, numPages, currentPage, onConfirm 
}) => {
  const [startPage, setStartPage] = useState(currentPage);
  const [endPage, setEndPage] = useState(numPages);
  
  // Acesso ao contexto global para disparar o OCR
  const { startGlobalOcr, isOcrRunning } = useGlobalContext();
  const { fileId, currentBlobRef, accessToken } = usePdfContext();

  useEffect(() => {
    if (isOpen) {
      setStartPage(currentPage);
      setEndPage(numPages);
    }
  }, [isOpen, currentPage, numPages]);

  const handleStartBackgroundOcr = () => {
    let s = Math.max(1, Math.min(startPage, numPages));
    let e = Math.max(1, Math.min(endPage, numPages));
    
    if (s > e) { const temp = s; s = e; e = temp; }

    // Obter o blob atual (Single Source)
    const blob = currentBlobRef.current;
    
    if (blob) {
        // Dispara o OCR Global
        startGlobalOcr(fileId, `Documento (${fileId.slice(-4)})`, blob, s, e);
        
        // Direciona o usuário para o dashboard (a lógica de navegação está no PdfViewer que recebe um callback, 
        // ou podemos forçar aqui se tivéssemos acesso ao router, mas o PdfViewer observará o estado global)
        
        // Chamamos onConfirm passando uma flag especial ou apenas fechamos o modal
        // O PdfViewer detectará a ação.
        onConfirm(s, e); 
        onClose();
    } else {
        alert("Erro: Documento não carregado na memória.");
    }
  };

  if (!isOpen) return null;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Extração de Texto em Segundo Plano"
      icon={<Layers size={20} />}
      maxWidth="max-w-sm"
      footer={
        <div className="flex gap-2 justify-end w-full">
            <button onClick={onClose} className="px-4 py-2 text-text-sec hover:text-white transition-colors text-sm">Cancelar</button>
            <button 
                onClick={handleStartBackgroundOcr} 
                disabled={isOcrRunning}
                className={`bg-brand text-[#0b141a] px-6 py-2 rounded-xl font-bold hover:brightness-110 transition-all text-sm flex items-center gap-2 ${isOcrRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <Check size={16} /> {isOcrRunning ? 'Ocupado' : 'Iniciar & Ir ao Dashboard'}
            </button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="bg-brand/10 border border-brand/20 p-4 rounded-xl">
            <p className="text-xs text-brand/90 leading-relaxed font-medium">
                O OCR será executado em segundo plano. Você será redirecionado para o Dashboard e poderá abrir outros arquivos enquanto processamos as <strong>{numPages} páginas</strong>.
            </p>
        </div>
        
        <div className="bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-lg flex gap-3 items-start">
            <AlertTriangle size={16} className="text-yellow-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-yellow-500/90 leading-tight">
                Para garantir performance máxima, mantenha apenas este documento sendo processado. Se tiver outros PDFs abertos, feche-os.
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
        </div>
      </div>
    </BaseModal>
  );
};
