const sessionState = {};
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

const createSessionRuntimeState = () => ({
  currentIndex: 0,
  askedQuestions: new Set(),
  totalQuestions: 0,
  currentQuestion: null,
  currentQuestionStartedAt: null,
  currentQuestionDuration: 0,
  submittedAnswers: [],
  stoppedTimerGroup: null,
  revealedAnswer: null,
  winners: [],
  lastTouchedAt: Date.now(),
});

const markSessionTouched = (sessionId) => {
  if (!sessionState[sessionId]) {
    return;
  }

  sessionState[sessionId].lastTouchedAt = Date.now();
};

const startSessionCleanup = () => {
  const cleanup = setInterval(() => {
    const now = Date.now();
    Object.keys(sessionState).forEach((sessionId) => {
      const lastTouchedAt = sessionState[sessionId]?.lastTouchedAt || now;
      if (now - lastTouchedAt > SESSION_TTL_MS) {
        delete sessionState[sessionId];
      }
    });
  }, 15 * 60 * 1000);

  cleanup.unref();
  return cleanup;
};

const isValidPositiveInt = (value) =>
  Number.isInteger(Number(value)) && Number(value) > 0;

const getRemainingTimer = (state) => {
  if (!state?.currentQuestion || !state.currentQuestionStartedAt) {
    return 0;
  }

  const elapsedSeconds = Math.floor(
    (Date.now() - state.currentQuestionStartedAt) / 1000
  );

  return Math.max((state.currentQuestionDuration || 0) - elapsedSeconds, 0);
};

const buildRuntimeStateResponse = (sessionStatus, state) => ({
  status: sessionStatus,
  currentQuestion: state?.currentQuestion || null,
  questionIndex: state?.currentIndex || 0,
  totalQuestions: state?.totalQuestions || 0,
  timer: getRemainingTimer(state),
  answers: state?.submittedAnswers || [],
  stoppedTimerGroup: state?.stoppedTimerGroup || null,
  correctAnswer: state?.revealedAnswer || null,
  winners: state?.winners || [],
});

const buildPlayerRuntimeStateResponse = (sessionStatus, state, groupId) => {
  const playerAnswer = (state?.submittedAnswers || []).find(
    (entry) => Number(entry.groupId) === Number(groupId)
  );

  return {
    status: sessionStatus,
    currentQuestion: state?.currentQuestion || null,
    questionIndex: state?.currentIndex || 0,
    totalQuestions: state?.totalQuestions || 0,
    timer: getRemainingTimer(state),
    stoppedTimerGroup: state?.stoppedTimerGroup?.groupName || null,
    correctAnswer: state?.revealedAnswer || null,
    winners: state?.winners || [],
    submittedAnswer: playerAnswer?.answer || null,
  };
};

module.exports = {
  sessionState,
  createSessionRuntimeState,
  markSessionTouched,
  startSessionCleanup,
  isValidPositiveInt,
  getRemainingTimer,
  buildRuntimeStateResponse,
  buildPlayerRuntimeStateResponse,
};
