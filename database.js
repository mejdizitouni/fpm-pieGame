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
      status TEXT DEFAULT 'waiting'
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
    // Add a game session
    db.run(
      `INSERT INTO game_sessions (title, date, status) VALUES ('Test Session', '2024-01-01', 'waiting')`
    );

    // Get the session ID
    db.get(`SELECT id FROM game_sessions WHERE title = 'Test Session'`, (err, session) => {
      if (err || !session) {
        console.error("Failed to fetch session ID:", err);
        return;
      }
      const sessionId = session.id;

      // Add questions
      const questions = [
        { type: "red", title: "What is 2 + 2?", expected_answer: "4", allocated_time: 30 },
        { type: "green", title: "Name the capital of France.", expected_answer: "Paris", allocated_time: 20 },
        { type: "red", title: "What is 5 * 6?", expected_answer: "30", allocated_time: 40 },
        { type: "green", title: "What color is the sky?", expected_answer: "Blue", allocated_time: 15 },
      ];

      questions.forEach((q) => {
        db.run(
          `INSERT INTO questions (type, title, expected_answer, allocated_time) VALUES (?, ?, ?, ?)`,
          [q.type, q.title, q.expected_answer, q.allocated_time],
          function (err) {
            if (err) {
              console.error("Error inserting question:", err);
              return;
            }

            // After inserting question, link it to the session
            db.run(
              `INSERT INTO session_questions (session_id, question_id) VALUES (?, ?)`,
              [sessionId, this.lastID], // this.lastID gives the ID of the inserted question
              (err) => {
                if (err) {
                  console.error("Error linking question to session:", err);
                }
              }
            );
          }
        );
      });

      // Add groups
      const groups = [
        { name: "Team Alpha", description: "First test group" },
        { name: "Team Beta", description: "Second test group" },
        { name: "Team Gamma", description: "Third test group" },
        { name: "Team Delta", description: "Fourth test group" },
      ];

      groups.forEach((g) => {
        db.run(
          `INSERT INTO groups (session_id, name, description) VALUES (?, ?, ?)`,
          [sessionId, g.name, g.description],
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

module.exports = db;
