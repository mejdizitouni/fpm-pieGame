const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Create or open the database
const dbPath = path.resolve(__dirname, "users.db");
const db = new sqlite3.Database(dbPath);

// Delete only the "Test Session" and related data
const deleteTestSessionData = () => {
  db.get(`SELECT id FROM game_sessions WHERE title = 'Test Session'`, (err, session) => {
    if (err || !session) {
      console.error("No existing Test Session found.");
      return;
    }

    const sessionId = session.id;

    db.serialize(() => {
      db.run(`DELETE FROM session_questions WHERE session_id = ?`, [sessionId]);
      db.run(`DELETE FROM answers WHERE session_id = ?`, [sessionId]);
      db.run(`DELETE FROM groups WHERE session_id = ?`, [sessionId], function () {
        db.run(`DELETE FROM camembert_progress WHERE group_id IN (SELECT id FROM groups WHERE session_id = ?)`, [sessionId]);
      });
      db.run(`DELETE FROM game_sessions WHERE id = ?`, [sessionId], () => {
        console.log("Test Session and its related data deleted.");
        insertTestSessionData();
      });
    });
  });
};

// Insert test data again
const insertTestSessionData = () => {
  db.run(
    `INSERT INTO game_sessions (title, date, green_questions_label, red_questions_label, status) VALUES ('Test Session', '2024-01-01', 'Hulk Color', 'Fire Color', 'Draft')`,
    function () {
      const sessionId = this.lastID;

      const geographyQuestions = [
        { type: "red", title: "What is the capital of Germany?", expected_answer: "Berlin", allocated_time: 100000, options: ["Berlin", "Munich", "Hamburg", "Frankfurt"], question_order: 1 },
        { type: "red", title: "What is the largest continent by area?", expected_answer: "Asia", allocated_time: 100000, options: ["Asia", "Africa", "Europe", "Antarctica"], question_order: 2 },
        { type: "red", title: "Which country has the most islands?", expected_answer: "Sweden", allocated_time: 100000, options: ["Sweden", "Indonesia", "Philippines", "Finland"], question_order: 3 },
        { type: "red", title: "What is the capital of Canada?", expected_answer: "Ottawa", allocated_time: 100000, options: ["Ottawa", "Toronto", "Vancouver", "Montreal"], question_order: 4 },
        { type: "red", title: "Which desert is the largest in the world?", expected_answer: "Sahara", allocated_time: 100000, options: ["Sahara", "Gobi", "Kalahari", "Mojave"], question_order: 5 },
        { type: "red", title: "What is the longest river in the world?", expected_answer: "Nile", allocated_time: 100000, options: ["Nile", "Amazon", "Yangtze", "Mississippi"], question_order: 6 },
        { type: "green", title: "What is the smallest country in the world?", expected_answer: "Vatican City", allocated_time: 100000, question_order: 1 },
        { type: "green", title: "What is the capital of Japan?", expected_answer: "Tokyo", allocated_time: 100000, question_order: 2 },
        { type: "green", title: "Which country has the most population?", expected_answer: "China", allocated_time: 100000, question_order: 3 },
        { type: "green", title: "What is the highest mountain in the world?", expected_answer: "Mount Everest", allocated_time: 100000, question_order: 4 },
        { type: "green", title: "Which ocean is the largest?", expected_answer: "Pacific Ocean", allocated_time: 100000, question_order: 5 },
        { type: "green", title: "What is the capital of Australia?", expected_answer: "Canberra", allocated_time: 100000, question_order: 6 }
      ];

      geographyQuestions.forEach((q) => {
        db.run(
          `INSERT INTO questions (type, title, expected_answer, allocated_time, question_icon) VALUES (?, ?, ?, ?, ?)`,
          [q.type, q.title, q.expected_answer, q.allocated_time, "/avatars/" + q.type + ".svg"],
          function () {
            db.run(`INSERT INTO session_questions (session_id, question_id, question_order) VALUES (?, ?, ?)`, [sessionId, this.lastID, q.question_order]);
            if (q.type === "red" && q.options) {
              q.options.forEach((option) => {
                db.run(`INSERT INTO question_options (question_id, option_text) VALUES (?, ?)`, [this.lastID, option]);
              });
            }
          }
        );
      });

      const groups = [
        { name: "Group Alpha", description: "First group in Test Session", avatar_name: "Afroboy", avatar_url: "/avatars/Afroboy.svg" },
        { name: "Group Beta", description: "Second group in Test Session", avatar_name: "Chaplin", avatar_url: "/avatars/Chaplin.svg" },
        { name: "Group Gamma", description: "Third group in Test Session", avatar_name: "Cloud", avatar_url: "/avatars/Cloud.svg" },
        { name: "Group Delta", description: "Fourth group in Test Session", avatar_name: "Helmet", avatar_url: "/avatars/Helmet.svg" }
      ];

      groups.forEach((g) => {
        db.run(`INSERT INTO groups (session_id, name, description, avatar_name, avatar_url) VALUES (?, ?, ?, ?, ?)`,
          [sessionId, g.name, g.description, g.avatar_name, g.avatar_url],
          function () {
            db.run(`INSERT INTO camembert_progress (group_id) VALUES (?)`, [this.lastID]);
          }
        );
      });

      console.log("Test Session recreated successfully.");
    }
  );
};

// Execute the deletion and recreation process
deleteTestSessionData();

module.exports = db;
