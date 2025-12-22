
import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { signInWithGoogleDrive, logout, saveDriveToken, getValidDriveToken } from './services/authService';
import { 
  addRecentFile, performAppUpdateCleanup, runJanitor, saveOfflineFile, 
  getOfflineFile, getLocalDirectoryHandle, saveLocalDirectoryHandle 
} from './services/storageService';
import { downloadDriveFile } from './services/driveService';
import { getOcrWorker } from './services/ocrService';
import { openDirectoryPicker, verifyPermission } from './services/localFileService';
import { useSync } from './hooks/useSync';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CookieConsent } from './components/CookieConsent';
import { DriveFile, MIME_TYPES } from './types';
import { Loader2, Wifi, AlertTriangle } from 'lucide-react';
import ReauthToast from './components/ReauthToast';

const DriveBrowser = lazy(() => import('./components/DriveBrowser').then(m => ({ default: m.DriveBrowser })));
const PdfViewer = lazy(() => import('./components/PdfViewer').then(m => ({ default: m.PdfViewer })));
const MindMapEditor = lazy(() => import('./components/MindMapEditor').then(m => ({ default: m.MindMapEditor })));
const DocEditor = lazy(() => import('./components/DocEditor').then(m => ({ default: m.DocEditor })));
const UniversalMediaAdapter = lazy(() => import('./components/UniversalMediaAdapter').then(m => ({ default: m.UniversalMediaAdapter })));
const LectAdapter = lazy(() => import('./components/LectAdapter').then(m => ({ default: m.LectAdapter })));

