
import { GoogleGenAI, Type } from "@google/genai";
import { ChatMessage } from "../types";
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
  // Normaliza quebras de linha
  const cleanText = fullText.replace(/\r\n/g, '\n');
  // Divide por parágrafos duplos ou simples dependendo da densidade
  let rawChunks = cleanText.split(/\n\s*\n/);
  
  const finalChunks: string[] = [];
  
  for (const chunk of rawChunks) {
    if (chunk.length > maxChunkSize) {
      // Se o parágrafo for gigante, quebra por frases
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
      // Ignora pedaços muito pequenos (ruído de OCR)
      finalChunks.push(chunk.trim());
    }
  }
  
  return finalChunks;
}

// Calcula pontuação de relevância simples (Keyword Overlap / TF simplificado)
function scoreChunk(chunk: string, queryTerms: string[]): number {
  const normalizedChunk = chunk.toLowerCase();
  let score = 0;
  
  // Pontuações
  const EXACT_MATCH_BONUS = 3;
  const PARTIAL_MATCH_BONUS = 1;

  for (const term of queryTerms) {
    if (normalizedChunk.includes(term)) {
      // Regex para contar ocorrências exatas da palavra
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

  // 1. Prepara a query
  const queryTerms = query.toLowerCase()
    .replace(/[^\w\sà-ú]/g, '') // Remove pontuação
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  if (queryTerms.length === 0) return [documentText.slice(0, 2000)]; // Fallback se query for vazia/stop words

  // 2. Chunking
  const chunks = chunkText(documentText);

  // 3. Scoring
  const scoredChunks = chunks.map(chunk => ({
    text: chunk,
    score: scoreChunk(chunk, queryTerms)
  }));

  // 4. Sort & Slice
  scoredChunks.sort((a, b) => b.score - a.score);

  // Filtra chunks com score 0 se tivermos chunks com score > 0
  const hasMatches = scoredChunks.some(c => c.score > 0);
  const relevant = hasMatches ? scoredChunks.filter(c => c.score > 0) : scoredChunks;

  return relevant.slice(0, topK).map(c => c.text);
}

// --- AI FUNCTIONS ---

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
    
    if (corrected.length === words.length) {
        return corrected;
    }
    
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

/**
 * Chat Stream with Local RAG Strategy
 */
export async function* chatWithDocumentStream(documentText: string, history: ChatMessage[], message: string) {
  const ai = getAiClient();
  
  // 1. Local RAG: Encontrar partes relevantes do texto
  const relevantChunks = findRelevantChunks(documentText, message);
  const contextString = relevantChunks.length > 0 
    ? relevantChunks.join("\n\n---\n\n") 
    : "Documento vazio ou sem texto legível.";

  // 2. Construir System Instruction com o Contexto Reduzido
  const systemInstruction = `Você é o Lectorium AI, um assistente de pesquisa acadêmica.
  Responda à pergunta do usuário baseando-se EXCLUSIVAMENTE nos trechos do documento fornecidos abaixo.
  Se a resposta não estiver no contexto, diga que não encontrou a informação no documento.
  
  CONTEXTO RELEVANTE DO DOCUMENTO:
  ${contextString}`;

  try {
    const chat = ai.chats.create({
      model: 'gemini-3-flash-preview',
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
