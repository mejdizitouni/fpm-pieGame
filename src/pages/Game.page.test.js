import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Game from "./Game";

window.alert = jest.fn();

jest.mock(
  "react-router-dom",
  () => ({
    useParams: () => ({ sessionId: "1", groupId: "10" }),
    useLocation: () => ({ search: "" }),
    useNavigate: () => jest.fn(),
  }),
  { virtual: true }
);
jest.mock(
  "socket.io-client",
  () => {
    const handlers = {};
    const socket = {
      connected: true,
      on: jest.fn((event, callback) => {
        handlers[event] = callback;
      }),
      off: jest.fn((event) => {
        delete handlers[event];
      }),
      emit: jest.fn(),
    };

    globalThis.__GAME_SOCKET_MOCK__ = { socket, handlers };

    return { io: jest.fn(() => socket) };
  },
  { virtual: true }
);
jest.mock("canvas-confetti", () => jest.fn(), { virtual: true });
jest.mock("../components/charts/PieChart", () => () => <div>PieChart</div>);

describe("Game page", () => {
  beforeEach(() => {
    const { socket, handlers } = globalThis.__GAME_SOCKET_MOCK__;
    process.env.REACT_APP_API_URL = "http://localhost:3001";
    socket.on.mockClear();
    socket.off.mockClear();
    socket.emit.mockClear();
    Object.keys(handlers).forEach((key) => delete handlers[key]);
    global.fetch = jest.fn((url, options = {}) => {
      if (url.endsWith("/sessions/1") && (!options.method || options.method === "GET")) {
        return Promise.resolve({ ok: true, json: async () => ({ id: 1, status: "Activated", session_rules: "Règles", green_questions_label: "Flash", red_questions_label: "Calcul" }) });
      }
      if (url.endsWith("/sessions/1/camemberts")) {
        return Promise.resolve({ ok: true, json: async () => [{ group_id: 10, name: "Equipe A", avatar_url: "/avatars/Pill.svg", red_triangles: 0, green_triangles: 0 }] });
      }
      if (url.endsWith("/sessions/1/groups/10")) {
        return Promise.resolve({ ok: true, json: async () => ({ id: 10, name: "Equipe A", avatar_url: "/avatars/Pill.svg" }) });
      }
      if (url.endsWith("/sessions/1/player-runtime-state/10")) {
        return Promise.resolve({ ok: true, json: async () => ({ status: "Activated", currentQuestion: null, timer: 0, questionIndex: 0, totalQuestions: 0, winners: [], submittedAnswer: null }) });
      }
      if (url.endsWith("/questions/55/options")) {
        return Promise.resolve({ ok: true, json: async () => [{ id: 1, option_text: "4" }, { id: 2, option_text: "5" }] });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  afterEach(() => {
    delete global.fetch;
  });

  test("shows waiting state before questions start", async () => {
    const { socket } = globalThis.__GAME_SOCKET_MOCK__;
    render(<Game />);

    expect((await screen.findAllByText("Equipe A")).length).toBeGreaterThan(0);
    expect(screen.getByText("En attente du démarrage")).toBeTruthy();
    expect(socket.emit).toHaveBeenCalledWith("joinSession", {
      sessionId: "1",
      groupId: "10",
      role: "player",
    });
  });

  test("submits an answer after receiving a realtime question", async () => {
    const { socket } = globalThis.__GAME_SOCKET_MOCK__;
    render(<Game />);

    expect((await screen.findAllByText("Equipe A")).length).toBeGreaterThan(0);
    let newQuestionHandler;
    await waitFor(() => {
      newQuestionHandler = socket.on.mock.calls.find(
        ([eventName]) => eventName === "newQuestion"
      )?.[1];
      expect(typeof newQuestionHandler).toBe("function");
    });

    await newQuestionHandler({
      question: {
        id: 55,
        type: "red",
        title: "2 + 2 = ?",
        expected_answer: "4",
        allocated_time: 30,
        response_type: "Question à choix unique",
      },
      timer: 30,
      questionIndex: 1,
      totalQuestions: 10,
    });

    fireEvent.click(await screen.findByDisplayValue("4"));
    fireEvent.click(screen.getByRole("button", { name: "Soumettre la réponse" }));

    await waitFor(() => {
      expect(socket.emit).toHaveBeenCalledWith("submitAnswer", {
        sessionId: "1",
        groupId: "10",
        questionId: 55,
        answer: "4",
        stoppedTimer: false,
      });
    });
  });
});
