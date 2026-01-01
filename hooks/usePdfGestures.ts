import React, { useRef } from 'react';
import { usePdfStore } from '../stores/usePdfStore';
import { usePdfContext } from '../context/PdfContext';

export const usePdfGestures = (visualContentRef: React.RefObject<HTMLDivElement>) => {
  // Zustand State
  const scale = usePdfStore(state => state.scale);
  const setScale = usePdfStore(state => state.setScale);
  const viewMode = usePdfStore(state => state.viewMode);
  const activeTool = usePdfStore(state => state.activeTool);
  const goNext = usePdfStore(state => state.nextPage);
  const goPrev = usePdfStore(state => state.prevPage);

  // Context Data
  const { selection } = usePdfContext();

  // Internal Refs for Gesture State
  const startPinchDistRef = useRef<number>(0);
  const startScaleRef = useRef<number>(1);
  const pointersRef = useRef<Map<number, { x: number, y: number }>>(new Map());
  const touchStartRef = useRef<{ x: number, y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    
    // Detect Pinch Start (2 fingers)
    if (pointersRef.current.size === 2) {
        const points = Array.from(pointersRef.current.values()) as { x: number; y: number }[];
        const dist = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
        
        startPinchDistRef.current = dist;
        startScaleRef.current = scale;
        
        // Set transform origin to center of pinch for natural feel
        if (visualContentRef.current) {
            const rect = visualContentRef.current.getBoundingClientRect();
            const centerX = ((points[0].x + points[1].x) / 2) - rect.left;
            const centerY = ((points[0].y + points[1].y) / 2) - rect.top;
            
            visualContentRef.current.style.transition = 'none';
            visualContentRef.current.style.transformOrigin = `${centerX}px ${centerY}px`;
        }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    
    // Process Pinch Zoom
    if (pointersRef.current.size === 2 && startPinchDistRef.current > 0) {
        const points = Array.from(pointersRef.current.values()) as { x: number; y: number }[];
        const dist = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
        
        const ratio = dist / startPinchDistRef.current;
        
        // Transient update (Direct DOM manipulation for 60fps performance)
        if (visualContentRef.current) {
            visualContentRef.current.style.transform = `scale(${ratio})`;
        }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    
    // Commit Pinch Zoom
    if (pointersRef.current.size < 2 && startPinchDistRef.current > 0) {
        if (visualContentRef.current) {
            const transform = visualContentRef.current.style.transform;
            const match = transform.match(/scale\((.*?)\)/);
            if (match) {
                const ratio = parseFloat(match[1]);
                const newScale = startScaleRef.current * ratio;
                setScale(newScale);
                
                // Reset transient styles
                visualContentRef.current.style.transform = 'none';
                visualContentRef.current.style.transition = ''; 
            }
        }
        startPinchDistRef.current = 0; 
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (activeTool === 'ink' || activeTool === 'eraser' || activeTool === 'brush') return;
    
    // Only enable swipe navigation in single view mode at reasonable zoom levels
    if (scale <= 1.2 && viewMode === 'single') {
        const x = e.touches[0].clientX;
        const width = window.innerWidth;
        const threshold = 50; // Edge threshold
        
        // Only start swipe if near edge
        if (x < threshold || x > width - threshold) {
            touchStartRef.current = { x, y: e.touches[0].clientY };
        } else {
            touchStartRef.current = null;
        }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    
    // Cancel swipe if text is selected or drawing tools are active
    if (selection || (window.getSelection()?.toString() || '').length > 0 || 
        activeTool === 'ink' || activeTool === 'eraser' || activeTool === 'brush') {
        touchStartRef.current = null;
        return;
    }

    const touchEnd = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    const diffX = touchStartRef.current.x - touchEnd.x;
    const diffY = touchStartRef.current.y - touchEnd.y;
    const startX = touchStartRef.current.x;
    const width = window.innerWidth;
    const threshold = 50; 

    // Horizontal Swipe Detection
    if (Math.abs(diffX) > 50 && Math.abs(diffY) < 100) {
        if (diffX > 0 && startX > width - threshold) goNext(); // Swipe Left -> Next
        else if (diffX < 0 && startX < threshold) goPrev(); // Swipe Right -> Prev
    }
    touchStartRef.current = null;
  };

  return {
    handlers: {
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
        onPointerLeave: handlePointerUp,
        onTouchStart: handleTouchStart,
        onTouchEnd: handleTouchEnd,
    }
  };
};