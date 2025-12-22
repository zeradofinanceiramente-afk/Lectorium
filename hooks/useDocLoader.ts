
import { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { downloadDriveFile } from '../services/driveService';
import { PageSettings } from '../components/doc/modals/PageSetupModal';
import { CommentData } from '../components/doc/CommentsSidebar';
import { processDocxForImport } from '../services/docxImporter';
import { Reference } from '../types';
import { getCachedDocumentData, cacheDocumentData } from '../services/storageService';

interface UseDocLoaderProps {
  fileId: string;
  fileBlob?: Blob;
  accessToken: string;
  isLocalFile: boolean;
}

interface LoaderState {
  status: 'init' | 'downloading' | 'converting' | 'layout' | 'ready' | 'error';
  progress: number;
  message: string;
  content: any;
  chunks?: string[]; 
  contentType: 'html' | 'json';
  detectedSettings?: PageSettings;
  comments?: CommentData[];
  references?: Reference[];
  originalZip?: JSZip; 
}

export const useDocLoader = ({ fileId, fileBlob, accessToken, isLocalFile }: UseDocLoaderProps) => {
  const [state, setState] = useState<LoaderState>({
    status: 'init',
    progress: 0,
    message: "Iniciando...",
    content: null,
    contentType: 'html'
  });

  useEffect(() => {
    let active = true;

    const load = async () => {
      // Prioritize fileBlob if available (e.g. from LectAdapter)
      // This fixes the issue where cached data might override fresh unpacked content
      const shouldUseCache = !isLocalFile && !fileBlob;

      if (fileId.startsWith('new-') && !fileBlob) {
         setState({ status: 'ready', progress: 100, message: "Pronto", content: "", contentType: 'html' });
         return;
      }

      // Cache Check
      if (shouldUseCache) {
          try {
              const cached = await getCachedDocumentData(fileId);
              if (cached && active) {
                  console.log("Cache Hit! Loading processed document from DB.");
                  setState({
                      status: 'ready',
                      progress: 100,
                      message: "Carregando do cache...",
                      content: cached.content,
                      contentType: cached.contentType,
                      detectedSettings: cached.settings,
                      comments: cached.comments,
                      references: cached.references
                  });
                  return;
              }
          } catch (e) {
              console.warn("Cache check failed", e);
          }
      }

      setState({ status: 'downloading', progress: 10, message: "Baixando documento...", content: null, contentType: 'html' });

      let blobToRead = fileBlob;

      if (!blobToRead && !isLocalFile && accessToken) {
          try {
              blobToRead = await downloadDriveFile(accessToken, fileId);
          } catch (e) {
              console.error("Failed to download doc", e);
              if (active) setState({ status: 'error', progress: 0, message: "Erro no download", content: null, contentType: 'html' });
              return;
          }
      }

      if (blobToRead) {
          if (active) setState({ status: 'converting', progress: 50, message: "Processando...", content: null, contentType: 'html' });

          if (blobToRead.size === 0) {
              if (active) setState({ status: 'ready', progress: 100, message: "Pronto", content: "", contentType: 'html' });
              return;
          }

          // A. Lectorium JSON Package or Direct JSON
          // Explicit check for type OR if filename hint suggests JSON
          const isJsonType = blobToRead.type === 'application/json' || (blobToRead as any).name?.endsWith('.json');
          
          if (isJsonType) {
              try {
                  const text = await blobToRead.text();
                  let json = JSON.parse(text);
                  
                  let content = json;
                  let settings = undefined;
                  let comments = undefined;
                  let references = undefined;

                  // Handle Lectorium Package Data Structure
                  // pkg.data = { content: {...}, pageSettings: {...}, comments: [...] }
                  if (json.content && (json.pageSettings || json.comments || json.content.type === 'doc')) {
                      // If 'content' key exists and it looks like our wrapper
                      content = json.content;
                      settings = json.pageSettings;
                      comments = json.comments;
                      references = json.references || json.meta?.references;
                  } 
                  // Handle Old Format or Direct Tiptap JSON with Meta
                  else if (json.meta) {
                      if (json.meta.comments) comments = json.meta.comments;
                      if (json.meta.references) references = json.meta.references;
                  }

                  if (active) {
                      setState({ 
                          status: 'ready', 
                          progress: 100, 
                          message: "Pronto", 
                          content: content, 
                          contentType: 'json',
                          detectedSettings: settings,
                          comments: comments,
                          references: references
                      });
                      
                      // Update cache if it's a remote file but we just loaded fresh content
                      if (!isLocalFile) {
                          cacheDocumentData(fileId, {
                              content, contentType: 'json', settings, comments, references
                          });
                      }
                  }
                  return;
              } catch (e) {
                  console.warn("Failed to parse JSON blob, falling back to DOCX processor", e);
              }
          }

          // B. DOCX Processing (Native Parser)
          try {
              // First check if it's our specialized "Zip with State" format
              try {
                  const zip = await JSZip.loadAsync(blobToRead);
                  const stateFile = zip.file("tiptap-state.json");
                  if (stateFile) {
                      const jsonText = await stateFile.async("string");
                      const jsonContent = JSON.parse(jsonText);
                      
                      const comments = jsonContent.meta?.comments;
                      const references = jsonContent.meta?.references;

                      if (active) {
                          setState({ 
                              status: 'ready', 
                              progress: 100, 
                              message: "Carregando formato nativo...", 
                              content: jsonContent, 
                              contentType: 'json',
                              originalZip: zip,
                              comments,
                              references
                          });
                      }
                      return;
                  }
              } catch (e) { /* Ignore */ }

              // Use new Native Parser
              const result = await processDocxForImport(blobToRead);
              
              if (active) {
                  setState({ 
                      status: 'ready', 
                      progress: 100, 
                      message: "Renderizando...", 
                      content: result.tiptapJson, 
                      contentType: 'json', // Now we always use JSON!
                      detectedSettings: result.settings,
                      comments: result.comments,
                      originalZip: result.originalZip
                  });

                  if (!isLocalFile) {
                      cacheDocumentData(fileId, {
                          content: result.tiptapJson, 
                          contentType: 'json',
                          settings: result.settings,
                          comments: result.comments
                      });
                  }
              }

          } catch (e) {
              console.error("Conversion error", e);
              if (active) setState({ status: 'error', progress: 0, message: "Falha na leitura", content: null, contentType: 'html' });
          }
      }
    };

    load();

    return () => { active = false; };
  }, [fileId, accessToken, isLocalFile, fileBlob]);

  return state;
};
