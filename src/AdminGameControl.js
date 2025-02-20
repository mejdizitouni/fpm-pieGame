import { useEffect, useState , useRef} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import Header from "./Header";
import Footer from "./Footer";
import PieChart from "./PieChart";
import "./AdminGameControl.css"; // Import the CSS file for styling

function AdminGameControl() {
  const API_URL = process.env.REACT_APP_API_URL;
  const { sessionId } = useParams();

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

  // Keep WebSocket instance in a ref to prevent reinitialization
  const socketRef = useRef(null);

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

      socketRef.current.emit("joinSession", { sessionId, role: "admin" });

      socketRef.current.on("connect", () => {
        console.log("WebSocket connected");
      });

      socketRef.current.on("disconnect", (reason) => {
        console.warn("WebSocket disconnected:", reason);
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

        if (question.response_type === "Question à choix unique") {
          const token = localStorage.getItem("token");
          try {
            const optionsRes = await fetch(`${API_URL}/questions/${question.id}/options`, {
              headers: { Authorization: token },
            });
            setQuestionOptions(await optionsRes.json());
          } catch (err) {
            console.error("Failed to fetch question options:", err);
            setQuestionOptions([]);
          }
        } else {
          setQuestionOptions([]);
        }
      });

      socketRef.current.on("answerSubmitted", (answer) => {
        setAnswers((prev) => [...prev, answer]);
      });

      socketRef.current.on("timerStopped", ({ groupId, groupName }) => {
        setStoppedTimerGroup({ groupId, groupName });
        setTimer(0);
        setIsTimeUp(true);
      });

      socketRef.current.on("camembertUpdated", ({ updatedCamemberts }) => {
        setCamemberts(updatedCamemberts);
      });

      socketRef.current.on("gameOver", (data) => {
        setCurrentQuestion(null);
        setTimer(0);
        setIsTimeUp(false);
        setSessionStatus("Game Over");

        let winnersArray = [];
        if (Array.isArray(data.winners)) {
          winnersArray = data.winners;
        } else if (data.winners) {
          winnersArray = [data.winners];
        }

        setWinningGroups(winnersArray.map((w) => w.group_id));

        if (winnersArray.length > 1) {
          alert(`🏆 Il y a un ex-aequo entre : ${winnersArray.map(w => w.name).join(", ")}`);
        } else if (winnersArray.length === 1) {
          alert(`🎉 Le gagnant est "${winnersArray[0].name}" ! 🏆`);
        } else {
          alert("Aucun gagnant. La partie est terminée !");
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

  const navigate = useNavigate();

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
            clearInterval(interval);
          }
          return newTimer;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

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
  };

  const validateAnswerNoPoints = (answer, groupId, isCorrect) => {
    socketRef.current.emit("validateAnswerNoPoints", {
      sessionId,
      groupId,
      questionId: currentQuestion.id,
      isCorrect,
      stoppedTimer: answer.stoppedTimer,
    });
  };

  const revealAnswer = () => {
    if (currentQuestion) {
      socketRef.current.emit("revealAnswer", currentQuestion.expected_answer);
    }
  };

  const nextQuestion = () => {
    socketRef.current.emit("nextQuestion", sessionId);
    setAnswers([]);
    setCorrectAnswer(null);
    setIsTimeUp(false);
    setStoppedTimerGroup(null);
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
    } catch (err) {
      console.error("Error updating points:", err);
    }
  };

  if (sessionStatus === null) {
    return <h1>Chargement de la session...</h1>;
  }

  if (sessionStatus == "Draft") {
    return <h1>Cette session n'est pas encore Active.</h1>;
  }

  return (
    <>
      <Header />
      <div className="admin-game-control-container">
        {sessionStatus === "Activated" && (
          <button className="start-game-button" onClick={startGame}>
            Démarrer la session
          </button>
        )}

        {sessionStatus === "In Progress" && (
          <button className="end-game-button" onClick={endGame}>
            Arrêter la session
          </button>
        )}

{sessionStatus === "In Progress" && !currentQuestion && (
          <button
            className="next-question-button"
            onClick={nextQuestion}
          >
            Question Suivante
          </button>
        )}

        {sessionStatus === "In Progress" && currentQuestion && (
          <button
            className="next-question-button"
            onClick={nextQuestion}
            disabled={!currentQuestion}
          >
            Question Suivante
          </button>
        )}

        {sessionStatus === "Game Over" && (
          <>
            <h1>Game Over!</h1>
            <h2>Score Final</h2>
            <ul className="pie-chart-list">
              {camemberts.map((cam) => (
                <li key={cam.group_id}>
                  <h3>{cam.name}</h3>
                  <img
                    src={cam.avatar_url}
                    alt={`${cam.name} Avatar`}
                    className="group-avatar"
                  />
                  {winningGroups.includes(cam.group_id) && (
                    <span className="winner-badge">🏆 Winner</span>
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

        {sessionStatus !== "Game Over" && currentQuestion && (
          <>
            <div
              className={`current-question ${
                currentQuestion.type === "red" ? "red" : "green"
              }`}
            >
              <div className="question-header">
                Question {questionIndex}/{totalQuestions}:
                {/* <img
                  class="question-type-avatar"
                  src={currentQuestion.question_icon}
                  alt={`${currentQuestion.type} Avatar`}
                /> */}
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
              </h3>{" "}
              <p>Réponse attendue: {currentQuestion.expected_answer}</p>
              <div className="timer-circle">
                <svg className="progress-ring" width="100" height="100">
                  <circle
                    className="progress-ring__circle"
                    stroke="#007bff"
                    strokeWidth="6"
                    fill="transparent"
                    r="45"
                    cx="50"
                    cy="50"
                    style={{
                      strokeDasharray: 283, // Circumference of the circle (2 * π * r)
                      strokeDashoffset:
                        (283 * timer) / currentQuestion.allocated_time, // Progress
                    }}
                  />
                </svg>
                <div className="timer-text">
                  {timer > 0 ? `${timer}s` : "Time's Up!"}
                </div>
              </div>
              {isTimeUp && <h3>Time's Up!</h3>}
              {stoppedTimerGroup && (
                <h4>e timer a été arrêté par: {stoppedTimerGroup.groupName}</h4>
              )}
              {currentQuestion.response_type === "Question à choix unique" && (
                <div>
                  <h4>Options:</h4>
                  <ul className="options-list">
                    {questionOptions.map((option, index) => (
                      <li key={index}>{option.option_text}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {sessionStatus === "In Progress" && !currentQuestion && (
              <button
                className="next-question-button"
                onClick={nextQuestion}
              >
                Question suivante
              </button>
            )}


            {sessionStatus === "In Progress" && currentQuestion && (
              <button
                className="next-question-button"
                onClick={nextQuestion}
                disabled={!currentQuestion}
              >
                Question suivante
              </button>
            )}

            <button
              className="reveal-answer-button"
              onClick={revealAnswer}
              disabled={correctAnswer}
            >
              Révéler la bonne réponse
            </button>
          </>
        )}

        {sessionStatus !== "Game Over" && answers && answers.length > 0 && (
          <>
            <h2>Réponses soumises</h2>
            <ul className="answers-list">
              {answers.map((answer, index) => (
                <li key={index} className="answer-item">
                  <strong>{answer.groupName}</strong>: {answer.answer}
                  {answer.stoppedTimer && <em> (Stopped Timer)</em>}
                  <button
                    className="validate-button correct"
                    onClick={() => validateAnswer(answer, answer.groupId, true)}
                  >
                    Correcte
                  </button>
                  <button
                    className="validate-button correct"
                    onClick={() =>
                      validateAnswerNoPoints(answer, answer.groupId, true)
                    }
                  >
                    Correcte (attribution manuelle des points)
                  </button>
                  {answer.stoppedTimer && (
                    <button
                      className="validate-button incorrect"
                      onClick={() =>
                        validateAnswer(answer, answer.groupId, false)
                      }
                    >
                      Incorrecte
                    </button>
                  )}
                  {answer.stoppedTimer && (
                    <button
                      className="validate-button incorrect"
                      onClick={() =>
                        validateAnswerNoPoints(answer, answer.groupId, false)
                      }
                    >
                      Incorrecte (attribution manuelle des points)
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {sessionStatus !== "Game Over" && (
          <>
            <h2>Scores</h2>
            <ul className="pie-chart-list">
              {camemberts.map((cam) => (
                <li key={cam.group_id}>
                  <div className="group-header">
                    <h3>{cam.name}</h3>
                    <img
                      src={cam.avatar_url}
                      alt={`${cam.name} Avatar`}
                      className="group-avatar"
                    />
                    <div className="points-control">
                      {/* Red Points */}
                      <button
                        className="minus-button"
                        onClick={() => updatePoints(cam.group_id, "red", -1)}
                      >
                        -
                      </button>
                      <span className="points-display">
                        Rouge: {cam.red_triangles}
                      </span>
                      <button
                        className="plus-button"
                        onClick={() => updatePoints(cam.group_id, "red", 1)}
                      >
                        +
                      </button>

                      {/* Green Points */}
                      <button
                        className="minus-button"
                        onClick={() => updatePoints(cam.group_id, "green", -1)}
                      >
                        -
                      </button>
                      <span className="points-display">
                        Vert: {cam.green_triangles}
                      </span>
                      <button
                        className="plus-button"
                        onClick={() => updatePoints(cam.group_id, "green", 1)}
                      >
                        +
                      </button>
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
          </>
        )}
      </div>
      <Footer />
    </>
  );
}

export default AdminGameControl;
