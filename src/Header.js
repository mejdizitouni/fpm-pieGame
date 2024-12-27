import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom'; // Import useNavigate
import logo from './assets/logo-fpm.png';

function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate(); // Initialize useNavigate hook

  const handleLogout = () => {
    localStorage.removeItem("token"); // Remove token from localStorage
    navigate("/"); // Redirect to the root (login page)
  };

  const isAuthenticated = localStorage.getItem("token"); // Check if authenticated

  return (
    <header>
      <img src={logo} alt="Game Management" />
      {isAuthenticated && (
        <div>
          <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="burger-menu">
            &#9776; {/* Hamburger icon */}
          </button>
          {isMenuOpen && (
            <div className="dropdown-menu">
              <button onClick={handleLogout}>Logout</button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}

export default Header;
