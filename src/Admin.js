import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

function Admin() {
  const API_URL = process.env.REACT_APP_API_URL;
  const [message, setMessage] = useState("");
  const [gameSessions, setGameSessions] = useState([]);
  const [newSession, setNewSession] = useState({ title: "", date: "" });
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAdminData = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/");
        return;
      }

      try {
        const response = await axios.get(`${API_URL}/admin`, {
          headers: { Authorization: token },
        });
        setMessage(response.data.message);

        // Fetch game sessions
        const sessionsResponse = await axios.get(
          `${API_URL}/game-sessions`,
          {
            headers: { Authorization: token },
          }
        );

        setGameSessions(sessionsResponse.data);
      } catch (err) {
        console.error("Error Fetching Game Sessions:", err);
        navigate("/");
      }
    };

    fetchAdminData();
  }, [navigate]);

  const createGameSession = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    try {
      const response = await axios.post(
        `${API_URL}/game-sessions`,
        newSession,
        {
          headers: { Authorization: token },
        }
      );

      // Append the new session to the existing list
      setGameSessions((prevSessions) => {
        const updatedSessions = [...prevSessions, response.data];
        return updatedSessions;
      });
      setNewSession({ title: "", date: "" }); // Reset the form
    } catch (err) {
      console.error("Failed to create game session", err);
    }
  };

  return (
    <div>
      <h1>{message}</h1>

      <h2>Game Sessions</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {Array.isArray(gameSessions) && gameSessions.length > 0 ? (
            gameSessions.map((session) => (
              <tr
                key={session.id}
                onClick={() => navigate(`/session/${session.id}`)}
                style={{ cursor: "pointer" }}
              >
                <td>{session.id}</td>
                <td>{session.title}</td>
                <td>{session.date}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="3">No game sessions found.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Create New Game Session</h2>
      <form onSubmit={createGameSession}>
        <input
          type="text"
          placeholder="Title"
          value={newSession.title}
          onChange={(e) =>
            setNewSession({ ...newSession, title: e.target.value })
          }
        />
        <input
          type="date"
          value={newSession.date}
          onChange={(e) =>
            setNewSession({ ...newSession, date: e.target.value })
          }
        />
        <button type="submit">Create</button>
      </form>
    </div>
  );
}

export default Admin;
