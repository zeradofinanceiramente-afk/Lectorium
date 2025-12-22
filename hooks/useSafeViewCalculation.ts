import { useState, useEffect, RefObject } from 'react';

/**
 * Monitora a altura de um elemento de cabeçalho e retorna o offset seguro (padding)
 * para o conteúdo abaixo, garantindo um respiro visual.
 */
export const useSafeViewCalculation = (
  headerRef: RefObject<HTMLElement | null>,
  isVisible: boolean = true
) => {
  // Começa com um valor seguro padrão (ex: 64px header + 24px gap)
  const [safeOffset, setSafeOffset] = useState(88);

  useEffect(() => {
    const calculate = () => {
      // Se o cabeçalho estiver oculto (modo imersivo), mantemos apenas um respiro mínimo
      if (!isVisible) {
        setSafeOffset(24); // 24px de margem superior mínima
        return;
      }

      if (headerRef.current) {
        const height = headerRef.current.offsetHeight;
        // Adiciona 24px de "respiro" extra para a página não colar visualmente na barra
        setSafeOffset(height + 24);
      }
    };

    // Cálculo inicial
    calculate();

    // Monitora mudanças de dimensão do elemento (ex: quebra de linha no título)
    const resizeObserver = new ResizeObserver(() => {
      calculate();
    });

    if (headerRef.current) {
      resizeObserver.observe(headerRef.current);
    }

    // Monitora redimensionamento da janela (ex: rotação de tablet)
    window.addEventListener('resize', calculate);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', calculate);
    };
  }, [headerRef, isVisible]);

  return safeOffset;
};