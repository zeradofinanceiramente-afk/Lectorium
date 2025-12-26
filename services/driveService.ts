
import { DriveFile, MIME_TYPES } from "../types";
import { getValidDriveToken, signInWithGoogleDrive, saveDriveToken } from "./authService";

const LIST_PARAMS = "&supportsAllDrives=true&includeItemsFromAllDrives=true";
const WRITE_PARAMS = "&supportsAllDrives=true";

/**
 * Interceptador Centralizado de Requisições (Protocolo Auto-Retry)
 * Gerencia tokens expirados (401) tentando renovar silenciosamente ou via popup antes de falhar.
 */
async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  let token = getValidDriveToken();
  const headers = new Headers(options.headers || {});

  // Tenta injetar o token se disponível
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Primeira tentativa
  let response: Response | null = null;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (e) {
    // Erros de rede (offline, dns, etc) propagam normalmente
    throw e;
  }

  // Se receber 401 (Unauthorized), tenta renovar o token
  if (response.status === 401) {
    console.warn("[Auto-Retry] Token expirado (401). Iniciando protocolo de renovação...");
    
    try {
      // Tenta renovar (Isso abrirá um popup se o navegador não permitir refresh silencioso)
      // Em contextos sem interação do usuário (ex: autosave), isso pode falhar (bloqueio de popup).
      const result = await signInWithGoogleDrive();
      
      if (result && result.accessToken) {
        console.log("[Auto-Retry] Token renovado com sucesso. Retentando requisição...");
        saveDriveToken(result.accessToken);
        token = result.accessToken;
        
        // Atualiza header e refaz a requisição
        headers.set('Authorization', `Bearer ${token}`);
        response = await fetch(url, { ...options, headers });
      } else {
        throw new Error("Falha ao obter novo token.");
      }
    } catch (renewError) {
      console.error("[Auto-Retry] Falha crítica na renovação.", renewError);
      // Lança o erro específico para que a UI mostre o Toast de Reautenticação (Opção 3)
      throw new Error("DRIVE_TOKEN_EXPIRED");
    }
  }

  return response;
}

export async function listDriveContents(accessToken: string, folderId: string = 'root'): Promise<DriveFile[]> {
  let query = "";
  
  const supportedExtensions = [
      MIME_TYPES.LEGACY_MINDMAP_EXT, 
      MIME_TYPES.DOCX_EXT,
      MIME_TYPES.LECT_EXT, 
      '.tiff', '.tif', 
      '.heic', '.heif', 
      '.webp', '.dcm', 
      '.txt', '.md',
      '.cbz', '.cbr'
  ];
  
  const supportedMimes = [
      MIME_TYPES.PDF, 
      MIME_TYPES.FOLDER, 
      MIME_TYPES.DOCX, 
      MIME_TYPES.GOOGLE_DOC,
      MIME_TYPES.LECTORIUM,
      MIME_TYPES.TIFF,
      MIME_TYPES.HEIC,
      MIME_TYPES.HEIF,
      MIME_TYPES.WEBP,
      MIME_TYPES.DICOM,
      MIME_TYPES.CBZ,
      MIME_TYPES.CBR,
      'application/x-cbz',
      'application/x-cbr',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/bmp',
      'text/plain',
      'text/markdown'
  ];

  const mimeQuery = supportedMimes.map(m => `mimeType='${m}'`).join(' or ');
  const nameQuery = supportedExtensions.map(e => `name contains '${e}'`).join(' or ');
  
  const baseConstraints = `trashed=false and (${mimeQuery} or ${nameQuery})`;
  
  if (folderId === 'shared-with-me') {
    query = `sharedWithMe=true and ${baseConstraints}`;
  } else if (folderId === 'starred') {
    query = `starred=true and ${baseConstraints}`;
  } else {
    query = `'${folderId}' in parents and ${baseConstraints}`;
  }

  const fields = "files(id, name, mimeType, thumbnailLink, parents, starred, size, modifiedTime)";
  
  const response = await fetchWithAuth(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=1000&orderBy=folder,name${LIST_PARAMS}`
  );

  if (!response.ok) {
    if (response.status === 401) throw new Error("DRIVE_TOKEN_EXPIRED");
    const errorData = await response.json();
    throw new Error(errorData.error?.message || "Erro na API do Drive");
  }

  const data = await response.json();
  return data.files || [];
}

export async function listDriveFolders(accessToken: string, parentId: string = 'root'): Promise<DriveFile[]> {
  const query = `'${parentId}' in parents and mimeType='${MIME_TYPES.FOLDER}' and trashed=false`;
  const fields = "files(id, name, mimeType, parents)";
  
  const response = await fetchWithAuth(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=1000&orderBy=name${LIST_PARAMS}`
  );

  if (!response.ok) {
    if (response.status === 401) throw new Error("DRIVE_TOKEN_EXPIRED");
    throw new Error("Falha ao listar pastas");
  }

  const data = await response.json();
  return data.files || [];
}

