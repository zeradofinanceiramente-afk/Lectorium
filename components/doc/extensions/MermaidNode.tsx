
import React, { useState, useEffect, useRef } from 'react';
import { NodeViewProps } from '@tiptap/react';
import mermaid from 'mermaid';
import { Workflow, Edit2, X, Check, HelpCircle } from 'lucide-react';
import { LazyNodeView } from './LazyNodeView';

mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    primaryColor: '#e2e8f0', 
    primaryTextColor: '#000000',
    lineColor: '#334155',
    fontSize: '14px',
    fontFamily: 'Inter, system-ui, sans-serif',
  }
});

export default (props: NodeViewProps) => {
  const { node, updateAttributes } = props;
  const [isEditing, setIsEditing] = useState(false);
  const [chart, setChart] = useState(node.attrs.chart || 'graph TD\nA[Início] --> B{Processo}\nB -->|Sim| C[Fim]\nB -->|Não| A');
  const containerRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(`mermaid-${Math.random().toString(36).substr(2, 9)}`);
  
  // State for 3-click close logic
  const [backdropClicks, setBackdropClicks] = useState(0);

  useEffect(() => {
    let active = true;
    const render = async () => {
      if (!containerRef.current) return;
      try {
        containerRef.current.innerHTML = '';
        const { svg } = await mermaid.render(idRef.current, chart);
        if (active && containerRef.current) {
            containerRef.current.innerHTML = svg;
        }
      } catch (e) {
        if (containerRef.current) containerRef.current.innerHTML = '<div class="text-red-500 text-xs p-2 border border-red-200 bg-red-50 rounded">Erro na sintaxe do diagrama</div>';
      }
    };
    render();
    return () => { active = false; };
  }, [chart]);

  const updateChart = (val: string) => {
    setChart(val);
    updateAttributes({ chart: val });
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (backdropClicks + 1 >= 3) {
      setIsEditing(false);
      setBackdropClicks(0);
    } else {
      setBackdropClicks(prev => prev + 1);
    }
  };

  return (
    <LazyNodeView node={node} updateAttributes={updateAttributes} label="Diagrama Mermaid" minHeight={150}>
      <div className="relative group p-4 rounded hover:bg-black/5 border border-transparent hover:border-gray-300 transition-colors flex justify-center">
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-10">
            <button 
                onClick={() => { setIsEditing(true); setBackdropClicks(0); }} 
                className="p-1.5 bg-white rounded-full text-gray-700 shadow-sm border border-gray-200 hover:text-brand"
                title="Editar Diagrama"
            >
                <Edit2 size={14}/>
            </button>
        </div>

        <div ref={containerRef} className="flex justify-center min-h-[100px] overflow-x-auto w-full" />

        {isEditing && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm cursor-default" onClick={handleBackdropClick}>
             <div 
                className="bg-[#1e1e1e] border border-[#444746] rounded-2xl shadow-2xl p-6 w-full max-w-2xl relative animate-in zoom-in-95 flex flex-col h-[80vh]"
                onClick={(e) => e.stopPropagation()}
             >
                 <div className="flex justify-between items-center mb-4 border-b border-[#444746] pb-3 shrink-0">
                     <span className="text-lg text-white font-bold flex items-center gap-2">
                        <Workflow size={20} className="text-brand"/> Editor Mermaid
                     </span>
                     <button onClick={() => setIsEditing(false)} className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-white/10">
                        <X size={20} />
                     </button>
                 </div>

                 <div className="flex flex-1 gap-4 overflow-hidden">
                     {/* Editor */}
                     <div className="flex-1 flex flex-col gap-2">
                         <label className="text-xs text-gray-400 font-bold uppercase">Código</label>
                         <textarea
                           autoFocus
                           value={chart}
                           onChange={(e) => updateChart(e.target.value)}
                           className="bg-[#141414] border border-[#444746] rounded-xl p-4 text-xs font-mono text-white outline-none focus:border-brand w-full h-full resize-none leading-relaxed shadow-inner"
                           placeholder="graph TD..."
                         />
                     </div>
                     
                     {/* Preview in Modal (Optional but nice) */}
                     <div className="flex-1 flex flex-col gap-2 bg-white rounded-xl p-4 overflow-auto border border-[#444746] shadow-inner">
                         <label className="text-xs text-gray-500 font-bold uppercase mb-2 block">Visualização</label>
                         <div 
                             dangerouslySetInnerHTML={{ __html: containerRef.current?.innerHTML || '' }} 
                             className="flex justify-center p-2 [&_text]:!fill-black"
                         />
                     </div>
                 </div>

                 <div className="flex justify-between items-center mt-6 shrink-0">
                    <div className="flex items-center gap-2">
                        <a href="https://mermaid.js.org/intro/" target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline flex items-center gap-1">
                            <HelpCircle size={12} /> Documentação
                        </a>
                        <span className="text-xs text-gray-500 ml-2">Clique 3x fora para fechar</span>
                    </div>
                    <button 
                        onClick={() => setIsEditing(false)} 
                        className="bg-brand text-[#0b141a] px-6 py-2 rounded-full font-bold hover:brightness-110 flex items-center gap-2 transition-all"
                    >
                        <Check size={16} /> Concluir
                    </button>
                 </div>
             </div>
          </div>
        )}
      </div>
    </LazyNodeView>
  );
};
