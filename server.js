const express = require("express");
const path = require("path");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("./database");

const app = express();
const port = process.env.PORT || 3001;
const SECRET_KEY = "your-secret-key";

const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app); // Create an HTTP server
const io = new Server(server); // Attach Socket.IO to the server

// State tracking for sessions
const sessionState = {}; // { sessionId: { currentIndex, totalQuestions, askedQuestions: Set }}

io.on("connection", (socket) => {
  socket.on("startGame", (sessionId) => {
    if (!sessionState[sessionId]) {
      sessionState[sessionId] = {
        currentIndex: 0,
        askedQuestions: new Set(),
        totalQuestions: 0,
      };

      // Fetch total number of questions for the session and initialize game state
      db.get(
        `SELECT COUNT(*) as total FROM session_questions WHERE session_id = ?`,
        [sessionId],
        (err, result) => {
          if (err || !result) {
            console.error("Error fetching total questions:", err);
            return;
          }

          sessionState[sessionId].totalQuestions = result.total;
          fetchNextQuestion(sessionId); // Start the game after initialization
        }
      );
    } else {
      fetchNextQuestion(sessionId); // Resume game if already initialized
    }
  });

  const fetchNextQuestion = (sessionId) => {
    const state = sessionState[sessionId];

    if (state.currentIndex >= state.totalQuestions) {
      handleGameOver(sessionId);
      return;
    }

    const questionType = state.currentIndex % 2 === 0 ? "green" : "red";
    const notInClause = state.askedQuestions.size
      ? `AND q.id NOT IN (${[...state.askedQuestions].join(",")})`
      : "";

    const sql = `
      SELECT q.*
      FROM questions q
      JOIN session_questions sq ON q.id = sq.question_id
      WHERE sq.session_id = ? AND q.type = ? ${notInClause}
      ORDER BY sq.question_order ASC
      LIMIT 1
    `;

    db.get(sql, [sessionId, questionType], (err, question) => {
      if (err || !question) {
        handleGameOver(sessionId);
        return;
      }

      state.askedQuestions.add(question.id);
      state.currentIndex += 1;

      if (questionType === "red") {
        db.all(
          `SELECT id, option_text FROM question_options WHERE question_id = ?`,
          [question.id],
          (err, options) => {
            if (err) {
              console.error("Error fetching options:", err);
              handleGameOver(sessionId);
    return;
            }

            io.to(sessionId).emit("newQuestion", {
              question: { ...question, options },
              timer: question.allocated_time || 30,
              questionIndex: state.currentIndex,
              totalQuestions: state.totalQuestions,
              response_type: question.response_type,
            });
          }
        );
      } else {
        io.to(sessionId).emit("newQuestion", {
          question,
          timer: question.allocated_time || 30,
          questionIndex: state.currentIndex,
          totalQuestions: state.totalQuestions,
          response_type: state.response_type,
        });
      }
    });
  };

  socket.on(
    "submitAnswer",
    ({ sessionId, groupId, questionId, answer, stoppedTimer }) => {
      const timeSubmitted = new Date().toISOString();

      db.get(
        `SELECT name FROM groups WHERE id = ?`,
        [groupId],
        (err, group) => {
          if (err || !group) {
            console.error("Error fetching group name:", err);
            return;
          }

          const groupName = group.name;

          const submittedAnswer = {
            sessionId,
            groupId,
            questionId,
            answer,
            stoppedTimer,
            groupName,
            timeSubmitted,
          };

          // Emit to all participants in the session
          io.to(sessionId).emit("answerSubmitted", submittedAnswer);

          // If the timer is stopped, emit an event to notify everyone
          if (stoppedTimer) {
            io.to(sessionId).emit("timerStopped", { groupId, groupName });
          }
        }
      );
    }
  );

  socket.on(
    "validateAnswer",
    ({ sessionId, groupId, questionId, isCorrect, stoppedTimer }) => {
      db.get(
        `SELECT type, expected_answer FROM questions WHERE id = ?`,
        [questionId],
        (err, question) => {
          if (err || !question) {
            console.error("Error fetching question details:", err);
            return;
          }
  
          const correctAnswer = question.expected_answer;
          const triangleType =
            question.type === "red" ? "red_triangles" : "green_triangles";
  
          db.get(
            `SELECT name FROM groups WHERE id = ?`,
            [groupId],
            (err, group) => {
              if (err || !group) {
                console.error("Error fetching group name:", err);
                return;
              }
  
              const groupName = group.name;
              const updates = [];
  
              if (isCorrect) {
                const points = stoppedTimer ? 2 : 1;
                updates.push(
                  new Promise((resolve, reject) => {
                    db.run(
                      `UPDATE camembert_progress SET ${triangleType} = ${triangleType} + ? WHERE group_id = ?`,
                      [points, groupId],
                      (err) => {
                        if (err) {
                          console.error(
                            "Error updating scores for the correct answer:",
                            err
                          );
                          reject(err);
                        } else {
                          resolve();
                        }
                      }
                    );
                  })
                );
              } else {
                // Incorrect answer - award points to other groups
                updates.push(
                  new Promise((resolve, reject) => {
                    db.all(
                      `SELECT id FROM groups WHERE session_id = ?`,
                      [sessionId],
                      (err, allGroups) => {
                        if (err) {
                          console.error("Error fetching groups:", err);
                          reject(err);
                          return;
                        }
  
                        const groupUpdates = allGroups.map((group) => {
                          if (String(group.id) !== String(groupId)) {
                            return new Promise((resolve, reject) => {
                              db.run(
                                `UPDATE camembert_progress SET ${triangleType} = ${triangleType} + 1 WHERE group_id = ?`,
                                [group.id],
                                (err) => {
                                  if (err) {
                                    console.error(
                                      `Error updating scores for group ${group.id}:`,
                                      err
                                    );
                                    reject(err);
                                  } else {
                                    resolve();
                                  }
                                }
                              );
                            });
                          }
                          return Promise.resolve();
                        });
  
                        Promise.all(groupUpdates).then(resolve).catch(reject);
                      }
                    );
                  })
                );
              }
  
              // Execute all updates
              Promise.all(updates)
                .then(() => {
                  db.all(
                    `SELECT g.id AS group_id, g.avatar_url AS avatar_url, g.name, cp.red_triangles, cp.green_triangles
                     FROM groups g
                     LEFT JOIN camembert_progress cp ON g.id = cp.group_id
                     WHERE g.session_id = ?`,
                    [sessionId],
                    (err, updatedCamemberts) => {
                      if (err) {
                        console.error(
                          "Error fetching updated camembert scores:",
                          err
                        );
                        return;
                      }
  
                      io.to(sessionId).emit("camembertUpdated", {
                        updatedCamemberts,
                      });
                    }
                  );
  
                  // Send correct validation result to all players
                  io.to(sessionId).emit("answerValidated", {
                    groupId,
                    groupName,
                    isCorrect,
                    correctAnswer,
                    message: isCorrect
                      ? `Le groupe ${groupName} a répondu correctement à la question dont la réponse est "${correctAnswer}". Ils reçoivent ${
                          stoppedTimer ? 2 : 1
                        } point(s).`
                      : `Le groupe ${groupName} a répondu incorrectement. Les autres groupes gagnent 1 point.`,
                  });
                })
                .catch((err) => {
                  console.error("Error during camembert updates:", err);
                });
            }
          );
        }
      );
    }
  );
  
  socket.on(
    "validateAnswerNoPoints",
    ({ sessionId, groupId, questionId, isCorrect }) => {
      db.get(
        `SELECT expected_answer FROM questions WHERE id = ?`,
        [questionId],
        (err, question) => {
          if (err || !question) {
            console.error("Error fetching question details:", err);
            return;
          }
  
          const correctAnswer = question.expected_answer;
  
          db.get(
            `SELECT name FROM groups WHERE id = ?`,
            [groupId],
            (err, group) => {
              if (err || !group) {
                console.error("Error fetching group name:", err);
                return;
              }
  
              const groupName = group.name;
  
              io.to(sessionId).emit("answerValidatedNoPoints", {
                groupId,
                groupName,
                isCorrect,
                correctAnswer,
                message: isCorrect
                  ? `Le groupe ${groupName} a répondu correctement à la question dont la réponse est "${correctAnswer}". Ils vont choisir comment distribuer leurs points.`
                  : `Le groupe ${groupName} a répondu incorrectement à la question dont la réponse est "${correctAnswer}". Les autres groupes décideront comment répartir les points.`,
              });
            }
          );
        }
      );
    }
  );
  
  socket.on("revealAnswer", (correctAnswer) => {
    io.emit("revealAnswer", correctAnswer);
  });

  socket.on("nextQuestion", (sessionId) => {
    fetchNextQuestion(sessionId);
  });

  socket.on("joinSession", ({ sessionId, groupId, role }) => {
    const roomName = sessionId;
    socket.join(roomName);
  });

  socket.on("disconnect", () => {});
});

