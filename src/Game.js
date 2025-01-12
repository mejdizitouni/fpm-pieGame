import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";
import PieChart from "./PieChart";
import "./Game.css"; // Import the CSS file for styling

const socket = io(process.env.REACT_APP_API_URL);

function Game() {
  const { sessionId, groupId } = useParams();

  const [status, setStatus] = useState("waiting"); // "waiting" | "active" | "timeUp" | "gameOver"
  const [question, setQuestion] = useState(null); // Current question
  const [questionOptions, setQuestionOptions] = useState([]); // Options for red questions
  const [timer, setTimer] = useState(0); // Countdown timer
  const [answer, setAnswer] = useState(""); // Player's input answer
  const [submittedAnswer, setSubmittedAnswer] = useState(null); // Submitted answer
  const [waitingValidation, setWaitingValidation] = useState(false); // Waiting for validation
  const [validationResult, setValidationResult] = useState(null); // Validation result: "correct" or "wrong"
  const [correctAnswer, setCorrectAnswer] = useState(null); // Correct answer after reveal
  const [camemberts, setCamemberts] = useState([]); // Camembert scores
  const [questionIndex, setQuestionIndex] = useState(null); // Current question index
  const [totalQuestions, setTotalQuestions] = useState(null); // Total questions in the session
  const [stoppedTimerGroup, setStoppedTimerGroup] = useState(null); // Group that stopped the timer

  useEffect(() => {
    const fetchInitialData = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;

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

    // Join session as a player
    socket.emit("joinSession", { sessionId, groupId, role: "player" });

    // Listen for game events
    socket.on("startGame", () => {
      setStatus("active");
      setCorrectAnswer(null);
    });

    socket.on(
      "newQuestion",
      async ({ question, timer, questionIndex, totalQuestions }) => {
        setQuestion(question);
        setTimer(timer);
        setQuestionIndex(questionIndex);
        setTotalQuestions(totalQuestions);
        setStatus("active");
        setValidationResult(null);
        setSubmittedAnswer(null);
        setStoppedTimerGroup(null);
        setWaitingValidation(false);

        // Fetch options if the question is red-type
        if (question.type === "red") {
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
          setQuestionOptions([]); // Clear options for green questions
        }
      }
    );

    socket.on("timerCountdown", (remainingTime) => {
      setTimer(remainingTime);
      if (remainingTime === 0) {
        setStatus("timeUp");
      }
    });

    socket.on("timerStopped", ({ groupName }) => {
      setTimer(0);
      setStatus("timeUp");
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

    socket.on("revealAnswer", (correctAnswer) => {
      setCorrectAnswer(correctAnswer);
    });

    socket.on("gameOver", () => {
      setStatus("gameOver");
    });

    return () => {
      socket.disconnect();
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

  return (
    <div className="game-container">
      {status === "waiting" && <h1>Waiting for the game to start...</h1>}

      {status === "gameOver" && (
        <>
          <h1>Game Over!</h1>
          <h2>Final Scores</h2>
          <ul className="pie-chart-list">
            {camemberts.map((cam) => (
              <li key={cam.group_id}>
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

      {status !== "waiting" && status !== "gameOver" && question && (
        <>
          <div className="question">
            <h2>
              Question {questionIndex}/{totalQuestions}
            </h2>
            <h1>Question: {question.title}</h1>
            <p>
              Type:{" "}
              {question.type === "red"
                ? "Red (Calculation)"
                : "Green (Quick Answer)"}
            </p>
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
    {timer > 0 ? `${timer}s` : "Time's Up!"}
  </div>
</div>

          </div>

          {stoppedTimerGroup && <h3>Timer stopped by: {stoppedTimerGroup}</h3>}

          {!stoppedTimerGroup && !submittedAnswer && timer > 0 && (
            <div>
              {question.type === "red" ? (
                // Single choice for red questions
                <div>
                  <h4>Select an option:</h4>
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
                      Submit Answer
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        submitAnswer(true);
                      }}
                      disabled={!answer}
                    >
                      Stop Timer and Submit
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
                  <button onClick={() => submitAnswer(false)}>
                    Submit Answer
                  </button>
                  <button onClick={() => submitAnswer(true)}>
                    Stop Timer and Submit
                  </button>
                </div>
              )}
            </div>
          )}

          {submittedAnswer && (
            <div>
              <h3>Your Answer:</h3>
              <span>{submittedAnswer}</span>
              {waitingValidation && <h3>Waiting for answer validation...</h3>}
              {validationResult === "correct" && (
                <h3>
                  Your answer is correct! You earned {stoppedTimerGroup ? 3 : 1}{" "}
                  point
                  {stoppedTimerGroup ? "s" : ""}!
                </h3>
              )}
              {validationResult === "wrong" && (
                <h3>
                  Your answer is wrong!{" "}
                  {stoppedTimerGroup && "Other players earned 1 point each."}
                </h3>
              )}
            </div>
          )}

          {correctAnswer && (
            <div>
              <h3>The Correct Answer is: {correctAnswer}</h3>
            </div>
          )}
        </>
      )}

      <h2>Camembert Progress</h2>
      <ul className="pie-chart-list">
        {camemberts.map((cam) => (
          <li key={cam.group_id}>
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
    </div>
  );
}

export default Game;
