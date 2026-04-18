import { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";
import ConfirmDialog from "./ConfirmDialog";
import { toast } from "./toast";
import "./Admin.css"; // Import the CSS file for styling

function Admin() {
  const API_URL = process.env.REACT_APP_API_URL;
  const [gameSessions, setGameSessions] = useState([]);
  const [adminSessionLink, setAdminSessionLink] = useState(""); // Admin session link
  const [activeSessionGroups, setActiveSessionGroups] = useState([]);
  const [newSession, setNewSession] = useState({ title: "", date: "" });
  const [showForm, setShowForm] = useState(false); // State to toggle form visibility
  const [editingSession, setEditingSession] = useState(null); // Track which session is being edited
  const [cloningId, setCloningId] = useState(null); // Track which session is being cloned
  const [openMenuId, setOpenMenuId] = useState(null); // Track which action menu is open
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 }); // Portal menu position
  const [pendingAction, setPendingAction] = useState(null); // Confirm dialog state
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

  // Close menu on scroll or resize so portal doesn't drift
  useEffect(() => {
    const close = () => setOpenMenuId(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, []);

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

  const resetSession = async (sessionId) => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("Non autorisé. Veuillez vous reconnecter.");
      return;
    }

    setPendingAction({
      message: "Êtes-vous sûr de vouloir réinitialiser cette session ?",
      danger: false,
      onConfirm: async () => {
        setPendingAction(null);
        try {
          await axios.post(`${API_URL}/sessions/${sessionId}/reset`, {
            headers: { Authorization: token },
          });
          setGameSessions((prevSessions) =>
            prevSessions.map((session) =>
              session.id === sessionId ? { ...session, status: "Draft" } : session
            )
          );
          toast.success("Session réinitialisée avec succès !");
        } catch (err) {
          console.error("Failed to reset session:", err);
          toast.error("Erreur lors de la réinitialisation de la session.");
        }
      },
    });
  };
  
  const deleteSession = async (sessionId) => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("Non autorisé. Veuillez vous reconnecter.");
      return;
    }
  
    setPendingAction({
      message: "Êtes-vous sûr de vouloir supprimer cette session ? Cette action est irréversible.",
      danger: true,
      confirmLabel: "Supprimer",
      onConfirm: async () => {
        setPendingAction(null);
        try {
          await axios.delete(`${API_URL}/sessions/${sessionId}`, {
            headers: { Authorization: token },
          });
          setGameSessions((prevSessions) => prevSessions.filter((session) => session.id !== sessionId));
          toast.success("Session supprimée avec succès !");
        } catch (err) {
          console.error("Failed to delete session:", err);
          toast.error("Erreur lors de la suppression de la session.");
        }
      },
    });
  };
  

  const cloneSession = async (sessionId) => {
    const token = localStorage.getItem("token");
    setCloningId(sessionId);
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
        session_rules: originalSession.session_rules,
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
      toast.success("Session clonée avec succès !");
    } catch (err) {
      console.error("Failed to clone session", err);
      toast.error("Erreur lors du clonage de la session.");
    } finally {
      setCloningId(null);
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
      toast.success("Liens de jeu récupérés !");
    } catch (err) {
      console.error("Failed to fetch group URLs", err);
      toast.error("Erreur lors de la récupération des liens.");
    }
  };

  const handleEdit = (session) => {
    setEditingSession(session);
    setNewSession({ title: session.title, green_questions_label: session.green_questions_label, red_questions_label:session.red_questions_label, date: session.date, session_rules: session.session_rules });
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
      toast.success("Session mise à jour avec succès !");
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
      {pendingAction && (
        <ConfirmDialog
          message={pendingAction.message}
          danger={pendingAction.danger}
          confirmLabel={pendingAction.confirmLabel}
          onConfirm={pendingAction.onConfirm}
          onCancel={() => setPendingAction(null)}
        />
      )}
      <div className="admin-container" onClick={() => setOpenMenuId(null)}>
        <div className="session-header-container"> 
          <h2 className="title">Sessions de jeu</h2>
          <button className="admin-button" onClick={() => setShowForm(!showForm)}>
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
                  <td>
                    <span className={`status-badge status-${session.status?.toLowerCase().replace(/\s+/g, "-")}`}>
                      {session.status}
                    </span>
                  </td>
                  <td className="actions">
                    <div className="action-menu-wrapper" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="action-menu-trigger"
                        onClick={(e) => {
                          if (openMenuId === session.id) {
                            setOpenMenuId(null);
                          } else {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setMenuPos({ top: rect.bottom + window.scrollY + 4, left: rect.right + window.scrollX - 190 });
                            setOpenMenuId(session.id);
                          }
                        }}
                        aria-label="Actions"
                      >
                        ⋮
                      </button>
                    </div>
                    {openMenuId === session.id && ReactDOM.createPortal(
                      <div
                        className="action-menu-dropdown"
                        style={{ position: "absolute", top: menuPos.top, left: menuPos.left }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button className="action-menu-item" onClick={() => { handleEdit(session); setOpenMenuId(null); }}>
                          ✏️ Modifier
                        </button>
                        {session.status === "Draft" && (
                          <>
                            <button className="action-menu-item" onClick={() => { navigate(`/session/${session.id}`); setOpenMenuId(null); }}>
                              📋 Contenu
                            </button>
                            <button className="action-menu-item" onClick={() => { activateSession(session.id); setOpenMenuId(null); }}>
                              ▶️ Activer
                            </button>
                          </>
                        )}
                        {session.status !== "Draft" && (
                          <>
                            <button className="action-menu-item" onClick={() => { navigate(`/admin/game/${session.id}`); setOpenMenuId(null); }}>
                              🎮 Contrôle
                            </button>
                            <button className="action-menu-item" onClick={() => { fetchGroupURLs(session.id); setOpenMenuId(null); }}>
                              🔗 Liens de jeu
                            </button>
                          </>
                        )}
                        <button
                          className="action-menu-item"
                          onClick={() => { cloneSession(session.id); setOpenMenuId(null); }}
                          disabled={cloningId === session.id}
                        >
                          {cloningId === session.id ? (
                            <><span className="btn-spinner" /> Clonage…</>
                          ) : "📑 Cloner"}
                        </button>
                        <button className="action-menu-item" onClick={() => { resetSession(session.id); setOpenMenuId(null); }}>
                          🔄 Réinitialiser
                        </button>
                        <div className="action-menu-divider" />
                        <button className="action-menu-item action-menu-danger" onClick={() => { deleteSession(session.id); setOpenMenuId(null); }}>
                          🗑 Supprimer
                        </button>
                      </div>,
                      document.body
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6">Aucune session de jeu trouvée.</td>
              </tr>
            )}
          </tbody>
        </table>

        {showForm && (
          <form
            className="session-form"
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
            <textarea
              placeholder="Règles du jeu"
              value={newSession.session_rules}
              onChange={(e) =>
                setNewSession({ ...newSession, session_rules: e.target.value })
              }
              rows={3}
              required
            />
            <button className="admin-button" type="submit">
              {editingSession ? "Mettre à jour" : "Créer"} la session
            </button>
          </form>
        )}

        {activeSessionGroups.length > 0 && (
          <>
            <h2 className="title">Liens joueurs</h2>
            <ul>
              {activeSessionGroups.map((group) => (
                <li className="urls" key={group.id}>
                  {(() => {
                    const groupUrl =
                      group.join_url ||
                      (group.session_id
                        ? `${window.location.origin}/game/${group.session_id}/${group.id}`
                        : "");

                    return (
                      <>
                        <strong>{group.name}:</strong>{" "}
                        {groupUrl ? (
                          <a href={groupUrl} target="_blank" rel="noreferrer">
                            {groupUrl}
                          </a>
                        ) : (
                          <span>Lien indisponible</span>
                        )}
                      </>
                    );
                  })()}
                </li>
              ))}
            </ul>
          </>
        )}

        {adminSessionLink && (
          <>
            <h2 className="title">Lien administrateur</h2>
            <ul>
              <li className="urls" >
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
