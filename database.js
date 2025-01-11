const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Create or open the database
const dbPath = path.resolve(__dirname, "users.db");
const db = new sqlite3.Database(dbPath);

// Initialize tables
db.serialize(() => {
  // Drop existing tables
  db.run(`DROP TABLE IF EXISTS users`);
  db.run(`DROP TABLE IF EXISTS game_sessions`);
  db.run(`DROP TABLE IF EXISTS questions`);
  db.run(`DROP TABLE IF EXISTS groups`);
  db.run(`DROP TABLE IF EXISTS session_questions`);
  db.run(`DROP TABLE IF EXISTS answers`);
  db.run(`DROP TABLE IF EXISTS camembert_progress`);

  // Recreate tables

  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    )
  `);

  // Insert default admin user
  db.get(`SELECT username FROM users WHERE username = 'admin'`, (err, row) => {
    if (!row) {
      const bcrypt = require("bcryptjs");
      const hashedPassword = bcrypt.hashSync("WelcomeAdmin2024", 10);
      db.run(`INSERT INTO users (username, password) VALUES ('admin', ?)`, [
        hashedPassword,
      ]);
    }
  });

  // Game sessions table
  db.run(`
    CREATE TABLE IF NOT EXISTS game_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      date TEXT,
      status TEXT DEFAULT 'Draft'
    )
  `);

  // Questions table
  db.run(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      title TEXT,
      expected_answer TEXT,
      allocated_time INTEGER
    )
  `);

  // Groups table
  db.run(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      name TEXT,
      description TEXT,
      join_url TEXT,
      FOREIGN KEY (session_id) REFERENCES game_sessions(id)
    )
  `);

  // Many-to-many relationship table for sessions and questions
  db.run(`
    CREATE TABLE IF NOT EXISTS session_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      question_id INTEGER,
      FOREIGN KEY (session_id) REFERENCES game_sessions(id),
      FOREIGN KEY (question_id) REFERENCES questions(id)
    )
  `);

  // Answers table
  db.run(`
    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      group_id INTEGER,
      question_id INTEGER,
      answer TEXT,
      time_submitted TEXT,
      is_correct BOOLEAN,
      FOREIGN KEY (session_id) REFERENCES game_sessions(id),
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (question_id) REFERENCES questions(id)
    )
  `);

  // New table to track camembert progress
  db.run(`
    CREATE TABLE IF NOT EXISTS camembert_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER,
      red_triangles INTEGER DEFAULT 0,
      green_triangles INTEGER DEFAULT 0,
      FOREIGN KEY (group_id) REFERENCES groups(id)
    )
  `);

  // Insert test data
  db.serialize(() => {
    // Add a default game session
    db.run(
      `INSERT INTO game_sessions (title, date, status) VALUES ('Test Session', '2024-01-01', 'Draft')`
    );

    // Add another session with 20 questions
    db.run(
      `INSERT INTO game_sessions (title, date, status) VALUES ('20 Question Session', '2024-01-02', 'Draft')`
    );

    // Get session IDs
    db.get(`SELECT id FROM game_sessions WHERE title = 'Test Session'`, (err, defaultSession) => {
      db.get(`SELECT id FROM game_sessions WHERE title = '20 Question Session'`, (err, newSession) => {
        if (err || !defaultSession || !newSession) {
          console.error("Failed to fetch session IDs:", err);
          return;
        }

        const defaultSessionId = defaultSession.id;
        const newSessionId = newSession.id;

        // Add questions to the default session
        const defaultQuestions = [
          { type: "red", title: "What is 2 + 2?", expected_answer: "4", allocated_time: 30 },
          { type: "green", title: "Name the capital of France.", expected_answer: "Paris", allocated_time: 20 },
          { type: "red", title: "What is 5 * 6?", expected_answer: "30", allocated_time: 40 },
          { type: "green", title: "What color is the sky?", expected_answer: "Blue", allocated_time: 15 },
        ];

        defaultQuestions.forEach((q) => {
          db.run(
            `INSERT INTO questions (type, title, expected_answer, allocated_time) VALUES (?, ?, ?, ?)`,
            [q.type, q.title, q.expected_answer, q.allocated_time],
            function (err) {
              if (!err) {
                db.run(
                  `INSERT INTO session_questions (session_id, question_id) VALUES (?, ?)`,
                  [defaultSessionId, this.lastID]
                );
              }
            }
          );
        });

        // Add 20 questions to the new session (10 red, 10 green)
        const newQuestions = [];
        for (let i = 1; i <= 20; i++) {
          newQuestions.push({
            type: i % 2 === 0 ? "green" : "red",
            title: `Question ${i}`,
            expected_answer: `Answer ${i}`,
            allocated_time: 20 + (i % 2 === 0 ? 10 : 0), // Green: 30 seconds, Red: 20 seconds
          });
        }

        newQuestions.forEach((q) => {
          db.run(
            `INSERT INTO questions (type, title, expected_answer, allocated_time) VALUES (?, ?, ?, ?)`,
            [q.type, q.title, q.expected_answer, q.allocated_time],
            function (err) {
              if (!err) {
                db.run(
                  `INSERT INTO session_questions (session_id, question_id) VALUES (?, ?)`,
                  [newSessionId, this.lastID]
                );
              }
            }
          );
        });

        // Add groups for the new session
        const groups = [
          { name: "Team Red", description: "First group for 20 Question Session" },
          { name: "Team Blue", description: "Second group for 20 Question Session" },
          { name: "Team Yellow", description: "Third group for 20 Question Session" },
          { name: "Team Green", description: "Fourth group for 20 Question Session" },
        ];

        groups.forEach((g) => {
          db.run(
            `INSERT INTO groups (session_id, name, description) VALUES (?, ?, ?)`,
            [newSessionId, g.name, g.description],
            function (err) {
              if (err) {
                console.error("Failed to insert group:", err);
                return;
              }

              // Initialize camembert progress
              db.run(`INSERT INTO camembert_progress (group_id) VALUES (?)`, [this.lastID]);
            }
          );
        });
      });
    });
  });
});

module.exports = db;
