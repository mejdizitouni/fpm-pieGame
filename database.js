const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Create or open the database
const dbPath = path.resolve(__dirname, "users.db");
const db = new sqlite3.Database(dbPath);

// Initialize tables
db.serialize(() => {
  // Create users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    )
  `);

  // Insert default admin user if not exists
  db.get(`SELECT username FROM users WHERE username = 'admin'`, (err, row) => {
    if (!row) {
      const bcrypt = require("bcryptjs");
      const hashedPassword = bcrypt.hashSync("WelcomeAdmin2024", 10);
      db.run(`INSERT INTO users (username, password) VALUES ('admin', ?)`, [
        hashedPassword,
      ]);
    }
  });

  // Create game_sessions table
  db.run(`
    CREATE TABLE IF NOT EXISTS game_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      date TEXT
    )
  `);

  // Create questions table
  db.run(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      type TEXT,
      title TEXT,
      expected_answer TEXT,
      allocated_time INTEGER,
      FOREIGN KEY (session_id) REFERENCES game_sessions(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      name TEXT,
      description TEXT,
      FOREIGN KEY (session_id) REFERENCES game_sessions(id)
    )
  `);
});

module.exports = db;
