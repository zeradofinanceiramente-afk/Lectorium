
import React, { useState, useEffect } from 'react';
import { ScanLine, Check, X } from 'lucide-react';
import { BaseModal } from '../../shared/BaseModal';

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

  useEffect(() => {
    if (isOpen) {
      setStartPage(currentPage);
      setEndPage(numPages);
    }
  }, [isOpen, currentPage, numPages]);

  const handleConfirm = () => {
    let s = Math.max(1, Math.min(startPage, numPages));
    let e = Math.max(1, Math.min(endPage, numPages));
    
    if (s > e) {
      const temp = s;
      s = e;
      e = temp;
    }

    onConfirm(s, e);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Extração de Texto (OCR)"
      icon={<ScanLine size={20} />}
      maxWidth="max-w-sm"
      footer={
        <div className="flex gap-2 justify-end w-full">
            <button onClick={onClose} className="px-4 py-2 text-text-sec hover:text-white transition-colors text-sm">Cancelar</button>
            <button 
                onClick={handleConfirm} 
                className="bg-brand text-[#0b141a] px-6 py-2 rounded-xl font-bold hover:brightness-110 transition-all text-sm flex items-center gap-2"
            >
                <Check size={16} /> Iniciar Leitura
            </button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="bg-brand/10 border border-brand/20 p-4 rounded-xl">
            <p className="text-xs text-brand/90 leading-relaxed">
                Este documento possui <strong>{numPages} páginas</strong>. 
                A leitura será feita sequencialmente, uma página por vez.
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
