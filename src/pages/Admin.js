import { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import axios from "axios";
import { useLocation, useNavigate } from "react-router-dom";
import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";
import ConfirmDialog from "../components/dialogs/ConfirmDialog";
import PasswordInput from "../components/forms/PasswordInput";
import { toast } from "../components/toast/toast";
import { useLanguage } from "../i18n/LanguageProvider";
import "./Admin.css"; // Import the CSS file for styling

function Admin() {
  const API_URL = process.env.REACT_APP_API_URL;
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [savingUser, setSavingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [togglingUserId, setTogglingUserId] = useState(null);
  const [showUserForm, setShowUserForm] = useState(false);
  const [newUser, setNewUser] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
    role: "Enseignant",
    isActive: true,
  });
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
  const location = useLocation();
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const activeView = new URLSearchParams(location.search).get("view") || "sessions";
  const showSessionsManagement = activeView !== "users";
  const showUsersManagement = currentUser?.role === "Admin" && activeView === "users";

  const getSessionStatusLabel = (status) => {
    const statusKeyMap = {
      Draft: "sessionStatusDraft",
      Activated: "sessionStatusActivated",
      "In Progress": "sessionStatusInProgress",
      "Game Over": "sessionStatusGameOver",
    };

    const translationKey = statusKeyMap[status];
    return translationKey ? t(translationKey) : status;
  };

  const getRoleLabel = (role) => {
    const roleKeyMap = {
      Admin: "roleAdmin",
      Enseignant: "roleTeacher",
    };

    const translationKey = roleKeyMap[role];
    return translationKey ? t(translationKey) : role;
  };

  const withLanguageParam = (baseUrl) => {
    if (!baseUrl) {
      return "";
    }

    try {
      const url = new URL(baseUrl, window.location.origin);
      url.searchParams.set("lang", language);
      return url.toString();
    } catch (error) {
      return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}lang=${encodeURIComponent(language)}`;
    }
  };

  const fetchUsers = async (token) => {
    const usersResponse = await axios.get(`${API_URL}/users`, {
      headers: { Authorization: token },
    });
    setUsers(usersResponse.data || []);
  };

  useEffect(() => {
    const fetchAdminData = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/");
        return;
      }

      try {
        const adminCheckResponse = await axios.get(`${API_URL}/admin-check`, {
          headers: { Authorization: token },
        });
        setCurrentUser(adminCheckResponse.data?.user || null);

        // Fetch game sessions
        const sessionsResponse = await axios.get(`${API_URL}/game-sessions`, {
          headers: { Authorization: token },
        });

        setGameSessions(sessionsResponse.data);

        if (adminCheckResponse.data?.user?.role === "Admin") {
          await fetchUsers(token);
        }
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
      toast.error(t("adminUnauthorized"));
      return;
    }

    setPendingAction({
      message: t("adminConfirmReset"),
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
          toast.success(t("adminResetSuccess"));
        } catch (err) {
          console.error("Failed to reset session:", err);
          toast.error(t("adminResetError"));
        }
      },
    });
  };
  
  const deleteSession = async (sessionId) => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error(t("adminUnauthorized"));
      return;
    }
  
    setPendingAction({
      message: t("adminConfirmDelete"),
      danger: true,
      confirmLabel: t("adminDelete"),
      onConfirm: async () => {
        setPendingAction(null);
        try {
          await axios.delete(`${API_URL}/sessions/${sessionId}`, {
            headers: { Authorization: token },
          });
          setGameSessions((prevSessions) => prevSessions.filter((session) => session.id !== sessionId));
          toast.success(t("adminDeleteSuccess"));
        } catch (err) {
          console.error("Failed to delete session:", err);
          toast.error(t("adminDeleteError"));
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
      toast.success(t("adminCloneSuccess"));
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
      setAdminSessionLink(withLanguageParam(`${window.location.origin}/admin/game/${sessionId}`));

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
      toast.success(t("adminLinksFetched"));
    } catch (err) {
      console.error("Failed to fetch group URLs", err);
      toast.error(t("adminLinksFetchError"));
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
      toast.success(t("adminUpdateSuccess"));
      // Fetch the updated session list
      const sessionsResponse = await axios.get(`${API_URL}/game-sessions`, {
        headers: { Authorization: token },
      });
      setGameSessions(sessionsResponse.data); // Update the state with the latest sessions
    } catch (err) {
      console.error("Failed to update session", err);
    }
  };

  const resetUserForm = () => {
    setEditingUserId(null);
    setShowUserForm(false);
    setNewUser({
      firstName: "",
      lastName: "",
      username: "",
      email: "",
      password: "",
      role: "Enseignant",
      isActive: true,
    });
  };

  const handleEditUser = (user) => {
    setEditingUserId(user.id);
    setShowUserForm(true);
    setNewUser({
      firstName: user.first_name || "",
      lastName: user.last_name || "",
      username: user.username || "",
      email: user.email || "",
      password: "",
      role: user.role || "Enseignant",
      isActive: Number(user.is_active) === 1,
    });
  };

  const handleToggleUserActive = async (user) => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error(t("adminUnauthorized"));
      return;
    }

    setTogglingUserId(user.id);
    try {
      await axios.patch(
        `${API_URL}/users/${user.id}/active`,
        { isActive: Number(user.is_active) !== 1 },
        { headers: { Authorization: token } }
      );
      await fetchUsers(token);
      toast.success(t("adminUserStatusUpdated"));
    } catch (err) {
      toast.error(err?.response?.data?.message || t("adminUserStatusUpdateError"));
    } finally {
      setTogglingUserId(null);
    }
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error(t("adminUnauthorized"));
      return;
    }

    setSavingUser(true);
    try {
      if (editingUserId) {
        await axios.put(
          `${API_URL}/users/${editingUserId}`,
          {
            firstName: newUser.firstName,
            lastName: newUser.lastName,
            username: newUser.username,
            email: newUser.email,
            role: newUser.role,
            password: newUser.password,
          },
          { headers: { Authorization: token } }
        );
      } else {
        await axios.post(`${API_URL}/users`, newUser, {
          headers: { Authorization: token },
        });
      }

      resetUserForm();
      await fetchUsers(token);
      toast.success(editingUserId ? t("adminUserUpdateSuccess") : t("adminUserCreateSuccess"));
    } catch (err) {
      const errorMessage =
        err?.response?.data?.message || (editingUserId ? t("adminUserUpdateError") : t("adminUserCreateError"));
      toast.error(errorMessage);
    } finally {
      setSavingUser(false);
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
        {showSessionsManagement && (
          <div className="session-header-container"> 
          <h2 className="title">{t("adminSessionsTitle")}</h2>
          <button className="admin-button" onClick={() => setShowForm(!showForm)}>
            {showForm ? t("commonCancel") : t("adminCreateNewSession")}
          </button>
          </div>
        )}
         
        {showSessionsManagement && (
          <>
        <div className="mobile-table-scroll" role="region" aria-label={t("ariaSessionsTable")} tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>{t("adminCategory1")}</th>
              <th>{t("adminCategory2")}</th>
              <th>Date de la session</th>
              <th>{t("adminCreatedBy")}</th>
              <th>{t("adminLastModifiedBy")}</th>
              <th>Statut</th>
              <th>{t("adminActions")}</th>
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
                  <td>{session.created_by_full_name?.trim() || session.created_by_username || "-"}</td>
                  <td>{session.last_modified_by_full_name?.trim() || session.last_modified_by_username || "-"}</td>
                  <td>
                    <span className={`status-badge status-${session.status?.toLowerCase().replace(/\s+/g, "-")}`}>
                      {getSessionStatusLabel(session.status)}
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
                        aria-label={t("adminActions")}
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
                          ✏️ {t("commonEdit")}
                        </button>
                        {session.status === "Draft" && (
                          <>
                            <button className="action-menu-item" onClick={() => { navigate(`/session/${session.id}`); setOpenMenuId(null); }}>
                              📋 {t("adminContent")}
                            </button>
                            <button className="action-menu-item" onClick={() => { activateSession(session.id); setOpenMenuId(null); }}>
                              ▶️ {t("adminActivate")}
                            </button>
                          </>
                        )}
                        {session.status !== "Draft" && (
                          <>
                            <button className="action-menu-item" onClick={() => { navigate(`/admin/game/${session.id}?lang=${encodeURIComponent(language)}`); setOpenMenuId(null); }}>
                              🎮 {t("adminControl")}
                            </button>
                            <button className="action-menu-item" onClick={() => { fetchGroupURLs(session.id); setOpenMenuId(null); }}>
                              🔗 {t("adminGameLinks")}
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
                          ) : `📑 ${t("adminClone")}`}
                        </button>
                        <button className="action-menu-item" onClick={() => { resetSession(session.id); setOpenMenuId(null); }}>
                          🔄 {t("adminReset")}
                        </button>
                        <div className="action-menu-divider" />
                        <button className="action-menu-item action-menu-danger" onClick={() => { deleteSession(session.id); setOpenMenuId(null); }}>
                          🗑 {t("adminDelete")}
                        </button>
                      </div>,
                      document.body
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="8">{t("adminNoSessions")}</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
          </>
        )}

        {showSessionsManagement && showForm && (
          <form
            className="session-form"
            onSubmit={editingSession ? handleUpdateSession : createSession}
          >
            <label htmlFor="session-title">Nom de la session</label>
            <input
              id="session-title"
              type="text"
              placeholder="Nom"
              value={newSession.title}
              onChange={(e) =>
                setNewSession({ ...newSession, title: e.target.value })
              }
              required
            />
            <label htmlFor="session-category-1">{t("adminCategory1")}</label>
            <input
              id="session-category-1"
              type="text"
              placeholder={t("adminCategory1")}
              value={newSession.green_questions_label}
              onChange={(e) =>
                setNewSession({ ...newSession, green_questions_label: e.target.value })
              }
              required
            />
            <label htmlFor="session-category-2">{t("adminCategory2")}</label>
            <input
              id="session-category-2"
              type="text"
              placeholder={t("adminCategory2")}
              value={newSession.red_questions_label}
              onChange={(e) =>
                setNewSession({ ...newSession, red_questions_label: e.target.value })
              }
              required
            />
            <label htmlFor="session-date">Date</label>
            <input
              id="session-date"
              type="date"
              value={newSession.date}
              onChange={(e) =>
                setNewSession({ ...newSession, date: e.target.value })
              }
              required
            />
            <label htmlFor="session-rules">{t("adminGameRules")}</label>
            <textarea
              id="session-rules"
              placeholder={t("adminGameRules")}
              value={newSession.session_rules}
              onChange={(e) =>
                setNewSession({ ...newSession, session_rules: e.target.value })
              }
              rows={3}
              required
            />
            <button className="admin-button" type="submit">
              {editingSession ? t("commonUpdate") : t("commonCreate")} {t("adminSessionWord")}
            </button>
          </form>
        )}

        {showUsersManagement && (
          <>
            <div className="session-header-container">
              <h2 className="title">{t("adminUserManagementTitle")}</h2>
              <button
                className="admin-button"
                onClick={() => {
                  if (showUserForm) {
                    resetUserForm();
                    return;
                  }
                  setEditingUserId(null);
                  setNewUser({
                    firstName: "",
                    lastName: "",
                    username: "",
                    email: "",
                    password: "",
                    role: "Enseignant",
                    isActive: true,
                  });
                  setShowUserForm(true);
                }}
              >
                {showUserForm ? t("commonCancel") : t("adminUserCreate")}
              </button>
            </div>

            <div className="mobile-table-scroll" role="region" aria-label={t("ariaUsersTable")} tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th>{t("adminUserId")}</th>
                  <th>{t("adminUserFirstName")}</th>
                  <th>{t("adminUserLastName")}</th>
                  <th>{t("adminUserUsername")}</th>
                  <th>{t("adminUserEmail")}</th>
                  <th>{t("adminUserRole")}</th>
                  <th>{t("adminUserStatus")}</th>
                  <th>{t("adminActions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.length > 0 ? (
                  users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.id}</td>
                      <td>{user.first_name || "-"}</td>
                      <td>{user.last_name || "-"}</td>
                      <td>{user.username}</td>
                      <td>{user.email || "-"}</td>
                      <td>{getRoleLabel(user.role)}</td>
                      <td>{Number(user.is_active) === 1 ? t("adminUserActive") : t("adminUserInactive")}</td>
                      <td>
                        <button className="admin-button" type="button" onClick={() => handleEditUser(user)}>
                          {t("commonEdit")}
                        </button>
                        <button
                          className="admin-button"
                          type="button"
                          onClick={() => handleToggleUserActive(user)}
                          disabled={togglingUserId === user.id}
                        >
                          {Number(user.is_active) === 1 ? t("adminUserDeactivate") : t("adminUserActivate")}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8">{t("adminUserNoUsers")}</td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>

            {showUserForm && (
              <form className="user-form" onSubmit={handleSaveUser}>
                <label htmlFor="new-user-first-name">{t("adminUserFirstName")}</label>
                <input
                  id="new-user-first-name"
                  type="text"
                  value={newUser.firstName}
                  onChange={(e) =>
                    setNewUser({ ...newUser, firstName: e.target.value })
                  }
                  required
                />
                <label htmlFor="new-user-last-name">{t("adminUserLastName")}</label>
                <input
                  id="new-user-last-name"
                  type="text"
                  value={newUser.lastName}
                  onChange={(e) =>
                    setNewUser({ ...newUser, lastName: e.target.value })
                  }
                  required
                />
                <label htmlFor="new-user-username">{t("adminUserUsername")}</label>
                <input
                  id="new-user-username"
                  type="text"
                  value={newUser.username}
                  onChange={(e) =>
                    setNewUser({ ...newUser, username: e.target.value })
                  }
                  required
                />
                <label htmlFor="new-user-email">{t("adminUserEmail")}</label>
                <input
                  id="new-user-email"
                  type="email"
                  value={newUser.email}
                  onChange={(e) =>
                    setNewUser({ ...newUser, email: e.target.value })
                  }
                  required
                />
                <label htmlFor="new-user-password">{t("adminUserPassword")}</label>
                  <PasswordInput
                  id="new-user-password"
                  minLength={8}
                  value={newUser.password}
                  onChange={(e) =>
                    setNewUser({ ...newUser, password: e.target.value })
                  }
                  required={!editingUserId}
                    autoComplete={editingUserId ? "new-password" : "current-password"}
                />
                <label htmlFor="new-user-role">{t("adminUserRole")}</label>
                <select
                  id="new-user-role"
                  value={newUser.role}
                  onChange={(e) =>
                    setNewUser({ ...newUser, role: e.target.value })
                  }
                >
                  <option value="Admin">{t("roleAdmin")}</option>
                  <option value="Enseignant">{t("roleTeacher")}</option>
                </select>
                <label htmlFor="new-user-active">{t("adminUserStatus")}</label>
                <select
                  id="new-user-active"
                  value={newUser.isActive ? "1" : "0"}
                  onChange={(e) =>
                    setNewUser({ ...newUser, isActive: e.target.value === "1" })
                  }
                  disabled={!editingUserId}
                >
                  <option value="1">{t("adminUserActive")}</option>
                  <option value="0">{t("adminUserInactive")}</option>
                </select>
                <button className="admin-button" type="submit" disabled={savingUser}>
                  {savingUser
                    ? t("adminUserSaving")
                    : editingUserId
                    ? t("adminUserUpdate")
                    : t("adminUserCreate")}
                </button>
              </form>
            )}
          </>
        )}

        {showSessionsManagement && activeSessionGroups.length > 0 && (
          <>
            <h2 className="title">{t("adminPlayerLinks")}</h2>
            <ul>
              {activeSessionGroups.map((group) => (
                <li className="urls" key={group.id}>
                  {(() => {
                    const groupUrl =
                      group.join_url ||
                      (group.session_id
                        ? `${window.location.origin}/game/${group.session_id}/${group.id}`
                        : "");
                    const localizedGroupUrl = withLanguageParam(groupUrl);

                    return (
                      <>
                        <strong>{group.name}:</strong>{" "}
                        {localizedGroupUrl ? (
                          <a href={localizedGroupUrl} target="_blank" rel="noreferrer">
                            {localizedGroupUrl}
                          </a>
                        ) : (
                          <span>{t("adminLinkUnavailable")}</span>
                        )}
                      </>
                    );
                  })()}
                </li>
              ))}
            </ul>
          </>
        )}

        {showSessionsManagement && adminSessionLink && (
          <>
            <h2 className="title">{t("adminAdminLink")}</h2>
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
