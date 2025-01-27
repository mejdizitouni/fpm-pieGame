import React from 'react';
import { useNavigate } from 'react-router-dom'; // Import useNavigate
import logo from "./logo-fpm.png"
import "./Header.css"; // Import the CSS file for styling

function Header() {
  const navigate = useNavigate(); // Initialize useNavigate hook

  const handleLogout = () => {
    localStorage.removeItem("token"); // Remove token from localStorage
    navigate("/"); // Redirect to the root (login page)
  };

  const isAuthenticated = localStorage.getItem("token"); // Check if authenticated

  return (
    <header>
      <img
        src={logo}
        alt="Game Management"
        onClick={() => navigate("/admin")} // Navigate to /admin on logo click
      />
      {isAuthenticated && (
        <a onClick={handleLogout} className="logout-button">
          Logout
        </a>
      )}
    </header>
  );
}

export default Header;
