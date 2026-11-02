import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

interface ToastContextType {
  showToast: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

interface ToastProviderProps {
  children: React.ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [message, setMessage] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string, duration = 2000) => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }

    setMessage(msg);
    setIsVisible(true);

    timerRef.current = window.setTimeout(() => {
      setIsVisible(false);
      window.setTimeout(() => setMessage(null), 250);
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {message && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 max-w-[340px] w-auto px-4 py-2.5 rounded-lg bg-[#1B1F2A]/90 text-white text-sm font-medium shadow-lg backdrop-blur-sm transition-all duration-200 pointer-events-none text-center ${
            isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-95'
          }`}
        >
          {message}
        </div>
      )}
    </ToastContext.Provider>
  );
};

export default ToastProvider;
