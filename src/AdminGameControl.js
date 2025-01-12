import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import Header from "./Header";
import Footer from "./Footer";
import PieChart from "./PieChart";

function AdminGameControl() {
  const API_URL = process.env.REACT_APP_API_URL;
  const { sessionId } = useParams();

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
  const [status, setStatus] = useState("waiting");
  const [stoppedTimerGroup, setStoppedTimerGroup] = useState(null);
  const socket = io(API_URL);
  const navigate = useNavigate();

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

    socket.emit("joinSession", { sessionId, role: "admin" });

    socket.on(
      "newQuestion",
      async ({ question, timer, questionIndex, totalQuestions }) => {
        setCurrentQuestion(question);
        setTimer(timer);
        setQuestionIndex(questionIndex);
        setTotalQuestions(totalQuestions);
        setIsTimeUp(false);
        setAnswers([]);
        setCorrectAnswer(null);
        setStoppedTimerGroup(null);
        setStatus("active");

        // Fetch options if the question is red-type
        if (question.type === "red") {
          const token = localStorage.getItem("token");
          try {
            const optionsRes = await fetch(
              `${API_URL}/questions/${question.id}/options`,
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

    socket.on("answerSubmitted", (answer) => {
      setAnswers((prev) => [...prev, answer]);
    });

    socket.on("timerStopped", ({ groupId, groupName }) => {
      setStoppedTimerGroup({ groupId, groupName });
      setTimer(0);
      setIsTimeUp(true);
    });

    socket.on("camembertUpdated", ({ updatedCamemberts }) => {
      console.log("updatedCamemberts --> ", updatedCamemberts);
      setCamemberts(updatedCamemberts);
    });

    socket.on("gameOver", () => {
      setCurrentQuestion(null);
      setTimer(0);
      setIsTimeUp(false);
      setStatus("gameOver");
    });

    return () => {
      socket.off("newQuestion");
      socket.off("answerSubmitted");
      socket.off("timerStopped");
      socket.off("camembertUpdated");
      socket.off("gameOver");
    };
  }, [API_URL, sessionId]);

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

  const startGame = () => {
    socket.emit("startGame", sessionId);
  };

  const validateAnswer = (answer, groupId, isCorrect) => {
    if (!currentQuestion) return;

    socket.emit("validateAnswer", {
      sessionId,
      groupId,
      questionId: currentQuestion.id,
      isCorrect,
      stoppedTimer: answer.stoppedTimer,
    });
  };

  const revealAnswer = () => {
    if (currentQuestion) {
      socket.emit("revealAnswer", currentQuestion.expected_answer);
      setCorrectAnswer(currentQuestion.expected_answer);
    }
  };

  const nextQuestion = () => {
    socket.emit("nextQuestion", sessionId);
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

  return (
    <>
      <Header />
      <div className="admin-game-control-container">
        <h1>Admin Game Control</h1>

        {status === "waiting" && (
          <button onClick={startGame}>Start Game</button>
        )}
        {status === "active" && currentQuestion && (
          <button onClick={nextQuestion} disabled={!currentQuestion}>
            Next Question
          </button>
        )}

        {status === "gameOver" && (
          <>
            <h1>Game Over!</h1>
            <h2>Final Scores</h2>
            <ul className="pie-chart-list">
              {camemberts.map((cam) => (
                <li key={cam.group_id}>
                  <h3>{cam.name}</h3>
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

        {status !== "gameOver" && currentQuestion && (
          <>
            <h2>
              Question {questionIndex}/{totalQuestions}
            </h2>
            <div>
              <h3>{currentQuestion.title}</h3>
              <p>
                Type:{" "}
                {currentQuestion.type === "red"
                  ? "Red (Calculation)"
                  : "Green (Quick Answer)"}
              </p>
              <p>Expected Answer: {currentQuestion.expected_answer}</p>
              <p>
                Time Remaining: {timer > 0 ? `${timer} seconds` : "Time's Up!"}
              </p>
              {isTimeUp && <h3>Time's Up!</h3>}
              {stoppedTimerGroup && (
                <h4>Timer was stopped by: {stoppedTimerGroup.groupName}</h4>
              )}
              {currentQuestion.type === "red" && (
                <div>
                  <h4>Options:</h4>
                  <ul>
                    {questionOptions.map((option, index) => (
                      <li key={index}>{option.option_text}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <button onClick={revealAnswer} disabled={correctAnswer}>
              Reveal Answer
            </button>
            {correctAnswer && (
              <div>
                <h3>Correct Answer: {correctAnswer}</h3>
              </div>
            )}
          </>
        )}

        {status !== "gameOver" && (
          <>
            <h2>Answers Submitted</h2>
            <ul>
              {answers.map((answer, index) => (
                <li key={index}>
                  <strong>{answer.groupName}</strong>: {answer.answer}
                  {answer.stoppedTimer && <em> (Stopped Timer)</em>}
                  <button
                    onClick={() => validateAnswer(answer, answer.groupId, true)}
                  >
                    Correct
                  </button>
                  {answer.stoppedTimer && (
                    <button
                      onClick={() =>
                        validateAnswer(answer, answer.groupId, false)
                      }
                    >
                      Incorrect
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        <h2>Camembert Progress</h2>
        <ul className="pie-chart-list">
          {camemberts.map((cam) => (
            <li key={cam.group_id}>
              <h3>{cam.name}</h3>
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
      <Footer />
    </>
  );
}

export default AdminGameControl;
