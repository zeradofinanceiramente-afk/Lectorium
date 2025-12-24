
/**
 * Blob Registry (The Janitor)
 * Rastreia URLs criadas com URL.createObjectURL para evitar Memory Leaks.
 */

class BlobRegistry {
  private urls: Set<string> = new Set();

  /**
   * Registra uma URL para gerenciamento.
   * Deve ser chamada sempre que URL.createObjectURL for usado.
   */
  register(url: string) {
    if (url && url.startsWith('blob:')) {
      this.urls.add(url);
    }
    return url;
  }

  /**
   * Revoga uma URL específica e remove do registro.
   */
  revoke(url: string) {
    if (this.urls.has(url)) {
      URL.revokeObjectURL(url);
      this.urls.delete(url);
    }
  }

  /**
   * Limpa TODAS as URLs registradas.
   * Útil ao desmontar o visualizador ou trocar de arquivo.
   */
  revokeAll() {
    this.urls.forEach(url => URL.revokeObjectURL(url));
    this.urls.clear();
    console.debug('[BlobRegistry] Memória limpa: Todas as URLs revogadas.');
  }
}

export const blobRegistry = new BlobRegistry();
