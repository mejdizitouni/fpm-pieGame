import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";

function Admin() {
  const API_URL = process.env.REACT_APP_API_URL;
  const [message, setMessage] = useState("");
  const [gameSessions, setGameSessions] = useState([]);
  const [activeSessionGroups, setActiveSessionGroups] = useState([]);
  const [newSession, setNewSession] = useState({ title: "", date: "" }); // State for new session form
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
        const sessionsResponse = await axios.get(`${API_URL}/game-sessions`, {
          headers: { Authorization: token },
        });

        setGameSessions(sessionsResponse.data);
      } catch (err) {
        console.error("Error Fetching Game Sessions:", err);
        navigate("/");
      }
    };

    fetchAdminData();
  }, [navigate]);

  const createSession = async (e) => {
    e.preventDefault(); // Prevent page reload on form submission
    const token = localStorage.getItem("token");

    try {
      const response = await axios.post(
        `${API_URL}/game-sessions`,
        newSession,
        {
          headers: { Authorization: token },
        }
      );

      // Add the new session to the list of sessions
      setGameSessions((prevSessions) => [...prevSessions, response.data]);
      setNewSession({ title: "", date: "" }); // Clear the form
    } catch (err) {
      console.error("Failed to create session", err);
    }
  };

  const activateSession = async (sessionId) => {
    const token = localStorage.getItem("token");

    try {
      const response = await axios.post(
        `${API_URL}/sessions/${sessionId}/activate`,
        {},
        {
          headers: { Authorization: token },
        }
      );

      setActiveSessionGroups(response.data.updatedGroups); // Save activated group URLs
    } catch (err) {
      console.error("Failed to activate session", err);
    }
  };

  const viewGroupUrls = async (sessionId) => {
    const token = localStorage.getItem("token");

    try {
      const response = await axios.get(
        `${API_URL}/sessions/${sessionId}/groups/urls`,
        {
          headers: { Authorization: token },
        }
      );
      setActiveSessionGroups(response.data);
    } catch (err) {
      console.error("Failed to fetch group URLs", err);
    }
  };

  return (
    <>
      <Header />
      <div className="container">
        <h1>{message}</h1>

        {/* New Session Creation Form */}
        <h2>Create New Session</h2>
        <form onSubmit={createSession}>
          <input
            type="text"
            placeholder="Title"
            value={newSession.title}
            onChange={(e) =>
              setNewSession({ ...newSession, title: e.target.value })
            }
            required
          />
          <input
            type="date"
            value={newSession.date}
            onChange={(e) =>
              setNewSession({ ...newSession, date: e.target.value })
            }
            required
          />
          <button type="submit">Create Session</button>
        </form>

        {/* Game Sessions List */}
        <h2>Game Sessions</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {gameSessions.length > 0 ? (
              gameSessions.map((session) => (
                <tr key={session.id}>
                  <td>{session.id}</td>
                  <td>{session.title}</td>
                  <td>{session.date}</td>
                  <td>{session.status}</td>
                  <td>
                    <button onClick={() => activateSession(session.id)}>
                      Activate
                    </button>
                    <button onClick={() => navigate(`/session/${session.id}`)}>
                      View Details
                    </button>
                    <button onClick={() => viewGroupUrls(session.id)}>
                      View Group URLs
                    </button>
                    <button
                      onClick={() => navigate(`/admin/game/${session.id}`)}
                    >
                      Control Game
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5">No game sessions found.</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Group URLs for Activated Session */}
        {activeSessionGroups.length > 0 && (
          <>
            <h2>Group Join URLs</h2>
            <ul>
              {activeSessionGroups.map((group) => (
                <li key={group.id}>
                  <strong>{group.name}:</strong>{" "}
                  <a href={group.join_url} target="_blank" rel="noreferrer">
                    {group.join_url}
                  </a>
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

export default Admin;
