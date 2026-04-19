const path = require("path");
const jwt = require("jsonwebtoken");
const db = require("./server/db");
const { createApp } = require("./server/app");
const { createHttpServer } = require("./server/httpServer");
const { AVATAR_OPTIONS } = require("./server/constants");
const {
  hasJsonBody,
  requireFields,
  validateNonEmptyString,
  validatePositiveInteger,
} = require("./server/middleware/validation.middleware");
const { getEnv } = require("./server/config/env");
const { buildCorsOptions, createLimiters } = require("./server/config/security");
const {
  sessionState,
  createSessionRuntimeState,
  markSessionTouched,
  startSessionCleanup,
  isValidPositiveInt,
  buildRuntimeStateResponse,
  buildPlayerRuntimeStateResponse,
} = require("./server/services/sessionRuntime.service");
const { createScoringService } = require("./server/services/scoring.service");
const { registerSockets } = require("./server/sockets");
const { registerAuthRoutes } = require("./server/routes/auth.routes");

const { port, jwtSecret, allowedOrigins } = getEnv();

const normalizeAuthHeader = (headerValue = "") =>
  headerValue.startsWith("Bearer ") ? headerValue.slice(7) : headerValue;

const corsOptions = buildCorsOptions(allowedOrigins);
const { authLimiter, loginLimiter, passwordResetLimiter, mutationLimiter } = createLimiters();
const app = createApp({
  corsOptions,
  mutationLimiter,
  rootDir: __dirname,
});

const { server, io } = createHttpServer({ app, corsOptions });

startSessionCleanup();

const { handleGameOver } = createScoringService({
  db,
  io,
  sessionState,
  markSessionTouched,
});

registerSockets({
  io,
  db,
  sessionState,
  createSessionRuntimeState,
  markSessionTouched,
  isValidPositiveInt,
  handleGameOver,
});

registerAuthRoutes({
  app,
  db,
  authLimiter,
  loginLimiter,
  passwordResetLimiter,
  jwtSecret,
});

// Fetch all game sessions
app.get("/game-sessions", (req, res) => {
  const token = normalizeAuthHeader(req.headers["authorization"]);
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const isAdmin = decoded.role === "Admin";
    const query = isAdmin
      ? `SELECT gs.*, 
           cu.username AS created_by_username,
           (COALESCE(cu.first_name, '') || CASE WHEN cu.last_name IS NOT NULL AND TRIM(cu.last_name) != '' THEN ' ' || cu.last_name ELSE '' END) AS created_by_full_name,
           mu.username AS last_modified_by_username,
           (COALESCE(mu.first_name, '') || CASE WHEN mu.last_name IS NOT NULL AND TRIM(mu.last_name) != '' THEN ' ' || mu.last_name ELSE '' END) AS last_modified_by_full_name
         FROM game_sessions gs
         LEFT JOIN users cu ON cu.id = gs.created_by
         LEFT JOIN users mu ON mu.id = gs.last_modified_by
         ORDER BY gs.id DESC`
      : `SELECT gs.*, 
           cu.username AS created_by_username,
           (COALESCE(cu.first_name, '') || CASE WHEN cu.last_name IS NOT NULL AND TRIM(cu.last_name) != '' THEN ' ' || cu.last_name ELSE '' END) AS created_by_full_name,
           mu.username AS last_modified_by_username,
           (COALESCE(mu.first_name, '') || CASE WHEN mu.last_name IS NOT NULL AND TRIM(mu.last_name) != '' THEN ' ' || mu.last_name ELSE '' END) AS last_modified_by_full_name
         FROM game_sessions gs
         LEFT JOIN users cu ON cu.id = gs.created_by
         LEFT JOIN users mu ON mu.id = gs.last_modified_by
         WHERE gs.created_by = ?
         ORDER BY gs.id DESC`;
    const params = isAdmin ? [] : [decoded.userId];

    db.all(query, params, (err, rows) => {
      if (err) {
        console.error("Database Error:", err); // Log database errors
        return res.status(500).json({ message: "Database error" });
      }

      res.json(rows || []); // Ensure response is always an array
    });
  });
});

