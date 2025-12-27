
import React, { useState, useEffect, useRef } from 'react';
import { Editor, BubbleMenu } from '@tiptap/react';
import { MessageSquareQuote, Check } from 'lucide-react';

interface Props {
  editor: Editor;
}

export const FootnoteBubbleMenu: React.FC<Props> = ({ editor }) => {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Helper para obter o nó da nota selecionada
  const getSelectedFootnote = () => {
      const { selection } = editor.state;
      const node = editor.state.doc.nodeAt(selection.from);
      return (node && node.type.name === 'footnote') ? node : null;
  };

  const selectedNode = getSelectedFootnote();
  const isFootnoteSelected = !!selectedNode;

  // Sincroniza o conteúdo local com o atributo do nó quando a seleção muda
  useEffect(() => {
    if (isFootnoteSelected && selectedNode) {
        const nodeContent = selectedNode.attrs.content || '';
        
        // Só atualiza se for diferente para evitar loop ou reset enquanto digita
        // Usamos uma verificação simples: se acabamos de selecionar (mudou ID ou posição)
        // ou se o conteúdo no editor é diferente do estado local.
        if (content !== nodeContent) {
             setContent(nodeContent);
        }
        
        // Auto-foco se estiver vazio (nova nota)
        if (!nodeContent && textareaRef.current) {
             // Pequeno timeout para garantir que o menu renderizou
             setTimeout(() => textareaRef.current?.focus({ preventScroll: true }), 50);
        }
    }
  }, [editor.state.selection.from, selectedNode?.attrs.id]);

  const updateContent = (newContent: string) => {
    setContent(newContent);
    if (isFootnoteSelected) {
        // Atualiza em tempo real no documento
        editor.commands.updateAttributes('footnote', { content: newContent });
    }
  };

  const handleSaveAndClose = () => {
      // Move o cursor para depois da nota para continuar digitando
      const { selection } = editor.state;
      const node = editor.state.doc.nodeAt(selection.from);
      if (node) {
          editor.chain()
            .focus()
            .setTextSelection(selection.from + node.nodeSize)
            .run();
      }
  };

  const shouldShow = ({ editor }: { editor: Editor }) => {
    return editor.isActive('footnote');
  };

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ 
        duration: 100, 
        zIndex: 99999,
        maxWidth: 400, 
        placement: 'bottom',
        interactive: true,
      }}
      shouldShow={shouldShow}
      className="flex flex-col bg-[#1e1e1e] shadow-2xl border border-border rounded-xl overflow-hidden p-3 gap-2 min-w-[320px] pointer-events-auto z-[99999] ring-1 ring-brand/50"
    >
      <div className="flex items-center gap-2 text-xs font-bold text-brand uppercase tracking-wider mb-1">
        <MessageSquareQuote size={14} /> Editar Nota de Rodapé {selectedNode?.attrs.id > 0 ? `#${selectedNode.attrs.id}` : ''}
      </div>
      
      <textarea
        ref={textareaRef}
        className="w-full bg-[#141414] text-white text-sm p-3 rounded-lg border border-[#444746] focus:border-brand outline-none resize-none h-28 custom-scrollbar shadow-inner"
        value={content}
        onChange={(e) => updateContent(e.target.value)}
        placeholder="Digite o texto da nota..."
        onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSaveAndClose();
            }
        }}
      />
      
      <div className="flex justify-between items-center mt-1">
         <span className="text-[10px] text-text-sec">Enter para sair</span>
         <button 
           onClick={handleSaveAndClose}
           className="text-xs flex items-center gap-1 bg-brand text-bg px-3 py-1.5 rounded-lg font-bold hover:brightness-110 shadow-md transition-all"
         >
            <Check size={12} /> Concluído
         </button>
      </div>
    </BubbleMenu>
  );
};