app.use(express.json());
app.use(cors());

// Serve the React build folder
app.use(express.static(path.join(__dirname, "build")));

// Login endpoint
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err) {
      return res.status(500).json({ message: "Database error" });
    }
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate JWT
    const token = jwt.sign({ username: user.username }, SECRET_KEY, {
      expiresIn: "1h",
    });
    res.json({ token });
  });
});

app.post("/verify-token", (req, res) => {
  const token = req.body.token;

  if (!token) {
    return res.status(400).json({ message: "Token is required" });
  }

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Token is invalid or expired" });
    }
    res.json({ valid: true });
  });
});

// Protected admin route
app.get("/admin-check", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }
    res.json({ message: `Hello, ${decoded.username}` });
  });
});

// Fetch all game sessions
app.get("/game-sessions", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    db.all(`SELECT * FROM game_sessions`, (err, rows) => {
      if (err) {
        console.error("Database Error:", err); // Log database errors
        return res.status(500).json({ message: "Database error" });
      }

      res.json(rows || []); // Ensure response is always an array
    });
  });
});

// Add a new game session
app.post("/game-sessions", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const { title, green_questions_label, red_questions_label, date } =
      req.body;
    db.run(
      `INSERT INTO game_sessions (title, green_questions_label, red_questions_label, date) VALUES (?, ?, ?, ?)`,
      [title, green_questions_label, red_questions_label, date],
      function (err) {
        if (err) {
          console.error("Insert Error:", err); // Log insert errors
          return res.status(500).json({ message: "Database error" });
        }
        res.json({ id: this.lastID, title, date });
      }
    );
  });
});

