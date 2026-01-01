import { signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut, setPersistence, browserLocalPersistence } from "firebase/auth";
import { auth } from "../firebase";

const TOKEN_DATA_KEY = 'drive_access_token_data';
export const DRIVE_TOKEN_EVENT = 'drive_token_changed';

export const saveDriveToken = (token: string, expiresIn: number = 3600) => {
  // Default Google OAuth access token lifetime is 1 hour (3600s)
  // We subtract a buffer (e.g., 5 minutes) to be safe
  const expiryDate = Date.now() + (expiresIn - 300) * 1000; 
  const tokenData = {
    token,
    expiresAt: expiryDate
  };
  localStorage.setItem(TOKEN_DATA_KEY, JSON.stringify(tokenData));
  
  // Notifica a aplicação que o token mudou (para atualizar estados React e interceptadores)
  window.dispatchEvent(new CustomEvent(DRIVE_TOKEN_EVENT, { detail: { token } }));
};

export const getValidDriveToken = (): string | null => {
  const data = localStorage.getItem(TOKEN_DATA_KEY);
  if (!data) return null;
  
  try {
    const { token, expiresAt } = JSON.parse(data);
    if (Date.now() > expiresAt) {
      return null; // Token expired
    }
    return token;
  } catch (e) {
    return null;
  }
};

// Retorna o tempo restante em minutos (ou 0 se expirado/inexistente)
export const getTokenTimeRemaining = (): number => {
  const data = localStorage.getItem(TOKEN_DATA_KEY);
  if (!data) return 0;
  
  try {
    const { expiresAt } = JSON.parse(data);
    const remaining = expiresAt - Date.now();
    return remaining > 0 ? Math.floor(remaining / 60000) : 0;
  } catch (e) {
    return 0;
  }
};

export async function signInWithGoogleDrive() {
  const provider = new GoogleAuthProvider();
  
  // ESCOPO CRÍTICO: 'https://www.googleapis.com/auth/drive'
  // Necessário para:
  // 1. O DriveBrowser listar pastas e arquivos que NÃO foram criados pelo Lectorium.
  // 2. O PdfViewer salvar anotações (PATCH) em PDFs existentes enviados por outros meios.
  // 3. Mover e organizar arquivos arbitrários.
  provider.addScope("https://www.googleapis.com/auth/drive");
  
  // Permite que o app apareça no menu "Abrir com" do Google Drive UI
  provider.addScope("https://www.googleapis.com/auth/drive.install");

  try {
    // Força a persistência da sessão do Firebase para LOCAL (sobrevive ao fechamento da aba/navegador)
    await setPersistence(auth, browserLocalPersistence);

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    
    if (!credential?.accessToken) {
      throw new Error("No access token returned from Google");
    }

    return {
      user: result.user,
      accessToken: credential.accessToken
    };
  } catch (error) {
    console.error("Login failed:", error);
    throw error;
  }
}

export async function logout() {
  localStorage.removeItem(TOKEN_DATA_KEY);
  return firebaseSignOut(auth);
}