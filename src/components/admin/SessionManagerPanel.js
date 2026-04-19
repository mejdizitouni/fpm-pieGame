import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useLanguage } from "../../i18n/LanguageProvider";
import { QUESTION_RESPONSE_TYPES } from "../../constants/questionResponseTypes";
import "../../pages/Session.css";
import "./SessionManagerPanel.css";

const AVATAR_OPTIONS = [
  "Pill",
  "Capsule",
  "Syringe",
  "Stethoscope",
  "Microscope",
  "Mortar",
  "Caduceus",
  "FirstAid",
  "DNA",
  "Heartbeat",
];

const getAvatarUrl = (avatarName) =>
  avatarName ? `/avatars/${avatarName}.svg` : "/avatars/Pill.svg";

function SessionManagerPanel({ sessionId, embedded = false, sessionTitlePrefix = "" }) {
  const API_URL = process.env.REACT_APP_API_URL;
  const navigate = useNavigate();
  const { t } = useLanguage();
  const renderTemplate = (key, params = {}) => {
    let text = t(key);
    Object.entries(params).forEach(([paramKey, value]) => {
      text = text.replaceAll(`{${paramKey}}`, String(value));
    });
    return text;
  };
  const [sessionDetails, setSessionDetails] = useState({});
  const [questions, setQuestions] = useState([]);
  const [newQuestion, setNewQuestion] = useState({
    type: "",
    response_type: "",
    title: "",
    expected_answer: "",
    allocated_time: "",
    options: [],
  });
  const [optionInput, setOptionInput] = useState("");
  const [allQuestions, setAllQuestions] = useState([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [questionSourceMode, setQuestionSourceMode] = useState("all");
  const [sourceSessionId, setSourceSessionId] = useState("");
  const [sourceSessionQuestions, setSourceSessionQuestions] = useState([]);
  const [availableSourceSessions, setAvailableSourceSessions] = useState([]);
  const [groups, setGroups] = useState([]);
  const [newGroup, setNewGroup] = useState({
    name: "",
    description: "",
  });
  const [showNewQuestionForm, setShowNewQuestionForm] = useState(false);
  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);

  const currentSessionQuestionIds = useMemo(
    () => new Set(questions.map((question) => Number(question.id))),
    [questions]
  );

  const availableQuestionsToLink = useMemo(() => {
    const sourceList = questionSourceMode === "session" ? sourceSessionQuestions : allQuestions;
    return sourceList.filter((question) => !currentSessionQuestionIds.has(Number(question.id)));
  }, [allQuestions, sourceSessionQuestions, questionSourceMode, currentSessionQuestionIds]);

  const fetchData = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/");
      return;
    }

    try {
      const sessionResponse = await axios.get(`${API_URL}/sessions/${sessionId}`, {
        headers: { Authorization: token },
      });
      setSessionDetails(sessionResponse.data);

      const questionsResponse = await axios.get(`${API_URL}/sessions/${sessionId}/questions`, {
        headers: { Authorization: token },
      });
      setQuestions(questionsResponse.data);

      const availableQuestionsResponse = await axios.get(`${API_URL}/sessions/${sessionId}/available-questions`, {
        headers: { Authorization: token },
      });
      setAllQuestions(availableQuestionsResponse.data);

      const sessionsResponse = await axios
        .get(`${API_URL}/sessions`, {
          headers: { Authorization: token },
        })
        .catch(() => ({ data: [] }));
      setAvailableSourceSessions(
        Array.isArray(sessionsResponse.data)
          ? sessionsResponse.data.filter((session) => String(session.id) !== String(sessionId))
          : []
      );

      const groupsResponse = await axios.get(`${API_URL}/sessions/${sessionId}/groups`, {
        headers: { Authorization: token },
      });
      setGroups(groupsResponse.data);
    } catch (err) {
      console.error("Error fetching session manager data:", err);
    }
  }, [API_URL, navigate, sessionId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      return;
    }

    if (questionSourceMode !== "session" || !sourceSessionId) {
      setSourceSessionQuestions([]);
      return;
    }

    const fetchSourceSessionQuestions = async () => {
      try {
        const response = await axios.get(`${API_URL}/sessions/${sourceSessionId}/questions`, {
          headers: { Authorization: token },
        });
        setSourceSessionQuestions(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        console.error("Failed to fetch source session questions:", err);
        setSourceSessionQuestions([]);
      }
    };

    fetchSourceSessionQuestions();
  }, [API_URL, questionSourceMode, sourceSessionId]);

  const createQuestion = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    try {
      const response = await axios.post(`${API_URL}/questions`, newQuestion, {
        headers: { Authorization: token },
      });

      await axios.post(
        `${API_URL}/sessions/${sessionId}/questions`,
        {
          question_id: response.data.id,
          question_order: newQuestion.question_order,
        },
        {
          headers: { Authorization: token },
        }
      );

      if (
        newQuestion.response_type === QUESTION_RESPONSE_TYPES.SINGLE_CHOICE &&
        newQuestion.options.length > 0
      ) {
        await axios.post(
          `${API_URL}/questions/${response.data.id}/options`,
          { options: newQuestion.options },
          {
            headers: { Authorization: token },
          }
        );
      }

      setShowNewQuestionForm(false);
      setNewQuestion({
        type: "",
        response_type: "",
        title: "",
        expected_answer: "",
        allocated_time: "",
        options: [],
      });
      setOptionInput("");
      fetchData();
    } catch (err) {
      console.error("Failed to create and link question:", err);
    }
  };

  const addOption = () => {
    if (optionInput.trim()) {
      setNewQuestion((prev) => ({
        ...prev,
        options: [...prev.options, optionInput.trim()],
      }));
      setOptionInput("");
    }
  };

  const removeOption = (index) => {
    setNewQuestion((prev) => ({
      ...prev,
      options: prev.options.filter((_, optionIndex) => optionIndex !== index),
    }));
  };

  const linkExistingQuestion = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    try {
      await axios.post(
        `${API_URL}/sessions/${sessionId}/questions`,
        {
          question_id: selectedQuestionId,
          question_order: newQuestion.question_order,
        },
        {
          headers: { Authorization: token },
        }
      );

      setSelectedQuestionId("");
      setSourceSessionQuestions((prev) =>
        prev.filter((question) => Number(question.id) !== Number(selectedQuestionId))
      );
      fetchData();
    } catch (err) {
      console.error("Failed to link existing question:", err);
    }
  };

  const createGroup = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    try {
      const response = await axios.post(`${API_URL}/sessions/${sessionId}/groups`, newGroup, {
        headers: { Authorization: token },
      });
      setGroups((prev) => [...prev, response.data]);
      setNewGroup({ name: "", description: "" });
      setShowNewGroupForm(false);
    } catch (err) {
      console.error("Failed to create group:", err);
    }
  };

  const editQuestion = async (questionId) => {
    const token = localStorage.getItem("token");
    try {
      const response = await axios.get(`${API_URL}/questions/${questionId}`, {
        headers: { Authorization: token },
      });

      const questionData = response.data;

      if (questionData.response_type === QUESTION_RESPONSE_TYPES.SINGLE_CHOICE) {
        const optionsResponse = await axios.get(`${API_URL}/questions/${questionId}/options`, {
          headers: { Authorization: token },
        });
        questionData.options = optionsResponse.data.map((opt) => opt.option_text);
      } else {
        questionData.options = [];
      }

      setEditingQuestion(questionData);
    } catch (err) {
      console.error("Failed to fetch question details:", err);
    }
  };

  const updateQuestion = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    try {
      await axios.put(
        `${API_URL}/sessions/${sessionId}/questions/${editingQuestion.id}`,
        {
          question_order: editingQuestion.question_order,
          type: editingQuestion.type,
          title: editingQuestion.title,
          expected_answer: editingQuestion.expected_answer,
          allocated_time: editingQuestion.allocated_time,
          question_icon: editingQuestion.question_icon,
          options: editingQuestion.options,
          response_type: editingQuestion.response_type,
        },
        {
          headers: { Authorization: token },
        }
      );

      setEditingQuestion(null);
      setOptionInput("");
      fetchData();
    } catch (err) {
      console.error("Failed to update question:", err);
    }
  };

  const editGroup = async (groupId) => {
    const token = localStorage.getItem("token");
    try {
      const response = await axios.get(`${API_URL}/sessions/${sessionId}/groups/${groupId}`, {
        headers: { Authorization: token },
      });
      setEditingGroup(response.data);
    } catch (err) {
      console.error("Failed to fetch group details:", err);
    }
  };

  const updateGroup = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    if (!editingGroup || !editingGroup.id) {
      console.error("Group ID is missing");
      return;
    }

    try {
      const response = await axios.put(
        `${API_URL}/sessions/${sessionId}/groups/${editingGroup.id}`,
        editingGroup,
        {
          headers: { Authorization: token },
        }
      );

      setGroups((prev) =>
        prev.map((group) =>
          group.id === editingGroup.id ? { ...group, ...response.data } : group
        )
      );

      setEditingGroup(null);
    } catch (err) {
      console.error("Failed to update group:", err);
    }
  };

  const cancelQuestionEdit = () => {
    setEditingQuestion(null);
    setOptionInput("");
  };

  const cancelGroupEdit = () => {
    setEditingGroup(null);
  };

  const deleteGroup = async (groupId) => {
    const token = localStorage.getItem("token");
    try {
      await axios.delete(`${API_URL}/sessions/${sessionId}/groups/${groupId}`, {
        headers: { Authorization: token },
      });
      setGroups((prev) => prev.filter((group) => group.id !== groupId));
    } catch (err) {
      console.error("Failed to delete group:", err);
    }
  };

  const removeQuestionFromSession = async (questionId) => {
    const token = localStorage.getItem("token");
    try {
      await axios.delete(`${API_URL}/sessions/${sessionId}/questions/${questionId}`, {
        headers: { Authorization: token },
      });
      setQuestions((prev) => prev.filter((question) => question.id !== questionId));
    } catch (err) {
      console.error("Failed to remove question from session:", err);
    }
  };

  return (
    <div className={embedded ? "session-manager-panel session-manager-panel-embedded" : "session-manager-panel"}>
      {!embedded && (
        <div className="session-manager-header">
          <h1>
            {sessionTitlePrefix}
            {sessionDetails.title}
          </h1>
        </div>
      )}

      <details className="session-accordion" open>
        <summary className="session-accordion-summary">{t("sessionQuestions")}</summary>
        <div className="session-accordion-content">
          <div className="session-manager-toolbar">
            <button className="admin-button" onClick={() => setShowNewQuestionForm((prev) => !prev)}>
              {showNewQuestionForm ? t("commonCancel") : t("sessionNewQuestion")}
            </button>
          </div>

          <h2 className="title">{t("sessionQuestions")}</h2>
          {questions.length === 0 ? (
            <p>{t("sessionNoQuestions")}</p>
          ) : (
            <div className="mobile-table-scroll" role="region" aria-label={t("ariaQuestionsTable")} tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th>{t("sessionCategory")}</th>
                    <th>{t("sessionResponseType")}</th>
                    <th>{t("sessionQuestionTitle")}</th>
                    <th>{t("sessionExpectedAnswer")}</th>
                    <th>{t("sessionAllocatedTime")}</th>
                    <th>{t("sessionOrder")}</th>
                    <th>{t("adminActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.map((question) => (
                    <tr key={question.id}>
                      <td>{question.type === "green" ? t("sessionFastQuestion") : t("sessionCalcQuestion")}</td>
                      <td>{question.response_type}</td>
                      <td>
                        <pre className="session-manager-pre">{question.title}</pre>
                      </td>
                      <td>
                        <pre className="session-manager-pre">{question.expected_answer}</pre>
                      </td>
                      <td>{question.allocated_time}</td>
                      <td>{question.question_order || "-"}</td>
                      <td className="actions">
                        <div className="row-actions">
                          <button className="admin-button" onClick={() => editQuestion(question.id)}>
                            {t("commonEdit")}
                          </button>
                          <button className="admin-button" onClick={() => removeQuestionFromSession(question.id)}>
                            {t("adminDelete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showNewQuestionForm && (
            <div className="modal-overlay" onClick={() => setShowNewQuestionForm(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-sticky-header">
                  <h3>{t("commonCreate")}</h3>
                  <button className="admin-ghost-button" type="button" onClick={() => setShowNewQuestionForm(false)}>{t("commonClose")}</button>
                </div>
                <div className="modal-body">
                <form onSubmit={createQuestion}>
                  <label htmlFor="new-question-type">{t("sessionQuestionCategory")}</label>
                  <select
                    id="new-question-type"
                    value={newQuestion.type}
                    onChange={(e) => setNewQuestion({ ...newQuestion, type: e.target.value })}
                    required
                  >
                    <option value="">{t("sessionSelectCategory")}</option>
                    <option value="red">{t("sessionCalcQuestion")}</option>
                    <option value="green">{t("sessionFastQuestion")}</option>
                  </select>
                  <label htmlFor="new-question-response-type">{t("sessionResponseType")}</label>
                  <select
                    id="new-question-response-type"
                    value={newQuestion.response_type}
                    onChange={(e) => setNewQuestion({ ...newQuestion, response_type: e.target.value })}
                    required
                  >
                    <option value="">{t("sessionResponseType")}</option>
                    <option value={QUESTION_RESPONSE_TYPES.SINGLE_CHOICE}>{t("sessionResponseTypeSingleChoice")}</option>
                    <option value={QUESTION_RESPONSE_TYPES.FREE_TEXT}>{t("sessionResponseTypeFreeText")}</option>
                  </select>
                  <label htmlFor="new-question-title">{t("sessionQuestionTitle")}</label>
                  <textarea
                    id="new-question-title"
                    placeholder={t("sessionQuestionTitle")}
                    value={newQuestion.title}
                    onChange={(e) => setNewQuestion({ ...newQuestion, title: e.target.value })}
                    rows={3}
                    required
                  />
                  <label htmlFor="new-question-expected-answer">{t("sessionExpectedAnswer")}</label>
                  <textarea
                    id="new-question-expected-answer"
                    placeholder={t("sessionExpectedAnswer")}
                    value={newQuestion.expected_answer}
                    onChange={(e) => setNewQuestion({ ...newQuestion, expected_answer: e.target.value })}
                    rows={3}
                    required
                  />
                  <label htmlFor="new-question-time">{t("sessionAllocatedTimeSeconds")}</label>
                  <input
                    id="new-question-time"
                    type="number"
                    placeholder={t("sessionAllocatedTime")}
                    value={newQuestion.allocated_time}
                    onChange={(e) => setNewQuestion({ ...newQuestion, allocated_time: e.target.value })}
                    required
                  />
                  <label htmlFor="new-question-order">{t("sessionOrder")}</label>
                  <input
                    id="new-question-order"
                    type="number"
                    placeholder={t("sessionOrder")}
                    value={newQuestion.question_order || ""}
                    onChange={(e) => setNewQuestion({ ...newQuestion, question_order: e.target.value })}
                    required
                  />
                  {newQuestion.response_type === QUESTION_RESPONSE_TYPES.SINGLE_CHOICE && (
                    <div>
                      <h4>{t("sessionOptions")}</h4>
                      <ul>
                        {newQuestion.options.map((option, index) => (
                          <li key={index}>
                            {option}
                            <button className="admin-button" type="button" onClick={() => removeOption(index)}>
                              {t("adminDelete")}
                            </button>
                          </li>
                        ))}
                      </ul>
                      <label htmlFor="new-question-option">{t("sessionNewOption")}</label>
                      <input
                        id="new-question-option"
                        type="text"
                        placeholder={t("sessionAddOption")}
                        value={optionInput}
                        onChange={(e) => setOptionInput(e.target.value)}
                      />
                      <button className="admin-button" type="button" onClick={addOption}>
                        {t("sessionAddOption")}
                      </button>
                    </div>
                  )}
                  <div className="flex-buttons-container">
                    <button className="admin-button" type="submit">{t("commonCreate")}</button>
                    <button className="admin-button" type="button" onClick={() => setShowNewQuestionForm(false)}>
                      {t("commonCancel")}
                    </button>
                  </div>
                </form>
                </div>
              </div>
            </div>
          )}

          {editingQuestion && (
            <div className="modal-overlay" onClick={cancelQuestionEdit}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-sticky-header">
                  <h3>{t("commonEdit")}</h3>
                  <button className="admin-ghost-button" type="button" onClick={cancelQuestionEdit}>{t("commonClose")}</button>
                </div>
                <div className="modal-body">
                <form onSubmit={updateQuestion}>
                  <label htmlFor="edit-question-type">{t("sessionQuestionCategory")}</label>
                  <select
                    id="edit-question-type"
                    value={editingQuestion.type}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, type: e.target.value })}
                  >
                    <option value="red">{t("sessionCalcQuestion")}</option>
                    <option value="green">{t("sessionFastQuestion")}</option>
                  </select>
                  <label htmlFor="edit-question-response-type">{t("sessionResponseType")}</label>
                  <select
                    id="edit-question-response-type"
                    value={editingQuestion.response_type}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, response_type: e.target.value })}
                    required
                  >
                    <option value="">{t("sessionResponseType")}</option>
                    <option value={QUESTION_RESPONSE_TYPES.SINGLE_CHOICE}>{t("sessionResponseTypeSingleChoice")}</option>
                    <option value={QUESTION_RESPONSE_TYPES.FREE_TEXT}>{t("sessionResponseTypeFreeText")}</option>
                  </select>
                  <label htmlFor="edit-question-title">{t("sessionQuestionTitle")}</label>
                  <textarea
                    id="edit-question-title"
                    value={editingQuestion.title}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, title: e.target.value })}
                    rows={3}
                    required
                  />
                  <label htmlFor="edit-question-expected-answer">{t("sessionExpectedAnswer")}</label>
                  <textarea
                    id="edit-question-expected-answer"
                    value={editingQuestion.expected_answer}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, expected_answer: e.target.value })}
                    rows={3}
                    required
                  />
                  <label htmlFor="edit-question-time">{t("sessionAllocatedTimeSeconds")}</label>
                  <input
                    id="edit-question-time"
                    type="number"
                    value={editingQuestion.allocated_time}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, allocated_time: e.target.value })}
                  />
                  <label htmlFor="edit-question-order">{t("sessionOrder")}</label>
                  <input
                    id="edit-question-order"
                    type="number"
                    value={editingQuestion.question_order || ""}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, question_order: e.target.value })}
                  />
                  {editingQuestion.response_type === QUESTION_RESPONSE_TYPES.SINGLE_CHOICE && (
                    <div>
                      <h4>{t("sessionEditOptions")}</h4>
                      <ul>
                        {editingQuestion.options.map((option, index) => (
                          <li className="options-list-session" key={index}>
                            {option}
                            <button
                              className="admin-button"
                              type="button"
                              onClick={() =>
                                setEditingQuestion((prev) => ({
                                  ...prev,
                                  options: prev.options.filter((_, optionIndex) => optionIndex !== index),
                                }))
                              }
                            >
                              {t("adminDelete")}
                            </button>
                          </li>
                        ))}
                      </ul>
                      <label htmlFor="edit-question-option">{t("sessionNewOption")}</label>
                      <input
                        id="edit-question-option"
                        type="text"
                        placeholder={t("sessionAddOption")}
                        value={optionInput}
                        onChange={(e) => setOptionInput(e.target.value)}
                      />
                      <button
                        className="admin-button"
                        type="button"
                        onClick={() => {
                          if (optionInput.trim()) {
                            setEditingQuestion((prev) => ({
                              ...prev,
                              options: [...prev.options, optionInput.trim()],
                            }));
                            setOptionInput("");
                          }
                        }}
                      >
                        {t("sessionAddOption")}
                      </button>
                    </div>
                  )}
                  <div className="flex-buttons-container">
                    <button className="admin-button" type="submit">{t("commonUpdate")}</button>
                    <button className="admin-button" type="button" onClick={cancelQuestionEdit}>
                      {t("commonCancel")}
                    </button>
                  </div>
                </form>
                </div>
              </div>
            </div>
          )}

          <h2 className="title">{t("sessionLinkExistingQuestion")}</h2>
          <form onSubmit={linkExistingQuestion}>
            <label htmlFor="link-question-source-mode">{t("sessionQuestionSourceLabel")}</label>
            <select
              id="link-question-source-mode"
              value={questionSourceMode}
              onChange={(e) => {
                setQuestionSourceMode(e.target.value);
                setSelectedQuestionId("");
                if (e.target.value !== "session") {
                  setSourceSessionId("");
                }
              }}
            >
              <option value="all">{t("sessionQuestionSourceAll")}</option>
              <option value="session">{t("sessionQuestionSourceSession")}</option>
            </select>

            {questionSourceMode === "session" && (
              <>
                <label htmlFor="link-question-source-session">{t("sessionQuestionSourceSessionLabel")}</label>
                <select
                  id="link-question-source-session"
                  value={sourceSessionId}
                  onChange={(e) => {
                    setSourceSessionId(e.target.value);
                    setSelectedQuestionId("");
                  }}
                  required
                >
                  <option value="">{t("sessionSelectSourceSession")}</option>
                  {availableSourceSessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.title || `${t("adminSessionWord")} #${session.id}`}
                    </option>
                  ))}
                </select>
              </>
            )}

            <label htmlFor="link-question-id">{t("sessionQuestionToLink")}</label>
            <select
              id="link-question-id"
              value={selectedQuestionId}
              onChange={(e) => setSelectedQuestionId(e.target.value)}
              required
              disabled={questionSourceMode === "session" && !sourceSessionId}
            >
              <option value="">{t("sessionSelectQuestion")}</option>
              {availableQuestionsToLink.length > 0 ? (
                availableQuestionsToLink.map((question) => (
                  <option key={question.id} value={question.id}>
                    {question.type === "green"
                      ? t("sessionFastQuestion")
                      : `${t("sessionCalcQuestion")} ${question.title}`}
                  </option>
                ))
              ) : (
                <option value="" disabled>
                  {t("sessionNoAvailableQuestion")}
                </option>
              )}
            </select>
            <label htmlFor="link-question-order">{t("sessionOrder")}</label>
            <input
              id="link-question-order"
              type="number"
              placeholder={t("sessionOrder")}
              value={newQuestion.question_order || ""}
              onChange={(e) => setNewQuestion({ ...newQuestion, question_order: e.target.value })}
              required
            />
            <button
              className="admin-button"
              type="submit"
              disabled={availableQuestionsToLink.length === 0 || (questionSourceMode === "session" && !sourceSessionId)}
            >
              {t("sessionLinkQuestion")}
            </button>
          </form>
        </div>
      </details>

      <details className="session-accordion">
        <summary className="session-accordion-summary">{t("sessionGroups")}</summary>
        <div className="session-accordion-content">
          <h2 className="title">{t("sessionGroups")}</h2>
          {groups.length === 0 ? (
            <p>{t("sessionNoGroups")}</p>
          ) : (
            <div className="mobile-table-scroll" role="region" aria-label={t("ariaGroupsTable")} tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th>{t("sessionGroupName")}</th>
                    <th>{t("sessionAvatar")}</th>
                    <th>{t("adminActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <tr key={group.id}>
                      <td>
                        <div className="group-title-with-avatar">
                          <img
                            src={getAvatarUrl(group.avatar_name)}
                            alt={group.avatar_name || t("commonAvatar")}
                            className="group-title-avatar"
                          />
                          <span>{group.name}</span>
                        </div>
                      </td>
                      <td>
                        <img src={group.avatar_url} alt={group.avatar_name} style={{ width: "50px", height: "50px" }} />
                      </td>
                      <td className="actions">
                        <div className="row-actions">
                          <button className="admin-button" onClick={() => editGroup(group.id)}>
                            {t("commonEdit")}
                          </button>
                          <button className="admin-button" onClick={() => deleteGroup(group.id)}>
                            {t("adminDelete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button className="admin-button" onClick={() => setShowNewGroupForm((prev) => !prev)}>
            {showNewGroupForm ? t("commonCancel") : t("sessionNewGroup")}
          </button>
        </div>
      </details>

      {showNewGroupForm && (
        <div className="modal-overlay" onClick={() => setShowNewGroupForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-sticky-header">
              <h3>{t("sessionNewGroup")}</h3>
              <button className="admin-ghost-button" type="button" onClick={() => setShowNewGroupForm(false)}>{t("commonClose")}</button>
            </div>
            <div className="modal-body">
            <form onSubmit={createGroup}>
              <label htmlFor="new-group-name">{t("sessionGroupName")}</label>
              <input
                id="new-group-name"
                type="text"
                placeholder={t("sessionGroupName")}
                value={newGroup.name}
                onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                required
              />
              <label htmlFor="new-group-description">{t("sessionGroupDescription")}</label>
              <input
                id="new-group-description"
                type="text"
                placeholder={t("sessionGroupDescription")}
                value={newGroup.description}
                onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
              />
              <div className="avatar-preview-chip" aria-live="polite">
                <img
                  src={getAvatarUrl(newGroup.avatar_name || "Pill")}
                  alt={renderTemplate("sessionAvatarAlt", { name: newGroup.avatar_name || "Pill" })}
                  className="avatar-preview-image"
                />
                <span>
                  {t("sessionSelectedAvatar")}: {newGroup.avatar_name || "Pill"}
                </span>
              </div>
              <label htmlFor="new-group-avatar">{t("sessionAvatar")}</label>
              <select
                id="new-group-avatar"
                value={newGroup.avatar_name || ""}
                onChange={(e) => setNewGroup({ ...newGroup, avatar_name: e.target.value })}
                required
              >
                <option value="">{t("sessionSelectAvatar")}</option>
                {AVATAR_OPTIONS.map((avatar) => (
                  <option key={avatar} value={avatar}>
                    {avatar}
                  </option>
                ))}
              </select>
              <div className="flex-buttons-container">
                <button className="admin-button" type="submit">{t("commonCreate")}</button>
                <button className="admin-button" type="button" onClick={() => setShowNewGroupForm(false)}>
                  {t("commonCancel")}
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      {editingGroup && (
        <div className="modal-overlay" onClick={cancelGroupEdit}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-sticky-header">
              <h3>{t("commonEdit")}</h3>
              <button className="admin-ghost-button" type="button" onClick={cancelGroupEdit}>{t("commonClose")}</button>
            </div>
            <div className="modal-body">
            <form onSubmit={updateGroup}>
              <label htmlFor="edit-group-name">{t("sessionGroupName")}</label>
              <input
                id="edit-group-name"
                type="text"
                value={editingGroup.name}
                onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })}
              />
              <label htmlFor="edit-group-description">{t("sessionGroupDescription")}</label>
              <input
                id="edit-group-description"
                type="text"
                value={editingGroup.description}
                onChange={(e) => setEditingGroup({ ...editingGroup, description: e.target.value })}
              />
              <div className="avatar-preview-chip" aria-live="polite">
                <img
                  src={getAvatarUrl(editingGroup.avatar_name || "Pill")}
                  alt={renderTemplate("sessionAvatarAlt", { name: editingGroup.avatar_name || "Pill" })}
                  className="avatar-preview-image"
                />
                <span>
                  {t("sessionSelectedAvatar")}: {editingGroup.avatar_name || "Pill"}
                </span>
              </div>
              <label htmlFor="edit-group-avatar">{t("sessionAvatar")}</label>
              <select
                id="edit-group-avatar"
                value={editingGroup.avatar_name || ""}
                onChange={(e) => setEditingGroup({ ...editingGroup, avatar_name: e.target.value })}
                required
              >
                <option value="">{t("sessionSelectAvatar")}</option>
                {AVATAR_OPTIONS.map((avatar) => (
                  <option key={avatar} value={avatar}>
                    {avatar}
                  </option>
                ))}
              </select>
              <div className="flex-buttons-container">
                <button className="admin-button" type="submit">{t("commonUpdate")}</button>
                <button className="admin-button" type="button" onClick={cancelGroupEdit}>
                  {t("commonCancel")}
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SessionManagerPanel;