export async function searchMindMaps(accessToken: string): Promise<DriveFile[]> {
  const query = `name contains '${MIME_TYPES.LEGACY_MINDMAP_EXT}' and trashed=false`;
  const fields = "files(id, name, mimeType, thumbnailLink, parents, starred, modifiedTime)";
  
  const response = await fetchWithAuth(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=1000&orderBy=modifiedTime desc${LIST_PARAMS}`
  );

  if (!response.ok) {
    if (response.status === 401) throw new Error("DRIVE_TOKEN_EXPIRED");
    const err = await response.json();
    throw new Error(err.error?.message || "Falha ao buscar mapas mentais");
  }

  const data = await response.json();
  return data.files || [];
}

export async function downloadDriveFile(accessToken: string, driveFileId: string, mimeType?: string): Promise<Blob> {
  let url = `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media${WRITE_PARAMS}`;

  if (mimeType === MIME_TYPES.GOOGLE_DOC) {
      url = `https://www.googleapis.com/drive/v3/files/${driveFileId}/export?mimeType=application/vnd.openxmlformats-officedocument.wordprocessingml.document`;
  } else if (mimeType === MIME_TYPES.GOOGLE_SHEET) {
      url = `https://www.googleapis.com/drive/v3/files/${driveFileId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
  } else if (mimeType === MIME_TYPES.GOOGLE_SLIDES) {
      url = `https://www.googleapis.com/drive/v3/files/${driveFileId}/export?mimeType=application/vnd.openxmlformats-officedocument.presentationml.presentation`;
  }

  const res = await fetchWithAuth(url);
  if (!res.ok) {
    if (res.status === 401) throw new Error("DRIVE_TOKEN_EXPIRED");
    throw new Error("Falha no download do Drive");
  }
  return res.blob();
}

export async function uploadFileToDrive(
  accessToken: string, 
  file: Blob, 
  name: string, 
  parents: string[] = [],
  mimeType: string = MIME_TYPES.PDF
): Promise<{ id: string }> {
  const metadata = {
    name: name,
    mimeType: mimeType,
    parents: parents.length > 0 ? parents : undefined
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const res = await fetchWithAuth(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart${WRITE_PARAMS}`, {
    method: 'POST',
    body: form
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("DRIVE_TOKEN_EXPIRED");
    throw new Error("Falha ao fazer upload");
  }
  return res.json();
}

export async function updateDriveFile(
  accessToken: string, 
  fileId: string, 
  file: Blob,
  mimeType: string = MIME_TYPES.PDF
): Promise<{ id: string }> {
  const metadata = { mimeType: mimeType };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const res = await fetchWithAuth(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart${WRITE_PARAMS}`, {
    method: 'PATCH',
    body: form
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("DRIVE_TOKEN_EXPIRED");
    throw new Error("Falha ao atualizar arquivo");
  }
  return res.json();
}

export async function moveDriveFile(
  accessToken: string,
  fileId: string,
  previousParents: string[],
  newParentId: string
): Promise<void> {
  const prevParentsStr = previousParents.join(',');
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${newParentId}&removeParents=${prevParentsStr}${WRITE_PARAMS}`;

  const res = await fetchWithAuth(url, {
    method: 'PATCH'
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("DRIVE_TOKEN_EXPIRED");
    const err = await res.json();
    throw new Error(err.error?.message || "Falha ao mover arquivo");
  }
}

export async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  const res = await fetchWithAuth(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: 'DELETE'
  });
  
  if (!res.ok) {
    if (res.status === 401) throw new Error("DRIVE_TOKEN_EXPIRED");
  }
}

export async function renameDriveFile(accessToken: string, fileId: string, newName: string): Promise<void> {
  const res = await fetchWithAuth(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { 
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: newName })
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("DRIVE_TOKEN_EXPIRED");
  }
}
