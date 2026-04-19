const db = require("../db");

const findSessionById = (id, callback) => {
  db.get(`SELECT * FROM game_sessions WHERE id = ?`, [id], callback);
};

module.exports = {
  findSessionById,
};
