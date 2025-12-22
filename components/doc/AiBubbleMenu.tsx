import React, { useState } from 'react';
import { Editor, BubbleMenu } from '@tiptap/react';
import { GoogleGenAI } from "@google/genai";
import { Sparkles, Loader2, RefreshCw, Scissors, Wand2, Bold, Italic, Link, ChevronRight } from 'lucide-react';

interface Props {
  editor: Editor;
}

export const AiBubbleMenu: React.FC<Props> = ({ editor }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showAiSubmenu, setShowAiSubmenu] = useState(false);

  const processAi = async (promptType: 'rewrite' | 'summarize' | 'expand') => {
    const selection = editor.state.selection;
    const text = editor.state.doc.textBetween(selection.from, selection.to, ' ');
    
    if (!text || text.length < 5) return;

    setIsLoading(true);
    try {
      // Fix: Initialize GoogleGenAI with process.env.API_KEY directly as per guidelines
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      let prompt = "";
      if (promptType === 'rewrite') prompt = `Reescreva o seguinte texto de forma mais clara, profissional e corrigida:\n"${text}"`;
      if (promptType === 'summarize') prompt = `Resuma o seguinte texto em um único parágrafo conciso:\n"${text}"`;
      if (promptType === 'expand') prompt = `Expanda o seguinte texto com mais detalhes e contexto relevante:\n"${text}"`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview', // Fix: Use correct model for task
        contents: prompt
      });

      const result = response.text;
      if (result) {
        editor.chain().focus().insertContent(result).run();
      }
    } catch (e) {
      console.error(e);
      alert("Erro na IA. Verifique sua conexão.");
    } finally {
      setIsLoading(false);
      setShowAiSubmenu(false);
    }
  };

  const toggleLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) {
      return;
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    // Se já existe um link, estende a seleção para cobrir todo o link antes de atualizar
    if (previousUrl) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  // Only show if selection is not empty AND not an image (Image has its own menu)
  const shouldShow = ({ editor }: { editor: Editor }) => {
    return !editor.state.selection.empty && !editor.isActive('image');
  };

  return (
    <BubbleMenu 
      editor={editor} 
      tippyOptions={{ duration: 100, zIndex: 50, maxWidth: 400 }} 
      shouldShow={shouldShow}
      className="flex bg-[#262626] shadow-2xl border border-border rounded-xl overflow-hidden animate-in fade-in zoom-in duration-200"
    >
      {isLoading ? (
        <div className="flex items-center gap-2 px-4 py-2 text-sm text-brand">
           <Loader2 size={16} className="animate-spin" />
           Processando...
        </div>
      ) : showAiSubmenu ? (
        <>
          <button 
            onClick={() => processAi('rewrite')}
            className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-sm font-medium transition-colors text-text"
          >
            <RefreshCw size={14} className="text-blue-400"/>
            Reescrever
          </button>
          <div className="w-px bg-white/10 my-1"></div>
          <button 
            onClick={() => processAi('summarize')}
            className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-sm font-medium transition-colors text-text"
          >
            <Scissors size={14} className="text-orange-400"/>
            Resumir
          </button>
          <div className="w-px bg-white/10 my-1"></div>
          <button 
            onClick={() => processAi('expand')}
            className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-sm font-medium transition-colors text-text"
          >
            <Wand2 size={14} className="text-purple-400"/>
            Expandir
          </button>
          <div className="w-px bg-white/10 my-1"></div>
          <button onClick={() => setShowAiSubmenu(false)} className="px-2 py-2 hover:bg-white/10 text-text-sec text-xs">
             Voltar
          </button>
        </>
      ) : (
        <>
          {/* Formatação Rápida */}
          <button 
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`px-3 py-2 hover:bg-white/10 transition-colors ${editor.isActive('bold') ? 'text-brand' : 'text-text'}`}
            title="Negrito"
          >
            <Bold size={16} />
          </button>
          <button 
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`px-3 py-2 hover:bg-white/10 transition-colors ${editor.isActive('italic') ? 'text-brand' : 'text-text'}`}
            title="Itálico"
          >
            <Italic size={16} />
          </button>
          <button 
            onClick={toggleLink}
            className={`px-3 py-2 hover:bg-white/10 transition-colors ${editor.isActive('link') ? 'text-brand' : 'text-text'}`}
            title="Link"
          >
            <Link size={16} />
          </button>

          <div className="w-px bg-white/10 my-1"></div>

          {/* Botão para abrir Submenu IA */}
          <button 
            onClick={() => setShowAiSubmenu(true)}
            className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-sm font-medium transition-colors text-text group"
            title="Assistente IA"
          >
            <Sparkles size={16} className="text-purple-400 group-hover:scale-110 transition-transform" />
            <span className="hidden sm:inline">IA</span>
            <ChevronRight size={14} className="text-text-sec" />
          </button>
        </>
      )}
    </BubbleMenu>
  );
};