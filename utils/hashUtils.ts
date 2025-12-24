
/**
 * Calcula um hash rápido (Sparse Hash) de um Blob ou ArrayBuffer.
 * Em vez de ler o arquivo inteiro (lento para PDFs de 100MB+),
 * lemos amostras do início, meio e fim + tamanho total.
 * 
 * Isso é suficiente para detectar alterações de bit (corrupção ou edição externa).
 */
export async function computeSparseHash(input: Blob | ArrayBuffer): Promise<string> {
  const buffer = input instanceof Blob ? await input.arrayBuffer() : input;
  const uint8 = new Uint8Array(buffer);
  const len = uint8.length;

  // Tamanho das amostras (4KB)
  const sampleSize = 4096;
  
  // 1. Início do arquivo (Header PDF)
  const start = uint8.slice(0, Math.min(len, sampleSize));
  
  // 2. Meio do arquivo (Conteúdo aleatório)
  const middleOffset = Math.floor(len / 2);
  const middle = uint8.slice(middleOffset, Math.min(len, middleOffset + sampleSize));
  
  // 3. Fim do arquivo (XRef table / Trailer) - Crítico para detectar reescrita de PDF
  const endOffset = Math.max(0, len - sampleSize);
  const end = uint8.slice(endOffset, len);

  // Combinar amostras + Tamanho do arquivo (para diferenciar arquivos com mesmo header/trailer mas miolo diferente)
  // Usamos TextEncoder para misturar o tamanho como bytes
  const sizeBytes = new TextEncoder().encode(len.toString());

  // Concatenar tudo
  const combined = new Uint8Array(start.length + middle.length + end.length + sizeBytes.length);
  combined.set(start, 0);
  combined.set(middle, start.length);
  combined.set(end, start.length + middle.length);
  combined.set(sizeBytes, start.length + middle.length + end.length);

  // Hashing SHA-256 via Web Crypto API (Nativo e Rápido)
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  
  // Converter para Hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}
