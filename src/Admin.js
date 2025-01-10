import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";

function Admin() {
  const API_URL = process.env.REACT_APP_API_URL;
  const [gameSessions, setGameSessions] = useState([]);
  const [adminSessionLink, setAdminSessionLink] = useState(""); // Admin session link
  const [activeSessionGroups, setActiveSessionGroups] = useState([]);
  const [newSession, setNewSession] = useState({ title: "", date: "" });
  const [showForm, setShowForm] = useState(false); // State to toggle form visibility
  const [editingSession, setEditingSession] = useState(null); // Track which session is being edited
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAdminData = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/");
        return;
      }

      try {
        await axios.get(`${API_URL}/admin-check`, {
          headers: { Authorization: token },
        });

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
      setShowForm(false); // Hide the form after creating the session
  
      // Fetch the updated session list
      const sessionsResponse = await axios.get(`${API_URL}/game-sessions`, {
        headers: { Authorization: token },
      });
      setGameSessions(sessionsResponse.data); // Update the state with the latest sessions
  
    } catch (err) {
      console.error("Failed to create session", err);
    }
  };

  const cloneSession = async (sessionId) => {
    const token = localStorage.getItem("token");
  
    try {
      // Step 1: Get the original session data
      const sessionResponse = await axios.get(`${API_URL}/sessions/${sessionId}`, {
        headers: { Authorization: token },
      });
  
      const originalSession = sessionResponse.data;
  
      // Step 2: Create a new session with the cloned name and today's date
      const newSessionData = {
        title: `Clone - ${originalSession.title}`,
        status: 'Draft', // Make sure to set a status here
        date: new Date().toISOString().split("T")[0], // Set today's date
      };
  
      const response = await axios.post(
        `${API_URL}/game-sessions`,
        newSessionData,
        {
          headers: { Authorization: token },
        }
      );
  
      const clonedSession = response.data;
  
      // Step 3: Clone the groups for this session
      const groupsResponse = await axios.get(
        `${API_URL}/sessions/${sessionId}/groups`,
        {
          headers: { Authorization: token },
        }
      );
  
      const groups = groupsResponse.data;
      for (const group of groups) {
        // Create the same group for the new session
        await axios.post(
          `${API_URL}/sessions/${clonedSession.id}/groups`,
          {
            name: group.name,
            description: group.description,
          },
          {
            headers: { Authorization: token },
          }
        );
      }
  
      // Step 4: Clone the questions for this session
      const questionsResponse = await axios.get(
        `${API_URL}/sessions/${sessionId}/questions`,
        {
          headers: { Authorization: token },
        }
      );
  
      const questions = questionsResponse.data;
      for (const question of questions) {
        // Create the same question for the new session
        await axios.post(
          `${API_URL}/sessions/${clonedSession.id}/questions`,
          {
            question_id: question.id,
          },
          {
            headers: { Authorization: token },
          }
        );
      }
  
      // Update the game sessions list with the newly cloned session
      setGameSessions((prevSessions) => [...prevSessions, clonedSession]);
  
      // Fetch the updated session list
      const sessionsResponse = await axios.get(`${API_URL}/game-sessions`, {
        headers: { Authorization: token },
      });
      setGameSessions(sessionsResponse.data); // Update the state with the latest sessions
  
      alert("Session cloned successfully!");
    } catch (err) {
      console.error("Failed to clone session", err);
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

      setActiveSessionGroups(response.data.updatedGroups);
      setAdminSessionLink(`${window.location.origin}/admin/game/${sessionId}`);

      const sessionsResponse = await axios.get(`${API_URL}/game-sessions`, {
        headers: { Authorization: token },
      });
      setGameSessions(sessionsResponse.data);
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
      setAdminSessionLink(`${window.location.origin}/admin/game/${sessionId}`);
    } catch (err) {
      console.error("Failed to fetch group URLs", err);
    }
  };

  const handleEdit = (session) => {
    setEditingSession(session);
    setNewSession({ title: session.title, date: session.date });
    setShowForm(true); // Show the form when editing
  };

  const handleUpdateSession = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    try {
      const response = await axios.put(
        `${API_URL}/sessions/${editingSession.id}`,
        newSession,
        {
          headers: { Authorization: token },
        }
      );

      // Update the game session list
      setGameSessions((prevSessions) =>
        prevSessions.map((session) =>
          session.id === editingSession.id ? response.data : session
        )
      );

      setEditingSession(null); // Clear editing session
      setNewSession({ title: "", date: "" }); // Clear form
      setShowForm(false); // Hide the form
      alert("Session updated successfully!");
      // Fetch the updated session list
      const sessionsResponse = await axios.get(`${API_URL}/game-sessions`, {
        headers: { Authorization: token },
      });
      setGameSessions(sessionsResponse.data); // Update the state with the latest sessions
    } catch (err) {
      console.error("Failed to update session", err);
    }
  };

  return (
    <>
      <Header />
      <div className="admin-container">

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
                  <td class="actions"> 
                    {/* Conditionally render buttons based on session status */}
                    <button onClick={() => handleEdit(session)}>Edit</button>
                    {(session.status === 'Draft') && (
                      <>
                      <button onClick={() => navigate(`/session/${session.id}`)}>
                      View Details
                    </button>
                      </>
                    )}
                    {session.status === 'Draft' && (
                      <button onClick={() => activateSession(session.id)}>
                        Activate
                      </button>
                    )}
                    
                    {(session.status === 'Activated' || session.status === 'In Progress') && (
                      <>
                        <button onClick={() => viewGroupUrls(session.id)}>
                          View Group URLs
                        </button>
                        <button onClick={() => navigate(`/admin/game/${session.id}`)}>
                          Control Game
                        </button>
                      </>
                    )}
                    <button onClick={() => cloneSession(session.id)}>Clone</button>
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

        {/* Button to toggle the new session form */}
        <button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "Create New Session"}
        </button>

        {/* New Session Creation Form */}
        {showForm && (
          <div>
            <h2>{editingSession ? "Edit Session" : "Create New Session"}</h2>
            <form onSubmit={editingSession ? handleUpdateSession : createSession}>
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
              <button type="submit">{editingSession ? "Update" : "Create"} Session</button>
            </form>
          </div>
        )}

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

        {adminSessionLink && (
          <>
            <h2>Admin Session Link</h2>
            <p>
              <a href={adminSessionLink} target="_blank" rel="noreferrer">
                {adminSessionLink}
              </a>
            </p>
          </>
        )}
      </div>
      {/* <Footer /> */}
    </>
  );
}

export default Admin;
