
import { GoogleGenAI, Type } from "@google/genai";
import { ChatMessage, MindMapData } from "../types";
import { getStoredApiKey } from "../utils/apiKeyUtils";

// --- CONFIG ---
const getAiClient = () => {
  // 1. Tenta a chave do usuário primeiro (LocalStorage)
  const userKey = getStoredApiKey();
  if (userKey) {
    return new GoogleGenAI({ apiKey: userKey });
  }
  // 2. Fallback para a chave do ambiente (se existir)
  if (process.env.API_KEY) {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
  throw new Error("Chave de API não configurada. Por favor, adicione sua chave nas configurações.");
};

// Utils
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- RAG UTILS (Local Search) ---

// Stopwords básicas em Português e Inglês para melhorar a busca
const STOP_WORDS = new Set([
  'o', 'a', 'os', 'as', 'um', 'uma', 'de', 'do', 'da', 'em', 'no', 'na', 'para', 'com', 'por', 'que', 'e', 'é', 
  'the', 'a', 'an', 'of', 'in', 'on', 'for', 'with', 'by', 'that', 'and', 'is', 'to'
]);

// Divide o texto em blocos lógicos (parágrafos)
export function chunkText(fullText: string, maxChunkSize = 1000): string[] {
  const cleanText = fullText.replace(/\r\n/g, '\n');
  let rawChunks = cleanText.split(/\n\s*\n/);
  const finalChunks: string[] = [];
  for (const chunk of rawChunks) {
    if (chunk.length > maxChunkSize) {
      const sentences = chunk.match(/[^.!?]+[.!?]+[\])'"]*/g) || [chunk];
      let currentChunk = "";
      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > maxChunkSize) {
          finalChunks.push(currentChunk.trim());
          currentChunk = sentence;
        } else {
          currentChunk += sentence;
        }
      }
      if (currentChunk) finalChunks.push(currentChunk.trim());
    } else if (chunk.trim().length > 30) {
      finalChunks.push(chunk.trim());
    }
  }
  return finalChunks;
}

function scoreChunk(chunk: string, queryTerms: string[]): number {
  const normalizedChunk = chunk.toLowerCase();
  let score = 0;
  const EXACT_MATCH_BONUS = 3;
  const PARTIAL_MATCH_BONUS = 1;
  for (const term of queryTerms) {
    if (normalizedChunk.includes(term)) {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      const matches = normalizedChunk.match(regex);
      if (matches) {
        score += matches.length * EXACT_MATCH_BONUS;
      } else {
        score += PARTIAL_MATCH_BONUS;
      }
    }
  }
  return score;
}

