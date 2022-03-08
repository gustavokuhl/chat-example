const app = require('express')();
const http = require('http').Server(app);
const socketio = require('socket.io');
const port = process.env.PORT || 3000;

const { createClient } = require("redis");
const redisAdapter = require("@socket.io/redis-adapter");

(async () => {
  io = socketio(http, { cors: { origins: ['*'], methods: ['GET', 'POST'] }, transports: ['websocket'] });

  const pubClient = createClient({ url: "redis://127.0.0.1:6379" });
  const subClient = pubClient.duplicate();

  io.adapter(redisAdapter(pubClient, subClient));

  await pubClient.connect();
  await subClient.connect();
  
  app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
  });
  
  io.on('connection', async (socket) => {
    await iniciaKeyRedis(pubClient);
    let hash = await criaUsuario(pubClient, socket.id);

    socket.emit('chat message', `User cluster pID = ${process.pid}, socket ID = ${socket.id}, hash = ${hash}`);
    socket.join("/");

    socket.on('chat message', async msg => {
      if (msg.includes("disconnect")) {
        const [fn, hash] = msg.split(" ");
        await desconectaUsuario(pubClient, io, hash);
      }

      io.emit('chat message', msg);
    });
  });
  
  http.listen(port, () => {
    console.log(`Socket.IO server running at http://localhost:${port}/`);
  });
})();

async function iniciaKeyRedis(pubClient) {
  if (await pubClient.get('users') === null) {
    await pubClient.set('users', JSON.stringify({}));
  }
}

async function criaUsuario(pubClient, socketid) {
  const users = JSON.parse(await pubClient.get('users'));
  const hash = Math.floor(Math.random() * 101);
  const user = {
    hash: hash,
    socketid: socketid
  };
  users[hash] = user;
  await pubClient.set('users', JSON.stringify(users));
  return hash;
}

async function desconectaUsuario(pubClient, io, hash) {
  const users = JSON.parse(await pubClient.get('users'));
  const socketid = users[hash].socketid;
  io.of("/").adapter.remoteDisconnect(socketid, true);
  delete users[hash];
  await pubClient.set('users', JSON.stringify(users));
}