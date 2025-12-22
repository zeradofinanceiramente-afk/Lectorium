
import React, { useState, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { X, MessageSquarePlus, Check, Trash2, User } from 'lucide-react';

export interface CommentData {
  id: string;
  text: string;
  author: string;
  createdAt: string;
  selectedText?: string;
}

interface Props {
  editor: Editor | null;
  isOpen: boolean;
  onClose: () => void;
  comments: CommentData[];
  onAddComment: (text: string) => void;
  onResolveComment: (id: string) => void;
  onDeleteComment: (id: string) => void;
  activeCommentId: string | null;
  setActiveCommentId: (id: string | null) => void;
}

export const CommentsSidebar: React.FC<Props> = ({ 
  editor, isOpen, onClose, comments, onAddComment, onResolveComment, onDeleteComment, activeCommentId, setActiveCommentId 
}) => {
  const [newCommentText, setNewCommentText] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (activeCommentId) {
        const el = document.getElementById(`comment-card-${activeCommentId}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeCommentId]);

  const handleCreate = () => {
    if (newCommentText.trim()) {
      onAddComment(newCommentText);
      setNewCommentText('');
      setIsAdding(false);
    }
  };

  const handleCancel = () => {
    setIsAdding(false);
    setNewCommentText('');
  };

  // Check selection
  const canComment = editor && !editor.state.selection.empty;

  if (!isOpen) return null;

  return (
    <div className="absolute inset-y-0 right-0 z-[55] w-80 bg-[#1e1e1e] border-l border-[#444746] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      <div className="flex items-center justify-between p-4 border-b border-[#444746]">
        <h3 className="font-bold text-[#e3e3e3] flex items-center gap-2">
          <MessageSquarePlus size={18} className="text-brand" />
          Comentários
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-[#141414]">
        
        {/* Add New Box */}
        {isAdding ? (
           <div className="bg-[#262626] p-3 rounded-lg border border-brand shadow-lg animate-in fade-in zoom-in-95">
              <div className="text-xs text-brand font-bold mb-2">Novo Comentário</div>
              <textarea 
                autoFocus
                className="w-full bg-[#1e1e1e] text-white text-sm p-2 rounded border border-[#444746] focus:border-brand outline-none resize-none mb-2"
                rows={3}
                placeholder="Escreva seu comentário..."
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleCreate();
                    }
                }}
              />
              <div className="flex justify-end gap-2">
                  <button onClick={handleCancel} className="text-xs px-3 py-1.5 text-gray-400 hover:text-white">Cancelar</button>
                  <button onClick={handleCreate} className="text-xs px-3 py-1.5 bg-brand text-[#0b141a] font-bold rounded hover:brightness-110">Comentar</button>
              </div>
           </div>
        ) : (
           <button 
             onClick={() => setIsAdding(true)}
             disabled={!canComment}
             className={`w-full py-3 rounded-lg border border-dashed flex items-center justify-center gap-2 text-sm transition-all ${canComment ? 'border-[#444746] text-gray-400 hover:border-brand hover:text-brand hover:bg-brand/5' : 'border-[#333] text-[#444] cursor-not-allowed'}`}
           >
             <MessageSquarePlus size={16} />
             {canComment ? "Adicionar à seleção" : "Selecione texto para comentar"}
           </button>
        )}

        {/* List */}
        {comments.length === 0 && !isAdding && (
            <div className="text-center py-10 text-gray-500 text-sm">
                Nenhum comentário ainda.
            </div>
        )}

        {comments.map(c => (
            <div 
              key={c.id} 
              id={`comment-card-${c.id}`}
              onClick={() => setActiveCommentId(c.id)}
              className={`bg-[#262626] rounded-lg p-3 border transition-all cursor-pointer group ${activeCommentId === c.id ? 'border-brand ring-1 ring-brand' : 'border-[#444746] hover:border-gray-500'}`}
            >
                <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-900/50 flex items-center justify-center text-blue-200 text-xs border border-blue-700">
                            <User size={12} />
                        </div>
                        <div>
                            <div className="text-xs font-bold text-gray-200">{c.author || 'Usuário'}</div>
                            <div className="text-[10px] text-gray-500">{new Date(c.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                        </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); onResolveComment(c.id); }} className="p-1 hover:bg-green-900/30 text-green-500 rounded" title="Resolver"><Check size={14}/></button>
                        <button onClick={(e) => { e.stopPropagation(); onDeleteComment(c.id); }} className="p-1 hover:bg-red-900/30 text-red-500 rounded" title="Excluir"><Trash2 size={14}/></button>
                    </div>
                </div>
                
                {c.selectedText && (
                    <div className="mb-2 pl-2 border-l-2 border-[#444746] text-xs text-gray-500 italic truncate">
                        "{c.selectedText}"
                    </div>
                )}

                <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{c.text}</div>
            </div>
        ))}

      </div>
    </div>
  );
};