export function findRelevantChunks(documentText: string, query: string, topK = 4): string[] {
  if (!documentText) return [];
  const queryTerms = query.toLowerCase()
    .replace(/[^\w\sà-ú]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  if (queryTerms.length === 0) return [documentText.slice(0, 2000)];
  const chunks = chunkText(documentText);
  const scoredChunks = chunks.map(chunk => ({
    text: chunk,
    score: scoreChunk(chunk, queryTerms)
  }));
  scoredChunks.sort((a, b) => b.score - a.score);
  const hasMatches = scoredChunks.some(c => c.score > 0);
  const relevant = hasMatches ? scoredChunks.filter(c => c.score > 0) : scoredChunks;
  return relevant.slice(0, topK).map(c => c.text);
}

/**
 * Detecta intenção de leitura de página específica na query.
 * Suporta: "página 10", "pg 5-8", "pág 2 a 4", "pag 12 ate 15"
 */
export function extractPageRangeFromQuery(query: string): { start: number, end: number } | null {
  const clean = query.toLowerCase();
  // Regex robusto para capturar padrões de página
  // Grupo 1: Página inicial
  // Grupo 2: Página final (opcional)
  const regex = /(?:p[áa]gina|p[áa]g|pg)\.?\s*(\d+)(?:\s*(?:a|at[ée]| |-)\s*(\d+))?/i;
  
  const match = clean.match(regex);
  if (match) {
     const start = parseInt(match[1]);
     // Se não houver segundo grupo, o final é igual ao inicial (página única)
     const end = match[2] ? parseInt(match[2]) : start;
     
     if (!isNaN(start)) {
         return { start, end: isNaN(end) ? start : end };
     }
  }
  return null;
}

// --- AI FUNCTIONS ---

/**
 * Gera embeddings vetoriais com Rate Limiting para evitar 429.
 */
export async function generateEmbeddings(texts: string[]): Promise<Float32Array[]> {
  const ai = getAiClient();
  const model = "text-embedding-004";
  
  const embeddings: Float32Array[] = [];
  
  // Rate Limit: Free tier permite ~15-30 requests/min. 
  // Adicionamos delay de 1.5s entre chamadas para segurança.
  const DELAY_MS = 1500;

  for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (!text || typeof text !== 'string' || !text.trim()) {
          embeddings.push(new Float32Array(0));
          continue;
      }

      try {
          // Pequeno delay entre requests para não estourar a cota
          if (i > 0) await sleep(DELAY_MS);

          const result = await ai.models.embedContent({
              model: model,
              content: { parts: [{ text: text.trim() }] }
          });
          
          if (result.embedding && result.embedding.values) {
              embeddings.push(new Float32Array(result.embedding.values));
          } else {
              console.warn("Embedding vazio retornado para:", text.slice(0, 20));
              embeddings.push(new Float32Array(0)); 
          }
      } catch (e: any) {
          // Se der erro 429, espera mais tempo e tenta uma vez
          if (e.message?.includes('429')) {
              console.warn("Rate limit hit (Embedding). Waiting 10s...");
              await sleep(10000);
              try {
                  const retryResult = await ai.models.embedContent({
                      model: model,
                      content: { parts: [{ text: text.trim() }] }
                  });
                  if (retryResult.embedding && retryResult.embedding.values) {
                      embeddings.push(new Float32Array(retryResult.embedding.values));
                      continue;
                  }
              } catch (retryErr) {
                  console.error("Retry failed:", retryErr);
              }
          }
          console.error("Erro ao gerar embedding:", e.message || e);
          embeddings.push(new Float32Array(0));
      }
  }
  return embeddings;
}

/**
 * Gera um Briefing estilo NotebookLM (Resumo Estruturado).
 * Processa apenas uma amostra significativa se o texto for muito longo.
 */
export async function generateDocumentBriefing(fullText: string): Promise<string> {
    const ai = getAiClient();
    
    // Se o texto for absurdamente grande (> 50k chars), pegamos amostras para o resumo inicial
    // para evitar estourar tokens logo de cara.
    let textToAnalyze = fullText;
    if (fullText.length > 50000) {
        const start = fullText.slice(0, 15000); // Intro
        const middle = fullText.slice(Math.floor(fullText.length / 2) - 10000, Math.floor(fullText.length / 2) + 10000);
        const end = fullText.slice(fullText.length - 15000); // Conclusão/Anexos
        textToAnalyze = `[INÍCIO DO DOCUMENTO]\n${start}\n...\n[MEIO DO DOCUMENTO]\n${middle}\n...\n[FIM DO DOCUMENTO]\n${end}`;
    }

    const prompt = `Analise o seguinte documento acadêmico/técnico e crie um "Briefing Tático" (Estilo NotebookLM).
    
    Estruture a resposta em Markdown com estas seções exatas:
    1. **Resumo Executivo**: Um parágrafo denso explicando o propósito central do documento.
    2. **Tópicos Chave**: Lista bullet-point dos 5-7 temas mais importantes.
    3. **Perguntas Sugeridas**: 3 perguntas complexas que este documento responde (para o usuário clicar e perguntar).
    
    TEXTO DO DOCUMENTO:
    ${textToAnalyze}`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                temperature: 0.3
            }
        });
        return response.text || "Não foi possível gerar o briefing.";
    } catch (e: any) {
        if (e.message?.includes('429')) return "Tráfego intenso. Tente gerar o briefing novamente em alguns instantes.";
        throw e;
    }
}

