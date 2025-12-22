
import React, { useEffect, useState } from 'react';
import { Editor } from '@tiptap/react';
import { Hash, ChevronRight } from 'lucide-react';

interface Props {
  editor: Editor | null;
  isOpen: boolean;
  onClose: () => void;
}

export const OutlineSidebar: React.FC<Props> = ({ editor, isOpen, onClose }) => {
  const [headings, setHeadings] = useState<{ level: number, text: string, pos: number }[]>([]);

  useEffect(() => {
    if (!editor) return;

    const updateHeadings = () => {
      const items: { level: number, text: string, pos: number }[] = [];
      const { doc } = editor.state;
      
      doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
          items.push({
            level: node.attrs.level,
            text: node.textContent,
            pos
          });
        }
      });
      setHeadings(items);
    };

    updateHeadings();
    editor.on('update', updateHeadings);
    return () => { editor.off('update', updateHeadings); };
  }, [editor]);

  if (!isOpen) return null;

  return (
    <div className="absolute inset-y-0 left-0 z-[50] w-64 bg-[#1e1e1e] border-r border-[#444746] shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
      <div className="flex items-center justify-between p-4 border-b border-[#444746]">
        <h3 className="font-bold text-[#e3e3e3] flex items-center gap-2">
          <Hash size={18} className="text-brand" />
          Estrutura
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <ChevronRight size={20} className="rotate-180" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        {headings.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm italic">
                Adicione títulos (H1, H2...) para ver a estrutura aqui.
            </div>
        ) : (
            <div className="flex flex-col gap-1">
                {headings.map((h, i) => (
                    <button
                      key={i}
                      onClick={() => {
                          editor?.chain().setTextSelection(h.pos).scrollIntoView().run();
                      }}
                      className="text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white rounded truncate transition-colors"
                      style={{ paddingLeft: `${(h.level - 1) * 12 + 12}px` }}
                    >
                       {h.text || <span className="opacity-30 italic">Sem título</span>}
                    </button>
                ))}
            </div>
        )}
      </div>
    </div>
  );
};
