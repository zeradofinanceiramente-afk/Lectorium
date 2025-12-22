import React from 'react';
import { Editor, BubbleMenu } from '@tiptap/react';
import { Check, X, PenTool } from 'lucide-react';

interface Props {
  editor: Editor;
}

export const SuggestionBubbleMenu: React.FC<Props> = ({ editor }) => {
  if (!editor || editor.isDestroyed) {
    return null;
  }

  const shouldShow = ({ editor }: { editor: Editor }) => {
    return editor.isActive('suggestion-addition') || editor.isActive('suggestion-deletion');
  };

  const isAddition = editor.isActive('suggestion-addition');
  const typeLabel = isAddition ? 'Inserção' : 'Exclusão';

  const handleAccept = () => {
    if (isAddition) {
        // @ts-ignore
        editor.chain().focus().extendMarkRange('suggestion-addition').acceptSuggestion().run();
    } else {
        // @ts-ignore
        editor.chain().focus().extendMarkRange('suggestion-deletion').acceptSuggestion().run();
    }
  };

  const handleReject = () => {
    if (isAddition) {
        // @ts-ignore
        editor.chain().focus().extendMarkRange('suggestion-addition').rejectSuggestion().run();
    } else {
        // @ts-ignore
        editor.chain().focus().extendMarkRange('suggestion-deletion').rejectSuggestion().run();
    }
  };

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 100, zIndex: 9999, maxWidth: 300, placement: 'top' }}
      shouldShow={shouldShow}
      className="flex flex-col bg-[#1e1e1e] shadow-2xl border border-border rounded-xl overflow-hidden p-2 gap-2 min-w-[200px] pointer-events-auto ring-1 ring-brand/50 animate-in fade-in zoom-in"
    >
      <div className="flex items-center justify-between px-2 pb-1 border-b border-white/10">
          <span className="text-xs font-bold text-brand uppercase tracking-wider flex items-center gap-2">
            <PenTool size={12} /> Sugestão: {typeLabel}
          </span>
      </div>
      
      <div className="flex gap-2">
         <button 
           onClick={handleAccept}
           className="flex-1 flex items-center justify-center gap-1 bg-green-500/10 hover:bg-green-500/20 text-green-500 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-green-500/30"
           title="Aceitar Sugestão"
         >
            <Check size={14} /> Aceitar
         </button>
         <button 
           onClick={handleReject}
           className="flex-1 flex items-center justify-center gap-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-red-500/30"
           title="Rejeitar Sugestão"
         >
            <X size={14} /> Rejeitar
         </button>
      </div>
    </BubbleMenu>
  );
};