// Fetch question details by ID
app.get("/questions/:id", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const questionId = req.params.id;
    db.get(
      `
      SELECT q.*, sq.question_order
      FROM questions q
      LEFT JOIN session_questions sq ON q.id = sq.question_id
      WHERE q.id = ?
      `,
      [questionId],
      (err, row) => {
        if (err) {
          console.error("Database Error:", err);
          return res.status(500).json({ message: "Database error" });
        }
        if (!row) {
          return res.status(404).json({ message: "Question not found" });
        }
        res.json(row);
      }
    );
  });
});

// Add a new question
app.post("/questions", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const { type, title, response_type, expected_answer, allocated_time } =
      req.body;

    db.run(
      `INSERT INTO questions (type, response_type, title, expected_answer, allocated_time)
       VALUES (?, ?, ?, ?, ?)`,
      [type, response_type, title, expected_answer, allocated_time],
      function (err) {
        if (err) {
          console.error("Insert Error:", err);
          return res.status(500).json({ message: "Database error" });
        }
        res.json({
          id: this.lastID,
          type,
          response_type,
          title,
          expected_answer,
          allocated_time,
        });
      }
    );
  });
});

// Update a question
app.put("/questions/:id", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  // Verify the token
  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const questionId = req.params.id;
    const { type, response_type, title, expected_answer, allocated_time } =
      req.body;

    // Check if required fields are provided
    if (!title || !response_type || !expected_answer || !allocated_time) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Update the question in the database
    db.run(
      `UPDATE questions SET type = ?, response_type = ?, title = ?, expected_answer = ?, allocated_time = ? WHERE id = ?`,
      [type, response_type, title, expected_answer, allocated_time, questionId],
      function (err) {
        if (err) {
          console.error("Database Error:", err);
          return res.status(500).json({ message: "Failed to update question" });
        }

        if (this.changes === 0) {
          return res.status(404).json({ message: "Question not found" });
        }

        // Respond with the updated question data
        res.json({
          id: questionId,
          type,
          response_type,
          title,
          expected_answer,
          allocated_time,
        });
      }
    );
  });
});

// Fetch groups for a specific session
app.get("/sessions/:id/groups", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const sessionId = req.params.id;
    db.all(
      `SELECT id, name, description, avatar_name, avatar_url FROM groups WHERE session_id = ?`,
      [sessionId],
      (err, rows) => {
        if (err) {
          console.error("Database Error:", err);
          return res.status(500).json({ message: "Database error" });
        }
        res.json(rows || []);
      }
    );
  });
});

// Fetch group details by ID
app.get("/sessions/:id/groups/:groupId", (req, res) => {
  const sessionId = req.params.id;
  const groupId = req.params.groupId;
  db.get(
    `SELECT id, name, description, avatar_name, avatar_url FROM groups WHERE session_id = ? AND id = ?`,
    [sessionId, groupId],
    (err, row) => {
      if (err) {
        console.error("Database Error:", err);
        return res.status(500).json({ message: "Database error" });
      }
      if (!row) {
        return res.status(404).json({ message: "Group not found" });
      }
      res.json(row);
    }
  );
});

