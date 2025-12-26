
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface SlideNavigationControlsProps {
  isVisible: boolean;
  currentPage: number;
  totalPages: number;
  onNext: () => void;
  onPrev: () => void;
  onExit?: () => void; // Prop mantida opcional para compatibilidade, mas ignorada na UI
}

export const SlideNavigationControls: React.FC<SlideNavigationControlsProps> = ({
  isVisible,
  currentPage,
  totalPages,
  onNext,
  onPrev
}) => {
  if (!isVisible) return null;

  return (
    // CAMADA MESTRA: Z-Index 200 para garantir prioridade sobre toolbars
    // Flex row e items-center para centralizar as setas verticalmente na tela
    <div className="fixed inset-0 z-[200] pointer-events-none flex items-center justify-between px-4 md:px-8">
      
      {/* Esquerda */}
      <button
        onClick={onPrev}
        disabled={currentPage <= 1}
        className={`pointer-events-auto p-4 md:p-5 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 text-white/70 transition-all duration-300 hover:scale-110 hover:bg-black/80 hover:text-white hover:border-brand/50 active:scale-95 ${
          currentPage <= 1 ? 'opacity-0 cursor-default pointer-events-none' : 'opacity-100 shadow-lg'
        }`}
      >
        <ChevronLeft size={32} strokeWidth={2} />
      </button>

      {/* Direita */}
      <button
        onClick={onNext}
        disabled={currentPage >= totalPages}
        className={`pointer-events-auto p-4 md:p-5 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 text-white/70 transition-all duration-300 hover:scale-110 hover:bg-black/80 hover:text-white hover:border-brand/50 active:scale-95 ${
          currentPage >= totalPages ? 'opacity-0 cursor-default pointer-events-none' : 'opacity-100 shadow-lg'
        }`}
      >
        <ChevronRight size={32} strokeWidth={2} />
      </button>

    </div>
  );
};
