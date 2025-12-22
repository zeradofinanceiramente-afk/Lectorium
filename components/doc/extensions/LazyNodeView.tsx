
import React, { useState, useEffect, useRef } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { EyeOff, Activity } from 'lucide-react';

interface LazyNodeViewProps {
  children: React.ReactNode;
  node: any;
  updateAttributes: (attrs: any) => void;
  minHeight?: number;
  label?: string;
}

export const LazyNodeView: React.FC<LazyNodeViewProps> = ({ 
  children, 
  node, 
  updateAttributes, 
  minHeight = 100,
  label = 'Conteúdo Complexo'
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Persistir altura para evitar pulos de layout (Layout Shift) ao rolar
  const renderedHeight = node.attrs.renderedHeight || minHeight;

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Adiciona um buffer de 200px para pré-carregar antes de entrar na tela
        if (entry.isIntersecting) {
          setIsVisible(true);
        } else {
          setIsVisible(false);
        }
      },
      { rootMargin: '200px' }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Captura a altura real quando o componente é renderizado para salvar no nó
  // Isso garante que o placeholder tenha o tamanho correto na próxima vez
  const handleResize = (entry: ResizeObserverEntry) => {
    const height = entry.contentRect.height;
    if (height > 0 && Math.abs(height - renderedHeight) > 5) {
       updateAttributes({ renderedHeight: height });
    }
  };

  useEffect(() => {
    if (isVisible && containerRef.current) {
        const resizeObserver = new ResizeObserver((entries) => {
            if (entries[0]) handleResize(entries[0]);
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }
  }, [isVisible]);

  return (
    <NodeViewWrapper 
      ref={containerRef} 
      className="lazy-node-wrapper transition-opacity duration-300"
      style={{ minHeight: isVisible ? 'auto' : `${renderedHeight}px` }}
    >
      {isVisible ? (
        children
      ) : (
        <div 
          className="flex flex-col items-center justify-center bg-white/5 border border-white/10 rounded-lg animate-pulse select-none"
          style={{ height: `${renderedHeight}px` }}
        >
           <div className="flex items-center gap-2 text-text-sec opacity-50">
              <Activity size={20} />
              <span className="text-sm font-medium">{label} (Renderizando...)</span>
           </div>
        </div>
      )}
    </NodeViewWrapper>
  );
};