// Add a new group to a session
app.post("/sessions/:id/groups", (req, res) => {
  const sessionId = req.params.id;
  const { name, description, avatar_name } = req.body;

  if (!avatar_name) {
    return res.status(400).json({ message: "Avatar name is required" });
  }

  const avatar_url = `/avatars/${avatar_name}.svg`;

  db.run(
    `INSERT INTO groups (session_id, name, description, avatar_name, avatar_url) VALUES (?, ?, ?, ?, ?)`,
    [sessionId, name, description, avatar_name, avatar_url],
    function (err) {
      if (err) {
        console.error("Insert Error:", err);
        return res.status(500).json({ message: "Database error" });
      }

      const groupId = this.lastID; // Get the ID of the newly created group

      // Insert into camembert_progress
      db.run(
        `INSERT INTO camembert_progress (group_id) VALUES (?)`,
        [groupId],
        function (err) {
          if (err) {
            console.error("Error initializing camembert progress:", err);
            return res.status(500).json({ message: "Database error" });
          }

          res.json({
            id: groupId,
            session_id: sessionId,
            name,
            description,
            avatar_name,
            avatar_url,
          });
        }
      );
    }
  );
});

// Delete a group from the database
app.delete("/sessions/:sessionId/groups/:groupId", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const sessionId = req.params.sessionId;
    const groupId = req.params.groupId;

    // Delete related camembert_progress records (if needed)
    db.run(
      `DELETE FROM camembert_progress WHERE group_id = ?`,
      [groupId],
      (err) => {
        if (err) {
          console.error("Error deleting camembert progress:", err);
          return res.status(500).json({ message: "Database error" });
        }

        // Delete the group from the database
        db.run(
          `DELETE FROM groups WHERE id = ? AND session_id = ?`,
          [groupId, sessionId],
          function (err) {
            if (err) {
              console.error("Error deleting group:", err);
              return res
                .status(500)
                .json({ message: "Failed to delete group" });
            }

            if (this.changes === 0) {
              return res.status(404).json({ message: "Group not found" });
            }

            res.json({ message: "Group deleted successfully" });
          }
        );
      }
    );
  });
});

// Remove a question from a session (without deleting the question itself)
app.delete("/sessions/:sessionId/questions/:questionId", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const sessionId = req.params.sessionId;
    const questionId = req.params.questionId;

    // Remove the link between the session and the question
    db.run(
      `DELETE FROM session_questions WHERE session_id = ? AND question_id = ?`,
      [sessionId, questionId],
      function (err) {
        if (err) {
          console.error("Error removing question from session:", err);
          return res.status(500).json({ message: "Database error" });
        }

        if (this.changes === 0) {
          return res
            .status(404)
            .json({ message: "Question not found in session" });
        }

        res.json({ message: "Question removed from session successfully" });
      }
    );
  });
});

// Update a group
app.put("/sessions/:sessionId/groups/:groupId", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const sessionId = req.params.sessionId;
    const groupId = req.params.groupId;
    const { name, description, avatar_name } = req.body;

    if (!avatar_name) {
      return res.status(400).json({ message: "Avatar name is required" });
    }

    const avatar_url = `/assets/avatars/${avatar_name}.svg`;

    db.run(
      `UPDATE groups
       SET name = ?, description = ?, avatar_name = ?, avatar_url = ?
       WHERE id = ? AND session_id = ?`,
      [name, description, avatar_name, avatar_url, groupId, sessionId],
      function (err) {
        if (err) {
          console.error("Database Error:", err);
          return res.status(500).json({ message: "Failed to update group" });
        }

        if (this.changes === 0) {
          return res.status(404).json({ message: "Group not found" });
        }

        res.json({
          id: groupId,
          name,
          description,
          avatar_name,
          avatar_url,
        });
      }
    );
  });
});

// Fetch session details by ID
app.get("/sessions/:id", (req, res) => {
  const sessionId = req.params.id;

  db.get(
    `SELECT * FROM game_sessions WHERE id = ?`,
    [sessionId],
    (err, row) => {
      if (err) {
        console.error("Database Error:", err);
        return res.status(500).json({ message: "Database error" });
      }
      if (!row) {
        return res.status(404).json({ message: "Session not found" });
      }
      res.json(row); // Send the session details as response
    }
  );
});

// Add a new endpoint to update the session
app.put("/sessions/:id", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  // Verify the token
  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    // Extract the session ID and the new data from the request
    const sessionId = req.params.id;
    const { title, green_questions_label, red_questions_label, date } =
      req.body;

    // Check if title and date are provided
    if (!title || !date || !green_questions_label || !red_questions_label) {
      return res.status(400).json({ message: "Title and Date are required" });
    }

    // Update the session in the database
    db.run(
      `UPDATE game_sessions SET title = ?, green_questions_label = ?, red_questions_label = ?, date = ? WHERE id = ?`,
      [title, green_questions_label, red_questions_label, date, sessionId],
      function (err) {
        if (err) {
          console.error("Database Error:", err);
          return res.status(500).json({ message: "Failed to update session" });
        }

        if (this.changes === 0) {
          return res.status(404).json({ message: "Session not found" });
        }

        // Respond with the updated session data
        res.json({ id: sessionId, title, date });
      }
    );
  });
});

