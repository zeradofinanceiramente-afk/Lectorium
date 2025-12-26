import { useEffect, useRef, useCallback } from 'react';

interface UseSlideNavigationProps {
  currentPage: number;
  totalPages: number;
  isSlideMode: boolean;
  onPageChange: (pageIndex: number) => void;
}

export const useSlideNavigation = ({
  currentPage,
  totalPages,
  isSlideMode,
  onPageChange,
}: UseSlideNavigationProps) => {
  // Acumulador para evitar que o scroll do trackpad pule 50 slides de uma vez
  const wheelAccumulator = useRef(0);
  const WHEEL_THRESHOLD = 50; 
  const COOLDOWN_MS = 300;
  const lastNavTime = useRef(0);

  // Lógica de Navegação Blindada
  const goToPage = useCallback((targetPage: number) => {
    const now = Date.now();
    // Debounce simples para evitar disparos múltiplos rápidos
    if (now - lastNavTime.current < COOLDOWN_MS) return;

    if (targetPage >= 1 && targetPage <= totalPages) {
      lastNavTime.current = now;
      onPageChange(targetPage);
    }
  }, [totalPages, onPageChange]);

  const nextPage = useCallback(() => goToPage(currentPage + 1), [currentPage, goToPage]);
  const prevPage = useCallback(() => goToPage(currentPage - 1), [currentPage, goToPage]);

  // 1. Interceptador de Teclado (Capture Phase)
  useEffect(() => {
    if (!isSlideMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignora se o usuário estiver digitando em um input, textarea ou editor Tiptap (contenteditable)
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.isContentEditable
      ) return;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown': // Opcional: PowerPoint usa Down para próximo
        case ' ': // Espaço avança
          e.preventDefault();
          nextPage();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'Backspace': // Backspace volta
          e.preventDefault();
          prevPage();
          break;
      }
    };

    // 'true' ativa o listener na fase de captura, garantindo prioridade sobre o editor
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isSlideMode, nextPage, prevPage]);

  // 2. Interceptador de Scroll/Wheel (Debounced)
  useEffect(() => {
    if (!isSlideMode) return;

    const handleWheel = (e: WheelEvent) => {
      // Impede o scroll nativo da página
      e.preventDefault(); 

      wheelAccumulator.current += e.deltaY;

      if (wheelAccumulator.current > WHEEL_THRESHOLD) {
        nextPage();
        wheelAccumulator.current = 0;
      } else if (wheelAccumulator.current < -WHEEL_THRESHOLD) {
        prevPage();
        wheelAccumulator.current = 0;
      }
    };

    // { passive: false } é obrigatório para usar e.preventDefault()
    window.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      window.removeEventListener('wheel', handleWheel);
      wheelAccumulator.current = 0; // Limpa ao sair
    };
  }, [isSlideMode, nextPage, prevPage]);

  return { nextPage, prevPage };
};