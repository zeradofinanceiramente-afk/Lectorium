
import React, { useState, useEffect, useRef } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import katex from 'katex';
import { 
  Calculator, X, Check, HelpCircle, Sigma, 
  Superscript, Divide, FunctionSquare, Braces,
  Sparkles, Loader2, Play
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

// --- SNIPPETS & TOOLS CONFIG ---
const LATEX_TOOLS = {
  'Básico': [
    { label: 'Fração', code: '\\frac{a}{b}', icon: '½' },
    { label: 'Raiz', code: '\\sqrt{x}', icon: '√' },
    { label: 'Potência', code: 'x^{2}', icon: 'x²' },
    { label: 'Subscrito', code: 'x_{i}', icon: 'xᵢ' },
    { label: 'Vezes', code: '\\cdot', icon: '·' },
    { label: 'Infinito', code: '\\infty', icon: '∞' },
  ],
  'Cálculo': [
    { label: 'Integral', code: '\\int_{a}^{b} x dx', icon: '∫' },
    { label: 'Somatório', code: '\\sum_{i=0}^{n}', icon: '∑' },
    { label: 'Limite', code: '\\lim_{x \\to \\infty}', icon: 'lim' },
    { label: 'Derivada Parcial', code: '\\frac{\\partial f}{\\partial x}', icon: '∂' },
    { label: 'Diferencial', code: '\\frac{dy}{dx}', icon: 'dy/dx' },
  ],
  'Álgebra': [
    { label: 'Matriz (2x2)', code: '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}', icon: '[ ]' },
    { label: 'Vetor', code: '\\vec{v}', icon: '→' },
    { label: 'Sistema', code: '\\begin{cases} x+y=1 \\\\ x-y=0 \\end{cases}', icon: '{' },
    { label: 'Pertence', code: '\\in', icon: '∈' },
    { label: 'Reais', code: '\\mathbb{R}', icon: 'ℝ' },
  ],
  'Grego': [
    { label: 'Alpha', code: '\\alpha', icon: 'α' },
    { label: 'Beta', code: '\\beta', icon: 'β' },
    { label: 'Delta', code: '\\Delta', icon: 'Δ' },
    { label: 'Theta', code: '\\theta', icon: 'θ' },
    { label: 'Pi', code: '\\pi', icon: 'π' },
    { label: 'Lambda', code: '\\lambda', icon: 'λ' },
    { label: 'Omega', code: '\\Omega', icon: 'Ω' },
  ]
};

export default (props: any) => {
  const [isEditing, setIsEditing] = useState(false);
  const [latex, setLatex] = useState(props.node.attrs.latex || 'E = mc^2');
  const [activeTab, setActiveTab] = useState<keyof typeof LATEX_TOOLS>('Básico');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // AI States
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Refs
  const previewRef = useRef<HTMLDivElement>(null);
  const editorPreviewRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [backdropClicks, setBackdropClicks] = useState(0);

  // --- RENDERIZADOR KATEX SEGURO ---
  const renderMath = (expression: string, target: HTMLElement | null) => {
    if (!target) return;
    try {
      const render = katex?.render;
      if (typeof render === 'function') {
        render(expression, target, {
          throwOnError: false,
          displayMode: true,
          output: 'html',
          strict: false, 
          trust: true,
          errorColor: '#ef4444'
        });
        setErrorMsg(null);
      }
    } catch (e: any) {
      target.innerHTML = ''; // Limpa para evitar lixo visual
      setErrorMsg(e.message);
    }
  };

  // Preview Principal (No documento)
  useEffect(() => {
    renderMath(latex, previewRef.current);
  }, [latex, isEditing]);

  // Preview do Editor (No modal)
  useEffect(() => {
    if (isEditing) {
        renderMath(latex, editorPreviewRef.current);
    }
  }, [latex, isEditing]);

  const insertSnippet = (snippet: string) => {
    if (!inputRef.current) return;
    
    const start = inputRef.current.selectionStart;
    const end = inputRef.current.selectionEnd;
    const text = inputRef.current.value;
    
    const newText = text.substring(0, start) + snippet + text.substring(end);
    setLatex(newText);
    
    // Restaurar foco e posição do cursor após inserção
    setTimeout(() => {
        if (inputRef.current) {
            inputRef.current.focus();
            const newCursorPos = start + snippet.length;
            inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
    }, 0);
  };

  const handleExplainAi = async () => {
    if (!latex || isAiLoading) return;
    setIsAiLoading(true);
    setAiExplanation(null);

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Explique brevemente (máx 2 frases) o significado desta fórmula matemática/física em português: "${latex}". Se for apenas matemática abstrata, descreva a estrutura.`
        });
        setAiExplanation(response.text);
    } catch (e) {
        setAiExplanation("Não foi possível conectar à IA.");
    } finally {
        setIsAiLoading(false);
    }
  };

  const handleSave = () => {
    props.updateAttributes({ latex });
    setIsEditing(false);
    setBackdropClicks(0);
    setAiExplanation(null);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (backdropClicks + 1 >= 3) {
      handleSave();
    } else {
      setBackdropClicks(prev => prev + 1);
    }
  };

  return (
    <NodeViewWrapper className="react-renderer my-4 w-fit mx-auto select-none">
      <div 
        className="relative group cursor-pointer px-4 py-2 rounded-xl bg-black border border-brand hover:shadow-[0_0_15px_rgba(74,222,128,0.2)] transition-all min-w-[40px] min-h-[40px] flex items-center justify-center shadow-lg"
        onClick={(e) => { e.stopPropagation(); setIsEditing(true); setBackdropClicks(0); }}
      >
        {!isEditing && (
            <div className="absolute -top-3 right-0 opacity-0 group-hover:opacity-100 transition-all bg-surface text-brand text-[10px] font-bold px-2 py-0.5 rounded-full border border-brand shadow-sm flex items-center gap-1 z-10 whitespace-nowrap">
                <Calculator size={8} /> Editar
            </div>
        )}
        
        {/* Renderização no Documento - Estilo High Contrast (Fundo Preto/Texto Verde) */}
        <div ref={previewRef} className="pointer-events-none text-xl text-brand" />

        {/* MODAL DE EDIÇÃO AVANÇADA */}
        {isEditing && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md cursor-default" onClick={handleBackdropClick}>
             <div 
                className="bg-[#1e1e1e] border border-[#444746] rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()} 
             >
                 {/* Header */}
                 <div className="flex justify-between items-center px-6 py-4 border-b border-[#444746] bg-[#252525]">
                     <div className="flex items-center gap-3">
                        <div className="bg-brand/10 p-2 rounded-lg text-brand">
                            <FunctionSquare size={20} />
                        </div>
                        <div>
                            <h3 className="text-white font-bold text-base">Editor de Equações</h3>
                            <p className="text-xs text-text-sec">LaTeX Support • KaTeX Engine</p>
                        </div>
                     </div>
                     <button onClick={handleSave} className="text-text-sec hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors">
                        <X size={20} />
                     </button>
                 </div>

                 <div className="flex flex-col md:flex-row h-[500px]">
                     {/* Coluna Esquerda: Editor e Toolbar */}
                     <div className="flex-1 flex flex-col border-r border-[#444746]">
                         
                         {/* Toolbar de Categorias */}
                         <div className="flex border-b border-[#444746] overflow-x-auto no-scrollbar bg-[#202020]">
                             {Object.keys(LATEX_TOOLS).map((cat) => (
                                 <button
                                    key={cat}
                                    onClick={() => setActiveTab(cat as any)}
                                    className={`px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors border-b-2 ${activeTab === cat ? 'border-brand text-brand bg-brand/5' : 'border-transparent text-text-sec hover:text-white'}`}
                                 >
                                     {cat}
                                 </button>
                             ))}
                         </div>

                         {/* Grid de Símbolos */}
                         <div className="p-3 grid grid-cols-4 sm:grid-cols-6 gap-2 bg-[#1a1a1a] max-h-[140px] overflow-y-auto custom-scrollbar border-b border-[#444746]">
                             {LATEX_TOOLS[activeTab].map((tool, idx) => (
                                 <button
                                    key={idx}
                                    onClick={() => insertSnippet(tool.code)}
                                    className="flex flex-col items-center justify-center p-2 rounded bg-[#2c2c2c] hover:bg-brand/20 hover:text-brand border border-transparent hover:border-brand/50 transition-all group"
                                    title={tool.label}
                                 >
                                     <span className="text-sm font-serif mb-1">{tool.icon}</span>
                                 </button>
                             ))}
                         </div>

                         {/* Área de Código */}
                         <div className="flex-1 relative bg-[#141414]">
                             <textarea
                               ref={inputRef}
                               autoFocus
                               value={latex}
                               onChange={(e) => setLatex(e.target.value)}
                               className="w-full h-full bg-transparent text-white font-mono text-sm p-4 outline-none resize-none leading-relaxed"
                               placeholder="Digite seu código LaTeX aqui (ex: E = mc^2)..."
                               spellCheck={false}
                             />
                             {/* AI Helper Button */}
                             <button 
                                onClick={handleExplainAi}
                                disabled={isAiLoading || !latex}
                                className="absolute bottom-4 right-4 bg-brand/10 hover:bg-brand/20 text-brand border border-brand/30 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 backdrop-blur-sm transition-all"
                             >
                                {isAiLoading ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12} />}
                                {isAiLoading ? 'Analisando...' : 'Explicar Fórmula'}
                             </button>
                         </div>
                     </div>

                     {/* Coluna Direita: Live Preview */}
                     <div className="flex-1 bg-[#1e1e1e] flex flex-col relative">
                         <div className="p-2 border-b border-[#444746] bg-[#252525] flex justify-between items-center">
                             <span className="text-xs font-bold text-text-sec uppercase tracking-wider flex items-center gap-2">
                                <Play size={10} className="fill-current"/> Visualização em Tempo Real
                             </span>
                             {errorMsg && <span className="text-xs text-red-400 font-bold bg-red-400/10 px-2 py-0.5 rounded">Erro de Sintaxe</span>}
                         </div>
                         
                         <div className="flex-1 flex items-center justify-center p-8 overflow-auto relative">
                             {/* Grid de fundo para contexto matemático */}
                             <div className="absolute inset-0 opacity-5 pointer-events-none" 
                                  style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
                             </div>
                             
                             <div ref={editorPreviewRef} className="text-2xl text-white relative z-10" />
                         </div>

                         {/* Painel de Explicação IA */}
                         {aiExplanation && (
                             <div className="p-4 bg-brand/5 border-t border-brand/20 animate-in slide-in-from-bottom-2">
                                 <h5 className="text-xs font-bold text-brand mb-1 flex items-center gap-1">
                                     <Sparkles size={10} /> Insight do Gemini
                                 </h5>
                                 <p className="text-xs text-gray-300 leading-relaxed">{aiExplanation}</p>
                             </div>
                         )}
                         
                         {errorMsg && (
                             <div className="p-3 bg-red-900/20 border-t border-red-500/30 text-red-200 text-xs font-mono break-all">
                                 {errorMsg}
                             </div>
                         )}
                     </div>
                 </div>

                 {/* Footer */}
                 <div className="flex justify-between items-center p-4 bg-[#252525] border-t border-[#444746]">
                    <div className="flex items-center gap-2 text-text-sec">
                        <HelpCircle size={14} />
                        <span className="text-xs">Para fechar sem salvar, clique 3x fora do modal.</span>
                    </div>
                    <button 
                        onClick={handleSave} 
                        className="bg-brand text-[#0b141a] px-8 py-2.5 rounded-full font-bold hover:brightness-110 flex items-center gap-2 transition-all shadow-lg hover:shadow-brand/20"
                    >
                        <Check size={18} /> Inserir Equação
                    </button>
                 </div>
             </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};
