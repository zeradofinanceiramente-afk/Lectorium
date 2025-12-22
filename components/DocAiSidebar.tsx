
import React from 'react';
import { X, MessageSquare, Sparkles } from 'lucide-react';
import { AiChatPanel } from './shared/AiChatPanel';
import { Editor } from '@tiptap/react';

interface Props {
  editor: Editor | null;
  isOpen: boolean;
  onClose: () => void;
  documentName: string;
}

export const DocAiSidebar: React.FC<Props> = ({ editor, isOpen, onClose, documentName }) => {
  if (!isOpen) return null;

  const documentText = editor?.getText() || "";

  return (
    <div className="absolute inset-y-0 right-0 z-[55] w-80 md:w-96 bg-[#1e1e1e] border-l border-[#444746] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      <div className="flex items-center justify-between p-4 border-b border-[#444746] bg-surface">
        <h3 className="font-bold text-[#e3e3e3] flex items-center gap-2 text-sm uppercase tracking-widest">
          <Sparkles size={18} className="text-brand" />
          Assistente Gemini
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
          <AiChatPanel 
            contextText={documentText} 
            documentName={documentName}
          />
      </div>
    </div>
  );
};
