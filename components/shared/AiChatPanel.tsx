import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Loader2, User, Bot, Trash2, MessageSquare, FileSearch } from 'lucide-react';
import { ChatMessage } from '../../types';
import { chatWithDocumentStream } from '../../services/aiService';
import { usePdfContext } from '../../context/PdfContext';

interface Props {
  contextText: string;
  documentName: string;
  className?: string;
}

export const AiChatPanel: React.FC<Props> = ({ contextText, documentName, className = "" }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Consume context to check for incoming "Explain" requests
  const { chatRequest, setChatRequest } = usePdfContext();

  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Main sending logic
  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride || input;
    
    if (!textToSend.trim() || isLoading || !contextText) return;

    const userMessage = textToSend.trim();
    setInput("");
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
        const stream = chatWithDocumentStream(contextText, messages, userMessage);
        let assistantText = "";
        
        // Adiciona mensagem vazia do assistente para ir preenchendo
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

  // Watch for external chat requests (from selection menu "Explain")
  useEffect(() => {
    if (chatRequest) {
        handleSend(chatRequest);
        setChatRequest(null); // Clear request after processing
    }
  }, [chatRequest]);

  const clearChat = () => {
    if (confirm("Limpar histórico do chat?")) setMessages([]);
  };

  return (
    <div className={`flex flex-col h-full bg-bg ${className}`}>
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between bg-surface/50">
          <div className="flex items-center gap-2 text-brand">
              <MessageSquare size={16} />
              <span className="text-xs font-bold uppercase tracking-wider">Chat com Documento</span>
          </div>
          <button onClick={clearChat} className="p-1.5 text-text-sec hover:text-red-400 transition-colors" title="Limpar Chat">
              <Trash2 size={14} />
          </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-black/20">
          {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-4 opacity-40">
                  <Sparkles size={48} className="text-brand animate-pulse" />
                  <div className="space-y-1">
                      <p className="text-sm font-bold text-text">Pergunte qualquer coisa</p>
                      <p className="text-xs text-text-sec">IA analisando: {documentName}</p>
                  </div>
                  <div className="bg-brand/10 p-2 rounded text-[10px] text-brand border border-brand/20">
                      Modo: Pesquisa Contextual (RAG)
                  </div>
              </div>
          )}

          {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${m.role === 'user' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-brand/10 border-brand/30 text-brand'}`}>
                      {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                  </div>
                  <div className={`max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed ${m.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-surface border border-border text-text rounded-tl-none'}`}>
                      <div className="whitespace-pre-wrap">{m.text}</div>
                  </div>
              </div>
          ))}

          {isLoading && messages[messages.length-1]?.role === 'user' && (
              <div className="flex gap-3 animate-in fade-in slide-in-from-left-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border bg-brand/10 border-brand/30 text-brand">
                      <FileSearch size={16} className="animate-pulse" />
                  </div>
                  <div className="bg-surface border border-border rounded-2xl rounded-tl-none p-3 flex items-center gap-3">
                      <div className="text-xs text-text-sec italic">
                          Analisando documento...
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
          <p className="text-[9px] text-text-sec mt-2 text-center opacity-50 uppercase font-bold tracking-tighter">Powered by Gemini 3 Flash</p>
      </div>
    </div>
  );
};