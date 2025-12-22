
import { useEffect } from 'react';

/**
 * Injeta um console de debug flutuante na página (Eruda).
 * Útil para visualizar logs, erros e rede em dispositivos móveis ou produção
 * onde o DevTools não está acessível.
 * 
 * Ativado apenas se a query string ?debug=true estiver presente.
 */
export const DebugConsole = () => {
  useEffect(() => {
    // Verifica a flag na URL
    const isDebugMode = new URLSearchParams(window.location.search).get('debug') === 'true';

    if (isDebugMode) {
      // Importação dinâmica para não pesar no bundle principal
      import('eruda').then((lib) => {
        const eruda = lib.default;
        
        // Inicializa se ainda não existir
        // @ts-ignore
        if (!window.eruda) {
            eruda.init({
                tool: ['console', 'network', 'resources', 'info', 'elements', 'sources'],
                defaults: {
                    displaySize: 40,
                    transparency: 0.9,
                    theme: 'Dracula' // Combina com o tema dark do app
                }
            });
            console.log("%c Lectorium Debug Mode Ativado ", "background: #4ade80; color: #000; font-weight: bold; padding: 4px; border-radius: 4px;");
            console.log("Use o botão flutuante para inspecionar logs e erros.");
        }
      }).catch(err => {
          console.error("Falha ao carregar Eruda Debugger:", err);
      });
    }
  }, []);

  return null; // Componente lógico, sem renderização React direta
};
