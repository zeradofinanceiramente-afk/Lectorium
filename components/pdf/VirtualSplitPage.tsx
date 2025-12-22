
import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';

interface VirtualSplitProps {
  pageCanvas: string; // Data URL
  pageWidth: number;
  scale: number;
  side: 'left' | 'right';
}

export const VirtualSplitPage: React.FC<VirtualSplitProps> = ({ pageCanvas, pageWidth, scale, side }) => {
  // Metade da largura original (em CSS pixels)
  const halfWidth = (pageWidth / 2);
  const isRight = side === 'right';
  
  // Estilo comum para os frames
  const frameStyle: React.CSSProperties = {
    width: halfWidth,
    height: 'auto', 
    overflow: 'hidden',
    position: 'relative',
    border: '1px solid #333',
    boxShadow: '0 20px 50px -10px rgba(0,0,0,0.5)',
    backgroundColor: '#18181b',
    borderRadius: '4px'
  };

  // A imagem dentro deve ter a largura TOTAL do canvas original para que o crop funcione
  // Se for o lado direito, transladamos -50% para mostrar a metade direita
  const imgStyle: React.CSSProperties = {
    width: pageWidth, 
    height: 'auto',
    maxWidth: 'none', // Importante para permitir overflow
    display: 'block',
    transform: `translateX(${isRight ? '-50%' : '0'})`,
    transition: 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)'
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 select-none">
      <div className="mb-3 flex items-center gap-2">
         <span className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors flex items-center gap-1 ${!isRight ? 'bg-brand text-black border-brand' : 'text-text-sec border-border opacity-50'}`}>
            <ArrowLeft size={10} /> Esquerda
         </span>
         <span className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors flex items-center gap-1 ${isRight ? 'bg-brand text-black border-brand' : 'text-text-sec border-border opacity-50'}`}>
            Direita <ArrowRight size={10} />
         </span>
      </div>
      
      <div style={frameStyle}>
         <img 
            src={pageCanvas} 
            alt="Split Page"
            style={imgStyle} 
         />
      </div>
    </div>
  );
};
