import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import Session from "./Session";
import { QUESTION_RESPONSE_TYPES } from "../constants/questionResponseTypes";

const mockNavigate = jest.fn();

jest.mock("axios", () => ({ get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() }), { virtual: true });
jest.mock(
  "react-router-dom",
  () => ({
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: "1" }),
  }),
  { virtual: true }
);
jest.mock("../components/layout/Header", () => () => <div>Header</div>);
jest.mock("../components/layout/Footer", () => () => <div>Footer</div>);

describe("Session page", () => {
  beforeEach(() => {
    process.env.REACT_APP_API_URL = "http://localhost:3001";
    window.localStorage.setItem("token", "admin-token");
    mockNavigate.mockReset();
    axios.get.mockReset();
    axios.post.mockReset();
    axios.put.mockReset();
    axios.delete.mockReset();
  });

  test("renders fetched questions and groups", async () => {
    axios.get
      .mockResolvedValueOnce({ data: { id: 1, title: "Session 1" } })
      .mockResolvedValueOnce({ data: [{ id: 10, type: "green", response_type: QUESTION_RESPONSE_TYPES.FREE_TEXT, title: "Question A", expected_answer: "A", allocated_time: 30, question_order: 1 }] })
      .mockResolvedValueOnce({ data: [{ id: 12, title: "Question libre" }] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ id: 20, name: "Equipe A", avatar_name: "Pill", avatar_url: "/avatars/Pill.svg" }] });

    render(<Session />);

    expect(await screen.findByText("Session 1")).toBeTruthy();
    expect(screen.getByText("Question A")).toBeTruthy();
    expect(screen.getByText("Equipe A")).toBeTruthy();
  });

  test("creates a new group", async () => {
    axios.get
      .mockResolvedValueOnce({ data: { id: 1, title: "Session 1" } })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });
    axios.post.mockResolvedValueOnce({
      data: {
        id: 21,
        session_id: "1",
        name: "Equipe B",
        description: "Desc",
        avatar_name: "Pill",
        avatar_url: "/avatars/Pill.svg",
      },
    });

    render(<Session />);

    fireEvent.click(await screen.findByRole("button", { name: "Nouveau groupe" }));
    fireEvent.change(screen.getByPlaceholderText("Nom du groupe"), {
      target: { value: "Equipe B" },
    });
    fireEvent.change(screen.getByPlaceholderText("Description du groupe"), {
      target: { value: "Desc" },
    });
    fireEvent.change(screen.getByLabelText("Avatar"), {
      target: { value: "Pill" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Créer" }).closest("form"));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        "http://localhost:3001/sessions/1/groups",
        expect.objectContaining({ name: "Equipe B", avatar_name: "Pill" }),
        { headers: { Authorization: "admin-token" } }
      );
    });
  });

  test("links an existing question to the session", async () => {
    axios.get
      .mockResolvedValueOnce({ data: { id: 1, title: "Session 1" } })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ id: 12, type: "green", title: "Question libre" }] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: { id: 12, type: "green", title: "Question libre" } })
      .mockResolvedValueOnce({ data: { id: 1, title: "Session 1" } })
      .mockResolvedValueOnce({
        data: [
          {
            id: 12,
            type: "green",
            response_type: QUESTION_RESPONSE_TYPES.FREE_TEXT,
            title: "Question libre",
            expected_answer: "Réponse",
            allocated_time: 20,
            question_order: 2,
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });
    axios.post.mockResolvedValueOnce({ data: { success: true } });

    render(<Session />);

    expect(await screen.findByText("Session 1")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Question à lier"), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByPlaceholderText("Order d'apparition"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lier la question" }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        "http://localhost:3001/sessions/1/questions",
        { question_id: "12", question_order: "2" },
        { headers: { Authorization: "admin-token" } }
      );
    });
  });

  test("updates an existing group", async () => {
    axios.get
      .mockResolvedValueOnce({ data: { id: 1, title: "Session 1" } })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ id: 20, name: "Equipe A", avatar_name: "Pill", avatar_url: "/avatars/Pill.svg" }] })
      .mockResolvedValueOnce({
        data: {
          id: 20,
          name: "Equipe A",
          description: "Description A",
          avatar_name: "Pill",
          avatar_url: "/avatars/Pill.svg",
        },
      });
    axios.put.mockResolvedValueOnce({
      data: {
        id: 20,
        name: "Equipe Z",
        description: "Description Z",
        avatar_name: "DNA",
        avatar_url: "/avatars/DNA.svg",
      },
    });

    render(<Session />);

    expect(await screen.findByText("Equipe A")).toBeTruthy();
    fireEvent.click((await screen.findAllByRole("button", { name: "Modifier" }))[0]);

    fireEvent.change(await screen.findByDisplayValue("Equipe A"), {
      target: { value: "Equipe Z" },
    });
    fireEvent.change(screen.getByDisplayValue("Description A"), {
      target: { value: "Description Z" },
    });
    fireEvent.change(screen.getByDisplayValue("Pill"), {
      target: { value: "DNA" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /Mettre à jour/i }).closest("form"));

    await waitFor(() => {
      expect(axios.put).toHaveBeenCalledWith(
        "http://localhost:3001/sessions/1/groups/20",
        expect.objectContaining({
          id: 20,
          name: "Equipe Z",
          description: "Description Z",
          avatar_name: "DNA",
        }),
        { headers: { Authorization: "admin-token" } }
      );
    });
  });

  test("removes a question from the session", async () => {
    axios.get
      .mockResolvedValueOnce({ data: { id: 1, title: "Session 1" } })
      .mockResolvedValueOnce({ data: [{ id: 10, type: "green", response_type: QUESTION_RESPONSE_TYPES.FREE_TEXT, title: "Question A", expected_answer: "A", allocated_time: 30, question_order: 1 }] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });
    axios.delete.mockResolvedValueOnce({ data: { success: true } });

    render(<Session />);

    expect(await screen.findByText("Question A")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));

    await waitFor(() => {
      expect(axios.delete).toHaveBeenCalledWith(
        "http://localhost:3001/sessions/1/questions/10",
        { headers: { Authorization: "admin-token" } }
      );
      expect(screen.queryByText("Question A")).toBeNull();
    });
  });
});
