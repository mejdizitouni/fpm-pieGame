import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import Header from "./Header";
import Footer from "./Footer";
import "./Session.css"; // Import the CSS file for styling

function Session() {
  const API_URL = process.env.REACT_APP_API_URL;
  const { id } = useParams(); // Get the session ID from the URL
  const [sessionDetails, setSessionDetails] = useState({});
  const [questions, setQuestions] = useState([]);
  const [newQuestion, setNewQuestion] = useState({
    type: "",
    title: "",
    expected_answer: "",
    allocated_time: "",
    options: [],
  });
  const [optionInput, setOptionInput] = useState(""); // Input for new options
  const [allQuestions, setAllQuestions] = useState([]); // To store available questions
  const [selectedQuestionId, setSelectedQuestionId] = useState(""); // To store selected question ID
  const [groups, setGroups] = useState([]);
  const [newGroup, setNewGroup] = useState({
    name: "",
    description: "",
  });
  const [showNewQuestionForm, setShowNewQuestionForm] = useState(false); // Toggle for New Question form
  const [showNewGroupForm, setShowNewGroupForm] = useState(false); // Toggle for New Group form
  const [editingQuestion, setEditingQuestion] = useState(null); // To handle question editing
  const [editingGroup, setEditingGroup] = useState(null); // To handle group editing
  const navigate = useNavigate();

  const fetchData = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/");
      return;
    }

    try {
      // Fetch session details (including title)
      const sessionResponse = await axios.get(`${API_URL}/sessions/${id}`, {
        headers: { Authorization: token },
      });
      setSessionDetails(sessionResponse.data);

      // Fetch questions for the current session
      const questionsResponse = await axios.get(
        `${API_URL}/sessions/${id}/questions`,
        {
          headers: { Authorization: token },
        }
      );
      setQuestions(questionsResponse.data);

      // Fetch all available questions (not linked to this session)
      const availableQuestionsResponse = await axios.get(
        `${API_URL}/sessions/${id}/available-questions`,
        {
          headers: { Authorization: token },
        }
      );
      setAllQuestions(availableQuestionsResponse.data);

      // Fetch groups
      const groupsResponse = await axios.get(
        `${API_URL}/sessions/${id}/groups`,
        {
          headers: { Authorization: token },
        }
      );
      setGroups(groupsResponse.data);
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id, navigate]);

  const createQuestion = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    try {
      const response = await axios.post(`${API_URL}/questions`, newQuestion, {
        headers: { Authorization: token },
      });

      // Link the newly created question to the session
      await axios.post(
        `${API_URL}/sessions/${id}/questions`,
        { question_id: response.data.id, question_order: newQuestion.question_order },
        {
          headers: { Authorization: token },
        }
      );

      // If the question has options, save them
      if (newQuestion.type === "red" && newQuestion.options.length > 0) {
        await axios.post(
          `${API_URL}/questions/${response.data.id}/options`,
          { options: newQuestion.options },
          {
            headers: { Authorization: token },
          }
        );
      }
      setShowNewQuestionForm(false); // Hide the form after creating the question
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
      options: prev.options.filter((_, i) => i !== index),
    }));
  };

  const linkExistingQuestion = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    try {
      // Link the existing question to the session
      await axios.post(
        `${API_URL}/sessions/${id}/questions`,
        { question_id: selectedQuestionId, question_order: newQuestion.question_order },
        {
          headers: { Authorization: token },
        }
      );

      // Fetch the full details of the newly linked question
      const response = await axios.get(
        `${API_URL}/questions/${selectedQuestionId}`,
        {
          headers: { Authorization: token },
        }
      );

      setSelectedQuestionId(""); // Reset the dropdown
      fetchData();
    } catch (err) {
      console.error("Failed to link existing question:", err);
    }
  };

  const createGroup = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    try {
      const response = await axios.post(
        `${API_URL}/sessions/${id}/groups`,
        newGroup,
        {
          headers: { Authorization: token },
        }
      );
      setGroups((prev) => [...prev, response.data]);
      setNewGroup({ name: "", description: "" }); // Reset form
      setShowNewGroupForm(false); // Hide the form after creating the group
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
  
      // If the question is a red question, fetch its options
      if (questionData.type === "red") {
        const optionsResponse = await axios.get(
          `${API_URL}/questions/${questionId}/options`,
          { headers: { Authorization: token } }
        );
        questionData.options = optionsResponse.data.map((opt) => opt.option_text);
      } else {
        questionData.options = [];
      }
  
      setEditingQuestion(questionData); // Ensure question_order is included
    } catch (err) {
      console.error("Failed to fetch question details:", err);
    }
  };
  
  
  const updateQuestion = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
  
    try {
      // Update the question details
      await axios.put(
        `${API_URL}/sessions/${id}/questions/${editingQuestion.id}`,
        {
          question_order: editingQuestion.question_order, // Include question_order
        },
        {
          headers: { Authorization: token },
        }
      );
  
      setEditingQuestion(null); // Clear the editing state
      fetchData(); // Refresh the questions list
    } catch (err) {
      console.error("Failed to update question:", err);
    }
  };
  
  
  const editGroup = async (groupId) => {
    const token = localStorage.getItem("token");
    try {
      const response = await axios.get(
        `${API_URL}/sessions/${id}/groups/${groupId}`,
        {
          headers: { Authorization: token },
        }
      );
      console.log("Group data fetched:", response.data); // Debugging line
      setEditingGroup(response.data);
    } catch (err) {
      console.error("Failed to fetch group details:", err);
    }
  };

  const updateGroup = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    // Ensure editingGroup has the correct id before making the update
    if (!editingGroup || !editingGroup.id) {
      console.error("Group ID is missing");
      return;
    }

    try {
      const response = await axios.put(
        `${API_URL}/sessions/${id}/groups/${editingGroup.id}`,
        editingGroup,
        {
          headers: { Authorization: token },
        }
      );

      // Update the groups list with the updated group
      setGroups((prev) =>
        prev.map((g) =>
          g.id === editingGroup.id ? { ...g, ...response.data } : g
        )
      );

      setEditingGroup(null); // Clear the editing state after the update
    } catch (err) {
      console.error("Failed to update group:", err);
    }
  };

  // Cancel the question edit and reset state
  const cancelQuestionEdit = () => {
    setEditingQuestion(null);
  };

  // Cancel the group edit and reset state
  const cancelGroupEdit = () => {
    setEditingGroup(null);
  };

  const deleteGroup = async (groupId) => {
    const token = localStorage.getItem("token");
    try {
      const response = await axios.delete(
        `${API_URL}/sessions/${id}/groups/${groupId}`,
        {
          headers: { Authorization: token },
        }
      );
      console.log("Group deleted:", response.data);
      setGroups(groups.filter((group) => group.id !== groupId)); // Remove group from state
    } catch (err) {
      console.error("Failed to delete group:", err);
    }
  };

  const removeQuestionFromSession = async (questionId) => {
    const token = localStorage.getItem("token");
    try {
      const response = await axios.delete(
        `${API_URL}/sessions/${id}/questions/${questionId}`,
        {
          headers: { Authorization: token },
        }
      );
      console.log("Question removed from session:", response.data);
      setQuestions(questions.filter((q) => q.id !== questionId)); // Remove question from state
    } catch (err) {
      console.error("Failed to remove question from session:", err);
    }
  };

  return (
    <>
      <Header />
      <div className="session-container">
        <h1>Session {sessionDetails.title} Details</h1>

        <h2>Questions</h2>
        {questions.length === 0 ? (
          <p>No questions available for this session.</p>
        ) : (
          <table>
            <thead>
  <tr>
    <th>ID</th>
    <th>Type</th>
    <th>Title</th>
    <th>Expected Answer</th>
    <th>Allocated Time</th>
    <th>Order</th> {/* New column for question_order */}
    <th>Actions</th>
  </tr>
</thead>
<tbody>
  {questions.map((question) => (
    <tr key={question.id}>
      <td>{question.id}</td>
      <td>{question.type}</td>
      <td>{question.title}</td>
      <td>{question.expected_answer}</td>
      <td>{question.allocated_time}</td>
      <td>{question.question_order || "-"}</td> {/* Display question_order */}
      <td>
        <button onClick={() => editQuestion(question.id)}>Edit</button>
        <button onClick={() => removeQuestionFromSession(question.id)}>
          Remove
        </button>
      </td>
    </tr>
  ))}
</tbody>
          </table>
        )}

        {/* New Question Button */}
        <button onClick={() => setShowNewQuestionForm(!showNewQuestionForm)}>
          {showNewQuestionForm ? "Cancel" : "New Question"}
        </button>

        {/* New Question Form */}
        {showNewQuestionForm && (
          <form onSubmit={createQuestion}>
            <select
              value={newQuestion.type}
              onChange={(e) =>
                setNewQuestion({ ...newQuestion, type: e.target.value })
              }
              required
            >
              <option value="">Select Type</option>
              <option value="red">Red</option>
              <option value="green">Green</option>
            </select>
            <input
              type="text"
              placeholder="Title"
              value={newQuestion.title}
              onChange={(e) =>
                setNewQuestion({ ...newQuestion, title: e.target.value })
              }
              required
            />
            <input
              type="text"
              placeholder="Expected Answer"
              value={newQuestion.expected_answer}
              onChange={(e) =>
                setNewQuestion({
                  ...newQuestion,
                  expected_answer: e.target.value,
                })
              }
              required
            />
            <input
              type="number"
              placeholder="Allocated Time"
              value={newQuestion.allocated_time}
              onChange={(e) =>
                setNewQuestion({
                  ...newQuestion,
                  allocated_time: e.target.value,
                })
              }
              required
            />
             <input
      type="number"
      placeholder="Order"
      value={newQuestion.question_order || ""}
      onChange={(e) =>
        setNewQuestion({
          ...newQuestion,
          question_order: e.target.value,
        })
      }
      required
    />
            {/* Options for Red Questions */}
            {newQuestion.type === "red" && (
              <div>
                <h4>Options</h4>
                <ul>
                  {newQuestion.options.map((option, index) => (
                    <li key={index}>
                      {option}
                      <button type="button" onClick={() => removeOption(index)}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                <input
                  type="text"
                  placeholder="Add option"
                  value={optionInput}
                  onChange={(e) => setOptionInput(e.target.value)}
                />
                <button type="button" onClick={addOption}>
                  Add Option
                </button>
              </div>
            )}
            <button type="submit">Create</button>
          </form>
        )}

        {/* Editing a Question */}
        {editingQuestion && (
  <form onSubmit={updateQuestion}>
    <select
      value={editingQuestion.type}
      onChange={(e) =>
        setEditingQuestion({
          ...editingQuestion,
          type: e.target.value,
        })
      }
    >
      <option value="red">Red</option>
      <option value="green">Green</option>
    </select>
    <input
      type="text"
      value={editingQuestion.title}
      onChange={(e) =>
        setEditingQuestion({
          ...editingQuestion,
          title: e.target.value,
        })
      }
    />
    <input
      type="text"
      value={editingQuestion.expected_answer}
      onChange={(e) =>
        setEditingQuestion({
          ...editingQuestion,
          expected_answer: e.target.value,
        })
      }
    />
    <input
      type="number"
      value={editingQuestion.allocated_time}
      onChange={(e) =>
        setEditingQuestion({
          ...editingQuestion,
          allocated_time: e.target.value,
        })
      }
    />
    <input
      type="number"
      value={editingQuestion.question_order || ""}
      onChange={(e) =>
        setEditingQuestion({
          ...editingQuestion,
          question_order: e.target.value,
        })
      }
    />

    {/* Options for Red Questions */}
    {editingQuestion.type === "red" && (
      <div>
        <h4>Edit Options</h4>
        <ul>
          {editingQuestion.options.map((option, index) => (
            <li key={index}>
              {option}
              <button
                type="button"
                onClick={() =>
                  setEditingQuestion((prev) => ({
                    ...prev,
                    options: prev.options.filter((_, i) => i !== index),
                  }))
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <input
          type="text"
          placeholder="Add option"
          value={optionInput}
          onChange={(e) => setOptionInput(e.target.value)}
        />
        <button
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
          Add Option
        </button>
      </div>
    )}
    <button type="submit">Update</button>
    <button type="button" onClick={cancelQuestionEdit}>
      Cancel
    </button>
  </form>
)}


        <h2>Link Existing Question</h2>
        <form onSubmit={linkExistingQuestion}>
          <select
            value={selectedQuestionId}
            onChange={(e) => setSelectedQuestionId(e.target.value)}
            required
          >
            <option value="">Select a question</option>
            {Array.isArray(allQuestions) && allQuestions.length > 0 ? (
              allQuestions.map((question) => (
                <option key={question.id} value={question.id}>
                  {question.title}
                </option>
              ))
            ) : (
              <option value="" disabled>
                No questions available
              </option>
            )}
          </select>
          <input
    type="number"
    placeholder="Order"
    value={newQuestion.question_order || ""}
    onChange={(e) =>
      setNewQuestion({
        ...newQuestion,
        question_order: e.target.value,
      })
    }
    required
  />
          <button type="submit" disabled={allQuestions.length === 0}>
            Link Question
          </button>
        </form>

        <h2>Groups</h2>
        {groups.length === 0 ? (
          <p>No groups available for this session.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.id}>
                  <td>{group.id}</td>
                  <td>{group.name}</td>
                  <td>{group.description}</td>
                  <td class="actions">
                    <button onClick={() => editGroup(group.id)}>Edit</button>
                    <button onClick={() => deleteGroup(group.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* New Group Button */}
        <button onClick={() => setShowNewGroupForm(!showNewGroupForm)}>
          {showNewGroupForm ? "Cancel" : "New Group"}
        </button>

        {/* New Group Form */}
        {showNewGroupForm && (
          <form onSubmit={createGroup}>
            <input
              type="text"
              placeholder="Group Name"
              value={newGroup.name}
              onChange={(e) =>
                setNewGroup({ ...newGroup, name: e.target.value })
              }
              required
            />
            <input
              type="text"
              placeholder="Group Description"
              value={newGroup.description}
              onChange={(e) =>
                setNewGroup({ ...newGroup, description: e.target.value })
              }
              required
            />
            <button type="submit">Create</button>
          </form>
        )}

        {editingGroup && (
          <form onSubmit={updateGroup}>
            <input
              type="text"
              value={editingGroup.name}
              onChange={(e) =>
                setEditingGroup({ ...editingGroup, name: e.target.value })
              }
            />
            <input
              type="text"
              value={editingGroup.description}
              onChange={(e) =>
                setEditingGroup({
                  ...editingGroup,
                  description: e.target.value,
                })
              }
            />
            <button type="submit">Update</button>
            <button type="button" onClick={cancelGroupEdit}>
              Cancel
            </button>
          </form>
        )}
      </div>
      {/* <Footer /> */}
    </>
  );
}

export default Session;
