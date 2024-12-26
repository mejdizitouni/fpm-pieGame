import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";

const socket = io(process.env.REACT_APP_API_URL);

function Game() {
  const { sessionId, groupId } = useParams();

  const [status, setStatus] = useState("waiting");
  const [question, setQuestion] = useState(null);
  const [timer, setTimer] = useState(0);
  const [answer, setAnswer] = useState("");
  const [camembert, setCamembert] = useState({ red_triangles: 0, green_triangles: 0 });

  useEffect(() => {
    socket.emit("joinSession", { sessionId, groupId, role: "player" });

    socket.on("startGame", () => {
      setStatus("active");
    });

    socket.on("newQuestion", ({ question, timer }) => {
      setQuestion(question);
      setTimer(timer);
      setStatus("active");
    });

    socket.on("camembertUpdated", (progress) => {

      // Ensure we're correctly updating camembert state
      setCamembert((prev) => {
        // Convert groupId to string to ensure consistent comparison
        if (parseInt(groupId) === parseInt(progress.groupId)) {
            const updatedValue = prev[progress.triangleType] || 0; // Default to 0 if undefined
            return {
              ...prev,
              [progress.triangleType]: updatedValue + progress.scoreChange,
            };
          }
          return prev; // Don't update if groupId doesn't match
      });
    });

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
      socket.emit("submitAnswer", {
        sessionId,
        groupId,
        questionId: question.id,
        answer,
        stoppedTimer,
      });
      setAnswer("");
    } else {
    }
  };

  return (
    <div className="container">
      {status === "waiting" && <h1>Waiting for the game to start...</h1>}

      {status === "active" && question && (
        <>
          <h1>Question: {question.title}</h1>
          <p>Time Remaining: {timer} seconds</p>
          <input
            type="text"
            placeholder="Enter your answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <div>
            <button onClick={() => submitAnswer(false)}>Submit Answer</button>
            <button onClick={() => submitAnswer(true)}>Stop Timer and Submit</button>
          </div>
        </>
      )}

      {status === "waiting" && question && timer === 0 && (
        <h2>Time's up! Waiting for the next question...</h2>
      )}

      <h2>Camembert Progress</h2>
      <p>
        Red Triangles: {camembert.red_triangles} / 4 <br />
        Green Triangles: {camembert.green_triangles} / 4
      </p>
    </div>
  );
}

export default Game;
