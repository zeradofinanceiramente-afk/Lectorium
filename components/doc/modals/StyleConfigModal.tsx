
import React, { useState, useEffect } from 'react';
import { X, Type, AlignLeft, ArrowUpFromLine, Code, Copy, Check } from 'lucide-react';
import { BaseModal } from '../../shared/BaseModal';

export interface StyleConfig {
  id: string;
  label: string;
  type: 'paragraph' | 'heading';
  level?: number; // Para headings
  fontFamily: string;
  fontSize: number; // pt
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  textAlign: 'left' | 'center' | 'right' | 'justify';
  marginTop: number; // pt
  marginBottom: number; // pt
  lineHeight: number; // multiplier
  textIndent: string; // cm or pt
  marginLeft?: string; // cm or pt (para citações)
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  styleConfig: StyleConfig | null;
  onSave: (config: StyleConfig) => void;
}

const FONTS = [
  'Times New Roman', 'Arial', 'Inter', 'Calibri', 'Georgia'
];

export const StyleConfigModal: React.FC<Props> = ({ isOpen, onClose, styleConfig, onSave }) => {
  const [config, setConfig] = useState<StyleConfig | null>(null);
  const [viewMode, setViewMode] = useState<'edit' | 'export'>('edit');
  const [generatedCode, setGeneratedCode] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && styleConfig) {
      setConfig({ ...styleConfig });
      setViewMode('edit');
    }
  }, [isOpen, styleConfig]);

  const handleExport = () => {
    if (!config) return;

    // Gerar CSS
    const selector = config.type === 'heading' ? `h${config.level}` : `.abnt-${config.id}`;
    
    const css = `${selector} {
  font-family: "${config.fontFamily}", serif;
  font-size: ${config.fontSize}pt;
  font-weight: ${config.fontWeight};
  font-style: ${config.fontStyle};
  text-transform: ${config.textTransform};
  text-align: ${config.textAlign};
  line-height: ${config.lineHeight};
  margin-top: ${config.marginTop}pt;
  margin-bottom: ${config.marginBottom}pt;
  text-indent: ${config.textIndent};
  ${config.marginLeft ? `margin-left: ${config.marginLeft};` : ''}
  color: #000000;
}`;

    const html = `<!-- Estilo Lectorium: ${config.label} -->
<style>
${css}
</style>

<!-- Exemplo de Uso -->
${config.type === 'heading' 
  ? `<h${config.level}>${config.label}</h${config.level}>` 
  : `<p class="abnt-${config.id}">Texto de exemplo...</p>`
}`;

    setGeneratedCode(html);
    setViewMode('export');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen || !config) return null;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Editar Estilo: ${config.label}`}
      icon={<Type size={20} />}
      maxWidth="max-w-2xl"
      footer={
        <div className="flex justify-between w-full">
            {viewMode === 'edit' ? (
                <button 
                    onClick={handleExport} 
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-400 rounded-xl hover:bg-blue-500/20 transition-colors border border-blue-500/30 text-sm font-medium"
                >
                    <Code size={16} /> Exportar HTML
                </button>
            ) : (
                <button 
                    onClick={() => setViewMode('edit')} 
                    className="px-4 py-2 text-text-sec hover:text-white transition-colors text-sm"
                >
                    Voltar para Edição
                </button>
            )}
            
            {viewMode === 'edit' && (
                <div className="flex gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-text-sec hover:text-white transition-colors text-sm">Cancelar</button>
                    <button onClick={() => { onSave(config); onClose(); }} className="bg-brand text-[#0b141a] px-6 py-2 rounded-full font-bold hover:brightness-110 transition-all text-sm">
                        Salvar Alterações
                    </button>
                </div>
            )}
        </div>
      }
    >
      {viewMode === 'export' ? (
          <div className="space-y-4">
              <div className="bg-[#141414] p-4 rounded-xl border border-[#333] relative group">
                  <pre className="text-xs font-mono text-green-400 overflow-x-auto whitespace-pre-wrap">{generatedCode}</pre>
                  <button 
                    onClick={handleCopy}
                    className="absolute top-2 right-2 p-2 bg-[#2c2c2c] hover:bg-[#3c3c3c] rounded text-white transition-colors border border-[#444]"
                  >
                      {copied ? <Check size={16} className="text-green-500"/> : <Copy size={16}/>}
                  </button>
              </div>
              <p className="text-xs text-text-sec">Copie este código para usar o mesmo estilo em páginas web ou outros editores.</p>
          </div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Typography */}
            <div className="space-y-4">
                <h4 className="text-xs font-bold text-brand uppercase tracking-wider flex items-center gap-2 border-b border-[#333] pb-2">
                    <Type size={14} /> Tipografia
                </h4>
                
                <div className="space-y-1">
                    <label className="text-xs text-text-sec">Fonte</label>
                    <select 
                        className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-brand outline-none"
                        value={config.fontFamily}
                        onChange={(e) => setConfig({ ...config, fontFamily: e.target.value })}
                    >
                        {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-xs text-text-sec">Tamanho (pt)</label>
                        <input 
                            type="number" 
                            className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-brand outline-none"
                            value={config.fontSize}
                            onChange={(e) => setConfig({ ...config, fontSize: parseInt(e.target.value) })}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-text-sec">Peso</label>
                        <select 
                            className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-brand outline-none"
                            value={config.fontWeight}
                            onChange={(e) => setConfig({ ...config, fontWeight: e.target.value as any })}
                        >
                            <option value="normal">Normal</option>
                            <option value="bold">Negrito</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-xs text-text-sec">Estilo</label>
                        <select 
                            className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-brand outline-none"
                            value={config.fontStyle}
                            onChange={(e) => setConfig({ ...config, fontStyle: e.target.value as any })}
                        >
                            <option value="normal">Normal</option>
                            <option value="italic">Itálico</option>
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-text-sec">Transformação</label>
                        <select 
                            className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-brand outline-none"
                            value={config.textTransform}
                            onChange={(e) => setConfig({ ...config, textTransform: e.target.value as any })}
                        >
                            <option value="none">Nenhuma</option>
                            <option value="uppercase">MAIÚSCULAS</option>
                            <option value="lowercase">minúsculas</option>
                            <option value="capitalize">Capitalizado</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Layout & Spacing */}
            <div className="space-y-4">
                <h4 className="text-xs font-bold text-brand uppercase tracking-wider flex items-center gap-2 border-b border-[#333] pb-2">
                    <ArrowUpFromLine size={14} /> Layout
                </h4>

                <div className="space-y-1">
                    <label className="text-xs text-text-sec flex items-center gap-1"><AlignLeft size={12}/> Alinhamento</label>
                    <div className="flex bg-[#2c2c2c] rounded p-1 border border-gray-600">
                        {['left', 'center', 'right', 'justify'].map((align) => (
                            <button
                                key={align}
                                onClick={() => setConfig({ ...config, textAlign: align as any })}
                                className={`flex-1 py-1 rounded text-xs capitalize ${config.textAlign === align ? 'bg-brand text-black font-bold' : 'text-gray-400 hover:text-white'}`}
                            >
                                {align === 'justify' ? 'Just.' : align}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-xs text-text-sec">Espaço Antes (pt)</label>
                        <input 
                            type="number" 
                            className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-brand outline-none"
                            value={config.marginTop}
                            onChange={(e) => setConfig({ ...config, marginTop: parseInt(e.target.value) })}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-text-sec">Espaço Depois (pt)</label>
                        <input 
                            type="number" 
                            className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-brand outline-none"
                            value={config.marginBottom}
                            onChange={(e) => setConfig({ ...config, marginBottom: parseInt(e.target.value) })}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-xs text-text-sec">Entrelinhas</label>
                        <input 
                            type="number"
                            step="0.1"
                            className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-brand outline-none"
                            value={config.lineHeight}
                            onChange={(e) => setConfig({ ...config, lineHeight: parseFloat(e.target.value) })}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-text-sec">Recuo 1ª Linha</label>
                        <input 
                            type="text" 
                            className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-brand outline-none"
                            value={config.textIndent}
                            onChange={(e) => setConfig({ ...config, textIndent: e.target.value })}
                            placeholder="ex: 1.25cm"
                        />
                    </div>
                </div>
            </div>
          </div>
      )}
    </BaseModal>
  );
};
