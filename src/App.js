import "./App.css";
import { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";
import logoFpm from "./logo-fpm-v2.png";
import logoUniversite from "./logo-universite-v2.png";

function App() {
  const API_URL = process.env.REACT_APP_API_URL;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

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
          navigate("/admin"); // Token is valid, redirect to admin
        } else {
          localStorage.removeItem("token"); // Remove invalid token
        }
      } catch (err) {
        console.error("Token validation failed:", err.message);
        localStorage.removeItem("token"); // Remove invalid or expired token
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
      navigate("/admin"); // Redirect to /admin after successful login
    } catch (err) {
      setError("Identifiants invalides");
    }
  };

  return (
    <>
      <Header />
      <div className="login-container">
        <div className="login-card">
          <div className="login-brand-logos" aria-hidden="true">
            <img
              src={logoFpm}
              alt="FPM"
              className="login-brand-logo"
              onClick={() => navigate("/admin")}
            />
            <img
              src={logoUniversite}
              alt="Université"
              className="login-brand-logo login-brand-logo-university"
              onClick={() => navigate("/admin")}
            />
          </div>
          <p className="eyebrow">Experience multijoueur en direct</p>
          <h1 className="game-name">Trivial Chem</h1>
          <p className="login-subtitle">
            Connectez votre equipe, lancez les sessions et controlez le jeu en temps reel.
          </p>

          <form className="login" onSubmit={handleLogin}>
            <input
              type="text"
              placeholder="Nom d'utilisateur"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              type="password"
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="submit">Se connecter</button>
          </form>

          <div className="login-meta">
            <p className="login-meta-names">
              Élaboré par : Nesrine Zitouni, Kaouthar Zribi, Sarra Mahfoudhi, Yessin Mokni, Mejdi Zitouni
            </p>
            <p className="login-meta-audience">
              Publique cible : Étudiants en 2ème année du premier cycle des études pharmaceutiques
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
