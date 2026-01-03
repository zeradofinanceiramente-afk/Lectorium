
import React, { useEffect, useState } from 'react';
import { Sparkles, Loader2, Copy, Check, FileText } from 'lucide-react';
import { usePdfContext } from '../../context/PdfContext';

interface Props {
  pageNumber: number;
}

export const SemanticLensPanel: React.FC<Props> = ({ pageNumber }) => {
  const { lensData, isLensLoading, triggerSemanticLens } = usePdfContext();
  const [copied, setCopied] = useState(false);
  
  const data = lensData[pageNumber];

  useEffect(() => {
    // Auto-trigger se aberto e sem dados
    if (!data && !isLensLoading) {
        // Opcional: Auto-start ou esperar clique do usuário.
        // Por questões de custo de API, deixamos o usuário clicar no botão "Analisar Página"
        // que está implementado como fallback abaixo.
    }
  }, [pageNumber]);

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

  if (isLensLoading) {
      return (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-4">
              <div className="relative">
                  <div className="absolute inset-0 bg-brand/20 rounded-full blur-xl animate-pulse"></div>
                  <Loader2 className="animate-spin text-brand relative z-10" size={48} />
              </div>
              <div className="space-y-1">
                  <h3 className="text-lg font-bold text-white">Analisando Página...</h3>
                  <p className="text-xs text-text-sec">A IA está reconstruindo o layout e transcrevendo o conteúdo.</p>
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
                  <h3 className="text-lg font-bold text-white">Lente Semântica</h3>
                  <p className="text-xs text-gray-400 max-w-[250px]">
                      Use o poder do Gemini Vision para ler jornais, colunas complexas e manuscritos que o OCR comum não consegue entender.
                  </p>
              </div>
              <button 
                onClick={handleAnalyze}
                className="bg-brand text-[#0b141a] px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:brightness-110 shadow-lg shadow-brand/20 transition-all hover:scale-105"
              >
                  <FileText size={18} />
                  Analisar Página {pageNumber}
              </button>
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
              <button 
                onClick={handleCopy}
                className="text-xs flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-gray-300 transition-colors"
              >
                  {copied ? <Check size={12} className="text-green-400"/> : <Copy size={12}/>}
                  {copied ? 'Copiado' : 'Copiar'}
              </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <article className="prose prose-invert prose-sm max-w-none prose-headings:text-brand prose-p:text-gray-300 prose-p:leading-relaxed prose-li:text-gray-300">
                  {/* Renderização simples de Markdown (sem parser pesado para manter leveza, ou usar library se disponível) */}
                  {/* Aqui assumimos texto puro com quebras, para um renderizador real, usaríamos react-markdown */}
                  <div className="whitespace-pre-wrap font-serif text-base">
                      {data.markdown}
                  </div>
              </article>
          </div>
          
          <div className="p-3 border-t border-white/5 text-[10px] text-gray-500 text-center bg-surface">
              Gerado por Gemini 1.5 Flash Vision • Verifique a precisão.
          </div>
      </div>
  );
};
