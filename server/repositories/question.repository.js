const db = require("../db");

const findQuestionById = (id, callback) => {
  db.get(`SELECT * FROM questions WHERE id = ?`, [id], callback);
};

module.exports = {
  findQuestionById,
};
