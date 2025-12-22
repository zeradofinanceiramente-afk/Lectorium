import React from 'react';
import { Editor, BubbleMenu } from '@tiptap/react';
import { AlignLeft, AlignCenter, AlignRight, Trash2, Settings2, Image as ImageIcon, Crop } from 'lucide-react';

interface Props {
  editor: Editor;
  onOpenOptions: () => void;
}

export const ImageBubbleMenu: React.FC<Props> = ({ editor, onOpenOptions }) => {
  if (!editor || editor.isDestroyed) {
    return null;
  }

  const shouldShow = ({ editor }: { editor: Editor }) => {
    return editor.isActive('image');
  };

  const setAlign = (align: 'left' | 'center' | 'right') => {
    editor.chain().focus().setTextAlign(align).run();
  };

  const removeImage = () => {
    editor.chain().focus().deleteSelection().run();
  };

  const toggleCrop = () => {
    const isCropping = editor.getAttributes('image').isCropping;
    editor.commands.updateAttributes('image', { isCropping: !isCropping });
  };

  const isCropping = editor.getAttributes('image').isCropping;

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 100, zIndex: 50, maxWidth: 450, placement: 'bottom' }}
      shouldShow={shouldShow}
      className="flex bg-[#262626] shadow-2xl border border-border rounded-xl overflow-hidden animate-in fade-in zoom-in duration-200 p-1 gap-1 pointer-events-auto"
    >
      <button 
        onClick={() => setAlign('left')} 
        className={`p-2 hover:bg-white/10 rounded text-text ${editor.isActive({ textAlign: 'left' }) ? 'bg-white/10 text-brand' : ''}`}
        title="Alinhar à Esquerda"
      >
        <AlignLeft size={18}/>
      </button>
      <button 
        onClick={() => setAlign('center')} 
        className={`p-2 hover:bg-white/10 rounded text-text ${editor.isActive({ textAlign: 'center' }) ? 'bg-white/10 text-brand' : ''}`}
        title="Centralizar"
      >
        <AlignCenter size={18}/>
      </button>
      <button 
        onClick={() => setAlign('right')} 
        className={`p-2 hover:bg-white/10 rounded text-text ${editor.isActive({ textAlign: 'right' }) ? 'bg-white/10 text-brand' : ''}`}
        title="Alinhar à Direita"
      >
        <AlignRight size={18}/>
      </button>
      
      <div className="w-px bg-white/10 mx-1"></div>

      <button 
        onClick={toggleCrop} 
        className={`p-2 hover:bg-white/10 rounded text-text ${isCropping ? 'bg-brand text-bg shadow-sm' : ''}`}
        title="Recortar Imagem"
      >
        <Crop size={18}/>
      </button>
      
      <div className="w-px bg-white/10 mx-1"></div>
      
      <button 
        onClick={onOpenOptions} 
        className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 rounded text-sm font-medium transition-colors text-text"
      >
        <Settings2 size={16} />
        Opções
      </button>

      <div className="w-px bg-white/10 mx-1"></div>

      <button 
        onClick={removeImage} 
        className="p-2 hover:bg-red-500/10 text-text hover:text-red-400 rounded transition-colors"
        title="Remover imagem"
      >
        <Trash2 size={18} />
      </button>
    </BubbleMenu>
  );
};