// Fetch all questions not linked to the current session
app.get("/sessions/:id/available-questions", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const sessionId = req.params.id;
    db.all(
      `
      SELECT * FROM questions
      WHERE id NOT IN (
        SELECT question_id FROM session_questions WHERE session_id = ?
      )
      `,
      [sessionId],
      (err, rows) => {
        if (err) {
          console.error("Database Error:", err);
          return res.status(500).json({ message: "Database error" });
        }
        res.json(rows || []);
      }
    );
  });
});

// Fetch questions for a specific session
app.get("/sessions/:id/questions", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const sessionId = req.params.id;
    db.all(
      `
      SELECT q.*, sq.question_order
      FROM questions q
      JOIN session_questions sq ON q.id = sq.question_id
      WHERE sq.session_id = ?
      ORDER BY sq.question_order ASC, Type ASC
      `,
      [sessionId],
      (err, rows) => {
        if (err) {
          console.error("Database Error:", err);
          return res.status(500).json({ message: "Database error" });
        }
        res.json(rows || []);
      }
    );
  });
});

// Add a new question to a session
app.post("/sessions/:id/questions", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const sessionId = req.params.id;
    const { question_id, question_order } = req.body; // Include question_order

    db.run(
      `
      INSERT INTO session_questions (session_id, question_id, question_order)
      VALUES (?, ?, ?)
      `,
      [sessionId, question_id, question_order],
      function (err) {
        if (err) {
          console.error("Insert Error:", err);
          return res.status(500).json({ message: "Database error" });
        }
        res.json({
          id: this.lastID,
          session_id: sessionId,
          question_id,
          question_order,
        });
      }
    );
  });
});

// Activate a session
app.post("/sessions/:id/activate", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const sessionId = req.params.id;

    // Derive frontend URL from the request's origin
    const frontendUrl = `${req.protocol}://${req.get("host")}`;

    // Update the session status to 'Activated'
    db.run(
      `UPDATE game_sessions SET status = 'Activated' WHERE id = ?`,
      [sessionId],
      function (err) {
        if (err) {
          return res.status(500).json({ message: "Database error" });
        }

        // Generate join URLs for groups
        db.all(
          `SELECT * FROM groups WHERE session_id = ?`,
          [sessionId],
          (err, groups) => {
            if (err) {
              return res.status(500).json({ message: "Database error" });
            }

            const updatedGroups = groups.map((group) => {
              const joinUrl = `${frontendUrl}/game/${sessionId}/${group.id}`;
              db.run(`UPDATE groups SET join_url = ? WHERE id = ?`, [
                joinUrl,
                group.id,
              ]);
              return { ...group, join_url: joinUrl };
            });

            res.json({ message: "Session activated", updatedGroups });
          }
        );
      }
    );
  });
});

// Fetch group camembert progress
app.get("/sessions/:id/camemberts", (req, res) => {
  const sessionId = req.params.id;

  db.all(
    `
      SELECT g.id AS group_id, g.name, g.avatar_name, avatar_url, cp.red_triangles, cp.green_triangles
      FROM groups g
      LEFT JOIN camembert_progress cp ON g.id = cp.group_id
      WHERE g.session_id = ?
      `,
    [sessionId],
    (err, rows) => {
      if (err) {
        console.error("Database Error:", err);
        return res.status(500).json({ message: "Database error" });
      }

      res.json(rows || []);
    }
  );
});

// Validate group answers and update scores
app.post("/sessions/:id/validate", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const { groupId, questionId, isCorrect, multiplier } = req.body; // multiplier = 1 or 2 for scoring

    db.get(
      `SELECT type FROM questions WHERE id = ?`,
      [questionId],
      (err, question) => {
        if (err || !question) {
          return res.status(500).json({ message: "Question not found" });
        }

        const triangleType =
          question.type === "red" ? "red_triangles" : "green_triangles";

        // Update camembert progress
        const scoreChange = isCorrect ? multiplier : -1;

        db.run(
          `
          UPDATE camembert_progress
          SET ${triangleType} = MAX(0, ${triangleType} + ?)
          WHERE group_id = ?
          `,
          [scoreChange, groupId],
          function (err) {
            if (err) {
              console.error("Database Error:", err);
              return res
                .status(500)
                .json({ message: "Failed to update scores" });
            }

            res.json({
              message: "Score updated",
              groupId,
              questionId,
              triangleType,
              scoreChange,
            });
          }
        );
      }
    );
  });
});

