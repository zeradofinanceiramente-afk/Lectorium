
import React, { useState, useEffect } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { 
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell 
} from 'recharts';
import { Settings2, BarChart3, LineChart as LineChartIcon, PieChart as PieIcon, Activity, Radar as RadarIcon, X, Check, Table, Code, Plus, Trash2 } from 'lucide-react';

// Cores Modernas
const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#a4de6c', '#d0ed57', '#83a6ed', '#8dd1e1'];

const DEFAULT_DATA = [
  { name: 'Jan', valor: 400, meta: 240 },
  { name: 'Fev', valor: 300, meta: 139 },
  { name: 'Mar', valor: 200, meta: 980 },
  { name: 'Abr', valor: 278, meta: 390 },
  { name: 'Mai', valor: 189, meta: 480 },
];

export const ChartNodeView = (props: any) => {
  const { node, updateAttributes } = props;
  const [isEditing, setIsEditing] = useState(false);
  
  const type = node.attrs.type || 'bar'; // bar, line, area, pie, radar
  const data = node.attrs.data || DEFAULT_DATA;
  const title = node.attrs.title || 'Gráfico';
  
  // -- State for Editor --
  const [editMode, setEditMode] = useState<'visual' | 'json'>('visual');
  const [jsonText, setJsonText] = useState('');
  const [tempTitle, setTempTitle] = useState('');
  const [visualData, setVisualData] = useState<any[]>([]);
  const [seriesKeys, setSeriesKeys] = useState<string[]>([]);

  // Initialize Editor State when opening
  useEffect(() => {
    if (isEditing) {
        setJsonText(JSON.stringify(data, null, 2));
        setTempTitle(title);
        setVisualData(JSON.parse(JSON.stringify(data))); // Deep copy
        
        // Extract series keys (keys that are not 'name')
        if (data.length > 0) {
            const keys = Object.keys(data[0]).filter(k => k !== 'name');
            setSeriesKeys(keys);
        } else {
            setSeriesKeys(['valor']);
        }
    }
  }, [isEditing, data, title]);

  const dataKeys = Object.keys(data[0] || {}).filter(k => k !== 'name');

  const handleSave = () => {
    try {
      let finalData = visualData;
      
      // Se estiver no modo JSON, o texto tem prioridade
      if (editMode === 'json') {
          finalData = JSON.parse(jsonText);
      }

      // Validação básica
      if (!Array.isArray(finalData)) throw new Error("Dados devem ser uma lista.");

      updateAttributes({ data: finalData, title: tempTitle });
      setIsEditing(false);
    } catch (e) {
      alert("Erro nos dados: Verifique se o formato está correto.");
    }
  };

  // --- Visual Editor Helpers ---

  const updateVisualCell = (rowIndex: number, key: string, value: string | number) => {
      const newData = [...visualData];
      // Se for numérico, tenta converter
      if (key !== 'name') {
          const num = parseFloat(value as string);
          newData[rowIndex][key] = isNaN(num) ? 0 : num;
      } else {
          newData[rowIndex][key] = value;
      }
      setVisualData(newData);
      setJsonText(JSON.stringify(newData, null, 2)); // Sync JSON
  };

  const addRow = () => {
      const newRow: any = { name: 'Novo Item' };
      seriesKeys.forEach(k => newRow[k] = 0);
      const newData = [...visualData, newRow];
      setVisualData(newData);
      setJsonText(JSON.stringify(newData, null, 2));
  };

  const removeRow = (index: number) => {
      const newData = visualData.filter((_, i) => i !== index);
      setVisualData(newData);
      setJsonText(JSON.stringify(newData, null, 2));
  };

  const addSeries = () => {
      const name = prompt("Nome da nova série (ex: Meta, Lucro):");
      if (name && !seriesKeys.includes(name)) {
          const newKeys = [...seriesKeys, name];
          setSeriesKeys(newKeys);
          
          const newData = visualData.map(row => ({ ...row, [name]: 0 }));
          setVisualData(newData);
          setJsonText(JSON.stringify(newData, null, 2));
      }
  };

  const removeSeries = (key: string) => {
      if (seriesKeys.length <= 1) {
          alert("É necessário ter pelo menos uma série de dados.");
          return;
      }
      if (confirm(`Remover a coluna "${key}"?`)) {
          const newKeys = seriesKeys.filter(k => k !== key);
          setSeriesKeys(newKeys);
          
          const newData = visualData.map(row => {
              const { [key]: _, ...rest } = row;
              return rest;
          });
          setVisualData(newData);
          setJsonText(JSON.stringify(newData, null, 2));
      }
  };

  // --- Rendering ---

  const renderChart = () => {
    const commonProps = { data, margin: { top: 10, right: 30, left: 0, bottom: 0 } };
    const grid = <CartesianGrid strokeDasharray="3 3" stroke="#444" />;
    const axis = (
        <>
            <XAxis dataKey="name" stroke="#888" fontSize={12} tick={{fill: '#888'}} />
            <YAxis stroke="#888" fontSize={12} tick={{fill: '#888'}} />
            <Tooltip 
                contentStyle={{ backgroundColor: '#222', borderColor: '#444', color: '#fff' }} 
                itemStyle={{ color: '#fff' }}
                cursor={{fill: 'rgba(255,255,255,0.1)'}}
            />
            <Legend wrapperStyle={{ paddingTop: '10px' }} />
        </>
    );

    switch (type) {
        case 'line':
            return (
                <LineChart {...commonProps}>
                    {grid}
                    {axis}
                    {dataKeys.map((key, i) => (
                        <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                    ))}
                </LineChart>
            );
        case 'area':
            return (
                <AreaChart {...commonProps}>
                    <defs>
                        {dataKeys.map((key, i) => (
                            <linearGradient key={key} id={`color${key}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.8}/>
                                <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0}/>
                            </linearGradient>
                        ))}
                    </defs>
                    {grid}
                    {axis}
                    {dataKeys.map((key, i) => (
                        <Area key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} fillOpacity={1} fill={`url(#color${key})`} />
                    ))}
                </AreaChart>
            );
        case 'pie':
            const valKey = dataKeys[0];
            return (
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey={valKey}
                        label={({name, percent}: {name: string, percent: number}) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                        {data.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#222', borderColor: '#444', color: '#fff' }} />
                    <Legend />
                </PieChart>
            );
        case 'radar':
            return (
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
                    <PolarGrid stroke="#444" />
                    <PolarAngleAxis dataKey="name" stroke="#888" fontSize={12} />
                    <PolarRadiusAxis angle={30} domain={[0, 'auto']} stroke="#666" />
                    {dataKeys.map((key, i) => (
                        <Radar key={key} name={key} dataKey={key} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.4} />
                    ))}
                    <Tooltip contentStyle={{ backgroundColor: '#222', borderColor: '#444', color: '#fff' }} />
                    <Legend />
                </RadarChart>
            );
        case 'bar':
        default:
            return (
                <BarChart {...commonProps}>
                    {grid}
                    {axis}
                    {dataKeys.map((key, i) => (
                        <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
                    ))}
                </BarChart>
            );
    }
  };

  const ChartTypeButton = ({ t, icon: Icon, label }: any) => (
      <button 
        onClick={() => updateAttributes({ type: t })}
        className={`p-2 rounded-lg flex flex-col items-center gap-1 text-[10px] transition-colors ${type === t ? 'bg-brand/20 text-brand border border-brand/30' : 'bg-surface/50 text-text-sec hover:bg-surface border border-transparent'}`}
        title={label}
        onMouseDown={(e) => e.stopPropagation()}
      >
          <Icon size={16} />
      </button>
  );

  return (
    <NodeViewWrapper className="react-renderer my-8 select-none w-full flex justify-center">
      <div className="relative group p-6 border border-border/50 hover:border-brand/50 rounded-2xl transition-all w-full max-w-4xl bg-gradient-to-b from-[#1a1a1a] to-[#121212] shadow-xl">
        
        {/* Header Visual */}
        <div className="flex flex-col items-center mb-6">
           <h3 className="text-xl font-bold text-text tracking-tight">{title}</h3>
           <div className="w-16 h-1 bg-brand/50 rounded-full mt-2"></div>
        </div>

        {/* Toolbar (Hover) */}
        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-2 z-20">
            <button 
            onClick={() => setIsEditing(true)}
            className="p-2 bg-brand text-bg rounded-full shadow-lg hover:brightness-110 transition-transform hover:scale-110"
            title="Editar Dados"
            >
                <Settings2 size={18}/>
            </button>
        </div>

        {/* Chart Area */}
        <div className="w-full h-[350px] text-xs">
           <ResponsiveContainer width="100%" height="100%">
              {renderChart()}
           </ResponsiveContainer>
        </div>

        {/* Editor Modal Overlay */}
        {isEditing && (
            <div 
                className="absolute inset-0 bg-[#121212]/95 backdrop-blur-md z-50 p-6 rounded-2xl flex flex-col animate-in fade-in zoom-in-95 border border-border"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-4">
                    <span className="font-bold text-lg flex items-center gap-2 text-brand">
                        <Settings2 size={20} /> Editor de Gráfico
                    </span>
                    <button onClick={() => setIsEditing(false)} className="text-text-sec hover:text-red-400 p-1 rounded-full hover:bg-white/5 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex gap-2 mb-4 justify-center bg-black/20 p-2 rounded-xl">
                    <ChartTypeButton t="bar" icon={BarChart3} label="Barras" />
                    <ChartTypeButton t="line" icon={LineChartIcon} label="Linhas" />
                    <ChartTypeButton t="area" icon={Activity} label="Área" />
                    <ChartTypeButton t="pie" icon={PieIcon} label="Pizza" />
                    <ChartTypeButton t="radar" icon={RadarIcon} label="Radar" />
                </div>

                <div className="flex gap-2 mb-4">
                    <input 
                       className="flex-1 bg-[#2c2c2c] border border-border rounded-lg p-3 text-sm text-white focus:border-brand outline-none"
                       value={tempTitle}
                       onChange={e => setTempTitle(e.target.value)}
                       placeholder="Título do Gráfico"
                       onKeyDown={(e) => e.stopPropagation()}
                    />
                    <div className="flex bg-[#2c2c2c] rounded-lg p-1 border border-border">
                        <button 
                            onClick={() => setEditMode('visual')}
                            className={`px-3 py-1 text-xs rounded font-bold flex items-center gap-1 transition-colors ${editMode === 'visual' ? 'bg-brand text-black' : 'text-gray-400 hover:text-white'}`}
                        >
                            <Table size={12} /> Visual
                        </button>
                        <button 
                            onClick={() => setEditMode('json')}
                            className={`px-3 py-1 text-xs rounded font-bold flex items-center gap-1 transition-colors ${editMode === 'json' ? 'bg-brand text-black' : 'text-gray-400 hover:text-white'}`}
                        >
                            <Code size={12} /> JSON
                        </button>
                    </div>
                </div>
                
                {/* EDITOR CONTENT AREA */}
                <div className="flex-1 relative overflow-hidden bg-[#1e1e1e] border border-border rounded-lg">
                    {editMode === 'visual' ? (
                        <div className="h-full overflow-auto custom-scrollbar">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-text-sec uppercase bg-black/40 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-4 py-3 font-bold border-b border-[#333] w-1/3">Categoria (Eixo X)</th>
                                        {seriesKeys.map((key) => (
                                            <th key={key} className="px-4 py-3 font-bold border-b border-[#333] relative group">
                                                <div className="flex items-center justify-between">
                                                    {key}
                                                    <button onClick={() => removeSeries(key)} className="text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 p-1 rounded">
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            </th>
                                        ))}
                                        <th className="px-2 py-3 border-b border-[#333] w-10">
                                            <button onClick={addSeries} className="text-brand hover:bg-brand/10 p-1 rounded" title="Nova Série">
                                                <Plus size={14} />
                                            </button>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visualData.map((row, rowIndex) => (
                                        <tr key={rowIndex} className="border-b border-[#333] hover:bg-white/5">
                                            <td className="p-2">
                                                <input 
                                                    className="w-full bg-transparent outline-none text-white font-medium focus:text-brand"
                                                    value={row.name}
                                                    onChange={(e) => updateVisualCell(rowIndex, 'name', e.target.value)}
                                                />
                                            </td>
                                            {seriesKeys.map((key) => (
                                                <td key={key} className="p-2">
                                                    <input 
                                                        type="number"
                                                        className="w-full bg-transparent outline-none text-gray-300 font-mono text-right focus:text-brand"
                                                        value={row[key]}
                                                        onChange={(e) => updateVisualCell(rowIndex, key, e.target.value)}
                                                    />
                                                </td>
                                            ))}
                                            <td className="p-2 text-center">
                                                <button onClick={() => removeRow(rowIndex)} className="text-red-500/50 hover:text-red-400 transition-colors">
                                                    <X size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    <tr>
                                        <td colSpan={seriesKeys.length + 2} className="p-2">
                                            <button onClick={addRow} className="w-full py-2 border border-dashed border-[#444] rounded text-xs text-text-sec hover:text-white hover:border-brand/50 transition-colors flex items-center justify-center gap-2">
                                                <Plus size={12} /> Adicionar Linha de Dados
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <textarea 
                            className="w-full h-full bg-[#1e1e1e] p-3 text-xs font-mono resize-none text-green-400 focus:outline-none custom-scrollbar"
                            value={jsonText}
                            onChange={e => setJsonText(e.target.value)}
                            spellCheck={false}
                            onKeyDown={(e) => e.stopPropagation()}
                        />
                    )}
                </div>

                <button 
                    onClick={handleSave} 
                    className="mt-4 w-full bg-brand text-bg py-3 rounded-xl font-bold text-sm hover:brightness-110 transition-all flex items-center justify-center gap-2"
                >
                    <Check size={18} /> Salvar Alterações
                </button>
            </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};
