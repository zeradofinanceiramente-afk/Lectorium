
import React, { useState } from 'react';
import { 
  X, BookOpen, FileText, Workflow, Cloud, 
  WifiOff, Zap, BrainCircuit, ScanLine, PenTool 
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const SECTIONS = [
  {
    id: 'intro',
    title: 'Visão Geral',
    icon: BookOpen,
    content: (
      <div className="space-y-4">
        <h3 className="text-xl font-bold text-white">Bem-vindo ao Lectorium</h3>
        <p className="text-text-sec">
          O Lectorium é um Workspace Acadêmico projetado para unir leitura profunda, gestão de conhecimento e produção textual em um único lugar.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="bg-[#2c2c2c] p-4 rounded-xl border border-border">
            <div className="flex items-center gap-2 mb-2 text-brand">
              <Cloud size={18} />
              <span className="font-bold text-sm">Google Drive Nativo</span>
            </div>
            <p className="text-xs text-gray-400">
              Não armazenamos seus arquivos. Tudo é sincronizado diretamente com seu Google Drive. O que você edita aqui, aparece lá.
            </p>
          </div>
          
          <div className="bg-[#2c2c2c] p-4 rounded-xl border border-border">
            <div className="flex items-center gap-2 mb-2 text-yellow-500">
              <WifiOff size={18} />
              <span className="font-bold text-sm">Modo Offline PWA</span>
            </div>
            <p className="text-xs text-gray-400">
              Instale o App. Seus arquivos recentes e fixados ficam disponíveis mesmo sem internet. A sincronização ocorre quando a conexão voltar.
            </p>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'pdf',
    title: 'Leitor PDF & OCR',
    icon: FileText,
    content: (
      <div className="space-y-4">
        <h3 className="text-xl font-bold text-white">Leitura Ativa</h3>
        <p className="text-text-sec">
          Nosso leitor PDF foca em extração de conhecimento, não apenas visualização.
        </p>

        <ul className="space-y-3 mt-2">
          <li className="flex gap-3 items-start bg-black/20 p-3 rounded-lg">
            <ScanLine className="text-brand shrink-0 mt-1" size={18} />
            <div>
              <strong className="text-gray-200 block text-sm">OCR Integrado</strong>
              <p className="text-xs text-gray-500">PDFs digitalizados como imagem? Clique em "Ler Página" na barra lateral para extrair texto selecionável.</p>
            </div>
          </li>
          <li className="flex gap-3 items-start bg-black/20 p-3 rounded-lg">
            <BrainCircuit className="text-purple-400 shrink-0 mt-1" size={18} />
            <div>
              <strong className="text-gray-200 block text-sm">IA Contextual</strong>
              <p className="text-xs text-gray-500">Selecione qualquer trecho e use o menu flutuante para pedir à IA que explique conceitos complexos.</p>
            </div>
          </li>
          <li className="flex gap-3 items-start bg-black/20 p-3 rounded-lg">
            <Zap className="text-yellow-400 shrink-0 mt-1" size={18} />
            <div>
              <strong className="text-gray-200 block text-sm">Fichamento Automático</strong>
              <p className="text-xs text-gray-500">Seus destaques e notas são compilados automaticamente na barra lateral, prontos para exportação.</p>
            </div>
          </li>
        </ul>
      </div>
    )
  },
  {
    id: 'mindmap',
    title: 'Mapas Mentais',
    icon: Workflow,
    content: (
      <div className="space-y-4">
        <h3 className="text-xl font-bold text-white">Organização de Ideias</h3>
        <p className="text-text-sec">
          Crie conexões visuais entre conceitos. Os mapas são salvos como arquivos <code>.mindmap</code> no seu Drive.
        </p>

        <div className="space-y-2 mt-4">
          <h4 className="text-sm font-bold text-brand uppercase">Atalhos e Dicas</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-[#2c2c2c] p-2 rounded flex justify-between items-center">
              <span className="text-gray-400">Expandir com IA</span>
              <span className="text-white font-mono">Toolbar</span>
            </div>
            <div className="bg-[#2c2c2c] p-2 rounded flex justify-between items-center">
              <span className="text-gray-400">Criar filho</span>
              <span className="text-white font-mono">Botão +</span>
            </div>
            <div className="bg-[#2c2c2c] p-2 rounded flex justify-between items-center">
              <span className="text-gray-400">Editar Texto</span>
              <span className="text-white font-mono">Duplo Clique</span>
            </div>
            <div className="bg-[#2c2c2c] p-2 rounded flex justify-between items-center">
              <span className="text-gray-400">Mover Canvas</span>
              <span className="text-white font-mono">Arrastar Fundo</span>
            </div>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'doc',
    title: 'Editor Acadêmico',
    icon: PenTool,
    content: (
      <div className="space-y-4">
        <h3 className="text-xl font-bold text-white">Escrita Estruturada</h3>
        <p className="text-text-sec">
          Um editor de texto focado em normas acadêmicas e compatibilidade com Microsoft Word (.docx).
        </p>

        <div className="space-y-3 mt-2">
          <div className="p-3 border-l-2 border-brand bg-brand/5 rounded-r-lg">
            <h5 className="text-sm font-bold text-white mb-1">Padrões ABNT</h5>
            <p className="text-xs text-gray-400">
              O editor já vem configurado com estilos para Citações Longas (recuo de 4cm), Títulos numerados e referências bibliográficas.
            </p>
          </div>
          
          <div className="p-3 border-l-2 border-blue-500 bg-blue-500/5 rounded-r-lg">
            <h5 className="text-sm font-bold text-white mb-1">Citações e Referências</h5>
            <p className="text-xs text-gray-400">
              Use o menu <strong>Inserir &gt; Citação</strong> para adicionar referências bibliográficas estruturadas sem se preocupar com a formatação manual.
            </p>
          </div>

          <div className="p-3 border-l-2 border-purple-500 bg-purple-500/5 rounded-r-lg">
            <h5 className="text-sm font-bold text-white mb-1">Ferramentas Avançadas</h5>
            <p className="text-xs text-gray-400">
              Suporte para fórmulas LaTeX, diagramas Mermaid e blocos de código com syntax highlighting.
            </p>
          </div>
        </div>
      </div>
    )
  }
];

export const GlobalHelpModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [activeSection, setActiveSection] = useState('intro');

  if (!isOpen) return null;

  const currentContent = SECTIONS.find(s => s.id === activeSection)?.content;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#1e1e1e] text-[#e3e3e3] rounded-3xl shadow-2xl w-full max-w-4xl h-[80vh] flex overflow-hidden border border-[#444746] animate-in zoom-in-95">
        
        {/* Sidebar Navigation */}
        <div className="w-1/3 md:w-64 bg-[#141414] border-r border-[#333] flex flex-col">
          <div className="p-6 border-b border-[#333]">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <BookOpen className="text-brand" size={20}/>
              Central de Ajuda
            </h2>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-colors ${
                  activeSection === section.id 
                    ? 'bg-brand text-[#0b141a] font-bold shadow-lg shadow-brand/20' 
                    : 'text-gray-400 hover:bg-[#2c2c2c] hover:text-white'
                }`}
              >
                <section.icon size={18} />
                <span className="text-sm">{section.title}</span>
              </button>
            ))}
          </div>

          <div className="p-4 border-t border-[#333]">
            <button onClick={onClose} className="w-full py-2 bg-[#2c2c2c] hover:bg-[#3c3c3c] rounded-lg text-sm font-medium transition-colors">
              Fechar
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col relative bg-[#1e1e1e]">
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full md:hidden"
          >
            <X size={24} />
          </button>

          <div className="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar">
            <div className="max-w-2xl mx-auto animate-in slide-in-from-right-4 duration-300 key={activeSection}">
              {currentContent}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
