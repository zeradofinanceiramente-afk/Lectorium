
import React, { useState, useRef, useEffect } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { RotateCw } from 'lucide-react';

export const ImageNodeView: React.FC<NodeViewProps> = (props) => {
  const { node, updateAttributes, selected } = props;
  const { src, alt, title, width, rotation, crop, isCropping } = node.attrs;

  const [isResizing, setIsResizing] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [activeCropHandle, setActiveCropHandle] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Initial values for drag operations
  const startPos = useRef({ x: 0, y: 0 });
  const startDims = useRef({ w: 0, h: 0 });
  const startRotation = useRef(0);
  const startCrop = useRef({ top: 0, right: 0, bottom: 0, left: 0 });

  // Desativa o modo crop se o usuário clicar fora (desmarcar)
  useEffect(() => {
    if (!selected && isCropping) {
        updateAttributes({ isCropping: false });
    }
  }, [selected, isCropping]);

  // --- RESIZE LOGIC ---
  const onResizeStart = (e: React.MouseEvent, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    
    startPos.current = { x: e.clientX, y: e.clientY };
    const rect = containerRef.current?.getBoundingClientRect();
    startDims.current = { w: rect?.width || 0, h: rect?.height || 0 };

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startPos.current.x;
      let newWidth = startDims.current.w;

      if (direction.includes('e')) newWidth += dx;
      if (direction.includes('w')) newWidth -= dx;
      
      newWidth = Math.max(50, newWidth);
      updateAttributes({ width: newWidth });
    };

    const onMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // --- ROTATE LOGIC ---
  const onRotateStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsRotating(true);
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const startAngleRad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    const startAngleDeg = startAngleRad * (180 / Math.PI);
    
    const currentRotation = rotation || 0;
    startRotation.current = currentRotation - (startAngleDeg + 90);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const moveAngleRad = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
      let moveAngleDeg = moveAngleRad * (180 / Math.PI);
      
      let newRotation = moveAngleDeg + 90 + startRotation.current;
      
      if (moveEvent.shiftKey) {
        newRotation = Math.round(newRotation / 15) * 15;
      }

      updateAttributes({ rotation: newRotation });
    };

    const onMouseUp = () => {
      setIsRotating(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // --- CROP LOGIC ---
  const onCropStart = (e: React.MouseEvent, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveCropHandle(handle);

    startPos.current = { x: e.clientX, y: e.clientY };
    const rect = containerRef.current?.getBoundingClientRect();
    startDims.current = { w: rect?.width || 0, h: rect?.height || 0 };
    startCrop.current = crop ? { ...crop } : { top: 0, right: 0, bottom: 0, left: 0 };

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startPos.current.x;
      const dy = moveEvent.clientY - startPos.current.y;
      
      const width = startDims.current.w;
      const height = startDims.current.h;

      // Calculate changes in percentage
      const deltaXPercent = (dx / width) * 100;
      const deltaYPercent = (dy / height) * 100;

      let newCrop = { ...startCrop.current };

      // Update specific edge, ensuring min/max constraints
      // Limit to 90% to avoid full collapse
      if (handle.includes('n')) newCrop.top = Math.min(Math.max(0, startCrop.current.top + deltaYPercent), 90 - newCrop.bottom);
      if (handle.includes('s')) newCrop.bottom = Math.min(Math.max(0, startCrop.current.bottom - deltaYPercent), 90 - newCrop.top);
      if (handle.includes('w')) newCrop.left = Math.min(Math.max(0, startCrop.current.left + deltaXPercent), 90 - newCrop.right);
      if (handle.includes('e')) newCrop.right = Math.min(Math.max(0, startCrop.current.right - deltaXPercent), 90 - newCrop.left);

      updateAttributes({ crop: newCrop });
    };

    const onMouseUp = () => {
      setActiveCropHandle(null);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // Calculate clip path style
  // If cropping, we show the full image but overlay masks. If not cropping, we clip it.
  const clipStyle = isCropping 
    ? {} 
    : (crop ? { clipPath: `inset(${crop.top}% ${crop.right}% ${crop.bottom}% ${crop.left}%)` } : {});

  // Crop Handle Styles
  const CropCorner = ({ style, onMouseDown }: any) => (
    <div className="absolute w-4 h-4 border-black z-30 pointer-events-auto bg-transparent" style={style} onMouseDown={onMouseDown}></div>
  );
  
  const CropSide = ({ style, onMouseDown }: any) => (
    <div className="absolute bg-black z-30 pointer-events-auto" style={style} onMouseDown={onMouseDown}></div>
  );

  return (
    <NodeViewWrapper className="image-component relative inline-block leading-none select-none my-2" style={{ transform: `rotate(${rotation}deg)` }}>
      <div
        ref={containerRef}
        className={`relative group transition-shadow ${selected && !isCropping ? 'ring-2 ring-[#66E28F]' : ''}`}
        style={{ width: width ? `${width}px` : 'auto', maxWidth: '100%' }}
      >
        <img
          src={src}
          alt={alt}
          title={title}
          className="block w-full h-auto"
          style={{ 
            pointerEvents: 'none',
            ...clipStyle 
          }} 
        />

        {/* --- CROP UI (Only when isCropping) --- */}
        {selected && isCropping && (
            <>
                {/* Dark Overlays (Masks) */}
                <div className="absolute inset-0 pointer-events-none">
                    {/* Top Mask */}
                    <div className="absolute bg-black/50 left-0 right-0 top-0" style={{ height: `${crop.top}%` }} />
                    {/* Bottom Mask */}
                    <div className="absolute bg-black/50 left-0 right-0 bottom-0" style={{ height: `${crop.bottom}%` }} />
                    {/* Left Mask */}
                    <div className="absolute bg-black/50 left-0" style={{ top: `${crop.top}%`, bottom: `${crop.bottom}%`, width: `${crop.left}%` }} />
                    {/* Right Mask */}
                    <div className="absolute bg-black/50 right-0" style={{ top: `${crop.top}%`, bottom: `${crop.bottom}%`, width: `${crop.right}%` }} />
                    
                    {/* White Border around crop area */}
                    <div className="absolute border border-white/70 box-border" style={{ top: `${crop.top}%`, bottom: `${crop.bottom}%`, left: `${crop.left}%`, right: `${crop.right}%` }} />
                </div>

                {/* Handles */}
                {/* Corners - Black L shapes */}
                <CropCorner style={{ top: `${crop.top}%`, left: `${crop.left}%`, borderTopWidth: 2, borderLeftWidth: 2, cursor: 'nwse-resize' }} onMouseDown={(e: any) => onCropStart(e, 'nw')} />
                <CropCorner style={{ top: `${crop.top}%`, right: `${crop.right}%`, borderTopWidth: 2, borderRightWidth: 2, cursor: 'nesw-resize' }} onMouseDown={(e: any) => onCropStart(e, 'ne')} />
                <CropCorner style={{ bottom: `${crop.bottom}%`, left: `${crop.left}%`, borderBottomWidth: 2, borderLeftWidth: 2, cursor: 'nesw-resize' }} onMouseDown={(e: any) => onCropStart(e, 'sw')} />
                <CropCorner style={{ bottom: `${crop.bottom}%`, right: `${crop.right}%`, borderBottomWidth: 2, borderRightWidth: 2, cursor: 'nwse-resize' }} onMouseDown={(e: any) => onCropStart(e, 'se')} />
                
                {/* Sides - Black Bars */}
                <CropSide style={{ top: `${crop.top}%`, left: '50%', transform: 'translateX(-50%)', width: '20px', height: '3px', cursor: 'ns-resize' }} onMouseDown={(e: any) => onCropStart(e, 'n')} />
                <CropSide style={{ bottom: `${crop.bottom}%`, left: '50%', transform: 'translateX(-50%)', width: '20px', height: '3px', cursor: 'ns-resize' }} onMouseDown={(e: any) => onCropStart(e, 's')} />
                <CropSide style={{ left: `${crop.left}%`, top: '50%', transform: 'translateY(-50%)', height: '20px', width: '3px', cursor: 'ew-resize' }} onMouseDown={(e: any) => onCropStart(e, 'w')} />
                <CropSide style={{ right: `${crop.right}%`, top: '50%', transform: 'translateY(-50%)', height: '20px', width: '3px', cursor: 'ew-resize' }} onMouseDown={(e: any) => onCropStart(e, 'e')} />
            </>
        )}

        {/* --- RESIZE & ROTATE CONTROLS (Only when selected AND NOT cropping) --- */}
        {selected && !isCropping && (
          <>
            {/* CORNER HANDLES */}
            <div 
              className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-[#66E28F] border border-white cursor-nwse-resize z-20"
              onMouseDown={(e) => onResizeStart(e, 'nw')}
            />
            <div 
              className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-[#66E28F] border border-white cursor-nesw-resize z-20"
              onMouseDown={(e) => onResizeStart(e, 'ne')}
            />
            <div 
              className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-[#66E28F] border border-white cursor-nesw-resize z-20"
              onMouseDown={(e) => onResizeStart(e, 'sw')}
            />
            <div 
              className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-[#66E28F] border border-white cursor-nwse-resize z-20"
              onMouseDown={(e) => onResizeStart(e, 'se')}
            />

            {/* ROTATION HANDLE */}
            <div 
              className="absolute -top-8 left-1/2 -translate-x-1/2 flex flex-col items-center cursor-grab active:cursor-grabbing group/rot"
              onMouseDown={onRotateStart}
            >
               <div className="w-6 h-6 bg-surface border border-[#66E28F] rounded-full flex items-center justify-center shadow-sm text-[#66E28F]">
                  <RotateCw size={12} />
               </div>
               <div className="w-px h-2 bg-[#66E28F]"></div>
            </div>
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
};
