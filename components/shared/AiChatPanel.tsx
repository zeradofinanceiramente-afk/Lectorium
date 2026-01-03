import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Loader2, User, Bot, Trash2, MessageSquare, FileSearch, Copy, Check, BrainCircuit, Database, BookOpen, Podcast } from 'lucide-react';
import { ChatMessage } from '../../types';
import { chatWithDocumentStream, findRelevantChunks, extractPageRangeFromQuery, generateDocumentBriefing } from '../../services/aiService';
import { semanticSearch } from '../../services/ragService';
import { useOptionalPdfContext } from '../../context/PdfContext';

interface Props {
  contextText: string;
  documentName: string;
  className?: string;
  fileId?: string; // Optional for RAG
  onIndexRequest?: () => Promise<void>; // Request to build index
  numPages?: number; // Nova prop para controle de features
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

export const AiChatPanel: React.FC<Props> = ({ contextText, documentName, className = "", fileId, onIndexRequest, numPages = 0 }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRagActive, setIsRagActive] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [isGeneratingBriefing, setIsGeneratingBriefing] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Safe Context Consumption
  const pdfContext = useOptionalPdfContext();
  const chatRequest = pdfContext?.chatRequest;
  const setChatRequest = pdfContext?.setChatRequest;
  const ocrMap = pdfContext?.ocrMap;

  // Limite rígido para modo direto
  const isDirectReadingAllowed = numPages < 17;

  useEffect(() => {
    // Força RAG/Semântico se o documento for longo (o "Leitura Direta" fica desativado)
    if (!isDirectReadingAllowed && fileId) {
        setIsRagActive(true);
    }
  }, [isDirectReadingAllowed, fileId]);

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

  const handleGenerateBriefing = async () => {
      if (isGeneratingBriefing || !contextText) return;
      
      setIsGeneratingBriefing(true);
      setMessages(prev => [...prev, { role: 'user', text: "Gere um Briefing Tático (Resumo e Tópicos) deste documento." }]);
      
      try {
          const summary = await generateDocumentBriefing(contextText);
          setMessages(prev => [...prev, { role: 'model', text: summary }]);
      } catch (e: any) {
          setMessages(prev => [...prev, { role: 'model', text: "Erro ao gerar briefing: " + e.message }]);
      } finally {
          setIsGeneratingBriefing(false);
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

        // 0. INTENT CHECK: Page Specific Request (ONLY WORKS IN PDF CONTEXT)
        const pageIntent = extractPageRangeFromQuery(userMessage);
        
        if (pageIntent && ocrMap && Object.keys(ocrMap).length > 0) {
            mode = "PAGE-SPECIFIC";
            const { start, end } = pageIntent;
            
            // Extrai o conteúdo direto do OCR Map
            const pagesContent: string[] = [];
            const min = Math.min(start, end);
            const max = Math.max(start, end);

            for (let i = min; i <= max; i++) {
                const pageWords = ocrMap[i];
                if (pageWords && Array.isArray(pageWords)) {
                    const text = pageWords.map(w => w.text).join(' ');
                    pagesContent.push(`[CONTEÚDO DA PÁGINA ${i}]:\n${text}`);
                } else {
                    pagesContent.push(`[PÁGINA ${i}]: (Sem texto detectado/OCR pendente)`);
                }
            }
            
            if (pagesContent.length > 0) {
                retrievalContext = `O usuário solicitou análise específica das páginas ${min}-${max}.\n\n${pagesContent.join('\n\n---\n\n')}`;
            }
        }

        // 1. Semantic Search (Vector RAG)
        if (!retrievalContext && fileId && isRagActive) {
            try {
                const results = await semanticSearch(fileId, userMessage);
                if (results.length > 0) {
                    retrievalContext = results.map(r => `[Trecho Relevante - Pág ${r.page || '?'}] ${r.text}`).join("\n\n---\n\n");
                    mode = "NEURAL-RAG";
                } else {
                    console.warn("RAG sem resultados, tentando fallback parcial.");
                }
            } catch (e) {
                console.warn("RAG failed", e);
            }
        }

        // 2. Fallback / Context Passed from Sidebar
        // Se RAG não achou nada ou está desligado, usamos o contextText (que agora é inteligente: full ou highlights)
        if (!retrievalContext) {
            retrievalContext = contextText;
        }

        if (!retrievalContext) {
            retrievalContext = "Documento vazio ou sem texto extraído. Sugira ao usuário realizar o OCR.";
        }

        console.log(`[SextaFeira] Mode: ${mode} | Context Length: ${retrievalContext.length}`);

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
    if (chatRequest && setChatRequest) {
        handleSend(chatRequest);
        setChatRequest(null);
    }
  }, [chatRequest, setChatRequest]);

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
              <span className="text-xs font-bold uppercase tracking-wider">Sexta-feira</span>
          </div>
          <div className="flex items-center gap-1">
              {/* Direct Mode Toggle (Hidden for Large Docs) */}
              {isDirectReadingAllowed && (
                  <button 
                    onClick={() => setIsRagActive(false)} 
                    className={`p-1.5 rounded transition-colors ${!isRagActive ? 'text-brand bg-brand/10 ring-1 ring-brand/30 shadow-[0_0_10px_-3px_var(--brand)]' : 'text-text-sec hover:text-white hover:bg-white/5'}`}
                    title="Modo Leitura Direta (100% Contexto)"
                  >
                      <BookOpen size={14} />
                  </button>
              )}

