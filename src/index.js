import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App"; // Login Page
import Admin from "./Admin"; // Admin Dashboard
import Session from "./Session"; // Session Details
import AdminGameControl from "./AdminGameControl"; // Admin Game Control
import Game from "./Game"; // Group Game Page
import SalesforceLogin from "./SalesforceLogin"; // Group Game Page

ReactDOM.render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/session/:id" element={<Session />} />
      <Route path="/admin/game/:sessionId" element={<AdminGameControl />} />
      <Route path="/game/:sessionId/:groupId" element={<Game />} />
      <Route path="/SalesforceLogin" element={<SalesforceLogin />} />
    </Routes>
  </BrowserRouter>,
  document.getElementById("root")
);
