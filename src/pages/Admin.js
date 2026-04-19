import { useCallback, useEffect, useState } from "react";
import ReactDOM from "react-dom";
import axios from "axios";
import { useLocation, useNavigate } from "react-router-dom";
import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";
import ConfirmDialog from "../components/dialogs/ConfirmDialog";
import SessionManagerPanel from "../components/admin/SessionManagerPanel";
import PasswordInput from "../components/forms/PasswordInput";
import { toast } from "../components/toast/toast";
import { useLanguage } from "../i18n/LanguageProvider";
import "./Admin.css";

const EMPTY_SESSION_FORM = {
  title: "",
  green_questions_label: "",
  red_questions_label: "",
  date: "",
  session_rules: "",
};

const EMPTY_USER_FORM = {
  firstName: "",
  lastName: "",
  username: "",
  email: "",
  password: "",
  role: "Enseignant",
  isActive: true,
};

function Admin() {
  const API_URL = process.env.REACT_APP_API_URL;
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [savingUser, setSavingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [togglingUserId, setTogglingUserId] = useState(null);
  const [showUserForm, setShowUserForm] = useState(false);
  const [newUser, setNewUser] = useState(EMPTY_USER_FORM);
  const [gameSessions, setGameSessions] = useState([]);
  const [adminSessionLink, setAdminSessionLink] = useState("");
  const [activeSessionGroups, setActiveSessionGroups] = useState([]);
  const [newSession, setNewSession] = useState(EMPTY_SESSION_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [cloningId, setCloningId] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [pendingAction, setPendingAction] = useState(null);
  const [drawerSession, setDrawerSession] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { t, language } = useLanguage();
  const activeView = new URLSearchParams(location.search).get("view") || "sessions";

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

  const fetchUsers = useCallback(async (token) => {
    const usersResponse = await axios.get(`${API_URL}/users`, {
      headers: { Authorization: token },
    });
    setUsers(usersResponse.data || []);
  }, [API_URL]);

  const fetchSessions = useCallback(async (token) => {
    const sessionsResponse = await axios.get(`${API_URL}/game-sessions`, {
      headers: { Authorization: token },
    });
    setGameSessions(sessionsResponse.data || []);
  }, [API_URL]);

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
        await fetchSessions(token);

        if (adminCheckResponse.data?.user?.role === "Admin") {
          await fetchUsers(token);
        }
      } catch (err) {
        console.error("Error fetching admin data:", err);
        navigate("/");
      }
    };

    fetchAdminData();
  }, [API_URL, fetchSessions, fetchUsers, navigate]);

  useEffect(() => {
    const close = () => setOpenMenuId(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, []);

  const openCreateSessionModal = () => {
    setEditingSession(null);
    setNewSession(EMPTY_SESSION_FORM);
    setShowForm(true);
  };

  const closeSessionModal = () => {
    setShowForm(false);
    setEditingSession(null);
    setNewSession(EMPTY_SESSION_FORM);
  };

  const createSession = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    try {
      await axios.post(`${API_URL}/game-sessions`, newSession, {
        headers: { Authorization: token },
      });
      closeSessionModal();
      await fetchSessions(token);
    } catch (err) {
      console.error("Failed to create session", err);
    }
  };

  const handleEditSession = (session) => {
    setEditingSession(session);
    setNewSession({
      title: session.title || "",
      green_questions_label: session.green_questions_label || "",
      red_questions_label: session.red_questions_label || "",
      date: session.date || "",
      session_rules: session.session_rules || "",
    });
    setShowForm(true);
  };

  const handleUpdateSession = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    try {
      await axios.put(`${API_URL}/sessions/${editingSession.id}`, newSession, {
        headers: { Authorization: token },
      });
      closeSessionModal();
      toast.success(t("adminUpdateSuccess"));
      await fetchSessions(token);
    } catch (err) {
      console.error("Failed to update session", err);
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
          if (drawerSession?.id === sessionId) {
            setDrawerSession(null);
          }
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
      const sessionResponse = await axios.get(`${API_URL}/sessions/${sessionId}`, {
        headers: { Authorization: token },
      });

      const originalSession = sessionResponse.data;
      const newSessionData = {
        title: `Clone - ${originalSession.title}`,
        status: "Draft",
        green_questions_label: originalSession.green_questions_label,
        red_questions_label: originalSession.red_questions_label,
        date: new Date().toISOString().split("T")[0],
        session_rules: originalSession.session_rules,
      };

      const response = await axios.post(`${API_URL}/game-sessions`, newSessionData, {
        headers: { Authorization: token },
      });

      const clonedSession = response.data;
      const groupsResponse = await axios.get(`${API_URL}/sessions/${sessionId}/groups`, {
        headers: { Authorization: token },
      });

      for (const group of groupsResponse.data) {
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

      const questionsResponse = await axios.get(`${API_URL}/sessions/${sessionId}/questions`, {
        headers: { Authorization: token },
      });

      for (const question of questionsResponse.data) {
        await axios.post(
          `${API_URL}/sessions/${clonedSession.id}/questions`,
          { question_id: question.id },
          {
            headers: { Authorization: token },
          }
        );
      }

      await fetchSessions(token);
      toast.success(t("adminCloneSuccess"));
    } catch (err) {
      console.error("Failed to clone session", err);
      toast.error(t("adminCloneError"));
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
      await fetchSessions(token);
    } catch (err) {
      console.error("Failed to activate session", err);
    }
  };

  const fetchGroupURLs = async (sessionId) => {
    const token = localStorage.getItem("token");

    try {
      const response = await axios.get(`${API_URL}/sessions/${sessionId}/groups`, {
        headers: { Authorization: token },
      });

      setActiveSessionGroups(response.data);
      toast.success(t("adminLinksFetched"));
    } catch (err) {
      console.error("Failed to fetch group URLs", err);
      toast.error(t("adminLinksFetchError"));
    }
  };

  const resetUserForm = () => {
    setEditingUserId(null);
    setShowUserForm(false);
    setNewUser(EMPTY_USER_FORM);
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
        err?.response?.data?.message ||
        (editingUserId ? t("adminUserUpdateError") : t("adminUserCreateError"));
      toast.error(errorMessage);
    } finally {
      setSavingUser(false);
    }
  };

  const renderSessionMenu = (session) => {
    if (openMenuId !== session.id) {
      return null;
    }

    return ReactDOM.createPortal(
      <div
        className="action-menu-dropdown"
        style={{ position: "absolute", top: menuPos.top, left: menuPos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="action-menu-item" onClick={() => { handleEditSession(session); setOpenMenuId(null); }}>
          ✏️ {t("commonEdit")}
        </button>
        {session.status === "Draft" && (
          <>
            <button className="action-menu-item" onClick={() => { setDrawerSession(session); setOpenMenuId(null); }}>
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
          {cloningId === session.id ? <><span className="btn-spinner" /> {t("adminCloning")}</> : `📑 ${t("adminClone")}`}
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
    );
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

      {drawerSession && ReactDOM.createPortal(
        <div className="admin-drawer-shell" onClick={() => setDrawerSession(null)}>
          <aside className="admin-drawer" onClick={(e) => e.stopPropagation()} aria-label={t("adminContent")}>
            <div className="admin-drawer-header">
              <div>
                <p className="admin-drawer-eyebrow">{t("adminContent")}</p>
                <h2>{drawerSession.title}</h2>
              </div>
              <button className="admin-ghost-button" type="button" onClick={() => setDrawerSession(null)}>
                {t("commonClose")}
              </button>
            </div>
            <div className="admin-drawer-body">
              <SessionManagerPanel sessionId={drawerSession.id} embedded={true} />
            </div>
          </aside>
        </div>,
        document.body
      )}

      {showForm && ReactDOM.createPortal(
        <div className="admin-modal-shell" role="dialog" aria-modal="true" aria-label={editingSession ? t("commonEdit") : t("adminCreateNewSession")} onClick={closeSessionModal}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>{editingSession ? `${t("commonEdit")} ${t("adminSessionWord")}` : t("adminCreateNewSession")}</h3>
              <button className="admin-ghost-button" type="button" onClick={closeSessionModal}>
                {t("commonClose")}
              </button>
            </div>
            <div className="admin-modal-body">
            <form className="session-form" onSubmit={editingSession ? handleUpdateSession : createSession}>
              <label htmlFor="session-title">{t("adminSessionNameLabel")}</label>
              <input
                id="session-title"
                type="text"
                placeholder={t("adminName")}
                value={newSession.title}
                onChange={(e) => setNewSession({ ...newSession, title: e.target.value })}
                required
              />
              <label htmlFor="session-category-1">{t("adminCategory1")}</label>
              <input
                id="session-category-1"
                type="text"
                placeholder={t("adminCategory1")}
                value={newSession.green_questions_label}
                onChange={(e) => setNewSession({ ...newSession, green_questions_label: e.target.value })}
                required
              />
              <label htmlFor="session-category-2">{t("adminCategory2")}</label>
              <input
                id="session-category-2"
                type="text"
                placeholder={t("adminCategory2")}
                value={newSession.red_questions_label}
                onChange={(e) => setNewSession({ ...newSession, red_questions_label: e.target.value })}
                required
              />
              <label htmlFor="session-date">{t("commonDate")}</label>
              <input
                id="session-date"
                type="date"
                value={newSession.date}
                onChange={(e) => setNewSession({ ...newSession, date: e.target.value })}
                required
              />
              <label htmlFor="session-rules">{t("adminGameRules")}</label>
              <textarea
                id="session-rules"
                placeholder={t("adminGameRules")}
                value={newSession.session_rules}
                onChange={(e) => setNewSession({ ...newSession, session_rules: e.target.value })}
                rows={3}
                required
              />
              <div className="admin-modal-actions">
                <button className="admin-button" type="submit">
                  {editingSession ? t("commonUpdate") : t("commonCreate")} {t("adminSessionWord")}
                </button>
                <button className="admin-ghost-button" type="button" onClick={closeSessionModal}>
                  {t("commonCancel")}
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showUserForm && ReactDOM.createPortal(
        <div className="admin-modal-shell" role="dialog" aria-modal="true" aria-label={editingUserId ? t("adminUserUpdate") : t("adminUserCreate")} onClick={resetUserForm}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>{editingUserId ? t("adminUserUpdate") : t("adminUserCreate")}</h3>
              <button className="admin-ghost-button" type="button" onClick={resetUserForm}>
                {t("commonClose")}
              </button>
            </div>
            <div className="admin-modal-body">
            <form className="user-form" onSubmit={handleSaveUser}>
              <label htmlFor="new-user-first-name">{t("adminUserFirstName")}</label>
              <input
                id="new-user-first-name"
                type="text"
                value={newUser.firstName}
                onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
                required
              />
              <label htmlFor="new-user-last-name">{t("adminUserLastName")}</label>
              <input
                id="new-user-last-name"
                type="text"
                value={newUser.lastName}
                onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
                required
              />
              <label htmlFor="new-user-username">{t("adminUserUsername")}</label>
              <input
                id="new-user-username"
                type="text"
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                required
              />
              <label htmlFor="new-user-email">{t("adminUserEmail")}</label>
              <input
                id="new-user-email"
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                required
              />
              <label htmlFor="new-user-password">{t("adminUserPassword")}</label>
              <PasswordInput
                id="new-user-password"
                minLength={8}
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                required={!editingUserId}
                autoComplete={editingUserId ? "new-password" : "current-password"}
              />
              <label htmlFor="new-user-role">{t("adminUserRole")}</label>
              <select
                id="new-user-role"
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              >
                <option value="Admin">{t("roleAdmin")}</option>
                <option value="Enseignant">{t("roleTeacher")}</option>
              </select>
              <label htmlFor="new-user-active">{t("adminUserStatus")}</label>
              <select
                id="new-user-active"
                value={newUser.isActive ? "1" : "0"}
                onChange={(e) => setNewUser({ ...newUser, isActive: e.target.value === "1" })}
                disabled={!editingUserId}
              >
                <option value="1">{t("adminUserActive")}</option>
                <option value="0">{t("adminUserInactive")}</option>
              </select>
              <div className="admin-modal-actions">
                <button className="admin-button" type="submit" disabled={savingUser}>
                  {savingUser ? t("adminUserSaving") : editingUserId ? t("adminUserUpdate") : t("adminUserCreate")}
                </button>
                <button className="admin-ghost-button" type="button" onClick={resetUserForm}>
                  {t("commonCancel")}
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="admin-container" onClick={() => setOpenMenuId(null)}>
        <h1 className="admin-page-title">{t("adminPageTitle")}</h1>

        {activeView !== "users" && <>
        <div className="session-header-container">
              <h2 className="title">{t("adminSessionsTitle")}</h2>
              <button className="admin-button" type="button" onClick={openCreateSessionModal}>
                {t("adminCreateNewSession")}
              </button>
            </div>

            <div className="mobile-table-scroll" role="region" aria-label={t("ariaSessionsTable")} tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th>{t("adminName")}</th>
                    <th>{t("adminCategory1")}</th>
                    <th>{t("adminCategory2")}</th>
                    <th>{t("adminSessionDate")}</th>
                    <th>{t("adminCreatedBy")}</th>
                    <th>{t("adminLastModifiedBy")}</th>
                    <th>{t("adminStatus")}</th>
                    <th>{t("adminActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {gameSessions.length > 0 ? (
                    gameSessions.map((session) => (
                      <tr key={session.id}>
                        <td>
                          <button
                            className="admin-link-button"
                            type="button"
                            onClick={() => {
                              if (session.status === "Draft") {
                                setDrawerSession(session);
                              }
                            }}
                            disabled={session.status !== "Draft"}
                          >
                            {session.title}
                          </button>
                        </td>
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
                                  setMenuPos({
                                    top: rect.bottom + window.scrollY + 4,
                                    left: rect.right + window.scrollX - 190,
                                  });
                                  setOpenMenuId(session.id);
                                }
                              }}
                              aria-label={t("adminActions")}
                            >
                              ⋮
                            </button>
                          </div>
                          {renderSessionMenu(session)}
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

            {activeSessionGroups.length > 0 && (
              <>
                <h2 className="title">{t("adminPlayerLinks")}</h2>
                <ul>
                  {activeSessionGroups.map((group) => (
                    <li className="urls" key={group.id}>
                      {(() => {
                        const groupUrl =
                          group.join_url ||
                          (group.session_id ? `${window.location.origin}/game/${group.session_id}/${group.id}` : "");
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

            {adminSessionLink && (
              <>
                <h2 className="title">{t("adminAdminLink")}</h2>
                <ul>
                  <li className="urls">
                    <a href={adminSessionLink} target="_blank" rel="noreferrer">
                      {adminSessionLink}
                    </a>
                  </li>
                </ul>
              </>
            )}

        </> }

        {currentUser?.role === "Admin" && activeView === "users" && (
          <>
            <div className="session-header-container">
              <h2 className="title">{t("adminUserManagementTitle")}</h2>
              <button
                className="admin-button"
                type="button"
                onClick={() => {
                  setEditingUserId(null);
                  setNewUser(EMPTY_USER_FORM);
                  setShowUserForm(true);
                }}
              >
                {t("adminUserCreate")}
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
                        <td className="actions">
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
          </>
        )}
      </div>
      <Footer />
    </>
  );
}

export default Admin;
