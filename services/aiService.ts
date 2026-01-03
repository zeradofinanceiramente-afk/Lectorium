
import { GoogleGenAI, Type } from "@google/genai";
import { ChatMessage, MindMapData } from "../types";
import { getStoredApiKey } from "../utils/apiKeyUtils";

// --- CONFIG ---
const getAiClient = () => {
  const userKey = getStoredApiKey();
  if (userKey) {
    return new GoogleGenAI({ apiKey: userKey });
  }
  if (process.env.API_KEY) {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
  throw new Error("Chave de API não configurada. Por favor, adicione sua chave nas configurações.");
};

// Utils
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- RAG UTILS (Local Search) ---

const STOP_WORDS = new Set([
  'o', 'a', 'os', 'as', 'um', 'uma', 'de', 'do', 'da', 'em', 'no', 'na', 'para', 'com', 'por', 'que', 'e', 'é', 
  'the', 'a', 'an', 'of', 'in', 'on', 'for', 'with', 'by', 'that', 'and', 'is', 'to'
]);

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

export function extractPageRangeFromQuery(query: string): { start: number, end: number } | null {
  const clean = query.toLowerCase();
  const regex = /(?:p[áa]gina|p[áa]g|pg)\.?\s*(\d+)(?:\s*(?:a|at[ée]| |-)\s*(\d+))?/i;
  
  const match = clean.match(regex);
  if (match) {
     const start = parseInt(match[1]);
     const end = match[2] ? parseInt(match[2]) : start;
     
     if (!isNaN(start)) {
         return { start, end: isNaN(end) ? start : end };
     }
  }
  return null;
}

// --- AI FUNCTIONS ---

export async function performSemanticOcr(base64Image: string): Promise<string> {
  const ai = getAiClient();
  const prompt = `Atue como um especialista em digitalização de documentos.
Analise a imagem desta página e transcreva TODO o texto em formato Markdown estruturado.

REGRAS CRÍTICAS DE LEITURA:
1. **Colunas:** Se houver múltiplas colunas (ex: jornal, artigo científico), leia da esquerda para a direita, coluna por coluna (ordem de leitura humana). NÃO misture linhas de colunas adjacentes.
2. **Formatação:** Use cabeçalhos (#, ##) para títulos. Use negrito para destaques.
3. **Correção:** Corrija hifenização de quebra de linha (ex: "cons-titução" -> "constituição").
4. **Tabelas:** Se houver tabelas, tente representá-las como Markdown tables.
5. **Ruído:** Ignore números de página, cabeçalhos repetitivos ou sujeira de digitalização.

Retorne APENAS o Markdown.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest', 
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
          { text: prompt }
        ]
      }
    });
    
    return response.text || "Não foi possível extrair o texto desta página.";
  } catch (e: any) {
    console.error("Semantic Lens error:", e);
    if (e.message?.includes('429')) throw new Error("Muitas requisições. Aguarde um momento.");
    throw new Error("Erro na análise da página: " + e.message);
  }
}

export async function generateEmbeddings(texts: string[]): Promise<Float32Array[]> {
  const ai = getAiClient();
  const model = "text-embedding-004";
  
  const embeddings: Float32Array[] = new Array(texts.length).fill(new Float32Array(0));
  
  const BATCH_SIZE = 2;
  const BATCH_DELAY_MS = 2500; 

  const processSingle = async (text: string, index: number, retryCount = 0): Promise<void> => {
      if (!text || !text.trim()) return;

      try {
          const result = await ai.models.embedContent({
              model: model,
              content: { parts: [{ text: text.trim() }] }
          });
          
          if (result.embedding && result.embedding.values) {
              embeddings[index] = new Float32Array(result.embedding.values);
          }
      } catch (e: any) {
          const isRateLimit = e.message?.includes('429') || e.message?.includes('quota');
          
          if (isRateLimit && retryCount < 3) {
              const backoff = Math.pow(2, retryCount + 1) * 2000;
              await sleep(backoff);
              return processSingle(text, index, retryCount + 1);
          }
          console.error(`[AI] Falha no embedding (Item ${index}):`, e.message);
      }
  };

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batchPromises = [];
      for (let j = 0; j < BATCH_SIZE; j++) {
          const idx = i + j;
          if (idx < texts.length) {
              batchPromises.push(processSingle(texts[idx], idx));
          }
      }
      await Promise.all(batchPromises);
      if (i + BATCH_SIZE < texts.length) {
          await sleep(BATCH_DELAY_MS);
      }
  }

  return embeddings;
}

export async function generateDocumentBriefing(fullText: string): Promise<string> {
    const ai = getAiClient();
    
    let textToAnalyze = fullText;
    if (fullText.length > 50000) {
        const start = fullText.slice(0, 15000); 
        const middle = fullText.slice(Math.floor(fullText.length / 2) - 10000, Math.floor(fullText.length / 2) + 10000);
        const end = fullText.slice(fullText.length - 15000); 
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
            config: { temperature: 0.3 }
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

/**
 * REFINAMENTO DE OCR 2.0 (Context-Aware)
 * Usa prompts avançados para corrigir erros de OCR com base no contexto da frase, não apenas da palavra isolada.
 */
export async function refineOcrWords(words: string[]): Promise<string[]> {
  const ai = getAiClient();
  
  if (words.length > 500) {
      const chunks = [];
      for (let i = 0; i < words.length; i += 500) {
          chunks.push(words.slice(i, i + 500));
      }
      
      const results = [];
      for (const chunk of chunks) {
          const refinedChunk = await refineOcrWords(chunk);
          results.push(...refinedChunk);
          await sleep(1000); 
      }
      return results;
  }

  // Novo Prompt: Foca em reconstrução de fluxo para evitar alucinação de layout
  const prompt = `Aja como um revisor editorial especializado em recuperação de documentos históricos.
Abaixo está uma sequência de palavras extraídas via OCR (Optical Character Recognition).
A sequência pode conter erros de caracteres (ex: '1' vs 'l', 'rn' vs 'm') ou quebras de palavras.

SUA TAREFA:
Corrigir os erros ortográficos e de pontuação APENAS onde houver certeza baseada no contexto linguístico.
NÃO altere a ordem das palavras.
NÃO remova palavras (a menos que seja lixo puro como '_^~').
NÃO invente conteúdo novo.

Retorne um JSON contendo o array 'correctedWords' com o mesmo tamanho da entrada.

ENTRADA:
${JSON.stringify(words)}`;

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
    
    // Fallback de segurança: Se o tamanho diferir muito, desconfie da IA e use o original
    if (Math.abs(corrected.length - words.length) > 5) {
        console.warn("[AI Refine] Mismatch in word count. Returning original to avoid sync errors.");
        return words;
    }
    
    return corrected;
  } catch (e) {
    console.error("OCR Refinement failed", e);
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

export async function* chatWithDocumentStream(contextString: string, history: ChatMessage[], message: string) {
  const ai = getAiClient();
  
  const previousHistory = history.slice(0, -1).map(msg => ({
    role: msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.text }],
  }));

  const systemInstruction = `Você é a Sexta-feira (F.R.I.D.A.Y.), a inteligência tática operacional do sistema Lectorium.
Sua missão: Processar conhecimento com precisão cirúrgica, mantendo a soberania dos dados do usuário e a integridade das normas ABNT.

DIRETRIZES DE COMPORTAMENTO (PROTOCOLO STARK):
1. Identidade: Use pronomes femininos. Refira-se ao usuário como "Chefe", "Admin" ou diretamente. Tom: técnico, leal e levemente sagaz.
2. Formatação: Texto limpo, sem floreios. Use listas e negrito para ênfase.

DIRETRIZES DE FONTES (PROTOCOLO HÍBRIDO):
O contexto fornecido pode ser LIMITADO (contendo apenas os trechos que o usuário destacou/marcou no PDF).
* **Prioridade 1: CONTEXTO DO USUÁRIO.** Se a resposta estiver no texto fornecido abaixo, use-o e cite a página explicitamente (Ex: [Página X]).
* **Prioridade 2: BASE DE CONHECIMENTO INTERNA (ACADÊMICA).** Se a resposta NÃO estiver nos trechos fornecidos, você TEM PERMISSÃO para usar seu conhecimento externo (livros clássicos, teorias consolidadas), MAS deve deixar claro que a informação é externa.

PROTOCOLOS DE CITAÇÃO:
1. Fontes Internas (PDF): Use \`[Página X]\` ou \`[Nota do Usuário]\`.
2. Fontes Externas (Seu Conhecimento):
   * No texto: Use padrão autor-data (SOBRENOME, Ano). Ex: (FOUCAULT, 1975).
   * Crie uma seção "### Referências Táticas" ao final se usar fontes externas.

📚 CONTEXTO TÁTICO FORNECIDO:
${contextString || "Nenhum contexto específico. Use sua base de conhecimento."}

Ao responder, integre conceitos externos se o contexto do usuário for insuficiente, mas diferencie claramente a origem.`;

  try {
    const chat = ai.chats.create({
      model: 'gemini-3-flash-preview',
      history: previousHistory,
      config: { systemInstruction, temperature: 0.2 }
    });
    
    let stream;
    let attempt = 0;
    const maxRetries = 3;

    while (true) {
        try {
            stream = await chat.sendMessageStream({ message });
            break;
        } catch (err: any) {
            attempt++;
            const isQuotaError = err.message?.includes('429') || err.message?.includes('quota');
            
            if (attempt >= maxRetries) {
                if (isQuotaError) throw new Error("Cota de tráfego excedida (429). Tente novamente em 1 minuto.");
                throw err;
            }
            
            const waitTime = isQuotaError ? Math.pow(3, attempt) * 1000 : Math.pow(2, attempt) * 1000;
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
        yield "🚦 **Alerta de Tráfego (429):** O processamento em blocos detectou alto volume. \n\n**Solução:** O sistema limitou o envio apenas aos seus destaques para economizar recursos. Aguarde alguns instantes.";
    } else {
        yield `Erro na conexão neural [STATUS: FALHA].\nDetalhes do Erro: ${errorMessage}\n\nTentando restabelecer link...`;
    }
  }
}
