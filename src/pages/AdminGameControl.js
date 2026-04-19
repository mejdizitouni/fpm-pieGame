import { useEffect, useState , useRef} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import confetti from "canvas-confetti";
import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";
import PieChart from "../components/charts/PieChart";
import { toast } from "../components/toast/toast";
import { useLanguage } from "../i18n/LanguageProvider";
import "./AdminGameControl.css"; // Import the CSS file for styling

function AdminGameControl() {
  const API_URL = process.env.REACT_APP_API_URL;
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const renderTemplate = (key, params = {}) => {
    let text = t(key);
    Object.entries(params).forEach(([paramKey, value]) => {
      text = text.replaceAll(`{${paramKey}}`, String(value));
    });
    return text;
  };

  const [sessionDetails, setSessionDetails] = useState(null); // To store session details
  const [sessionStatus, setSessionStatus] = useState(null); // To store session status
  const [groups, setGroups] = useState([]);
  const [camemberts, setCamemberts] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionOptions, setQuestionOptions] = useState([]); // Options for red questions
  const [timer, setTimer] = useState(0);
  const [isTimeUp, setIsTimeUp] = useState(false);
  const [correctAnswer, setCorrectAnswer] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(null);
  const [totalQuestions, setTotalQuestions] = useState(null);
  const [stoppedTimerGroup, setStoppedTimerGroup] = useState(null);
  const [winningGroups, setWinningGroups] = useState([]); // Store winning group IDs
  const [gameOverModal, setGameOverModal] = useState({
    open: false,
    message: "",
    winners: [],
  });
  const [socketConnected, setSocketConnected] = useState(false); // Connection status
  const [validatedAnswers, setValidatedAnswers] = useState({}); // Track validated answer state
  const [latestAnswerId, setLatestAnswerId] = useState(null);
  const [adminReaction, setAdminReaction] = useState(null);
  const [adminFeed, setAdminFeed] = useState([]);

  // Keep WebSocket instance in a ref to prevent reinitialization
  const socketRef = useRef(null);

  const popConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 65,
      origin: { y: 0.7 },
      ticks: 180,
    });
  };

  const showAdminReaction = (text, type) => {
    setAdminReaction({ text, type, key: Date.now() });
  };

  const pushAdminFeed = (text, type = "info") => {
    const nextItem = { id: Date.now() + Math.random(), text, type };
    setAdminFeed((prev) => [nextItem, ...prev].slice(0, 5));
  };

  const applyRuntimeQuestion = async (question, token) => {
    if (!question) {
      setQuestionOptions([]);
      return;
    }

    if (question.response_type === "Question à choix unique") {
      try {
        const optionsRes = await fetch(
          `${API_URL}/questions/${question.id}/options`,
          {
            headers: { Authorization: token },
          }
        );
        setQuestionOptions(await optionsRes.json());
      } catch (err) {
        console.error("Failed to fetch question options:", err);
        setQuestionOptions([]);
      }
      return;
    }

    setQuestionOptions([]);
  };

  const restoreRuntimeState = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/sessions/${sessionId}/runtime-state`, {
        headers: { Authorization: token },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch runtime state");
      }

      const runtime = await response.json();
      setSessionStatus(runtime.status === "Activated" ? "Activated" : runtime.status);
      setCurrentQuestion(runtime.currentQuestion || null);
      setTimer(runtime.timer || 0);
      setQuestionIndex(runtime.questionIndex || null);
      setTotalQuestions(runtime.totalQuestions || null);
      setAnswers(runtime.answers || []);
      setStoppedTimerGroup(runtime.stoppedTimerGroup || null);
      setCorrectAnswer(runtime.correctAnswer || null);
      setIsTimeUp(Boolean(runtime.currentQuestion) && (runtime.timer || 0) <= 0);
      await applyRuntimeQuestion(runtime.currentQuestion, token);
    } catch (err) {
      console.error("Failed to restore runtime state:", err);
    }
  };

  useEffect(() => {
    const connectSocket = () => {
      if (socketRef.current) {
        socketRef.current.disconnect(); // Ensure previous instance is closed
      }

      socketRef.current = io(API_URL, {
        reconnection: true, // Enable automatic reconnection
        reconnectionAttempts: 5, // Try 5 times before failing
        reconnectionDelay: 2000, // Wait 2s between attempts
      });

      socketRef.current.on("connect", () => {
        console.log("WebSocket connected");
        setSocketConnected(true);
        socketRef.current.emit("joinSession", { sessionId, role: "admin" });
        restoreRuntimeState();
      });

      socketRef.current.on("disconnect", (reason) => {
        console.warn("WebSocket disconnected:", reason);
        setSocketConnected(false);
        if (reason === "io server disconnect") {
          socketRef.current.connect(); // Manually reconnect if server disconnects
        }
      });

      socketRef.current.on("connect_error", (err) => {
        console.error("WebSocket connection error:", err);
      });

      socketRef.current.on("newQuestion", async ({ question, timer, questionIndex, totalQuestions }) => {
        setCurrentQuestion(question);
        setTimer(timer);
        setQuestionIndex(questionIndex);
        setTotalQuestions(totalQuestions);
        setIsTimeUp(false);
        setAnswers([]);
        setCorrectAnswer(null);
        setStoppedTimerGroup(null);
        setSessionStatus("In Progress");
        setLatestAnswerId(null);
        setAdminFeed([]);

        if (question.response_type === "Question à choix unique") {
          const token = localStorage.getItem("token");
          await applyRuntimeQuestion(question, token);
        } else {
          setQuestionOptions([]);
        }
      });

      socketRef.current.on("revealAnswer", (revealedAnswer) => {
        setCorrectAnswer(revealedAnswer);
      });

      socketRef.current.on("answerSubmitted", (answer) => {
        const answerId = `${answer.groupId}-${answer.timeSubmitted || Date.now()}`;
        setLatestAnswerId(answerId);
        setAnswers((prev) => [...prev, { ...answer, _answerId: answerId }]);
        if (answer.stoppedTimer) {
          pushAdminFeed(renderTemplate("adminFeedAnsweredStopped", { groupName: answer.groupName }), "warning");
        } else {
          pushAdminFeed(renderTemplate("adminFeedAnswerSubmitted", { groupName: answer.groupName }), "info");
        }
      });

      socketRef.current.on("timerStopped", ({ groupId, groupName }) => {
        setStoppedTimerGroup({ groupId, groupName });
        setTimer(0);
        setIsTimeUp(true);
        pushAdminFeed(renderTemplate("adminFeedTimerStopped", { groupName }), "warning");
      });

      socketRef.current.on("camembertUpdated", ({ updatedCamemberts }) => {
        setCamemberts(updatedCamemberts);
      });

      socketRef.current.on("gameOver", (data) => {
        setCurrentQuestion(null);
        setTimer(0);
        setIsTimeUp(false);
        setSessionStatus("Game Over");
        setAnswers([]);
        setCorrectAnswer(null);
        setStoppedTimerGroup(null);

        let winnersArray = [];
        if (Array.isArray(data.winners)) {
          winnersArray = data.winners;
        } else if (data.winners) {
          winnersArray = [data.winners];
        }

        setWinningGroups(winnersArray.map((w) => w.group_id));

        if (winnersArray.length > 1) {
          const tieMessage = renderTemplate("gameAlertTie", {
            names: winnersArray.map((w) => w.name).join(", "),
          });
          toast.info(tieMessage);
          popConfetti();
          setGameOverModal({
            open: true,
            message: tieMessage,
            winners: winnersArray,
          });
        } else if (winnersArray.length === 1) {
          const winnerMessage = renderTemplate("adminToastWinner", {
            name: winnersArray[0].name,
          });
          toast.success(winnerMessage);
          popConfetti();
          setGameOverModal({
            open: true,
            message: winnerMessage,
            winners: winnersArray,
          });
        } else {
          const noWinnerMessage = t("gameAlertNoWinner");
          toast.info(noWinnerMessage);
          setGameOverModal({
            open: true,
            message: noWinnerMessage,
            winners: [],
          });
        }
      });
    };

    connectSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [API_URL, sessionId]);

  useEffect(() => {
    const fetchSessionStatus = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          navigate("/");
          return;
        }

        // Fetch session status
        const response = await fetch(`${API_URL}/sessions/${sessionId}`, {
          headers: { Authorization: token },
        });
        const data = await response.json();

        setSessionDetails(data);
        if (data.status === "Activated") {
          setSessionStatus("Activated");
        } else {
          setSessionStatus(data.status); // Save the actual status if not Activated
        }
      } catch (err) {
        console.error("Failed to fetch session status:", err);
        setSessionStatus("Error");
      }
    };

    fetchSessionStatus();
  }, [API_URL, sessionId, navigate]);

  useEffect(() => {
    const fetchInitialData = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/");
        return;
      }

      try {
        const groupsRes = await fetch(
          `${API_URL}/sessions/${sessionId}/groups`,
          { headers: { Authorization: token } }
        );
        const camembertsRes = await fetch(
          `${API_URL}/sessions/${sessionId}/camemberts`,
          { headers: { Authorization: token } }
        );
        setGroups(await groupsRes.json());
        setCamemberts(await camembertsRes.json());
      } catch (err) {
        console.error("Failed to fetch initial data:", err);
      }
    };

    fetchInitialData();
    
  }, [API_URL, sessionId, sessionStatus, navigate]);

  useEffect(() => {
    let interval;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer((prevTimer) => {
          const newTimer = prevTimer - 1;
          if (newTimer <= 0) {
            setIsTimeUp(true);
            if (currentQuestion && !stoppedTimerGroup) {
              pushAdminFeed(t("adminFeedTimeUpWaitingValidation"), "warning");
            }
            clearInterval(interval);
          }
          return newTimer;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer, currentQuestion, stoppedTimerGroup]);

  const startGame = async () => {
    const token = localStorage.getItem("token");

    try {
      // API call to update session status to "In Progress"
      const response = await fetch(`${API_URL}/sessions/${sessionId}/start`, {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to update session status.");
      }
      // Emit socket event to notify players that the game has started
      socketRef.current.emit("startGame", sessionId);
    } catch (err) {
      console.error("Error starting the game:", err);
    }
  };

  const endGame = async () => {
    const token = localStorage.getItem("token");

    try {
      // API call to update session status to "In Progress"
      const response = await fetch(`${API_URL}/sessions/${sessionId}/end`, {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to end session .");
      }
    } catch (err) {
      console.error("Error ending the game:", err);
    }
  }

  const validateAnswer = (answer, groupId, isCorrect) => {
    socketRef.current.emit("validateAnswer", {
      sessionId,
      groupId,
      questionId: currentQuestion.id,
      isCorrect,
      stoppedTimer: answer.stoppedTimer,
    });
    setValidatedAnswers((prev) => ({ ...prev, [groupId]: isCorrect ? "correct" : "incorrect" }));
    if (isCorrect) {
      popConfetti();
      showAdminReaction(renderTemplate("adminReactionGainPoints", { groupName: answer.groupName }), "success");
    } else {
      showAdminReaction(renderTemplate("adminReactionMiss", { groupName: answer.groupName }), "danger");
    }
  };

  const validateAnswerNoPoints = (answer, groupId, isCorrect) => {
    socketRef.current.emit("validateAnswerNoPoints", {
      sessionId,
      groupId,
      questionId: currentQuestion.id,
      isCorrect,
      stoppedTimer: answer.stoppedTimer,
    });
    setValidatedAnswers((prev) => ({ ...prev, [groupId]: isCorrect ? "correct" : "incorrect" }));
    if (isCorrect) {
      popConfetti();
      showAdminReaction(renderTemplate("adminReactionManualValidated", { groupName: answer.groupName }), "success");
    } else {
      showAdminReaction(renderTemplate("adminReactionManualWrong", { groupName: answer.groupName }), "danger");
    }
  };

  const revealAnswer = () => {
    if (currentQuestion) {
      socketRef.current.emit("revealAnswer", {
        sessionId,
        correctAnswer: currentQuestion.expected_answer,
      });
    }
  };

  const nextQuestion = () => {
    socketRef.current.emit("nextQuestion", sessionId);
    setAnswers([]);
    setCorrectAnswer(null);
    setIsTimeUp(false);
    setStoppedTimerGroup(null);
    setValidatedAnswers({});
  };

  const generateCamemberts = (red, green) => {
    const camemberts = [];
    while (red > 0 || green > 0) {
      const camembert = [];
      for (let i = 0; i < 8; i++) {
        if (i % 2 === 0 && red > 0) {
          camembert.push("red");
          red--;
        } else if (i % 2 !== 0 && green > 0) {
          camembert.push("green");
          green--;
        } else {
          camembert.push("grey");
        }
      }
      camemberts.push(camembert);
    }

    // If no scores, add a default camembert with all grey
    if (camemberts.length === 0) {
      camemberts.push(Array(8).fill("grey"));
    }

    return camemberts;
  };

  const updatePoints = async (groupId, color, change) => {
    const token = localStorage.getItem("token");
    console.log("typeof groupId", typeof groupId, " and value is ", groupId);
    console.log("typeof color", typeof color, " and value is ", color);
    console.log("typeof change", typeof change, " and value is ", change);
    try {
      const response = await fetch(
        `${API_URL}/sessions/${sessionId}/update-points`,
        {
          method: "POST",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ groupId, color, change }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update points");
      }

      const data = await response.json();

      // Update the camemberts state with the new points
      setCamemberts((prev) =>
        prev.map((cam) =>
          cam.group_id === groupId
            ? {
                ...cam,
                red_triangles:
                  color === "red"
                    ? data.updatedGroup.red_triangles
                    : cam.red_triangles,
                green_triangles:
                  color === "green"
                    ? data.updatedGroup.green_triangles
                    : cam.green_triangles,
              }
            : cam
        )
      );

      if (change > 0) {
        popConfetti();
        showAdminReaction(`✨ +1 point ${color === "red" ? "rouge" : "vert"}`, "success");
      } else {
        showAdminReaction(`😕 -1 point ${color === "red" ? "rouge" : "vert"}`, "warning");
      }
    } catch (err) {
      console.error("Error updating points:", err);
    }
  };

  const getTimerVisualState = () => {
    if (!currentQuestion || !currentQuestion.allocated_time) {
      return "normal";
    }

    if (timer <= 0) {
      return "expired";
    }

    const ratio = timer / currentQuestion.allocated_time;
    if (ratio <= 0.2) {
      return "critical";
    }

    if (ratio <= 0.5) {
      return "warning";
    }

    return "normal";
  };

  const timerVisualState = getTimerVisualState();

  if (sessionStatus === null) {
    return <h1>{t("gameLoadingSession")}</h1>;
  }

  if (sessionStatus === "Draft") {
    return <h1>{t("gameSessionNotActive")}</h1>;
  }

  return (
    <>
      <Header />
      <div className="admin-game-control-container">
        {gameOverModal.open && (
          <div className="modal-overlay" role="dialog" aria-modal="true">
            <div className="modal-content game-over-modal-content">
              <h2>{t("gameOverTitle")}</h2>
              <p>{gameOverModal.message}</p>
              {gameOverModal.winners.length > 0 && (
                <ul className="game-over-winners-list">
                  {gameOverModal.winners.map((winner) => (
                    <li key={winner.group_id || winner.name}>🏆 {winner.name}</li>
                  ))}
                </ul>
              )}
              <button
                className="close-button"
                onClick={() =>
                  setGameOverModal((prev) => ({
                    ...prev,
                    open: false,
                  }))
                }
              >
                {t("commonClose")}
              </button>
            </div>
          </div>
        )}

        <div className={`connection-status ${socketConnected ? "connected" : "disconnected"}`}>
          <span className="connection-dot" />
          {socketConnected ? t("adminLiveConnected") : t("adminLiveReconnecting")}
        </div>

        {sessionStatus === "Game Over" && (
          <>
            <h1>{t("gameOverTitle")}</h1>
            <h2>{t("gameFinalScore")}</h2>
            <ul className="pie-chart-list">
              {camemberts.map((cam) => (
                <li key={cam.group_id}>
                  <h3>{cam.name}</h3>
                  <img
                    src={cam.avatar_url}
                    alt={renderTemplate("gameGroupAvatarAlt", { name: cam.name })}
                    className="group-avatar"
                  />
                  {winningGroups.includes(cam.group_id) && (
                    <span className="winner-badge">🏆 {t("gameWinner")}</span>
                  )}
                  {generateCamemberts(
                    cam.red_triangles,
                    cam.green_triangles
                  ).map((segments, index) => (
                    <PieChart
                      key={`${cam.group_id}-${index}`}
                      segments={segments}
                    />
                  ))}
                </li>
              ))}
            </ul>
          </>
        )}

        {sessionStatus !== "Game Over" && (
          <div className="admin-live-layout">
            <section className="session-main-panel">
              {adminReaction && (
                <div key={adminReaction.key} className={`admin-reaction-pill ${adminReaction.type}`}>
                  {adminReaction.text}
                </div>
              )}

              {adminFeed.length > 0 && (
                <div className="admin-feed-board">
                  {adminFeed.map((item) => (
                    <div key={item.id} className={`admin-feed-item ${item.type}`}>
                      {item.text}
                    </div>
                  ))}
                </div>
              )}

              <div className="admin-session-toolbar">
                {sessionStatus === "Activated" && (
                  <button className="start-game-button" onClick={startGame}>
                    {t("adminStartSession")}
                  </button>
                )}

                {sessionStatus === "In Progress" && (
                  <button className="end-game-button" onClick={endGame}>
                    {t("adminStopSession")}
                  </button>
                )}

                {sessionStatus === "In Progress" && (
                  <button
                    className="next-question-button"
                    onClick={nextQuestion}
                  >
                    {t("adminNextQuestion")}
                  </button>
                )}

                {sessionStatus === "In Progress" && currentQuestion && (
                  <button
                    className="reveal-answer-button"
                    onClick={revealAnswer}
                    disabled={correctAnswer}
                  >
                    {t("adminRevealAnswer")}
                  </button>
                )}
              </div>

              {sessionStatus === "Activated" && (
                <div className="session-status-card">
                  <h2>{t("adminSessionReady")}</h2>
                  <p>{t("adminSessionReadyDesc")}</p>
                </div>
              )}

              {sessionStatus === "In Progress" && !currentQuestion && (
                <div className="session-status-card">
                  <h2>{t("gameWaitingNextQuestion")}</h2>
                  <p>{t("adminLaunchNextWhenReady")}</p>
                </div>
              )}

              {currentQuestion && (
                <div
                  className={`current-question ${
                    currentQuestion.type === "red" ? "red" : "green"
                  }`}
                >
                  <div className="question-header">
                    {renderTemplate("gameQuestionCounter", {
                      current: questionIndex,
                      total: totalQuestions,
                    })}
                    <img
                      className="question-type-avatar"
                      src={`/avatars/${currentQuestion.type}.svg`}
                      alt={renderTemplate("gameQuestionTypeAvatarAlt", {
                        type: currentQuestion.type,
                      })}
                    />
                    <div
                      className={`question-label ${
                        currentQuestion && currentQuestion.type === "green"
                          ? "green-label"
                          : "red-label"
                      }`}
                    ></div>
                    {currentQuestion && currentQuestion.type === "green"
                      ? sessionDetails.green_questions_label
                      : sessionDetails.red_questions_label}
                  </div>
                  <h3 style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {currentQuestion.title}
                  </h3>
                  <p>{t("sessionExpectedAnswer")}: {currentQuestion.expected_answer}</p>
                  <div className={`timer-circle ${timerVisualState}`}>
                    <svg className="progress-ring" width="112" height="112">
                      <circle
                        className={`progress-ring__circle ${timerVisualState}`}
                        stroke="currentColor"
                        strokeWidth="6"
                        fill="transparent"
                        r="50"
                        cx="56"
                        cy="56"
                        style={{
                          strokeDasharray: 314,
                          strokeDashoffset:
                            (314 * Math.max(timer, 0)) /
                            currentQuestion.allocated_time,
                        }}
                      />
                    </svg>
                    <div className={`timer-text ${timerVisualState}`}>
                      {timer > 0 ? `${timer}s` : t("gameTimerExpired")}
                    </div>
                  </div>
                  <div className={`timer-status ${timerVisualState}`}>
                    {timerVisualState === "critical"
                      ? t("adminTimerCritical")
                      : timerVisualState === "warning"
                      ? t("adminTimerWarning")
                      : timerVisualState === "expired"
                      ? t("gameTimerExpired")
                      : t("adminTimerRunning")}
                  </div>
                  {isTimeUp && <h3>{t("adminTimeUp")}</h3>}
                  {stoppedTimerGroup && (
                    <h4>{t("gameTimerStoppedBy")} {stoppedTimerGroup.groupName}</h4>
                  )}
                  {currentQuestion.response_type === "Question à choix unique" && (
                    <div>
                      <h4>{t("sessionOptions")}</h4>
                      <ul className="options-list">
                        {questionOptions.map((option, index) => (
                          <li key={index}>{option.option_text}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {answers && answers.length > 0 && (
                <>
                  <h2 className="session-panel-title">{t("adminSubmittedAnswers")}</h2>
                  <ul className="answers-list">
                    {answers.map((answer, index) => (
                      <li key={answer._answerId || index} className={`answer-item${validatedAnswers[answer.groupId] ? ` answer-${validatedAnswers[answer.groupId]}` : ""}${latestAnswerId === answer._answerId ? " answer-new" : ""}`}>
                        <div className="answer-header">
                          <strong>{answer.groupName}</strong>: {answer.answer}
                          {answer.stoppedTimer && <em> ({t("adminStoppedTimer")})</em>}
                          {validatedAnswers[answer.groupId] && (
                            <span className={`validation-badge ${validatedAnswers[answer.groupId]}`}>
                              {validatedAnswers[answer.groupId] === "correct" ? `✓ ${t("adminCorrect")}` : `✕ ${t("adminIncorrect")}`}
                            </span>
                          )}
                        </div>
                        <div className="answer-actions">
                          <button
                            className="validate-button correct"
                            onClick={() => validateAnswer(answer, answer.groupId, true)}
                          >
                            {t("adminCorrect")}
                          </button>
                          <button
                            className="validate-button correct"
                            onClick={() =>
                              validateAnswerNoPoints(answer, answer.groupId, true)
                            }
                          >
                            {t("adminCorrectManual")}
                          </button>
                          {answer.stoppedTimer && (
                            <button
                              className="validate-button incorrect"
                              onClick={() =>
                                validateAnswer(answer, answer.groupId, false)
                              }
                            >
                              {t("adminIncorrect")}
                            </button>
                          )}
                          {answer.stoppedTimer && (
                            <button
                              className="validate-button incorrect"
                              onClick={() =>
                                validateAnswerNoPoints(answer, answer.groupId, false)
                              }
                            >
                              {t("adminIncorrectManual")}
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <aside className="session-score-sidebar">
              <div className="session-score-sidebar-inner">
                <h2 className="session-panel-title">{t("gameScores")}</h2>
                <ul className="pie-chart-list session-score-list">
                  {camemberts.map((cam) => (
                    <li key={cam.group_id}>
                      <div className="group-header">
                        <h3>{cam.name}</h3>
                        <img
                          src={cam.avatar_url}
                          alt={renderTemplate("gameGroupAvatarAlt", { name: cam.name })}
                          className="group-avatar"
                        />
                        <div className="points-control">
                          <div className="score-row">
                            <button
                              className="minus-button"
                              onClick={() => updatePoints(cam.group_id, "red", -1)}
                            >
                              -
                            </button>
                            <span className="points-display">
                              {t("adminRed")}: {cam.red_triangles}
                            </span>
                            <button
                              className="plus-button"
                              onClick={() => updatePoints(cam.group_id, "red", 1)}
                            >
                              +
                            </button>
                          </div>

                          <div className="score-row">
                            <button
                              className="minus-button"
                              onClick={() => updatePoints(cam.group_id, "green", -1)}
                            >
                              -
                            </button>
                            <span className="points-display">
                              {t("adminGreen")}: {cam.green_triangles}
                            </span>
                            <button
                              className="plus-button"
                              onClick={() => updatePoints(cam.group_id, "green", 1)}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                      {generateCamemberts(
                        cam.red_triangles,
                        cam.green_triangles
                      ).map((segments, index) => (
                        <PieChart
                          key={`${cam.group_id}-${index}`}
                          segments={segments}
                        />
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}

export default AdminGameControl;
