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
      <div className="header-logos">
        <img
          src={logoFpm}
          alt="FPM Logo"
          className="header-logo"
          onClick={() => navigate("/admin")}
        />
        <img
          src={logoUniversite}
          alt="Université Logo"
          className="header-logo header-logo-university"
        />
      </div>
      {isAuthenticated && (
        <button type="button" onClick={handleLogout} className="logout-button">
          Logout
        </button>
      )}
    </header>
  );
}

export default Header;
