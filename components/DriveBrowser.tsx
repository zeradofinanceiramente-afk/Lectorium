
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Folder, FileText, MoreVertical, Trash2, Edit2, Download, 
  Share2, ArrowLeft, Loader2, WifiOff, RefreshCw, Menu,
  X, Image as ImageIcon, Activity, CheckCircle, CloudOff, Package, Pin, PinOff,
  Workflow, Zap, Plus, HardDrive, BookOpen, FolderInput, Cloud, Sparkles, FolderOpen, ChevronRight
} from 'lucide-react';
import { DriveFile, MIME_TYPES } from '../types';
import { 
  listDriveContents, searchMindMaps, deleteDriveFile, 
  renameDriveFile, downloadDriveFile 
} from '../services/driveService';
import { 
  listOfflineFiles, deleteOfflineFile, saveOfflineFile, toggleFilePin, isFilePinned 
} from '../services/storageService';
import { listLocalFiles } from '../services/localFileService';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import JSZip from 'jszip';
import { MoveFileModal } from './MoveFileModal';

// Configuração do Worker do PDF.js para o Browser
if (!GlobalWorkerOptions.workerSrc) {
   GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs`;
}

// --- Thumbnail Generator Helper ---
async function generateLocalThumbnail(file: DriveFile): Promise<string | null> {
    if (!file.blob) return null;
    try {
        if (file.mimeType === MIME_TYPES.PDF) {
            const arrayBuffer = await file.blob.arrayBuffer();
            const loadingTask = getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 0.5 }); 
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: ctx, viewport }).promise;
                return canvas.toDataURL('image/jpeg', 0.8);
            }
        }
        if (file.mimeType === MIME_TYPES.DOCX) {
            const zip = await JSZip.loadAsync(file.blob);
            const thumbFile = zip.file("docProps/thumbnail.jpeg") || zip.file("docProps/thumbnail.emf");
            if (thumbFile) {
                const blob = await thumbFile.async("blob");
                return URL.createObjectURL(blob);
            }
        }
    } catch (e) { console.warn("Falha ao gerar thumbnail local para", file.name, e); }
    return null;
}

interface FileItemProps {
    file: DriveFile;
    onSelect: (file: DriveFile) => void;
    onTogglePin: (file: DriveFile) => void;
    onDelete: (file: DriveFile) => void;
    onShare: (file: DriveFile) => void;
    onMove: (file: DriveFile) => void;
    isOffline: boolean;
    isPinned: boolean;
    isActiveMenu: boolean;
    setActiveMenu: (id: string | null) => void;
    isLocalMode: boolean;
    accessToken?: string;
}

const FileItem = React.memo(({ file, onSelect, onTogglePin, onDelete, onShare, onMove, isOffline, isPinned, isActiveMenu, setActiveMenu, isLocalMode, accessToken }: FileItemProps) => {
    const isFolder = file.mimeType === MIME_TYPES.FOLDER;
    const isDoc = file.mimeType === MIME_TYPES.PDF || file.mimeType === MIME_TYPES.DOCX || file.mimeType === MIME_TYPES.GOOGLE_DOC || file.name.endsWith('.lect') || file.name.endsWith('.cbz') || file.name.endsWith('.cbr');
    const [imgError, setImgError] = useState(false);
    const [localThumbnail, setLocalThumbnail] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        let generatedUrl: string | null = null;
        setImgError(false);
        const loadThumbnail = async () => {
            if (file.blob && file.mimeType.startsWith('image/')) {
                generatedUrl = URL.createObjectURL(file.blob);
                if (active) { setLocalThumbnail(generatedUrl); setImgError(false); }
                return;
            }
            if (file.blob && (file.mimeType === MIME_TYPES.PDF || file.mimeType === MIME_TYPES.DOCX)) {
                const url = await generateLocalThumbnail(file);
                if (active && url) { generatedUrl = url; setLocalThumbnail(url); setImgError(false); }
            }
        };
        if (file.blob || !file.thumbnailLink) loadThumbnail(); else setLocalThumbnail(null);
        return () => { active = false; if (generatedUrl && !generatedUrl.startsWith('data:')) URL.revokeObjectURL(generatedUrl); };
    }, [file.id, file.blob, file.mimeType, file.thumbnailLink]);

    const thumbnailSrc = useMemo(() => {
        if (localThumbnail) return localThumbnail;
        if (!file.thumbnailLink) return null;
        let url = file.thumbnailLink;
        if (url.includes('googleusercontent.com') || url.includes('=s')) url = url.replace(/=s\d+/, '=s400');
        if (accessToken && !isLocalMode) {
            const separator = url.includes('?') ? '&' : '?';
            url = `${url}${separator}access_token=${accessToken}`;
        }
        return url;
    }, [file.thumbnailLink, localThumbnail, accessToken, isLocalMode]);
    
    const getIcon = (f: DriveFile, size: number = 40) => {
      if (f.name.endsWith('.mindmap')) return <Workflow size={size} className="text-purple-400" />;
      if (f.mimeType === MIME_TYPES.PDF) return <BookOpen size={size} className="text-red-400" />;
      if (f.mimeType === MIME_TYPES.DOCX || f.mimeType === MIME_TYPES.GOOGLE_DOC) return <FileText size={size} className="text-blue-400" />;
      if (f.name.endsWith('.lect')) return <Package size={size} className="text-orange-400" />;
      if (f.name.endsWith('.cbz') || f.name.endsWith('.cbr')) return <ImageIcon size={size} className="text-pink-400" />;
      if (f.mimeType.startsWith('image/')) return <ImageIcon size={size} className="text-green-400" />;
      return <FileText size={size} className="text-text-sec" />;
    };

    // --- RENDERIZADOR DE PASTA (ESTÉTICA XBOX/GITHUB) ---
    if (isFolder) {
        return (
            <div 
                onClick={() => onSelect(file)} 
                className="group relative h-32 md:h-40 w-full bg-[#0d1117] border border-[#30363d] rounded-2xl p-4 flex flex-col justify-between cursor-pointer transition-all duration-300 hover:border-brand/50 hover:shadow-[0_0_20px_-5px_var(--brand)] hover:-translate-y-1 overflow-hidden"
            >
                {/* Background Grid Pattern */}
                <div 
                    className="absolute inset-0 opacity-10 pointer-events-none group-hover:opacity-20 transition-opacity" 
                    style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '16px 16px' }}
                />
                
                {/* Top Bar (Tab) */}
                <div className="flex justify-between items-start relative z-10">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-[#161b22] border border-[#30363d] rounded-lg text-brand shadow-sm">
                            <FolderOpen size={16} />
                        </div>
                        <span className="text-[10px] font-mono font-bold text-[#8b949e] uppercase tracking-wider bg-[#161b22] px-1.5 py-0.5 rounded border border-[#30363d]">DIR</span>
                    </div>
                    {!isLocalMode && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); setActiveMenu(isActiveMenu ? null : file.id); }} 
                            className="text-[#8b949e] hover:text-white p-1 hover:bg-[#21262d] rounded transition-colors"
                        >
                            <MoreVertical size={16} />
                        </button>
                    )}
                </div>

                {/* Big Icon Watermark */}
                <div className="absolute right-[-10px] bottom-[-10px] text-[#21262d] group-hover:text-brand/10 transition-colors duration-300 rotate-[-10deg] pointer-events-none">
                    <Folder size={100} strokeWidth={1} />
                </div>

                {/* Label Area */}
                <div className="relative z-10 mt-auto">
                    <h3 className="font-bold text-[#e6edf3] text-sm md:text-base leading-tight line-clamp-2 mb-1 group-hover:text-brand transition-colors">
                        {file.name}
                    </h3>
                    <div className="flex items-center gap-1 text-[10px] text-[#8b949e]">
                       <span>Acessar</span> <ChevronRight size={10} />
                    </div>
                </div>

                {/* Menu Dropdown */}
                {isActiveMenu && !isLocalMode && (
                    <div className="absolute top-10 right-2 w-48 bg-[#161b22] border border-[#30363d] shadow-2xl rounded-xl overflow-hidden z-30 animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                        <button onClick={() => onMove(file)} className="w-full text-left px-4 py-3 hover:bg-[#21262d] text-xs flex items-center gap-2 text-[#c9d1d9]"><FolderInput size={14} /> Mover para...</button>
                        <button onClick={() => onShare(file)} className="w-full text-left px-4 py-3 hover:bg-[#21262d] text-xs flex items-center gap-2 text-[#c9d1d9]"><Share2 size={14} /> Compartilhar</button>
                        <button onClick={() => onDelete(file)} className="w-full text-left px-4 py-3 hover:bg-red-900/20 text-red-400 text-xs flex items-center gap-2 border-t border-[#30363d]"><Trash2 size={14} /> Excluir</button>
                    </div>
                )}
            </div>
        );
    }

    // --- RENDERIZADOR DE ARQUIVO (Mantendo estilo anterior mas refinado) ---
    return (
        <div onClick={() => onSelect(file)} className="group relative bg-surface p-3 rounded-2xl border border-border hover:border-brand/50 transition-all cursor-pointer flex flex-col h-full hover:shadow-lg">
            <div className="w-full aspect-[3/4] bg-black/20 rounded-xl mb-3 relative flex items-center justify-center overflow-hidden border border-white/5">
                {isPinned && <div className="absolute top-2 left-2 text-brand bg-bg/80 backdrop-blur p-1.5 rounded-full z-10 border border-brand/20 shadow-lg"><Pin size={10} fill="currentColor"/></div>}
                {isOffline && !isPinned && !isLocalMode && <div className="absolute top-2 right-2 text-green-500 z-10 bg-black/50 rounded-full p-1"><CheckCircle size={12}/></div>}
                
                {thumbnailSrc && !imgError ? (
                    <img 
                        src={thumbnailSrc} 
                        alt={file.name} 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-90 group-hover:opacity-100" 
                        onError={() => setImgError(true)} 
                        loading="lazy" 
                        referrerPolicy="no-referrer" 
                        crossOrigin="anonymous" 
                    />
                ) : (
                    <div className="transition-transform duration-300 group-hover:scale-110 opacity-70 group-hover:opacity-100">
                        {getIcon(file, 48)}
                    </div>
                )}
            </div>
            
            <div className="flex items-start justify-between gap-2 mt-auto">
                <div className="min-w-0 flex-1">
                    <h3 className="font-medium truncate text-text text-xs mb-0.5 group-hover:text-brand transition-colors">{file.name}</h3>
                    <p className="text-[9px] text-text-sec uppercase font-bold opacity-60 flex items-center gap-1">
                        {file.mimeType.split('/').pop()?.split('.').pop() || 'Arquivo'}
                    </p>
                </div>
                {!isLocalMode && (
                    <button onClick={(e) => { e.stopPropagation(); setActiveMenu(isActiveMenu ? null : file.id); }} className="p-1 text-text-sec hover:text-text hover:bg-white/10 rounded transition-colors">
                        <MoreVertical size={14} />
                    </button>
                )}
            </div>

            {isActiveMenu && !isLocalMode && (
                <div className="absolute bottom-10 right-2 w-48 bg-[#161b22] border border-[#30363d] shadow-2xl rounded-xl overflow-hidden z-30 animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                    <button onClick={() => onTogglePin(file)} className="w-full text-left px-4 py-3 hover:bg-[#21262d] text-xs flex items-center gap-2 text-[#c9d1d9]">
                        {isPinned ? <><PinOff size={14} /> Soltar do disco</> : <><Pin size={14} /> Manter Offline</>}
                    </button>
                    <button onClick={() => onMove(file)} className="w-full text-left px-4 py-3 hover:bg-[#21262d] text-xs flex items-center gap-2 text-[#c9d1d9]"><FolderInput size={14} /> Mover para...</button>
                    <button onClick={() => onShare(file)} className="w-full text-left px-4 py-3 hover:bg-[#21262d] text-xs flex items-center gap-2 text-[#c9d1d9]"><Share2 size={14} /> Compartilhar</button>
                    <button onClick={() => onDelete(file)} className="w-full text-left px-4 py-3 hover:bg-red-900/20 text-red-400 text-xs flex items-center gap-2 border-t border-[#30363d]"><Trash2 size={14} /> Excluir</button>
                </div>
            )}
        </div>
    );
});

interface Props {
  accessToken: string;
  onSelectFile: (file: DriveFile) => Promise<void> | void;
  onLogout: () => void;
  onAuthError: () => void;
  onToggleMenu: () => void;
  mode?: 'default' | 'mindmaps' | 'offline' | 'local';
  onCreateMindMap?: (parentId?: string) => void; 
  onGenerateMindMapWithAi?: (topic: string) => void;
  localDirectoryHandle?: any;
}

export const DriveBrowser: React.FC<Props> = ({ 
  accessToken, onSelectFile, onLogout, onAuthError, 
  onToggleMenu, mode = 'default', onCreateMindMap, onGenerateMindMapWithAi, localDirectoryHandle
}) => {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFolder, setCurrentFolder] = useState<string>('root');
  const [folderHistory, setFolderHistory] = useState<{id: string, name: string}[]>([{id: 'root', name: 'Meu Drive'}]);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);
  const [offlineFileIds, setOfflineFileIds] = useState<Set<string>>(new Set());
  const [pinnedFileIds, setPinnedFileIds] = useState<Set<string>>(new Set());
  const [moveFileModalOpen, setMoveFileModalOpen] = useState(false);
  const [fileToMove, setFileToMove] = useState<DriveFile | null>(null);

  const updateCacheStatus = useCallback(async () => {
    try {
        const offline = await listOfflineFiles();
        setOfflineFileIds(new Set(offline.map(f => f.id)));
        setPinnedFileIds(new Set(offline.filter(f => f.pinned).map(f => f.id)));
    } catch (e) {}
  }, []);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      let fetchedFiles: DriveFile[] = [];
      if (mode === 'offline') fetchedFiles = await listOfflineFiles();
      else if (mode === 'mindmaps') fetchedFiles = await searchMindMaps(accessToken);
      else if (mode === 'local' && localDirectoryHandle) fetchedFiles = await listLocalFiles(localDirectoryHandle);
      else fetchedFiles = await listDriveContents(accessToken, currentFolder);
      setFiles(fetchedFiles);
    } catch (e: any) { if (e.message.includes('401')) onAuthError(); } finally { setLoading(false); }
  }, [accessToken, currentFolder, mode, onAuthError, localDirectoryHandle]);

  useEffect(() => { loadFiles(); updateCacheStatus(); }, [loadFiles, updateCacheStatus]);

  const handleTogglePin = useCallback(async (file: DriveFile) => {
      const isPinned = pinnedFileIds.has(file.id);
      setActiveMenuId(null);
      try {
          if (!offlineFileIds.has(file.id) && !isPinned) {
              setActionLoading(true);
              const blob = await downloadDriveFile(accessToken, file.id, file.mimeType);
              await saveOfflineFile(file, blob, true);
          } else await toggleFilePin(file.id, !isPinned);
          updateCacheStatus();
      } catch (e) { alert("Erro ao fixar."); } finally { setActionLoading(false); }
  }, [accessToken, offlineFileIds, pinnedFileIds, updateCacheStatus]);

  const handleFolderClick = useCallback((folder: DriveFile) => {
    setCurrentFolder(folder.id);
    setFolderHistory(prev => [...prev, { id: folder.id, name: folder.name }]);
  }, []);

  const handleNavigateUp = useCallback(() => {
    if (folderHistory.length <= 1) return;
    const newHistory = [...folderHistory];
    newHistory.pop();
    setCurrentFolder(newHistory[newHistory.length - 1].id);
    setFolderHistory(newHistory);
  }, [folderHistory]);

  const handleDelete = useCallback((file: DriveFile) => { if (confirm(`Tem certeza que deseja excluir "${file.name}"?`)) deleteDriveFile(accessToken, file.id).then(loadFiles); }, [accessToken, loadFiles]);
  const handleShare = useCallback((file: DriveFile) => { setActiveMenuId(null); window.open(`https://drive.google.com/file/d/${file.id}/share`, '_blank'); }, []);
  const handleMove = useCallback((file: DriveFile) => { setActiveMenuId(null); setFileToMove(file); setMoveFileModalOpen(true); }, []);

  const handleSelect = useCallback(async (file: DriveFile) => {
      if (openingFileId) return;
      if (file.mimeType === MIME_TYPES.FOLDER) handleFolderClick(file); else {
          setOpeningFileId(file.id);
          try { await onSelectFile(file); } catch (e) { console.error(e); } finally { setOpeningFileId(null); }
      }
  }, [handleFolderClick, onSelectFile, openingFileId]);

  const handleCreateNew = () => { if (onCreateMindMap) { const parentId = currentFolder === 'root' ? undefined : currentFolder; onCreateMindMap(parentId); } };

  const handleAiGenerate = () => {
    const topic = window.prompt("Sobre qual assunto você deseja gerar um mapa mental?");
    if (topic && onGenerateMindMapWithAi) onGenerateMindMapWithAi(topic);
  };

  const headerTitle = useMemo(() => {
      if (mode === 'offline') return 'Fixados e Recentes';
      if (mode === 'mindmaps') return 'Mapas Mentais';
      if (mode === 'local') return localDirectoryHandle?.name || 'Pasta Local';
      return folderHistory[folderHistory.length - 1].name;
  }, [mode, folderHistory, localDirectoryHandle]);

  const openingFileName = useMemo(() => { if (!openingFileId) return null; return files.find(f => f.id === openingFileId)?.name || "arquivo"; }, [openingFileId, files]);

  return (
    <div className="flex flex-col h-full bg-bg text-text relative">
      <div className="p-4 md:p-6 border-b border-border flex items-center justify-between sticky top-0 bg-bg/80 backdrop-blur z-20">
         <div className="flex items-center gap-3 overflow-hidden">
             <button onClick={onToggleMenu} className="p-2 -ml-2 text-text-sec hover:text-text rounded-full hover:bg-white/5"><Menu size={24} /></button>
             {folderHistory.length > 1 && mode === 'default' && <button onClick={handleNavigateUp} className="p-2 -ml-2 text-text-sec hover:text-text rounded-full hover:bg-white/5"><ArrowLeft size={24} /></button>}
             <div className="flex flex-col min-w-0"><div className="flex items-center gap-2">{mode === 'local' && <HardDrive size={16} className="text-orange-400" />}<h1 className="text-xl font-bold truncate">{headerTitle}</h1></div><span className="text-[10px] text-text-sec flex items-center gap-1">{mode === 'local' ? 'Armazenamento do Dispositivo' : <><Zap size={10} /> Smart Sync Ativo</>}</span></div>
         </div>
         <div className="flex items-center gap-2">
             {mode === 'mindmaps' && onGenerateMindMapWithAi && (
                 <button onClick={handleAiGenerate} className="flex items-center gap-2 bg-purple-600 text-white px-3 py-2 rounded-lg font-bold text-xs hover:brightness-110 shadow-lg transition-all animate-in fade-in">
                     <Sparkles size={16} /><span className="hidden sm:inline">Gerar com IA</span>
                 </button>
             )}
             {(mode === 'mindmaps' || mode === 'default') && onCreateMindMap && (
                 <button onClick={handleCreateNew} className="flex items-center gap-2 bg-brand text-bg px-3 py-2 rounded-lg font-bold text-xs hover:brightness-110 shadow-lg transition-all animate-in fade-in">
                     <Plus size={16} /><span className="hidden sm:inline">Novo</span>
                 </button>
             )}
             <button onClick={loadFiles} className="p-2 text-text-sec hover:text-text rounded-full hover:bg-white/5"><RefreshCw size={20} className={loading ? "animate-spin" : ""} /></button>
         </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar relative">
         {loading && files.length === 0 ? <div className="flex items-center justify-center h-64"><Loader2 size={32} className="animate-spin text-brand" /></div> : <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">{files.map(file => <FileItem key={file.id} file={file} onSelect={handleSelect} onTogglePin={handleTogglePin} onDelete={handleDelete} onShare={handleShare} onMove={handleMove} isOffline={offlineFileIds.has(file.id)} isPinned={pinnedFileIds.has(file.id)} isActiveMenu={activeMenuId === file.id} setActiveMenu={setActiveMenuId} isLocalMode={mode === 'local'} accessToken={accessToken} />)}{files.length === 0 && !loading && <div className="col-span-full text-center py-12 text-text-sec opacity-50">{mode === 'mindmaps' ? 'Nenhum mapa mental encontrado.' : 'Esta pasta está vazia.'}</div>}</div>}
      </div>
      {actionLoading && !openingFileId && <div className="absolute inset-0 z-50 bg-bg/50 backdrop-blur-sm flex items-center justify-center"><Loader2 size={40} className="animate-spin text-brand" /></div>}
      {openingFileId && <div className="absolute inset-0 z-[60] bg-bg/90 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-300"><div className="relative mb-6"><div className="absolute inset-0 bg-brand/20 rounded-full blur-xl animate-pulse"></div><div className="relative bg-surface p-4 rounded-full border border-brand/30 shadow-2xl"><Cloud size={40} className="text-brand animate-pulse" /></div><div className="absolute -bottom-2 -right-2 bg-bg rounded-full p-1 border border-border"><Loader2 size={20} className="animate-spin text-white" /></div></div><h3 className="text-xl font-bold text-white mb-2">Abrindo Arquivo</h3><p className="text-sm text-text-sec max-w-xs text-center truncate px-4">{openingFileName || "Carregando..."}</p><div className="mt-8 flex gap-2"><div className="w-2 h-2 rounded-full bg-brand animate-bounce [animation-delay:-0.3s]"></div><div className="w-2 h-2 rounded-full bg-brand animate-bounce [animation-delay:-0.15s]"></div><div className="w-2 h-2 rounded-full bg-brand animate-bounce"></div></div></div>}
      <MoveFileModal isOpen={moveFileModalOpen} onClose={() => setMoveFileModalOpen(false)} fileToMove={fileToMove} accessToken={accessToken} onMoveSuccess={() => { loadFiles(); setFileToMove(null); }} />
    </div>
  );
};