// Fetch all answers for a session
app.get("/sessions/:id/answers", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const sessionId = req.params.id;

    db.all(
      `
      SELECT a.group_id, g.name AS group_name, a.question_id, q.title AS question_title, 
             a.answer, a.is_correct, a.time_submitted
      FROM answers a
      JOIN groups g ON a.group_id = g.id
      JOIN questions q ON a.question_id = q.id
      WHERE a.session_id = ?
      ORDER BY a.time_submitted ASC
      `,
      [sessionId],
      (err, rows) => {
        if (err) {
          console.error("Database Error:", err);
          return res.status(500).json({ message: "Database error" });
        }

        res.json(rows || []);
      }
    );
  });
});

// Fetch options for a specific question
app.get("/questions/:id/options", (req, res) => {
  const questionId = req.params.id;

  db.all(
    `SELECT id, option_text FROM question_options WHERE question_id = ?`,
    [questionId],
    (err, rows) => {
      if (err) {
        console.error("Database Error:", err);
        return res.status(500).json({ message: "Database error" });
      }

      res.json(rows || []);
    }
  );
});

// Add a new question with options for red questions
app.post("/questions", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const {
      type,
      response_type,
      title,
      expected_answer,
      allocated_time,
      options,
      session_id,
      question_order,
    } = req.body;

    db.run(
      `INSERT INTO questions (type, response_type, title, expected_answer, allocated_time) VALUES (?, ?, ?, ?, ?)`,
      [type, response_type, title, expected_answer, allocated_time],
      function (err) {
        if (err) {
          console.error("Insert Error:", err);
          return res.status(500).json({ message: "Database error" });
        }

        const questionId = this.lastID;

        // Link the question to the session with question_order
        db.run(
          `
          INSERT INTO session_questions (session_id, question_id, question_order)
          VALUES (?, ?, ?)
          `,
          [session_id, questionId, question_order],
          (err) => {
            if (err) {
              console.error("Error linking question:", err);
              return res.status(500).json({ message: "Database error" });
            }
          }
        );

        // Insert options for red questions
        if (type === "red" && Array.isArray(options)) {
          const optionPromises = options.map((optionText) => {
            return new Promise((resolve, reject) => {
              db.run(
                `INSERT INTO question_options (question_id, option_text) VALUES (?, ?)`,
                [questionId, optionText],
                (err) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve();
                  }
                }
              );
            });
          });

          Promise.all(optionPromises)
            .then(() => {
              res.json({
                id: questionId,
                type,
                response_type,
                title,
                expected_answer,
                allocated_time,
                session_id,
                question_order,
                options,
              });
            })
            .catch((err) => {
              console.error("Option Insert Error:", err);
              res.status(500).json({ message: "Failed to insert options" });
            });
        } else {
          res.json({
            id: questionId,
            type,
            response_type,
            title,
            expected_answer,
            allocated_time,
            session_id,
            question_order,
          });
        }
      }
    );
  });
});

app.put("/sessions/:sessionId/questions/:questionId", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const { sessionId, questionId } = req.params;
    const {
      question_order,
      type,
      title,
      expected_answer,
      allocated_time,
      question_icon,
      options,
      response_type,
    } = req.body;

    db.run(
      `UPDATE questions SET type = ?, response_type = ?,  title = ?, expected_answer = ?, allocated_time = ?, question_icon = ? WHERE id = ?`,
      [
        type,
        response_type,
        title,
        expected_answer,
        allocated_time,
        question_icon,
        questionId,
      ],
      function (err) {
        if (err) {
          console.error("Database Error:", err);
          return res
            .status(500)
            .json({ message: "Failed to update question details" });
        }

        db.run(
          `UPDATE session_questions SET question_order = ? WHERE session_id = ? AND question_id = ?`,
          [question_order, sessionId, questionId],
          function (err) {
            if (err) {
              console.error("Database Error:", err);
              return res
                .status(500)
                .json({ message: "Failed to update question order" });
            }

            if (this.changes === 0) {
              return res
                .status(404)
                .json({ message: "Question not found in session" });
            }

            if (options && Array.isArray(options)) {
              db.run(
                `DELETE FROM question_options WHERE question_id = ?`,
                [questionId],
                (err) => {
                  if (err) {
                    console.error("Database Error:", err);
                    return res
                      .status(500)
                      .json({ message: "Failed to update question options" });
                  }

                  const stmt = db.prepare(
                    `INSERT INTO question_options (question_id, option_text) VALUES (?, ?)`
                  );
                  options.forEach((option) => {
                    stmt.run([questionId, option]);
                  });
                  stmt.finalize();
                }
              );
            }

            res.json({ message: "Question updated successfully" });
          }
        );
      }
    );
  });
});

