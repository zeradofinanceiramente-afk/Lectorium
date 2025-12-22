
import React, { useState, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { X, Image as ImageIcon, RotateCw, AlignCenter, AlignLeft, Type, Crop, RefreshCcw, Check } from 'lucide-react';

interface Props {
  editor: Editor | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ImageOptionsSidebar: React.FC<Props> = ({ editor, isOpen, onClose }) => {
  const [width, setWidth] = useState<number | string>('');
  const [widthCm, setWidthCm] = useState<string>('');
  const [rotation, setRotation] = useState<number>(0);
  const [altText, setAltText] = useState('');
  const [title, setTitle] = useState('');
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('center');
  const [previewSrc, setPreviewSrc] = useState('');
  
  // Crop State (Local Temporary)
  const [tempCrop, setTempCrop] = useState({ top: 0, right: 0, bottom: 0, left: 0 });

  // Sync state with selected image
  useEffect(() => {
    if (!editor || !isOpen) return;

    const { selection } = editor.state;
    const node = editor.state.doc.nodeAt(selection.from);
    
    if (node && node.type.name === 'image') {
      const w = node.attrs.width;
      setWidth(w || '');
      if (w) setWidthCm((w / 37.795).toFixed(2));
      else setWidthCm('');

      setPreviewSrc(node.attrs.src || '');
      setRotation(node.attrs.rotation || 0);
      setAltText(node.attrs.alt || '');
      setTitle(node.attrs.title || '');
      
      // Load existing crop into temp state
      setTempCrop(node.attrs.crop || { top: 0, right: 0, bottom: 0, left: 0 });
      
      if (editor.isActive({ textAlign: 'left' })) setAlign('left');
      else if (editor.isActive({ textAlign: 'right' })) setAlign('right');
      else setAlign('center');
    }
  }, [editor, isOpen, editor?.state.selection]);

  const updateAttribute = (key: string, value: any) => {
    if (!editor) return;
    editor.commands.updateAttributes('image', { [key]: value });
  };

  const applyCrop = () => {
    if (!editor) return;
    editor.commands.updateAttributes('image', { crop: tempCrop, isCropping: false });
  };

  const handleWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setWidth(isNaN(val) ? '' : val);
    
    if (!isNaN(val)) {
        setWidthCm((val / 37.795).toFixed(2));
        updateAttribute('width', val);
    } else {
        setWidthCm('');
        updateAttribute('width', null);
    }
  };

  const handleWidthCmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setWidthCm(val);
    const num = parseFloat(val);
    if (!isNaN(num)) {
        const px = Math.round(num * 37.795);
        setWidth(px);
        updateAttribute('width', px);
    } else {
        setWidth('');
        updateAttribute('width', null);
    }
  };

  const handleRotationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setRotation(isNaN(val) ? 0 : val);
    if (!isNaN(val)) updateAttribute('rotation', val);
  };

  const handleAlign = (newAlign: 'left' | 'center' | 'right') => {
    if (!editor) return;
    setAlign(newAlign);
    editor.chain().focus().setTextAlign(newAlign).run();
  };

  const updateTempCrop = (side: keyof typeof tempCrop, value: number) => {
    setTempCrop(prev => ({ ...prev, [side]: value }));
  };

  const resetCrop = () => {
    setTempCrop({ top: 0, right: 0, bottom: 0, left: 0 });
  };

  if (!isOpen) return null;

  return (
    <div className="absolute inset-y-0 right-0 z-[60] w-80 bg-surface shadow-2xl border-l border-border flex flex-col animate-in slide-in-from-right duration-200">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="font-bold text-text flex items-center gap-2">
          <ImageIcon size={18} className="text-brand" />
          Opções de Imagem
        </h3>
        <button onClick={onClose} className="text-text-sec hover:text-text">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        
        {/* Size & Rotation */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-text-sec uppercase tracking-wider">Tamanho e Rotação</h4>
          
          <div className="flex gap-4">
             <div className="flex-1 space-y-1">
                <label className="text-xs text-text-sec">Largura (px)</label>
                <input 
                  type="number" 
                  value={width} 
                  onChange={handleWidthChange}
                  className="w-full bg-bg border border-border rounded p-2 text-sm text-text focus:border-brand outline-none"
                />
             </div>
             <div className="flex-1 space-y-1">
                <label className="text-xs text-text-sec">Largura (cm)</label>
                <input 
                  type="number" 
                  step="0.1"
                  value={widthCm} 
                  onChange={handleWidthCmChange}
                  className="w-full bg-bg border border-border rounded p-2 text-sm text-text focus:border-brand outline-none"
                />
             </div>
          </div>
          
          <div className="space-y-1">
            <label className="text-xs text-text-sec flex items-center gap-1"><RotateCw size={10}/> Ângulo</label>
            <div className="relative">
                <input 
                  type="number" 
                  value={rotation} 
                  onChange={handleRotationChange}
                  className="w-full bg-bg border border-border rounded p-2 text-sm text-text focus:border-brand outline-none pr-6"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-text-sec text-xs">°</span>
            </div>
          </div>
        </div>

        <div className="h-px bg-border"></div>

        {/* Crop / Recorte (SIMULATION) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
             <h4 className="text-xs font-bold text-text-sec uppercase tracking-wider flex items-center gap-2">
               <Crop size={14} /> Recorte (%)
             </h4>
             {(tempCrop.top > 0 || tempCrop.bottom > 0 || tempCrop.left > 0 || tempCrop.right > 0) && (
                <button onClick={resetCrop} className="text-[10px] flex items-center gap-1 text-red-400 hover:text-red-300">
                   <RefreshCcw size={10} /> Resetar
                </button>
             )}
          </div>

          {/* PREVIEW BOX */}
          <div className="relative w-full aspect-video bg-[#141414] border border-border rounded-lg overflow-hidden flex items-center justify-center">
              {previewSrc && (
                  <div className="relative w-full h-full">
                      <img src={previewSrc} className="w-full h-full object-contain" alt="Preview" />
                      
                      {/* Overlays to simulate crop */}
                      <div className="absolute top-0 left-0 right-0 bg-black/70 pointer-events-none transition-all duration-75" style={{ height: `${tempCrop.top}%` }} />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 pointer-events-none transition-all duration-75" style={{ height: `${tempCrop.bottom}%` }} />
                      <div className="absolute top-0 left-0 bottom-0 bg-black/70 pointer-events-none transition-all duration-75" style={{ top: `${tempCrop.top}%`, bottom: `${tempCrop.bottom}%`, width: `${tempCrop.left}%` }} />
                      <div className="absolute top-0 right-0 bottom-0 bg-black/70 pointer-events-none transition-all duration-75" style={{ top: `${tempCrop.top}%`, bottom: `${tempCrop.bottom}%`, width: `${tempCrop.right}%` }} />
                      
                      {/* Guides */}
                      <div className="absolute border border-white/50 pointer-events-none transition-all duration-75" 
                           style={{ top: `${tempCrop.top}%`, bottom: `${tempCrop.bottom}%`, left: `${tempCrop.left}%`, right: `${tempCrop.right}%` }} />
                  </div>
              )}
          </div>
          
          <div className="grid grid-cols-2 gap-3">
             <div className="space-y-1">
               <label className="text-[10px] text-text-sec">Topo</label>
               <input 
                 type="range" min="0" max="50" value={tempCrop.top} 
                 onChange={e => updateTempCrop('top', parseInt(e.target.value))}
                 className="w-full accent-brand h-1 bg-bg rounded-lg appearance-none cursor-pointer"
               />
             </div>
             <div className="space-y-1">
               <label className="text-[10px] text-text-sec">Direita</label>
               <input 
                 type="range" min="0" max="50" value={tempCrop.right} 
                 onChange={e => updateTempCrop('right', parseInt(e.target.value))}
                 className="w-full accent-brand h-1 bg-bg rounded-lg appearance-none cursor-pointer"
               />
             </div>
             <div className="space-y-1">
               <label className="text-[10px] text-text-sec">Baixo</label>
               <input 
                 type="range" min="0" max="50" value={tempCrop.bottom} 
                 onChange={e => updateTempCrop('bottom', parseInt(e.target.value))}
                 className="w-full accent-brand h-1 bg-bg rounded-lg appearance-none cursor-pointer"
               />
             </div>
             <div className="space-y-1">
               <label className="text-[10px] text-text-sec">Esquerda</label>
               <input 
                 type="range" min="0" max="50" value={tempCrop.left} 
                 onChange={e => updateTempCrop('left', parseInt(e.target.value))}
                 className="w-full accent-brand h-1 bg-bg rounded-lg appearance-none cursor-pointer"
               />
             </div>
          </div>

          <button 
            onClick={applyCrop}
            className="w-full bg-brand hover:bg-brand/90 text-bg py-2 rounded font-bold text-xs flex items-center justify-center gap-2 transition-colors"
          >
            <Check size={14} /> Aplicar Recorte
          </button>
        </div>

        <div className="h-px bg-border"></div>

        {/* Text Wrapping / Alignment */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-text-sec uppercase tracking-wider">Ajuste de Texto</h4>
          <div className="grid grid-cols-2 gap-2">
             <button 
               onClick={() => handleAlign('left')}
               className={`flex flex-col items-center gap-2 p-3 rounded border transition-colors ${align === 'left' ? 'bg-brand/10 border-brand text-brand' : 'bg-bg border-border text-text-sec hover:border-text-sec'}`}
             >
                <AlignLeft size={20} />
                <span className="text-xs font-medium">Inline</span>
             </button>
             <button 
               onClick={() => handleAlign('center')}
               className={`flex flex-col items-center gap-2 p-3 rounded border transition-colors ${align === 'center' ? 'bg-brand/10 border-brand text-brand' : 'bg-bg border-border text-text-sec hover:border-text-sec'}`}
             >
                <AlignCenter size={20} />
                <span className="text-xs font-medium">Quebrar Texto</span>
             </button>
          </div>
        </div>

        <div className="h-px bg-border"></div>

        {/* Alt Text */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-text-sec uppercase tracking-wider">Texto Alternativo</h4>
          
          <div className="space-y-1">
             <label className="text-xs text-text-sec">Título</label>
             <input 
               type="text" 
               value={title} 
               onChange={(e) => { setTitle(e.target.value); updateAttribute('title', e.target.value); }}
               className="w-full bg-bg border border-border rounded p-2 text-sm text-text focus:border-brand outline-none"
               placeholder="Título da imagem"
             />
          </div>

          <div className="space-y-1">
             <label className="text-xs text-text-sec">Descrição</label>
             <textarea 
               value={altText} 
               onChange={(e) => { setAltText(e.target.value); updateAttribute('alt', e.target.value); }}
               className="w-full bg-bg border border-border rounded p-2 text-sm text-text focus:border-brand outline-none min-h-[80px]"
               placeholder="Descreva a imagem para leitores de tela..."
             />
          </div>
        </div>

      </div>
    </div>
  );
};
