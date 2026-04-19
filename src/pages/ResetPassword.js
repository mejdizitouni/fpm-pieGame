import { useMemo, useState } from "react";
import axios from "axios";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";
import { useLanguage } from "../i18n/LanguageProvider";
import "./App.css";

function ResetPassword() {
  const API_URL = process.env.REACT_APP_API_URL;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);
  const { t } = useLanguage();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!token) {
      setError(t("resetTokenMissing"));
      return;
    }

    if (newPassword.length < 8) {
      setError(t("resetPasswordTooShort"));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t("resetPasswordMismatch"));
      return;
    }

    try {
      await axios.post(`${API_URL}/reset-password`, {
        token,
        newPassword,
      });
      setSuccess(t("resetSuccess"));
      setTimeout(() => navigate("/"), 1200);
    } catch (err) {
      setError(err?.response?.data?.message || t("resetErrorFallback"));
    }
  };

  return (
    <>
      <Header />
      <div className="login-container">
        <div className="login-card">
          <h1 className="game-name">{t("resetTitle")}</h1>
          <p className="login-subtitle">{t("resetSubtitle")}</p>

          <form className="login" onSubmit={handleSubmit}>
            <label htmlFor="new-password">{t("resetNewPasswordLabel")}</label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />

            <label htmlFor="confirm-password">{t("resetConfirmPasswordLabel")}</label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />

            <button type="submit">{t("resetSubmit")}</button>
          </form>

          {error && <p className="login-error">{error}</p>}
          {success && <p className="login-success">{success}</p>}
        </div>
      </div>
      <Footer />
    </>
  );
}

export default ResetPassword;
