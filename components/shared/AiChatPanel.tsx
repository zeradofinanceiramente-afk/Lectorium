
import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Loader2, User, Bot, Trash2, MessageSquare, FileSearch, Copy, Check, BrainCircuit, Database } from 'lucide-react';
import { ChatMessage } from '../../types';
import { chatWithDocumentStream, findRelevantChunks } from '../../services/aiService';
import { semanticSearch } from '../../services/ragService';
import { usePdfContext } from '../../context/PdfContext';

interface Props {
  contextText: string;
  documentName: string;
  className?: string;
  fileId?: string; // Optional for RAG
  onIndexRequest?: () => Promise<void>; // Request to build index
}

const MessageItem: React.FC<{ m: ChatMessage }> = ({ m }) => {
    const [copied, setCopied] = useState(false);

    const onCopy = () => {
        if (!m.text) return;
        navigator.clipboard.writeText(m.text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
      <div className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${m.role === 'user' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-brand/10 border-brand/30 text-brand'}`}>
              {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
          </div>
          <div className={`max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed ${m.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-surface border border-border text-text rounded-tl-none'}`}>
              <div className="whitespace-pre-wrap select-text selection:bg-brand/30 selection:text-white">{m.text}</div>
              
              {m.role === 'model' && m.text && (
                  <div className="mt-2 pt-2 border-t border-white/5 flex justify-end">
                      <button 
                        onClick={onCopy} 
                        className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-text-sec hover:text-brand transition-colors px-2 py-1 hover:bg-white/5 rounded"
                        title="Copiar resposta"
                      >
                          {copied ? <Check size={12} /> : <Copy size={12} />}
                          {copied ? 'Copiado' : 'Copiar'}
                      </button>
                  </div>
              )}
          </div>
      </div>
    );
};

export const AiChatPanel: React.FC<Props> = ({ contextText, documentName, className = "", fileId, onIndexRequest }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRagActive, setIsRagActive] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const { chatRequest, setChatRequest } = usePdfContext();

  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleIndex = async () => {
      if (onIndexRequest && !isIndexing) {
          setIsIndexing(true);
          try {
              await onIndexRequest();
              setIsRagActive(true);
          } catch (e) {
              console.error(e);
          } finally {
              setIsIndexing(false);
          }
      }
  };

  // Main sending logic
  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride || input;
    
    if (!textToSend.trim() || isLoading) return;

    const userMessage = textToSend.trim();
    setInput("");
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
        // --- HYBRID RETRIEVAL STRATEGY ---
        let retrievalContext = "";
        let mode = "TEXT-MATCH";

        // 1. Try Semantic Search (Vector RAG)
        if (fileId && isRagActive) {
            try {
                const results = await semanticSearch(fileId, userMessage);
                if (results.length > 0) {
                    retrievalContext = results.map(r => `[Página ${r.page || '?'}] ${r.text}`).join("\n\n---\n\n");
                    mode = "NEURAL-RAG";
                }
            } catch (e) {
                console.warn("RAG failed, falling back to text match", e);
            }
        }

        // 2. Fallback to Keyword Match (Classic) if RAG failed or empty
        if (!retrievalContext && contextText) {
            const chunks = findRelevantChunks(contextText, userMessage);
            retrievalContext = chunks.join("\n\n---\n\n");
        }

        // 3. Fallback message
        if (!retrievalContext) {
            retrievalContext = "Documento vazio ou sem texto extraído disponível.";
        }

        console.log(`[LectoriumAI] Mode: ${mode} | Context Length: ${retrievalContext.length}`);

        const stream = chatWithDocumentStream(retrievalContext, messages, userMessage);
        let assistantText = "";
        
        setMessages(prev => [...prev, { role: 'model', text: "" }]);

        for await (const chunk of stream) {
            assistantText += chunk;
            setMessages(prev => {
                const next = [...prev];
                next[next.length - 1].text = assistantText;
                return next;
            });
        }
    } catch (e: any) {
        setMessages(prev => [...prev, { role: 'model', text: "Erro ao processar sua pergunta: " + e.message }]);
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    if (chatRequest) {
        handleSend(chatRequest);
        setChatRequest(null);
    }
  }, [chatRequest]);

  const clearChat = () => {
    if (confirm("Limpar histórico do chat?")) setMessages([]);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
      e.stopPropagation();
  };

  return (
    <div className={`flex flex-col h-full bg-bg ${className}`} onContextMenu={handleContextMenu}>
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between bg-surface/50">
          <div className="flex items-center gap-2 text-brand">
              <MessageSquare size={16} />
              <span className="text-xs font-bold uppercase tracking-wider">Lectorium AI</span>
          </div>
          <div className="flex items-center gap-1">
              {onIndexRequest && (
                  <button 
                    onClick={handleIndex} 
                    disabled={isIndexing || isRagActive}
                    className={`p-1.5 rounded transition-colors ${isRagActive ? 'text-purple-400' : 'text-text-sec hover:text-white'}`}
                    title={isRagActive ? "Memória Neural Ativa" : "Criar Índice Semântico"}
                  >
                      {isIndexing ? <Loader2 size={14} className="animate-spin"/> : <BrainCircuit size={14} />}
                  </button>
              )}
              <button onClick={clearChat} className="p-1.5 text-text-sec hover:text-red-400 transition-colors" title="Limpar Chat">
                  <Trash2 size={14} />
              </button>
          </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-black/20">
          {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-4 opacity-40">
                  <Sparkles size={48} className="text-brand animate-pulse" />
                  <div className="space-y-1">
                      <p className="text-sm font-bold text-text">Pergunte ao Documento</p>
                      <p className="text-xs text-text-sec">Analisando: {documentName}</p>
                  </div>
                  {onIndexRequest && !isRagActive && !isIndexing && (
                      <button 
                        onClick={handleIndex}
                        className="bg-brand/10 border border-brand/20 px-3 py-1.5 rounded-full text-[10px] text-brand hover:bg-brand/20 transition-colors flex items-center gap-2"
                      >
                          <Database size={12} /> Ativar Busca Semântica
                      </button>
                  )}
                  {isRagActive && (
                      <div className="flex items-center gap-1 text-[10px] text-purple-400 bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20">
                          <BrainCircuit size={12} /> Memória Neural Ativa
                      </div>
                  )}
              </div>
          )}

          {messages.map((m, i) => (
              <MessageItem key={i} m={m} />
          ))}

          {isLoading && messages[messages.length-1]?.role === 'user' && (
              <div className="flex gap-3 animate-in fade-in slide-in-from-left-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border bg-brand/10 border-brand/30 text-brand">
                      <FileSearch size={16} className="animate-pulse" />
                  </div>
                  <div className="bg-surface border border-border rounded-2xl rounded-tl-none p-3 flex items-center gap-3">
                      <div className="text-xs text-text-sec italic">
                          {isRagActive ? "Consultando vetores..." : "Lendo contexto..."}
                      </div>
                      <div className="flex gap-1">
                          <div className="w-1.5 h-1.5 bg-brand rounded-full animate-bounce"></div>
                          <div className="w-1.5 h-1.5 bg-brand rounded-full animate-bounce [animation-delay:0.2s]"></div>
                          <div className="w-1.5 h-1.5 bg-brand rounded-full animate-bounce [animation-delay:0.4s]"></div>
                      </div>
                  </div>
              </div>
          )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border bg-surface/30">
          <div className="relative group">
              <textarea 
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                    }
                }}
                placeholder="Perguntar sobre o arquivo..."
                className="w-full bg-bg border border-border rounded-xl py-3 pl-4 pr-12 text-sm text-text focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all resize-none max-h-32"
              />
              <button 
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-brand text-bg rounded-lg hover:brightness-110 disabled:opacity-30 transition-all"
              >
                  <Send size={18} />
              </button>
          </div>
      </div>
    </div>
  );
};
