
import React, { useState } from 'react';
import { Search, FileSearch, History, CloudUpload, Loader2, BookOpen, Layers } from 'lucide-react';
import { preprocessHistoricalNewspaper } from '../services/imageProcessingService';
import { extractNewspaperContent } from '../services/aiService';

export const ArchivistDashboard: React.FC = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      // 1. Limpeza da imagem (Old Lectorium Logic)
      const { canvas } = await preprocessHistoricalNewspaper(file);
      const blob = await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality: 0.9 });
      const reader = new FileReader();
      
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        // 2. Extração Inteligente com Gemini
        const data = await extractNewspaperContent(base64, 'image/jpeg');
        setResult(data);
        setIsProcessing(false);
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      alert("Falha no processamento.");
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 p-8 bg-bg">
      <header className="mb-12">
        <h1 className="text-4xl font-bold text-brand mb-2">The Archivist</h1>
        <p className="text-text-sec">Digitalização avançada de acervos históricos.</p>
      </header>

      {!result && !isProcessing && (
        <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-border rounded-3xl cursor-pointer hover:bg-surface transition-all">
          <CloudUpload size={48} className="text-brand mb-4" />
          <span className="font-bold">Carregar Digitalização (PDF/JPG)</span>
          <span className="text-xs text-text-sec mt-2">Otimizado para jornais com colunas.</span>
          <input type="file" className="hidden" onChange={handleUpload} accept="image/*" />
        </label>
      )}

      {isProcessing && (
        <div className="flex flex-col items-center justify-center h-64 animate-pulse">
          <Loader2 size={48} className="animate-spin text-brand mb-4" />
          <p className="font-bold">Restaurando fibras do papel e extraindo colunas...</p>
        </div>
      )}

      {result && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4">
          <div className="space-y-6">
            <div className="bg-surface p-6 rounded-3xl border border-border">
              <h2 className="text-xs font-bold text-brand uppercase mb-4 flex items-center gap-2">
                <History size={14} /> Metadados Detectados
              </h2>
              <p className="text-2xl font-bold">{result.newspaperName || "Jornal Desconhecido"}</p>
              <p className="text-text-sec">{result.pageDate || "Data não identificada"}</p>
            </div>

            <div className="bg-surface p-6 rounded-3xl border border-border">
              <h2 className="text-xs font-bold text-brand uppercase mb-4 flex items-center gap-2">
                <Layers size={14} /> Artigos Localizados ({result.articles?.length})
              </h2>
              <div className="space-y-3">
                {result.articles?.map((art: any, i: number) => (
                  <div key={i} className="p-3 bg-bg rounded-xl border border-border hover:border-brand cursor-pointer transition-colors">
                    <p className="font-bold text-sm line-clamp-1">{art.title}</p>
                    <p className="text-[10px] text-text-sec">Coluna {art.columnNumber}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-surface p-8 rounded-3xl border border-border h-[600px] overflow-y-auto custom-scrollbar">
             <h2 className="text-xs font-bold text-brand uppercase mb-6 flex items-center gap-2">
                <BookOpen size={14} /> Transcrição Integral
             </h2>
             <div className="space-y-12">
                {result.articles?.map((art: any, i: number) => (
                  <article key={i} className="prose prose-invert">
                    <h3 className="text-xl font-bold border-b border-border pb-2 mb-4 text-white">{art.title}</h3>
                    <p className="text-sm leading-relaxed text-gray-300 whitespace-pre-wrap">{art.content}</p>
                    {art.context && <div className="mt-4 p-2 bg-brand/5 rounded text-[10px] italic text-brand">Contexto IA: {art.context}</div>}
                  </article>
                ))}
             </div>
          </div>
        </div>
      )}
    </div>
  );
};
