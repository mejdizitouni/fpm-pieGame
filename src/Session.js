import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import Header from "./Header";
import Footer from "./Footer";

function Session() {
  const API_URL = process.env.REACT_APP_API_URL;
  const { id } = useParams(); // Get the session ID from the URL
  const [questions, setQuestions] = useState([]);
  const [newQuestion, setNewQuestion] = useState({
    type: "",
    title: "",
    expected_answer: "",
    allocated_time: "",
  });
  const [allQuestions, setAllQuestions] = useState([]); // To store available questions
  const [selectedQuestionId, setSelectedQuestionId] = useState(""); // To store selected question ID
  const [groups, setGroups] = useState([]);
  const [newGroup, setNewGroup] = useState({
    name: "",
    description: "",
  });
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/");
        return;
      }

      try {
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

    fetchData();
  }, [id]);

  const createQuestion = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    try {
      const response = await axios.post(
        `${API_URL}/questions`,
        newQuestion,
        {
          headers: { Authorization: token },
        }
      );
      // Link the newly created question to the session
      await axios.post(
        `${API_URL}/sessions/${id}/questions`,
        { question_id: response.data.id },
        {
          headers: { Authorization: token },
        }
      );
      setQuestions((prev) => [...prev, response.data]); // Update session-specific questions
      setNewQuestion({
        type: "",
        title: "",
        expected_answer: "",
        allocated_time: "",
      });
    } catch (err) {
      console.error("Failed to create and link question:", err);
    }
  };

  const linkExistingQuestion = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    try {
      // Link the existing question to the session
      await axios.post(
        `${API_URL}/sessions/${id}/questions`,
        { question_id: selectedQuestionId },
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

      // Append the full question details to the session's questions
      setQuestions((prev) => [...prev, response.data]);

      setSelectedQuestionId(""); // Reset the dropdown
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
    } catch (err) {
      console.error("Failed to create group:", err);
    }
  };

  return (
    <>
      <Header />
      <div className="container">
        <h1>Session {id} Details</h1>

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
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2>Create New Question</h2>
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
          <button type="submit">Create</button>
        </form>

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
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.id}>
                  <td>{group.id}</td>
                  <td>{group.name}</td>
                  <td>{group.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2>Create New Group</h2>
        <form onSubmit={createGroup}>
          <input
            type="text"
            placeholder="Group Name"
            value={newGroup.name}
            onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
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
      </div>
      <Footer />
    </>
  );
}

export default Session;
