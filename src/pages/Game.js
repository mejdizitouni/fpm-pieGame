import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import confetti from "canvas-confetti";
import PieChart from "../components/charts/PieChart";
import Header from "../components/layout/Header";
import { toast } from "../components/toast/toast";
import { useLanguage } from "../i18n/LanguageProvider";
import { QUESTION_RESPONSE_TYPES } from "../constants/questionResponseTypes";
import "./Game.css"; // Import the CSS file for styling

const socket = io(process.env.REACT_APP_API_URL);
const API_URL = process.env.REACT_APP_API_URL;

function Game() {
  const { sessionId, groupId } = useParams();
  const location = useLocation();
  const { t, setLanguage } = useLanguage();

  const [group, setGroup] = useState(null);
  const [sessionDetails, setSessionDetails] = useState(null); // To store session details
  const [sessionStatus, setSessionStatus] = useState(null); // "Activated" or other
  const [question, setQuestion] = useState(null); // Current question
  const [questionOptions, setQuestionOptions] = useState([]); // Options for red questions
  const [timer, setTimer] = useState(0); // Countdown timer
  const [answer, setAnswer] = useState(""); // Player's input answer
  const [submittedAnswer, setSubmittedAnswer] = useState(null); // Submitted answer
  const [waitingValidation, setWaitingValidation] = useState(false); // Waiting for validation
  const [validationResult, setValidationResult] = useState(null); // Validation result: "correct" or "wrong"
  const [validationResultNoPoints, setValidationResultNoPoints] =
    useState(null);
  const [correctAnswer, setCorrectAnswer] = useState(null); // Correct answer after reveal
  const [camemberts, setCamemberts] = useState([]); // Camembert scores
  const [questionIndex, setQuestionIndex] = useState(null); // Current question index
  const [totalQuestions, setTotalQuestions] = useState(null); // Total questions in the session
  const [stoppedTimerGroup, setStoppedTimerGroup] = useState(null); // Group that stopped the timer
  const [winningGroups, setWinningGroups] = useState([]); // Store winning group IDs
  const [gameOverModal, setGameOverModal] = useState({
    open: false,
    message: "",
    winners: [],
  });
  const [showRules, setShowRules] = useState(false); // Manage rules popup visibility
  const [liveNotice, setLiveNotice] = useState(null);
  const [playerFeed, setPlayerFeed] = useState([]);
  const [sessionErrorKey, setSessionErrorKey] = useState(null);
  const submittedAnswerRef = useRef(null);
  const stoppedTimerGroupRef = useRef(null);

  const fireWinConfetti = () => {
    confetti({
      particleCount: 90,
      spread: 60,
      origin: { y: 0.72 },
      ticks: 180,
    });
  };

  const showNotice = (text, type) => {
    setLiveNotice({ text, type, key: Date.now() });
  };

  const pushPlayerFeed = (text, type = "info") => {
    const nextItem = { id: Date.now() + Math.random(), text, type };
    setPlayerFeed((prev) => [nextItem, ...prev].slice(0, 5));
  };

  const renderTemplate = (key, params = {}) => {
    let text = t(key);
    Object.entries(params).forEach(([paramKey, value]) => {
      text = text.replaceAll(`{${paramKey}}`, String(value));
    });
    return text;
  };

  const getSessionErrorKeyFromStatus = (status) => {
    if (status === 404) {
      return "sessionErrorNotFound";
    }

    if (status === 401 || status === 403) {
      return "sessionErrorUnauthorized";
    }

    return "sessionErrorGeneric";
  };

  const applyQuestionState = async (nextQuestion) => {
    setQuestion(nextQuestion);

    if (!nextQuestion) {
      setQuestionOptions([]);
      return;
    }

    if (nextQuestion.response_type === QUESTION_RESPONSE_TYPES.SINGLE_CHOICE) {
      if (Array.isArray(nextQuestion.options) && nextQuestion.options.length > 0) {
        setQuestionOptions(nextQuestion.options);
        return;
      }

      try {
        const optionsRes = await fetch(
          `${API_URL}/questions/${nextQuestion.id}/options`
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
    try {
      const response = await fetch(
        `${API_URL}/sessions/${sessionId}/player-runtime-state/${groupId}`
      );

      if (!response.ok) {
        setSessionErrorKey(getSessionErrorKeyFromStatus(response.status));
        throw new Error("Failed to fetch player runtime state");
      }

      const runtime = await response.json();
      setSessionStatus(runtime.status === "Activated" ? "Activated" : runtime.status);
      setQuestionIndex(runtime.questionIndex || null);
      setTotalQuestions(runtime.totalQuestions || null);
      setTimer(runtime.timer || 0);
      setStoppedTimerGroup(runtime.stoppedTimerGroup || null);
      setCorrectAnswer(runtime.correctAnswer || null);
      setSubmittedAnswer(runtime.submittedAnswer || null);
      setWaitingValidation(Boolean(runtime.submittedAnswer) && !runtime.correctAnswer);
      if (!runtime.submittedAnswer) {
        setLiveNotice(null);
      }
      await applyQuestionState(runtime.currentQuestion || null);
      setSessionErrorKey(null);
    } catch (err) {
      console.error("Failed to restore player runtime state:", err);
    }
  };

  useEffect(() => {
    submittedAnswerRef.current = submittedAnswer;
  }, [submittedAnswer]);

  useEffect(() => {
    stoppedTimerGroupRef.current = stoppedTimerGroup;
  }, [stoppedTimerGroup]);


  useEffect(() => {
    const fetchSessionStatus = async () => {
      try {
        const token = localStorage.getItem("token");

        // Fetch session status
        const response = await fetch(
          `${API_URL}/sessions/${sessionId}`,
          {
            headers: { Authorization: token },
          }
        );

        if (!response.ok) {
          setSessionStatus("Error");
          setSessionErrorKey(getSessionErrorKeyFromStatus(response.status));
          return;
        }

        const data = await response.json();

        if (!data || !data.id) {
          setSessionStatus("Error");
          setSessionErrorKey("sessionErrorNotFound");
          return;
        }

        setSessionErrorKey(null);
        setSessionDetails(data);

        if (data.status === "Activated") {
          setSessionStatus("Activated");
        } else {
          setSessionStatus(data.status); // Save the actual status if not Activated
        }
      } catch (err) {
        console.error("Failed to fetch session status:", err);
        setSessionStatus("Error");
        setSessionErrorKey((previous) => previous || "sessionErrorGeneric");
      }
    };

    fetchSessionStatus();
  }, [sessionId]);

  useEffect(() => {
    // if (sessionStatus !== "Activated") return;

    const fetchInitialData = async () => {
      const token = localStorage.getItem("token");

      try {
        const camembertsRes = await fetch(
          `${API_URL}/sessions/${sessionId}/camemberts`,
          {
            headers: { Authorization: token },
          }
        );
        setCamemberts(await camembertsRes.json());
      } catch (err) {
        console.error("Failed to fetch initial data:", err);
      }
    };

    fetchInitialData();

    const fetchGroupData = async () => {
      try {
        const response = await fetch(
          `${API_URL}/sessions/${sessionId}/groups/${groupId}`
        );

        if (!response.ok) {
          setSessionErrorKey(
            response.status === 404
              ? "sessionErrorInvalidLink"
              : getSessionErrorKeyFromStatus(response.status)
          );
          return;
        }

        const data = await response.json();

        if (!data || !data.id) {
          setSessionErrorKey("sessionErrorInvalidLink");
          return;
        }

        setSessionErrorKey(null);
        setGroup(data);
      } catch (err) {
        console.error("Failed to fetch group data:", err);
        setSessionErrorKey((previous) => previous || "sessionErrorGeneric");
      }
    };

    fetchGroupData();

    // Join session as a player
    const handleConnect = () => {
      socket.emit("joinSession", { sessionId, groupId, role: "player" });
      restoreRuntimeState();
    };

    socket.on("connect", handleConnect);
    if (socket.connected) {
      handleConnect();
    }

    // Listen for game events
    const handleStartGame = () => {
      setSessionStatus("In Progress");
      setCorrectAnswer(null);
      setLiveNotice(null);
      setPlayerFeed([]);
      restoreRuntimeState();
    };

    socket.on("startGame", handleStartGame);

    const handleNewQuestion = async ({ question, timer, questionIndex, totalQuestions }) => {
        setSessionStatus("In Progress");
        await applyQuestionState(question);
        setTimer(timer);
        setQuestionIndex(questionIndex);
        setTotalQuestions(totalQuestions);
        setSubmittedAnswer(null);
        setStoppedTimerGroup(null);
        setWaitingValidation(false);
        setValidationResult(null);
        setValidationResultNoPoints(null);
        setCorrectAnswer(null);
        setLiveNotice(null);
        setPlayerFeed([]);
      };

    socket.on("newQuestion", handleNewQuestion);

    const handleAnswerSubmitted = ({ groupId: submittedGroupId, groupName, stoppedTimer }) => {
      const isCurrentGroup = Number(submittedGroupId) === Number(groupId);
      if (isCurrentGroup) {
        pushPlayerFeed(
          stoppedTimer
            ? t("gameNoticeAnswerSavedStopped")
            : t("gameNoticeAnswerSaved"),
          "success"
        );
        return;
      }

      pushPlayerFeed(
        stoppedTimer
          ? renderTemplate("gameFeedAnsweredStopped", { groupName })
          : renderTemplate("gameFeedAnsweredSubmitted", { groupName }),
        "info"
      );
    };

    socket.on("answerSubmitted", handleAnswerSubmitted);

    const handleTimerCountdown = (remainingTime) => {
      setTimer(remainingTime);
      if (remainingTime === 0) {
        if (!stoppedTimerGroupRef.current) {
          if (submittedAnswerRef.current) {
            pushPlayerFeed(t("gameNoticeTimeUpPendingValidation"), "warning");
          } else {
            pushPlayerFeed(t("gameNoticeTimeUpNoAnswer"), "danger");
          }
        }
      }
    };

    socket.on("timerCountdown", handleTimerCountdown);

    const handleTimerStopped = ({ groupName, groupId: stoppedByGroupId }) => {
      setTimer(0);
      setStoppedTimerGroup(groupName);
      if (groupName) {
        const isMyGroup = Number(stoppedByGroupId) === Number(groupId);
        showNotice(
          isMyGroup
            ? t("gameNoticeYouStoppedTimer")
            : renderTemplate("gameNoticeGroupStoppedTimer", { groupName }),
          isMyGroup ? "success" : "warning"
        );
        pushPlayerFeed(
          isMyGroup
            ? t("gameFeedGroupStoppedFirstSelf")
            : renderTemplate("gameFeedGroupStoppedFirstOther", { groupName }),
          isMyGroup ? "success" : "warning"
        );
      }
    };

    socket.on("timerStopped", handleTimerStopped);

    const handleCamembertUpdated = ({ updatedCamemberts }) => {
      setCamemberts(updatedCamemberts);
    };

    socket.on("camembertUpdated", handleCamembertUpdated);

    const handleAnswerValidated = ({ groupId: validatedGroupId, message, messageKey, messageParams, isCorrect }) => {
      setWaitingValidation(null)
      const isCurrentGroup = Number(validatedGroupId) === Number(groupId);

      if (isCurrentGroup) {
        setValidationResult(isCorrect ? "correct" : "wrong");
        setWaitingValidation(false);
        if (isCorrect) {
          fireWinConfetti();
          showNotice(t("gameNoticeGoodAnswer"), "success");
          pushPlayerFeed(t("gameFeedGroupPoints"), "success");
        } else {
          showNotice(t("gameNoticeWrongAnswer"), "danger");
          pushPlayerFeed(t("gameFeedGroupNoPoint"), "danger");
        }
      } else if (!isCorrect) {
        fireWinConfetti();
        showNotice(t("gameNoticeOtherWrongYouGain"), "success");
        pushPlayerFeed(t("gameFeedOtherWrongYouGain"), "success");
      } else {
        pushPlayerFeed(t("gameFeedOtherScored"), "info");
      }
      setValidationResult(messageKey ? renderTemplate(messageKey, messageParams) : message);
      setCorrectAnswer(null);

    };

    socket.on("answerValidated", handleAnswerValidated);
    
    const handleAnswerValidatedNoPoints = ({ groupId: validatedGroupId, message, messageKey, messageParams, isCorrect }) => {
      setWaitingValidation(null)
      if (Number(validatedGroupId) === Number(groupId)) {
        setValidationResultNoPoints(isCorrect ? "correct" : "wrong");
        setWaitingValidation(false);
        if (isCorrect) {
          fireWinConfetti();
          showNotice(t("gameNoticeManualValidationSuccess"), "success");
          pushPlayerFeed(t("gameFeedManualValidationSelf"), "success");
        } else {
          showNotice(t("gameNoticeManualValidationWrong"), "danger");
          pushPlayerFeed(t("gameFeedManualValidationWrong"), "danger");
        }
      } else if (isCorrect) {
        pushPlayerFeed(t("gameFeedOtherManualValidated"), "info");
      }
      setValidationResultNoPoints(messageKey ? renderTemplate(messageKey, messageParams) : message);
      setCorrectAnswer(null);

    };

    socket.on("answerValidatedNoPoints", handleAnswerValidatedNoPoints);
    
    
    const handleRevealAnswer = (correctAnswer) => {
      setWaitingValidation(false);
      setCorrectAnswer(correctAnswer);
      showNotice(t("gameNoticeRevealByAdmin"), "info");
    };

    socket.on("revealAnswer", handleRevealAnswer);

    const handleGameOver = (data) => {
      setSessionStatus("Game Over");
      setQuestion(null);
      setSubmittedAnswer(null);
      setQuestionOptions([]);
      setLiveNotice(null);
      setWaitingValidation(false);
      setCorrectAnswer(null);
      let winnersArray = [];
  
      if (Array.isArray(data.winners)) {
        winnersArray = data.winners; // Multiple winners
      } else if (data.winners) {
        winnersArray = [data.winners]; // Convert single winner to an array
      }

    setWinningGroups(winnersArray.map((w) => w.group_id)); // Store winning group IDs

    if (winnersArray.length > 1) {
      const tieMessage = renderTemplate("gameAlertTie", {
        names: winnersArray.map((w) => w.name).join(", "),
      });
      toast.info(tieMessage);
      fireWinConfetti();
      setGameOverModal({
        open: true,
        message: tieMessage,
        winners: winnersArray,
      });
    } else if (winnersArray.length === 1) {
      const winnerMessage = renderTemplate("gameAlertWinner", {
        name: winnersArray[0].name,
      });
      toast.success(winnerMessage);
      fireWinConfetti();
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
    };

    socket.on("gameOver", handleGameOver);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("startGame", handleStartGame);
      socket.off("newQuestion", handleNewQuestion);
      socket.off("answerSubmitted", handleAnswerSubmitted);
      socket.off("timerCountdown", handleTimerCountdown);
      socket.off("timerStopped", handleTimerStopped);
      socket.off("camembertUpdated", handleCamembertUpdated);
      socket.off("answerValidated", handleAnswerValidated);
      socket.off("answerValidatedNoPoints", handleAnswerValidatedNoPoints);
      socket.off("revealAnswer", handleRevealAnswer);
      socket.off("gameOver", handleGameOver);
    };
  }, [sessionId, groupId]);

  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [timer]);

  const submitAnswer = (stoppedTimer = false) => {
    if (answer.trim() && !submittedAnswer) {
      setSubmittedAnswer(answer);
      setWaitingValidation(true);
      showNotice(t("gameNoticeAnswerSent"), "info");
      socket.emit("submitAnswer", {
        sessionId,
        groupId,
        questionId: question.id,
        answer,
        stoppedTimer,
      });
      setAnswer("");
    }
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
          camembert.push("grey"); // Fill empty segments with grey
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

  const getTimerVisualState = () => {
    if (!question || !question.allocated_time) {
      return "normal";
    }

    if (timer <= 0) {
      return "expired";
    }

    const ratio = timer / question.allocated_time;
    if (ratio <= 0.2) {
      return "critical";
    }

    if (ratio <= 0.5) {
      return "warning";
    }

    return "normal";
  };

  const timerVisualState = getTimerVisualState();

  useEffect(() => {
    const urlLanguage = new URLSearchParams(location.search).get("lang");
    if (urlLanguage) {
      setLanguage(urlLanguage);
    }
  }, [location.search, setLanguage]);

  if (sessionStatus === null) {
    return (
      <>
        <Header
          showHomeButton={false}
          showAdminButton={false}
          showLogoutButton={false}
          logoTargetPath={null}
        />
        <h1>{t("gameLoadingSession")}</h1>
      </>
    );
  }

  if (sessionErrorKey || sessionStatus === "Error") {
    return (
      <>
        <Header
          showHomeButton={false}
          showAdminButton={false}
          showLogoutButton={false}
          logoTargetPath={null}
        />
        <div className="game-container">
          <div className="game-state-message" role="alert" aria-live="assertive">
            <h2>{t("sessionErrorTitle")}</h2>
            <p>{t(sessionErrorKey || "sessionErrorGeneric")}</p>
          </div>
        </div>
      </>
    );
  }

  if (sessionStatus === "Draft") {
    return (
      <>
        <Header
          showHomeButton={false}
          showAdminButton={false}
          showLogoutButton={false}
          logoTargetPath={null}
        />
        <h1>{t("gameSessionNotActive")}</h1>
      </>
    );
  }

  return (
    <>
      <Header
        showHomeButton={false}
        showAdminButton={false}
        showLogoutButton={false}
        logoTargetPath={null}
      />
      <div className="game-container">
      {/* Top right button for rules */}
      <button className="rules-button" onClick={() => setShowRules(true)}>
        {t("gameRules")}
      </button>

      {/* Rules Modal */}
      {showRules && (
        <div className="modal-overlay" onClick={() => setShowRules(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{t("gameRules")}</h2>
            <br></br>
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {sessionDetails?.session_rules || t("gameNoRules")}
  </pre>
            <button className="close-button" onClick={() => setShowRules(false)}>{t("commonClose")}</button>
          </div>
        </div>
      )}

      {gameOverModal.open && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() =>
            setGameOverModal((prev) => ({
              ...prev,
              open: false,
            }))
          }
        >
          <div className="modal-content game-over-modal-content" onClick={(e) => e.stopPropagation()}>
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

      {sessionStatus === "Game Over" && (
        <>
          <h1>{t("gameOverTitle")}</h1>
          <h2>{t("gameFinalScore")}</h2>
          <ul className="pie-chart-list">
            {camemberts.map((cam) => (
              <li key={cam.group_id}>
              <img
                src={cam.avatar_url}
                alt={renderTemplate("gameGroupAvatarAlt", { name: cam.name })}
                className="group-avatar"
              />
              
              {winningGroups.includes(cam.group_id) && (
                    <span className="winner-badge">🏆 {t("gameWinner")}</span>
                  )}
                <h3>{cam.name}</h3>
                {generateCamemberts(cam.red_triangles, cam.green_triangles).map(
                  (segments, index) => (
                    <PieChart
                      key={`${cam.group_id}-${index}`}
                      segments={segments}
                    />
                  )
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {sessionStatus !== "Game Over" && (
        <div className="player-live-layout">
          <section className="player-main-panel">
            <div className="group-info">
              {group && group.avatar_url && (
                <img
                  src={group.avatar_url}
                  alt={renderTemplate("gameGroupAvatarAlt", { name: group.name })}
                  className="group-avatar"
                />
              )}
              {group && group.name && <h1>{group.name}</h1>}
            </div>

            {liveNotice && (
              <div key={liveNotice.key} className={`player-live-notice ${liveNotice.type}`}>
                {liveNotice.text}
              </div>
            )}

            {sessionStatus === "Activated" && (
              <div className="game-status-card">
                <h2>{t("gameWaitingStart")}</h2>
                <p>{t("gameWaitingStartDesc")}</p>
              </div>
            )}

            {sessionStatus === "In Progress" && !question && (
              <div className="game-status-card">
                <h2>{t("gameWaitingNextQuestion")}</h2>
                <p>{t("gameWaitingNextQuestionDesc")}</p>
              </div>
            )}

            {sessionStatus === "In Progress" && sessionStatus !== "Game Over" && question && (
              <>
                <div
                  className={`question ${question.type === "red" ? "red" : "green"}`}
                >
                  <div className="question-header">
                    {renderTemplate("gameQuestionCounter", {
                      current: questionIndex,
                      total: totalQuestions,
                    })}
                    <img
                      className="question-type-avatar"
                      src={`/avatars/${question.type}.svg`}
                      alt={renderTemplate("gameQuestionTypeAvatarAlt", { type: question.type })}
                    />
                    <div className={`question-label`}>
                      {question && question.type === "green"
                        ? sessionDetails.green_questions_label
                        : sessionDetails.red_questions_label}
                    </div>
                  </div>

                  <h3 style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {question.title}
                  </h3>
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
                            (314 * Math.max(timer, 0)) / question.allocated_time,
                        }}
                      />
                    </svg>
                    <div className={`timer-text ${timerVisualState}`}>
                      {timer > 0 ? `${timer}s` : t("gameTimerExpired")}
                    </div>
                  </div>
                  <div className={`timer-status ${timerVisualState}`}>
                    {timerVisualState === "critical"
                        ? t("gameTimerCritical")
                      : timerVisualState === "warning"
                        ? t("gameTimerWarning")
                      : timerVisualState === "expired"
                        ? t("gameTimerExpired")
                        : t("gameTimerRemaining")}
                  </div>

                  {!stoppedTimerGroup && !submittedAnswer && timer > 0 && (
                    <div>
                      {question.response_type === QUESTION_RESPONSE_TYPES.SINGLE_CHOICE ? (
                        <div>
                          <h4>{t("gameChooseOption")}</h4>
                          <form>
                            {questionOptions.map((option) => (
                              <div key={option.id}>
                                <label>
                                  <input
                                    type="radio"
                                    name="options"
                                    value={option.option_text}
                                    onChange={() => setAnswer(option.option_text)}
                                    checked={answer === option.option_text}
                                  />
                                  {option.option_text}
                                </label>
                              </div>
                            ))}
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                submitAnswer(false);
                              }}
                              disabled={!answer}
                            >
                              {t("gameSubmitAnswer")}
                            </button>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                submitAnswer(true);
                              }}
                              disabled={!answer}
                            >
                              {t("gameSubmitAndStop")}
                            </button>
                          </form>
                        </div>
                      ) : (
                        <div>
                          <label htmlFor="player-free-answer">{t("gameYourAnswer")}</label>
                          <input
                            id="player-free-answer"
                            type="text"
                            placeholder={t("gameEnterAnswer")}
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value)}
                          />
                          <div className="submit-buttons-container">
                            <button onClick={() => submitAnswer(false)}>
                              {t("gameSubmitAnswer")}
                            </button>
                            <button onClick={() => submitAnswer(true)}>
                              {t("gameSubmitAndStop")}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {stoppedTimerGroup && <h3>{t("gameTimerStoppedBy")} {stoppedTimerGroup}</h3>}

                {playerFeed.length > 0 && (
                  <div className="player-feed-board">
                    {playerFeed.map((item) => (
                      <div key={item.id} className={`player-feed-item ${item.type}`}>
                        {item.text}
                      </div>
                    ))}
                  </div>
                )}

                {submittedAnswer && (
                  <div className="player-answer-feedback">
                    <h3>{t("gameYourAnswer")}: </h3>
                    <span>{submittedAnswer}</span>
                    {waitingValidation && <h3>{t("gameWaitingValidation")}</h3>}

                    {validationResult === "correct" && (
                      <h3>
                        {renderTemplate("gameValidationCorrectPoints", {
                          points: stoppedTimerGroup ? 2 : 1,
                        })}
                      </h3>
                    )}
                    {validationResult === "wrong" && (
                      <h3>
                        {stoppedTimerGroup
                          ? t("gameValidationWrongWithOthersGain")
                          : t("gameValidationWrong")}
                      </h3>
                    )}

                    {validationResultNoPoints === "correct" && (
                      <h3>
                        {t("gameValidationNoPointsCorrect")}
                      </h3>
                    )}
                    {validationResultNoPoints === "wrong" && (
                      <h3>{t("gameValidationWrong")}</h3>
                    )}
                  </div>
                )}

                {validationResult && typeof validationResult === "string" && (
                  <div className="player-answer-feedback">
                    <h3>{validationResult}</h3>
                  </div>
                )}

                {validationResultNoPoints && typeof validationResultNoPoints === "string" && (
                  <div className="player-answer-feedback">
                    <h3>{validationResultNoPoints}</h3>
                  </div>
                )}

                {correctAnswer && (
                  <div className="player-answer-feedback">
                    <h3>{t("gameNoCorrectAnswer")} {correctAnswer}</h3>
                  </div>
                )}
              </>
            )}
          </section>

          <aside className="player-score-sidebar">
            <div className="player-score-sidebar-inner">
              <h2 className="game-panel-title">{t("gameScores")}</h2>
              <ul className="pie-chart-list player-score-list">
                {camemberts.map((cam) => (
                  <li key={cam.group_id}>
                    <h3>{cam.name}</h3>
                    <img
                      src={cam.avatar_url}
                      alt={renderTemplate("gameGroupAvatarAlt", { name: cam.name })}
                      className="group-avatar"
                    />
                    {generateCamemberts(cam.red_triangles, cam.green_triangles).map(
                      (segments, index) => (
                        <PieChart
                          key={`${cam.group_id}-${index}`}
                          segments={segments}
                        />
                      )
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      )}
      </div>
    </>
  );
}

export default Game;
