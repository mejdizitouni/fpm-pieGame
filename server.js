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
      io.to(sessionId).emit("gameOver");
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
      ORDER BY sq.id ASC
      LIMIT 1
    `;
  
    db.get(sql, [sessionId, questionType], (err, question) => {
      if (err || !question) {
        io.to(sessionId).emit("gameOver");
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
              io.to(sessionId).emit("gameOver");
              return;
            }
  
            io.to(sessionId).emit("newQuestion", {
              question: { ...question, options },
              timer: question.allocated_time || 30,
              questionIndex: state.currentIndex,
              totalQuestions: state.totalQuestions,
            });
          }
        );
      } else {
        io.to(sessionId).emit("newQuestion", {
          question,
          timer: question.allocated_time || 30,
          questionIndex: state.currentIndex,
          totalQuestions: state.totalQuestions,
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
        `SELECT type FROM questions WHERE id = ?`,
        [questionId],
        (err, question) => {
          if (err || !question) {
            console.error("Error fetching question type:", err);
            return;
          }

          const triangleType =
            question.type === "red" ? "red_triangles" : "green_triangles";

          // Prepare an array of database operations
          const updates = [];

          if (isCorrect) {
            const points = stoppedTimer ? 3 : 1;

            // Push the correct answer update operation to the array
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
            // Fetch all groups for the incorrect answer logic
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

                    // For each group, update the camembert score (except the submitting group)
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
                      return Promise.resolve(); // Skip the submitting group
                    });

                    Promise.all(groupUpdates).then(resolve).catch(reject);
                  }
                );
              })
            );
          }

          // Wait for all updates to complete
          Promise.all(updates)
            .then(() => {
              // Fetch updated camembert progress from the database
              db.all(
                `SELECT g.id AS group_id, g.name, cp.red_triangles, cp.green_triangles
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
                  console.log("Emitted updated camemberts:", updatedCamemberts);
                }
              );
            })
            .catch((err) => {
              console.error("Error during camembert updates:", err);
            });

          // Notify clients about the validation result
          io.to(sessionId).emit("answerValidated", { groupId, isCorrect });
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

    const { title, date } = req.body;
    db.run(
      `INSERT INTO game_sessions (title, date) VALUES (?, ?)`,
      [title, date],
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
    db.get(`SELECT * FROM questions WHERE id = ?`, [questionId], (err, row) => {
      if (err) {
        console.error("Database Error:", err);
        return res.status(500).json({ message: "Database error" });
      }
      if (!row) {
        return res.status(404).json({ message: "Question not found" });
      }
      res.json(row);
    });
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

    const { type, title, expected_answer, allocated_time } = req.body;

    db.run(
      `INSERT INTO questions (type, title, expected_answer, allocated_time)
       VALUES (?, ?, ?, ?)`,
      [type, title, expected_answer, allocated_time],
      function (err) {
        if (err) {
          console.error("Insert Error:", err);
          return res.status(500).json({ message: "Database error" });
        }
        res.json({
          id: this.lastID,
          type,
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
    const { type, title, expected_answer, allocated_time } = req.body;

    // Check if required fields are provided
    if (!title || !expected_answer || !allocated_time) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Update the question in the database
    db.run(
      `UPDATE questions SET type = ?, title = ?, expected_answer = ?, allocated_time = ? WHERE id = ?`,
      [type, title, expected_answer, allocated_time, questionId],
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
      `SELECT * FROM groups WHERE session_id = ?`,
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
    `SELECT * FROM groups WHERE session_id = ? AND id = ?`,
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
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const sessionId = req.params.id;
    const { name, description } = req.body;
    db.run(
      `INSERT INTO groups (session_id, name, description)
       VALUES (?, ?, ?)`,
      [sessionId, name, description],
      function (err) {
        if (err) {
          console.error("Insert Error:", err);
          return res.status(500).json({ message: "Database error" });
        }
        res.json({ id: this.lastID, session_id: sessionId, name, description });
      }
    );
  });
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
    const { name, description } = req.body;

    if (!name || !description) {
      return res
        .status(400)
        .json({ message: "Both name and description are required" });
    }

    db.run(
      `UPDATE groups SET name = ?, description = ? WHERE id = ? AND session_id = ?`,
      [name, description, groupId, sessionId],
      function (err) {
        if (err) {
          console.error("Database Error:", err);
          return res.status(500).json({ message: "Failed to update group" });
        }

        if (this.changes === 0) {
          return res.status(404).json({ message: "Group not found" });
        }

        res.json({ id: groupId, name, description });
      }
    );
  });
});

// Fetch session details by ID
app.get("/sessions/:id", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

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
    const { title, date } = req.body;

    // Check if title and date are provided
    if (!title || !date) {
      return res.status(400).json({ message: "Title and Date are required" });
    }

    // Update the session in the database
    db.run(
      `UPDATE game_sessions SET title = ?, date = ? WHERE id = ?`,
      [title, date, sessionId],
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
      SELECT q.* FROM questions q
      JOIN session_questions sq ON q.id = sq.question_id
      WHERE sq.session_id = ?
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
    const { question_id } = req.body; // Existing question ID
    db.run(
      `
      INSERT INTO session_questions (session_id, question_id)
      VALUES (?, ?)
      `,
      [sessionId, question_id],
      function (err) {
        if (err) {
          console.error("Insert Error:", err);
          return res.status(500).json({ message: "Database error" });
        }
        res.json({ id: this.lastID, session_id: sessionId, question_id });
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
      SELECT g.id AS group_id, g.name, cp.red_triangles, cp.green_triangles
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

        console.log("BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB");
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
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, SECRET_KEY, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

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

    const { type, title, expected_answer, allocated_time, options } = req.body;

    db.run(
      `INSERT INTO questions (type, title, expected_answer, allocated_time) VALUES (?, ?, ?, ?)`,
      [type, title, expected_answer, allocated_time],
      function (err) {
        if (err) {
          console.error("Insert Error:", err);
          return res.status(500).json({ message: "Database error" });
        }

        const questionId = this.lastID;

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
                title,
                expected_answer,
                allocated_time,
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
            title,
            expected_answer,
            allocated_time,
          });
        }
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
          res.json({ message: "No options provided, existing options cleared" });
        }
      }
    );
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


// Catch-all route to serve React app
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
