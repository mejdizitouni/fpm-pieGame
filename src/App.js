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

  // Check if the user is already authenticated
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      // If a token exists, redirect to the admin page
      navigate("/admin");
    }
  }, [navigate]); // This will run once when the component is mounted

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
      <Footer />
    </>
  );
}

export default App;
