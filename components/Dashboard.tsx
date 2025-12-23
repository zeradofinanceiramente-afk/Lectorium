
import React, { useEffect, useState } from 'react';
import { DriveFile } from '../types';
import { getRecentFiles, getStorageEstimate, clearAppStorage, StorageBreakdown, runJanitor, getWallpaper } from '../services/storageService';
import { useSync } from '../hooks/useSync';
import { SyncStatusModal } from './SyncStatusModal';
import { FileText, Menu, Workflow, WifiOff, FilePlus, Database, X, Zap, RefreshCw, Pin, Info, Cloud, AlertCircle, CheckCircle, FileUp, FolderTree, ArrowRight, Clock, LayoutGrid } from 'lucide-react';
import { GlobalHelpModal } from './GlobalHelpModal';

interface DashboardProps {
  userName?: string | null;
  onOpenFile: (file: DriveFile) => void;
  onUploadLocal: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCreateMindMap: () => void;
  onCreateDocument: () => void;
  onCreateFileFromBlob: (blob: Blob, name: string, mimeType: string) => void;
  onChangeView: (view: 'browser' | 'offline') => void;
  onToggleMenu: () => void;
  storageMode?: string;
  onToggleStorageMode?: (mode: string) => void;
  onLogin?: () => void;
  onOpenLocalFolder?: () => void;
  savedLocalDirHandle?: any;
  onReconnectLocalFolder?: () => void;
  syncStrategy?: 'smart' | 'online';
  onToggleSyncStrategy?: (strategy: 'smart' | 'online') => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
    userName, onOpenFile, onUploadLocal, onCreateMindMap, onCreateDocument, 
    onCreateFileFromBlob, onChangeView, onToggleMenu, storageMode, onToggleStorageMode,
    onLogin, onOpenLocalFolder, savedLocalDirHandle, onReconnectLocalFolder,
    syncStrategy = 'smart', onToggleSyncStrategy
}) => {
  const [recents, setRecents] = useState<(DriveFile & { lastOpened: Date })[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showStorageModal, setShowStorageModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false); 
  const [storageData, setStorageData] = useState<StorageBreakdown | null>(null);
  
  const [wallpapers, setWallpapers] = useState<{ landscape: string | null, portrait: string | null }>({ landscape: null, portrait: null });

  const hasNativeFS = 'showDirectoryPicker' in window;
  const isEmbedded = window.self !== window.top;

  const { syncStatus, queue, triggerSync, removeItem, clearQueue } = useSync({ 
      accessToken: localStorage.getItem('drive_access_token'), 
      onAuthError: () => {},
      autoSync: false 
  });

  const loadWallpapers = async () => {
    const lBlob = await getWallpaper('landscape');
    const pBlob = await getWallpaper('portrait');
    
    setWallpapers(prev => {
        if (prev.landscape) URL.revokeObjectURL(prev.landscape);
        if (prev.portrait) URL.revokeObjectURL(prev.portrait);
        return {
            landscape: lBlob ? URL.createObjectURL(lBlob) : null,
            portrait: pBlob ? URL.createObjectURL(pBlob) : null
        };
    });
  };

  useEffect(() => {
    loadWallpapers();
    const handleUpdate = () => loadWallpapers();
    window.addEventListener('wallpaper-changed', handleUpdate);
    return () => {
        window.removeEventListener('wallpaper-changed', handleUpdate);
        if (wallpapers.landscape) URL.revokeObjectURL(wallpapers.landscape);
        if (wallpapers.portrait) URL.revokeObjectURL(wallpapers.portrait);
    };
  }, []);

  useEffect(() => {
    getRecentFiles().then(setRecents);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const openStorageModal = async () => {
    setShowStorageModal(true);
    const estimate = await getStorageEstimate();
    if (estimate) setStorageData(estimate);
  };

  const handleManualJanitor = async () => {
      await runJanitor();
      const estimate = await getStorageEstimate();
      setStorageData(estimate);
  };

  const formatBytes = (bytes: number) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const isVisitor = !userName || userName === 'Visitante';

  return (
    <div className="flex-1 h-full overflow-hidden bg-bg text-text relative font-sans">
      {/* Background Layer with adaptive overlay */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden bg-[#050505]">
          {wallpapers.landscape && (
              <img src={wallpapers.landscape} className="hidden md:block absolute inset-0 w-full h-full object-cover opacity-50 scale-105 blur-[0.4px] transition-opacity duration-1000" alt="" />
          )}
          {wallpapers.portrait && (
              <img src={wallpapers.portrait} className="md:hidden absolute inset-0 w-full h-full object-cover opacity-50 scale-105 blur-[0.4px] transition-opacity duration-1000" alt="" />
          )}
          {/* Gradient for legibility - Darker at bottom for floating dock feel */}
          <div className="absolute inset-0 bg-gradient-to-br from-bg/20 via-bg/40 to-bg/90 z-10" />
      </div>

      <div className="relative z-10 h-full overflow-y-auto p-6 md:p-12 custom-scrollbar">
          {/* Top Navigation Control Bar */}
          <div className="mb-10 flex flex-wrap justify-between items-center gap-4">
            <button onClick={onToggleMenu} className="p-3 -ml-3 text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all shadow-xl backdrop-blur-[2px]">
              <Menu size={28} />
            </button>
            
            <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                {onToggleSyncStrategy && (
                    <div className="flex bg-black/40 backdrop-blur-[5px] p-1.5 rounded-2xl border border-white/10 shadow-2xl">
                        <button 
                            onClick={() => onToggleSyncStrategy('smart')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${syncStrategy === 'smart' ? 'bg-brand text-[#0b141a] shadow-[0_0_15px_rgba(74,222,128,0.4)]' : 'text-white/50 hover:text-white'}`}
                        >
                            <Zap size={14} /> <span className="hidden sm:inline">Smart Sync</span>
                        </button>
                        <button 
                            onClick={() => onToggleSyncStrategy('online')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${syncStrategy === 'online' ? 'bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.4)]' : 'text-white/50 hover:text-white'}`}
                        >
                            <Cloud size={14} /> <span className="hidden sm:inline">Online Puro</span>
                        </button>
                    </div>
                )}

                <button 
                    onClick={() => setShowSyncModal(true)}
                    className={`flex items-center gap-2 px-4 py-2.5 bg-black/40 backdrop-blur-[5px] border rounded-2xl text-xs font-bold transition-all shadow-2xl ${
                        queue.length > 0 ? 'border-yellow-500/50 text-yellow-500 animate-pulse' : 'border-white/10 text-white/70 hover:text-white'
                    }`}
                >
                    {queue.length > 0 ? <><AlertCircle size={14} /> {queue.length} Pendentes</> : <><CheckCircle size={14} className="text-brand"/> Sincronizado</>}
                </button>

                <button onClick={openStorageModal} className="flex items-center gap-2 px-4 py-2.5 bg-black/40 backdrop-blur-[5px] border border-white/10 rounded-2xl text-white/70 hover:text-white transition-all text-xs font-bold shadow-2xl">
                    <Database size={14} /> Armazenamento
                </button>
            </div>
          </div>

          {/* Dynamic Welcome Section */}
          <header className="mb-14 animate-in fade-in slide-in-from-left-6 duration-700">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand/10 border border-brand/20 rounded-full text-brand text-[10px] font-bold uppercase tracking-widest mb-4 backdrop-blur-sm">
                <LayoutGrid size={12} /> Academia de Conhecimento
            </div>
            <h1 className="text-5xl md:text-6xl font-light text-white mb-4 tracking-tight leading-tight">
              {new Date().getHours() < 12 ? 'Bom dia' : new Date().getHours() < 18 ? 'Boa tarde' : 'Boa noite'}, <br/>
              <span className="text-brand font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand to-emerald-400">
                  {userName?.split(' ')[0] || 'Visitante'}
              </span>
            </h1>
            <div className="flex flex-col md:flex-row md:items-center gap-6">
                <p className="text-lg md:text-xl text-white/60 drop-shadow-md max-w-xl font-light">
                    {syncStrategy === 'smart' ? "Seus documentos estão seguros e prontos para consulta, com ou sem conexão." : "Conectado ao Drive em tempo real. Os data não serão salvos neste dispositivo."}
                </p>
                {isVisitor && onLogin && (
                    <button onClick={onLogin} className="flex items-center gap-3 bg-white text-black hover:bg-brand hover:text-[#0b141a] px-6 py-3 rounded-2xl transition-all group self-start shadow-2xl font-bold">
                        <Cloud size={18} className="group-hover:scale-110 transition-transform" />
                        <span>Conectar ao Drive</span>
                    </button>
                )}
            </div>
          </header>

          {/* Desktop Grid Layout */}
          <div className="flex flex-col lg:flex-row gap-12 lg:justify-between items-start mb-20">
            
            {/* Quick Actions - "Control Pads" */}
            <div className="w-full lg:max-w-2xl">
              <h2 className="text-xs font-bold text-white/40 uppercase tracking-[0.2em] mb-6 px-1 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-brand"></div> Ações de Workflow
              </h2>
              <div className="grid grid-cols-2 gap-5">
                <button onClick={() => onChangeView('browser')} className="p-6 rounded-[2rem] bg-black/40 backdrop-blur-[8px] hover:bg-black/60 transition-all group text-left border border-brand/30 hover:border-brand/60 flex flex-col items-start gap-6 shadow-2xl hover:scale-[1.02] active:scale-[0.98]">
                  <div className="w-14 h-14 rounded-2xl bg-brand/10 text-brand flex items-center justify-center group-hover:scale-110 transition-transform border border-brand/20 shadow-inner">
                    {isOnline ? <FileText size={28} /> : <WifiOff size={28} />}
                  </div>
                  <div>
                    <h3 className="text-base font-bold mb-1 text-white">Meus Arquivos</h3>
                    <p className="text-xs text-white/40 leading-relaxed">Navegar pelo acervo unificado da nuvem e local.</p>
                  </div>
                </button>

                {(!hasNativeFS || isEmbedded) ? (
                    <label className="p-6 rounded-[2rem] bg-black/40 backdrop-blur-[8px] hover:bg-black/60 transition-all group text-left border border-brand/30 hover:border-brand/60 cursor-pointer flex flex-col items-start gap-6 shadow-2xl hover:scale-[1.02] active:scale-[0.98]">
                        <div className="w-14 h-14 rounded-2xl bg-orange-500/10 text-orange-400 flex items-center justify-center group-hover:scale-110 transition-transform border border-orange-500/20">
                            <FileUp size={28} />
                        </div>
                        <div><h3 className="text-base font-bold mb-1 text-white">Abrir Local</h3><p className="text-xs text-white/40 leading-relaxed">Carregar arquivo único para edição rápida.</p></div>
                        <input type="file" className="hidden" onChange={onUploadLocal} />
                    </label>
                ) : (
                    <button onClick={savedLocalDirHandle ? onReconnectLocalFolder : onOpenLocalFolder} className="p-6 rounded-[2rem] bg-black/40 backdrop-blur-[8px] hover:bg-black/60 transition-all group text-left border border-brand/30 hover:border-brand/60 flex flex-col items-start gap-6 shadow-2xl relative overflow-hidden hover:scale-[1.02] active:scale-[0.98]">
                        <div className="w-14 h-14 rounded-2xl bg-orange-500/10 text-orange-400 flex items-center justify-center group-hover:scale-110 transition-transform border border-orange-500/20"><FolderTree size={28} /></div>
                        <div><h3 className="text-base font-bold mb-1 text-white">{savedLocalDirHandle ? 'Reconectar' : 'Pasta Local'}</h3><p className="text-xs text-white/40 leading-relaxed truncate max-w-full">{savedLocalDirHandle ? savedLocalDirHandle.name : 'Vincular pasta do sistema.'}</p></div>
                        {savedLocalDirHandle && <div className="absolute top-6 right-6 bg-orange-500/20 text-orange-400 p-2 rounded-full animate-pulse"><ArrowRight size={16} /></div>}
                    </button>
                )}

                <button onClick={onCreateDocument} className="p-6 rounded-[2rem] bg-black/40 backdrop-blur-[8px] hover:bg-black/60 transition-all group text-left border border-brand/30 hover:border-brand/60 flex flex-col items-start gap-6 shadow-2xl hover:scale-[1.02] active:scale-[0.98]">
                  <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform border border-blue-500/20"><FilePlus size={28} /></div>
                  <div><h3 className="text-base font-bold mb-1 text-white">Novo Documento</h3><p className="text-xs text-white/40 leading-relaxed">Criar texto acadêmico seguindo normas ABNT.</p></div>
                </button>

                <button onClick={() => setShowHelpModal(true)} className="p-6 rounded-[2rem] bg-black/40 backdrop-blur-[8px] hover:bg-black/60 transition-all group text-left border border-brand/30 hover:border-brand/60 flex flex-col items-start gap-6 shadow-2xl hover:scale-[1.02] active:scale-[0.98]">
                  <div className="w-14 h-14 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform border border-purple-500/20"><Info size={28} /></div>
                  <div><h3 className="text-base font-bold mb-1 text-white">Suporte</h3><p className="text-xs text-white/40 leading-relaxed">Aprender atalhos e dicas de pesquisa com IA.</p></div>
                </button>
              </div>
            </div>

            {/* Side Column: Recent Files with minimal OS list style */}
            <div className="w-full lg:w-[380px] shrink-0 lg:mt-0">
              <div className="flex items-center justify-between mb-8 px-1">
                <h2 className="text-xs font-bold text-white/40 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Clock size={14}/> Recentemente
                </h2>
                <button onClick={() => onChangeView('browser')} className="text-[11px] font-bold text-brand hover:brightness-125 flex items-center gap-1 transition-all">VER TODOS <ArrowRight size={12}/></button>
              </div>
              <div className="space-y-4">
                {recents.slice(0, 5).map((file) => (
                    <div 
                      key={file.id} 
                      onClick={() => onOpenFile(file)} 
                      className="group bg-black/30 backdrop-blur-[4px] rounded-3xl p-4 hover:bg-white/5 transition-all cursor-pointer border border-white/5 hover:border-white/20 flex items-center gap-5 shadow-lg"
                    >
                      <div className="w-14 h-14 bg-white/5 rounded-2xl shrink-0 flex items-center justify-center text-white/30 relative border border-white/5 shadow-inner">
                        {file.name.endsWith('.mindmap') ? <Workflow size={24} className="text-purple-400/50"/> : file.mimeType.includes('document') ? <FilePlus size={24} className="text-blue-400/50"/> : <FileText size={24} />}
                        {file.pinned && <div className="absolute -top-1.5 -right-1.5 text-brand bg-[#0b141a] rounded-full p-1 border border-brand/50 shadow-lg shadow-brand/20"><Pin size={10} fill="currentColor" /></div>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-white/90 truncate text-sm mb-1 group-hover:text-white transition-colors" title={file.name}>{file.name}</h3>
                        <p className="text-[10px] text-white/40 font-medium flex items-center gap-1.5">
                           Acessado em {new Date(file.lastOpened).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                ))}
                {recents.length === 0 && (
                  <div className="text-center py-16 bg-white/5 rounded-[2rem] border border-dashed border-white/10 backdrop-blur-[2px]">
                    <Clock size={32} className="mx-auto mb-3 text-white/10" />
                    <p className="text-sm text-white/20">Sua jornada acadêmica começa aqui.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
      </div>

      {/* Overlays & Modals */}
      <GlobalHelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />
      <SyncStatusModal isOpen={showSyncModal} onClose={() => setShowSyncModal(false)} queue={queue} isSyncing={syncStatus.active} onForceSync={triggerSync} onRemoveItem={removeItem} onClearQueue={clearQueue} />

      {showStorageModal && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-[5px] flex items-center justify-center p-4 animate-in fade-in duration-300">
              <div className="bg-[#1e1e1e] border border-white/10 rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl relative">
                  <button onClick={() => setShowStorageModal(false)} className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors"><X size={24}/></button>
                  <div className="flex items-center gap-4 mb-8">
                      <div className="bg-brand/10 p-3 rounded-2xl text-brand"><Database size={28} /></div>
                      <h3 className="text-2xl font-bold text-white">Armazenamento</h3>
                  </div>
                  <div className="bg-black/40 p-6 rounded-3xl border border-white/5 mb-8">
                      <div className="flex justify-between items-end mb-4">
                          <span className="text-sm text-white/60">Uso Total: <span className="text-white font-bold">{storageData ? formatBytes(storageData.usage) : '...'}</span></span>
                          <button onClick={handleManualJanitor} className="text-[10px] text-brand font-bold bg-brand/10 px-3 py-1 rounded-full hover:bg-brand hover:text-black transition-all">LIMPAR CACHE</button>
                      </div>
                      <div className="w-full bg-white/5 h-3 rounded-full overflow-hidden mb-2 shadow-inner">
                          <div className="h-full bg-gradient-to-r from-brand to-emerald-400 transition-all duration-1000" style={{ width: storageData ? `${Math.min(100, (storageData.usage / (storageData.quota || 1)) * 100)}%` : '0%' }} />
                      </div>
                  </div>
                  <button onClick={clearAppStorage} className="w-full py-4 bg-red-500/10 text-red-500 border border-red-500/20 rounded-2xl text-xs font-bold hover:bg-red-500 hover:text-white transition-all">REDEFINIR APLICAÇÃO (APAGAR TUDO)</button>
              </div>
          </div>
      )}
    </div>
  );
};
