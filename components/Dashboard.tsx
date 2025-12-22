
import React, { useEffect, useState } from 'react';
import { DriveFile } from '../types';
import { getRecentFiles, getStorageEstimate, clearAppStorage, StorageBreakdown, runJanitor } from '../services/storageService';
import { useSync } from '../hooks/useSync';
import { SyncStatusModal } from './SyncStatusModal';
import { FileText, Upload, Menu, Workflow, WifiOff, Loader2, FilePlus, Database, X, Zap, RefreshCw, Pin, Info, LogIn, Cloud, FolderSymlink, CheckCircle, AlertCircle, AlertTriangle, FileUp, FolderTree, ArrowRight, ShieldCheck } from 'lucide-react';
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
  const [showBrowserWarning, setShowBrowserWarning] = useState(false);
  const [storageData, setStorageData] = useState<StorageBreakdown | null>(null);
  
  const hasNativeFS = 'showDirectoryPicker' in window;
  const isEmbedded = window.self !== window.top;

  const { syncStatus, queue, triggerSync, removeItem, clearQueue } = useSync({ 
      accessToken: localStorage.getItem('drive_access_token'), 
      onAuthError: () => {},
      autoSync: false 
  });

  useEffect(() => {
    getRecentFiles().then(setRecents);
    
    const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
    if (isFirefox) {
        setShowBrowserWarning(true);
    }

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
    <div className="flex-1 h-full overflow-y-auto bg-bg text-text p-6 md:p-12 relative custom-scrollbar">
      <div className="mb-8 flex flex-wrap justify-between items-center gap-4">
        <button onClick={onToggleMenu} className="p-3 -ml-3 text-text-sec hover:text-text rounded-full hover:bg-surface transition">
          <Menu size={32} />
        </button>
        
        <div className="flex items-center gap-2 md:gap-4 flex-wrap">
            {/* Sync Strategy Toggle */}
            {onToggleSyncStrategy && (
                <div className="flex bg-surface p-1 rounded-full border border-border shadow-sm">
                    <button 
                        onClick={() => onToggleSyncStrategy('smart')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${syncStrategy === 'smart' ? 'bg-brand text-[#0b141a] shadow' : 'text-text-sec hover:text-text'}`}
                        title="Smart Sync: Salva arquivos offline automaticamente para acesso rápido."
                    >
                        <Zap size={14} /> <span className="hidden sm:inline">Smart Sync</span>
                    </button>
                    <button 
                        onClick={() => onToggleSyncStrategy('online')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${syncStrategy === 'online' ? 'bg-blue-500 text-white shadow' : 'text-text-sec hover:text-text'}`}
                        title="Modo Online: Arquivos não são salvos no dispositivo após fechar a aba."
                    >
                        <Cloud size={14} /> <span className="hidden sm:inline">Online Puro</span>
                    </button>
                </div>
            )}

            <button 
                onClick={() => setShowSyncModal(true)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                    queue.length > 0 
                        ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500 animate-pulse' 
                        : 'bg-surface border-border text-text-sec hover:text-text'
                }`}
            >
                {queue.length > 0 ? (
                    <><AlertCircle size={14} /> {queue.length} Pendentes</>
                ) : (
                    <><CheckCircle size={14} /> Sincronizado</>
                )}
            </button>

            <button onClick={openStorageModal} className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border rounded-full text-text-sec hover:text-text transition-colors text-xs">
                <Database size={14} /> Armazenamento
            </button>
        </div>
      </div>

      {showBrowserWarning && (
        <div className="mb-8 p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
            <AlertTriangle className="text-orange-500 shrink-0 mt-0.5" size={18} />
            <div className="flex-1">
                <h4 className="text-sm font-bold text-orange-400 mb-1">Recomendação de Navegador</h4>
                <p className="text-xs text-orange-200/80 leading-relaxed">
                    Sugerimos o uso de navegadores baseados em <strong>Chromium</strong> para a experiência completa.
                </p>
            </div>
            <button onClick={() => setShowBrowserWarning(false)} className="text-orange-500/50 hover:text-orange-500"><X size={16} /></button>
        </div>
      )}

      <header className="mb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h1 className="text-4xl md:text-6xl font-normal text-text mb-4 tracking-tight">
          {new Date().getHours() < 12 ? 'Bom dia' : new Date().getHours() < 18 ? 'Boa tarde' : 'Boa noite'}, <br/>
          <span className="text-brand font-medium">{userName?.split(' ')[0] || 'Visitante'}</span>
        </h1>
        
        <div className="flex flex-col md:flex-row md:items-center gap-4">
            <p className="text-lg md:text-2xl text-text-sec">
                {syncStrategy === 'smart' 
                    ? "Seus arquivos estão sempre prontos, online ou offline." 
                    : "Modo Online Ativo: Dados não persistem no dispositivo."}
            </p>
            {isVisitor && onLogin && (
                <button onClick={onLogin} className="flex items-center gap-2 bg-surface hover:bg-white/5 border border-border px-4 py-2 rounded-full transition-all group md:ml-4 self-start">
                    <div className="bg-brand text-[#0b141a] rounded-full p-1 group-hover:scale-110 transition-transform"><Cloud size={14} /></div>
                    <span className="text-sm font-bold text-text">Sincronizar com Google Drive</span>
                </button>
            )}
        </div>
      </header>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
        <button onClick={() => onChangeView('browser')} className="p-8 rounded-[2rem] bg-surface hover:brightness-110 transition-all group text-left border border-border flex flex-col items-start gap-6 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-brand/10 text-brand flex items-center justify-center group-hover:scale-110 transition-transform">
            {isOnline ? <FileText size={32} /> : <WifiOff size={32} />}
          </div>
          <div>
             <h3 className="text-2xl font-medium mb-2 text-text">Meus Arquivos</h3>
             <p className="text-base text-text-sec">Nuvem e Offline</p>
          </div>
        </button>

        {/* Action Dinâmica de Pasta Local */}
        {(!hasNativeFS || isEmbedded) ? (
            <label className="p-8 rounded-[2rem] bg-surface hover:brightness-110 transition-all group text-left border border-border cursor-pointer flex flex-col items-start gap-6 shadow-sm">
                <div className="w-16 h-16 rounded-2xl bg-orange-500/10 text-orange-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <FileUp size={32} />
                </div>
                <div>
                    <h3 className="text-2xl font-medium mb-2 text-text">Abrir Local</h3>
                    <p className="text-base text-text-sec">Upload rápido do PC</p>
                </div>
                <input type="file" className="hidden" onChange={onUploadLocal} />
            </label>
        ) : (
            <button 
                onClick={savedLocalDirHandle ? onReconnectLocalFolder : onOpenLocalFolder} 
                className="p-8 rounded-[2rem] bg-surface hover:brightness-110 transition-all group text-left border border-border flex flex-col items-start gap-6 shadow-sm relative overflow-hidden"
            >
                <div className="w-16 h-16 rounded-2xl bg-orange-500/10 text-orange-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <FolderTree size={32} />
                </div>
                <div>
                    <h3 className="text-2xl font-medium mb-2 text-text">
                        {savedLocalDirHandle ? 'Reconectar' : 'Pasta Local'}
                    </h3>
                    <p className="text-base text-text-sec truncate max-w-full">
                        {savedLocalDirHandle ? savedLocalDirHandle.name : 'Persistência nativa'}
                    </p>
                </div>
                {savedLocalDirHandle && (
                    <div className="absolute top-4 right-4 bg-orange-500/20 text-orange-400 p-2 rounded-full animate-pulse">
                        <ArrowRight size={16} />
                    </div>
                )}
            </button>
        )}

        <button onClick={onCreateDocument} className="p-8 rounded-[2rem] bg-surface hover:brightness-110 transition-all group text-left border border-border flex flex-col items-start gap-6 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
            <FilePlus size={32} />
          </div>
          <div>
             <h3 className="text-2xl font-medium mb-2 text-text">Novo Doc</h3>
             <p className="text-base text-text-sec">Editor acadêmico</p>
          </div>
        </button>

        <button onClick={() => setShowHelpModal(true)} className="p-8 rounded-[2rem] bg-surface hover:brightness-110 transition-all group text-left border border-border flex flex-col items-start gap-6 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Info size={32} />
          </div>
          <div>
             <h3 className="text-2xl font-medium mb-2 text-text">Ajuda</h3>
             <p className="text-base text-text-sec">Tutoriais e suporte</p>
          </div>
        </button>
      </div>

      {/* Recents */}
      <div className="mb-20">
        <h2 className="text-2xl font-normal text-text mb-8">Trabalhos Recentes</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {recents.slice(0, 8).map((file) => (
                <div key={file.id} onClick={() => onOpenFile(file)} className="group bg-surface rounded-[1.5rem] p-5 hover:brightness-110 transition-all cursor-pointer border border-border flex flex-col gap-4 shadow-sm">
                  <div className="w-full aspect-video bg-bg rounded-xl overflow-hidden relative flex items-center justify-center text-text-sec">
                    {file.name.endsWith('.mindmap') ? <Workflow size={48} className="text-purple-400/50"/> : file.mimeType.includes('document') ? <FilePlus size={48} className="text-blue-400/50"/> : <FileText size={48} className="opacity-20" />}
                    {file.pinned && <div className="absolute top-2 right-2 text-brand"><Pin size={14} fill="currentColor" /></div>}
                  </div>
                  <h3 className="font-medium text-text truncate text-sm" title={file.name}>{file.name}</h3>
                </div>
            ))}
        </div>
      </div>

      <GlobalHelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />
      <SyncStatusModal isOpen={showSyncModal} onClose={() => setShowSyncModal(false)} queue={queue} isSyncing={syncStatus.active} onForceSync={triggerSync} onRemoveItem={removeItem} onClearQueue={clearQueue} />

      {showStorageModal && (
          <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-surface border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
                  <button onClick={() => setShowStorageModal(false)} className="absolute top-4 right-4 text-text-sec hover:text-text"><X size={20}/></button>
                  <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Database size={20} className="text-brand" /> Armazenamento</h3>
                  <div className="bg-bg p-4 rounded-xl border border-border mb-6">
                      <div className="flex justify-between items-end mb-2">
                          <span className="text-sm text-text-sec">Uso Total: {storageData ? formatBytes(storageData.usage) : '...'}</span>
                          <button onClick={handleManualJanitor} className="text-[10px] text-brand flex items-center gap-1 hover:underline"><RefreshCw size={10} /> Forçar Limpeza</button>
                      </div>
                      <div className="w-full bg-surface h-2 rounded-full overflow-hidden mb-4">
                          <div className="h-full bg-brand" style={{ width: storageData ? `${Math.min(100, (storageData.usage / (storageData.quota || 1)) * 100)}%` : '0%' }} />
                      </div>
                  </div>
                  <button onClick={clearAppStorage} className="w-full py-2 bg-red-500/10 text-red-500 border border-red-500/30 rounded-lg text-xs font-bold">Redefinir App (Apagar tudo)</button>
              </div>
          </div>
      )}
    </div>
  );
};
