import React from 'react';
import { useNavigate } from 'react-router-dom';
import logoFpm from "./logo-fpm-v2.png";
import logoUniversite from "./logo-universite-v2.png";
import "./Header.css";

function Header() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/");
  };

  const isAuthenticated = localStorage.getItem("token");

  return (
    <header>
      <div className="header-left">
        <img
          src={logoUniversite}
          alt="Université Logo"
          className="header-logo header-logo-university"
          onClick={() => navigate("/admin")}
        />
      </div>

      <div className="header-right">
        {isAuthenticated && (
          <button type="button" onClick={handleLogout} className="logout-button">
            Deconnexion
          </button>
        )}
        <img
          src={logoFpm}
          alt="FPM Logo"
          className="header-logo header-logo-fpm"
          onClick={() => navigate("/admin")}
        />
      </div>
    </header>
  );
}

export default Header;
