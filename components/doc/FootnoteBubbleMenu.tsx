import React, { useState, useEffect, useRef } from 'react';
import { Editor, BubbleMenu } from '@tiptap/react';
import { MessageSquareQuote, Check } from 'lucide-react';

interface Props {
  editor: Editor;
}

export const FootnoteBubbleMenu: React.FC<Props> = ({ editor }) => {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Track last known selection position to prevent refocusing on typing updates
  const lastSelectionFromRef = useRef<number | null>(null);

  useEffect(() => {
    // Check if active
    if (editor.isActive('footnote')) {
      const { from } = editor.state.selection;
      
      // Only update and focus if the selection actually moved (new footnote or just opened)
      if (lastSelectionFromRef.current !== from) {
          lastSelectionFromRef.current = from;
          
          const node = editor.state.doc.nodeAt(from);
          if (node && node.type.name === 'footnote') {
            setContent(node.attrs.content || '');
            
            // Force focus aggressively
            setTimeout(() => {
                textareaRef.current?.focus({ preventScroll: true });
                // Move cursor to end
                const len = textareaRef.current?.value.length || 0;
                textareaRef.current?.setSelectionRange(len, len);
            }, 50);
          }
      }
    } else {
        lastSelectionFromRef.current = null;
    }
  }, [editor.state.selection.from, editor.isActive('footnote')]);

  const updateContent = () => {
    if (editor.isActive('footnote')) {
        editor.commands.updateAttributes('footnote', { content });
    }
  };

  const handleSaveAndClose = () => {
      updateContent();
      editor.chain().focus().run(); // Return focus to editor document
  };

  const shouldShow = ({ editor }: { editor: Editor }) => {
    return editor.isActive('footnote');
  };

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ 
        duration: 100, 
        zIndex: 99999, // Ensure absolute top priority above everything
        maxWidth: 400, 
        placement: 'bottom' 
      }}
      shouldShow={shouldShow}
      className="flex flex-col bg-[#1e1e1e] shadow-2xl border border-border rounded-xl overflow-hidden p-3 gap-2 min-w-[320px] pointer-events-auto z-[99999] ring-1 ring-brand/50"
    >
      <div className="flex items-center gap-2 text-xs font-bold text-brand uppercase tracking-wider mb-1">
        <MessageSquareQuote size={14} /> Editar Nota de Rodapé
      </div>
      
      <textarea
        ref={textareaRef}
        autoFocus
        className="w-full bg-[#141414] text-white text-sm p-3 rounded-lg border border-[#444746] focus:border-brand outline-none resize-none h-28 custom-scrollbar shadow-inner"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Digite o texto da nota..."
        onBlur={updateContent}
        onKeyDown={(e) => {
            // Allow Shift+Enter for new lines, Enter to save/close
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSaveAndClose();
            }
        }}
      />
      
      <div className="flex justify-between items-center mt-1">
         <span className="text-[10px] text-text-sec">Pressione Enter para salvar</span>
         <button 
           onClick={handleSaveAndClose}
           className="text-xs flex items-center gap-1 bg-brand text-bg px-3 py-1.5 rounded-lg font-bold hover:brightness-110 shadow-md transition-all"
         >
            <Check size={12} /> Salvar
         </button>
      </div>
    </BubbleMenu>
  );
};