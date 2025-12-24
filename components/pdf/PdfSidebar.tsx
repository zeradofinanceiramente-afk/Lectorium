
import React, { useMemo, useState, useEffect } from 'react';
import { X, Lock, FileText, Copy, Download, Sparkles, Loader2, Hash, PaintBucket, Eye, ImageOff, Columns, Highlighter, Pen, ScanLine, MessageSquare, Pipette, MoveHorizontal, MousePointer2, ScrollText, ScanFace, Cloud, CloudOff, AlertCircle, CheckCircle, Palette, Droplets, Binary, ChevronLeft, ChevronRight, PanelRightOpen, PanelRightClose } from 'lucide-react';
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
  onCopyFichamento: () => void;
  onDownloadFichamento: () => void;
}

const PRESET_COLORS = [
    '#4ade80', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', 
    '#facc15', '#f97316', '#ef4444', '#ffffff', '#000000'
];

export const PdfSidebar: React.FC<Props> = ({
  isOpen, onClose, activeTab, onTabChange, sidebarAnnotations, fichamentoText, onCopyFichamento, onDownloadFichamento,
}) => {
  const { settings, updateSettings, jumpToPage, removeAnnotation, triggerOcr, currentPage, ocrMap, hasUnsavedOcr } = usePdfContext();
  const [isHoveringHandler, setIsHoveringHandler] = useState(false);

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

  return (
    <>
        {/* Backdrop */}
        <div 
            className={`fixed inset-0 z-[55] bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} 
            onClick={onClose} 
        />
        
        {/* Sidebar Container */}
        <div 
            className={`fixed inset-y-0 right-0 z-[60] w-80 md:w-96 transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1) flex ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        >
            {/* THE HANDLER (Attached Puller) - Old School Visual */}
            <div className="absolute top-1/2 -left-6 -translate-y-1/2 z-[70] flex items-center">
                <button
                    onClick={onClose}
                    className={`
                        h-24 w-6 
                        flex items-center justify-center 
                        rounded-l-2xl 
                        shadow-[-5px_0_15px_-5px_rgba(0,0,0,0.8)]
                        transition-all duration-300
                        bg-black border-l border-y border-brand/50
                        cursor-pointer
                        hover:w-8 hover:pr-2
                        group
                    `}
                >
                    <div className="h-8 w-1 bg-white/20 rounded-full group-hover:bg-brand group-hover:shadow-[0_0_8px_var(--brand)] transition-colors" />
                </button>
            </div>

            {/* MAIN PANEL */}
            <div className="flex-1 h-full flex flex-col relative overflow-hidden">
                {/* Glassmorphism Background & Neon Border */}
                <div className="absolute inset-0 bg-[#050505]/85 backdrop-blur-xl z-0" />
                <div className="absolute inset-0 border-l border-brand/40 z-0 pointer-events-none shadow-[inset_10px_0_30px_-15px_rgba(var(--brand),0.3)] box-border" />
                
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-white/5 bg-gradient-to-r from-brand/5 to-transparent relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-4 bg-brand rounded-full shadow-[0_0_10px_rgba(74,222,128,0.5)]"></div>
                        <span className="font-bold text-white uppercase text-xs tracking-[0.2em] text-brand drop-shadow-sm">Painel Tático</span>
                        {hasUnsavedOcr && (
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-500 text-[9px] font-bold" title="Dados temporários salvos no navegador">
                                <AlertCircle size={10} /> <span>CACHE</span>
                            </div>
                        )}
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-white/5 rounded-full"><X size={20} /></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/5 p-1 mx-2 mt-2 gap-1 bg-black/20 rounded-xl relative z-10">
                    {[
                        { id: 'annotations', label: 'Notas', icon: FileText },
                        { id: 'fichamento', label: 'Resumo', icon: ScrollText },
                        { id: 'chat', label: 'IA Chat', icon: MessageSquare },
                        { id: 'settings', label: 'Config', icon: PaintBucket }
                    ].map(tab => (
                        <button 
                            key={tab.id} 
                            onClick={() => onTabChange(tab.id as SidebarTab)} 
                            className={`flex-1 py-2 text-[10px] font-bold uppercase transition-all rounded-lg flex flex-col items-center gap-1 ${activeTab === tab.id ? 'bg-white/10 text-brand shadow-inner border border-white/5' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
                        >
                            <tab.icon size={16} className={activeTab === tab.id ? "text-brand drop-shadow-[0_0_5px_rgba(var(--brand),0.5)]" : ""} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-hidden flex flex-col bg-black/10 relative z-10">
                    {activeTab === 'annotations' ? (
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            {sidebarAnnotations.length === 0 && (
                                <div className="text-center text-gray-600 py-10 flex flex-col items-center gap-3">
                                    <FileText size={32} className="opacity-20" />
                                    <span className="text-xs uppercase tracking-widest font-bold">Sem dados</span>
                                </div>
                            )}
                            {sidebarAnnotations.map((ann, idx) => (
                                <div key={ann.id || idx} onClick={() => jumpToPage(ann.page)} className="bg-[#1a1a1a] p-3 rounded-xl border border-white/5 hover:border-brand/50 cursor-pointer group transition-all hover:bg-white/5 relative">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="w-2 h-2 rounded-full shadow-[0_0_5px_currentColor]" style={{ backgroundColor: ann.color || '#4ade80', color: ann.color || '#4ade80' }} />
                                        <span className="text-[10px] text-gray-400 font-mono">PÁG {ann.page.toString().padStart(2, '0')}</span>
                                        {ann.isBurned && <span className="text-[9px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-gray-400 ml-auto flex items-center gap-1"><Lock size={8}/> HARDCODED</span>}
                                    </div>
                                    <p className="text-sm text-gray-200 line-clamp-2 leading-relaxed font-medium">{ann.text || <span className="italic opacity-50 text-xs">Desenho à mão livre</span>}</p>
                                    {!ann.isBurned && <button onClick={(e) => { e.stopPropagation(); removeAnnotation(ann); }} className="absolute top-2 right-2 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-white/5 rounded-lg"><X size={14} /></button>}
                                </div>
                            ))}
                        </div>
                    ) : activeTab === 'fichamento' ? (
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar flex flex-col">
                            <div className="flex justify-between shrink-0 items-center border-b border-white/5 pb-3">
                                <span className="text-[10px] text-brand font-bold uppercase tracking-widest">Extração Automática</span>
                                <button onClick={onCopyFichamento} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs transition-colors text-white"><Copy size={12} /> Copiar</button>
                            </div>
                            {fichamentoText ? <div className="flex-1 bg-[#1a1a1a] border border-white/5 rounded-xl p-4 text-sm font-mono text-gray-300 whitespace-pre-wrap select-text leading-relaxed shadow-inner">{fichamentoText}</div> : <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-2"><ScrollText size={32} className="opacity-20" /><span className="text-xs text-center max-w-[200px]">Destaque textos no documento para compilar aqui.</span></div>}
                        </div>
                    ) : activeTab === 'chat' ? <AiChatPanel contextText={fullDocumentText} documentName="Documento PDF" className="bg-transparent" /> :
                    activeTab === 'settings' ? (
                        <div className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar pb-10">
                            {/* Settings Content... (Mantido igual) */}
                            <div className="space-y-4">
                                <h4 className="text-[10px] text-brand font-bold uppercase tracking-[0.2em] flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
                                    <Palette size={14} /> Renderização
                                </h4>
                                
                                <div className="flex items-center justify-between bg-[#1a1a1a] p-3 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                                    <span className="text-xs text-white font-bold flex items-center gap-2">
                                        <Droplets size={16} className={!settings.disableColorFilter ? "text-brand" : "text-gray-600"}/> Filtro de Cor
                                    </span>
                                    <button 
                                        onClick={() => updateSettings({ disableColorFilter: !settings.disableColorFilter })} 
                                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${!settings.disableColorFilter ? 'bg-brand' : 'bg-white/10'}`}
                                    >
                                        <span className={`inline-block h-3 w-3 transform rounded-full bg-black transition ${!settings.disableColorFilter ? 'translate-x-5' : 'translate-x-1'}`} />
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] text-gray-500 uppercase font-bold px-1">Fundo</label>
                                        <div className="relative group">
                                            <input 
                                                type="color" 
                                                value={settings.pageColor}
                                                onChange={(e) => updateSettings({ pageColor: e.target.value })}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            />
                                            <div className="bg-[#1a1a1a] border border-white/10 p-2 rounded-lg flex items-center gap-2 hover:border-white/20 transition-colors">
                                                <div className="w-4 h-4 rounded-full border border-white/20 shadow-sm" style={{ backgroundColor: settings.pageColor }}></div>
                                                <span className="text-[10px] font-mono text-gray-400">{settings.pageColor.toUpperCase()}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] text-gray-500 uppercase font-bold px-1">Texto</label>
                                        <div className="relative group">
                                            <input 
                                                type="color" 
                                                value={settings.textColor}
                                                onChange={(e) => updateSettings({ textColor: e.target.value })}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            />
                                            <div className="bg-[#1a1a1a] border border-white/10 p-2 rounded-lg flex items-center gap-2 hover:border-white/20 transition-colors">
                                                <div className="w-4 h-4 rounded-full border border-white/20 shadow-sm" style={{ backgroundColor: settings.textColor }}></div>
                                                <span className="text-[10px] font-mono text-gray-400">{settings.textColor.toUpperCase()}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Seção 2: Visão de Máquina (OCR Confidence) */}
                            <div className="space-y-4">
                                <h4 className="text-[10px] text-brand font-bold uppercase tracking-[0.2em] flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
                                    <Binary size={14} /> Visão Computacional
                                </h4>
                                <div className="flex items-center justify-between bg-[#1a1a1a] p-3 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                                    <div className="flex flex-col">
                                        <span className="text-xs text-white font-bold flex items-center gap-2">
                                            <ScanLine size={16} className={settings.showConfidenceOverlay ? "text-brand" : "text-gray-600"}/> Debug Layer
                                        </span>
                                        <span className="text-[9px] text-gray-500 mt-1">Mapa de calor de confiança do OCR</span>
                                    </div>
                                    <button 
                                        onClick={() => updateSettings({ showConfidenceOverlay: !settings.showConfidenceOverlay })} 
                                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.showConfidenceOverlay ? 'bg-brand' : 'bg-white/10'}`}
                                    >
                                        <span className={`inline-block h-3 w-3 transform rounded-full bg-black transition ${settings.showConfidenceOverlay ? 'translate-x-5' : 'translate-x-1'}`} />
                                    </button>
                                </div>
                            </div>

                            {/* Seção 3: Ferramenta de Escrita (Ink) */}
                            <div className="space-y-4">
                                <h4 className="text-[10px] text-brand font-bold uppercase tracking-[0.2em] flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
                                    <Pen size={14} /> Estilete Digital
                                </h4>
                                
                                <div className="flex flex-wrap gap-2 px-1">
                                    {PRESET_COLORS.map(c => (
                                        <button 
                                            key={c}
                                            onClick={() => updateSettings({ inkColor: c })}
                                            className={`w-6 h-6 rounded-md border-2 transition-all hover:scale-110 ${settings.inkColor === c ? 'border-white ring-2 ring-brand/50 scale-110' : 'border-white/10 hover:border-white/50'}`}
                                            style={{ backgroundColor: c }}
                                            title={c}
                                        />
                                    ))}
                                </div>

                                <div className="space-y-4 pt-2">
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between text-[9px] uppercase font-bold text-gray-500 px-1">
                                            <span>Espessura</span>
                                            <span className="text-brand font-mono">{settings.inkStrokeWidth}px</span>
                                        </div>
                                        <input 
                                            type="range" min="5" max="100" 
                                            value={settings.inkStrokeWidth}
                                            onChange={(e) => updateSettings({ inkStrokeWidth: parseInt(e.target.value) })}
                                            className="w-full accent-brand bg-white/10 h-1 rounded-full appearance-none cursor-pointer"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between text-[9px] uppercase font-bold text-gray-500 px-1">
                                            <span>Opacidade</span>
                                            <span className="text-brand font-mono">{Math.round(settings.inkOpacity * 100)}%</span>
                                        </div>
                                        <input 
                                            type="range" min="0.1" max="1" step="0.1"
                                            value={settings.inkOpacity}
                                            onChange={(e) => updateSettings({ inkOpacity: parseFloat(e.target.value) })}
                                            className="w-full accent-brand bg-white/10 h-1 rounded-full appearance-none cursor-pointer"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Seção 4: Ferramenta de Destaque (Highlight) */}
                            <div className="space-y-4">
                                <h4 className="text-[10px] text-brand font-bold uppercase tracking-[0.2em] flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
                                    <Highlighter size={14} /> Marcador
                                </h4>

                                <div className="flex flex-wrap gap-2 px-1">
                                    {['#facc15', '#4ade80', '#3b82f6', '#ec4899', '#f97316'].map(c => (
                                        <button 
                                            key={c}
                                            onClick={() => updateSettings({ highlightColor: c })}
                                            className={`w-6 h-6 rounded-md border-2 transition-all hover:scale-110 ${settings.highlightColor === c ? 'border-white ring-2 ring-brand/50 scale-110' : 'border-white/10 hover:border-white/50'}`}
                                            style={{ backgroundColor: c }}
                                            title={c}
                                        />
                                    ))}
                                </div>

                                <div className="space-y-1.5 pt-2">
                                    <div className="flex justify-between text-[9px] uppercase font-bold text-gray-500 px-1">
                                        <span>Transparência</span>
                                        <span className="text-brand font-mono">{Math.round(settings.highlightOpacity * 100)}%</span>
                                    </div>
                                    <input 
                                        type="range" min="0.1" max="0.9" step="0.05"
                                        value={settings.highlightOpacity}
                                        onChange={(e) => updateSettings({ highlightOpacity: parseFloat(e.target.value) })}
                                        className="w-full accent-brand bg-white/10 h-1 rounded-full appearance-none cursor-pointer"
                                    />
                                </div>
                            </div>

                            {/* Seção 5: Layout */}
                            <div className="space-y-3 pt-2">
                                <h4 className="text-[10px] text-brand font-bold uppercase tracking-[0.2em] flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
                                    <Eye size={14} /> Modo de Leitura
                                </h4>
                                <div className="flex items-center justify-between bg-[#1a1a1a] p-3 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                                    <span className="text-xs text-white font-bold flex items-center gap-2">
                                        <Columns size={16} className={settings.detectColumns ? "text-brand" : "text-gray-600"}/> Pág. Dupla
                                    </span>
                                    <button onClick={() => updateSettings({ detectColumns: !settings.detectColumns })} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.detectColumns ? 'bg-brand' : 'bg-white/10'}`}><span className={`inline-block h-3 w-3 transform rounded-full bg-black transition ${settings.detectColumns ? 'translate-x-5' : 'translate-x-1'}`} /></button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                            <div className="p-3 bg-brand/5 border border-brand/20 rounded-lg">
                                <p className="text-[10px] text-brand font-bold uppercase mb-1">Status da IA</p>
                                <p className="text-[10px] text-gray-400 leading-tight">O Gemini tem acesso a todas as páginas marcadas como "Leitura Concluída". Clique no selo verde na página para conferir o que ele está lendo.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
        
        {/* THE FLOATING TRIGGER (Visible when sidebar is closed) - Old School Visual */}
        {!isOpen && (
            <div className="fixed top-1/2 right-0 -translate-y-1/2 z-[50]">
                <button 
                    onClick={onClose} 
                    className="
                        h-24 w-6 
                        bg-black 
                        border-l border-y border-brand/50 
                        rounded-l-2xl 
                        flex items-center justify-center 
                        text-brand 
                        hover:w-8 hover:pr-2 
                        transition-all duration-300
                        shadow-[-5px_0_15px_-5px_rgba(0,0,0,0.8)]
                        group
                    "
                    title="Abrir Painel"
                >
                    <div className="h-8 w-1 bg-white/20 rounded-full group-hover:bg-brand group-hover:shadow-[0_0_8px_var(--brand)] transition-all" />
                </button>
            </div>
        )}
    </>
  );
};
