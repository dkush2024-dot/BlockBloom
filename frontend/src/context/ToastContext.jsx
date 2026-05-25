import { createContext, useContext, useState, useCallback } from "react";

const ToastContext = createContext(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = "info") => {
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto dismiss after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const toastTypeStyles = {
    success: {
      bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
      icon: "🟢",
      glow: "shadow-emerald-500/10",
    },
    error: {
      bg: "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400",
      icon: "🔴",
      glow: "shadow-rose-500/10",
    },
    warning: {
      bg: "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
      icon: "🟡",
      glow: "shadow-amber-500/10",
    },
    info: {
      bg: "bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400",
      icon: "🔵",
      glow: "shadow-indigo-500/10",
    },
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-3 max-w-md w-full pointer-events-none">
        {toasts.map((toast) => {
          const styles = toastTypeStyles[toast.type] || toastTypeStyles.info;
          return (
            <div
              key={toast.id}
              className={`flex items-start gap-3 p-4 rounded-2xl border backdrop-blur-xl ${styles.bg} ${styles.glow} shadow-xl animate-slide-in pointer-events-auto cursor-pointer transition-all duration-300 hover:scale-[1.02]`}
              onClick={() => removeToast(toast.id)}
            >
              <span className="text-lg leading-none">{styles.icon}</span>
              <div className="flex-1 text-sm font-medium pr-2 break-words">
                {toast.message}
              </div>
              <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors leading-none">
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-1rem) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-slide-in {
          animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </ToastContext.Provider>
  );
};
