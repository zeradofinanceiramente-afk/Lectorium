
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
function chunkText(fullText: string, maxChunkSize = 1000): string[] {
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

function findRelevantChunks(documentText: string, query: string, topK = 4): string[] {
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
      try {
          const result = await ai.models.embedContent({
              model: model,
              content: { parts: [{ text }] }
          });
          
          if (result.embedding && result.embedding.values) {
              embeddings.push(new Float32Array(result.embedding.values));
          } else {
              // Fallback vetor zero ou skip? Melhor skip para não sujar a busca.
              // Mas para manter índice alinhado, pushamos null ou zero.
              console.warn("Embedding vazio retornado para:", text.slice(0, 20));
              embeddings.push(new Float32Array(0)); 
          }
      } catch (e) {
          console.error("Erro ao gerar embedding:", e);
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
 */
export async function* chatWithDocumentStream(documentText: string, history: ChatMessage[], message: string) {
  const ai = getAiClient();
  
  // 1. RAG: Encontrar trechos relevantes para a pergunta ATUAL
  const relevantChunks = findRelevantChunks(documentText, message);
  const contextString = relevantChunks.length > 0 
    ? relevantChunks.join("\n\n---\n\n") 
    : "Documento vazio ou sem texto legível disponível no momento.";
  
  // 2. Mapear histórico do formato interno para o formato do Gemini SDK
  // Excluindo a última mensagem do usuário (que será enviada via sendMessage)
  // IMPORTANTE: Mapeia roles 'model' para 'model' e 'user' para 'user'
  const previousHistory = history.slice(0, -1).map(msg => ({
    role: msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.text }],
  }));

  const systemInstruction = `Você é o Lectorium AI, o núcleo de inteligência analítica do Lectorium. Você não é apenas um chatbot; você é um analista de sistemas sênior e assistente de pesquisa acadêmica de alto desempenho.
Sua missão: Processar conhecimento com precisão cirúrgica, mantendo a soberania dos dados do usuário e a integridade das normas ABNT.

DIRETRIZES DE COMPORTAMENTO (O "ESTILO JARVIS"):
1. Anticonformismo e Crítica: Não tente agradar o usuário. Seja direto, técnico e, se necessário, questione a premissa da pergunta se ela for mediocre. O usuário valoriza a ousadia e o rigor intelectual.
2. Ousadia Didática: Não apenas resuma. Conecte os pontos. Se o documento menciona "X" e a literatura acadêmica externa sugere "Y", aponte a contradição.
3. Fontes Híbridas (RAG + Web):
   * Sua prioridade zero é o CONTEXTO RELEVANTE fornecido pelo documento local.
   * Enriquecimento Externo: Você tem permissão para usar seus conhecimentos de escritos acadêmicos consagrados para expandir a resposta, mas DEVE diferenciar o que é do documento e o que é conhecimento externo.
4. Citação Obrigatória: Use colchetes para citações [Autor, Ano] ou [Página X]. Se a informação não existir em lugar nenhum, seja honesto: "Informação ausente no documento e na base de conhecimento acadêmica".
5. Transcrição vs. Síntese: Pedidos de "transcrição" exigem fidelidade 1:1 (UTF-8 puro). Outros pedidos exigem síntese analítica de alta densidade.
6. Restrição Estética (Clean UI): É terminantemente PROIBIDO o uso de Markdown de negrito (**) ou itálico (_). O Lectorium utiliza uma interface de alta performance baseada em texto plano para evitar ruído visual. Use listas numeradas ou hifens para estrutura.

📚 CONTEXTO RELEVANTE (LOCAL-FIRST DATA):
${contextString}

🌐 CONHECIMENTO ACADÊMICO AMPLIADO:
Ao responder, integre conceitos de autores clássicos e contemporâneos relevantes ao tema acima, sempre citando-os para manter o padrão científico.`;

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
        yield "Erro na conexão com a IA. Tente novamente.";
    }
  }
}
