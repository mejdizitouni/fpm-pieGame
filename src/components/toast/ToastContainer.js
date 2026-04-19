import { useState, useEffect } from "react";
import { toastEmitter } from "./toast";
import { useLanguage } from "../../i18n/LanguageProvider";
import { DEFAULT_LANGUAGE, TRANSLATIONS } from "../../i18n/translations";
import "./Toast.css";

export default function ToastContainer() {
  const { language } = useLanguage();
  const [toasts, setToasts] = useState([]);
  const closeToastAriaLabel =
    TRANSLATIONS[language]?.toastCloseAria ??
    TRANSLATIONS[DEFAULT_LANGUAGE]?.toastCloseAria ??
    "Close notification";

  useEffect(() => {
    const unsub = toastEmitter.subscribe(({ id, message, type, duration = 3000 }) => {
      setToasts((prev) => [...prev, { id, message, type, duration, visible: true }]);
      setTimeout(() => {
        setToasts((prev) =>
            prev.map((toastItem) =>
              toastItem.id === id ? { ...toastItem, visible: false } : toastItem
            )
        );
        setTimeout(() => {
            setToasts((prev) => prev.filter((toastItem) => toastItem.id !== id));
        }, 350);
      }, duration);
    });
    return unsub;
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((toastItem) => (
        <div
          key={toastItem.id}
          className={`toast toast-${toastItem.type} ${toastItem.visible ? "toast-enter" : "toast-exit"}`}
          role="alert"
        >
          <span className="toast-icon">
            {toastItem.type === "success"
              ? "✓"
              : toastItem.type === "error"
                ? "✕"
                : toastItem.type === "warning"
                  ? "⚠"
                  : "ℹ"}
          </span>
          <span className="toast-message">{toastItem.message}</span>
          <button
            className="toast-close"
            onClick={() =>
              setToasts((prev) => prev.filter((x) => x.id !== toastItem.id))
            }
            aria-label={closeToastAriaLabel}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
