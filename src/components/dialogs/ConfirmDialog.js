import "./ConfirmDialog.css";
import { useLanguage } from "../../i18n/LanguageProvider";

export default function ConfirmDialog({ message, confirmLabel, cancelLabel, onConfirm, onCancel, danger = false }) {
  const { t } = useLanguage();
  const resolvedConfirmLabel = confirmLabel || t("commonConfirm");
  const resolvedCancelLabel = cancelLabel || t("commonCancel");

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="confirm-btn confirm-cancel" onClick={onCancel}>
            {resolvedCancelLabel}
          </button>
          <button
            className={`confirm-btn confirm-ok${danger ? " confirm-danger" : ""}`}
            onClick={onConfirm}
          >
            {resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
