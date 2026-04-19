const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");

// Prefer a dedicated data directory for local database files.
const dataDir = path.resolve(__dirname, "data");
const defaultDbPath = path.join(dataDir, "users.db");
const legacyDbPath = path.resolve(__dirname, "users.db");

let dbPath;
if (process.env.DB_PATH) {
  dbPath = path.resolve(process.env.DB_PATH);
} else if (fs.existsSync(defaultDbPath)) {
  dbPath = defaultDbPath;
} else if (fs.existsSync(legacyDbPath)) {
  dbPath = legacyDbPath;
} else {
  dbPath = defaultDbPath;
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA busy_timeout = 5000");
});

const MEDICAL_AVATAR_NAMES = [
  "Pill",
  "Capsule",
  "Syringe",
  "Stethoscope",
  "Microscope",
  "Mortar",
  "Caduceus",
  "FirstAid",
  "DNA",
  "Heartbeat",
];

const LEGACY_AVATAR_MAP = {
  Afroboy: "Pill",
  Chaplin: "Capsule",
  Cloud: "Stethoscope",
  Helmet: "Microscope",
  Indian: "FirstAid",
  Marilyn: "DNA",
};

const LEGACY_GROUP_NAME_MAP = {
  "Group Alpha": "Equipe Officine",
  "Group Beta": "Equipe Galenique",
  "Group Gamma": "Equipe Pharmacologie",
  "Group Delta": "Equipe Toxicologie",
};

const DEFAULT_ADMIN_PASSWORD = "WelcomeAdmin2024";

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

const checkColumnExists = (tableName, columnName) => {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
      if (err) return reject(err);
      resolve((rows || []).some((row) => row.name === columnName));
    });
  });
};