              {/* Semantic Mode Toggle */}
              {onIndexRequest && (
                  <button 
                    onClick={handleIndex} 
                    disabled={isIndexing}
                    className={`p-1.5 rounded transition-colors ${isRagActive ? 'text-purple-400 bg-purple-500/10 ring-1 ring-purple-500/30 shadow-[0_0_10px_-3px_#a855f7]' : 'text-text-sec hover:text-white hover:bg-white/5'}`}
                    title={isRagActive ? "Memória Neural Ativa" : "Ativar Busca Semântica (RAG)"}
                  >
                      {isIndexing ? <Loader2 size={14} className="animate-spin"/> : <BrainCircuit size={14} />}
                  </button>
              )}
              
              <div className="w-px h-4 bg-white/10 mx-1"></div>

              <button onClick={clearChat} className="p-1.5 text-text-sec hover:text-red-400 transition-colors hover:bg-white/5 rounded" title="Limpar Chat">
                  <Trash2 size={14} />
              </button>
          </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-black/20">
          {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-4 opacity-70">
                  <div className="relative">
                      <Sparkles size={48} className="text-brand animate-pulse" />
                      {!isDirectReadingAllowed && <div className="absolute -top-2 -right-2 bg-yellow-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-yellow-300">Resumo</div>}
                  </div>
                  <div className="space-y-1">
                      <p className="text-sm font-bold text-text">Sexta-feira online.</p>
                      <p className="text-xs text-text-sec">Analisando: {documentName}</p>
                  </div>
                  
                  {/* Status Indicator */}
                  {isRagActive ? (
                      <div className="flex items-center gap-1 text-[10px] text-purple-400 bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20">
                          <BrainCircuit size={12} /> RAG Ativo {!isDirectReadingAllowed ? '(Obrigatório)' : ''}
                      </div>
                  ) : (
                      <div className="flex items-center gap-1 text-[10px] text-brand bg-brand/10 px-2 py-1 rounded border border-brand/20">
                          <BookOpen size={12} /> {isDirectReadingAllowed ? 'Leitura Direta' : 'Modo Destaques'}
                      </div>
                  )}

                  <p className="text-[10px] text-gray-500 max-w-[200px]">
                      {!isDirectReadingAllowed 
                        ? "Documento extenso. Focarei nos seus destaques e no meu conhecimento acadêmico." 
                        : "Pergunte sobre o conteúdo completo do documento."}
                  </p>

                  {/* NotebookLM Style Action */}
                  <button 
                    onClick={handleGenerateBriefing}
                    disabled={isGeneratingBriefing}
                    className="mt-4 flex items-center gap-2 bg-[#2c2c2c] hover:bg-[#3c3c3c] border border-gray-600 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-lg group"
                  >
                      {isGeneratingBriefing ? <Loader2 size={14} className="animate-spin" /> : <Podcast size={14} className="text-pink-400 group-hover:scale-110 transition-transform" />}
                      Gerar Guia de Estudo
                  </button>
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
                          {isRagActive ? "Consultando vetores neurais..." : "Lendo destaques e contexto..."}
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
                placeholder={isRagActive ? "Busca semântica ativa..." : "Pergunte sobre seus destaques..."}
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
          {!isDirectReadingAllowed && !isRagActive && (
              <div className="text-[10px] text-gray-500 mt-2 text-center flex justify-center gap-1">
                  <span>ℹ️</span>
                  <span>Modo Econômico: Analisando apenas seus destaques e notas.</span>
              </div>
          )}
      </div>
    </div>
  );
};