
export const API_KEY_STORAGE_KEY = 'lectorium_user_gemini_key';

export const getStoredApiKey = (): string | null => {
  return localStorage.getItem(API_KEY_STORAGE_KEY);
};

export const saveApiKey = (key: string) => {
  localStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
  // Dispara evento para atualizar UI reativa
  window.dispatchEvent(new Event('apikey-changed'));
};

export const removeApiKey = () => {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
  window.dispatchEvent(new Event('apikey-changed'));
};

export const hasApiKey = (): boolean => {
  return !!getStoredApiKey() || !!process.env.API_KEY;
};