const hasDefaultSeedSession = () => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT 1 AS found FROM game_sessions WHERE title IN (?, ?) LIMIT 1`,
      ["Test Session", "Protométrie en milieux aqueux"],
      (err, row) => {
        if (err) return reject(err);
        resolve(Boolean(row));
      }
    );
  });
};

// Function to delete default seeded session and related data
const deleteTestSession = () => {
  return new Promise((resolve, reject) => {
    const titles = ["Test Session", "Protométrie en milieux aqueux"];
    db.serialize(() => {
      db.run(
        `CREATE TEMP TABLE IF NOT EXISTS seeded_question_ids (
          question_id INTEGER PRIMARY KEY
        )`,
        (err) => {
          if (err) return reject(err);
        }
      );

      db.run(`DELETE FROM seeded_question_ids`, (err) => {
        if (err) return reject(err);
      });

      db.run(
        `INSERT OR IGNORE INTO seeded_question_ids (question_id)
         SELECT DISTINCT sq.question_id
         FROM session_questions sq
         JOIN game_sessions gs ON gs.id = sq.session_id
         WHERE gs.title IN (?, ?)`,
        titles,
        (err) => {
          if (err) return reject(err);
        }
      );

      db.run(
        `DELETE FROM question_options
         WHERE question_id IN (SELECT question_id FROM seeded_question_ids)`,
        (err) => {
          if (err) return reject(err);
        }
      );

      db.run(
        `DELETE FROM session_questions
         WHERE question_id IN (SELECT question_id FROM seeded_question_ids)`,
        (err) => {
          if (err) return reject(err);
        }
      );

      db.run(
        `DELETE FROM questions
         WHERE id IN (SELECT question_id FROM seeded_question_ids)`,
        (err) => {
          if (err) return reject(err);
        }
      );

      db.run(
        `DELETE FROM session_questions WHERE session_id IN (SELECT id FROM game_sessions WHERE title IN (?, ?))`,
        titles
      );
      db.run(
        `DELETE FROM answers WHERE session_id IN (SELECT id FROM game_sessions WHERE title IN (?, ?))`,
        titles
      );
      db.run(
        `DELETE FROM camembert_progress WHERE group_id IN (SELECT id FROM groups WHERE session_id IN (SELECT id FROM game_sessions WHERE title IN (?, ?)))`,
        titles
      );
      db.run(
        `DELETE FROM groups WHERE session_id IN (SELECT id FROM game_sessions WHERE title IN (?, ?))`,
        titles
      );
      db.run(
        `DELETE FROM game_sessions WHERE title IN (?, ?)`,
        titles,
        function (err) {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  });
};

// Keep legacy seeded data aligned with latest naming
const migrateLegacySessionLabels = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(
        `UPDATE game_sessions SET title = 'Protométrie en milieux aqueux' WHERE title = 'Test Session'`,
        (err) => {
          if (err) return reject(err);
        }
      );

      db.run(
        `UPDATE game_sessions
         SET green_questions_label = 'Flash réponse'
         WHERE title = 'Protométrie en milieux aqueux' AND green_questions_label = 'Hulk Color'`,
        (err) => {
          if (err) return reject(err);
        }
      );

      db.run(
        `UPDATE game_sessions
         SET red_questions_label = 'Expert calcul'
         WHERE title = 'Protométrie en milieux aqueux' AND red_questions_label = 'Fire Color'`,
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  });
};

const migrateLegacyGroupAvatars = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      const entries = Object.entries(LEGACY_AVATAR_MAP);

      const updateMappedAvatars = (index) => {
        if (index >= entries.length) {
          db.run(
            `UPDATE groups
             SET avatar_name = 'Pill', avatar_url = '/avatars/Pill.svg'
             WHERE avatar_name IS NULL OR TRIM(avatar_name) = ''`,
            (err) => {
              if (err) return reject(err);

              const placeholders = MEDICAL_AVATAR_NAMES.map(() => "?").join(", ");
              db.run(
                `UPDATE groups
                 SET avatar_name = 'Pill', avatar_url = '/avatars/Pill.svg'
                 WHERE avatar_name NOT IN (${placeholders})`,
                MEDICAL_AVATAR_NAMES,
                (invalidErr) => {
                  if (invalidErr) return reject(invalidErr);

                  db.run(
                    `UPDATE groups
                     SET avatar_url = '/avatars/' || avatar_name || '.svg'
                     WHERE avatar_name IN (${placeholders})`,
                    MEDICAL_AVATAR_NAMES,
                    (syncErr) => {
                      if (syncErr) return reject(syncErr);
                      resolve();
                    }
                  );
                }
              );
            }
          );
          return;
        }

        const [legacyName, newName] = entries[index];
        db.run(
          `UPDATE groups
           SET avatar_name = ?, avatar_url = ?
           WHERE avatar_name = ?`,
          [newName, `/avatars/${newName}.svg`, legacyName],
          (err) => {
            if (err) return reject(err);
            updateMappedAvatars(index + 1);
          }
        );
      };

      updateMappedAvatars(0);
    });
  });
};

const migrateLegacyGroupNames = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      const entries = Object.entries(LEGACY_GROUP_NAME_MAP);

      const updateName = (index) => {
        if (index >= entries.length) {
          resolve();
          return;
        }

        const [legacyName, nextName] = entries[index];
        db.run(
          `UPDATE groups
           SET name = ?
           WHERE name = ?`,
          [nextName, legacyName],
          (err) => {
            if (err) return reject(err);
            updateName(index + 1);
          }
        );
      };

      updateName(0);
    });
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
          password TEXT,
          email TEXT UNIQUE,
          role TEXT DEFAULT 'Enseignant',
          is_active INTEGER DEFAULT 1,
          first_name TEXT,
          last_name TEXT,
          reset_token TEXT,
          reset_token_expires INTEGER
        )
      `);

      // Insert default admin user
      db.get(`SELECT username FROM users WHERE username = 'admin'`, (err, row) => {
        if (!row) {
          const hashedPassword = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);
          db.run(
            `INSERT INTO users (username, password, email, role, is_active, first_name, last_name) VALUES ('admin', ?, ?, 'Admin', 1, ?, ?)`,
            [hashedPassword, "mejdi.zitouni@gmail.com", "Nesrine", "ZITOUNI"]
          );
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
          status TEXT DEFAULT 'Draft',
          session_rules TEXT,
          created_by INTEGER,
          last_modified_by INTEGER
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

const createIndexes = () => {
  db.serialize(() => {
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_session_questions_session_order ON session_questions(session_id, question_order)`
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_session_questions_session_question ON session_questions(session_id, question_id)`
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_question_options_question_id ON question_options(question_id)`
    );
    db.run(`CREATE INDEX IF NOT EXISTS idx_groups_session_id ON groups(session_id)`);
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_camembert_progress_group_id ON camembert_progress(group_id)`
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_answers_session_group_question ON answers(session_id, group_id, question_id)`
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_game_sessions_created_by ON game_sessions(created_by)`
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_game_sessions_last_modified_by ON game_sessions(last_modified_by)`
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`
    );
  });
};

const migrateUserSchemaAndAdmin = async () => {
  const usersTableExists = await checkTableExists("users");
  if (!usersTableExists) {
    return;
  }

  const needsEmail = !(await checkColumnExists("users", "email"));
  const needsRole = !(await checkColumnExists("users", "role"));
  const needsIsActive = !(await checkColumnExists("users", "is_active"));
  const needsFirstName = !(await checkColumnExists("users", "first_name"));
  const needsLastName = !(await checkColumnExists("users", "last_name"));
  const needsResetToken = !(await checkColumnExists("users", "reset_token"));
  const needsResetTokenExpires = !(await checkColumnExists("users", "reset_token_expires"));

  await new Promise((resolve, reject) => {
    db.serialize(() => {
      if (needsEmail) {
        db.run(`ALTER TABLE users ADD COLUMN email TEXT`);
      }
      if (needsRole) {
        db.run(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'Enseignant'`);
      }
      if (needsIsActive) {
        db.run(`ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1`);
      }
      if (needsFirstName) {
        db.run(`ALTER TABLE users ADD COLUMN first_name TEXT`);
      }
      if (needsLastName) {
        db.run(`ALTER TABLE users ADD COLUMN last_name TEXT`);
      }
      if (needsResetToken) {
        db.run(`ALTER TABLE users ADD COLUMN reset_token TEXT`);
      }
      if (needsResetTokenExpires) {
        db.run(`ALTER TABLE users ADD COLUMN reset_token_expires INTEGER`);
      }

      db.run(`UPDATE users SET role = 'Enseignant' WHERE role IS NULL OR TRIM(role) = ''`);
      db.run(`UPDATE users SET is_active = 1 WHERE is_active IS NULL`);
      db.run(`UPDATE users SET role = 'Admin' WHERE username = 'admin'`);
      db.run(
        `UPDATE users SET email = 'mejdi.zitouni@gmail.com' WHERE username = 'admin' AND (email IS NULL OR TRIM(email) = '')`
      );
      db.run(
        `UPDATE users SET first_name = 'Nesrine', last_name = 'ZITOUNI' WHERE username = 'admin'`
      );

      const hashedPassword = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);
      db.run(
        `UPDATE users SET password = ?, email = 'mejdi.zitouni@gmail.com', role = 'Admin', first_name = 'Nesrine', last_name = 'ZITOUNI' WHERE username = 'admin'`,
        [hashedPassword],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  });
};

const migrateSessionOwnershipSchema = async () => {
  const sessionsTableExists = await checkTableExists("game_sessions");
  if (!sessionsTableExists) {
    return;
  }

  const needsCreatedBy = !(await checkColumnExists("game_sessions", "created_by"));
  const needsLastModifiedBy = !(await checkColumnExists("game_sessions", "last_modified_by"));

  await new Promise((resolve, reject) => {
    db.serialize(() => {
      if (needsCreatedBy) {
        db.run(`ALTER TABLE game_sessions ADD COLUMN created_by INTEGER`);
      }
      if (needsLastModifiedBy) {
        db.run(`ALTER TABLE game_sessions ADD COLUMN last_modified_by INTEGER`);
      }

      db.get(`SELECT id FROM users WHERE username = 'admin'`, (err, adminUser) => {
        if (err) return reject(err);
        if (!adminUser) return resolve();

        db.run(
          `UPDATE game_sessions SET created_by = ? WHERE created_by IS NULL`,
          [adminUser.id],
          (updateErr) => {
            if (updateErr) return reject(updateErr);
            db.run(
              `UPDATE game_sessions SET last_modified_by = created_by WHERE last_modified_by IS NULL`,
              (lastUpdateErr) => {
                if (lastUpdateErr) return reject(lastUpdateErr);
                resolve();
              }
            );
          }
        );
      });
    });
  });
};

// Function to create the default session
const createTestSession = () => {
  db.run(
    `INSERT INTO game_sessions 
(title, date, green_questions_label, red_questions_label, status, session_rules, created_by, last_modified_by) 
VALUES 
('Protométrie en milieux aqueux', '2024-01-01', 'Flash réponse', 'Expert calcul', 'Draft', 
'Vous êtes invités à répondre tous en même temps à des questions chronométrées qui vont défiler sous forme de cartes de jeu rouges, de type Expert calcul (basée sur le calcul), et vertes, de type Flash réponse (basée sur les connaissances), de façon alternée.\n\n
Une récompense sous forme d’un triangle de la même couleur que la carte vous sera offerte si vous êtes les premiers à avoir répondu juste.\n\n
Vous avez la possibilité, si vous êtes sûrs de votre réponse, de la soumettre et d’arrêter le chronomètre. Si votre réponse est juste, vous gagnerez deux triangles de la couleur de votre choix. Si elle est fausse, vous perdrez un triangle de la même couleur que la carte.\n\n
Pour le cas où le groupe qui a arrêté le chronomètre a répondu faux, vous aurez la chance de gagner deux triangles de la couleur de votre choix si vous êtes les premiers à avoir répondu juste, et un triangle de la couleur de la carte si vous et tous les autres groupes n’ont soumis de réponse.\n\n
Les triangles ainsi collectés vous permettront de remplir un camembert composé de huit triangles (quatre rouges et quatre verts). Le gagnant sera le groupe ayant rempli le plus de camemberts à la fin du jeu. En cas d’égalité sur le nombre de camemberts entre les groupes, le gagnant sera celui qui a répondu au plus grand nombre de questions.\n\n
Certaines réponses soumises comme correctes ne sont pas suffisantes pour être validées comme telles et nécessitent un passage au tableau pour fournir une explication. Si l’explication est fausse, on validera la réponse du sous-groupe suivant ayant répondu juste et fait une démonstration correcte.',
(SELECT id FROM users WHERE username = 'admin'),
(SELECT id FROM users WHERE username = 'admin'));
)`,
    function (err) {
      if (err) return console.error("Error creating Test Session:", err);

      const sessionId = this.lastID;

      // // Add 12 geography questions (6 red, 6 green)
      // const geographyQuestions = [
      //   // Red Questions
      //   {
      //     type: "red",
      //     title: "What is the capital of Germany?\n(Hint: It's known for its Brandenburg Gate)",
      //     expected_answer: "Berlin",
      //     allocated_time: 100000,
      //     options: ["Berlin", "Munich", "Hamburg", "Frankfurt"],
      //     question_order: 1,
      //     response_type: "Question à choix unique"
      //   },
      //   {
      //     type: "red",
      //     title: "What is the largest continent by area?\n(Africa or Asia?)",
      //     expected_answer: "Asia",
      //     allocated_time: 100000,
      //     options: ["Asia", "Africa", "Europe", "Antarctica"],
      //     question_order: 2,
      //     response_type: "Question à choix unique"
      //   },
      //   {
      //     type: "red",
      //     title: "Which country has the most islands?",
      //     expected_answer: "Sweden",
      //     allocated_time: 100000,
      //     options: ["Sweden", "Indonesia", "Philippines", "Finland"],
      //     question_order: 3,
      //     response_type: "Question à choix unique"
      //   },
      //   {
      //     type: "red",
      //     title: "What is the capital of Canada?",
      //     expected_answer: "Ottawa",
      //     allocated_time: 100000,
      //     options: ["Ottawa", "Toronto", "Vancouver", "Montreal"],
      //     question_order: 4,
      //     response_type: "Question à choix unique"
      //   },
      //   {
      //     type: "red",
      //     title: "Which desert is the largest in the world?",
      //     expected_answer: "Sahara",
      //     allocated_time: 100000,
      //     options: ["Sahara", "Gobi", "Kalahari", "Mojave"],
      //     question_order: 5,
      //     response_type: "Question à choix unique"
      //   },
      //   {
      //     type: "red",
      //     title: "What is the longest river in the world?",
      //     expected_answer: "Nile",
      //     allocated_time: 100000,
      //     options: ["Nile", "Amazon", "Yangtze", "Mississippi"],
      //     question_order: 6,
      //     response_type: "Question à choix unique"
      //   },
      //   // Green Questions
      //   {
      //     type: "green",
      //     title: "What is the smallest country in the world?\n(Size matters!)",
      //     expected_answer: "Vatican City",
      //     allocated_time: 100000,
      //     question_order: 1,
      //     response_type: "Réponse libre"
      //   },
      //   {
      //     type: "green",
      //     title: "What is the capital of Japan?",
      //     expected_answer: "Tokyo",
      //     allocated_time: 100000,
      //     question_order: 2,
      //     response_type: "Réponse libre"
      //   },
      //   {
      //     type: "green",
      //     title: "Which country has the most population?",
      //     expected_answer: "China",
      //     allocated_time: 100000,
      //     question_order: 3,
      //     response_type: "Réponse libre"
      //   },
      //   {
      //     type: "green",
      //     title: "What is the highest mountain in the world?",
      //     expected_answer: "Mount Everest",
      //     allocated_time: 100000,
      //     question_order: 4,
      //     response_type: "Réponse libre"
      //   },
      //   {
      //     type: "green",
      //     title: "Which ocean is the largest?\n(Hint: It borders the Americas and Asia)",
      //     expected_answer: "Pacific Ocean",
      //     allocated_time: 100000,
      //     question_order: 5,
      //     response_type: "Réponse libre"
      //   },
      //   {
      //     type: "green",
      //     title: "What is the capital of Australia?",
      //     expected_answer: "Canberra",
      //     allocated_time: 100000,
      //     question_order: 6,
      //     response_type: "Réponse libre"
      //   },
      // ];

      const geographyQuestions = [
        // Green Questions
        {
          type: "green",
          title:
            "Le carbonate neutre de sodium est utilisé comme étalon, quelle est sa formule chimique ?",
          expected_answer: "Na2CO3",
          allocated_time: 60,
          options: ["NaHCO3", "Na2CO3", "K2CO3", "Na3CO2", "KHCO3"],
          question_order: 1,
          response_type: "Question à choix unique",
        },
        {
          type: "red",
          title:
            "Quelle masse faut-il peser pour préparer 1L d’une solution étalon normale de Na2CO3 ?",
          expected_answer: "53 g",
          allocated_time: 180,
          question_order: 2,
          response_type: "Réponse libre",
        },
        {
          type: "green",
          title: "Quelle est la définition correcte d'une solution étalon ?",
          expected_answer:
            "Une solution dont la concentration est connue avec précision et utilisée pour effectuer des titrages.",
            allocated_time: 60,
            options: [
            "Une solution qui est utilisée pour préparer des échantillons à analyser.",
            "Une solution dont la concentration est connue avec précision et utilisée pour effectuer des titrages.",
            "Une solution qui est toujours de concentration faible et utilisée pour des tests qualitatifs.",
            "Une solution qui est utilisée pour déterminer le pH d'autres solutions.",
            "Une solution qui sert à comparer les propriétés physiques de différents solutés.",
          ],
          question_order: 3,
          response_type: "Question à choix unique",
        },
        {
          type: "red",
          title:
            "Quel est le pH d’une solution 0,1 N de Na2CO3 ?\n(On donne pKa2 = 6,3 ; pKa1 = 10,35)",
          expected_answer: "11,52",
          allocated_time: 180,
          question_order: 4,
          response_type: "Réponse libre",
        },
        {
          type: "green",
          title:
            "Pour neutraliser une solution molaire de Na2CO3, on utilise une solution de HCl 1N. Il s’agit d’un dosage :",
          expected_answer:
            "Impliquant deux points équivalents correspondant à la formation de NaHCO3 puis à sa neutralisation complète.",
            allocated_time: 60,
            options: [
            "En une seule étape avec un changement de pH brutal.",
            "Impliquant deux points équivalents correspondant à la formation de NaHCO3 puis à sa neutralisation complète.",
            "En retour",
            "Direct en milieu non aqueux",
            "Qui nécessite un indicateur de complexation pour suivre l’évolution du pH",
          ],
          question_order: 5,
          response_type: "Question à choix unique",
        },
        {
          type: "red",
          title:
            "Quel est le pH de la solution de Na2CO3 2N avant sa neutralisation par une solution de HCl ?\n(On donne : pKa2 = 6,3 ; pKa1 = 10,35)",
          expected_answer: "12,17",
          allocated_time: 180,
          question_order: 6,
          response_type: "Réponse libre",
        },
        {
          type: "green",
          title:
            "Quelles sont les réactions mises en jeu lors du dosage d’une solution de Na2CO3 par une solution de HCl ?",
          expected_answer: "CO32- + H+ -> HCO3-  \nHCO3- + H+ -> H2CO3",
          allocated_time: 60,
          question_order: 7,
          response_type: "Réponse libre",
        },
        {
          type: "red",
          title:
            "Quel est le volume nécessaire de HCl 1N pour neutraliser 100 ml d’une solution molaire de Na2CO3 ?",
          expected_answer: "200 ml",
          allocated_time: 180,
          question_order: 8,
          response_type: "Réponse libre",
        },
        {
          type: "green",
          title:
            "Lors de la neutralisation de 100 ml d’une solution de Na2CO3 2N par une solution de HCl 1N, quelles sont les espèces présentes au niveau de l’erlenmeyer pour VHCl = 50 ml ?",
          expected_answer: "Na+, Cl-, HCO3-",
          allocated_time: 60,
          options: [
            "Na+ , Cl-, HCO3- , CO32-",
            "Na+ , Cl-, HCO3-",
            "Na+ , Cl-, H2CO3 ,",
            "Na+ , Cl-, CO32-",
            "Na+ , Cl-, H2CO3 , HCO3-",
          ],
          question_order: 9,
          response_type: "Question à choix unique",
        },
        {
          type: "red",
          title:
            "Pour neutraliser 100 ml d’une solution de Na2CO3 2N, on utilise 200 ml une solution de HCl 1N.\nCalculer le pH à VHCl=50 ml.\n(On donne : pKa2 = 6,3 ; pKa1 = 10,35)",
          expected_answer: "10,35",
          allocated_time: 180,
          question_order: 10,
          response_type: "Réponse libre",
        },
        {
          type: "green",
          title:
            "Lorsqu'on ajoute 100 mL de HCl 1N à 100 mL d’une solution de Na2CO3 2N, sous quelle forme est de l'ion CO32- dans l'erlenmeyer après la réaction?",
          expected_answer: "HCO3-",
          allocated_time: 60,
          question_order: 11,
          response_type: "Réponse libre",
        },
        {
          type: "red",
          title:
            "Pour neutraliser 100 ml une solution de Na2CO3 2N, on utilise 200 ml une solution de HCl. Quelle est la valeur du pH à la 1ère équivalence ?\n(On donne : pKa2 = 6,3 ; pKa1 = 10,35)",
          expected_answer: "8,23",
          allocated_time: 180,
          question_order: 12,
          response_type: "Réponse libre",
        },
        {
          type: "green",
          title:
            "Lorsqu’on ajoute 150 mL d’une solution de HCl 1N à 100 mL d’une solution de Na2CO3 2N, quelles sont les espèces chimiques présentes dans l’erlenmeyer après la réaction ?",
          expected_answer: "Na+, Cl-, HCO3-",
          allocated_time: 60,
          options: [
            "Na+ , Cl-, HCO3- , CO32-",
            "Na+ , Cl-, HCO3-",
            "Na+ , Cl-, H2CO3 ,",
            "Na+ , Cl-, CO32-",
            "Na+ , Cl-, H2CO3 , HCO3-",
          ],
          question_order: 13,
          response_type: "Question à choix unique",
        },
        {
          type: "red",
          title:
            "Quelle serait la valeur du pH si on ajoute 150 ml de HCl 1N à 100 ml d’une solution de Na2CO3 2N ?\n(On donne : pKa2 = 6,3 ; pKa1 = 10,35)",
          expected_answer: "6,3",
          allocated_time: 180,
          question_order: 14,
          response_type: "Réponse libre",
        },
        {
          type: "green",
          title:
            "À partir de cette courbe de variation du pH en fonction du volume de HCl lors dosage de Na2CO3 par pHmétrie, à quoi correspondent V1 et V2 ?",
          expected_answer:
            "V1 = neutralisation de la première basicité et V2 = neutralisation totale des deux basicités.",
          allocated_time: 60,
          question_order: 15,
          response_type: "Réponse libre",
        },
        // Question 16 (Red)
        {
          type: "red",
          title:
            "Quel est le pH à l’équivalence après neutralisation totale de 100 ml d’une solution molaire de Na2CO3 par une solution de HCl 1N ?\n(On donne : pKa2 = 6,3 ; pKa1 = 10,35)",
          expected_answer: "3,38",
          allocated_time: 180,
          question_order: 16,
          response_type: "Réponse libre",
        },
        // Question 17 (Green)
        {
          type: "green",
          title:
            "Quelles sont les espèces présentes en solution à -1% de la neutralisation de la première acidité d’une solution molaire de Na2CO3 par HCl 1N ?",
          expected_answer: "Na+, Cl-, HCO3-",
          allocated_time: 60,
          options: [
            "Na+ , Cl-, HCO3- , CO32-",
            "Na+ , Cl-, HCO3-",
            "Na+ , Cl-, H2CO3 ,",
            "Na+ , Cl-, CO32-",
            "Na+ , Cl-, H2CO3 , HCO3-",
          ],
          question_order: 17,
          response_type: "Question à choix unique",
        },
        // Question 18 (Red)
        {
          type: "red",
          title:
            "Calculer le pH à -1% de la neutralisation de la première acidité de 100 ml d’une solution molaire de Na2CO3 par une solution de HCl 1N.\n(On donne : pKa2 = 6,3 ; pKa1 = 10,35)",
          expected_answer: "8,35",
          allocated_time: 180,
          question_order: 18,
          response_type: "Réponse libre",
        },
        // Question 19 (Green)
        {
          type: "green",
          title:
            "À quoi correspond le rapport des concentrations [HCO3-] / [H2CO3] +1% de la neutralisation de la première acidité de 100 ml d’une solution molaire de Na2CO3 par HCl 1N ?",
          expected_answer: "1/99",
          allocated_time: 60,
          options: ["1/99", "1/199", "99/1", "199/1", "1/100"],
          question_order: 19,
          response_type: "Question à choix unique",
        },
        // Question 20 (Red)
        {
          type: "red",
          title:
            "Calculer le pH à +1% de la neutralisation de la première acidité de 100 ml d’une solution molaire de Na2CO3 par une solution de HCl 1N.\n(On donne : pKa2 = 6,3 ; pKa1 = 10,35)",
          expected_answer: "8,29",
          allocated_time: 180,
          question_order: 20,
          response_type: "Réponse libre",
        },
        // Question 21 (Green)
        {
          type: "green",
          title:
            "On dose 100 mL d’un mélange de NaOH(1N) + Na2CO3(1N) par l’acide chlorhydrique (1N). Quel est le principe du dosage ?",
          expected_answer:
            "Dosage direct d’un mélange de base forte et base faible par un acide fort en milieu aqueux",
          allocated_time: 60,
          question_order: 21,
          response_type: "Réponse libre",
        },
        // Question 22 (Red)
        {
          type: "red",
          title:
            "On dose 100 ml d’un mélange de NaOH(1N) + Na2CO3(0,5 mol/L) par l’acide chlorhydrique (1N). Calculer le volume d’équivalence nécessaire pour neutraliser NaOH.",
          expected_answer: "100 ml",
          allocated_time: 180,
          question_order: 22,
          response_type: "Réponse libre",
        },
        // Question 23 (Green)
        {
          type: "green",
          title:
            "Quelle est la définition d’un indicateur coloré utilisé lors d’un dosage acide-base ?",
          expected_answer:
            "Un acide ou une base faible dont les formes ionisée et non ionisée ont des structures et des couleurs différentes.",
          allocated_time: 60,
          options: [
            "Une solution qui neutralise l’acide ou la base à doser et change de couleur en fin de réaction.",
            "Une substance chimique ajoutée pour accélérer la réaction acide-base tout en restant colorée.",
            "Un acide ou une base faible dont les formes ionisée et non ionisée ont des structures et des couleurs différentes.",
            "Une espèce chimique dont la couleur varie en fonction de la température de la solution.",
            "Un composé qui bloque la réaction chimique jusqu’à ce qu’un pH spécifique soit atteint.",
          ],
          question_order: 23,
          response_type: "Question à choix unique",
        },
        // Question 24 (Red)
        {
          type: "red",
          title:
            "Calculer le volume d’équivalence nécessaire pour neutraliser Na2CO3 lors du dosage de 100 ml d’un mélange de NaOH(1N) + Na2CO3(0,5 mol/L) par l’acide chlorhydrique (1N).",
          expected_answer: "100 ml",
          allocated_time: 180,
          question_order: 24,
          response_type: "Réponse libre",
        },
        // Question 25 (Green)
        {
          type: "green",
          title:
            "Comment se fait la neutralisation d’un mélange de NaOH(1N) + Na2CO3(0,5 mol/L) par l’acide chlorhydrique (1N) ?",
          expected_answer:
            "Neutralisation de NaOH en premier suivi de la première basicité de Na2CO3 suivi de la neutralisation de la deuxième basicité.",
          allocated_time: 60,
          options: [
            "Neutralisation de NaOH en premier suivi de la première basicité de Na2CO3 suivi de la neutralisation de la deuxième basicité.",
            "Neutralisation de la première basicité de Na2CO3 en premier suivi de la neutralisation de la deuxième basicité suivi de NaOH.",
            "Neutralisation simultanée de NaOH et la première basicité de Na2CO3 et enfin la neutralisation de la deuxième basicité.",
            "Neutralisation de toutes les basicités en même temps.",
            "Neutralisation de la première basicité de Na2CO3 suivie de NaOH suivi de la neutralisation de la deuxième basicité.",
          ],
          question_order: 25,
          response_type: "Question à choix unique",
        },
        // Question 26 (Red)
        {
          type: "red",
          title:
            "Calculer le pH de 100 ml d’un mélange de NaOH(1N) + Na2CO3(1N).",
          expected_answer: "14",
          allocated_time: 180,
          question_order: 26,
          response_type: "Réponse libre",
        },
        // Question 27 (Green)
        {
          type: "green",
          title:
            "De quelle espèce chimique dépend le pH après ajout de 50 ml de HCl 1N à un mélange de 100 ml de NaOH(1N) + Na2CO3(1N) ?",
          expected_answer: "OH-",
          allocated_time: 60,
          question_order: 27,
          response_type: "Réponse libre",
        },
        // Question 28 (Red)
        {
          type: "red",
          title:
            "On dose 100 ml d’un mélange de NaOH(1N) + Na2CO3(1N) par 200 ml d’acide chlorhydrique (1N). Calculer le pH à VHCl=50 ml.\n(On donne : pKa2 = 6,3 ; pKa1 = 10,35)",
          expected_answer: "13,52",
          allocated_time: 180,
          question_order: 28,
          response_type: "Réponse libre",
        },
        {
          type: "green",
          title:
            "Quelle(s) base(s) est/sont neutralisée(s) après ajout de 100 ml de HCl à 100 ml de NaOH(1N) + Na2CO3(1N) ?",
          expected_answer: "OH-",
          allocated_time: 60,
          question_order: 29,
          response_type: "Réponse libre",
        },
        {
          type: "red",
          title:
            "On dose 100 ml d’un mélange de NaOH(1N) + Na2CO3(1N) par 200 ml d’acide chlorhydrique (1N). Calculer le pH à VHCl=100 ml.",
          expected_answer: "11,87",
          allocated_time: 180,
          question_order: 30,
          response_type: "Réponse libre",
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

              if (q.options) {
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
        { name: "Equipe Officine", avatar_name: "Pill" },
        { name: "Equipe Galenique", avatar_name: "Capsule" },
        { name: "Equipe Pharmacologie", avatar_name: "Stethoscope" },
        { name: "Equipe Toxicologie", avatar_name: "Microscope" },
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

      console.log("Default session created successfully.");
    }
  );
};

// Run the setup
const dbReady = (async () => {
  try {
    console.log("Checking for existing tables...");
    await createTables(); // Create tables if they don't exist
    await migrateUserSchemaAndAdmin();
    await migrateSessionOwnershipSchema();
    createIndexes(); // Ensure indexes exist for current and future databases
    await migrateLegacySessionLabels();
    await migrateLegacyGroupAvatars();
    await migrateLegacyGroupNames();

    const forceSeed = process.env.SEED_TEST_SESSION === "true";
    const skipSeed = process.env.SEED_TEST_SESSION === "false";
    const isTest = process.env.NODE_ENV === "test";
    const isProduction = process.env.NODE_ENV === "production";

    if (forceSeed) {
      console.log("Deleting existing default session...");
      await deleteTestSession(); // Delete existing Test Session

      console.log("Creating new default session...");
      createTestSession(); // Insert new Test Session
    } else if (skipSeed || isTest) {
      console.log("Skipping default session seed.");
    } else if (isProduction) {
      const defaultSessionExists = await hasDefaultSeedSession();
      if (defaultSessionExists) {
        console.log("Default session already exists; skipping production seed.");
      } else {
        console.log("Default session missing in production, creating it now...");
        createTestSession();
      }
    } else {
      console.log("Refreshing default session in non-production environment...");
      await deleteTestSession();
      createTestSession();
    }
  } catch (error) {
    console.error("Error in setup:", error);
  }
})();

module.exports = db;
module.exports.ready = dbReady;
