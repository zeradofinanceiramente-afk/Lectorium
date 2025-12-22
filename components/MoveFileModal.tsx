
import React, { useState, useEffect } from 'react';
import { Folder, FolderInput, ArrowRight, Loader2, Home, CheckCircle } from 'lucide-react';
import { BaseModal } from './shared/BaseModal';
import { listDriveFolders, moveDriveFile } from '../services/driveService';
import { DriveFile } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  fileToMove: DriveFile | null;
  accessToken: string;
  onMoveSuccess: () => void;
}

export const MoveFileModal: React.FC<Props> = ({ isOpen, onClose, fileToMove, accessToken, onMoveSuccess }) => {
  const [currentFolder, setCurrentFolder] = useState<{id: string, name: string}>({ id: 'root', name: 'Meu Drive' });
  const [folders, setFolders] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState(false);
  const [history, setHistory] = useState<{id: string, name: string}[]>([{ id: 'root', name: 'Meu Drive' }]);

  useEffect(() => {
    if (isOpen) {
      // Reset state on open
      setCurrentFolder({ id: 'root', name: 'Meu Drive' });
      setHistory([{ id: 'root', name: 'Meu Drive' }]);
      loadFolders('root');
    }
  }, [isOpen]);

  const loadFolders = async (parentId: string) => {
    setLoading(true);
    try {
      const result = await listDriveFolders(accessToken, parentId);
      setFolders(result);
    } catch (e) {
      console.error("Erro ao listar pastas", e);
    } finally {
      setLoading(false);
    }
  };

  const handleFolderClick = (folder: DriveFile) => {
    setHistory(prev => [...prev, { id: folder.id, name: folder.name }]);
    setCurrentFolder({ id: folder.id, name: folder.name });
    loadFolders(folder.id);
  };

  const handleNavigateUp = () => {
    if (history.length <= 1) return;
    const newHistory = [...history];
    newHistory.pop(); // Remove current
    const parent = newHistory[newHistory.length - 1];
    setHistory(newHistory);
    setCurrentFolder(parent);
    loadFolders(parent.id);
  };

  const handleMove = async () => {
    if (!fileToMove) return;
    setMoving(true);
    try {
      await moveDriveFile(accessToken, fileToMove.id, fileToMove.parents || [], currentFolder.id);
      onMoveSuccess();
      onClose();
    } catch (e) {
      console.error(e);
      alert("Erro ao mover arquivo.");
    } finally {
      setMoving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Mover Arquivo"
      icon={<FolderInput size={20} />}
      maxWidth="max-w-lg"
      footer={
        <div className="flex justify-between w-full items-center">
            <div className="text-xs text-text-sec truncate max-w-[200px]">
                {history.length > 1 ? `.../${currentFolder.name}` : 'Em: Meu Drive'}
            </div>
            <button 
                onClick={handleMove} 
                disabled={moving}
                className="bg-brand text-[#0b141a] px-6 py-2 rounded-full font-bold hover:brightness-110 flex items-center gap-2 disabled:opacity-50 transition-all"
            >
                {moving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                {moving ? 'Movendo...' : 'Mover Aqui'}
            </button>
        </div>
      }
    >
      <div className="flex flex-col h-[300px]">
         {/* Breadcrumb / Navigation */}
         <div className="flex items-center gap-2 pb-4 border-b border-border mb-2 text-sm">
             {history.length > 1 && (
                 <button onClick={handleNavigateUp} className="hover:bg-white/10 p-1.5 rounded text-text-sec hover:text-text">
                     <ArrowRight size={16} className="rotate-180" />
                 </button>
             )}
             <div className="font-bold flex items-center gap-2 text-text">
                 {currentFolder.id === 'root' ? <Home size={16} /> : <Folder size={16} className="text-brand" />}
                 {currentFolder.name}
             </div>
         </div>

         {/* Folder List */}
         <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
             {loading ? (
                 <div className="flex justify-center py-10">
                     <Loader2 size={24} className="animate-spin text-brand" />
                 </div>
             ) : folders.length === 0 ? (
                 <div className="text-center py-10 text-text-sec text-sm italic">
                     Nenhuma pasta encontrada aqui.
                 </div>
             ) : (
                 folders.map(folder => (
                     <button
                        key={folder.id}
                        onClick={() => handleFolderClick(folder)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 text-left transition-colors group"
                     >
                         <div className="text-text-sec group-hover:text-brand transition-colors">
                             <Folder size={20} />
                         </div>
                         <span className="flex-1 truncate text-sm">{folder.name}</span>
                         <ArrowRight size={14} className="text-text-sec opacity-0 group-hover:opacity-100" />
                     </button>
                 ))
             )}
         </div>
      </div>
    </BaseModal>
  );
};
