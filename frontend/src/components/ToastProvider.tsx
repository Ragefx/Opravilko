import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";

interface ToastState {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

type ShowToast = (toast: Omit<ToastState, "id">) => void;

const ToastContext = createContext<ShowToast>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const show = useCallback<ShowToast>((t) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const id = Date.now();
    setToast({ id, ...t });
    timerRef.current = window.setTimeout(() => {
      setToast((cur) => (cur?.id === id ? null : cur));
    }, 5000);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className="toast">
          <span>{toast.message}</span>
          {toast.actionLabel && (
            <button
              className="toast-action"
              onClick={() => {
                toast.onAction?.();
                setToast(null);
              }}
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}
