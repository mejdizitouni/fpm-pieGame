const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { io: createClient } = require("socket.io-client");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key";

const testDbPath = path.join(__dirname, "users.test.db");
process.env.DB_PATH = testDbPath;

const db = require("../../database");
const { server } = require("../../server");

let baseUrl = "";
let authToken = "";

const parseJson = async (response) => {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  return response.json();
};

const request = async (pathname, options = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const payload = await parseJson(response);
  return { response, payload };
};

const createAuthorizedHeaders = (extraHeaders = {}) => ({
  Authorization: authToken,
  "Content-Type": "application/json",
  ...extraHeaders,
});

const createSession = async (overrides = {}) => {
  const sessionPayload = {
    title: `Session ${Date.now()}${Math.random()}`,
    green_questions_label: "Green",
    red_questions_label: "Red",
    date: "2026-04-19",
    session_rules: "Rules",
    ...overrides,
  };

  const { response, payload } = await request("/game-sessions", {
    method: "POST",
    headers: createAuthorizedHeaders(),
    body: JSON.stringify(sessionPayload),
  });

  assert.equal(response.status, 200);
  return payload;
};

const createGroup = async (sessionId, overrides = {}) => {
  const groupPayload = {
    name: `Group ${Date.now()}${Math.random()}`,
    description: "Test group",
    avatar_name: "Pill",
    ...overrides,
  };

  const { response, payload } = await request(`/sessions/${sessionId}/groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(groupPayload),
  });

  assert.equal(response.status, 200);
  return payload;
};

const createQuestion = async (overrides = {}) => {
  const questionPayload = {
    type: "green",
    response_type: "Réponse libre",
    title: `Question ${Date.now()}${Math.random()}`,
    expected_answer: "Expected",
    allocated_time: 30,
    ...overrides,
  };

  const { response, payload } = await request("/questions", {
    method: "POST",
    headers: createAuthorizedHeaders(),
    body: JSON.stringify(questionPayload),
  });

  assert.equal(response.status, 200);
  return payload;
};

const linkQuestion = async (sessionId, questionId, questionOrder = 1) => {
  const { response, payload } = await request(`/sessions/${sessionId}/questions`, {
    method: "POST",
    headers: createAuthorizedHeaders(),
    body: JSON.stringify({ question_id: questionId, question_order: questionOrder }),
  });

  assert.equal(response.status, 200);
  return payload;
};

const nextEvent = (socket, eventName) =>
  new Promise((resolve) => {
    socket.once(eventName, resolve);
  });

const waitForCondition = async (condition, timeoutMs = 2000, intervalMs = 50) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await condition();
    if (result) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Timed out waiting for condition");
};

test.before(async () => {
  await db.ready;

  await new Promise((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;

  const loginResponse = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "WelcomeAdmin2024" }),
  });

  const loginPayload = await parseJson(loginResponse);
  authToken = loginPayload.token;
});

test.after(async () => {
  await new Promise((resolve) => {
    server.close(resolve);
  });

  await new Promise((resolve) => {
    db.close(resolve);
  });

  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

test("POST /login rejects invalid credentials", async () => {
  const response = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "wrong-password" }),
  });

  const payload = await parseJson(response);
  assert.equal(response.status, 401);
  assert.equal(payload.message, "Invalid credentials");
});

test("POST /login returns JWT for valid credentials", async () => {
  const response = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "WelcomeAdmin2024" }),
  });

  const payload = await parseJson(response);
  assert.equal(response.status, 200);
  assert.ok(payload.token);
});

test("GET /game-sessions returns created sessions for authenticated admin", async () => {
  const created = await createSession({ title: "Session listing" });
  const { response, payload } = await request("/game-sessions", {
    headers: { Authorization: authToken },
  });

  assert.equal(response.status, 200);
  assert.ok(payload.some((session) => Number(session.id) === Number(created.id)));
});

test("session CRUD and group/question linking routes work end-to-end", async () => {
  const createdSession = await createSession({
    title: "Integration Session",
    green_questions_label: "Flash",
    red_questions_label: "Calcul",
  });

  const sessionId = createdSession.id;

  const createdGroup = await createGroup(sessionId, {
    name: "Equipe Test",
    description: "Description groupe",
    avatar_name: "Capsule",
  });

  const createdQuestion = await createQuestion({
    type: "red",
    response_type: "Question à choix unique",
    title: "Combien font 2 + 2 ?",
    expected_answer: "4",
    allocated_time: 45,
  });

  await linkQuestion(sessionId, createdQuestion.id, 3);

  const optionsResponse = await request(`/questions/${createdQuestion.id}/options`, {
    method: "POST",
    headers: createAuthorizedHeaders(),
    body: JSON.stringify({ options: ["3", "4", "5"] }),
  });

  assert.equal(optionsResponse.response.status, 200);

  const fetchedSession = await request(`/sessions/${sessionId}`);
  assert.equal(fetchedSession.response.status, 200);
  assert.equal(fetchedSession.payload.title, "Integration Session");

  const fetchedGroups = await request(`/sessions/${sessionId}/groups`, {
    headers: { Authorization: authToken },
  });
  assert.equal(fetchedGroups.response.status, 200);
  assert.ok(fetchedGroups.payload.some((group) => Number(group.id) === Number(createdGroup.id)));

  const fetchedGroup = await request(`/sessions/${sessionId}/groups/${createdGroup.id}`);
  assert.equal(fetchedGroup.response.status, 200);
  assert.equal(fetchedGroup.payload.name, "Equipe Test");

  const fetchedQuestions = await request(`/sessions/${sessionId}/questions`, {
    headers: { Authorization: authToken },
  });
  assert.equal(fetchedQuestions.response.status, 200);
  assert.ok(
    fetchedQuestions.payload.some(
      (question) => Number(question.id) === Number(createdQuestion.id)
    )
  );

  const availableQuestions = await request(`/sessions/${sessionId}/available-questions`, {
    headers: { Authorization: authToken },
  });
  assert.equal(availableQuestions.response.status, 200);
  assert.ok(
    availableQuestions.payload.every(
      (question) => Number(question.id) !== Number(createdQuestion.id)
    )
  );

  const updateGroup = await request(`/sessions/${sessionId}/groups/${createdGroup.id}`, {
    method: "PUT",
    headers: createAuthorizedHeaders(),
    body: JSON.stringify({
      name: "Equipe Updatee",
      description: "Nouvelle description",
      avatar_name: "DNA",
    }),
  });
  assert.equal(updateGroup.response.status, 200);
  assert.equal(updateGroup.payload.name, "Equipe Updatee");

  const updateQuestion = await request(
    `/sessions/${sessionId}/questions/${createdQuestion.id}`,
    {
      method: "PUT",
      headers: createAuthorizedHeaders(),
      body: JSON.stringify({
        question_order: 5,
        type: "red",
        title: "Question modifiée",
        expected_answer: "4",
        allocated_time: 60,
        question_icon: "/avatars/red.svg",
        options: ["2", "4", "6"],
        response_type: "Question à choix unique",
      }),
    }
  );
  assert.equal(updateQuestion.response.status, 200);

  const fetchedOptions = await waitForCondition(async () => {
    const result = await request(`/questions/${createdQuestion.id}/options`);
    const values = result.payload.map((option) => option.option_text);
    if (values.length === 3) {
      return values;
    }

    return null;
  });
  assert.deepEqual(fetchedOptions, ["2", "4", "6"]);

  const removeQuestion = await request(`/sessions/${sessionId}/questions/${createdQuestion.id}`, {
    method: "DELETE",
    headers: { Authorization: authToken },
  });
  assert.equal(removeQuestion.response.status, 200);

  const deleteGroupResponse = await request(`/sessions/${sessionId}/groups/${createdGroup.id}`, {
    method: "DELETE",
    headers: { Authorization: authToken },
  });
  assert.equal(deleteGroupResponse.response.status, 200);
});

test("GET /sessions/:id/available-questions only includes questions from other sessions", async () => {
  const currentSession = await createSession({ title: "Current Session" });
  const otherSession = await createSession({ title: "Other Session" });

  const currentSessionQuestion = await createQuestion({
    title: `Current session question ${Date.now()}${Math.random()}`,
  });
  await linkQuestion(currentSession.id, currentSessionQuestion.id, 1);

  const otherSessionQuestion = await createQuestion({
    title: `Other session question ${Date.now()}${Math.random()}`,
  });
  await linkQuestion(otherSession.id, otherSessionQuestion.id, 1);

  const orphanQuestion = await createQuestion({
    title: `Orphan question ${Date.now()}${Math.random()}`,
  });

  const { response, payload } = await request(
    `/sessions/${currentSession.id}/available-questions`,
    {
      headers: { Authorization: authToken },
    }
  );

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(payload));
  assert.ok(
    payload.some((question) => Number(question.id) === Number(otherSessionQuestion.id))
  );
  assert.ok(
    payload.every((question) => Number(question.id) !== Number(currentSessionQuestion.id))
  );
  assert.ok(
    payload.every((question) => Number(question.id) !== Number(orphanQuestion.id))
  );
});

test("activate, start, update-points, reset and delete session routes work", async () => {
  const session = await createSession({ title: "Lifecycle Session" });
  const sessionId = session.id;
  const group = await createGroup(sessionId, { name: "Equipe Lifecycle" });
  const question = await createQuestion({ title: "Lifecycle question" });
  await linkQuestion(sessionId, question.id, 1);

  const activateResponse = await request(`/sessions/${sessionId}/activate`, {
    method: "POST",
    headers: { Authorization: authToken },
  });
  assert.equal(activateResponse.response.status, 200);
  assert.ok(
    activateResponse.payload.updatedGroups.some(
      (entry) => Number(entry.id) === Number(group.id) && entry.join_url
    )
  );

  const startResponse = await request(`/sessions/${sessionId}/start`, {
    method: "POST",
    headers: { Authorization: authToken },
  });
  assert.equal(startResponse.response.status, 200);
  assert.equal(startResponse.payload.status, "In Progress");

  const runtimeState = await request(`/sessions/${sessionId}/runtime-state`, {
    headers: { Authorization: authToken },
  });
  assert.equal(runtimeState.response.status, 200);
  assert.equal(runtimeState.payload.status, "In Progress");

  const playerRuntimeState = await request(
    `/sessions/${sessionId}/player-runtime-state/${group.id}`
  );
  assert.equal(playerRuntimeState.response.status, 200);
  assert.equal(playerRuntimeState.payload.status, "In Progress");

  const updatePointsResponse = await request(`/sessions/${sessionId}/update-points`, {
    method: "POST",
    headers: createAuthorizedHeaders(),
    body: JSON.stringify({ groupId: group.id, color: "green", change: 2 }),
  });
  assert.equal(updatePointsResponse.response.status, 200);
  assert.equal(updatePointsResponse.payload.updatedGroup.green_triangles, 2);

  const camemberts = await request(`/sessions/${sessionId}/camemberts`);
  assert.equal(camemberts.response.status, 200);
  assert.ok(
    camemberts.payload.some(
      (entry) => Number(entry.group_id) === Number(group.id) && entry.green_triangles === 2
    )
  );

  const answers = await request(`/sessions/${sessionId}/answers`, {
    headers: { Authorization: authToken },
  });
  assert.equal(answers.response.status, 200);
  assert.ok(Array.isArray(answers.payload));

  const resetResponse = await request(`/sessions/${sessionId}/reset`, {
    method: "POST",
  });
  assert.equal(resetResponse.response.status, 200);
  assert.ok(
    resetResponse.payload.updatedCamemberts.some(
      (entry) => Number(entry.group_id) === Number(group.id) && entry.green_triangles === 0
    )
  );

  const deleteSessionResponse = await request(`/sessions/${sessionId}`, {
    method: "DELETE",
    headers: { Authorization: authToken },
  });
  assert.equal(deleteSessionResponse.response.status, 200);
});

test("socket gameplay flow emits question, answer, validation, reveal and game over events", async () => {
  const session = await createSession({ title: "Socket Session" });
  const sessionId = String(session.id);
  const group = await createGroup(sessionId, { name: "Equipe Socket" });
  const question = await createQuestion({
    type: "green",
    response_type: "Réponse libre",
    title: "Socket question",
    expected_answer: "socket-answer",
    allocated_time: 20,
  });
  await linkQuestion(sessionId, question.id, 1);

  const adminSocket = createClient(baseUrl, {
    transports: ["websocket"],
    forceNew: true,
  });
  const playerSocket = createClient(baseUrl, {
    transports: ["websocket"],
    forceNew: true,
  });

  await Promise.all([
    nextEvent(adminSocket, "connect"),
    nextEvent(playerSocket, "connect"),
  ]);

  adminSocket.emit("joinSession", { sessionId, role: "admin" });
  playerSocket.emit("joinSession", {
    sessionId,
    groupId: String(group.id),
    role: "player",
  });

  const adminQuestion = nextEvent(adminSocket, "newQuestion");
  const playerQuestion = nextEvent(playerSocket, "newQuestion");
  adminSocket.emit("startGame", sessionId);

  const [adminQuestionPayload, playerQuestionPayload] = await Promise.all([
    adminQuestion,
    playerQuestion,
  ]);

  assert.equal(adminQuestionPayload.question.id, question.id);
  assert.equal(playerQuestionPayload.question.id, question.id);

  const answerSubmittedEvent = nextEvent(adminSocket, "answerSubmitted");
  const timerStoppedEvent = nextEvent(adminSocket, "timerStopped");

  playerSocket.emit("submitAnswer", {
    sessionId,
    groupId: String(group.id),
    questionId: String(question.id),
    answer: "socket-answer",
    stoppedTimer: true,
  });

  const answerSubmittedPayload = await answerSubmittedEvent;
  const timerStoppedPayload = await timerStoppedEvent;
  assert.equal(answerSubmittedPayload.answer, "socket-answer");
  assert.equal(timerStoppedPayload.groupName, "Equipe Socket");

  const validatedEvent = nextEvent(adminSocket, "answerValidated");
  const camembertUpdatedEvent = nextEvent(adminSocket, "camembertUpdated");

  adminSocket.emit("validateAnswer", {
    sessionId,
    groupId: String(group.id),
    questionId: String(question.id),
    isCorrect: true,
    stoppedTimer: true,
  });

  const validatedPayload = await validatedEvent;
  const camembertUpdatedPayload = await camembertUpdatedEvent;
  assert.equal(validatedPayload.isCorrect, true);
  assert.ok(
    camembertUpdatedPayload.updatedCamemberts.some(
      (entry) => Number(entry.group_id) === Number(group.id) && entry.green_triangles === 2
    )
  );

  const revealEvent = nextEvent(playerSocket, "revealAnswer");
  adminSocket.emit("revealAnswer", {
    sessionId,
    correctAnswer: "socket-answer",
  });
  const revealPayload = await revealEvent;
  assert.equal(revealPayload, "socket-answer");

  const gameOverEvent = nextEvent(adminSocket, "gameOver");
  adminSocket.emit("nextQuestion", sessionId);
  const gameOverPayload = await gameOverEvent;
  assert.ok(gameOverPayload.winners);

  adminSocket.disconnect();
  playerSocket.disconnect();
});

test("GET /admin-check requires authorization token", async () => {
  const response = await fetch(`${baseUrl}/admin-check`);
  const payload = await parseJson(response);

  assert.equal(response.status, 401);
  assert.equal(payload.message, "Access denied");
});

test("POST /verify-token validates issued token", async () => {
  const loginResponse = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "WelcomeAdmin2024" }),
  });

  const loginPayload = await parseJson(loginResponse);
  assert.equal(loginResponse.status, 200);

  const verifyResponse = await fetch(`${baseUrl}/verify-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: loginPayload.token }),
  });

  const verifyPayload = await parseJson(verifyResponse);
  assert.equal(verifyResponse.status, 200);
  assert.equal(verifyPayload.valid, true);
});

