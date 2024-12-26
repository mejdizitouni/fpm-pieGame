import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";

function AdminGameControl() {
  const API_URL = process.env.REACT_APP_API_URL;
  const { sessionId } = useParams();

  const [groups, setGroups] = useState([]);
  const [camemberts, setCamemberts] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [timer, setTimer] = useState(30);
  const socket = io(API_URL);

  useEffect(() => {
    // Fetch initial data and join the session
    const fetchInitialData = async () => {
      const token = localStorage.getItem("token");
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
            // Convert group_id to string to ensure the comparison works correctly
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
  };

  const nextQuestion = () => {
    socket.emit("nextQuestion", sessionId);
    setAnswers([]); // Clear answers for the new question
  };

  return (
    <div className="container">
      <h1>Admin Game Control</h1>

      <button onClick={startGame}>Start Game</button>
      <button onClick={nextQuestion}>Next Question</button>

      <h2>Current Question</h2>
      {currentQuestion ? (
        <div>
          <h3>{currentQuestion.title}</h3>
          <p>Type: {currentQuestion.type}</p>
          <p>Timer: {timer} seconds</p>
        </div>
      ) : (
        <p>No active question</p>
      )}

      <h2>Answers Submitted</h2>
      <ul>
        {answers.map((answer, index) => (
          <li key={index}>
            <strong>{answer.groupName}</strong>: {answer.answer}
            <button onClick={() => validateAnswer(answer, answer.groupId)}>Validate</button>
          </li>
        ))}
      </ul>

      <h2>Camembert Progress</h2>
<ul>
  {camemberts.map((cam) => (
    <li key={cam.group_id}>
      {cam.name}: Red - {cam.red_triangles}, Green - {cam.green_triangles}
    </li>
  ))}
</ul>
    </div>
  );
}

export default AdminGameControl;
