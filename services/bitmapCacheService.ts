
/**
 * LRU Cache para ImageBitmaps do PDF.
 * Armazena snapshots das páginas renderizadas na VRAM para exibição instantânea
 * ao rolar para cima/baixo (Virtualization).
 */

const MAX_CACHE_SIZE = 10; // Mantém as últimas 10 páginas na memória
const cache = new Map<string, ImageBitmap>();
const keys: string[] = []; // Rastreia a ordem de acesso (LRU)

export const bitmapCache = {
    get: (key: string): ImageBitmap | undefined => {
        if (cache.has(key)) {
            // Atualiza LRU: Move para o final (mais recente)
            const idx = keys.indexOf(key);
            if (idx > -1) keys.splice(idx, 1);
            keys.push(key);
            return cache.get(key);
        }
        return undefined;
    },

    /**
     * Busca o bitmap mais próximo disponível para uma página/arquivo.
     * Útil para exibir um placeholder (mesmo que borrado) enquanto a renderização
     * da escala correta (nítida) não termina.
     */
    findNearest: (fileId: string, pageNumber: number): ImageBitmap | undefined => {
        // Formato da chave: `${fileId}-p${pageNumber}-s${scale.toFixed(2)}`
        const prefix = `${fileId}-p${pageNumber}-s`;
        
        // Procura qualquer chave que comece com o prefixo da página
        const matchKey = keys.slice().reverse().find(k => k.startsWith(prefix));
        
        if (matchKey) {
            return cache.get(matchKey);
        }
        return undefined;
    },

    set: (key: string, bitmap: ImageBitmap) => {
        if (cache.has(key)) {
            // Se já existe, fecha o antigo para liberar GPU e atualiza
            const old = cache.get(key);
            old?.close();
            
            const idx = keys.indexOf(key);
            if (idx > -1) keys.splice(idx, 1);
            keys.push(key);
        } else {
            // Se o cache está cheio, remove o mais antigo (primeiro do array)
            if (keys.length >= MAX_CACHE_SIZE) {
                const toRemove = keys.shift();
                if (toRemove) {
                    const old = cache.get(toRemove);
                    old?.close(); // CRÍTICO: Libera memória da textura explicitamente
                    cache.delete(toRemove);
                }
            }
            keys.push(key);
        }
        cache.set(key, bitmap);
    },

    clear: () => {
        cache.forEach(bmp => bmp.close());
        cache.clear();
        keys.length = 0;
        console.debug('[BitmapCache] Memória de vídeo liberada.');
    },

    has: (key: string) => cache.has(key)
};
