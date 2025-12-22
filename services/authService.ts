import { signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut, setPersistence, browserLocalPersistence } from "firebase/auth";
import { auth } from "../firebase";

const TOKEN_DATA_KEY = 'drive_access_token_data';

export const saveDriveToken = (token: string, expiresIn: number = 3600) => {
  // Default Google OAuth access token lifetime is 1 hour (3600s)
  // We subtract a buffer (e.g., 5 minutes) to be safe
  const expiryDate = Date.now() + (expiresIn - 300) * 1000; 
  const tokenData = {
    token,
    expiresAt: expiryDate
  };
  localStorage.setItem(TOKEN_DATA_KEY, JSON.stringify(tokenData));
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

export async function signInWithGoogleDrive() {
  const provider = new GoogleAuthProvider();
  // Essential scopes for the app's functionality
  provider.addScope("https://www.googleapis.com/auth/drive.readonly"); 
  provider.addScope("https://www.googleapis.com/auth/drive.file");
  provider.addScope("https://www.googleapis.com/auth/drive.metadata.readonly");

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