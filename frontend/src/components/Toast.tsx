// src/components/Toast.tsx
import React, { useEffect } from 'react';

interface ToastProps {
  message: string;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-3 rounded-lg shadow-xl border border-slate-600 animate-fade-in-out z-50 max-w-[calc(100vw-2rem)]"
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
};

// Add animation to tailwind config if needed (fade-in-out)
