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
