import "./App.css";
import { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";
import { useLanguage } from "../i18n/LanguageProvider";

function App() {
  const API_URL = process.env.REACT_APP_API_URL;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMessage, setForgotMessage] = useState("");
  const [forgotError, setForgotError] = useState("");
  const navigate = useNavigate();
  const { t } = useLanguage();

  // Check token validity on component mount
  useEffect(() => {
    const checkTokenValidity = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        return; // No token means no need to validate
      }

      try {
        const response = await axios.post(`${API_URL}/verify-token`, {
          token,
        });
        if (response.data.valid) {
          if (response.data.user) {
            localStorage.setItem("user", JSON.stringify(response.data.user));
          }
          navigate("/admin"); // Token is valid, redirect to admin
        } else {
          localStorage.removeItem("token"); // Remove invalid token
          localStorage.removeItem("user");
        }
      } catch (err) {
        console.error("Token validation failed:", err.message);
        localStorage.removeItem("token"); // Remove invalid or expired token
        localStorage.removeItem("user");
      }
    };

    checkTokenValidity();
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      const response = await axios.post(`${API_URL}/login`, {
        username,
        password,
      });
      localStorage.setItem("token", response.data.token); // Save JWT in local storage
      if (response.data.user) {
        localStorage.setItem("user", JSON.stringify(response.data.user));
      }
      navigate("/admin"); // Redirect to /admin after successful login
    } catch (err) {
      setError(t("loginInvalidCredentials"));
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotError("");
    setForgotMessage("");

    try {
      const response = await axios.post(`${API_URL}/forgot-password`, {
        email: forgotEmail,
      });

      const message = response.data?.resetLink
        ? `${response.data.message} ${response.data.resetLink}`
        : response.data?.message || "Reset link generated.";
      setForgotMessage(message);
    } catch (err) {
      setForgotError(err?.response?.data?.message || "Failed to generate reset link");
    }
  };

  return (
    <>
      <Header />
      <div className="login-container">
        <div className="login-card">
          <div className="login-brand-logos" aria-hidden="true">
            <img
              src="/assets/branding/logo-fpm-v2.png"
              alt="FPM"
              className="login-brand-logo"
              onClick={() => navigate("/admin")}
            />
            <img
              src="/assets/branding/logo-universite-v2.png"
              alt="Université"
              className="login-brand-logo login-brand-logo-university"
              onClick={() => navigate("/admin")}
            />
          </div>
          <div className="login-hero-row">
            <div className="login-hero-copy">
              <p className="eyebrow">{t("loginEyebrow")}</p>
              <h1 className="game-name">Trivial Chem</h1>
              <p className="login-subtitle">{t("loginSubtitle")}</p>
            </div>
            <img
              src="/assets/icons/pills.svg"
              alt=""
              className="login-hero-camembert"
              aria-hidden="true"
            />
          </div>

          <form className="login" onSubmit={handleLogin}>
            <label htmlFor="login-username">{t("loginUsernameLabel")}</label>
            <input
              id="login-username"
              type="text"
              placeholder={t("loginUsernamePlaceholder")}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <label htmlFor="login-password">{t("loginPasswordLabel")}</label>
            <input
              id="login-password"
              type="password"
              placeholder={t("loginPasswordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="submit">{t("loginSubmit")}</button>
            <button
              className="forgot-password-link"
              type="button"
              onClick={() => setShowForgotPassword((prev) => !prev)}
            >
              Forgot password?
            </button>
          </form>

          {showForgotPassword && (
            <form className="login forgot-password-form" onSubmit={handleForgotPassword}>
              <label htmlFor="forgot-password-email">Account email</label>
              <input
                id="forgot-password-email"
                type="email"
                placeholder="email@example.com"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
              />
              <button type="submit">Send reset link</button>
            </form>
          )}

          {forgotMessage && <p className="login-success">{forgotMessage}</p>}
          {forgotError && <p className="login-error">{forgotError}</p>}

          <div className="login-meta">
            <p className="login-meta-names">
              {t("loginBuiltBy")}
            </p>
            <p className="login-meta-audience">
              {t("loginTargetAudience")}
            </p>
            <p className="login-meta-tech">
              {t("loginTools")}
            </p>
          </div>

          {error && <p className="login-error">{error}</p>}
        </div>
      </div>
      <Footer />
    </>
  );
}

export default App;
