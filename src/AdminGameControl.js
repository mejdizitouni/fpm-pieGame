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
  const [timer, setTimer] = useState(0);
  const [isTimeUp, setIsTimeUp] = useState(false);
  const [correctAnswer, setCorrectAnswer] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(null); // Current question index
  const [totalQuestions, setTotalQuestions] = useState(null); // Total questions in the session
  const [status, setStatus] = useState("waiting"); // "waiting" | "active" | "gameOver"
  const [stoppedTimerGroup, setStoppedTimerGroup] = useState(null); // Group that stopped the timer
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
          {
            headers: { Authorization: token },
          }
        );
        const camembertsRes = await fetch(
          `${API_URL}/sessions/${sessionId}/camemberts`,
          {
            headers: { Authorization: token },
          }
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
      ({ question, timer, questionIndex, totalQuestions }) => {
        setCurrentQuestion(question);
        setTimer(timer);
        setQuestionIndex(questionIndex);
        setTotalQuestions(totalQuestions);
        setIsTimeUp(false);
        setAnswers([]);
        setCorrectAnswer(null);
        setStoppedTimerGroup(null);
        setStatus("active");
      }
    );

    socket.on("answerSubmitted", (answer) => {
      setAnswers((prev) => [...prev, answer]);
    });

    socket.on("timerStopped", ({ groupId, groupName }) => {
      setStoppedTimerGroup({ groupId, groupName });
      setTimer(0); // Stop the timer for everyone
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
                  <PieChart
                    redPoints={cam.red_triangles}
                    greenPoints={cam.green_triangles}
                  />
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
                  <button
                    onClick={() =>
                      validateAnswer(answer, answer.groupId, false)
                    }
                  >
                    Incorrect
                  </button>
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
              <PieChart
                redPoints={cam.red_triangles}
                greenPoints={cam.green_triangles}
              />
            </li>
          ))}
        </ul>
      </div>
      <Footer />
    </>
  );
}

export default AdminGameControl;
