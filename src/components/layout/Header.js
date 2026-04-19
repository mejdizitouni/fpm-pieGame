import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../i18n/LanguageProvider';
import "./Header.css";

const decodeJwtPayload = (token) => {
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) {
      return null;
    }

    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((ch) => `%${`00${ch.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join("")
    );

    return JSON.parse(jsonPayload);
  } catch (_error) {
    return null;
  }
};

function Header({
  showHomeButton = true,
  showAdminButton = true,
  showLanguagePicker = true,
  showLogoutButton,
  homePath,
  adminPath,
  logoTargetPath,
}) {
  const navigate = useNavigate();
  const { language, setLanguage, t, languages } = useLanguage();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/");
  };

  const token = localStorage.getItem("token");
  const isAuthenticated = Boolean(token);
  const storedUser = (() => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch (_error) {
      return null;
    }
  })();
  const roleFromToken = token ? decodeJwtPayload(token)?.role : null;
  const isAdmin = (storedUser?.role || roleFromToken) === "Admin";
  const canShowHomeButton = showHomeButton && isAuthenticated;
  const canShowAdminButton = showAdminButton && isAuthenticated && isAdmin;
  const canShowLogout =
    typeof showLogoutButton === "boolean" ? showLogoutButton : Boolean(isAuthenticated);
  const resolvedHomePath =
    typeof homePath === "undefined"
      ? isAuthenticated
        ? "/admin?view=sessions"
        : "/"
      : homePath;
  const resolvedAdminPath =
    typeof adminPath === "undefined"
      ? isAuthenticated
        ? "/admin?view=users"
        : "/admin"
      : adminPath;
  const resolvedLogoTarget =
    typeof logoTargetPath === "undefined" ? resolvedHomePath : logoTargetPath;

  return (
    <header>
      <div className="header-left">
        <img
          src="/assets/branding/logo-universite-v2.png"
          alt="Université Logo"
          className="header-logo header-logo-university"
          onClick={resolvedLogoTarget ? () => navigate(resolvedLogoTarget) : undefined}
        />
      </div>

      <div className="header-right">
        {canShowHomeButton && (
          <button type="button" onClick={() => navigate(resolvedHomePath)} className="nav-button">
            {t("navHome")}
          </button>
        )}
        {canShowAdminButton && (
          <button type="button" onClick={() => navigate(resolvedAdminPath)} className="nav-button">
            {t("navAdmin")}
          </button>
        )}
        {showLanguagePicker && (
          <div className="language-picker">
            <label htmlFor="app-language" className="language-label">
              {t("navLanguageLabel")}
            </label>
            <select
              id="app-language"
              className="language-select"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              aria-label={t("navLanguageAria")}
            >
              {languages.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {canShowLogout && (
          <button type="button" onClick={handleLogout} className="logout-button">
            {t("navLogout")}
          </button>
        )}
        <img
          src="/assets/branding/logo-fpm-v2.png"
          alt="FPM Logo"
          className="header-logo header-logo-fpm"
          onClick={resolvedLogoTarget ? () => navigate(resolvedLogoTarget) : undefined}
        />
      </div>
    </header>
  );
}

export default Header;