const GlobalLoader = () => (
  <div className="flex-1 flex flex-col items-center justify-center bg-bg min-h-[300px]">
    <div className="relative mb-4">
        <div className="absolute inset-0 bg-brand/20 rounded-full blur-xl animate-pulse"></div>
        <Loader2 size={48} className="animate-spin text-brand relative z-10" />
    </div>
    <p className="text-sm font-medium text-text-sec animate-pulse tracking-wide uppercase">Carregando Workspace...</p>
  </div>
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() => getValidDriveToken());
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [openFiles, setOpenFiles] = useState<DriveFile[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Storage Mode: 'local' (Native FS) vs 'drive' (Cloud)
  const [storageMode, setStorageMode] = useState<any>('local');
  
  // Sync Strategy: 'smart' (Cache IDB) vs 'online' (RAM Only/Ephemeral)
  const [syncStrategy, setSyncStrategy] = useState<'smart' | 'online'>(() => {
      return (localStorage.getItem('sync_strategy') as 'smart' | 'online') || 'smart';
  });

  const [localDirHandle, setLocalDirHandle] = useState<any>(null);
  const [savedLocalDirHandle, setSavedLocalDirHandle] = useState<any>(null);
  const [showReauthToast, setShowReauthToast] = useState(false);

  const handleAuthError = useCallback(() => {
      setAccessToken(null);
  }, []);

  const handleToggleSyncStrategy = useCallback((strategy: 'smart' | 'online') => {
      setSyncStrategy(strategy);
      localStorage.setItem('sync_strategy', strategy);
  }, []);

  const handleLogin = useCallback(async () => {
    try {
      const result = await signInWithGoogleDrive();
      if (result.accessToken) {
        saveDriveToken(result.accessToken);
        setAccessToken(result.accessToken);
        setShowReauthToast(false);
      }
    } catch (e) {
      console.error("Login falhou", e);
      alert("Não foi possível conectar ao Google Drive.");
    }
  }, []);

  const handleReauth = useCallback(async () => {
    try {
      const result = await signInWithGoogleDrive(); 
      if (result.accessToken) {
        saveDriveToken(result.accessToken);
        setAccessToken(result.accessToken);
        setShowReauthToast(false);
      }
    } catch (error) {
      console.error("Falha na reconexão:", error);
    }
  }, []);

  useEffect(() => {
    const handleGlobalError = (event: PromiseRejectionEvent) => {
      if (event.reason?.message === "DRIVE_TOKEN_EXPIRED" || (event.reason instanceof Error && event.reason.message === "DRIVE_TOKEN_EXPIRED")) {
        setShowReauthToast(true);
        event.preventDefault(); 
      }
    };
    window.addEventListener('unhandledrejection', handleGlobalError);
    return () => window.removeEventListener('unhandledrejection', handleGlobalError);
  }, []);

  const { syncStatus } = useSync({ accessToken, onAuthError: handleAuthError });

  useEffect(() => {
    const init = async () => {
        await performAppUpdateCleanup();
        await runJanitor(); 
        
        // Configura tema
        const savedTheme = localStorage.getItem('app-theme') || 'forest';
        if (savedTheme !== 'forest') document.documentElement.classList.add(savedTheme);

        // Carrega diretório local salvo do IndexedDB
        const storedHandle = await getLocalDirectoryHandle();
        if (storedHandle) {
            setSavedLocalDirHandle(storedHandle);
        }

        // Pre-warming do OCR
        setTimeout(() => {
            getOcrWorker().catch(e => console.warn("OCR Pre-warm skip:", e));
        }, 2000);
    };
    init();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setAccessToken(null);
        localStorage.removeItem('drive_access_token_data');
        setOpenFiles([]);
        setActiveTab('dashboard');
      } else {
        const storedToken = getValidDriveToken();
        if (storedToken) setAccessToken(storedToken);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleOpenLocalFolder = useCallback(async () => {
    try {
      const handle = await openDirectoryPicker();
      if (handle) {
        setLocalDirHandle(handle);
        setSavedLocalDirHandle(handle);
        await saveLocalDirectoryHandle(handle);
        setActiveTab('local-fs');
      }
    } catch (e: any) {
      if (e.name === 'SecurityError' || e.message.includes('Cross origin')) {
          alert("O navegador bloqueou o acesso a pastas por segurança. Use a opção 'Abrir Local' para enviar arquivos individualmente.");
      } else if (e.message !== 'Seleção cancelada.') {
        alert(e.message);
      }
    }
  }, []);

  // Reconecta a uma pasta já conhecida sem abrir o seletor (disparando o prompt de permissão)
  const handleReconnectLocalFolder = useCallback(async () => {
      if (!savedLocalDirHandle) return;
      try {
          const granted = await verifyPermission(savedLocalDirHandle, true);
          if (granted) {
              setLocalDirHandle(savedLocalDirHandle);
              setActiveTab('local-fs');
          } else {
              alert("Acesso negado. Por favor, escolha a pasta novamente.");
              setSavedLocalDirHandle(null);
          }
      } catch (e) {
          console.error("Reconnect failed", e);
          handleOpenLocalFolder(); // Fallback pro seletor se algo der errado
      }
  }, [savedLocalDirHandle, handleOpenLocalFolder]);

  const handleOpenFile = useCallback(async (file: DriveFile) => {
    if (!file.blob && !file.id.startsWith('local-') && !file.id.startsWith('native-')) {
        // 1. Tenta Cache (se existir, usa, mesmo no modo online para economizar banda)
        const cached = await getOfflineFile(file.id);
        if (cached) {
            file.blob = cached;
        } 
        // 2. Download da Nuvem
        else if (navigator.onLine) {
            if (!accessToken) {
                const valid = getValidDriveToken();
                if (!valid) {
                    setShowReauthToast(true);
                    return; 
                }
                setAccessToken(valid);
            }
            try {
                const blob = await downloadDriveFile(accessToken || '', file.id, file.mimeType);
                
                // CRITICAL LOGIC: Só salva no IDB se estiver em modo Smart Sync
                if (syncStrategy === 'smart') {
                    await saveOfflineFile(file, blob);
                } else {
                    console.log(`[Online Mode] Arquivo ${file.name} baixado apenas para memória (não persistido).`);
                }
                
                file.blob = blob;
            } catch (e: any) { 
                if (e.message === 'DRIVE_TOKEN_EXPIRED' || e.message.includes('401')) {
                    setShowReauthToast(true);
                    return;
                }
                alert("Erro ao baixar arquivo.");
                return;
            }
        }
    }
    
    if (file.id.startsWith('native-') && file.handle && !file.blob) {
        try {
            file.blob = await file.handle.getFile();
        } catch (e) {
            alert("Erro ao ler arquivo local. A permissão pode ter expirado.");
            return;
        }
    }

    addRecentFile(file);
    setOpenFiles(prev => {
        if (prev.find(f => f.id === file.id)) return prev;
        return [...prev, file];
    });
    setActiveTab(file.id);
    setIsSidebarOpen(false);
  }, [accessToken, syncStrategy]);

  const handleCreateMindMap = useCallback((parentId?: string) => {
    const fileId = `local-mindmap-${Date.now()}`;
    const emptyMap = { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
    const blob = new Blob([JSON.stringify(emptyMap)], { type: 'application/json' });
    const file: DriveFile = { id: fileId, name: 'Novo Mapa Mental.mindmap', mimeType: 'application/json', blob: blob, parents: parentId ? [parentId] : [] };
    handleOpenFile(file);
  }, [handleOpenFile]);

  const handleCreateDocument = useCallback((parentId?: string) => {
    const fileId = `local-doc-${Date.now()}`;
    const blob = new Blob([''], { type: MIME_TYPES.DOCX });
    const file: DriveFile = { id: fileId, name: 'Novo Documento.docx', mimeType: MIME_TYPES.DOCX, blob: blob, parents: parentId ? [parentId] : [] };
    handleOpenFile(file);
  }, [handleOpenFile]);

  const handleCreateFileFromBlob = useCallback((blob: Blob, name: string, mimeType: string) => {
    const file: DriveFile = { id: `local-${Date.now()}`, name, mimeType, blob };
    handleOpenFile(file);
  }, [handleOpenFile]);

  const handleCloseFile = useCallback((id: string) => {
    setOpenFiles(prev => {
        const next = prev.filter(f => f.id !== id);
        if (activeTab === id) setActiveTab(next.length ? next[next.length - 1].id : 'dashboard');
        return next;
    });
  }, [activeTab]);

  const toggleSidebar = useCallback(() => setIsSidebarOpen(v => !v), []);
  
  const commonProps = useMemo(() => ({
      accessToken: accessToken || '',
      uid: user?.uid || 'guest',
      onBack: () => setActiveTab('dashboard'),
      onAuthError: handleAuthError,
      onToggleMenu: toggleSidebar
  }), [accessToken, user?.uid, handleAuthError, toggleSidebar]);

  const activeContent = useMemo(() => {
    if (activeTab === 'dashboard') {
        return <Dashboard 
          userName={user?.displayName} 
          onOpenFile={handleOpenFile} 
          onUploadLocal={(e) => {
            const f = e.target.files?.[0];
            if (f) handleCreateFileFromBlob(f, f.name, f.type);
          }} 
          onCreateMindMap={() => handleCreateMindMap()}
          onCreateDocument={() => handleCreateDocument()}
          onCreateFileFromBlob={handleCreateFileFromBlob}
          onChangeView={(view: 'browser' | 'offline') => setActiveTab(view)} 
          onToggleMenu={toggleSidebar}
          storageMode={storageMode}
          onToggleStorageMode={setStorageMode}
          onLogin={handleLogin}
          onOpenLocalFolder={handleOpenLocalFolder}
          savedLocalDirHandle={savedLocalDirHandle}
          onReconnectLocalFolder={handleReconnectLocalFolder}
          syncStrategy={syncStrategy}
          onToggleSyncStrategy={handleToggleSyncStrategy}
        />;
    }

    if (activeTab === 'browser' || activeTab === 'mindmaps' || activeTab === 'offline' || activeTab === 'local-fs') {
        const mode = activeTab === 'browser' ? 'default' : activeTab === 'local-fs' ? 'local' : activeTab as any;
        return (
            <DriveBrowser 
                accessToken={accessToken || ''} 
                onSelectFile={handleOpenFile} 
                onLogout={logout} 
                onAuthError={handleAuthError} 
                onToggleMenu={toggleSidebar} 
                mode={mode}
                onCreateMindMap={(parentId) => mode === 'mindmaps' ? handleCreateMindMap(parentId) : handleCreateDocument(parentId)}
                localDirectoryHandle={mode === 'local' ? localDirHandle : undefined}
            />
        );
    }

    const file = openFiles.find(f => f.id === activeTab);
    if (!file) return <GlobalLoader />;
    if (file.name.endsWith('.lect') || file.mimeType === MIME_TYPES.LECTORIUM) return <LectAdapter {...commonProps} file={file} />;
    if (file.name.endsWith('.mindmap')) return <MindMapEditor {...commonProps} fileId={file.id} fileName={file.name} fileBlob={file.blob} />;
    if (file.name.endsWith('.docx') || file.mimeType === MIME_TYPES.DOCX || file.mimeType === MIME_TYPES.GOOGLE_DOC) 
        return <DocEditor {...commonProps} fileId={file.id} fileName={file.name} fileBlob={file.blob} fileParents={file.parents} />;
    if (file.mimeType.startsWith('image/') || file.mimeType === 'application/dicom' || file.mimeType.startsWith('text/') || file.name.endsWith('.cbz')) 
        return <UniversalMediaAdapter {...commonProps} file={file} onToggleNavigation={toggleSidebar} />;
    
    return <PdfViewer {...commonProps} fileId={file.id} fileName={file.name} fileBlob={file.blob} fileParents={file.parents} />;
  }, [activeTab, openFiles, commonProps, toggleSidebar, user, handleOpenFile, handleAuthError, accessToken, handleCreateMindMap, handleCreateDocument, handleCreateFileFromBlob, storageMode, handleLogin, handleOpenLocalFolder, localDirHandle, savedLocalDirHandle, handleReconnectLocalFolder, syncStrategy, handleToggleSyncStrategy]);

  return (
    <ErrorBoundary>
      <div className="flex h-screen w-full bg-bg overflow-hidden relative selection:bg-brand/30">
        <Sidebar activeTab={activeTab} onSwitchTab={setActiveTab} openFiles={openFiles} onCloseFile={handleCloseFile} user={user} onLogout={logout} onLogin={handleLogin} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} onToggle={toggleSidebar} driveActive={!!accessToken} />
        <main className="flex-1 relative flex flex-col bg-bg overflow-hidden transition-all duration-300">
          <Suspense fallback={<GlobalLoader />}>
              {syncStatus.message && (
                 <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 bg-brand text-bg px-6 py-2 rounded-full font-bold shadow-2xl flex items-center gap-2 animate-in slide-in-from-top-6 duration-300 pointer-events-none">
                     <Wifi size={18} className="animate-pulse" /> {syncStatus.message}
                 </div>
              )}
              {activeContent}
          </Suspense>
        </main>
        {showReauthToast && <ReauthToast onReauth={handleReauth} onClose={() => setShowReauthToast(false)} />}
      </div>
      <CookieConsent />
    </ErrorBoundary>
  );
}
