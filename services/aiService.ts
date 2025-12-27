
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
 * Gera embeddings vetoriais para uma lista de textos usando o modelo text-embedding-004.
 * Retorna uma lista de vetores (Float32Array) correspondentes.
 */
export async function generateEmbeddings(texts: string[]): Promise<Float32Array[]> {
  const ai = getAiClient();
  const model = "text-embedding-004";
  
  // Limita o batch para evitar erros de limite da API
  // O modelo embedding suporta batch, mas vamos ser conservadores
  const embeddings: Float32Array[] = [];
  
  for (const text of texts) {
      if (!text || typeof text !== 'string' || !text.trim()) {
          embeddings.push(new Float32Array(0));
          continue;
      }

      try {
          const result = await ai.models.embedContent({
              model: model,
              content: { parts: [{ text: text.trim() }] }
          });
          
          if (result.embedding && result.embedding.values) {
              embeddings.push(new Float32Array(result.embedding.values));
          } else {
              // Fallback vetor zero ou skip? Melhor skip para não sujar a busca.
              // Mas para manter índice alinhado, pushamos null ou zero.
              console.warn("Embedding vazio retornado para:", text.slice(0, 20));
              embeddings.push(new Float32Array(0)); 
          }
      } catch (e: any) {
          console.error("Erro ao gerar embedding:", e.message || e);
          embeddings.push(new Float32Array(0));
      }
  }
  return embeddings;
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
    
    const responseStream = await chat.sendMessageStream({ message });
    
    for await (const chunk of responseStream) {
      yield chunk.text || "";
    }
  } catch (e: any) {
    if (e.message.includes('API key')) {
        yield "Erro: Chave de API inválida ou não configurada. Configure no menu lateral.";
    } else {
        yield "Erro na conexão neural. Tentando restabelecer link...";
    }
  }
}
