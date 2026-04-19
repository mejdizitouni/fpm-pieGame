import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./styles/index.css";
import App from "./pages/App"; // Login Page
import Admin from "./pages/Admin"; // Admin Dashboard
import Session from "./pages/Session"; // Session Details
import AdminGameControl from "./pages/AdminGameControl"; // Admin Game Control
import Game from "./pages/Game"; // Group Game Page
import ToastContainer from "./components/toast/ToastContainer";

const globalBackdropStyle = {
  backgroundImage: `linear-gradient(rgba(15, 118, 110, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(15, 118, 110, 0.04) 1px, transparent 1px), url(${process.env.PUBLIC_URL}/assets/patterns/pharmacy-pattern.svg)`,
};

ReactDOM.render(
  <BrowserRouter>
    <div className="global-backdrop" style={globalBackdropStyle} aria-hidden="true" />
    <ToastContainer />
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/session/:id" element={<Session />} />
      <Route path="/admin/game/:sessionId" element={<AdminGameControl />} />
      <Route path="/game/:sessionId/:groupId" element={<Game />} />
    </Routes>
  </BrowserRouter>,
  document.getElementById("root")
);
