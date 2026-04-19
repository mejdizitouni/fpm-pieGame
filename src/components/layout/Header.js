import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../i18n/LanguageProvider';
import "./Header.css";

const ACCESSIBILITY_STORAGE_KEY = "app.accessibilityMode";

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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [accessibilityMode, setAccessibilityMode] = useState(
    () => localStorage.getItem(ACCESSIBILITY_STORAGE_KEY) || "default"
  );

  useEffect(() => {
    setIsMenuOpen(false);
  }, [language]);

  useEffect(() => {
    if (!isMenuOpen) {
      setIsSettingsOpen(false);
    }
  }, [isMenuOpen]);

  useEffect(() => {
    document.documentElement.setAttribute("data-accessibility-mode", accessibilityMode);
    localStorage.setItem(ACCESSIBILITY_STORAGE_KEY, accessibilityMode);
  }, [accessibilityMode]);

  const handleNavigate = (path) => {
    setIsMenuOpen(false);
    navigate(path);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setIsMenuOpen(false);
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
  const displayName = useMemo(() => {
    if (!storedUser) {
      return "";
    }

    if (storedUser.username) {
      return storedUser.username;
    }

    const fullName = [storedUser.firstName, storedUser.lastName].filter(Boolean).join(" ").trim();
    if (fullName) {
      return fullName;
    }

    return storedUser.name || storedUser.email || "";
  }, [storedUser]);
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
          alt={t("logoUniversityAlt")}
          className="header-logo header-logo-university"
          onClick={resolvedLogoTarget ? () => handleNavigate(resolvedLogoTarget) : undefined}
        />
      </div>

      <button
        type="button"
        className="menu-toggle"
        aria-label={t("navMenuToggle")}
        aria-controls="header-menu"
        aria-expanded={isMenuOpen}
        onClick={() => setIsMenuOpen((prev) => !prev)}
      >
        <span className="menu-toggle-bar" />
        <span className="menu-toggle-bar" />
        <span className="menu-toggle-bar" />
      </button>

      <div id="header-menu" className={`header-right${isMenuOpen ? " is-open" : ""}`}>
        <div className="header-primary-actions">
          {isAuthenticated && displayName && (
            <p className="header-user">{t("navLoggedInAs")} {displayName}</p>
          )}
          {canShowHomeButton && (
            <button type="button" onClick={() => handleNavigate(resolvedHomePath)} className="nav-button">
              {t("navHome")}
            </button>
          )}
          {canShowAdminButton && (
            <button type="button" onClick={() => handleNavigate(resolvedAdminPath)} className="nav-button">
              {t("navAdmin")}
            </button>
          )}
        </div>

        <div className="header-utility-actions">
          {showLanguagePicker && (
            <div className="settings-menu">
              <button
                type="button"
                className="settings-trigger"
                onClick={() => setIsSettingsOpen((prev) => !prev)}
                aria-expanded={isSettingsOpen}
                aria-controls="header-settings-panel"
              >
                {t("navSettings")}
              </button>

              <div
                id="header-settings-panel"
                className={`settings-panel${isSettingsOpen ? " is-open" : ""}`}
              >
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

                <div className="accessibility-picker">
                  <label htmlFor="app-accessibility" className="accessibility-label">
                    {t("navAccessibilityLabel")}
                  </label>
                  <select
                    id="app-accessibility"
                    className="accessibility-select"
                    value={accessibilityMode}
                    onChange={(event) => setAccessibilityMode(event.target.value)}
                    aria-label={t("navAccessibilityLabel")}
                  >
                    <option value="default">{t("a11yModeDefault")}</option>
                    <option value="monochrome">{t("a11yModeMonochrome")}</option>
                    <option value="high-contrast">{t("a11yModeHighContrast")}</option>
                  </select>
                </div>
              </div>
            </div>
          )}
          {canShowLogout && (
            <button type="button" onClick={handleLogout} className="logout-button">
              {t("navLogout")}
            </button>
          )}
        </div>
      </div>

      <div className="header-brand-right">
        <img
          src="/assets/branding/logo-fpm-v2.png"
          alt={t("logoFpmAlt")}
          className="header-logo header-logo-fpm"
          onClick={resolvedLogoTarget ? () => handleNavigate(resolvedLogoTarget) : undefined}
        />
      </div>
    </header>
  );
}

export default Header;
