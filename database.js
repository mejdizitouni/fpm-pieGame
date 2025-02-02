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
      green_questions_label TEXT,
      red_questions_label TEXT,
      status TEXT DEFAULT 'Draft'
    )
  `);

  // Questions table
  db.run(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      response_type TEXT,
      title TEXT,
      expected_answer TEXT,
      allocated_time INTEGER,
      question_icon TEXT
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
    avatar_name TEXT,
    avatar_url TEXT,
      join_url TEXT,
      FOREIGN KEY (session_id) REFERENCES game_sessions(id)
    )
  `);

  // Many-to-many relationship table for sessions and questions, including question_order
  db.run(`
    CREATE TABLE IF NOT EXISTS session_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      question_id INTEGER,
      question_order INTEGER,
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
      `INSERT INTO game_sessions (title, date, green_questions_label, red_questions_label, status) VALUES ('Test Session', '2024-01-01', 'Hulk Color', 'Fire Color', 'Draft')`
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
            title: "What is the capital of Germany?\n(Hint: It's known for its Brandenburg Gate)",
            expected_answer: "Berlin",
            allocated_time: 100000,
            options: ["Berlin", "Munich", "Hamburg", "Frankfurt"],
            question_order: 1,
            response_type: "Question à choix unique"
          },
          {
            type: "red",
            title: "What is the largest continent by area?\n(Africa or Asia?)",
            expected_answer: "Asia",
            allocated_time: 100000,
            options: ["Asia", "Africa", "Europe", "Antarctica"],
            question_order: 2,
            response_type: "Question à choix unique"
          },
          {
            type: "red",
            title: "Which country has the most islands?",
            expected_answer: "Sweden",
            allocated_time: 100000,
            options: ["Sweden", "Indonesia", "Philippines", "Finland"],
            question_order: 3,
            response_type: "Question à choix unique"
          },
          {
            type: "red",
            title: "What is the capital of Canada?",
            expected_answer: "Ottawa",
            allocated_time: 100000,
            options: ["Ottawa", "Toronto", "Vancouver", "Montreal"],
            question_order: 4,
            response_type: "Question à choix unique"
          },
          {
            type: "red",
            title: "Which desert is the largest in the world?",
            expected_answer: "Sahara",
            allocated_time: 100000,
            options: ["Sahara", "Gobi", "Kalahari", "Mojave"],
            question_order: 5,
            response_type: "Question à choix unique"
          },
          {
            type: "red",
            title: "What is the longest river in the world?",
            expected_answer: "Nile",
            allocated_time: 100000,
            options: ["Nile", "Amazon", "Yangtze", "Mississippi"],
            question_order: 6,
            response_type: "Question à choix unique"
          },
          // Green Questions
          {
            type: "green",
            title: "What is the smallest country in the world?\n(Size matters!)",
            expected_answer: "Vatican City",
            allocated_time: 100000,
            question_order: 1,
            response_type: "Réponse libre"
          },
          {
            type: "green",
            title: "What is the capital of Japan?",
            expected_answer: "Tokyo",
            allocated_time: 100000,
            question_order: 2,
            response_type: "Réponse libre"
          },
          {
            type: "green",
            title: "Which country has the most population?",
            expected_answer: "China",
            allocated_time: 100000,
            question_order: 3,
            response_type: "Réponse libre"
          },
          {
            type: "green",
            title: "What is the highest mountain in the world?",
            expected_answer: "Mount Everest",
            allocated_time: 100000,
            question_order: 4,
            response_type: "Réponse libre"
          },
          {
            type: "green",
            title: "Which ocean is the largest?\n(Hint: It borders the Americas and Asia)",
            expected_answer: "Pacific Ocean",
            allocated_time: 100000,
            question_order: 5,
            response_type: "Réponse libre"
          },
          {
            type: "green",
            title: "What is the capital of Australia?",
            expected_answer: "Canberra",
            allocated_time: 100000,
            question_order: 6,
            response_type: "Réponse libre"
          },
        ];

        geographyQuestions.forEach((q) => {
          db.run(
            `INSERT INTO questions (type, title, expected_answer, allocated_time, question_icon, response_type) VALUES (?, ?, ?, ?, ?, ?)`,
            [q.type, q.title, q.expected_answer, q.allocated_time, "/avatars/"+q.type+".svg", q.response_type],
            function (err) {
              if (!err) {
                db.run(
                  `INSERT INTO session_questions (session_id, question_id, question_order) VALUES (?, ?, ?)`,
                  [sessionId, this.lastID, q.question_order]
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
          { name: "Group Alpha", description: "First group in Test Session", avatar_name: "Afroboy", avatar_url: "/avatars/Afroboy.svg" },
          { name: "Group Beta", description: "Second group in Test Session", avatar_name: "Chaplin", avatar_url: "/avatars/Chaplin.svg" },
          { name: "Group Gamma", description: "Third group in Test Session", avatar_name: "Cloud", avatar_url: "/avatars/Cloud.svg" },
          { name: "Group Delta", description: "Fourth group in Test Session", avatar_name: "Helmet", avatar_url: "/avatars/Helmet.svg" },
        ];

        groups.forEach((g) => {
          db.run(
            `INSERT INTO groups (session_id, name, description, avatar_name, avatar_url) VALUES (?, ?, ?, ?, ?)`,
            [sessionId, g.name, g.description, g.avatar_name, g.avatar_url],
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