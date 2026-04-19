const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");

const createApp = ({ corsOptions, mutationLimiter, rootDir }) => {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cors(corsOptions));

  app.use(["/game-sessions", "/sessions", "/questions"], mutationLimiter);

  app.use(express.static(path.join(rootDir, "build")));

  return app;
};

module.exports = {
  createApp,
};