app.post("/questions/:id/options", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const questionId = req.params.id;
    const { options } = req.body; // Array of options

    // Delete existing options first
    db.run(
      `DELETE FROM question_options WHERE question_id = ?`,
      [questionId],
      (err) => {
        if (err) {
          console.error("Error deleting existing options:", err);
          return res
            .status(500)
            .json({ message: "Failed to delete existing options" });
        }

        // Insert new options
        if (Array.isArray(options)) {
          const optionPromises = options.map((optionText) => {
            return new Promise((resolve, reject) => {
              db.run(
                `INSERT INTO question_options (question_id, option_text) VALUES (?, ?)`,
                [questionId, optionText],
                (err) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve();
                  }
                }
              );
            });
          });

          Promise.all(optionPromises)
            .then(() => {
              res.json({ message: "Options updated successfully" });
            })
            .catch((err) => {
              console.error("Error updating options:", err);
              res.status(500).json({ message: "Failed to update options" });
            });
        } else {
          res.json({
            message: "No options provided, existing options cleared",
          });
        }
      }
    );
  });
});

// Start the game and update session status
app.post("/sessions/:id/end", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const sessionId = req.params.id;

    handleGameOver(sessionId);
    return;
  });
});

// Start the game and update session status
app.post("/sessions/:id/start", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const sessionId = req.params.id;

    // Update session status to 'In Progress'
    db.run(
      `UPDATE game_sessions SET status = 'In Progress' WHERE id = ?`,
      [sessionId],
      function (err) {
        if (err) {
          console.error("Error updating session status:", err);
          return res.status(500).json({ message: "Database error" });
        }

        if (this.changes === 0) {
          return res.status(404).json({ message: "Session not found" });
        }

        res.json({ message: "Game started", status: "In Progress" });
      }
    );
  });
});

// Update red or green points for a group in the current session
app.post("/sessions/:id/update-points", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const sessionId = req.params.id; // Get the session ID from the URL
    const { groupId, color, change } = req.body; // Get group ID, color (red/green), and change (+1/-1)

    if (
      !groupId ||
      !color ||
      !change ||
      (color !== "red" && color !== "green")
    ) {
      return res
        .status(400)
        .json({ message: "Group ID, color, and change value are required" });
    }

    const triangleType = color === "red" ? "red_triangles" : "green_triangles";

    // Ensure the group belongs to the current session
    db.get(
      `
      SELECT cp.id
      FROM camembert_progress cp
      JOIN groups g ON cp.group_id = g.id
      WHERE g.session_id = ? AND g.id = ?
      `,
      [sessionId, groupId],
      (err, groupProgress) => {
        if (err) {
          console.error("Error validating group:", err);
          return res.status(500).json({ message: "Database error" });
        }

        if (!groupProgress) {
          return res
            .status(404)
            .json({ message: "Group not found in session" });
        }

        // Update the points for the group
        db.run(
          `
          UPDATE camembert_progress
          SET ${triangleType} = MAX(0, ${triangleType} + ?)
          WHERE id = ?
          `,
          [change, groupProgress.id],
          function (err) {
            if (err) {
              console.error("Database Error:", err);
              return res
                .status(500)
                .json({ message: "Failed to update points" });
            }

            // Fetch the updated scores
            db.get(
              `
              SELECT group_id, red_triangles, green_triangles
              FROM camembert_progress
              WHERE id = ?
              `,
              [groupProgress.id],
              (err, updatedGroup) => {
                if (err) {
                  console.error("Error fetching updated points:", err);
                  return res.status(500).json({ message: "Database error" });
                }

                // Fetch updated camembert progress from the database
                db.all(
                  `SELECT g.avatar_url AS avatar_url, g.id AS group_id, g.name, cp.red_triangles, cp.green_triangles
             FROM groups g
             LEFT JOIN camembert_progress cp ON g.id = cp.group_id
             WHERE g.session_id = ?`,
                  [sessionId],
                  (err, updatedCamemberts) => {
                    if (err) {
                      console.error(
                        "Error fetching updated camembert scores:",
                        err
                      );
                      return;
                    }

                    // Emit the updated camemberts to all clients
                    io.to(sessionId).emit("camembertUpdated", {
                      updatedCamemberts,
                    });
                  }
                );

                res.json({
                  message: `${triangleType} updated successfully`,
                  updatedGroup,
                });
              }
            );
          }
        );
      }
    );
  });
});

