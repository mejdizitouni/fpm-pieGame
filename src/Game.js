import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";
import PieChart from "./PieChart"; 

const socket = io(process.env.REACT_APP_API_URL);

function Game() {
  const { sessionId, groupId } = useParams();

  const [status, setStatus] = useState("waiting");
  const [question, setQuestion] = useState(null);
  const [timer, setTimer] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submittedAnswer, setSubmittedAnswer] = useState(null);
  const [waitingForValidation, setWaitingForValidation] = useState(false);
  const [camemberts, setCamemberts] = useState([]);
  const [answerValidated, setAnswerValidated] = useState(false);

  useEffect(() => {
    const fetchInitialData = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        return;
      }

      try {
        const camembertsRes = await fetch(`${process.env.REACT_APP_API_URL}/sessions/${sessionId}/camemberts`, {
          headers: { Authorization: token },
        });
        setCamemberts(await camembertsRes.json());
      } catch (err) {
        console.error("Failed to fetch initial data:", err);
      }
    };

    socket.emit("joinSession", { sessionId, groupId, role: "player" });

    socket.on("startGame", () => {
      setStatus("active");
    });

    socket.on("newQuestion", ({ question, timer }) => {
      setQuestion(question);
      setTimer(timer);
      setStatus("active");
      setAnswerValidated(false);
    });

    socket.on("camembertUpdated", (progress) => {
      setCamemberts((prev) => {
        const updatedCamemberts = prev.map((cam) => {
          if (cam.group_id === parseInt(progress.groupId)) {
            const updatedValue = cam[progress.triangleType] || 0;
            return {
              ...cam,
              [progress.triangleType]: updatedValue + progress.scoreChange,
            };
          }
          return cam;
        });
        return updatedCamemberts;
      });
    });

    fetchInitialData();

    return () => socket.disconnect();
  }, [sessionId, groupId]);

  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    } else if (timer === 0 && question) {
      setStatus("waiting");
    }
  }, [timer, question]);

  const submitAnswer = (stoppedTimer = false) => {
    if (answer.trim()) {
      setSubmittedAnswer(answer);
      setWaitingForValidation(true);
      socket.emit("submitAnswer", {
        sessionId,
        groupId,
        questionId: question.id,
        answer,
        stoppedTimer, // This value is passed when the player stops the timer
      });
      setAnswer(""); // Clear the input
    }
  };  

  useEffect(() => {
    socket.on("answerValidated", (validationData) => {
      if (validationData.groupId === parseInt(groupId)) {
        setAnswerValidated(true); // Set the validation flag
        setWaitingForValidation(false); // Remove the "waiting for validation" message
      }
    });

    return () => socket.off("answerValidated");
  }, [groupId]);

  return (
    <div className="game-container">
      {status === "waiting" && <h1>Waiting for the game to start...</h1>}

      {status === "active" && question && (
        <>
          <h1>Question: {question.title}</h1>
          <p>Type: {question.type === "red" ? "Red (Calculation)" : "Green (Quick Answer)"}</p>
          <p>Time Remaining: {timer} seconds</p>

          {submittedAnswer && !answerValidated ? (
            <div>
              <h3>Your Answer:</h3>
              <span>{submittedAnswer}</span>
              <h3>Waiting for answer validation...</h3>
            </div>
          ) : (
            <input
              type="text"
              placeholder="Enter your answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
          )}

          <div>
            {!submittedAnswer && !answerValidated && (
              <>
                <button onClick={() => submitAnswer(false)}>Submit Answer</button>
                <button onClick={() => submitAnswer(true)}>Stop Timer and Submit</button>
              </>
            )}
          </div>

          {answerValidated && <h3>Answer Validated!</h3>}
        </>
      )}

      {status === "waiting" && question && timer === 0 && (
        <h2>Time's up! Waiting for the next question...</h2>
      )}

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
  );
}

export default Game;