export async function extractNewspaperContent(base64Image: string, mimeType: string) {
  const ai = getAiClient();
  const prompt = `Você é um arquivista digital. Analise esta página de jornal histórico.
  O documento foi pré-processado para destacar a estrutura visual.
  1. Identifique as notícias seguindo a hierarquia de colunas (da esquerda para a direita).
  2. Extraia o título e o corpo de cada matéria.
  3. Reconstrua parágrafos que possam ter sido interrompidos por quebras de coluna.
  4. Identifique entidades (nomes, datas, locais) citadas.
  Retorne os dados em JSON estruturado.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            articles: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  content: { type: Type.STRING },
                  columnSpan: { type: Type.STRING, description: "Ex: 'Coluna 1' ou 'Colunas 1-2'" },
                  sentiment: { type: Type.STRING },
                  summary: { type: Type.STRING }
                },
                required: ["title", "content"]
              }
            },
            publication: { type: Type.STRING },
            inferredDate: { type: Type.STRING }
          }
        }
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Historical extraction failed", e);
    throw e;
  }
}

export async function refineOcrWords(words: string[]): Promise<string[]> {
  const ai = getAiClient();
  const prompt = `Abaixo está uma lista de palavras de um documento antigo extraídas via OCR.
  O fluxo de leitura foi preservado respeitando as colunas originais do layout.
  Corrija erros de reconhecimento tipográfico (ex: 'f' lido como 's', '1' como 'l') mantendo o sentido acadêmico.
  IMPORTANTE: Retorne exatamente o mesmo número de itens.
  
  PALAVRAS:
  ${words.join(' ')}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            correctedWords: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["correctedWords"]
        }
      }
    });
    const result = JSON.parse(response.text || '{"correctedWords": []}');
    const corrected = result.correctedWords || [];
    if (corrected.length === words.length) return corrected;
    return words;
  } catch (e) {
    return words;
  }
}

export async function expandNodeWithAi(nodeText: string, context: string): Promise<string[]> {
  const ai = getAiClient();
  const prompt = `Sugira 3 conceitos para expandir "${nodeText}" no contexto de "${context}". Curto e direto. JSON array.`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    return JSON.parse(response.text || "[]");
  } catch (e) {
    return [];
  }
}

