
import React from 'react';
import { X, Clock, RotateCcw } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const VersionHistoryModal: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  // Mock history
  const history = [
    { id: 1, date: 'Hoje, 10:30', author: 'Você', current: true },
    { id: 2, date: 'Ontem, 18:45', author: 'Você', current: false },
    { id: 3, date: '12 de Mar, 09:00', author: 'Você', current: false },
  ];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
       <div className="bg-[#1e1e1e] text-[#e3e3e3] rounded-2xl shadow-2xl p-6 w-full max-w-md relative animate-in zoom-in-95 border border-[#444746]">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-normal flex items-center gap-2">
                <Clock size={20} className="text-brand"/> Histórico de Versões
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors"><X size={20}/></button>
          </div>

          <div className="space-y-2">
             {history.map(item => (
                 <div key={item.id} className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${item.current ? 'bg-brand/10 border-brand text-brand' : 'bg-[#2c2c2c] border-transparent hover:border-gray-500'}`}>
                     <div>
                         <div className="font-bold text-sm">{item.date}</div>
                         <div className="text-xs opacity-70">{item.author}</div>
                     </div>
                     {!item.current && (
                         <button className="text-xs bg-[#333] hover:bg-[#444] text-white px-3 py-1.5 rounded-full flex items-center gap-1 transition-colors">
                             <RotateCcw size={12} /> Restaurar
                         </button>
                     )}
                     {item.current && <span className="text-xs bg-brand text-black px-2 py-0.5 rounded font-bold">Atual</span>}
                 </div>
             ))}
          </div>
          
          <div className="mt-4 text-center text-xs text-gray-500">
              Versões são salvas automaticamente a cada alteração significativa.
          </div>
       </div>
    </div>
  );
};
