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
          allocated_time: 100000,
          options: ["NaHCO3", "Na2CO3", "K2CO3", "Na3CO2", "KHCO3"],
          question_order: 1,
          response_type: "Question à choix unique",
        },
        {
          type: "red",
          title:
            "Quelle masse faut-il peser pour préparer 1L d’une solution étalon normale de Na2CO3 ?",
          expected_answer: "53 g",
          allocated_time: 100000,
          question_order: 2,
          response_type: "Réponse libre",
        },
        {
          type: "green",
          title: "Quelle est la définition correcte d'une solution étalon ?",
          expected_answer:
            "Une solution dont la concentration est connue avec précision et utilisée pour effectuer des titrages.",
          allocated_time: 100000,
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
          allocated_time: 100000,
          question_order: 4,
          response_type: "Réponse libre",
        },
        {
          type: "green",
          title:
            "Pour neutraliser une solution molaire de Na2CO3, on utilise une solution de HCl 1N. Il s’agit d’un dosage :",
          expected_answer:
            "Impliquant deux points équivalents correspondant à la formation de NaHCO3 puis à sa neutralisation complète.",
          allocated_time: 100000,
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
          allocated_time: 100000,
          question_order: 6,
          response_type: "Réponse libre",
        },
        {
          type: "green",
          title:
            "Quelles sont les réactions mises en jeu lors du dosage d’une solution de Na2CO3 par une solution de HCl ?",
          expected_answer: "CO32- + H+ -> HCO3-  \nHCO3- + H+ -> H2CO3",
          allocated_time: 100000,
          question_order: 7,
          response_type: "Réponse libre",
        },
        {
          type: "red",
          title:
            "Quel est le volume nécessaire de HCl 1N pour neutraliser 100 ml d’une solution molaire de Na2CO3 ?",
          expected_answer: "200 ml",
          allocated_time: 100000,
          question_order: 8,
          response_type: "Réponse libre",
        },
        {
          type: "green",
          title:
            "Lors de la neutralisation de 100 ml d’une solution de Na2CO3 2N par une solution de HCl 1N, quelles sont les espèces présentes au niveau de l’erlenmeyer pour VHCl = 50 ml ?",
          expected_answer: "Na+, Cl-, HCO3-",
          allocated_time: 100000,
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
          allocated_time: 100000,
          question_order: 10,
          response_type: "Réponse libre",
        },
        {
          type: "green",
          title:
            "Lorsqu'on ajoute 100 mL de HCl 1N à 100 mL d’une solution de Na2CO3 2N, sous quelle forme est de l'ion CO32- dans l'erlenmeyer après la réaction?",
          expected_answer: "HCO3-",
          allocated_time: 100000,
          question_order: 11,
          response_type: "Réponse libre",
        },
        {
          type: "red",
          title:
            "Pour neutraliser 100 ml une solution de Na2CO3 2N, on utilise 200 ml une solution de HCl. Quelle est la valeur du pH à la 1ère équivalence ?\n(On donne : pKa2 = 6,3 ; pKa1 = 10,35)",
          expected_answer: "8,23",
          allocated_time: 100000,
          question_order: 12,
          response_type: "Réponse libre",
        },
        {
          type: "green",
          title:
            "Lorsqu’on ajoute 150 mL d’une solution de HCl 1N à 100 mL d’une solution de Na2CO3 2N, quelles sont les espèces chimiques présentes dans l’erlenmeyer après la réaction ?",
          expected_answer: "Na+, Cl-, HCO3-",
          allocated_time: 100000,
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
          allocated_time: 100000,
          question_order: 14,
          response_type: "Réponse libre",
        },
        {
          type: "green",
          title:
            "À partir de cette courbe de variation du pH en fonction du volume de HCl lors dosage de Na2CO3 par pHmétrie, à quoi correspondent V1 et V2 ?",
          expected_answer:
            "V1 = neutralisation de la première basicité et V2 = neutralisation totale des deux basicités.",
          allocated_time: 100000,
          question_order: 15,
          response_type: "Réponse libre",
        },
        // Question 16 (Red)
        {
          type: "red",
          title:
            "Quel est le pH à l’équivalence après neutralisation totale de 100 ml d’une solution molaire de Na2CO3 par une solution de HCl 1N ?\n(On donne : pKa2 = 6,3 ; pKa1 = 10,35)",
          expected_answer: "3,38",
          allocated_time: 100000,
          question_order: 16,
          response_type: "Réponse libre",
        },
        // Question 17 (Green)
        {
          type: "green",
          title:
            "Quelles sont les espèces présentes en solution à -1% de la neutralisation de la première acidité d’une solution molaire de Na2CO3 par HCl 1N ?",
          expected_answer: "Na+, Cl-, HCO3-",
          allocated_time: 100000,
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
          allocated_time: 100000,
          question_order: 18,
          response_type: "Réponse libre",
        },
        // Question 19 (Green)
        {
          type: "green",
          title:
            "À quoi correspond le rapport des concentrations [HCO3-] / [H2CO3] +1% de la neutralisation de la première acidité de 100 ml d’une solution molaire de Na2CO3 par HCl 1N ?",
          expected_answer: "1/99",
          allocated_time: 100000,
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
          allocated_time: 100000,
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
          allocated_time: 100000,
          question_order: 21,
          response_type: "Réponse libre",
        },
        // Question 22 (Red)
        {
          type: "red",
          title:
            "On dose 100 ml d’un mélange de NaOH(1N) + Na2CO3(0,5 mol/L) par l’acide chlorhydrique (1N). Calculer le volume d’équivalence nécessaire pour neutraliser NaOH.",
          expected_answer: "100 ml",
          allocated_time: 100000,
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
          allocated_time: 100000,
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
          allocated_time: 100000,
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
          allocated_time: 100000,
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
          allocated_time: 100000,
          question_order: 26,
          response_type: "Réponse libre",
        },
        // Question 27 (Green)
        {
          type: "green",
          title:
            "De quelle espèce chimique dépend le pH après ajout de 50 ml de HCl 1N à un mélange de 100 ml de NaOH(1N) + Na2CO3(1N) ?",
          expected_answer: "OH-",
          allocated_time: 100000,
          question_order: 27,
          response_type: "Réponse libre",
        },
        // Question 28 (Red)
        {
          type: "red",
          title:
            "On dose 100 ml d’un mélange de NaOH(1N) + Na2CO3(1N) par 200 ml d’acide chlorhydrique (1N). Calculer le pH à VHCl=50 ml.\n(On donne : pKa2 = 6,3 ; pKa1 = 10,35)",
          expected_answer: "13,52",
          allocated_time: 100000,
          question_order: 28,
          response_type: "Réponse libre",
        },
        {
          type: "green",
          title:
            "Quelle(s) base(s) est/sont neutralisée(s) après ajout de 100 ml de HCl à 100 ml de NaOH(1N) + Na2CO3(1N) ?",
          expected_answer: "OH-",
          allocated_time: 100000,
          question_order: 29,
          response_type: "Réponse libre",
        },
        {
          type: "red",
          title:
            "On dose 100 ml d’un mélange de NaOH(1N) + Na2CO3(1N) par 200 ml d’acide chlorhydrique (1N). Calculer le pH à VHCl=100 ml.",
          expected_answer: "11,87",
          allocated_time: 100000,
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
