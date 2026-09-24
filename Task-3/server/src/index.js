import http from "http";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { openDatabase } from "./db.js";
import { decorate } from "./http.js";
import { createRouter, publicUser, userCanJoin, verifySocket } from "./routes.js";
import { seedIfEmpty } from "./seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.join(__dirname, "..", "..", "client");
const PORT = Number(process.env.PORT || 4000);
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const rooms = new Map();

function joinRoom(socket, room) {
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room).add(socket);
  socket.rooms.add(room);
}

function leaveRoom(socket, room) {
  rooms.get(room)?.delete(socket);
  socket.rooms.delete(room);
}

function sendText(socket, text) {
  const payload = Buffer.from(text);
  let header;
  if (payload.length < 126) header = Buffer.from([0x81, payload.length]);
  else if (payload.length < 65536) header = Buffer.from([0x81, 126, payload.length >> 8, payload.length & 255]);
  else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  socket.write(Buffer.concat([header, payload]));
}

const io = {
  to(room) {
    return {
      emit(event, data) {
        const packet = JSON.stringify({ event, data });
        for (const socket of rooms.get(room) || []) {
          try {
            sendText(socket, packet);
          } catch {
            /* socket already gone */
          }
        }
      },
    };
  },
};

openDatabase();
seedIfEmpty();
const router = createRouter(io);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const file = path.normalize(path.join(clientDir, pathname));
  if (!file.startsWith(clientDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const fallback = path.join(clientDir, "index.html");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(fs.readFileSync(fallback));
    return;
  }
  res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
  res.end(fs.readFileSync(file));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api")) {
      decorate(res);
      if (req.method === "GET" && req.url.startsWith("/api/health")) {
        return res.json({ ok: true, name: "keel" });
      }
      req.body = ["POST", "PATCH", "PUT"].includes(req.method) ? await readBody(req) : {};
      const matched = await router.handle(req, res);
      if (!matched && !res.writableEnded) res.status(404).json({ error: "Not found." });
      return;
    }
    if (req.method === "GET") return serveStatic(req, res);
    res.statusCode = 404;
    res.end("Not found");
  } catch (error) {
    if (!res.headersSent) {
      decorate(res);
      res.status(500).json({ error: "Something went wrong." });
    }
    console.error(error);
  }
});

server.on("upgrade", (req, socket) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  const user = verifySocket(url.searchParams.get("token"));
  if (!user) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  const key = req.headers["sec-websocket-key"];
  const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " +
      accept +
      "\r\n\r\n"
  );
  socket.user = user;
  socket.rooms = new Set();
  socket.buffer = Buffer.alloc(0);
  joinRoom(socket, `user:${user.id}`);
  sendText(socket, JSON.stringify({ event: "ready", data: { user: publicUser(user) } }));

  socket.on("data", (chunk) => {
    socket.buffer = Buffer.concat([socket.buffer, chunk]);
    while (socket.buffer.length >= 2) {
      const frame = takeFrame(socket);
      if (!frame) break;
      if (frame.opcode === 0x8) {
        socket.end();
        return;
      }
      if (frame.opcode === 0x9) {
        const pong = Buffer.from(frame.payload);
        socket.write(Buffer.concat([Buffer.from([0x8a, pong.length]), pong]));
        continue;
      }
      if (frame.opcode !== 0x1) continue;
      let message;
      try {
        message = JSON.parse(frame.payload.toString());
      } catch {
        continue;
      }
      if (message.type === "join" && userCanJoin(user.id, message.projectId)) {
        joinRoom(socket, `project:${message.projectId}`);
      }
      if (message.type === "leave") leaveRoom(socket, `project:${message.projectId}`);
    }
  });

  socket.on("close", () => {
    for (const room of [...socket.rooms]) leaveRoom(socket, room);
  });
  socket.on("error", () => socket.destroy());
});

function takeFrame(socket) {
  const buf = socket.buffer;
  const lengthByte = buf[1] & 0x7f;
  let offset = 2;
  let length = lengthByte;
  if (lengthByte === 126) {
    if (buf.length < 4) return null;
    length = buf.readUInt16BE(2);
    offset = 4;
  } else if (lengthByte === 127) {
    if (buf.length < 10) return null;
    length = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }
  const masked = (buf[1] & 0x80) !== 0;
  const maskLength = masked ? 4 : 0;
  if (buf.length < offset + maskLength + length) return null;
  const mask = masked ? buf.subarray(offset, offset + 4) : null;
  offset += maskLength;
  const payload = Buffer.from(buf.subarray(offset, offset + length));
  if (mask) for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
  socket.buffer = buf.subarray(offset + length);
  return { opcode: buf[0] & 0x0f, payload };
}

server.listen(PORT, () => {
  console.log(`Keel is running at http://localhost:${PORT}`);
});
