import React, { useState } from 'react';
import { Sparkles, Loader2, Copy, Check, Layers, ScanLine, Languages, ListRestart } from 'lucide-react';
import { usePdfContext } from '../../context/PdfContext';
import { SemanticRangeModal } from './modals/SemanticRangeModal';

interface Props {
  pageNumber: number;
}

export const SemanticLensPanel: React.FC<Props> = ({ pageNumber }) => {
  const { 
    lensData, isLensLoading, triggerSemanticLens, ocrMap, 
    triggerTranslation, isTranslationMode, toggleTranslationMode,
    numPages
  } = usePdfContext();
  
  const [copied, setCopied] = useState(false);
  const [showRangeModal, setShowRangeModal] = useState(false);
  
  const data = lensData[pageNumber];
  const hasInjectedOcr = ocrMap[pageNumber] && ocrMap[pageNumber].length > 0 && ocrMap[pageNumber][0].isRefined;

  const handleAnalyze = () => {
      triggerSemanticLens(pageNumber);
  };

  const handleCopy = () => {
      if (data?.markdown) {
          navigator.clipboard.writeText(data.markdown);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
      }
  };

  const handleTranslate = () => {
      triggerTranslation(pageNumber);
  };

  if (isLensLoading) {
      return (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-4">
              <div className="relative">
                  <div className="absolute inset-0 bg-brand/20 rounded-full blur-xl animate-pulse"></div>
                  <Loader2 className="animate-spin text-brand relative z-10" size={48} />
              </div>
              <div className="space-y-1">
                  <h3 className="text-lg font-bold text-white">Analisando Página...</h3>
                  <p className="text-xs text-text-sec">O Gemini Vision está reconstruindo o layout e injetando a camada de texto.</p>
              </div>
          </div>
      );
  }

  if (!data) {
      return (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-6">
              <div className="bg-brand/10 p-4 rounded-full border border-brand/20">
                  <Sparkles size={32} className="text-brand" />
              </div>
              <div className="space-y-2">
                  <h3 className="text-lg font-bold text-white">Lente Semântica (Gemini)</h3>
                  <p className="text-xs text-gray-400 max-w-[250px] leading-relaxed">
                      Use o poder do Gemini 1.5 Flash para ler documentos complexos e <strong>injetar texto selecionável</strong>.
                  </p>
              </div>
              
              <div className="space-y-3 w-full">
                  <button 
                    onClick={handleAnalyze}
                    className="w-full bg-brand text-[#0b141a] px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:brightness-110 shadow-lg shadow-brand/20 transition-all"
                  >
                      <Layers size={18} />
                      Analisar Esta Página
                  </button>

                  <button 
                    onClick={() => setShowRangeModal(true)}
                    className="w-full bg-[#2c2c2c] border border-[#333] text-gray-300 px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#333] transition-all text-xs"
                  >
                      <ListRestart size={16} />
                      Analisar Várias (Batch)
                  </button>
              </div>

              <SemanticRangeModal 
                isOpen={showRangeModal}
                onClose={() => setShowRangeModal(false)}
                numPages={numPages}
                currentPage={pageNumber}
              />
          </div>
      );
  }

  return (
      <div className="flex flex-col h-full bg-[#141414]">
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b border-white/5 bg-surface">
              <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-purple-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-300">Transcrição IA</span>
              </div>
              <div className="flex gap-2">
                  {/* Translation Toggle */}
                  <button 
                    onClick={isTranslationMode ? toggleTranslationMode : handleTranslate}
                    className={`text-xs flex items-center gap-1.5 px-2 py-1 rounded transition-colors ${isTranslationMode ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-white/5 hover:bg-white/10 text-gray-300'}`}
                    title="Traduzir Página"
                  >
                      <Languages size={12} />
                      {isTranslationMode ? 'Traduzido' : 'Traduzir'}
                  </button>

                  {hasInjectedOcr && (
                      <span className="text-[10px] bg-brand/10 text-brand px-2 py-1 rounded border border-brand/20 flex items-center gap-1 font-bold">
                          <Layers size={10} /> Injetado
                      </span>
                  )}
                  <button 
                    onClick={handleCopy}
                    className="text-xs flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-gray-300 transition-colors"
                  >
                      {copied ? <Check size={12} className="text-green-400"/> : <Copy size={12}/>}
                  </button>
              </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <article className="prose prose-invert prose-sm max-w-none prose-headings:text-brand prose-p:text-gray-300 prose-p:leading-relaxed prose-li:text-gray-300">
                  <div className="whitespace-pre-wrap font-serif text-base">
                      {data.markdown}
                  </div>
              </article>
          </div>
          
          <div className="p-3 border-t border-white/5 bg-surface flex justify-between items-center">
              <span className="text-[10px] text-gray-500">Gemini 1.5 Flash Vision</span>
              <button 
                onClick={() => setShowRangeModal(true)}
                className="text-[10px] text-brand hover:underline flex items-center gap-1"
              >
                  <ListRestart size={10} /> Processar lote
              </button>
          </div>

          <SemanticRangeModal 
            isOpen={showRangeModal}
            onClose={() => setShowRangeModal(false)}
            numPages={numPages}
            currentPage={pageNumber}
          />
      </div>
  );
};