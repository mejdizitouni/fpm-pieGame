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
  db.run(`DROP TABLE IF EXISTS question_options`);
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

  // New table for question options
  db.run(`
    CREATE TABLE IF NOT EXISTS question_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER,
      option_text TEXT,
      FOREIGN KEY (question_id) REFERENCES questions(id)
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
    // Add the Test Session
    db.run(
      `INSERT INTO game_sessions (title, date, status) VALUES ('Test Session', '2024-01-01', 'Draft')`
    );

    // Get session ID
    db.get(
      `SELECT id FROM game_sessions WHERE title = 'Test Session'`,
      (err, session) => {
        if (err || !session) {
          console.error("Failed to fetch Test Session ID:", err);
          return;
        }

        const sessionId = session.id;

        // Add 12 geography questions (6 red, 6 green)
        const geographyQuestions = [
          // Red Questions
          {
            type: "red",
            title: "What is the capital of Germany?",
            expected_answer: "Berlin",
            allocated_time: 30,
            options: ["Berlin", "Munich", "Hamburg", "Frankfurt"],
          },
          {
            type: "red",
            title: "What is the largest continent by area?",
            expected_answer: "Asia",
            allocated_time: 30,
            options: ["Asia", "Africa", "Europe", "Antarctica"],
          },
          {
            type: "red",
            title: "Which country has the most islands?",
            expected_answer: "Sweden",
            allocated_time: 30,
            options: ["Sweden", "Indonesia", "Philippines", "Finland"],
          },
          {
            type: "red",
            title: "What is the capital of Canada?",
            expected_answer: "Ottawa",
            allocated_time: 30,
            options: ["Ottawa", "Toronto", "Vancouver", "Montreal"],
          },
          {
            type: "red",
            title: "Which desert is the largest in the world?",
            expected_answer: "Sahara",
            allocated_time: 30,
            options: ["Sahara", "Gobi", "Kalahari", "Mojave"],
          },
          {
            type: "red",
            title: "What is the longest river in the world?",
            expected_answer: "Nile",
            allocated_time: 30,
            options: ["Nile", "Amazon", "Yangtze", "Mississippi"],
          },
          // Green Questions
          {
            type: "green",
            title: "What is the smallest country in the world?",
            expected_answer: "Vatican City",
            allocated_time: 20,
          },
          {
            type: "green",
            title: "What is the capital of Japan?",
            expected_answer: "Tokyo",
            allocated_time: 20,
          },
          {
            type: "green",
            title: "Which country has the most population?",
            expected_answer: "China",
            allocated_time: 20,
          },
          {
            type: "green",
            title: "What is the highest mountain in the world?",
            expected_answer: "Mount Everest",
            allocated_time: 20,
          },
          {
            type: "green",
            title: "Which ocean is the largest?",
            expected_answer: "Pacific Ocean",
            allocated_time: 20,
          },
          {
            type: "green",
            title: "What is the capital of Australia?",
            expected_answer: "Canberra",
            allocated_time: 20,
          },
        ];

        geographyQuestions.forEach((q) => {
          db.run(
            `INSERT INTO questions (type, title, expected_answer, allocated_time) VALUES (?, ?, ?, ?)`,
            [q.type, q.title, q.expected_answer, q.allocated_time],
            function (err) {
              if (!err) {
                db.run(
                  `INSERT INTO session_questions (session_id, question_id) VALUES (?, ?)`,
                  [sessionId, this.lastID]
                );

                if (q.type === "red" && q.options) {
                  q.options.forEach((option) => {
                    db.run(
                      `INSERT INTO question_options (question_id, option_text) VALUES (?, ?)`,
                      [this.lastID, option]
                    );
                  });
                }
              }
            }
          );
        });

        // Add groups to the session
        const groups = [
          { name: "Group Alpha", description: "First group in Test Session" },
          { name: "Group Beta", description: "Second group in Test Session" },
          { name: "Group Gamma", description: "Third group in Test Session" },
          { name: "Group Delta", description: "Fourth group in Test Session" },
        ];

        groups.forEach((g) => {
          db.run(
            `INSERT INTO groups (session_id, name, description) VALUES (?, ?, ?)`,
            [sessionId, g.name, g.description],
            function (err) {
              if (!err) {
                db.run(`INSERT INTO camembert_progress (group_id) VALUES (?)`, [
                  this.lastID,
                ]);
              }
            }
          );
        });
      }
    );
  });
});

module.exports = db;
