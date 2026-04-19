const { registerGameplaySocketHandlers } = require("./gameplay.socket");

const registerSockets = (deps) => {
  registerGameplaySocketHandlers(deps);
};

module.exports = {
  registerSockets,
};