export async function generateMindMapAi(topic: string): Promise<MindMapData> {
    const ai = getAiClient();
    const prompt = `Crie uma estrutura inicial de mapa mental para o assunto: "${topic}".
    Retorne um JSON seguindo exatamente esta interface:
    interface MindMapNode {
      id: string; text: string; x: number; y: number; width: number; height: number; color: string; parentId?: string; isRoot?: boolean; shape?: 'rectangle' | 'circle' | 'pill';
    }
    interface MindMapEdge { id: string; from: string; to: string; }
    interface MindMapData { nodes: MindMapNode[]; edges: MindMapEdge[]; viewport: {x: number, y: number, zoom: number}; }
    
    Regras:
    1. O nó raiz (isRoot: true) deve estar em x:0, y:0.
    2. Crie de 4 a 7 sub-nós distribuídos ao redor.
    3. Use cores vibrantes acadêmicas.
    4. O JSON deve ser o único retorno.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        return JSON.parse(response.text || "{}");
    } catch (e) {
        console.error("AI MindMap generation failed", e);
        throw new Error("Falha ao gerar mapa com IA.");
    }
}

/**
 * Chat Stream with Local RAG Strategy
 * Now accepts a contextString directly (pre-retrieved via RAG or regex)
 */
export async function* chatWithDocumentStream(contextString: string, history: ChatMessage[], message: string) {
  const ai = getAiClient();
  
  // Mapear histórico do formato interno para o formato do Gemini SDK
  const previousHistory = history.slice(0, -1).map(msg => ({
    role: msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.text }],
  }));

  const systemInstruction = `Você é a Sexta-feira (F.R.I.D.A.Y.), a inteligência tática operacional do sistema Lectorium.
Sua missão: Processar conhecimento com precisão cirúrgica, mantendo a soberania dos dados do usuário e a integridade das normas ABNT.

DIRETRIZES DE COMPORTAMENTO (PROTOCOLO STARK):
1. Identidade: Você se chama Sexta-feira. Use pronomes femininos. Refira-se ao usuário como "Chefe", "Admin" ou diretamente, com um tom de lealdade técnica.
2. Tom de Voz: Direta, eficiente, com leves toques de sagacidade (witty), mas extremamente competente. Evite floreios desnecessários. Respostas curtas e densas em informação.
3. Fontes Híbridas (RAG + Web):
   * Prioridade zero: CONTEXTO RELEVANTE fornecido (PDF do usuário).
   * Enriquecimento: Use conhecimentos externos acadêmicos (livros, artigos clássicos) para expandir o tema, mas avise quando sair do documento.

PROTOCOLOS DE CITAÇÃO E REFERÊNCIA (RIGOROSO):
1. Fontes Internas (PDF/Contexto): Use estritamente \`[Página X]\` para referenciar o texto do usuário.
2. Fontes Externas (Seu Conhecimento):
   * No texto: Use o padrão autor-data (SOBRENOME, Ano). Ex: (FOUCAULT, 1975).
   * OBRIGATÓRIO: Se você citar ou usar conceitos de qualquer fonte externa que não esteja no contexto, adicione uma seção chamada "### Referências Táticas" ao final da resposta.
   * Formato Bibliográfico: SOBRENOME, Nome. *Título da obra*. Edição. Cidade: Editora, Ano. (Use o formato ABNT padrão).
3. Formatação: Texto plano limpo. Sem Markdown excessivo (** ou _). Use listas numeradas ou hifens.

📚 CONTEXTO TÁTICO RELEVANTE (LOCAL-FIRST DATA):
${contextString || "Documento vazio ou contexto não encontrado. Aguardando input visual ou textual."}

Ao responder, integre conceitos de autores clássicos e contemporâneos relevantes ao tema, mas diferencie claramente o que está no PDF (Página X) do que vem de fora (Autor, Ano).`;

  try {
    const chat = ai.chats.create({
      model: 'gemini-3-flash-preview',
      history: previousHistory,
      config: { systemInstruction, temperature: 0.2 }
    });
    
    // RETRY LOGIC (Auto-Recovery Protocol)
    let stream;
    let attempt = 0;
    const maxRetries = 3;

    while (true) {
        try {
            stream = await chat.sendMessageStream({ message });
            break; // Success
        } catch (err: any) {
            attempt++;
            
            // Check specifically for 429 (Quota Exceeded)
            const isQuotaError = err.message?.includes('429') || err.message?.includes('quota');
            
            if (attempt >= maxRetries) {
                if (isQuotaError) throw new Error("Cota de tráfego excedida (429). Tente novamente em 1 minuto.");
                throw err;
            }
            
            // Backoff exponencial agressivo para 429: 2s, 5s, 10s
            const waitTime = isQuotaError ? Math.pow(2.5, attempt) * 1000 : Math.pow(2, attempt) * 1000;
            
            console.warn(`[SextaFeira] Conexão instável (${isQuotaError ? '429' : 'Err'}). Retentativa ${attempt}/${maxRetries} em ${waitTime}ms...`);
            await sleep(waitTime);
        }
    }
    
    if (stream) {
        for await (const chunk of stream) {
            yield chunk.text || "";
        }
    }
  } catch (e: any) {
    const errorMessage = e.message || String(e);
    
    if (errorMessage.includes('API key')) {
        yield "Erro: Chave de API inválida ou não configurada. Configure no menu lateral.";
    } else if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('Cota')) {
        yield "🚦 **Alerta de Tráfego (429):** Muitos dados enviados. \n\n**Solução:** Ative o modo **Memória Neural (RAG)** no topo do chat para não enviar o documento inteiro, ou aguarde alguns instantes.";
    } else {
        // Expose the real error for debugging
        yield `Erro na conexão neural [STATUS: FALHA].\nDetalhes do Erro: ${errorMessage}\n\nTentando restabelecer link...`;
    }
  }
}
