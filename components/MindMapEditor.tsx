
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Plus, Minus, Trash2, Type, Menu, Save, Loader2, Link, XCircle, Download, WifiOff, 
  Undo, Redo, Square, Circle as CircleIcon, StickyNote, 
  MousePointer2, Sparkles, Image as ImageIcon, Smile, MoreHorizontal, ArrowRight, 
  Layout, Grid, Spline, Maximize, Search, X, Palette, GitBranch, Scaling, ChevronUp
} from 'lucide-react';
import { updateDriveFile, downloadDriveFile, uploadFileToDrive } from '../services/driveService';
import { expandNodeWithAi } from '../services/aiService';
import { MindMapNode, MindMapEdge, MindMapViewport, MindMapData, NodeShape } from '../types';

// --- Constants & Styles ---
const SHAPES: { id: NodeShape, icon: React.ElementType }[] = [
  { id: 'rectangle', icon: Square },
  { id: 'circle', icon: CircleIcon },
  // Diamond removed
  { id: 'sticky', icon: StickyNote },
  { id: 'pill', icon: MoreHorizontal }, // Represented by dots/capsule
  { id: 'hexagon', icon: Layout }, // Approx
];

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', 
  '#3b82f6', '#a855f7', '#ec4899', '#ffffff', '#1e293b'
];

interface Props {
  fileId: string;
  fileName: string;
  fileBlob?: Blob;
  accessToken: string;
  onToggleMenu: () => void;
  onAuthError?: () => void;
}

interface HistoryState {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
}

