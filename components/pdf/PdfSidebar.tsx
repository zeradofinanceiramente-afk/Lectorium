
import React, { useMemo, useState, useEffect } from 'react';
import { X, Lock, FileText, Copy, Download, Sparkles, Loader2, Hash, PaintBucket, Eye, ImageOff, Columns, Highlighter, Pen, ScanLine, MessageSquare, Pipette, MoveHorizontal, MousePointer2, ScrollText, ScanFace, Cloud, CloudOff, AlertCircle, CheckCircle, Palette, Droplets, Binary, ChevronLeft, ChevronRight, PanelRightOpen, PanelRightClose, Move, Maximize, BookOpen, Cpu } from 'lucide-react';
import { Annotation } from '../../types';
import { usePdfContext } from '../../context/PdfContext';
import { AiChatPanel } from '../shared/AiChatPanel';
import { SemanticLensPanel } from './SemanticLensPanel';

export type SidebarTab = 'annotations' | 'settings' | 'fichamento' | 'ai' | 'chat' | 'lens';

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
  const { settings, updateSettings, jumpToPage, removeAnnotation, triggerOcr, currentPage, ocrMap, nativeTextMap, numPages, hasUnsavedOcr, fileId, generateSearchIndex, docPageOffset, setDocPageOffset } = usePdfContext();
  const [isHoveringHandler, setIsHoveringHandler] = useState(false);

  // --- JARVIS PROTOCOL: SEMANTIC DEDUPLICATION (V2.1) ---
  const uniqueAnnotations = useMemo(() => {
    const seen = new Set<string>();
    
    return sidebarAnnotations.filter(ann => {
        if (ann.type === 'highlight' && (!ann.text || ann.text.trim() === '')) {
            return false;
        }

        const content = (ann.text || '').trim();
        let signature = '';

        if (content.length > 0) {
            signature = `${ann.page}-text-${content}`;
        } else {
            const x = Math.round(ann.bbox[0]);
            const y = Math.round(ann.bbox[1]);
            signature = `${ann.page}-${ann.type}-${x}-${y}`;
        }
        
        if (seen.has(signature)) return false;
        
        seen.add(signature);
        return true;
    });
  }, [sidebarAnnotations]);

  const contextForAi = useMemo(() => {
    // REGRA DE NEGÓCIO: Limitação de Contexto
    // Se < 17 páginas: Envia texto completo + anotações (Leitura Direta permitida)
    // Se >= 17 páginas: Envia APENAS destaques/notas (Foco Semântico do Usuário)
    
    const isShortDocument = numPages < 17;
    let text = "";

    // 1. Constrói a base de texto (apenas se for documento curto)
    if (isShortDocument) {
        for (let i = 1; i <= numPages; i++) {
            let pageContent = "";
            const ocrWords = ocrMap[i];
            const nativeText = nativeTextMap[i];

            if (Array.isArray(ocrWords) && ocrWords.length > 0) {
                pageContent = ocrWords.map((w: any) => w.text).join(' ');
            } else if (nativeText && nativeText.trim().length > 0) {
                pageContent = nativeText;
            }

            if (pageContent) {
                text += `\n[INÍCIO DA PÁGINA ${i}]\n${pageContent}\n[FIM DA PÁGINA ${i}]\n`;
            }
        }
    } else {
        text += "[SISTEMA]: Documento extenso. O contexto abaixo contém APENAS os trechos explicitamente destacados pelo usuário.\n";
    }

    // 2. Adiciona anotações do usuário (Prioridade Máxima)
    const annotationsContent = uniqueAnnotations
        .filter(a => a.text && a.text.trim().length > 0)
        .map(a => `[DESTAQUE/NOTA DE USUÁRIO NA PÁGINA ${a.page}]: "${a.text}"`)
        .join('\n\n');
    
    if (annotationsContent) {
        text += `\n--- CONTEXTO DE INTERESSE (DESTAQUES DO USUÁRIO) ---\n${annotationsContent}\n`;
    } else if (!isShortDocument) {
        // Se for documento longo e não tiver destaques
        text += "\n[AVISO]: O usuário ainda não destacou nenhum trecho. Utilize sua base de conhecimento interna para responder perguntas sobre o tema geral, mas avise que não está lendo o arquivo completo.";
    }

    if (!text.trim() && isShortDocument) {
        return "O documento parece ser uma imagem digitalizada sem camada de texto. Use a ferramenta 'Extrair Texto' (OCR) na barra superior.";
    }

    return text;
  }, [ocrMap, nativeTextMap, uniqueAnnotations, numPages]);

  return (
    <>
        {/* Backdrop */}
        <div 
            className={`fixed inset-0 z-[55] bg-black/40 transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} 
            onClick={onClose} 
        />
        
        {/* Sidebar Container */}
        <div 
            className={`fixed inset-y-0 right-0 z-[60] w-80 md:w-96 transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1) flex ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        >
            {/* THE HANDLER */}
            <div className="absolute top-1/2 -left-6 -translate-y-1/2 z-[70] flex items-center">
                <button
                    onClick={onClose}
                    className={`
                        h-24 w-6 
                        flex items-center justify-center 
                        rounded-l-2xl 
                        transition-all duration-300
                        bg-black border-l border-y border-brand/50
                        cursor-pointer
                        hover:w-8 hover:pr-2
                        group
                    `}
                >
                    <div className="h-8 w-1 bg-white/20 rounded-full group-hover:bg-brand transition-colors" />
                </button>
            </div>

            {/* MAIN PANEL */}
            <div className="flex-1 h-full flex flex-col relative overflow-hidden bg-black border-l border-brand/40">
                
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-white/5 bg-gradient-to-r from-brand/5 to-transparent relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-4 bg-brand rounded-full"></div>
                        <span className="font-bold text-white uppercase text-xs tracking-[0.2em] text-brand">Painel Tático</span>
                        {hasUnsavedOcr && (
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-500 text-[9px] font-bold" title="Dados temporários salvos no navegador">
                                <AlertCircle size={10} /> <span>CACHE</span>
                            </div>
                        )}
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-white/5 rounded-full"><X size={20} /></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/5 p-1 mx-2 mt-2 gap-1 bg-white/5 rounded-xl relative z-10 overflow-x-auto no-scrollbar">
                    {[
                        { id: 'annotations', label: 'Notas', icon: FileText },
                        { id: 'fichamento', label: 'Resumo', icon: ScrollText },
                        { id: 'chat', label: 'Chat IA', icon: MessageSquare },
                        { id: 'lens', label: 'Lente', icon: Sparkles },
                        { id: 'settings', label: 'Config', icon: PaintBucket }
                    ].map(tab => (
                        <button 
                            key={tab.id} 
                            onClick={() => onTabChange(tab.id as SidebarTab)} 
                            className={`flex-1 min-w-[60px] py-2 text-[10px] font-bold uppercase transition-all rounded-lg flex flex-col items-center gap-1 ${activeTab === tab.id ? 'bg-white/10 text-brand border border-white/5' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
                        >
                            <tab.icon size={16} className={activeTab === tab.id ? "text-brand" : ""} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-hidden flex flex-col bg-black relative z-10">
                    {activeTab === 'annotations' ? (
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            {uniqueAnnotations.length === 0 && (
                                <div className="text-center text-gray-600 py-10 flex flex-col items-center gap-3">
                                    <FileText size={32} className="opacity-20" />
                                    <span className="text-xs uppercase tracking-widest font-bold">Sem dados</span>
                                </div>
                            )}
                            {uniqueAnnotations.map((ann, idx) => (
                                <div key={ann.id || idx} onClick={() => jumpToPage(ann.page)} className="bg-[#1a1a1a] p-3 rounded-xl border border-white/5 hover:border-brand/50 cursor-pointer group transition-all hover:bg-white/5 relative">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ann.color || '#4ade80', color: ann.color || '#4ade80' }} />
                                        <span className="text-[10px] text-gray-400 font-mono">PÁG {(ann.page + docPageOffset).toString().padStart(2, '0')}</span>
                                        {ann.isBurned && <span className="text-[9px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-gray-400 ml-auto flex items-center gap-1"><Lock size={8}/> GRAVADO</span>}
                                    </div>
                                    <p className="text-sm text-gray-200 line-clamp-2 leading-relaxed font-medium">{ann.text || <span className="italic opacity-50 text-xs">Anotação usando caneta</span>}</p>
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
                    ) : activeTab === 'chat' ? (
                        <AiChatPanel 
                            contextText={contextForAi} 
                            documentName="Documento PDF" 
                            className="bg-transparent"
                            fileId={fileId}
                            onIndexRequest={() => generateSearchIndex(contextForAi)}
                            numPages={numPages}
                        />
                    ) : activeTab === 'lens' ? (
                        <SemanticLensPanel pageNumber={currentPage} />
                    ) : activeTab === 'settings' ? (
                        <div className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar pb-10">
                            {/* Settings Content... */}
                            <div className="space-y-4">
                                <h4 className="text-[10px] text-brand font-bold uppercase tracking-[0.2em] flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
                                    <Binary size={14} /> Motor de Leitura (OCR)
                                </h4>
                                
                                <div className="grid grid-cols-2 gap-3">
                                    <button 
                                        onClick={() => updateSettings({ ocrEngine: 'tesseract' })}
                                        className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${settings.ocrEngine === 'tesseract' ? 'bg-brand/10 border-brand text-brand' : 'bg-[#1a1a1a] border-white/10 text-gray-500 hover:bg-[#222]'}`}
                                    >
                                        <ScanLine size={20} />
                                        <div className="text-center">
                                            <span className="block text-xs font-bold">Tesseract</span>
                                            <span className="block text-[9px] opacity-70">Rápido / CPU</span>
                                        </div>
                                    </button>
                                    
                                    <button 
                                        onClick={() => updateSettings({ ocrEngine: 'florence' })}
                                        className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${settings.ocrEngine === 'florence' ? 'bg-purple-500/10 border-purple-500 text-purple-400' : 'bg-[#1a1a1a] border-white/10 text-gray-500 hover:bg-[#222]'}`}
                                    >
                                        <Cpu size={20} />
                                        <div className="text-center">
                                            <span className="block text-xs font-bold">Florence-2</span>
                                            <span className="block text-[9px] opacity-70">Neural / GPU</span>
                                        </div>
                                    </button>
                                </div>
                                <p className="text-[9px] text-gray-600 bg-[#1a1a1a] p-2 rounded-lg leading-tight">
                                    Use <strong>Florence-2</strong> para documentos complexos ou manuscritos. Requer download (~300MB) na primeira vez.
                                </p>
                            </div>

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
                                                <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: settings.pageColor }}></div>
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
                                                <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: settings.textColor }}></div>
                                                <span className="text-[10px] font-mono text-gray-400">{settings.textColor.toUpperCase()}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Seção 2: Visão de Máquina (OCR Confidence) */}
                            <div className="space-y-4">
                                <h4 className="text-[10px] text-brand font-bold uppercase tracking-[0.2em] flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
                                    <Binary size={14} /> Debug
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
                                    <Pen size={14} /> Caneta
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
                                    {['#facc15', '#4ade80', '#3b82f6', '#ec4899', '#f97316', '#a855f7'].map(c => (
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

                            {/* Seção 5: Layout e Interface */}
                            <div className="space-y-6 pt-2">
                                <h4 className="text-[10px] text-brand font-bold uppercase tracking-[0.2em] flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
                                    <Eye size={14} /> Interface e Layout
                                </h4>
                                
                                <div className="flex items-center justify-between bg-[#1a1a1a] p-3 rounded-xl border border-white/5 hover:border-white/10 transition-colors mb-4">
                                    <span className="text-xs text-white font-bold flex items-center gap-2">
                                        <Columns size={16} className={settings.detectColumns ? "text-brand" : "text-gray-600"}/> Pág. Dupla
                                    </span>
                                    <button onClick={() => updateSettings({ detectColumns: !settings.detectColumns })} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.detectColumns ? 'bg-brand' : 'bg-white/10'}`}><span className={`inline-block h-3 w-3 transform rounded-full bg-black transition ${settings.detectColumns ? 'translate-x-5' : 'translate-x-1'}`} /></button>
                                </div>

                                {/* Pagination Correction */}
                                <div className="space-y-2 mb-4 p-3 bg-brand/5 rounded-xl border border-brand/20">
                                    <div className="flex items-center gap-2 text-brand">
                                        <BookOpen size={14} />
                                        <span className="text-[10px] font-bold uppercase">Correção de Paginação</span>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] text-gray-400">Definir página atual ({currentPage}) como:</label>
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="number" 
                                                className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white w-20 text-center focus:border-brand outline-none"
                                                value={currentPage + docPageOffset}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value);
                                                    if (!isNaN(val)) {
                                                        // offset = target - current
                                                        setDocPageOffset(val - currentPage);
                                                    }
                                                }}
                                            />
                                            <span className="text-[9px] text-gray-500">(Offset: {docPageOffset > 0 ? '+' : ''}{docPageOffset})</span>
                                        </div>
                                        <p className="text-[9px] text-gray-500 leading-tight pt-1">
                                            Use isso para sincronizar a contagem com o livro físico (ex: pular capas e sumário).
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-4 px-1">
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between text-[9px] uppercase font-bold text-gray-500">
                                            <span className="flex items-center gap-1"><Maximize size={10} /> Tamanho da Toolbar</span>
                                            <span className="text-brand font-mono">{Math.round(settings.toolbarScale * 100)}%</span>
                                        </div>
                                        <input 
                                            type="range" min="0.5" max="1.5" step="0.1"
                                            value={settings.toolbarScale}
                                            onChange={(e) => updateSettings({ toolbarScale: parseFloat(e.target.value) })}
                                            className="w-full accent-brand bg-white/10 h-1 rounded-full appearance-none cursor-pointer"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between text-[9px] uppercase font-bold text-gray-500">
                                            <span className="flex items-center gap-1"><Move size={10} /> Posição Vertical</span>
                                            <span className="text-brand font-mono">{settings.toolbarYOffset}px</span>
                                        </div>
                                        <input 
                                            type="range" min="0" max="200" step="5"
                                            value={settings.toolbarYOffset}
                                            onChange={(e) => updateSettings({ toolbarYOffset: parseInt(e.target.value) })}
                                            className="w-full accent-brand bg-white/10 h-1 rounded-full appearance-none cursor-pointer"
                                        />
                                        <p className="text-[9px] text-gray-600 text-center pt-1">Ajuste para evitar cobrir legendas ou rodapés.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                            <div className="p-3 bg-brand/5 border border-brand/20 rounded-lg">
                                <p className="text-[10px] text-brand font-bold uppercase mb-1">Status da IA</p>
                                <p className="text-[10px] text-gray-400 leading-tight">O Gemini agora lê automaticamente o texto nativo do documento. Para textos em imagem (scans antigos), use a ferramenta "Extrair Texto" com Florence-2 para máxima precisão.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
        
        {/* THE FLOATING TRIGGER */}
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
                        group
                    "
                    title="Abrir Painel"
                >
                    <div className="h-8 w-1 bg-white/20 rounded-full group-hover:bg-brand transition-all" />
                </button>
            </div>
        )}
    </>
  );
};
