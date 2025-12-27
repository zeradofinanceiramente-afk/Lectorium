
import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { signInWithGoogleDrive, logout, saveDriveToken, getValidDriveToken, DRIVE_TOKEN_EVENT } from './services/authService';
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
import { Loader2, Wifi, Sparkles, X, CheckCircle, AlertTriangle, ScanLine } from 'lucide-react';
import ReauthToast from './components/ReauthToast';
import { LegalModal, LegalTab } from './components/modals/LegalModal';
import { generateMindMapAi } from './services/aiService';
import { GlobalProvider, useGlobalContext } from './context/GlobalContext';
import { OcrCompletionModal } from './components/modals/OcrCompletionModal';
import { SecretThemeModal } from './components/SecretThemeModal';

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

const GlobalToastContainer = () => {
    const { notifications, removeNotification, isOcrRunning, ocrProgress } = useGlobalContext();

    return (
        <div className="fixed top-6 right-6 z-[200] flex flex-col gap-2 pointer-events-none">
            {/* Status Persistente do OCR */}
            {isOcrRunning && ocrProgress && (
                <div className="bg-[#1e1e1e] border border-brand/30 p-3 rounded-xl shadow-2xl flex items-center gap-3 w-80 animate-in slide-in-from-right pointer-events-auto">
                    <Loader2 size={20} className="text-brand animate-spin shrink-0" />
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">Processando: {ocrProgress.filename}</p>
                        <div className="w-full bg-white/10 h-1.5 rounded-full mt-1.5 overflow-hidden">
                            <div 
                                className="h-full bg-brand transition-all duration-500" 
                                style={{ width: `${(ocrProgress.current / ocrProgress.total) * 100}%` }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Notificações Temporárias */}
            {notifications.map(n => (
                <div 
                    key={n.id} 
                    className={`
                        p-3 rounded-xl shadow-2xl flex items-center gap-3 w-80 animate-in slide-in-from-right pointer-events-auto border
                        ${n.type === 'error' ? 'bg-red-950/90 border-red-500/30 text-red-200' : 
                          n.type === 'success' ? 'bg-green-950/90 border-green-500/30 text-green-200' : 
                          'bg-[#1e1e1e]/90 border-white/10 text-white'}
                    `}
                >
                    <div className="shrink-0">
                        {n.type === 'error' ? <AlertTriangle size={18} /> : 
                         n.type === 'success' ? <CheckCircle size={18} /> : 
                         <ScanLine size={18} />}
                    </div>
                    <p className="text-xs font-medium leading-relaxed">{n.message}</p>
                    <button onClick={() => removeNotification(n.id)} className="ml-auto hover:bg-white/10 p-1 rounded">
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
};

const AppContent = () => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() => getValidDriveToken());
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [openFiles, setOpenFiles] = useState<DriveFile[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [storageMode, setStorageMode] = useState<any>('local');
  const [syncStrategy, setSyncStrategy] = useState<'smart' | 'online'>(() => (localStorage.getItem('sync_strategy') as 'smart' | 'online') || 'smart');
  const [localDirHandle, setLocalDirHandle] = useState<any>(null);
  const [savedLocalDirHandle, setSavedLocalDirHandle] = useState<any>(null);
  const [showReauthToast, setShowReauthToast] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<LegalTab>('privacy');
  const [aiLoadingMessage, setAiLoadingMessage] = useState<string | null>(null);
  const [isImmersive, setIsImmersive] = useState(false);
  
  // Secret God Mode State
  const [showSecretThemeModal, setShowSecretThemeModal] = useState(false);

  // Global Context for OCR control
  const { isOcrRunning, addNotification } = useGlobalContext();

  const handleAuthError = useCallback(() => setAccessToken(null), []);
  const handleToggleSyncStrategy = useCallback((strategy: 'smart' | 'online') => { setSyncStrategy(strategy); localStorage.setItem('sync_strategy', strategy); }, []);

  const handleLogin = useCallback(async () => {
    try {
      const result = await signInWithGoogleDrive();
      if (result.accessToken) { saveDriveToken(result.accessToken); setAccessToken(result.accessToken); setShowReauthToast(false); }
    } catch (e) { alert("Não foi possível conectar ao Google Drive."); }
  }, []);

  const handleReauth = useCallback(async () => {
    try { const result = await signInWithGoogleDrive(); if (result.accessToken) { saveDriveToken(result.accessToken); setAccessToken(result.accessToken); setShowReauthToast(false); } } catch (error) { console.error("Falha na reconexão:", error); }
  }, []);

  const { syncStatus } = useSync({ accessToken, onAuthError: handleAuthError });

  // Toggle Immersive
  useEffect(() => {
    const storedPref = localStorage.getItem('app-immersive-mode');
    if (storedPref === 'true') setIsImmersive(false);
    const handleFullscreenChange = () => {
        const isFull = !!document.fullscreenElement;
        setIsImmersive(isFull);
        localStorage.setItem('app-immersive-mode', String(isFull));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleImmersive = useCallback(async () => {
    try {
        if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
            setIsImmersive(true);
        } else {
            if (document.exitFullscreen) {
                await document.exitFullscreen();
                setIsImmersive(false);
            }
        }
    } catch (err) {
        console.error("Error toggling fullscreen:", err);
    }
  }, []);

  // Init & Auth Listeners
  useEffect(() => {
    const init = async () => {
        // --- GOD MODE TRIGGER ---
        const params = new URLSearchParams(window.location.search);
        if (params.get('protocol') === 'genesis') {
            setShowSecretThemeModal(true);
            // Stealth Mode: Limpa a URL imediatamente
            window.history.replaceState({}, document.title, "/");
        }

        // --- THEME LOADING ---
        const godModeTheme = localStorage.getItem('god_mode_theme');
        if (godModeTheme) {
            try {
                const parsed = JSON.parse(godModeTheme);
                if (parsed.vars) {
                    const root = document.documentElement;
                    Object.entries(parsed.vars).forEach(([key, value]) => {
                        root.style.setProperty(key, value as string);
                    });
                    root.classList.add('custom'); // Garante que classes CSS saibam que é custom
                }
            } catch (e) { console.warn("Erro ao carregar tema secreto"); }
        } else {
            // Normal behavior
            const savedTheme = localStorage.getItem('app-theme') || 'forest';
            if (savedTheme !== 'forest') document.documentElement.classList.add(savedTheme);
        }

        await performAppUpdateCleanup();
        await runJanitor(); 
        const storedHandle = await getLocalDirectoryHandle();
        if (storedHandle) setSavedLocalDirHandle(storedHandle);
        setTimeout(() => getOcrWorker().catch(() => {}), 2000);
    };
    init();
    
    // Firebase Auth Listener
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) { setAccessToken(null); setOpenFiles([]); setActiveTab('dashboard'); } 
      else { const storedToken = getValidDriveToken(); if (storedToken) setAccessToken(storedToken); }
    });

    // Token Update Listener (for Auto-Retry updates)
    const handleTokenUpdate = (e: Event) => {
        const customEvent = e as CustomEvent;
        if (customEvent.detail && customEvent.detail.token) {
            setAccessToken(customEvent.detail.token);
            setShowReauthToast(false);
        }
    };
    window.addEventListener(DRIVE_TOKEN_EVENT, handleTokenUpdate);

    return () => {
        unsubscribeAuth();
        window.removeEventListener(DRIVE_TOKEN_EVENT, handleTokenUpdate);
    };
  }, []);

  const handleOpenLocalFolder = useCallback(async () => {
    try { const handle = await openDirectoryPicker(); if (handle) { setLocalDirHandle(handle); setSavedLocalDirHandle(handle); await saveLocalDirectoryHandle(handle); setActiveTab('local-fs'); } } catch (e: any) { if (e.name !== 'AbortError') alert(e.message); }
  }, []);

  const handleReconnectLocalFolder = useCallback(async () => {
      if (!savedLocalDirHandle) return;
      try { const granted = await verifyPermission(savedLocalDirHandle, true); if (granted) { setLocalDirHandle(savedLocalDirHandle); setActiveTab('local-fs'); } else { alert("Acesso negado."); setSavedLocalDirHandle(null); } } catch (e) { handleOpenLocalFolder(); }
  }, [savedLocalDirHandle, handleOpenLocalFolder]);

  // CONSTRAINT: Check if OCR is running before opening new heavy files
  const handleOpenFile = useCallback(async (file: DriveFile) => {
    // RESTRIÇÃO RÍGIDA: Se OCR está rodando e já existe pelo menos 1 arquivo aberto, BLOQUEAR.
    if (isOcrRunning && openFiles.length >= 1) {
        addNotification("Limite de performance: Apenas 1 documento para leitura é permitido enquanto o OCR processa em segundo plano.", "error");
        return; // Impede a abertura
    }

    if (!file.blob && !file.id.startsWith('local-') && !file.id.startsWith('native-')) {
        const cached = await getOfflineFile(file.id);
        if (cached) file.blob = cached; else if (navigator.onLine) {
            if (!accessToken) { const valid = getValidDriveToken(); if (!valid) { setShowReauthToast(true); return; } setAccessToken(valid); }
            try { const blob = await downloadDriveFile(accessToken || '', file.id, file.mimeType); if (syncStrategy === 'smart') await saveOfflineFile(file, blob); file.blob = blob; } catch (e: any) { if (e.message.includes('401')) { setShowReauthToast(true); return; } alert("Erro ao baixar arquivo."); return; }
        }
    }
    if (file.id.startsWith('native-') && file.handle && !file.blob) { try { file.blob = await file.handle.getFile(); } catch (e) { alert("Erro ao ler arquivo local."); return; } }
    addRecentFile(file);
    setOpenFiles(prev => prev.find(f => f.id === file.id) ? prev : [...prev, file]);
    setActiveTab(file.id);
    setIsSidebarOpen(false);
  }, [accessToken, syncStrategy, isOcrRunning, openFiles.length, addNotification]);

  const handleCreateMindMap = useCallback((parentId?: string) => {
    const fileId = `local-mindmap-${Date.now()}`;
    const emptyMap = { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
    const blob = new Blob([JSON.stringify(emptyMap)], { type: 'application/json' });
    handleOpenFile({ id: fileId, name: 'Novo Mapa Mental.mindmap', mimeType: 'application/json', blob: blob, parents: parentId ? [parentId] : [] });
  }, [handleOpenFile]);

  const handleGenerateMindMapWithAi = useCallback(async (topic: string) => {
    setAiLoadingMessage(`Pesquisando sobre "${topic}"...`);
    try {
        const data = await generateMindMapAi(topic);
        const fileId = `local-mindmap-ai-${Date.now()}`;
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        handleOpenFile({ 
            id: fileId, 
            name: `${topic.slice(0, 20)}.mindmap`, 
            mimeType: 'application/json', 
            blob: blob 
        });
    } catch (e: any) {
        alert(e.message || "Erro ao gerar mapa com IA.");
    } finally {
        setAiLoadingMessage(null);
    }
  }, [handleOpenFile]);

  const handleCreateDocument = useCallback((parentId?: string) => {
    const fileId = `local-doc-${Date.now()}`;
    const blob = new Blob([''], { type: MIME_TYPES.DOCX });
    handleOpenFile({ id: fileId, name: 'Novo Documento.docx', mimeType: MIME_TYPES.DOCX, blob: blob, parents: parentId ? [parentId] : [] });
  }, [handleOpenFile]);

  const handleCreateFileFromBlob = useCallback((blob: Blob, name: string, mimeType: string) => { handleOpenFile({ id: `local-${Date.now()}`, name, mimeType, blob }); }, [handleOpenFile]);

  const handleCloseFile = useCallback((id: string) => {
    setOpenFiles(prev => { const next = prev.filter(f => f.id !== id); if (activeTab === id) setActiveTab(next.length ? next[next.length - 1].id : 'dashboard'); return next; });
  }, [activeTab]);

  const handleReturnToDashboard = () => {
      setActiveTab('dashboard');
  };

  const commonProps = useMemo(() => ({ accessToken: accessToken || '', uid: user?.uid || 'guest', onBack: handleReturnToDashboard, onAuthError: handleAuthError, onToggleMenu: () => setIsSidebarOpen(v => !v) }), [accessToken, user?.uid, handleAuthError]);

  const activeContent = useMemo(() => {
    if (activeTab === 'dashboard') return <Dashboard userName={user?.displayName} onOpenFile={handleOpenFile} onUploadLocal={(e) => { const f = e.target.files?.[0]; if (f) handleCreateFileFromBlob(f, f.name, f.type); }} onCreateMindMap={() => handleCreateMindMap()} onCreateDocument={() => handleCreateDocument()} onCreateFileFromBlob={handleCreateFileFromBlob} onChangeView={(view) => setActiveTab(view)} onToggleMenu={() => setIsSidebarOpen(true)} storageMode={storageMode} onToggleStorageMode={setStorageMode} onLogin={handleLogin} onOpenLocalFolder={handleOpenLocalFolder} savedLocalDirHandle={savedLocalDirHandle} onReconnectLocalFolder={handleReconnectLocalFolder} syncStrategy={syncStrategy} onToggleSyncStrategy={handleToggleSyncStrategy} />;
    if (activeTab === 'browser' || activeTab === 'mindmaps' || activeTab === 'offline' || activeTab === 'local-fs') {
        const mode = activeTab === 'browser' ? 'default' : activeTab === 'local-fs' ? 'local' : activeTab as any;
        return <DriveBrowser accessToken={accessToken || ''} onSelectFile={handleOpenFile} onLogout={logout} onAuthError={handleAuthError} onToggleMenu={() => setIsSidebarOpen(true)} mode={mode} onCreateMindMap={(parentId) => mode === 'mindmaps' ? handleCreateMindMap(parentId) : handleCreateDocument(parentId)} onGenerateMindMapWithAi={handleGenerateMindMapWithAi} localDirectoryHandle={mode === 'local' ? localDirHandle : undefined} />;
    }
    const file = openFiles.find(f => f.id === activeTab);
    if (!file) return <GlobalLoader />;
    if (file.name.endsWith('.lect') || file.mimeType === MIME_TYPES.LECTORIUM) return <LectAdapter {...commonProps} file={file} />;
    if (file.name.endsWith('.mindmap')) return <MindMapEditor {...commonProps} fileId={file.id} fileName={file.name} fileBlob={file.blob} />;
    if (file.name.endsWith('.docx') || file.mimeType === MIME_TYPES.DOCX || file.mimeType === MIME_TYPES.GOOGLE_DOC) return <DocEditor {...commonProps} fileId={file.id} fileName={file.name} fileBlob={file.blob} fileParents={file.parents} />;
    if (file.mimeType.startsWith('image/') || file.mimeType === 'application/dicom' || file.mimeType.startsWith('text/') || file.name.endsWith('.cbz')) return <UniversalMediaAdapter {...commonProps} file={file} onToggleNavigation={() => setIsSidebarOpen(true)} />;
    return <PdfViewer {...commonProps} fileId={file.id} fileName={file.name} fileBlob={file.blob} fileParents={file.parents} />;
  }, [activeTab, openFiles, commonProps, user, handleOpenFile, handleAuthError, accessToken, handleCreateMindMap, handleCreateDocument, handleCreateFileFromBlob, storageMode, handleLogin, handleOpenLocalFolder, localDirHandle, savedLocalDirHandle, handleReconnectLocalFolder, syncStrategy, handleToggleSyncStrategy, handleGenerateMindMapWithAi]);

  return (
    <>
      <GlobalToastContainer />
      <OcrCompletionModal />
      
      {/* GOD MODE MODAL */}
      <SecretThemeModal isOpen={showSecretThemeModal} onClose={() => setShowSecretThemeModal(false)} />

      <div className="flex h-screen w-full bg-bg overflow-hidden relative selection:bg-brand/30">
        <Sidebar 
            activeTab={activeTab} 
            onSwitchTab={setActiveTab} 
            openFiles={openFiles} 
            onCloseFile={handleCloseFile} 
            user={user} 
            onLogout={logout} 
            onLogin={handleLogin} 
            isOpen={isSidebarOpen} 
            onClose={() => setIsSidebarOpen(false)} 
            driveActive={!!accessToken} 
            onOpenLegal={() => { setLegalModalTab('privacy'); setShowLegalModal(true); }}
            isImmersive={isImmersive}
            onToggleImmersive={toggleImmersive}
        />
        <main className="flex-1 relative flex flex-col bg-bg overflow-hidden transition-all duration-300">
          <Suspense fallback={<GlobalLoader />}>
              {syncStatus.message && <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 bg-brand text-bg px-6 py-2 rounded-full font-bold shadow-2xl flex items-center gap-2 animate-in slide-in-from-top-6 duration-300 pointer-events-none"><Wifi size={18} className="animate-pulse" /> {syncStatus.message}</div>}
              {activeContent}
          </Suspense>
        </main>
        {showReauthToast && <ReauthToast onReauth={handleReauth} onClose={() => setShowReauthToast(false)} />}
        <LegalModal isOpen={showLegalModal} onClose={() => setShowLegalModal(false)} initialTab={legalModalTab} />
        {aiLoadingMessage && (
            <div className="fixed inset-0 z-[100] bg-bg/90 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-300">
                <div className="relative mb-6">
                    <div className="absolute inset-0 bg-brand/20 rounded-full blur-xl animate-pulse"></div>
                    <div className="relative bg-surface p-6 rounded-full border border-brand/30 shadow-2xl">
                        <Sparkles size={48} className="text-brand animate-pulse" />
                    </div>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">IA Criando Conexões</h3>
                <p className="text-sm text-text-sec max-w-xs text-center px-4 animate-pulse">
                    {aiLoadingMessage}
                </p>
            </div>
        )}
      </div>
      <CookieConsent />
    </>
  );
};

export default function App() {
  return (
    <GlobalProvider>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </GlobalProvider>
  );
}
