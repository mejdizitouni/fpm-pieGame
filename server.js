const express = require("express");
const path = require("path");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("./database");

const app = express();
const port = process.env.PORT || 3001;
const SECRET_KEY = "your-secret-key";

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
app.get("/admin", (req, res) => {
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
      `SELECT * FROM questions WHERE session_id = ?`,
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
    const { type, title, expected_answer, allocated_time } = req.body;
    db.run(
      `INSERT INTO questions (session_id, type, title, expected_answer, allocated_time)
       VALUES (?, ?, ?, ?, ?)`,
      [sessionId, type, title, expected_answer, allocated_time],
      function (err) {
        if (err) {
          console.error("Insert Error:", err);
          return res.status(500).json({ message: "Database error" });
        }
        res.json({
          id: this.lastID,
          session_id: sessionId,
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

// Catch-all route to serve React app
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
