
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
import { Loader2, Wifi, Sparkles } from 'lucide-react';
import ReauthToast from './components/ReauthToast';
import { LegalModal, LegalTab } from './components/modals/LegalModal';
import { generateMindMapAi } from './services/aiService';

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

const AiProcessingLoader = ({ message }: { message: string }) => (
  <div className="fixed inset-0 z-[100] bg-bg/90 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-300">
      <div className="relative mb-6">
          <div className="absolute inset-0 bg-brand/20 rounded-full blur-xl animate-pulse"></div>
          <div className="relative bg-surface p-6 rounded-full border border-brand/30 shadow-2xl">
              <Sparkles size={48} className="text-brand animate-pulse" />
          </div>
      </div>
      <h3 className="text-xl font-bold text-white mb-2">IA Criando Conexões</h3>
      <p className="text-sm text-text-sec max-w-xs text-center px-4 animate-pulse">
          {message}
      </p>
  </div>
);

export default function App() {
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
  
  // Immersive Mode State
  const [isImmersive, setIsImmersive] = useState(false);

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

  useEffect(() => {
    const handleGlobalError = (event: PromiseRejectionEvent) => { if (event.reason?.message === "DRIVE_TOKEN_EXPIRED") { setShowReauthToast(true); event.preventDefault(); } };
    window.addEventListener('unhandledrejection', handleGlobalError);
    return () => window.removeEventListener('unhandledrejection', handleGlobalError);
  }, []);

  const { syncStatus } = useSync({ accessToken, onAuthError: handleAuthError });

  // Immersive Mode Logic
  useEffect(() => {
    // 1. Check preference on load
    const storedPref = localStorage.getItem('app-immersive-mode');
    if (storedPref === 'true') {
        // We can't force fullscreen on load due to browser security,
        // but we update state so the button reflects the intent.
        setIsImmersive(false); // Button will show "Expand" but logic will know intent
    }

    // 2. Sync state with actual browser event (e.g. user presses ESC)
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

  useEffect(() => {
    const init = async () => {
        await performAppUpdateCleanup();
        await runJanitor(); 
        const savedTheme = localStorage.getItem('app-theme') || 'forest';
        if (savedTheme !== 'forest') document.documentElement.classList.add(savedTheme);
        const storedHandle = await getLocalDirectoryHandle();
        if (storedHandle) setSavedLocalDirHandle(storedHandle);
        setTimeout(() => getOcrWorker().catch(() => {}), 2000);
    };
    init();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) { setAccessToken(null); setOpenFiles([]); setActiveTab('dashboard'); } else { const storedToken = getValidDriveToken(); if (storedToken) setAccessToken(storedToken); }
    });
    return () => unsubscribe();
  }, []);

  const handleOpenLocalFolder = useCallback(async () => {
    try { const handle = await openDirectoryPicker(); if (handle) { setLocalDirHandle(handle); setSavedLocalDirHandle(handle); await saveLocalDirectoryHandle(handle); setActiveTab('local-fs'); } } catch (e: any) { if (e.name !== 'AbortError') alert(e.message); }
  }, []);

  const handleReconnectLocalFolder = useCallback(async () => {
      if (!savedLocalDirHandle) return;
      try { const granted = await verifyPermission(savedLocalDirHandle, true); if (granted) { setLocalDirHandle(savedLocalDirHandle); setActiveTab('local-fs'); } else { alert("Acesso negado."); setSavedLocalDirHandle(null); } } catch (e) { handleOpenLocalFolder(); }
  }, [savedLocalDirHandle, handleOpenLocalFolder]);

  const handleOpenFile = useCallback(async (file: DriveFile) => {
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
  }, [accessToken, syncStrategy]);

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

  useEffect(() => {
    const handleLaunch = async () => {
      const params = new URLSearchParams(window.location.search);
      
      // Handle Legal Params (for OAuth Compliance Links)
      const legalParam = params.get('legal');
      if (legalParam === 'terms' || legalParam === 'privacy') {
        setLegalModalTab(legalParam as LegalTab);
        setShowLegalModal(true);
      }

      // Handle PWA Share Target
      if (params.get('share_target') === 'true') {
        const cache = await caches.open('share-target-cache');
        const keys = await cache.keys();
        if (keys.length > 0) {
          const res = await cache.match(keys[0]);
          if (res) { const blob = await res.blob(); const name = decodeURIComponent(keys[0].url.split('/').pop() || 'shared-file'); handleCreateFileFromBlob(blob, name, blob.type); await cache.delete(keys[0]); }
        }
        window.history.replaceState({}, '', '/');
      }
    };
    handleLaunch();
  }, [handleCreateFileFromBlob]);

  const handleCloseFile = useCallback((id: string) => {
    setOpenFiles(prev => { const next = prev.filter(f => f.id !== id); if (activeTab === id) setActiveTab(next.length ? next[next.length - 1].id : 'dashboard'); return next; });
  }, [activeTab]);

  const commonProps = useMemo(() => ({ accessToken: accessToken || '', uid: user?.uid || 'guest', onBack: () => setActiveTab('dashboard'), onAuthError: handleAuthError, onToggleMenu: () => setIsSidebarOpen(v => !v) }), [accessToken, user?.uid, handleAuthError]);

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
    <ErrorBoundary>
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
        {aiLoadingMessage && <AiProcessingLoader message={aiLoadingMessage} />}
      </div>
      <CookieConsent />
    </ErrorBoundary>
  );
}