// Add a new game session
app.post(
  "/game-sessions",
  hasJsonBody,
  requireFields(["title", "green_questions_label", "red_questions_label", "date"]),
  validateNonEmptyString("title", "title"),
  (req, res) => {
  const token = normalizeAuthHeader(req.headers["authorization"]);
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const { title, green_questions_label, red_questions_label, date, session_rules } =
      req.body;
    db.run(
      `INSERT INTO game_sessions (title, green_questions_label, red_questions_label, date, session_rules, created_by, last_modified_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        green_questions_label,
        red_questions_label,
        date,
        session_rules,
        decoded.userId || null,
        decoded.userId || null,
      ],
      function (err) {
        if (err) {
          console.error("Insert Error:", err); // Log insert errors
          return res.status(500).json({ message: "Database error" });
        }
        res.json({ id: this.lastID, title, date, created_by: decoded.userId || null, last_modified_by: decoded.userId || null });
      }
    );
  });
}
);

// Fetch question details by ID
app.get("/questions/:id", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, jwtSecret, (err) => {
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
app.post(
  "/questions",
  hasJsonBody,
  requireFields(["type", "response_type", "title", "expected_answer", "allocated_time"]),
  validateNonEmptyString("title", "title"),
  validatePositiveInteger("allocated_time", "allocated_time"),
  (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, jwtSecret, (err) => {
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
}
);

// Update a question
app.put("/questions/:id", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  // Verify the token
  jwt.verify(token, jwtSecret, (err) => {
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

  jwt.verify(token, jwtSecret, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const sessionId = req.params.id;
    db.all(
      `SELECT id, session_id, name, description, avatar_name, avatar_url, join_url FROM groups WHERE session_id = ?`,
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
    `SELECT id, session_id, name, description, avatar_name, avatar_url, join_url FROM groups WHERE session_id = ? AND id = ?`,
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
app.post(
  "/sessions/:id/groups",
  hasJsonBody,
  requireFields(["name", "avatar_name"]),
  validateNonEmptyString("name", "name"),
  (req, res) => {
  const sessionId = req.params.id;
  const { name, description, avatar_name } = req.body;

  if (!Number.isInteger(Number(sessionId)) || Number(sessionId) <= 0) {
    return res.status(400).json({ message: "Invalid session id" });
  }

  if (!avatar_name) {
    return res.status(400).json({ message: "Avatar name is required" });
  }

  if (!AVATAR_OPTIONS.has(avatar_name)) {
    return res.status(400).json({ message: "Invalid avatar name" });
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
}
);

// Delete a group from the database
app.delete("/sessions/:sessionId/groups/:groupId", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, jwtSecret, (err) => {
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

  jwt.verify(token, jwtSecret, (err) => {
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

  jwt.verify(token, jwtSecret, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const sessionId = req.params.sessionId;
    const groupId = req.params.groupId;
    const { name, description, avatar_name } = req.body;

    if (!avatar_name) {
      return res.status(400).json({ message: "Avatar name is required" });
    }

    if (!AVATAR_OPTIONS.has(avatar_name)) {
      return res.status(400).json({ message: "Invalid avatar name" });
    }

    const avatar_url = `/avatars/${avatar_name}.svg`;

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
    `SELECT gs.*, 
       cu.username AS created_by_username,
       (COALESCE(cu.first_name, '') || CASE WHEN cu.last_name IS NOT NULL AND TRIM(cu.last_name) != '' THEN ' ' || cu.last_name ELSE '' END) AS created_by_full_name,
       mu.username AS last_modified_by_username,
       (COALESCE(mu.first_name, '') || CASE WHEN mu.last_name IS NOT NULL AND TRIM(mu.last_name) != '' THEN ' ' || mu.last_name ELSE '' END) AS last_modified_by_full_name
     FROM game_sessions gs
     LEFT JOIN users cu ON cu.id = gs.created_by
     LEFT JOIN users mu ON mu.id = gs.last_modified_by
     WHERE gs.id = ?`,
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

app.get("/sessions/:id/runtime-state", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const sessionId = req.params.id;
    db.get(
      `SELECT status FROM game_sessions WHERE id = ?`,
      [sessionId],
      (dbErr, row) => {
        if (dbErr) {
          console.error("Database Error:", dbErr);
          return res.status(500).json({ message: "Database error" });
        }

        if (!row) {
          return res.status(404).json({ message: "Session not found" });
        }

        res.json(buildRuntimeStateResponse(row.status, sessionState[sessionId]));
      }
    );
  });
});

app.get("/sessions/:id/player-runtime-state/:groupId", (req, res) => {
  const sessionId = req.params.id;
  const groupId = req.params.groupId;

  db.get(
    `SELECT gs.status
     FROM game_sessions gs
     JOIN groups g ON g.session_id = gs.id
     WHERE gs.id = ? AND g.id = ?`,
    [sessionId, groupId],
    (dbErr, row) => {
      if (dbErr) {
        console.error("Database Error:", dbErr);
        return res.status(500).json({ message: "Database error" });
      }

      if (!row) {
        return res.status(404).json({ message: "Session or group not found" });
      }

      res.json(
        buildPlayerRuntimeStateResponse(row.status, sessionState[sessionId], groupId)
      );
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
  jwt.verify(token, jwtSecret, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    // Extract the session ID and the new data from the request
    const sessionId = req.params.id;
    const { title, green_questions_label, red_questions_label, date, session_rules } =
      req.body;

    // Check if title and date are provided
    if (!title || !date || !green_questions_label || !red_questions_label) {
      return res.status(400).json({ message: "Title and Date are required" });
    }

    // Update the session in the database
    db.run(
      `UPDATE game_sessions SET title = ?, green_questions_label = ?, red_questions_label = ?, date = ?, session_rules = ?, last_modified_by = ? WHERE id = ?`,
      [title, green_questions_label, red_questions_label, date, session_rules, decoded.userId || null, sessionId],
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

// Fetch questions from other sessions that are not linked to the current session
app.get("/sessions/:id/available-questions", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, jwtSecret, (err) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    const sessionId = req.params.id;
    db.all(
      `
      SELECT DISTINCT q.*
      FROM questions q
      JOIN session_questions sq_other ON q.id = sq_other.question_id
      WHERE sq_other.session_id != ?
        AND q.id NOT IN (
          SELECT question_id FROM session_questions WHERE session_id = ?
        )
      `,
      [sessionId, sessionId],
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

  jwt.verify(token, jwtSecret, (err) => {
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
app.post(
  "/sessions/:id/questions",
  hasJsonBody,
  requireFields(["question_id", "question_order"]),
  validatePositiveInteger("question_id", "question_id"),
  validatePositiveInteger("question_order", "question_order"),
  (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, jwtSecret, (err) => {
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
}
);

// Activate a session
app.post("/sessions/:id/activate", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  jwt.verify(token, jwtSecret, (err) => {
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

  jwt.verify(token, jwtSecret, (err) => {
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

  jwt.verify(token, jwtSecret, (err) => {
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

  jwt.verify(token, jwtSecret, (err) => {
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

  jwt.verify(token, jwtSecret, (err) => {
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

  jwt.verify(token, jwtSecret, (err) => {
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

  jwt.verify(token, jwtSecret, (err) => {
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

  jwt.verify(token, jwtSecret, (err) => {
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

  jwt.verify(token, jwtSecret, (err) => {
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

  jwt.verify(token, jwtSecret, (err) => {
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

// Catch-all route to serve React app
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

if (require.main === module) {
  server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

module.exports = { app, server };
