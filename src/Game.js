import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";
import PieChart from "./PieChart";
import "./Game.css"; // Import the CSS file for styling

const socket = io(process.env.REACT_APP_API_URL);

function Game() {
  const { sessionId, groupId } = useParams();

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

  useEffect(() => {
    const fetchSessionStatus = async () => {
      try {
        const token = localStorage.getItem("token");

        // Fetch session status
        const response = await fetch(
          `${process.env.REACT_APP_API_URL}/sessions/${sessionId}`,
          {
            headers: { Authorization: token },
          }
        );
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
  }, [sessionId]);

  useEffect(() => {
    // if (sessionStatus !== "Activated") return;

    const fetchInitialData = async () => {
      const token = localStorage.getItem("token");

      try {
        const camembertsRes = await fetch(
          `${process.env.REACT_APP_API_URL}/sessions/${sessionId}/camemberts`,
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
          `${process.env.REACT_APP_API_URL}/sessions/${sessionId}/groups/${groupId}`
        );
        const data = await response.json();
        setGroup(data);
      } catch (err) {
        console.error("Failed to fetch group data:", err);
      }
    };

    fetchGroupData();

    // Join session as a player
    socket.emit("joinSession", { sessionId, groupId, role: "player" });

    // Listen for game events
    socket.on("startGame", () => {
      setSessionStatus("In Progress");
      setCorrectAnswer(null);
    });

    socket.on(
      "newQuestion",
      async ({ question, timer, questionIndex, totalQuestions }) => {
        setSessionStatus("In Progress");
        setQuestion(question);
        setTimer(timer);
        setQuestionIndex(questionIndex);
        setTotalQuestions(totalQuestions);
        setSubmittedAnswer(null);
        setStoppedTimerGroup(null);
        setWaitingValidation(false);
        setValidationResult(null);
        setValidationResultNoPoints(null);

        // Fetch options if the question is red-type
        if (question.response_type === "Question à choix unique") {
          const token = localStorage.getItem("token");
          try {
            const optionsRes = await fetch(
              `${process.env.REACT_APP_API_URL}/questions/${question.id}/options`,
              { headers: { Authorization: token } }
            );
            setQuestionOptions(await optionsRes.json());
          } catch (err) {
            console.error("Failed to fetch question options:", err);
            setQuestionOptions([]);
          }
        } else {
          setQuestionOptions([]);
        }
      }
    );

    socket.on("timerCountdown", (remainingTime) => {
      setTimer(remainingTime);
      if (remainingTime === 0) {
      }
    });

    socket.on("timerStopped", ({ groupName }) => {
      setTimer(0);
      setStoppedTimerGroup(groupName);
    });

    socket.on("camembertUpdated", ({ updatedCamemberts }) => {
      setCamemberts(updatedCamemberts);
    });

    socket.on("answerValidated", ({ groupId: validatedGroupId, isCorrect }) => {
      if (parseInt(validatedGroupId) === parseInt(groupId)) {
        setValidationResult(isCorrect ? "correct" : "wrong");
        setWaitingValidation(false);
      }
    });

    socket.on(
      "answerValidatedNoPoints",
      ({ groupId: validatedGroupId, isCorrect }) => {
        if (parseInt(validatedGroupId) === parseInt(groupId)) {
          setValidationResultNoPoints(isCorrect ? "correct" : "wrong");
          setWaitingValidation(false);
        }
      }
    );

    socket.on("revealAnswer", (correctAnswer) => {
      setCorrectAnswer(correctAnswer);
    });

    socket.on("gameOver", (data) => {
      setSessionStatus("Game Over");
      let winnersArray = [];
  
      if (Array.isArray(data.winners)) {
        winnersArray = data.winners; // Multiple winners
      } else if (data.winners) {
        winnersArray = [data.winners]; // Convert single winner to an array
      }

    setWinningGroups(winnersArray.map((w) => w.group_id)); // Store winning group IDs

    if (winnersArray.length > 1) {
      alert(`🏆 Il y a un ex-aequo entre : ${winnersArray.map(w => w.name).join(", ")}`);
    } else if (winnersArray.length === 1) {
      alert(`🎉 Le gagnant est "${winnersArray[0].name}" ! 🏆`);
    } else {
      alert("Aucun gagnant. La partie est terminée !");
    }
    });

    // return () => {
    //   socket.disconnect();
    // };
  }, [sessionId, groupId, sessionStatus]);

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

  if (sessionStatus === null) {
    return <h1>Chargement de la session...</h1>;
  }

  if (sessionStatus == "Draft") {
    return <h1>Cette session n'est pas encore Active.</h1>;
  }

  return (
    <div className="game-container">
      <div className="group-info">
        {group && group.avatar_url && (
          <img
            src={group.avatar_url}
            alt={`${group.name} Avatar`}
            className="group-avatar"
          />
        )}
        {group && group.name && <h1>{group.name}</h1>}
      </div>

      
      {sessionStatus === "Activated" && <h1>En attente du démarrage de la session...</h1>}

      {sessionStatus === "In Progress" && <h1>En attente de la question suivante...</h1>}

      {sessionStatus === "Game Over" && (
        <>
          <h1>Game Over!</h1>
          <h2>Score Final</h2>
          <ul className="pie-chart-list">
            {camemberts.map((cam) => (
              <li key={cam.group_id}>
              <img
                src={cam.avatar_url}
                alt={`${cam.name} Avatar`}
                className="group-avatar"
              />
              
              {winningGroups.includes(cam.group_id) && (
                    <span className="winner-badge">🏆 Winner</span>
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

      {sessionStatus == "In Progress" && sessionStatus !== "Game Over" && question && (
        <>
          <div
            className={`question ${question.type === "red" ? "red" : "green"}`}
          >
            <div className="question-header">
              Question {questionIndex}/{totalQuestions}:
              {/* <img
                class="question-type-avatar"
                src={question.question_icon}
                alt={`${question.type} Avatar`}
              /> */}
              <div className={`question-label`}>
                {question && question.type === "green"
                  ? sessionDetails.green_questions_label
                  : sessionDetails.red_questions_label}
              </div>
            </div>

            <h3 style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
  {question.title}
</h3>
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
                    strokeDashoffset: (283 * timer) / question.allocated_time, // Progress
                  }}
                />
              </svg>
              <div className="timer-text">
                {timer > 0 ? `${timer}s` : "Fin du temps imparti"}
              </div>
            </div>

            {!stoppedTimerGroup && !submittedAnswer && timer > 0 && (
              <div>
                {question.response_type === "Question à choix unique" ? (
                  // Single choice for red questions
                  <div>
                    <h4>Choisir une option:</h4>
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
                        Soumettre la réponse
                      </button>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          submitAnswer(true);
                        }}
                        disabled={!answer}
                      >
                        Soumettre la réponse et arrêter le timer
                      </button>
                    </form>
                  </div>
                ) : (
                  // Input for green questions
                  <div>
                    <input
                      type="text"
                      placeholder="Enter your answer"
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                    />
                    <div class="submit-buttons-container">
                      <button onClick={() => submitAnswer(false)}>
                        Soumettre la réponse
                      </button>
                      <button onClick={() => submitAnswer(true)}>
                        Soumettre la réponse et arrêter le timer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {stoppedTimerGroup && <h3>Le timer a été arrêté par: {stoppedTimerGroup}</h3>}

          {submittedAnswer && (
            <div>
              <h3>Votre réponse:</h3>
              <span>{submittedAnswer}</span>
              {waitingValidation && <h3>En attente de validation de la réponse...</h3>}
              {validationResult === "correct" && (
                <h3>
                  Votre réponse est correcte! Vous avez gagné  {stoppedTimerGroup ? 2 : 1}{" "}
                  point
                  {stoppedTimerGroup ? "s" : ""}!
                </h3>
              )}
              {validationResult === "wrong" && (
                <h3>
                  Votre réponse est incorrecte!{" "}
                  {stoppedTimerGroup && "Other players earned 1 point each."}
                </h3>
              )}
              {validationResultNoPoints === "correct" && (
                <h3>
                  Votre réponse est correcte ! Choissisez la répartition de vos points.
                </h3>
              )}
              {validationResultNoPoints === "wrong" && (
                <h3>Votre réponse est incorrecte!</h3>
              )}
            </div>
          )}

          {correctAnswer && (
            <div>
              <h3>Votre réponse est correcte: {correctAnswer}</h3>
            </div>
          )}
        </>
      )}

      {sessionStatus !== "Game Over" && (
        <>
          {" "}
          <h2>Scores</h2>
          <ul className="pie-chart-list">
            {camemberts.map((cam) => (
              <li key={cam.group_id}>
                <h3>{cam.name}</h3>
                <img
                  src={cam.avatar_url}
                  alt={`${cam.name} Avatar`}
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
        </>
      )}
    </div>
  );
}

export default Game;
