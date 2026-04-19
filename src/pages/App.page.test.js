import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import App from "./App";

const mockNavigate = jest.fn();

jest.mock("axios", () => ({ post: jest.fn() }), { virtual: true });
jest.mock(
  "react-router-dom",
  () => ({
    useNavigate: () => mockNavigate,
  }),
  { virtual: true }
);
jest.mock("../components/layout/Header", () => () => <div>Header</div>);
jest.mock("../components/layout/Footer", () => () => <div>Footer</div>);

describe("App page", () => {
  beforeEach(() => {
    process.env.REACT_APP_API_URL = "http://localhost:3001";
    mockNavigate.mockReset();
    axios.post.mockReset();
    window.localStorage.clear();
  });

  test("renders login UI", () => {
    render(<App />);

    expect(screen.getByText("Trivial Chem")).toBeTruthy();
    expect(screen.getByPlaceholderText("Nom d'utilisateur")).toBeTruthy();
    expect(screen.getByPlaceholderText("Mot de passe")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Se connecter" })).toBeTruthy();
  });

  test("submits credentials and redirects on success", async () => {
    axios.post.mockResolvedValueOnce({ data: { token: "jwt-token" } });

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText("Nom d'utilisateur"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByPlaceholderText("Mot de passe"), {
      target: { value: "WelcomeAdmin2024" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith("http://localhost:3001/login", {
        username: "admin",
        password: "WelcomeAdmin2024",
      });
      expect(window.localStorage.getItem("token")).toBe("jwt-token");
      expect(mockNavigate).toHaveBeenCalledWith("/admin");
    });
  });

  test("shows login error on failure", async () => {
    axios.post.mockRejectedValueOnce(new Error("Unauthorized"));

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText("Nom d'utilisateur"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByPlaceholderText("Mot de passe"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByText("Identifiants invalides")).toBeTruthy();
  });
});
