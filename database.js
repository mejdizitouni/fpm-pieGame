const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Create or open the database
const dbPath = path.resolve(__dirname, "users.db");
const db = new sqlite3.Database(dbPath);

// Function to check if a table exists
const checkTableExists = (tableName) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [tableName],
      (err, row) => {
        if (err) reject(err);
        resolve(!!row); // Returns true if the table exists, otherwise false
      }
    );
  });
};

// Function to delete Test Session and related data
const deleteTestSession = () => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id FROM game_sessions WHERE title = 'Test Session'`,
      (err, session) => {
        if (err) return reject(err);
        if (!session) return resolve(); // No test session found

        const sessionId = session.id;

        db.serialize(() => {
          db.run(`DELETE FROM session_questions WHERE session_id = ?`, [sessionId]);
          db.run(`DELETE FROM answers WHERE session_id = ?`, [sessionId]);
          db.run(`DELETE FROM camembert_progress WHERE group_id IN (SELECT id FROM groups WHERE session_id = ?)`, [sessionId]);
          db.run(`DELETE FROM groups WHERE session_id = ?`, [sessionId]);
          db.run(`DELETE FROM game_sessions WHERE id = ?`, [sessionId], function (err) {
            if (err) return reject(err);
            resolve();
          });
        });
      }
    );
  });
};

// Function to create tables if they don't exist
const createTables = async () => {
  const usersTableExists = await checkTableExists("users");

  if (!usersTableExists) {
    db.serialize(() => {
      console.log("Creating tables...");

      // Users table
      db.run(`
        CREATE TABLE users (
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
        CREATE TABLE game_sessions (
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
        CREATE TABLE questions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT,
          response_type TEXT,
          title TEXT,
          expected_answer TEXT,
          allocated_time INTEGER,
          question_icon TEXT
        )
      `);

      // Question options table
      db.run(`
        CREATE TABLE question_options (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          question_id INTEGER,
          option_text TEXT,
          FOREIGN KEY (question_id) REFERENCES questions(id)
        )
      `);

      // Groups table
      db.run(`
        CREATE TABLE groups (
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

      // Session questions table
      db.run(`
        CREATE TABLE session_questions (
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
        CREATE TABLE answers (
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

      // Camembert progress table
      db.run(`
        CREATE TABLE camembert_progress (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          group_id INTEGER,
          red_triangles INTEGER DEFAULT 0,
          green_triangles INTEGER DEFAULT 0,
          FOREIGN KEY (group_id) REFERENCES groups(id)
        )
      `);
    });
  }
};

// Function to create the Test Session
const createTestSession = () => {
  db.run(
    `INSERT INTO game_sessions (title, date, green_questions_label, red_questions_label, status) 
     VALUES ('Test Session', '2024-01-01', 'Hulk Color', 'Fire Color', 'Draft')`,
    function (err) {
      if (err) return console.error("Error creating Test Session:", err);

      const sessionId = this.lastID;

      const groups = [
        { name: "Group Alpha", avatar_name: "Afroboy" },
        { name: "Group Beta", avatar_name: "Chaplin" },
        { name: "Group Gamma", avatar_name: "Cloud" },
        { name: "Group Delta", avatar_name: "Helmet" },
      ];

      groups.forEach((g) => {
        db.run(
          `INSERT INTO groups (session_id, name, avatar_name, avatar_url) VALUES (?, ?, ?, ?)`,
          [sessionId, g.name, g.avatar_name, `/avatars/${g.avatar_name}.svg`],
          function (err) {
            if (!err) {
              db.run(`INSERT INTO camembert_progress (group_id) VALUES (?)`, [
                this.lastID,
              ]);
            }
          }
        );
      });

      console.log("Test Session created successfully.");
    }
  );
};

// Run the setup
(async () => {
  try {
    console.log("Checking for existing tables...");
    await createTables(); // Create tables if they don't exist

    console.log("Deleting existing Test Session...");
    await deleteTestSession(); // Delete existing Test Session

    console.log("Creating new Test Session...");
    createTestSession(); // Insert new Test Session
  } catch (error) {
    console.error("Error in setup:", error);
  }
})();

module.exports = db;
