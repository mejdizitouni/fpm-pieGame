import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import App from "./App";
import { DEFAULT_LANGUAGE, TRANSLATIONS } from "../i18n/translations";

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
  const tr = TRANSLATIONS[DEFAULT_LANGUAGE];

  beforeEach(() => {
    process.env.REACT_APP_API_URL = "http://localhost:3001";
    mockNavigate.mockReset();
    axios.post.mockReset();
    window.localStorage.clear();
  });

  test("renders login UI", () => {
    render(<App />);

    expect(screen.getByText(tr.loginTitle)).toBeTruthy();
    expect(screen.getByPlaceholderText(tr.loginUsernamePlaceholder)).toBeTruthy();
    expect(screen.getByPlaceholderText(tr.loginPasswordPlaceholder)).toBeTruthy();
    expect(screen.getByRole("button", { name: tr.loginSubmit })).toBeTruthy();
  });

  test("submits credentials and redirects on success", async () => {
    axios.post.mockResolvedValueOnce({ data: { token: "jwt-token" } });

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(tr.loginUsernamePlaceholder), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByPlaceholderText(tr.loginPasswordPlaceholder), {
      target: { value: "WelcomeAdmin2024" },
    });
    fireEvent.click(screen.getByRole("button", { name: tr.loginSubmit }));

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

    fireEvent.change(screen.getByPlaceholderText(tr.loginUsernamePlaceholder), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByPlaceholderText(tr.loginPasswordPlaceholder), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: tr.loginSubmit }));

    expect(await screen.findByText(tr.loginInvalidCredentials)).toBeTruthy();
  });
});
