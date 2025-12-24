
/**
 * Scheduler Utility for Time-Slicing
 * Garante 60fps executando tarefas pesadas apenas no tempo ocioso do frame.
 */

type IdleDeadline = {
  timeRemaining: () => number;
  didTimeout: boolean;
};

type IdleCallback = (deadline: IdleDeadline) => void;

// Polyfill minimalista para ambientes que não suportam requestIdleCallback (ex: Safari antigo)
const requestIdleCallbackShim = (cb: IdleCallback) => {
  const start = Date.now();
  return setTimeout(() => {
    cb({
      didTimeout: false,
      timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
    });
  }, 1) as unknown as number;
};

const cancelIdleCallbackShim = (id: number) => {
  clearTimeout(id);
};

// Detecção segura
const rIC = typeof window !== 'undefined' && 'requestIdleCallback' in window
  ? (window as any).requestIdleCallback
  : requestIdleCallbackShim;

const cIC = typeof window !== 'undefined' && 'cancelIdleCallback' in window
  ? (window as any).cancelIdleCallback
  : cancelIdleCallbackShim;

export const scheduleWork = (callback: IdleCallback, options?: { timeout: number }): number => {
  return rIC(callback, options);
};

export const cancelWork = (id: number) => {
  cIC(id);
};
