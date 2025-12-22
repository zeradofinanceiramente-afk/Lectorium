
import React from 'react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import { Copy, Terminal, Check, ChevronDown, FileText, Download, ClipboardPaste } from 'lucide-react';

const EXTENSION_MAP: Record<string, string> = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  html: 'html',
  css: 'css',
  json: 'json',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  csharp: 'cs',
  rust: 'rs',
  go: 'go',
  sql: 'sql',
  bash: 'sh',
  shell: 'sh',
  yaml: 'yaml',
  markdown: 'md',
  xml: 'xml',
  php: 'php',
  ruby: 'rb',
  swift: 'swift',
  kotlin: 'kt',
  lua: 'lua',
  r: 'r',
};

export default (props: any) => {
  const { node, updateAttributes, extension, editor, getPos } = props;
  const [copied, setCopied] = React.useState(false);

  // Calcula o número de linhas baseado no conteúdo atual do nó
  const codeContent = node.textContent || "";
  const numberOfLines = codeContent.split('\n').length;

  const handleCopy = () => {
    navigator.clipboard.writeText(codeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const processPaste = (text: string) => {
    if (!text) return;

    if (editor && typeof getPos === 'function') {
        const pos = getPos();
        const endPos = pos + node.nodeSize;
        const { from, to } = editor.state.selection;
        
        // Verifica se a seleção está dentro deste bloco
        const isInside = from > pos && to < endPos;
        
        if (isInside) {
            // Cola na posição do cursor
            editor.chain().focus().insertContent(text).run();
        } else {
            // Substitui todo o conteúdo
            editor.chain().focus()
                .setTextSelection({ from: pos + 1, to: endPos - 1 })
                .insertContent(text)
                .run();
        }
    }
  };

  const handlePaste = async () => {
    try {
        const text = await navigator.clipboard.readText();
        processPaste(text);
    } catch (e) {
        console.warn("Clipboard API blocked. Asking user manually.");
        // Fallback robusto para quando a permissão é negada (comum em iframes/previews)
        const text = window.prompt("O navegador bloqueou o acesso direto à área de transferência.\n\nPara colar, pressione Ctrl+V na caixa abaixo e clique em OK:");
        if (text) {
            processPaste(text);
        }
    }
  };

  const handleDownload = () => {
    let filename = node.attrs.title || 'snippet';
    const lang = node.attrs.language || 'text';
    
    // Auto-append extension if missing
    if (!filename.includes('.')) {
        const ext = EXTENSION_MAP[lang] || 'txt';
        filename = `${filename}.${ext}`;
    }

    const blob = new Blob([codeContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const languages = extension.options.lowlight.listLanguages();

  return (
    <NodeViewWrapper className="code-block-wrapper my-6 w-full rounded-xl overflow-hidden border border-[#333] shadow-2xl bg-[#282c34] text-[#abb2bf] font-mono text-sm leading-6 relative group">
      
      {/* IDE Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#21252b] border-b border-[#181a1f] select-none h-10">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex gap-1.5 group-hover:opacity-100 transition-opacity">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
          </div>
          
          <div className="h-4 w-px bg-[#3e4451] mx-2"></div>
          
          {/* Language Select */}
          <div className="relative group/select flex items-center shrink-0">
            <Terminal size={12} className="text-[#5c6370] mr-2" />
            <select
              contentEditable={false}
              defaultValue={node.attrs.language || 'auto'}
              onChange={(event) => updateAttributes({ language: event.target.value })}
              className="bg-transparent text-[10px] font-bold text-[#abb2bf] outline-none cursor-pointer hover:text-white font-mono uppercase tracking-wider appearance-none pr-4 transition-colors max-w-[80px]"
            >
              <option value="null">TEXT</option>
              {languages.map((lang: string) => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
            <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-[#5c6370] group-hover/select:text-white transition-colors"/>
          </div>

          <div className="h-4 w-px bg-[#3e4451] mx-1"></div>

          {/* Title Input */}
          <div className="flex items-center flex-1 min-w-0 group/title">
             <FileText size={12} className="text-[#5c6370] mr-2 group-focus-within/title:text-brand transition-colors" />
             <input 
               type="text"
               value={node.attrs.title || ''}
               onChange={(e) => updateAttributes({ title: e.target.value })}
               // Stop propagation to prevent Tiptap form hijacking focus or key events
               onMouseDown={(e) => e.stopPropagation()}
               onPointerDown={(e) => e.stopPropagation()}
               onKeyDown={(e) => e.stopPropagation()}
               placeholder="nome-do-arquivo..."
               className="bg-transparent text-xs text-[#abb2bf] placeholder:text-[#5c6370] outline-none border-none w-full font-sans truncate focus:text-white transition-colors"
               spellCheck={false}
             />
          </div>
        </div>

        <div className="flex items-center gap-1">
            <button 
              onClick={handlePaste} 
              className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded transition-all shrink-0 ml-2 text-[#5c6370] hover:text-[#abb2bf] hover:bg-[#3e4451]"
              title="Colar (Substituir ou Inserir)"
              onMouseDown={(e) => e.preventDefault()} // Prevent focus loss
            >
              <ClipboardPaste size={12} />
            </button>

            <button 
              onClick={handleDownload} 
              className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded transition-all shrink-0 ml-1 text-[#5c6370] hover:text-[#abb2bf] hover:bg-[#3e4451]"
              title="Baixar arquivo"
            >
              <Download size={12} />
            </button>

            <button 
              onClick={handleCopy} 
              className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded transition-all shrink-0 ml-1 ${copied ? 'text-green-400 bg-green-400/10' : 'text-[#5c6370] hover:text-[#abb2bf] hover:bg-[#3e4451]'}`}
              title="Copiar código"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              <span className="hidden sm:inline">{copied ? 'COPIADO' : 'COPIAR'}</span>
            </button>
        </div>
      </div>

      {/* Editor Body with Max Height & Scroll */}
      <div className="flex relative max-h-[500px] overflow-y-auto custom-scrollbar bg-[#282c34]">
        {/* Gutter (Line Numbers) */}
        <div 
            className="flex flex-col items-end flex-shrink-0 min-w-[3rem] bg-[#21252b] text-[#495162] border-r border-[#181a1f] select-none py-4 pr-3 text-xs leading-6 font-mono sticky left-0 z-10"
            contentEditable={false}
            style={{ counterReset: 'line' }}
        >
            {Array.from({ length: numberOfLines }).map((_, i) => (
                <span key={i} className="inline-block w-full text-right hover:text-[#abb2bf] transition-colors cursor-pointer">{i + 1}</span>
            ))}
        </div>

        {/* Code Content Area - Horizontal Scrolling Enabled */}
        <div className="flex-1 overflow-x-auto py-4 pl-4 relative w-full scrollbar-thin scrollbar-thumb-[#3e4451] scrollbar-track-transparent">
             <NodeViewContent 
                as="code" 
                className={`language-${node.attrs.language} !whitespace-pre !font-mono !text-sm !leading-6 block min-w-full w-max`} 
             />
        </div>
      </div>
    </NodeViewWrapper>
  );
};
