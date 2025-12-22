import React from 'react';
import { X, RefreshCw, Trash2, UploadCloud, FileType, Clock, AlertTriangle } from 'lucide-react';
import { SyncQueueItem } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  queue: SyncQueueItem[];
  isSyncing: boolean;
  onForceSync: () => void;
  onRemoveItem: (id: string) => void;
  onClearQueue: () => void;
}

export const SyncStatusModal: React.FC<Props> = ({ 
  isOpen, onClose, queue, isSyncing, onForceSync, onRemoveItem, onClearQueue 
}) => {
  if (!isOpen) return null;

  const formatTime = (ts?: number) => ts ? new Date(ts).toLocaleTimeString() : '-';
  const formatSize = (bytes: number) => (bytes / 1024).toFixed(1) + ' KB';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-surface border border-border rounded-2xl p-6 max-w-lg w-full shadow-2xl relative flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-blue-500/10 p-2 rounded-lg text-blue-400">
              <UploadCloud size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-text">Fila de Sincronização</h3>
              <p className="text-xs text-text-sec">
                {queue.length === 0 ? "Tudo atualizado" : `${queue.length} alterações pendentes`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-text-sec hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Queue List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 bg-[#141414] rounded-xl p-2 border border-[#333] min-h-[150px]">
          {queue.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-text-sec opacity-50 gap-2 py-10">
              <RefreshCw size={32} />
              <span className="text-sm">Nenhuma pendência local.</span>
            </div>
          ) : (
            queue.map((item) => (
              <div key={item.id} className="bg-[#2c2c2c] p-3 rounded-lg border border-[#444] flex items-center justify-between group">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className={`p-2 rounded-lg shrink-0 ${item.action === 'create' ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'}`}>
                    <FileType size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-gray-200 truncate pr-2" title={item.name}>{item.name}</div>
                    <div className="flex items-center gap-2 text-[10px] text-gray-500">
                      <span className="uppercase font-bold tracking-wider">{item.action === 'create' ? 'Novo' : 'Edição'}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1"><Clock size={10}/> {formatTime(item.createdAt)}</span>
                      <span>•</span>
                      <span>{formatSize(item.blob.size)}</span>
                    </div>
                  </div>
                </div>
                
                <button 
                  onClick={() => onRemoveItem(item.id)}
                  className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                  title="Cancelar upload"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-6 pt-4 border-t border-[#444] flex gap-3 justify-end shrink-0">
          {queue.length > 0 && (
             <button 
               onClick={() => {
                 if(confirm("Tem certeza? Isso apagará todas as alterações não sincronizadas.")) onClearQueue();
               }}
               className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
             >
               <Trash2 size={14} /> Descartar Tudo
             </button>
          )}
          
          <button 
            onClick={onForceSync}
            disabled={isSyncing || queue.length === 0}
            className={`flex-1 bg-brand text-[#0b141a] font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 hover:brightness-110 transition-all ${isSyncing || queue.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <RefreshCw size={18} className={isSyncing ? "animate-spin" : ""} />
            {isSyncing ? "Sincronizando..." : "Sincronizar Agora"}
          </button>
        </div>

        {!navigator.onLine && queue.length > 0 && (
           <div className="mt-3 flex items-center gap-2 text-xs text-yellow-500 bg-yellow-500/10 p-2 rounded-lg">
              <AlertTriangle size={14} />
              <span>Você está offline. A sincronização ocorrerá quando a conexão retornar.</span>
           </div>
        )}
      </div>
    </div>
  );
};