import "./App.css";
import { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";

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
      setError("Invalid credentials");
    }
  };

  return (
    <>
      <Header />
      <h1>Trivial Chem</h1>
      <div className="login-container">
        <form onSubmit={handleLogin}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit">Login</button>
        </form>
        {error && <p style={{ color: "red" }}>{error}</p>}
      </div>
      {/* <Footer /> */}
    </>
  );
}

export default App;