test("admin can activate or deactivate a user and deactivated user cannot login", async () => {
  const username = `teacher_${Date.now()}`;
  const email = `${username}@example.com`;
  const password = "TeacherPass123";

  const createUser = await request("/users", {
    method: "POST",
    headers: createAuthorizedHeaders(),
    body: JSON.stringify({
      firstName: "Teacher",
      lastName: "Account",
      username,
      email,
      password,
      role: "Enseignant",
    }),
  });

  assert.equal(createUser.response.status, 201);
  assert.equal(createUser.payload.is_active, 1);

  const createdUserId = createUser.payload.id;

  const deactivateUser = await request(`/users/${createdUserId}/active`, {
    method: "PATCH",
    headers: createAuthorizedHeaders(),
    body: JSON.stringify({ isActive: false }),
  });

  assert.equal(deactivateUser.response.status, 200);
  assert.equal(deactivateUser.payload.is_active, 0);

  const inactiveLoginResponse = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const inactiveLoginPayload = await parseJson(inactiveLoginResponse);

  assert.equal(inactiveLoginResponse.status, 403);
  assert.equal(inactiveLoginPayload.message, "User account is deactivated");

  const reactivateUser = await request(`/users/${createdUserId}/active`, {
    method: "PATCH",
    headers: createAuthorizedHeaders(),
    body: JSON.stringify({ isActive: true }),
  });

  assert.equal(reactivateUser.response.status, 200);
  assert.equal(reactivateUser.payload.is_active, 1);

  const activeLoginResponse = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const activeLoginPayload = await parseJson(activeLoginResponse);

  assert.equal(activeLoginResponse.status, 200);
  assert.ok(activeLoginPayload.token);
});

test("session list returns creator and last modifier metadata", async () => {
  const createdSession = await createSession({ title: "Audit Metadata Session" });

  const sessionsResponse = await request("/game-sessions", {
    headers: { Authorization: authToken },
  });

  assert.equal(sessionsResponse.response.status, 200);
  const matchedSession = sessionsResponse.payload.find(
    (session) => Number(session.id) === Number(createdSession.id)
  );

  assert.ok(matchedSession);
  assert.equal(matchedSession.created_by_username, "admin");
  assert.equal(matchedSession.last_modified_by_username, "admin");
});
