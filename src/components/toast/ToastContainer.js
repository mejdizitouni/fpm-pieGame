import { useState, useEffect } from "react";
import { toastEmitter } from "./toast";
import { useLanguage } from "../../i18n/LanguageProvider";
import "./Toast.css";

export default function ToastContainer() {
  const { t } = useLanguage();
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const unsub = toastEmitter.subscribe(({ id, message, type, duration = 3000 }) => {
      setToasts((prev) => [...prev, { id, message, type, duration, visible: true }]);
      setTimeout(() => {
        setToasts((prev) =>
          prev.map((t) => (t.id === id ? { ...t, visible: false } : t))
        );
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 350);
      }, duration);
    });
    return unsub;
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.type} ${t.visible ? "toast-enter" : "toast-exit"}`}
          role="alert"
        >
          <span className="toast-icon">
            {t.type === "success" ? "✓" : t.type === "error" ? "✕" : t.type === "warning" ? "⚠" : "ℹ"}
          </span>
          <span className="toast-message">{t.message}</span>
          <button
            className="toast-close"
            onClick={() =>
              setToasts((prev) => prev.filter((x) => x.id !== t.id))
            }
            aria-label={t("toastCloseAria")}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
