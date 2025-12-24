
import { generateEmbeddings } from "./aiService";
import { getVectorIndex, saveVectorIndex } from "./storageService";
import { computeSparseHash } from "../utils/hashUtils";
import { EmbeddingChunk, SearchResult, VectorIndex } from "../types";

const MAX_CHUNK_LENGTH = 1000; // Caracteres por chunk
const EMBEDDING_MODEL = 'text-embedding-004';

// --- MATH UTILS (Bare Metal JS) ---

/**
 * Calcula a Similaridade de Cosseno entre dois vetores Float32Array.
 * Otimizado para loops quentes.
 * Retorna valor entre -1 e 1 (1 = idêntico).
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Divide o texto em chunks inteligentes respeitando sentenças.
 */
function smartChunking(fullText: string): string[] {
    const chunks: string[] = [];
    // Normaliza quebras de linha
    const text = fullText.replace(/\r\n/g, '\n');
    
    // Divide primeiro por parágrafos duplos
    const rawBlocks = text.split(/\n\s*\n/);
    
    for (const block of rawBlocks) {
        if (block.length <= MAX_CHUNK_LENGTH) {
            if (block.trim().length > 20) chunks.push(block.trim());
        } else {
            // Se o bloco for muito grande, divide por sentenças
            const sentences = block.match(/[^.!?]+[.!?]+[\])'"]*/g) || [block];
            let currentChunk = "";
            
            for (const sentence of sentences) {
                if (currentChunk.length + sentence.length > MAX_CHUNK_LENGTH) {
                    if (currentChunk.trim().length > 0) chunks.push(currentChunk.trim());
                    currentChunk = sentence;
                } else {
                    currentChunk += sentence;
                }
            }
            if (currentChunk.trim().length > 0) chunks.push(currentChunk.trim());
        }
    }
    return chunks;
}

// --- ORCHESTRATION ---

/**
 * Indexa um documento para busca semântica.
 * Verifica integridade via Hash antes de reprocessar.
 * 
 * Otimização: Usa hash do texto extraído (textHash) além do hash do arquivo (contentHash).
 * Se apenas o binário mudou (anotações), mas o texto é igual, evita reprocessamento.
 */
export async function indexDocumentForSearch(
    fileId: string, 
    blob: Blob, 
    extractedText: string
): Promise<void> {
    const currentFileHash = await computeSparseHash(blob);
    
    // Calcular hash do texto (Otimização Semântica)
    const textBuffer = new TextEncoder().encode(extractedText);
    const hashBuffer = await crypto.subtle.digest('SHA-256', textBuffer);
    const currentTextHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    // 1. Check Existing Index
    const existingIndex = await getVectorIndex(fileId);
    
    if (existingIndex && existingIndex.model === EMBEDDING_MODEL) {
        // Validação Nível 1: Arquivo idêntico
        if (existingIndex.contentHash === currentFileHash) {
            console.log(`[RAG] Índice válido (Arquivo Intacto) para ${fileId}`);
            return;
        }
        // Validação Nível 2: Texto idêntico (ignorando metadados/anotações)
        if (existingIndex.textHash === currentTextHash) {
            console.log(`[RAG] Índice válido (Texto Intacto) para ${fileId}. Apenas metadados mudaram.`);
            
            // Atualiza apenas o contentHash para evitar check futuro, mantendo os vetores
            const updatedIndex = { ...existingIndex, contentHash: currentFileHash, updatedAt: Date.now() };
            await saveVectorIndex(updatedIndex);
            return;
        }
    }

    // 2. Process New Index
    console.log(`[RAG] Gerando novos embeddings para ${fileId}...`);
    
    // A. Chunking
    const textChunks = smartChunking(extractedText);
    if (textChunks.length === 0) return;

    // B. Generate Embeddings (Batch API Calls)
    const vectors = await generateEmbeddings(textChunks);

    // C. Build Record
    const chunks: EmbeddingChunk[] = textChunks.map((text, i) => ({
        text,
        vector: vectors[i],
        id: `${fileId}-${i}`
    }));

    const index: VectorIndex = {
        fileId,
        contentHash: currentFileHash,
        textHash: currentTextHash,
        model: EMBEDDING_MODEL,
        updatedAt: Date.now(),
        chunks
    };

    // D. Save Atomic
    await saveVectorIndex(index);
    console.log(`[RAG] Indexação concluída: ${chunks.length} chunks.`);
}

/**
 * Realiza busca semântica no documento.
 */
export async function semanticSearch(
    fileId: string, 
    query: string, 
    topK: number = 5
): Promise<SearchResult[]> {
    // 1. Load Index
    const index = await getVectorIndex(fileId);
    if (!index || !index.chunks.length) {
        console.warn("[RAG] Índice não encontrado ou vazio.");
        return [];
    }

    // 2. Embed Query
    const [queryVector] = await generateEmbeddings([query]);
    if (!queryVector) return [];

    // 3. Compute Similarities (Linear Scan - Fast for <10k vectors)
    // Para datasets maiores, usaríamos WebWorker ou HNSW
    const results = index.chunks.map(chunk => ({
        text: chunk.text,
        score: cosineSimilarity(queryVector, chunk.vector),
        page: chunk.page
    }));

    // 4. Sort & Filter
    return results
        .filter(r => r.score > 0.4) // Threshold mínimo de relevância
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
}