export const MindMapEditor: React.FC<Props> = ({ fileId, fileName, fileBlob, accessToken, onToggleMenu, onAuthError }) => {
  const isLocalFile = fileId.startsWith('local-') || !accessToken;

  // --- State ---
  const [nodes, setNodes] = useState<MindMapNode[]>([]);
  const [edges, setEdges] = useState<MindMapEdge[]>([]);
  const [viewport, setViewport] = useState<MindMapViewport>({ x: 0, y: 0, zoom: 1 });
  
  const [historyPast, setHistoryPast] = useState<HistoryState[]>([]);
  const [historyFuture, setHistoryFuture] = useState<HistoryState[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  
  // UI State
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Interaction State
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [isResizingNode, setIsResizingNode] = useState(false);
  
  // Pointers for Multi-touch
  const pointersRef = useRef<Map<number, { x: number, y: number }>>(new Map());
  const prevPinchDistRef = useRef<number | null>(null);
  const prevPinchCenterRef = useRef<{ x: number, y: number } | null>(null);

  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragSnapshotRef = useRef<HistoryState | null>(null);
  
  // Editing & Linking
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [linkingSourceId, setLinkingSourceId] = useState<string | null>(null);
  
  // AI State
  const [isExpandingAi, setIsExpandingAi] = useState(false);

  // Autosave
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Styles Injection ---
  useEffect(() => {
    const styleId = 'mindmap-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            @keyframes grid-drift {
                0% { background-position: 0px 0px; }
                100% { background-position: 40px 40px; }
            }
            .immersive-grid {
                animation: grid-drift 20s linear infinite;
            }
        `;
        document.head.appendChild(style);
    }
  }, []);

  // --- Initialization ---
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setIsLoading(true);
        let blobToRead = fileBlob;

        if (!blobToRead && accessToken && !isLocalFile) {
             try { blobToRead = await downloadDriveFile(accessToken, fileId); } catch (e) { console.error(e); }
        }

        if (blobToRead) {
            const text = await blobToRead.text();
            try {
                const data: MindMapData = JSON.parse(text);
                if (mounted) {
                    setNodes(data.nodes || []);
                    setEdges(data.edges || []);
                    setViewport(data.viewport || { x: window.innerWidth / 2, y: window.innerHeight / 2, zoom: 1 });
                }
            } catch (e) {
                if (mounted) initDefaultMap();
            }
        } else {
             if (mounted) initDefaultMap();
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [fileId, fileBlob]);

  const initDefaultMap = () => {
      setNodes([{
        id: `root-${Date.now()}`,
        text: "Ideia Central",
        x: 0, y: 0,
        width: 160, height: 60,
        color: '#a855f7',
        isRoot: true,
        scale: 1.2,
        fontSize: 18,
        shape: 'pill'
      }]);
      setViewport({ x: window.innerWidth / 2, y: window.innerHeight / 2, zoom: 1 });
  };

  // --- Autosave ---
  useEffect(() => {
    if (isLoading || nodes.length === 0) return;
    setHasUnsavedChanges(true);
    
    if (!isLocalFile && navigator.onLine) {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(saveToDrive, 3000); 
    }
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [nodes, edges, viewport]);

  const saveToDrive = async () => {
      if (!accessToken || isLocalFile) return;
      setIsSaving(true);
      const data: MindMapData = { nodes, edges, viewport };
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      try {
          // Check if file starts with 'local-mindmap' indicating it was created locally but we are trying to save to Drive (if access token exists)
          // Actually, if isLocalFile is true, we returned early above. 
          // So this is for existing Drive files.
          await updateDriveFile(accessToken, fileId, blob, 'application/json');
          setHasUnsavedChanges(false);
      } catch (e: any) {
          console.error("Autosave failed", e);
          if (e.message === "Unauthorized" && onAuthError) onAuthError();
      } finally {
          setIsSaving(false);
      }
  };

  const saveToLocal = () => {
      const data: MindMapData = { nodes, edges, viewport };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName.endsWith('.mindmap') ? fileName : `${fileName}.mindmap`;
      a.click();
      URL.revokeObjectURL(url);
      setHasUnsavedChanges(false);
  };

  // --- History ---
  const recordHistory = () => {
    setHistoryPast(prev => [...prev.slice(-49), { nodes: structuredClone(nodes), edges: structuredClone(edges) }]);
    setHistoryFuture([]);
  };

  const undo = () => {
    if (historyPast.length === 0) return;
    const prev = historyPast[historyPast.length - 1];
    setHistoryFuture(f => [{ nodes: structuredClone(nodes), edges: structuredClone(edges) }, ...f]);
    setHistoryPast(p => p.slice(0, -1));
    setNodes(prev.nodes);
    setEdges(prev.edges);
  };

  const redo = () => {
    if (historyFuture.length === 0) return;
    const next = historyFuture[0];
    setHistoryPast(p => [...p, { nodes: structuredClone(nodes), edges: structuredClone(edges) }]);
    setHistoryFuture(f => f.slice(1));
    setNodes(next.nodes);
    setEdges(next.edges);
  };

  // --- Helpers ---
  const screenToWorld = (sx: number, sy: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (sx - rect.left - viewport.x) / viewport.zoom,
      y: (sy - rect.top - viewport.y) / viewport.zoom
    };
  };

  // --- Interaction Logic ---

  const handlePointerDown = (e: React.PointerEvent) => {
    // Track pointer
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    
    // Canvas Drag Initiation
    // Nota: Nós (Nodes) chamam e.stopPropagation(), então qualquer evento que chegue aqui
    // é garantido como sendo um clique no fundo/canvas, seguro para iniciar arrasto.
    if (pointersRef.current.size === 1) {
        setIsDraggingCanvas(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        
        // Limpar seleções ao clicar no fundo
        if (linkingSourceId) setLinkingSourceId(null);
        setSelectedNodeId(null);
        setShowColorPicker(false);
        setSelectedEdgeId(null);
        if (editingNodeId) setEditingNodeId(null);
    } else {
        // Multi-touch (Pinch Zoom) inicia aqui quando o segundo dedo toca
        setIsDraggingCanvas(false); 
        prevPinchDistRef.current = null;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    
    const pointers = Array.from(pointersRef.current.values()) as { x: number; y: number }[];

    // 1. PINCH ZOOM LOGIC (Center Oriented)
    if (pointers.length === 2) {
        const p1 = pointers[0];
        const p2 = pointers[1];
        
        // Calculate Distance
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        
        // Calculate Center of Fingers (Screen Coords)
        const centerX = (p1.x + p2.x) / 2;
        const centerY = (p1.y + p2.y) / 2;
        
        if (prevPinchDistRef.current && prevPinchCenterRef.current) {
            const rect = containerRef.current!.getBoundingClientRect();
            
            // Calculate scale factor
            const scaleDiff = dist / prevPinchDistRef.current;
            const newZoom = Math.min(Math.max(0.1, viewport.zoom * scaleDiff), 5);
            
            // Pan compensation
            const relativeCenterX = centerX - rect.left;
            const relativeCenterY = centerY - rect.top;
            
            const worldX = (relativeCenterX - viewport.x) / viewport.zoom;
            const worldY = (relativeCenterY - viewport.y) / viewport.zoom;
            
            const newX = relativeCenterX - (worldX * newZoom);
            const newY = relativeCenterY - (worldY * newZoom);

            setViewport({ x: newX, y: newY, zoom: newZoom });
        }
        
        prevPinchDistRef.current = dist;
        prevPinchCenterRef.current = { x: centerX, y: centerY };
        return;
    }

    // 2. CANVAS PAN
    if (isDraggingCanvas && pointersRef.current.size === 1) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        setDragStart({ x: e.clientX, y: e.clientY });
        return;
    }

    // 3. NODE DRAG
    if (dragNodeId && !isResizingNode) {
        const pos = screenToWorld(e.clientX, e.clientY);
        setNodes(prev => prev.map(n => n.id === dragNodeId ? { ...n, x: pos.x - dragOffset.x, y: pos.y - dragOffset.y } : n));
    }

    // 4. NODE RESIZE
    if (dragNodeId && isResizingNode) {
        const pos = screenToWorld(e.clientX, e.clientY);
        setNodes(prev => prev.map(n => {
            if (n.id === dragNodeId) {
                // Calculate new dimensions based on drag position
                const newWidth = Math.max(50, pos.x - n.x);
                const newHeight = Math.max(30, pos.y - n.y);
                return { ...n, width: newWidth, height: newHeight };
            }
            return n;
        }));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    
    if (pointersRef.current.size < 2) {
        prevPinchDistRef.current = null;
        prevPinchCenterRef.current = null;
    }

    if (dragNodeId && dragSnapshotRef.current) {
        const old = dragSnapshotRef.current.nodes.find(n => n.id === dragNodeId);
        const curr = nodes.find(n => n.id === dragNodeId);
        // Record history if moved or resized
        if (old && curr && (old.x !== curr.x || old.y !== curr.y || old.width !== curr.width || old.height !== curr.height)) {
            recordHistory();
        }
    }
    
    setIsDraggingCanvas(false);
    setDragNodeId(null);
    setIsResizingNode(false);
    dragSnapshotRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    // Zoom logic for wheel / trackpad
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = containerRef.current!.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Point in world coordinates before zoom
        const worldX = (mouseX - viewport.x) / viewport.zoom;
        const worldY = (mouseY - viewport.y) / viewport.zoom;
        
        const zoomFactor = 1 - e.deltaY * 0.002;
        const newZoom = Math.min(Math.max(0.1, viewport.zoom * zoomFactor), 5);
        
        // Calculate new viewport position to keep world point under mouse
        const newX = mouseX - worldX * newZoom;
        const newY = mouseY - worldY * newZoom;
        
        setViewport({ x: newX, y: newY, zoom: newZoom });
    } else {
        // Pan logic
        setViewport(prev => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  };

  // --- Node Actions ---
  const handleNodeDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    // Capture pointer for consistent drag
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    
    if (linkingSourceId) {
        completeLinking(id);
        return;
    }
    
    if (selectedNodeId !== id) {
        setShowColorPicker(false); // Reset color picker when switching nodes
    }

    setSelectedNodeId(id);
    setSelectedEdgeId(null);
    setDragNodeId(id);
    
    const pos = screenToWorld(e.clientX, e.clientY);
    const node = nodes.find(n => n.id === id);
    if (node) {
        setDragOffset({ x: pos.x - node.x, y: pos.y - node.y });
        dragSnapshotRef.current = { nodes: structuredClone(nodes), edges: structuredClone(edges) };
    }
  };

  const handleResizeDown = (e: React.PointerEvent, id: string) => {
      e.stopPropagation();
      e.preventDefault();
      setSelectedNodeId(id);
      setDragNodeId(id);
      setIsResizingNode(true);
      dragSnapshotRef.current = { nodes: structuredClone(nodes), edges: structuredClone(edges) };
  };

  const startLinking = (id: string) => {
      setLinkingSourceId(id);
      setSelectedNodeId(null);
  };

  const completeLinking = (targetId: string) => {
      if (linkingSourceId && linkingSourceId !== targetId) {
          const exists = edges.some(e => (e.from === linkingSourceId && e.to === targetId) || (e.from === targetId && e.to === linkingSourceId));
          if (!exists) {
              recordHistory();
              setEdges(prev => [...prev, { id: `edge-${Date.now()}`, from: linkingSourceId, to: targetId }]);
          }
      }
      setLinkingSourceId(null);
  };

  // --- Feature Logic ---

  const createChildNode = (parentId: string) => {
      const parent = nodes.find(n => n.id === parentId);
      if (!parent) return;

      recordHistory();
      const newNodeId = `node-${Date.now()}`;
      
      // Smart positioning: Stack vertically based on siblings
      const siblings = nodes.filter(n => n.parentId === parentId);
      const count = siblings.length;
      
      const offsetX = 220; // Move to right
      // Start slightly above center and move down
      const initialYOffset = -((count * 80) / 2); 
      const offsetY = initialYOffset + (count * 80);
      
      // If first child, just center it roughly to the right
      const safeY = count === 0 ? 0 : (count * 80) - 40; 

      const newNode: MindMapNode = {
          id: newNodeId,
          text: "Novo Item",
          x: parent.x + offsetX,
          y: parent.y + safeY,
          width: 150,
          height: 60,
          color: parent.color, // Inherit color
          parentId: parent.id,
          scale: 1,
          shape: 'rectangle'
      };

      const newEdge: MindMapEdge = {
          id: `edge-${Date.now()}`,
          from: parent.id,
          to: newNodeId
      };

      setNodes(prev => [...prev, newNode]);
      setEdges(prev => [...prev, newEdge]);
      setSelectedNodeId(newNodeId);
      
      // Auto-edit
      setTimeout(() => {
          setEditingNodeId(newNodeId);
          setEditText("Novo Item");
      }, 100);
  };

  const deleteSelection = () => {
      recordHistory();
      if (selectedNodeId) {
          const toDel = new Set([selectedNodeId]);
          setNodes(prev => prev.filter(n => !toDel.has(n.id)));
          setEdges(prev => prev.filter(e => !toDel.has(e.from) && !toDel.has(e.to)));
          setSelectedNodeId(null);
      } else if (selectedEdgeId) {
          setEdges(prev => prev.filter(e => e.id !== selectedEdgeId));
          setSelectedEdgeId(null);
      }
  };

  const expandWithAi = async () => {
      if (!selectedNodeId) return;
      const node = nodes.find(n => n.id === selectedNodeId);
      if (!node) return;

      setIsExpandingAi(true);
      try {
          const root = nodes.find(n => n.isRoot);
          const parent = node.parentId ? nodes.find(n => n.id === node.parentId) : null;
          const context = `Root Topic: ${root?.text}. Parent Context: ${parent?.text || 'None'}.`;

          const newConcepts = await expandNodeWithAi(node.text, context);
          
          if (newConcepts.length > 0) {
              recordHistory();
              const newNodes: MindMapNode[] = [];
              const newEdges: MindMapEdge[] = [];
              
              // Get current siblings to calculate offset
              const existingSiblingsCount = nodes.filter(n => n.parentId === node.id).length;

              newConcepts.forEach((concept, i) => {
                  const id = `node-ai-${Date.now()}-${i}`;
                  const effectiveIndex = existingSiblingsCount + i;
                  
                  newNodes.push({
                      id,
                      text: concept,
                      x: node.x + 220,
                      y: node.y + (effectiveIndex * 80), 
                      width: 150, height: 60,
                      color: node.color,
                      parentId: node.id,
                      scale: 1,
                      shape: 'rectangle'
                  });
                  newEdges.push({ id: `edge-${id}`, from: node.id, to: id });
              });
              
              setNodes(prev => [...prev, ...newNodes]);
              setEdges(prev => [...prev, ...newEdges]);
          }
      } catch (e: any) {
          alert(e.message);
      } finally {
          setIsExpandingAi(false);
      }
  };

  const updateNodeStyle = (updates: Partial<MindMapNode>) => {
      if (!selectedNodeId) return;
      recordHistory();
      setNodes(prev => prev.map(n => n.id === selectedNodeId ? { ...n, ...updates } : n));
  };

  const updateImageScale = (delta: number) => {
      if (!selectedNodeId) return;
      const node = nodes.find(n => n.id === selectedNodeId);
      if (!node) return;

      const currentScale = node.imageScale || 1;
      let newScale = currentScale + delta;
      
      // Limit to 10x (1000%) and minimum 1x (100%)
      if (newScale < 1) newScale = 1;
      if (newScale > 10) newScale = 10;

      if (newScale === currentScale) return;

      // Logic: The image scale controls the node width/height multiplier
      // We assume the base size is the current size divided by the old scale
      // Then multiply by the new scale.
      const baseW = node.width / currentScale;
      const baseH = node.height / currentScale;

      const newW = baseW * newScale;
      const newH = baseH * newScale;

      recordHistory();
      setNodes(prev => prev.map(n => n.id === selectedNodeId ? { 
          ...n, 
          imageScale: newScale,
          width: newW,
          height: newH
      } : n));
  };

  const increaseFontSize = () => {
      if (!selectedNodeId) return;
      const node = nodes.find(n => n.id === selectedNodeId);
      if (node) {
          const currentSize = node.fontSize || 14;
          updateNodeStyle({ fontSize: currentSize + 2 });
      }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && selectedNodeId) {
          const reader = new FileReader();
          reader.onload = (evt) => {
              updateNodeStyle({ 
                  imageUrl: evt.target?.result as string, 
                  height: 150, 
                  width: 150,
                  imageScale: 1 // Reset scale to 100% on new image
              });
          };
          reader.readAsDataURL(file);
      }
  };

  // --- Rendering ---
  
  const renderEdge = (edge: MindMapEdge) => {
      const from = nodes.find(n => n.id === edge.from);
      const to = nodes.find(n => n.id === edge.to);
      if (!from || !to) return null;

      const sx = from.x + from.width / 2;
      const sy = from.y + from.height / 2;
      const ex = to.x + to.width / 2;
      const ey = to.y + to.height / 2;

      // Bezier Curve
      const dx = Math.abs(ex - sx);
      const d = `M ${sx} ${sy} C ${sx + 50} ${sy}, ${ex - 50} ${ey}, ${ex} ${ey}`; // Smooth curve for right-growing tree
      
      const isSelected = selectedEdgeId === edge.id;

      return (
          <g key={edge.id} onClick={(e) => { e.stopPropagation(); setSelectedEdgeId(edge.id); setSelectedNodeId(null); }}>
              <path d={d} stroke="transparent" strokeWidth="15" fill="none" className="cursor-pointer" />
              <path 
                d={d} 
                stroke={isSelected ? '#a855f7' : (to.color === '#ffffff' ? '#555' : to.color)} 
                strokeWidth={isSelected ? 4 : 2} 
                fill="none" 
                strokeDasharray={edge.style === 'dashed' ? '5,5' : 'none'}
                className="transition-all duration-300 pointer-events-none"
              />
              {edge.label && (
                  <foreignObject x={(sx+ex)/2 - 40} y={(sy+ey)/2 - 10} width="80" height="20">
                      <div className="bg-bg text-[10px] text-text border border-border rounded px-1 text-center truncate">{edge.label}</div>
                  </foreignObject>
              )}
          </g>
      );
  };

  const renderNode = (node: MindMapNode) => {
      const isSelected = selectedNodeId === node.id;
      const isEditing = editingNodeId === node.id;
      
      // Node Style Calculation
      let borderRadius = '8px';
      if (node.shape === 'pill') borderRadius = '9999px';
      if (node.shape === 'circle') borderRadius = '50%';
      
      const isSticky = node.shape === 'sticky';
      const bgColor = isSticky ? node.color : 'var(--bg-surface)';
      
      const baseClasses = `absolute flex flex-col items-center justify-center p-2 group transition-shadow duration-200 select-none bg-surface border-2`;
      const selectedClasses = isSelected ? `ring-2 ring-offset-2 ring-offset-black ring-[${node.color}]` : 'hover:shadow-lg border-border';
      // Removed diamond specific styles

      return (
          <div
            key={node.id}
            className={`${baseClasses} ${selectedClasses}`}
            style={{
                left: node.x, top: node.y, width: node.width, height: node.height,
                borderRadius,
                borderColor: node.color,
                zIndex: isSelected ? 10 : 1,
                cursor: linkingSourceId ? 'crosshair' : 'grab',
            }}
            onPointerDown={(e) => handleNodeDown(e, node.id)}
            onDoubleClick={(e) => { e.stopPropagation(); setEditingNodeId(node.id); setEditText(node.text); }}
          >
              <div 
                className={`w-full h-full flex flex-col items-center justify-center overflow-hidden`}
              >
                  {node.imageUrl && <img src={node.imageUrl} className="w-full h-2/3 object-cover rounded-sm mb-1 pointer-events-none" alt="" />}
                  
                  {isEditing ? (
                      <textarea
                        ref={editInputRef}
                        autoFocus
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        onBlur={() => { 
                            if(editText !== node.text) { recordHistory(); setNodes(ns => ns.map(n => n.id === node.id ? {...n, text: editText} : n)); } 
                            setEditingNodeId(null); 
                        }}
                        onPointerDown={e => e.stopPropagation()} // Allow text selection
                        className="w-full h-full bg-transparent outline-none text-center resize-none p-1"
                        style={{ color: 'var(--text-main)', fontSize: node.fontSize || 14 }}
                      />
                  ) : (
                      <span className="text-center w-full break-words leading-tight" style={{ color: 'var(--text-main)', fontSize: node.fontSize || 14, fontWeight: node.isRoot ? 'bold' : 'normal' }}>
                          {node.text || (isSticky ? "Nota" : "")}
                      </span>
                  )}
              </div>

              {/* Resize Handle (Bottom-Right) - Only if selected and not circle/diamond which are tricky */}
              {isSelected && !isDraggingCanvas && node.shape !== 'circle' && (
                  <div 
                    className="absolute bottom-0 right-0 w-6 h-6 flex items-end justify-end p-0.5 cursor-nwse-resize opacity-50 hover:opacity-100 touch-none"
                    onPointerDown={(e) => handleResizeDown(e, node.id)}
                  >
                      <Scaling size={12} className="text-text-sec" />
                  </div>
              )}

              {/* Selection Menu (Floating Context) */}
              {isSelected && !isEditing && !isDraggingCanvas && !isResizingNode && (
                  <div 
                    className="absolute -top-16 left-1/2 -translate-x-1/2 flex gap-1 bg-[#1e1e1e] border border-[#333] p-1.5 rounded-xl animate-in fade-in zoom-in duration-200"
                    onPointerDown={e => e.stopPropagation()}
                  >
                      {/* Color Picker Button & Popover */}
                      <div className="relative">
                          <button 
                            onClick={() => setShowColorPicker(!showColorPicker)} 
                            className="p-1.5 hover:bg-white/10 rounded text-pink-400 relative" 
                            title="Cor"
                          >
                              <Palette size={16}/>
                          </button>
                          
                          {showColorPicker && (
                              <div className="absolute top-full left-0 mt-2 p-2 bg-[#252525] border border-[#444] rounded-lg grid grid-cols-5 gap-1 z-[60] w-[120px]">
                                  {COLORS.map(c => (
                                      <button 
                                        key={c}
                                        onClick={() => { updateNodeStyle({ color: c }); setShowColorPicker(false); }}
                                        className="w-5 h-5 rounded-full border border-white/20 hover:scale-110 transition-transform"
                                        style={{ backgroundColor: c }}
                                      />
                                  ))}
                              </div>
                          )}
                      </div>

                      <button onClick={increaseFontSize} className="p-1.5 hover:bg-white/10 rounded text-white flex items-center gap-0.5" title="Aumentar Fonte">
                          <Type size={16} />
                          <ChevronUp size={10} />
                      </button>

                      <div className="w-px h-4 bg-white/10 self-center mx-0.5"></div>
                      
                      <button onClick={() => createChildNode(node.id)} className="p-1.5 hover:bg-white/10 rounded text-green-400 font-bold" title="Adicionar Filho"><Plus size={18}/></button>
                      <button onClick={startLinking.bind(null, node.id)} className="p-1.5 hover:bg-white/10 rounded text-yellow-400" title="Conectar"><Link size={16}/></button>
                      <button onClick={expandWithAi} className="p-1.5 hover:bg-white/10 rounded text-brand relative" title="Expandir com IA">
                          {isExpandingAi ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16}/>}
                      </button>
                      <div className="w-px h-4 bg-white/10 self-center mx-0.5"></div>
                      <button onClick={() => fileInputRef.current?.click()} className="p-1.5 hover:bg-white/10 rounded text-blue-400" title="Imagem"><ImageIcon size={16}/></button>
                      
                      {/* Image Zoom Control (Only if image exists) */}
                      {node.imageUrl && (
                          <>
                              <div className="w-px h-4 bg-white/10 self-center mx-0.5"></div>
                              <div className="flex items-center gap-1 bg-white/5 rounded px-1">
                                  <button onClick={() => updateImageScale(-1)} className="p-1 hover:bg-white/10 rounded text-white" title="Reduzir Imagem">
                                      <Minus size={12} />
                                  </button>
                                  <span className="text-[10px] w-8 text-center text-white font-mono">{ (node.imageScale || 1) * 100 }%</span>
                                  <button onClick={() => updateImageScale(1)} className="p-1 hover:bg-white/10 rounded text-white" title="Aumentar Imagem">
                                      <Plus size={12} />
                                  </button>
                              </div>
                          </>
                      )}

                      {!node.isRoot && <button onClick={deleteSelection} className="p-1.5 hover:bg-red-500/20 rounded text-red-400 ml-1" title="Excluir"><Trash2 size={16}/></button>}
                  </div>
              )}
          </div>
      );
  };

  return (
    <div className="w-full h-full bg-[#000000] relative overflow-hidden flex flex-col font-sans select-none text-text">
        {/* Immersive Background */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_#1a1a1a_0%,_#000000_100%)] z-0" />
        
        {/* Animated Grid */}
        <div 
            className="absolute inset-0 pointer-events-none opacity-20 immersive-grid z-0 mindmap-bg"
            style={{
                backgroundImage: 'radial-gradient(#444 1px, transparent 1px)',
                backgroundSize: `${30 * viewport.zoom}px ${30 * viewport.zoom}px`,
                // We add viewport offset here for static position, animation handles drift
                backgroundPosition: `${viewport.x}px ${viewport.y}px`
            }}
        />

        {/* Header Overlay */}
        <div className="absolute top-4 left-4 z-40 flex items-center gap-3 ui-layer">
            <button onClick={onToggleMenu} className="p-2.5 bg-surface rounded-xl border border-border hover:border-brand/50 text-text-sec hover:text-text transition-colors">
                <Menu size={22} />
            </button>
            <div className="flex flex-col">
                <span className="font-bold text-sm bg-surface px-3 py-1 rounded-lg border border-white/5">{fileName.replace('.mindmap','')}</span>
            </div>
            {(isLocalFile || !navigator.onLine) && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 rounded-lg text-xs font-bold">
                    <WifiOff size={14} /> Offline
                </div>
            )}
        </div>

        {/* Save/Export Overlay */}
        <div className="absolute top-4 right-4 z-40 flex gap-2 ui-layer">
            <button onClick={saveToLocal} className="p-2.5 bg-surface rounded-xl border border-border hover:bg-white/5 text-text transition-colors" title="Baixar Local">
                <Download size={20} />
            </button>
            {!isLocalFile && (
                <button onClick={saveToDrive} className="flex items-center gap-2 px-4 py-2.5 bg-brand text-bg rounded-xl font-bold hover:brightness-110 transition-all">
                    {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    <span className="hidden sm:inline">Salvar</span>
                </button>
            )}
        </div>

        {/* Main Canvas */}
        <div 
            ref={containerRef}
            className={`w-full h-full touch-none ${isDraggingCanvas ? 'cursor-grabbing' : 'cursor-default'}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onWheel={handleWheel}
        >
            <div 
                className="w-full h-full transform-gpu origin-top-left"
                style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}
            >
                {/* Edges Layer */}
                <svg className="absolute top-0 left-0 overflow-visible" style={{ width: 1, height: 1 }}>
                    {edges.map(renderEdge)}
                    {linkingSourceId && dragStart && (
                        <path 
                            d={`M ${nodes.find(n=>n.id===linkingSourceId)!.x + nodes.find(n=>n.id===linkingSourceId)!.width/2} ${nodes.find(n=>n.id===linkingSourceId)!.y + nodes.find(n=>n.id===linkingSourceId)!.height/2} L ${(dragStart.x - viewport.x)/viewport.zoom} ${(dragStart.y - viewport.y)/viewport.zoom}`}
                            stroke="#a855f7" strokeWidth="2" strokeDasharray="5,5" fill="none"
                        />
                    )}
                </svg>

                {/* Nodes Layer */}
                {nodes.map(renderNode)}
            </div>
        </div>

        {/* Bottom Toolbar */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#1e1e1e] border border-[#333] p-2 rounded-2xl flex items-center gap-2 ui-layer animate-in slide-in-from-bottom-10">
            <div className="flex gap-1 pr-2 border-r border-white/10">
                <button onClick={undo} disabled={historyPast.length===0} className={`p-2 rounded-lg ${historyPast.length ? 'hover:bg-white/10 text-text' : 'text-zinc-600'}`}><Undo size={20}/></button>
                <button onClick={redo} disabled={historyFuture.length===0} className={`p-2 rounded-lg ${historyFuture.length ? 'hover:bg-white/10 text-text' : 'text-zinc-600'}`}><Redo size={20}/></button>
            </div>
            
            <div className="flex gap-1">
                <button onClick={() => {
                    recordHistory();
                    setNodes(prev => [...prev, {
                        id: `node-${Date.now()}`,
                        text: "Novo Item",
                        x: (window.innerWidth/2 - viewport.x)/viewport.zoom,
                        y: (window.innerHeight/2 - viewport.y)/viewport.zoom,
                        width: 160, height: 60,
                        color: '#a855f7',
                        scale: 1,
                        shape: 'pill'
                    }]);
                }} className="p-2 bg-brand text-bg rounded-lg hover:brightness-110"><Plus size={22}/></button>
            </div>

            <div className="w-px h-6 bg-white/10 mx-1"></div>

            <div className="flex gap-1">
                {SHAPES.map(s => (
                    <button 
                        key={s.id} 
                        onClick={() => selectedNodeId && updateNodeStyle({ shape: s.id })}
                        className={`p-2 rounded-lg text-text-sec hover:text-text hover:bg-white/10 ${selectedNodeId && nodes.find(n => n.id === selectedNodeId)?.shape === s.id ? 'bg-white/10 text-brand' : ''}`}
                    >
                        <s.icon size={18} />
                    </button>
                ))}
            </div>
        </div>

        {/* Hidden Inputs */}
        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
    </div>
  );
};
