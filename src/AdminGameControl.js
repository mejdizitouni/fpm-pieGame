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
  const [timer, setTimer] = useState(30);
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
        const groupsRes = await fetch(`${API_URL}/sessions/${sessionId}/groups`, {
          headers: { Authorization: token },
        });
        const camembertsRes = await fetch(`${API_URL}/sessions/${sessionId}/camemberts`, {
          headers: { Authorization: token },
        });
        setGroups(await groupsRes.json());
        setCamemberts(await camembertsRes.json());
      } catch (err) {
        console.error("Failed to fetch initial data:", err);
      }
    };

    fetchInitialData();
    socket.emit("joinSession", { sessionId, role: "admin" });

    socket.on("camembertUpdated", (progress) => {
      setCamemberts((prev) => {
        const updatedCamemberts = prev.map((cam) => {
          if (cam.group_id === parseInt(progress.groupId)) {
            return {
              ...cam,
              [progress.triangleType]: cam[progress.triangleType] + progress.scoreChange,
            };
          }
          return cam;
        });
        return updatedCamemberts;
      });
    });

    socket.on("answerSubmitted", (answer) => {
      setAnswers((prev) => [...prev, answer]);
    });

    socket.on("newQuestion", ({ question, timer }) => {
      setCurrentQuestion(question);
      setTimer(timer);
    });

    return () => {
      socket.off("newQuestion");
    };
  }, [API_URL, sessionId]);

  const startGame = () => {
    socket.emit("startGame", sessionId);
  };

  const validateAnswer = (answer, groupId) => {
    if (!currentQuestion) {
      return;
    }

    const isCorrect = window.confirm(`Is the answer "${answer.answer}" correct?`);
    const multiplier = answer.stoppedTimer ? 2 : 1;

    socket.emit("validateAnswer", {
      sessionId,
      groupId,
      questionId: currentQuestion.id,
      isCorrect,
      multiplier,
    });

    // Emit event for player to know the answer is validated
    socket.emit("answerValidated", { groupId });
  };

  const nextQuestion = () => {
    socket.emit("nextQuestion", sessionId);
    setAnswers([]); // Clear answers for the new question
  };

  return (
    <>
      <Header />
      <div className="admin-game-control-container">
        <h1>Admin Game Control</h1>

        <button onClick={startGame}>Start Game</button>
        <button onClick={nextQuestion}>Next Question</button>

        <h2>Current Question</h2>
        {currentQuestion ? (
          <div>
            <h3>{currentQuestion.title}</h3>
            <p>Type: {currentQuestion.type}</p>
            <p>Title: {currentQuestion.title}</p>
            <p>Expected Answer: {currentQuestion.expected_answer}</p>
            <p>Allocated Time: {timer} seconds</p>
          </div>
        ) : (
          <p>No active question</p>
        )}

        <h2>Answers Submitted</h2>
        <ul>
          {answers.map((answer, index) => (
            <li key={index}>
              <strong>{answer.groupName}</strong>: {answer.answer}
              <button onClick={() => validateAnswer(answer, answer.groupId)}>
                Validate
              </button>
            </li>
          ))}
        </ul>

        <h2>Camembert Progress</h2>
        <ul className="pie-chart-list">
          {camemberts.map((cam) => (
            <li key={cam.group_id}>
              <h3>{cam.name}</h3>
              <PieChart redPoints={cam.red_triangles} greenPoints={cam.green_triangles} />
            </li>
          ))}
        </ul>
      </div>
      <Footer />
    </>
  );
}

export default AdminGameControl;
