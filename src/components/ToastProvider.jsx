import { createContext, useContext, useState, useCallback } from 'react';
import './Toast.css';

const ToastContext = createContext(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // toast(message, type, options)
  //   options.action   { label, icon, onClick } — a button inside the toast
  //   options.key      a toast with the same key replaces this one, so a run
  //                    of undo toasts doesn't pile up
  //   options.duration ms before it goes away on its own
  const showToast = useCallback(
    (message, type = 'info', { action, key, duration = 4000 } = {}) => {
      const id = crypto.randomUUID?.() ?? String(Date.now() + Math.random());
      setToasts((prev) => [
        ...(key ? prev.filter((t) => t.key !== key) : prev),
        { id, message, type, action, key },
      ]);
      setTimeout(() => dismissToast(id), duration);
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="toast-container">
        {toasts.map((toast) =>
          toast.action ? (
            // Not a button itself: the action inside it is the button.
            <div
              key={toast.id}
              className={`toast toast-${toast.type}`}
              role="status"
            >
              <span className="toast-message">{toast.message}</span>
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  toast.action.onClick();
                  dismissToast(toast.id);
                }}
              >
                {toast.action.icon}
                {toast.action.label}
              </button>
            </div>
          ) : (
            <button
              key={toast.id}
              type="button"
              className={`toast toast-${toast.type}`}
              onClick={() => dismissToast(toast.id)}
              role="status"
            >
              {toast.message}
            </button>
          )
        )}
      </div>
    </ToastContext.Provider>
  );
}
