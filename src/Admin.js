import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";
import "./Admin.css"; // Import the CSS file for styling

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

  const deleteSession = async (sessionId) => {
    const token = localStorage.getItem("token");
    if (!token) {
      alert("Unauthorized! Please log in.");
      return;
    }
  
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cette session ?")) {
      return; // Stop if user cancels
    }
  
    try {
      await axios.delete(`${API_URL}/sessions/${sessionId}`, {
        headers: { Authorization: token },
      });
  
      // Remove the session from the UI
      setGameSessions((prevSessions) => prevSessions.filter(session => session.id !== sessionId));
  
      alert("Session supprimée avec succès !");
    } catch (err) {
      console.error("Failed to delete session:", err);
      alert("Erreur lors de la suppression de la session.");
    }
  };
  

  const cloneSession = async (sessionId) => {
    const token = localStorage.getItem("token");

    try {
      // Step 1: Get the original session data
      const sessionResponse = await axios.get(
        `${API_URL}/sessions/${sessionId}`,
        {
          headers: { Authorization: token },
        }
      );

      const originalSession = sessionResponse.data;

      // Step 2: Create a new session with the cloned name and today's date
      const newSessionData = {
        title: `Clone - ${originalSession.title}`,
        status: "Draft", // Make sure to set a status here
        green_questions_label: originalSession.green_questions_label,
        red_questions_label: originalSession.red_questions_label,
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
            avatar_name: group.avatar_name,
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

  const fetchGroupURLs = async (sessionId) => {
    const token = localStorage.getItem("token");

    try {
      const response = await axios.get(
        `${API_URL}/sessions/${sessionId}/groups`,
        {
          headers: { Authorization: token },
        }
      );

      setActiveSessionGroups(response.data);
      alert("Group URLs fetched successfully!");
    } catch (err) {
      console.error("Failed to fetch group URLs", err);
      alert("Error fetching group URLs. Please try again.");
    }
  };

  const handleEdit = (session) => {
    setEditingSession(session);
    setNewSession({ title: session.title, green_questions_label: session.green_questions_label, red_questions_label:session.red_questions_label, date: session.date });
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
        <div class="session-header-container"> 
        <h2 class="title">Sessions de jeu</h2>
        <button class="admin-button" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Annuler" : "Créer une nouvelle session"}
        </button>
          </div>
         
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Catégorie 1</th>
              <th>Catégorie 2</th>
              <th>Date de la session</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {gameSessions.length > 0 ? (
              gameSessions.map((session) => (
                <tr key={session.id}>
                  <td>{session.title}</td>
                  <td>{session.green_questions_label}</td>
                  <td>{session.red_questions_label}</td>
                  <td>{session.date}</td>
                  <td>{session.status}</td>
                  <td className="actions">
                    <button class="admin-button" onClick={() => handleEdit(session)}>Modifier</button>
                    {session.status === "Draft" && (
                      <>
                        <button class="admin-button"
                          onClick={() => navigate(`/session/${session.id}`)}
                        >
                          Contenu
                        </button>
                        <button class="admin-button" onClick={() => activateSession(session.id)}>
                          Activer
                        </button>
                      </>
                    )}
                    {(session.status !== "Draft") && (
                      <>
                        <button
                        class="admin-button"
                          onClick={() => navigate(`/admin/game/${session.id}`)}
                        >
                          Contrôle 
                        </button>

                        <button class="admin-button" onClick={() => fetchGroupURLs(session.id)}>
                          Liens de jeu
                        </button>
                      </>
                    )}
                    <button class="admin-button" onClick={() => cloneSession(session.id)}>
                      Cloner
                    </button>
                    <button class="admin-button delete" onClick={() => deleteSession(session.id)}>Supprimer</button> {/* NEW DELETE BUTTON */}

                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5">Aucune session de jeu trouvée.</td>
              </tr>
            )}
          </tbody>
        </table>

        {showForm && (
          <div>
            <form
              onSubmit={editingSession ? handleUpdateSession : createSession}
            >
              <input
                type="text"
                placeholder="Nom"
                value={newSession.title}
                onChange={(e) =>
                  setNewSession({ ...newSession, title: e.target.value })
                }
                required
              />
              <input
                type="text"
                placeholder="Catégorie 1"
                value={newSession.green_questions_label}
                onChange={(e) =>
                  setNewSession({ ...newSession, green_questions_label: e.target.value })
                }
                required
              />
              <input
                type="text"
                placeholder="Catégorie 2"
                value={newSession.red_questions_label}
                onChange={(e) =>
                  setNewSession({ ...newSession, red_questions_label: e.target.value })
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
              <button class="admin-button" type="submit">
                {editingSession ? "Mettre à jour" : "Créer"} la session
              </button>
            </form>
          </div>
        )}

        {activeSessionGroups.length > 0 && (
          <>
            <h2 class="title">Liens joueurs</h2>
            <ul>
              {activeSessionGroups.map((group) => (
                <li class="urls" key={group.id}>
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
            <h2 class="title">Lien administrateur</h2>
            <ul>
              <li class="urls" >
                <a href={adminSessionLink} target="_blank" rel="noreferrer">
                  {adminSessionLink}
                </a>
              </li>
            </ul>
          </>
        )}
      </div>
      <Footer />
    </>
  );
}

export default Admin;
