import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import Admin from "./Admin";

const mockNavigate = jest.fn();

jest.mock("axios", () => ({ get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() }), { virtual: true });
jest.mock(
  "react-router-dom",
  () => ({
    useNavigate: () => mockNavigate,
    useLocation: () => ({ search: "" }),
  }),
  { virtual: true }
);
jest.mock("../components/layout/Header", () => () => <div>Header</div>);
jest.mock("../components/layout/Footer", () => () => <div>Footer</div>);
jest.mock("../components/dialogs/ConfirmDialog", () => (props) => (
  <div>
    <span>{props.message}</span>
    <button onClick={props.onConfirm}>Confirmer</button>
    <button onClick={props.onCancel}>Annuler</button>
  </div>
));
jest.mock("../components/toast/toast", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  },
}));

describe("Admin page", () => {
  beforeEach(() => {
    process.env.REACT_APP_API_URL = "http://localhost:3001";
    window.localStorage.setItem("token", "admin-token");
    mockNavigate.mockReset();
    axios.get.mockReset();
    axios.post.mockReset();
    axios.put.mockReset();
    axios.delete.mockReset();
  });

  test("loads and displays sessions", async () => {
    axios.get
      .mockResolvedValueOnce({ data: { message: "ok" } })
      .mockResolvedValueOnce({
        data: [
          {
            id: 1,
            title: "Session Alpha",
            green_questions_label: "Flash",
            red_questions_label: "Calcul",
            date: "2026-04-19",
            status: "Draft",
          },
        ],
      });

    render(<Admin />);

    expect(await screen.findByText("Session Alpha")).toBeTruthy();
    expect(screen.getByText("Sessions de jeu")).toBeTruthy();
  });

  test("creates a new session from the form", async () => {
    axios.get
      .mockResolvedValueOnce({ data: { message: "ok" } })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [
          {
            id: 2,
            title: "Session Beta",
            green_questions_label: "Vert",
            red_questions_label: "Rouge",
            date: "2026-04-19",
            status: "Draft",
          },
        ],
      });
    axios.post.mockResolvedValueOnce({ data: { id: 2, title: "Session Beta", date: "2026-04-19" } });

    render(<Admin />);

    fireEvent.click(await screen.findByRole("button", { name: "Créer une nouvelle session" }));
    fireEvent.change(screen.getByPlaceholderText("Nom"), {
      target: { value: "Session Beta" },
    });
    fireEvent.change(screen.getByPlaceholderText("Catégorie 1"), {
      target: { value: "Vert" },
    });
    fireEvent.change(screen.getByPlaceholderText("Catégorie 2"), {
      target: { value: "Rouge" },
    });
    fireEvent.change(document.querySelector('input[type="date"]'), {
      target: { value: "2026-04-19" },
    });
    fireEvent.change(screen.getByPlaceholderText("Règles du jeu"), {
      target: { value: "Règles de test" },
    });

    fireEvent.submit(screen.getByRole("button", { name: /Créer la session/i }).closest("form"));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        "http://localhost:3001/game-sessions",
        expect.objectContaining({ title: "Session Beta" }),
        { headers: { Authorization: "admin-token" } }
      );
      expect(screen.getByText("Session Beta")).toBeTruthy();
    });
  });

  test("activates a draft session and displays generated links", async () => {
    axios.get
      .mockResolvedValueOnce({ data: { message: "ok" } })
      .mockResolvedValueOnce({
        data: [
          {
            id: 3,
            title: "Session Gamma",
            green_questions_label: "Vert",
            red_questions_label: "Rouge",
            date: "2026-04-19",
            status: "Draft",
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 3,
            title: "Session Gamma",
            green_questions_label: "Vert",
            red_questions_label: "Rouge",
            date: "2026-04-19",
            status: "Activated",
          },
        ],
      });
    axios.post.mockResolvedValueOnce({
      data: {
        updatedGroups: [
          {
            id: 31,
            name: "Equipe Gamma",
            session_id: 3,
            join_url: "http://localhost/game/3/31?lang=fr",
          },
        ],
      },
    });

    render(<Admin />);

    expect(await screen.findByText("Session Gamma")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Actions"));
    fireEvent.click(await screen.findByRole("button", { name: /Activer/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        "http://localhost:3001/sessions/3/activate",
        {},
        { headers: { Authorization: "admin-token" } }
      );
      expect(screen.getByText("Liens joueurs")).toBeTruthy();
      expect(
        screen.getByRole("link", { name: "http://localhost/game/3/31?lang=fr" })
      ).toBeTruthy();
    });
  });

  test("edits an existing session", async () => {
    axios.get
      .mockResolvedValueOnce({ data: { message: "ok" } })
      .mockResolvedValueOnce({
        data: [
          {
            id: 4,
            title: "Session Delta",
            green_questions_label: "Flash",
            red_questions_label: "Calcul",
            date: "2026-04-19",
            session_rules: "Anciennes règles",
            status: "Draft",
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 4,
            title: "Session Delta Modifiée",
            green_questions_label: "Flash+",
            red_questions_label: "Calcul+",
            date: "2026-04-20",
            session_rules: "Nouvelles règles",
            status: "Draft",
          },
        ],
      });
    axios.put.mockResolvedValueOnce({
      data: {
        id: 4,
        title: "Session Delta Modifiée",
        green_questions_label: "Flash+",
        red_questions_label: "Calcul+",
        date: "2026-04-20",
        session_rules: "Nouvelles règles",
        status: "Draft",
      },
    });

    render(<Admin />);

    expect(await screen.findByText("Session Delta")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Actions"));
    fireEvent.click(await screen.findByRole("button", { name: /Modifier/i }));

    fireEvent.change(screen.getByPlaceholderText("Nom"), {
      target: { value: "Session Delta Modifiée" },
    });
    fireEvent.change(screen.getByPlaceholderText("Catégorie 1"), {
      target: { value: "Flash+" },
    });
    fireEvent.change(screen.getByPlaceholderText("Catégorie 2"), {
      target: { value: "Calcul+" },
    });
    fireEvent.change(document.querySelector('input[type="date"]'), {
      target: { value: "2026-04-20" },
    });
    fireEvent.change(screen.getByPlaceholderText("Règles du jeu"), {
      target: { value: "Nouvelles règles" },
    });

    fireEvent.submit(screen.getByRole("button", { name: /Mettre à jour/i }).closest("form"));

    await waitFor(() => {
      expect(axios.put).toHaveBeenCalledWith(
        "http://localhost:3001/sessions/4",
        expect.objectContaining({
          title: "Session Delta Modifiée",
          green_questions_label: "Flash+",
          red_questions_label: "Calcul+",
        }),
        { headers: { Authorization: "admin-token" } }
      );
      expect(screen.getByText("Session Delta Modifiée")).toBeTruthy();
    });
  });

  test("deletes a session after confirmation", async () => {
    axios.get
      .mockResolvedValueOnce({ data: { message: "ok" } })
      .mockResolvedValueOnce({
        data: [
          {
            id: 5,
            title: "Session Epsilon",
            green_questions_label: "Vert",
            red_questions_label: "Rouge",
            date: "2026-04-19",
            status: "Draft",
          },
        ],
      });
    axios.delete.mockResolvedValueOnce({ data: { success: true } });

    render(<Admin />);

    expect(await screen.findByText("Session Epsilon")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Actions"));
    fireEvent.click(await screen.findByRole("button", { name: /Supprimer/i }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));

    await waitFor(() => {
      expect(axios.delete).toHaveBeenCalledWith(
        "http://localhost:3001/sessions/5",
        { headers: { Authorization: "admin-token" } }
      );
      expect(screen.queryByText("Session Epsilon")).toBeNull();
    });
  });
});
