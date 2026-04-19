const http = require("http");
const { Server } = require("socket.io");

const createHttpServer = ({ app, corsOptions }) => {
  const server = http.createServer(app);
  const io = new Server(server, { cors: corsOptions });
  return { server, io };
};

module.exports = {
  createHttpServer,
};
