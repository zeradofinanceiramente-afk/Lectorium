
import React, { useState, useEffect, useMemo } from 'react';
import { Home, FolderOpen, LogOut, User as UserIcon, X, Palette, ChevronDown, ChevronRight, FileText, Workflow, DownloadCloud, CheckCircle, Loader2, LayoutGrid, Cloud, CloudOff, LogIn, Wrench, Key, Scale } from 'lucide-react';
import { User } from 'firebase/auth';
import { ThemeSwitcher } from './ThemeSwitcher';
import { DriveFile } from '../types';
import { cacheAppResources, getOfflineCacheSize, ResourceCategory } from '../services/offlineService';
import { OfflineDownloadModal } from './OfflineDownloadModal';
import { VersionDebugModal } from './VersionDebugModal';
import { ApiKeyModal } from './ApiKeyModal';
import { getStoredApiKey } from '../utils/apiKeyUtils';

interface SidebarProps {
  activeTab: string;
  onSwitchTab: (tabId: string) => void;
  openFiles: DriveFile[];
  onCloseFile: (fileId: string) => void;
  user: User | null;
  onLogout: () => void;
  onLogin?: () => void;
  isOpen: boolean;
  onClose: () => void;
  onToggle?: () => void;
  docked?: boolean;
  driveActive?: boolean;
  onOpenLegal?: () => void; // New Prop
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  onSwitchTab, 
  openFiles, 
  onCloseFile, 
  user, 
  onLogout, 
  onLogin,
  isOpen, 
  onClose,
  driveActive = false,
  onOpenLegal
}) => {
  const [isThemesOpen, setIsThemesOpen] = useState(false);
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  
  const [cachingStatus, setCachingStatus] = useState<'idle' | 'caching' | 'done'>('idle');
  const [cacheProgress, setCacheProgress] = useState(0);
  const [downloadSize, setDownloadSize] = useState<string | null>(null);
  const [hasUserKey, setHasUserKey] = useState(false);

  // Check debug mode
  const isDebugMode = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('eruda') === 'true' || params.get('debug') === 'true';
  }, []);

  useEffect(() => {
    let active = true;
    getOfflineCacheSize().then(size => {
        if (active && size) {
            setDownloadSize(size);
            setCachingStatus('done');
        }
    });
    
    const checkKey = () => setHasUserKey(!!getStoredApiKey());
    checkKey();
    window.addEventListener('apikey-changed', checkKey);

    return () => { 
        active = false; 
        window.removeEventListener('apikey-changed', checkKey);
    };
  }, []);

  const handleStartDownload = async (selectedCategories: ResourceCategory[]) => {
    setCachingStatus('caching');
    setCacheProgress(0);
    
    try {
        const size = await cacheAppResources(selectedCategories, (progress) => setCacheProgress(progress));
        setDownloadSize(size);
        setCachingStatus('done');
    } catch (e) {
        console.error("Cache failed", e);
        setCachingStatus('idle'); 
        alert("Erro ao baixar recursos. Verifique sua conexão.");
    }
  };

  const handleMyFilesClick = () => {
    if (navigator.onLine && driveActive) {
      onSwitchTab('browser');
    } else {
      onSwitchTab('offline');
    }
    onClose();
  };

  const handleNavigation = (tab: string) => {
    onSwitchTab(tab);
    onClose();
  };

  return (
    <>
      {/* Backdrop (Always active when open in Overlay mode) */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-200 print:hidden"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div className={`
        fixed inset-y-0 left-0 z-50 bg-sidebar border-r border-border transition-transform duration-300 ease-in-out shadow-2xl flex flex-col w-72
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} 
        print:hidden
      `}>
        {/* Header */}
        <div className="h-20 flex items-center justify-between px-6 border-b border-border shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center shadow-lg shadow-brand/20 shrink-0">
              <LayoutGrid className="text-bg font-bold" size={22} />
            </div>
            
            <div className="flex flex-col min-w-0">
               <span className="font-bold text-lg text-text tracking-tight leading-none whitespace-nowrap">Lectorium</span>
               <span className="text-[9px] text-text-sec uppercase tracking-widest mt-0.5 whitespace-nowrap">Workspace</span>
            </div>
          </div>
          
          <button onClick={onClose} className="p-2 text-text-sec hover:text-text rounded-full hover:bg-white/5 transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-6 space-y-2 overflow-y-auto custom-scrollbar overflow-x-hidden">
          
          <div className="space-y-1 px-3">
            <button
              onClick={() => handleNavigation('dashboard')}
              className={`w-full group p-3 rounded-xl transition-all duration-200 flex items-center px-4 ${
                activeTab === 'dashboard' 
                  ? 'bg-brand/10 text-brand font-medium' 
                  : 'text-text-sec hover:bg-white/5 hover:text-text'
              }`}
            >
              <Home size={24} className={`shrink-0 ${activeTab === 'dashboard' ? "fill-brand/20" : ""}`} />
              <span className="ml-4 text-base">Início</span>
            </button>

            <button
              onClick={handleMyFilesClick}
              className={`w-full group p-3 rounded-xl transition-all duration-200 flex items-center px-4 ${
                activeTab === 'browser' || activeTab === 'offline' 
                  ? 'bg-brand/10 text-brand font-medium' 
                  : 'text-text-sec hover:bg-white/5 hover:text-text'
              }`}
            >
              <FolderOpen size={24} className={`shrink-0 ${activeTab === 'browser' ? "fill-brand/20" : ""}`} />
              <span className="ml-4 text-base">Arquivos</span>
            </button>

            <button
              onClick={() => handleNavigation('mindmaps')}
              className={`w-full group p-3 rounded-xl transition-all duration-200 flex items-center px-4 ${
                activeTab === 'mindmaps' 
                  ? 'bg-brand/10 text-brand font-medium' 
                  : 'text-text-sec hover:bg-white/5 hover:text-text'
              }`}
            >
              <Workflow size={24} className={`shrink-0 ${activeTab === 'mindmaps' ? "text-brand" : ""}`} />
              <span className="ml-4 text-base">Mapas Mentais</span>
            </button>
          </div>

          <div className="space-y-1 px-3 pt-4 border-t border-border mt-4">
             {/* System Header */}
             <div className="px-2 mb-2 text-xs font-bold text-text-sec uppercase tracking-wider flex items-center justify-between">
                <span>Sistema</span>
                {user && (
                    <div className="flex items-center gap-1.5">
                        {driveActive ? <Cloud size={12} className="text-green-500" /> : <CloudOff size={12} className="text-red-400" />}
                    </div>
                )}
             </div>

             <button
              onClick={() => setShowOfflineModal(true)}
              disabled={cachingStatus === 'caching'}
              className={`w-full group p-3 rounded-xl transition-all duration-200 flex items-center px-4 ${
                  cachingStatus === 'done' 
                    ? 'text-green-500 hover:bg-green-500/10' 
                    : 'text-text-sec hover:bg-white/5 hover:text-text'
              }`}
            >
              {cachingStatus === 'caching' ? (
                  <Loader2 size={24} className="animate-spin text-brand shrink-0" />
              ) : cachingStatus === 'done' ? (
                  <CheckCircle size={24} className="text-green-500 shrink-0" />
              ) : (
                  <DownloadCloud size={24} className="shrink-0" />
              )}
              
              <div className="flex flex-col items-start min-w-0 ml-4">
                  <span className={`text-sm font-medium truncate ${cachingStatus === 'done' ? 'text-green-500' : ''}`}>
                      {cachingStatus === 'caching' 
                        ? `Baixando...` 
                        : 'Offline Mode'}
                  </span>
              </div>
            </button>

            <button
              onClick={() => setShowKeyModal(true)}
              className={`w-full group p-3 rounded-xl transition-all duration-200 flex items-center px-4 ${
                  hasUserKey 
                    ? 'text-green-400 hover:bg-green-500/10' 
                    : 'text-text-sec hover:bg-white/5 hover:text-text'
              }`}
            >
                <Key size={24} className={`shrink-0 ${hasUserKey ? "fill-green-500/20" : ""}`} />
                <div className="flex flex-col items-start min-w-0 ml-4">
                    <span className="text-sm font-medium truncate">Configurar IA</span>
                    <span className="text-[10px] opacity-60">{hasUserKey ? "Chave Ativa" : "Usar Chave Própria"}</span>
                </div>
            </button>
          </div>

          {/* Open Files List */}
          {openFiles.length > 0 && (
            <div className="animate-in fade-in slide-in-from-left-2 border-t border-border pt-4 px-3">
              <div className="px-2 mb-2 text-xs font-bold text-text-sec uppercase tracking-wider">
                Abertos
              </div>
              <div className="space-y-1">
                {openFiles.map(file => {
                  const isMindMap = file.name.endsWith('.mindmap');
                  const isDoc = file.name.endsWith('.docx') || file.mimeType.includes('document');
                  
                  return (
                    <div 
                      key={file.id}
                      className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${
                        activeTab === file.id 
                          ? 'bg-surface text-text font-medium border border-border shadow-sm' 
                          : 'text-text-sec hover:bg-white/5 hover:text-text border border-transparent'
                      }`}
                      onClick={() => handleNavigation(file.id)}
                    >
                      {isMindMap ? <Workflow size={16} className="shrink-0 text-purple-400" /> :
                       isDoc ? <FileText size={16} className="shrink-0 text-blue-400" /> :
                       <FileText size={16} className="shrink-0 text-brand" />}
                      
                      <span className="truncate text-sm flex-1 pr-6">{file.name}</span>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onCloseFile(file.id);
                        }}
                        className="absolute right-2 p-1 text-text-sec hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded hover:bg-red-500/10"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pt-4 px-3 border-t border-border">
            <button 
              onClick={() => setIsThemesOpen(!isThemesOpen)}
              className="w-full group p-3 rounded-xl transition-all duration-200 flex items-center px-4 text-text-sec hover:bg-white/5 hover:text-text"
            >
              <Palette size={24} className="shrink-0" />
              <div className="flex items-center justify-between flex-1 ml-4">
                 <span className="text-sm">Temas</span>
                 {isThemesOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
              </div>
            </button>
            
            {isThemesOpen && (
              <div className="pl-12 pr-2 py-2 animate-in slide-in-from-top-2">
                 <ThemeSwitcher />
              </div>
            )}
          </div>
        </nav>

        {/* Footer / User */}
        <div className="p-3 border-t border-border mt-auto shrink-0 flex flex-col gap-2">
          {user ? (
            <div className="flex items-center gap-3 rounded-xl p-2 transition-all bg-surface/50">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="User" className="w-10 h-10 rounded-full border border-border shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center border border-border shrink-0">
                    <UserIcon size={20} className="text-text-sec" />
                  </div>
                )}
                
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-medium text-text truncate">{user.displayName}</span>
                  <span className="text-xs text-text-sec truncate">{user.email}</span>
                </div>

                <button 
                  onClick={onLogout}
                  className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Sair"
                >
                  <LogOut size={18} />
                </button>
            </div>
          ) : (
            <button 
              onClick={onLogin}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-surface hover:bg-brand/10 hover:border-brand/30 border border-border transition-all group"
            >
               <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-brand group-hover:text-black transition-colors shrink-0">
                  <LogIn size={16} />
               </div>
               <div className="flex flex-col items-start">
                  <span className="font-bold text-xs">Entrar</span>
               </div>
            </button>
          )}

          <div className="flex gap-2">
             {/* Legal Button */}
             <button 
                onClick={onOpenLegal}
                className="flex-1 p-2 rounded-lg text-[10px] text-text-sec hover:text-text hover:bg-white/5 transition-colors flex items-center justify-center gap-2 border border-transparent hover:border-white/10"
             >
                <Scale size={12} /> Sobre & Legal
             </button>

             {/* Dev Tools Button */}
             {isDebugMode && (
                <button 
                  onClick={() => setShowDebugModal(true)}
                  className="flex-1 p-2 rounded-lg text-[10px] text-text-sec hover:text-text hover:bg-white/5 transition-colors flex items-center justify-center gap-2 border border-dashed border-white/10 opacity-60 hover:opacity-100"
                >
                   <Wrench size={12} /> Debug
                </button>
             )}
          </div>
        </div>
      </div>

      <OfflineDownloadModal 
        isOpen={showOfflineModal}
        onClose={() => setShowOfflineModal(false)}
        onConfirm={handleStartDownload}
      />

      <VersionDebugModal 
        isOpen={showDebugModal}
        onClose={() => setShowDebugModal(false)}
      />

      <ApiKeyModal 
        isOpen={showKeyModal}
        onClose={() => setShowKeyModal(false)}
      />
    </>
  );
};
