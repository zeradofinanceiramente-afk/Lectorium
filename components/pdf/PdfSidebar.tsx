
import React, { useMemo } from 'react';
import { X, Lock, FileText, Copy, Download, Sparkles, Loader2, Hash, PaintBucket, Eye, ImageOff, Columns, Highlighter, Pen, ScanLine, MessageSquare, Pipette, MoveHorizontal, MousePointer2, ScrollText, ScanFace, Cloud, CloudOff, AlertCircle, CheckCircle, Palette, Droplets, Binary } from 'lucide-react';
import { Annotation } from '../../types';
import { usePdfContext } from '../../context/PdfContext';
import { AiChatPanel } from '../shared/AiChatPanel';

export type SidebarTab = 'annotations' | 'settings' | 'fichamento' | 'ai' | 'chat';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  sidebarAnnotations: Annotation[]; 
  fichamentoText: string;
  aiExplanation: string;
  isAiLoading: boolean;
  onCopyFichamento: () => void;
  onDownloadFichamento: () => void;
}

const PRESET_COLORS = [
    '#4ade80', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', 
    '#facc15', '#f97316', '#ef4444', '#ffffff', '#000000'
];

export const PdfSidebar: React.FC<Props> = ({
  isOpen, onClose, activeTab, onTabChange, sidebarAnnotations, fichamentoText, aiExplanation, isAiLoading, onCopyFichamento, onDownloadFichamento,
}) => {
  const { settings, updateSettings, jumpToPage, removeAnnotation, triggerOcr, currentPage, ocrMap, hasUnsavedOcr } = usePdfContext();

  const fullDocumentText = useMemo(() => {
    let text = "";
    const processedPages = Object.keys(ocrMap).map(Number).sort((a, b) => a - b);

    if (processedPages.length > 0) {
        processedPages.forEach(page => {
            const words = ocrMap[page];
            if (Array.isArray(words) && words.length > 0) {
                const pageContent = words.map((w: any) => w.text).join(' ');
                text += `\n[INÍCIO DO CONTEÚDO DA PÁGINA ${page}]\n${pageContent}\n[FIM DA PÁGINA ${page}]\n`;
            }
        });
    }

    const annotationsContent = sidebarAnnotations
        .filter(a => a.text && a.text.trim().length > 0)
        .map(a => `[COMENTÁRIO DO USUÁRIO NA PÁGINA ${a.page}]: ${a.text}`)
        .join('\n');
    
    if (annotationsContent) {
        text += `\n--- OBSERVAÇÕES E DESTAQUES DO LEITOR ---\n${annotationsContent}\n`;
    }

    return text || "O documento está sendo lido ou é um PDF de imagem sem processamento. Use a ferramenta 'Extrair Texto' para dar contexto ao Gemini.";
  }, [ocrMap, sidebarAnnotations]);

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-[60] flex justify-end">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-80 md:w-96 bg-surface h-full shadow-2xl flex flex-col animate-in slide-in-from-right-10 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-text uppercase text-xs tracking-widest opacity-70">Painel Acadêmico</span>
                    {hasUnsavedOcr && (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-500 text-[9px] font-bold" title="Dados temporários salvos no navegador">
                            <AlertCircle size={10} /> <span>Cache Local</span>
                        </div>
                    )}
                </div>
                <button onClick={onClose} className="text-text-sec hover:text-text"><X size={20} /></button>
            </div>

            <div className="flex border-b border-border overflow-x-auto no-scrollbar">
                {[
                    { id: 'annotations', label: 'Notas', icon: FileText },
                    { id: 'fichamento', label: 'Resumo', icon: ScrollText },
                    { id: 'chat', label: 'Conversar', icon: MessageSquare },
                    { id: 'ai', label: 'IA', icon: Sparkles },
                    { id: 'settings', label: 'Ajustes', icon: PaintBucket }
                ].map(tab => (
                    <button key={tab.id} onClick={() => onTabChange(tab.id as SidebarTab)} className={`flex-1 min-w-[60px] py-3 text-[10px] font-bold uppercase transition-colors border-b-2 flex flex-col items-center gap-1 ${activeTab === tab.id ? 'border-brand text-brand bg-brand/5' : 'border-transparent text-text-sec hover:text-text'}`}><tab.icon size={16} />{tab.label}</button>
                ))}
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
                {activeTab === 'annotations' ? (
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                        {sidebarAnnotations.length === 0 && <div className="text-center text-text-sec py-10 text-sm opacity-50">Nenhuma anotação.</div>}
                        {sidebarAnnotations.map((ann, idx) => (
                            <div key={ann.id || idx} onClick={() => jumpToPage(ann.page)} className="bg-bg p-3 rounded-lg border border-border hover:border-brand cursor-pointer group transition-colors relative">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ann.color || '#4ade80' }} />
                                    <span className="text-[10px] text-text-sec uppercase font-bold">Pág {ann.page}</span>
                                    {ann.isBurned && <span className="text-[9px] bg-surface border border-border px-1 rounded text-text-sec ml-auto flex items-center gap-1"><Lock size={8}/> Salvo</span>}
                                </div>
                                <p className="text-sm text-text line-clamp-2">{ann.text || (ann.type === 'ink' ? "Desenho" : "Sem conteúdo")}</p>
                                {!ann.isBurned && <button onClick={(e) => { e.stopPropagation(); removeAnnotation(ann); }} className="absolute top-2 right-2 text-text-sec hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"><X size={14} /></button>}
                            </div>
                        ))}
                    </div>
                ) : activeTab === 'fichamento' ? (
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar flex flex-col">
                        <div className="flex justify-between shrink-0"><span className="text-[10px] text-text-sec font-bold uppercase">Fichamento Automático</span><div className="flex gap-2"><button onClick={onCopyFichamento} className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border rounded text-xs"><Copy size={12} /> Copiar</button></div></div>
                        {fichamentoText ? <div className="flex-1 bg-bg border border-border rounded-lg p-4 text-sm font-serif whitespace-pre-wrap select-text">{fichamentoText}</div> : <div className="flex-1 flex flex-col items-center justify-center text-text-sec opacity-50 gap-2 border border-dashed border-border rounded-lg bg-bg/50"><ScrollText size={32} /><span className="text-sm text-center">Destaque partes do texto para gerar seu fichamento.</span></div>}
                    </div>
                ) : activeTab === 'chat' ? <AiChatPanel contextText={fullDocumentText} documentName="Documento PDF" /> :
                activeTab === 'settings' ? (
                    <div className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar pb-10">
                        {/* Seção 1: Visual do Papel */}
                        <div className="space-y-4">
                            <h4 className="text-[10px] text-brand font-bold uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
                                <Palette size={14} /> Cores do Documento
                            </h4>
                            
                            <div className="flex items-center justify-between bg-bg p-3 rounded-xl border border-border">
                                <span className="text-sm text-text font-medium flex items-center gap-2">
                                    <Droplets size={16} className={!settings.disableColorFilter ? "text-brand" : "text-text-sec"}/> Processamento de Cores
                                </span>
                                <button 
                                    onClick={() => updateSettings({ disableColorFilter: !settings.disableColorFilter })} 
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${!settings.disableColorFilter ? 'bg-brand' : 'bg-surface border border-text-sec'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${!settings.disableColorFilter ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] text-text-sec uppercase font-bold px-1">Papel</label>
                                    <div className="relative group">
                                        <input 
                                            type="color" 
                                            value={settings.pageColor}
                                            onChange={(e) => updateSettings({ pageColor: e.target.value })}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        />
                                        <div className="bg-bg border border-border p-2 rounded-lg flex items-center gap-2">
                                            <div className="w-5 h-5 rounded-md border border-white/20" style={{ backgroundColor: settings.pageColor }}></div>
                                            <span className="text-[10px] font-mono text-text-sec">{settings.pageColor.toUpperCase()}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] text-text-sec uppercase font-bold px-1">Texto</label>
                                    <div className="relative group">
                                        <input 
                                            type="color" 
                                            value={settings.textColor}
                                            onChange={(e) => updateSettings({ textColor: e.target.value })}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        />
                                        <div className="bg-bg border border-border p-2 rounded-lg flex items-center gap-2">
                                            <div className="w-5 h-5 rounded-md border border-white/20" style={{ backgroundColor: settings.textColor }}></div>
                                            <span className="text-[10px] font-mono text-text-sec">{settings.textColor.toUpperCase()}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Seção 2: Visão de Máquina (OCR Confidence) */}
                        <div className="space-y-4">
                            <h4 className="text-[10px] text-brand font-bold uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
                                <Binary size={14} /> Inteligência de Leitura
                            </h4>
                            <div className="flex items-center justify-between bg-bg p-3 rounded-xl border border-border">
                                <div className="flex flex-col">
                                    <span className="text-sm text-text font-medium flex items-center gap-2">
                                        <ScanLine size={16} className={settings.showConfidenceOverlay ? "text-brand" : "text-text-sec"}/> Visão de Máquina
                                    </span>
                                    <span className="text-[9px] text-text-sec mt-1">Mapa de calor de confiança do OCR</span>
                                </div>
                                <button 
                                    onClick={() => updateSettings({ showConfidenceOverlay: !settings.showConfidenceOverlay })} 
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.showConfidenceOverlay ? 'bg-brand' : 'bg-surface border border-text-sec'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${settings.showConfidenceOverlay ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>
                        </div>

                        {/* Seção 3: Ferramenta de Escrita (Ink) */}
                        <div className="space-y-4">
                            <h4 className="text-[10px] text-brand font-bold uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
                                <Pen size={14} /> Ferramenta Caneta
                            </h4>
                            
                            <div className="flex flex-wrap gap-2 px-1">
                                {PRESET_COLORS.map(c => (
                                    <button 
                                        key={c}
                                        onClick={() => updateSettings({ inkColor: c })}
                                        className={`w-6 h-6 rounded-md border-2 transition-transform hover:scale-110 ${settings.inkColor === c ? 'border-white ring-2 ring-brand/50' : 'border-white/10'}`}
                                        style={{ backgroundColor: c }}
                                        title={c}
                                    />
                                ))}
                            </div>

                            <div className="space-y-4 pt-2">
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-[10px] uppercase font-bold text-text-sec px-1">
                                        <span>Espessura</span>
                                        <span className="text-brand font-mono">{settings.inkStrokeWidth}px</span>
                                    </div>
                                    <input 
                                        type="range" min="5" max="100" 
                                        value={settings.inkStrokeWidth}
                                        onChange={(e) => updateSettings({ inkStrokeWidth: parseInt(e.target.value) })}
                                        className="w-full accent-brand bg-bg h-1 rounded-full appearance-none cursor-pointer"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-[10px] uppercase font-bold text-text-sec px-1">
                                        <span>Opacidade</span>
                                        <span className="text-brand font-mono">{Math.round(settings.inkOpacity * 100)}%</span>
                                    </div>
                                    <input 
                                        type="range" min="0.1" max="1" step="0.1"
                                        value={settings.inkOpacity}
                                        onChange={(e) => updateSettings({ inkOpacity: parseFloat(e.target.value) })}
                                        className="w-full accent-brand bg-bg h-1 rounded-full appearance-none cursor-pointer"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Seção 4: Ferramenta de Destaque (Highlight) */}
                        <div className="space-y-4">
                            <h4 className="text-[10px] text-brand font-bold uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
                                <Highlighter size={14} /> Marcador de Texto
                            </h4>

                            <div className="flex flex-wrap gap-2 px-1">
                                {['#facc15', '#4ade80', '#3b82f6', '#ec4899', '#f97316'].map(c => (
                                    <button 
                                        key={c}
                                        onClick={() => updateSettings({ highlightColor: c })}
                                        className={`w-6 h-6 rounded-md border-2 transition-transform hover:scale-110 ${settings.highlightColor === c ? 'border-white ring-2 ring-brand/50' : 'border-white/10'}`}
                                        style={{ backgroundColor: c }}
                                        title={c}
                                    />
                                ))}
                            </div>

                            <div className="space-y-1.5 pt-2">
                                <div className="flex justify-between text-[10px] uppercase font-bold text-text-sec px-1">
                                    <span>Transparência</span>
                                    <span className="text-brand font-mono">{Math.round(settings.highlightOpacity * 100)}%</span>
                                </div>
                                <input 
                                    type="range" min="0.1" max="0.9" step="0.05"
                                    value={settings.highlightOpacity}
                                    onChange={(e) => updateSettings({ highlightOpacity: parseFloat(e.target.value) })}
                                    className="w-full accent-brand bg-bg h-1 rounded-full appearance-none cursor-pointer"
                                />
                            </div>
                        </div>

                        {/* Seção 5: Layout */}
                        <div className="space-y-3 pt-2">
                            <h4 className="text-[10px] text-brand font-bold uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
                                <Eye size={14} /> Leitura
                            </h4>
                            <div className="flex items-center justify-between bg-bg p-3 rounded-xl border border-border">
                                <span className="text-sm text-text font-medium flex items-center gap-2">
                                    <Columns size={16} className={settings.detectColumns ? "text-brand" : "text-text-sec"}/> Pág. Dupla
                                </span>
                                <button onClick={() => updateSettings({ detectColumns: !settings.detectColumns })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.detectColumns ? 'bg-brand' : 'bg-surface border border-text-sec'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${settings.detectColumns ? 'translate-x-6' : 'translate-x-1'}`} /></button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                        <button onClick={() => triggerOcr(currentPage)} className="w-full flex items-center justify-center gap-2 bg-brand text-bg font-bold py-3 rounded-xl shadow-lg hover:brightness-110 transition-all mb-4 text-sm"><ScanLine size={18} /> Forçar Leitura OCR (Pág {currentPage})</button>
                        <div className="bg-bg border border-border rounded-lg p-3 text-sm leading-relaxed whitespace-pre-wrap min-h-[100px]">{isAiLoading ? <Loader2 className="animate-spin mx-auto text-brand"/> : aiExplanation || "Selecione um texto para pedir uma explicação detalhada da IA."}</div>
                        <div className="p-3 bg-brand/5 border border-brand/20 rounded-lg">
                            <p className="text-[10px] text-brand font-bold uppercase mb-1">Status da IA</p>
                            <p className="text-[10px] text-text-sec leading-tight">O Gemini tem acesso a todas as páginas marcadas como "Leitura Concluída". Clique no selo verde na página para conferir o que ele está lendo.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};
