import { useState } from "react";
import { useLanguage } from "../../i18n/LanguageProvider";

function EyeOpenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M1.5 12s3.8-6.5 10.5-6.5S22.5 12 22.5 12 18.7 18.5 12 18.5 1.5 12 1.5 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function EyeClosedIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M2 12s3.7-6 10-6 10 6 10 6-3.7 6-10 6-10-6-10-6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M3 3l18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PasswordInput({ id, value, onChange, required, minLength, placeholder, autoComplete, name }) {
  const [isVisible, setIsVisible] = useState(false);
  const { t } = useLanguage();

  return (
    <div className="password-input-wrapper">
      <input
        id={id}
        name={name}
        type={isVisible ? "text" : "password"}
        value={value}
        onChange={onChange}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className="password-toggle-button"
        onClick={() => setIsVisible((prev) => !prev)}
        aria-label={isVisible ? t("commonHide") : t("commonShow")}
        title={isVisible ? t("commonHide") : t("commonShow")}
      >
        {isVisible ? <EyeClosedIcon /> : <EyeOpenIcon />}
      </button>
    </div>
  );
}

export default PasswordInput;
