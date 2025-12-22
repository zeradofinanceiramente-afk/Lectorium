
import React, { useMemo } from 'react';
import { CM_TO_PX } from './constants';

interface VerticalRulerProps {
  heightPx: number;
  marginTop: number; // cm
  marginBottom: number; // cm
}

export const VerticalRuler: React.FC<VerticalRulerProps> = ({ 
    heightPx, marginTop, marginBottom
}) => {
  const marginTopPx = marginTop * CM_TO_PX;
  const marginBottomPx = marginBottom * CM_TO_PX;

  // Use useMemo to recalculate only when dimensions change
  const ticks = useMemo(() => {
      const elements = [];
      const totalCm = Math.floor(heightPx / CM_TO_PX);
      
      // Define content boundaries
      const contentStartPx = marginTopPx;
      const contentEndPx = heightPx - marginBottomPx;
      
      for (let i = 0; i <= totalCm; i++) {
        const pos = i * CM_TO_PX;
        
        // Safety: Ensure we don't draw outside bounds
        if (pos > heightPx) break;

        // Logic: Is this tick inside the body or margins?
        const isTopMargin = pos < contentStartPx;
        const isBottomMargin = pos > contentEndPx;
        const isMargin = isTopMargin || isBottomMargin;

        // Calculate Relative Zero (0 starts at contentStartPx)
        // pos - contentStartPx gives offset. Divide by CM unit to get relative CM.
        const relativeVal = Math.round((pos - contentStartPx) / CM_TO_PX);
        const displayVal = Math.abs(relativeVal);

        const tickLength = 8;
        const fontSize = 9;
        
        const tickColorClass = isMargin ? 'text-brand bg-brand' : 'text-text-sec bg-text-sec/50';
        
        // Zero is bold, Margins are bold
        const fontWeight = displayVal === 0 ? 'bold' : (isMargin ? 'bold' : 'normal');

        // Major Tick (CM)
        elements.push(
          <div 
            key={`maj-${i}`} 
            className="absolute right-0 flex items-center justify-end pointer-events-none select-none"
            style={{ 
                top: `${pos}px`,
                width: '100%',
                transform: 'translateY(-50%)',
                zIndex: 10
            }}
          >
             <span 
                className={`absolute right-3 font-mono transition-colors duration-300 ${tickColorClass} bg-transparent`}
                style={{ 
                    fontSize: `${fontSize}px`,
                    fontWeight,
                }}
             >
                {displayVal}
             </span>
            <div 
                className={`${tickColorClass}`}
                style={{ 
                    width: `${tickLength}px`, 
                    height: '1px',
                }} 
            />
          </div>
        );
        
        // Minor tick (0.5cm)
        if (i < totalCm) {
             const subPos = pos + (CM_TO_PX / 2);
             if (subPos <= heightPx) {
                 const isSubMargin = subPos < contentStartPx || subPos > contentEndPx;
                 const subTickClass = isSubMargin ? 'bg-brand' : 'bg-text-sec/30';
                 const subOpacity = isSubMargin ? 'opacity-100' : 'opacity-60';

                 elements.push(
                    <div
                        key={`min-${i}`}
                        className={`absolute right-0 pointer-events-none ${subTickClass} ${subOpacity}`}
                        style={{
                            top: `${subPos}px`,
                            width: '4px',
                            height: '1px',
                            transform: 'translateY(-50%)'
                        }}
                    />
                );
             }
        }
      }
      return elements;
  }, [heightPx, marginTopPx, marginBottomPx]);

  return (
    <div 
        className="w-[24px] h-full relative select-none border-r border-border z-40 bg-surface pointer-events-auto"
        style={{ height: heightPx }}
    >
        {/* Margin Background Indicators */}
        <div 
            className="absolute top-0 w-full bg-brand opacity-5" 
            style={{ height: marginTopPx }} 
        />
        <div 
            className="absolute bottom-0 w-full bg-brand opacity-5" 
            style={{ height: marginBottomPx }} 
        />
        
        {/* Ticks */}
        {ticks}
    </div>
  );
};