app.delete("/sessions/:id", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const sessionId = req.params.id;

    // Delete session-related data
    db.serialize(() => {
      db.run(`DELETE FROM session_questions WHERE session_id = ?`, [sessionId]);
      db.run(
        `DELETE FROM camembert_progress WHERE group_id IN (SELECT id FROM groups WHERE session_id = ?)`,
        [sessionId]
      );
      db.run(`DELETE FROM groups WHERE session_id = ?`, [sessionId]);
      db.run(`DELETE FROM answers WHERE session_id = ?`, [sessionId]);
      db.run(
        `DELETE FROM game_sessions WHERE id = ?`,
        [sessionId],
        function (err) {
          if (err) {
            console.error("Error deleting session:", err);
            return res.status(500).json({ message: "Database error" });
          }

          if (this.changes === 0) {
            return res.status(404).json({ message: "Session not found" });
          }

          res.json({ message: "Session deleted successfully" });
        }
      );
    });
  });
});

// Reset session status to Draft and reset camembert progress
app.post("/sessions/:id/reset", (req, res) => {
  // const token = req.headers["authorization"];
  // if (!token) {
  //   return res.status(401).json({ message: "Access denied" });
  // }

  // jwt.verify(token, SECRET_KEY, (err) => {
  //   if (err) {
  //     return res.status(403).json({ message: "Invalid token" });
  //   }

  const sessionId = req.params.id;
  if (sessionState[sessionId]) {
    delete sessionState[sessionId];
}
  // Reset session status to "Draft"
  db.run(
    `UPDATE game_sessions SET status = 'Draft' WHERE id = ?`,
    [sessionId],
    function (err) {
      if (err) {
        console.error("Error resetting session status:", err);
        return res.status(500).json({ message: "Database error" });
      }

      // Reset all camembert progress
      db.run(
        `UPDATE camembert_progress SET red_triangles = 0, green_triangles = 0 WHERE group_id IN 
        (SELECT id FROM groups WHERE session_id = ?)`,
        [sessionId],
        function (err) {
          if (err) {
            console.error("Error resetting camembert progress:", err);
            return res.status(500).json({ message: "Database error" });
          }

          // Fetch updated camembert progress
          db.all(
            `SELECT g.avatar_url AS avatar_url, g.id AS group_id, g.name, cp.red_triangles, cp.green_triangles
             FROM groups g
             LEFT JOIN camembert_progress cp ON g.id = cp.group_id
             WHERE g.session_id = ?`,
            [sessionId],
            (err, updatedCamemberts) => {
              if (err) {
                console.error("Error fetching updated camembert scores:", err);
                return res.status(500).json({ message: "Database error" });
              }

              res.json({
                message: "Session successfully reset",
                updatedCamemberts,
              });
            }
          );
        }
      );
    }
  );
  // });
});

const determineGameWinner = (sessionId, callback) => {
  db.all(
    `SELECT g.id AS group_id, g.name, g.avatar_url, cp.red_triangles, cp.green_triangles
     FROM groups g
     LEFT JOIN camembert_progress cp ON g.id = cp.group_id
     WHERE g.session_id = ?`,
    [sessionId],
    (err, groups) => {
      if (err) {
        console.error("Error fetching groups for game over:", err);
        return callback(null);
      }

      if (!groups.length) {
        return callback(null); // No groups in session
      }

      let winners = [];
      let maxCamemberts = 0;
      let maxPoints = 0;

      groups.forEach((group) => {
        // Calculate the number of complete camemberts (4 red + 4 green each)
        const completeCamemberts = Math.min(
          Math.floor(group.green_triangles / 4),
          Math.floor(group.red_triangles / 4)
        );

        const totalPoints = group.green_triangles + group.red_triangles;

        if (completeCamemberts > maxCamemberts) {
          maxCamemberts = completeCamemberts;
          maxPoints = totalPoints;
          winners = [group]; // Reset winners list
        } else if (completeCamemberts === maxCamemberts) {
          if (totalPoints > maxPoints) {
            maxPoints = totalPoints;
            winners = [group]; // Reset winners list
          } else if (totalPoints === maxPoints) {
            winners.push(group); // Add to the tie list
          }
        }
      });

      callback(winners);
    }
  );
};


const handleGameOver = (sessionId) => {
  determineGameWinner(sessionId, (winners) => {
    io.to(sessionId).emit("gameOver", {
      winners: winners.length > 1 ? winners : winners[0] || null,
      isTie: winners.length > 1,
    });

    db.run(
      `UPDATE game_sessions SET status = 'Game Over' WHERE id = ?`,
      [sessionId],
      function (err) {
        if (err) {
          console.error("Error updating session status:", err);
        }
      }
    );
  });
};

// Catch-all route to serve React app
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
