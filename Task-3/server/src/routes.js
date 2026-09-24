import crypto from "crypto";
import { Router } from "./http.js";
import { all, get, run, transaction } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "keel-dev-secret-change-me";
const COLORS = ["#c4542c", "#2f5d4a", "#3d5a80", "#8a5a2a", "#6b3f69", "#1f6f6a"];

export function signUser(user) {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const body = Buffer.from(JSON.stringify({ id: user.id, exp })).toString("base64url");
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const next = crypto.scryptSync(password, salt, 32);
  const current = Buffer.from(hash, "hex");
  return current.length === next.length && crypto.timingSafeEqual(current, next);
}

export function publicUser(user) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, color: user.color };
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Sign in required." });
  try {
    const payload = readToken(token);
    const user = payload && get("SELECT * FROM users WHERE id = ?", [payload.id]);
    if (!user) return res.status(401).json({ error: "Sign in required." });
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: "Session expired. Sign in again." });
  }
}

function memberOf(userId, projectId) {
  return get(
    "SELECT * FROM members WHERE project_id = ? AND user_id = ?",
    [projectId, userId]
  );
}

function requireMember(req, res, projectId) {
  const membership = memberOf(req.user.id, projectId);
  if (!membership) {
    res.status(403).json({ error: "You are not on this project." });
    return null;
  }
  return membership;
}

function taskWithMeta(task) {
  if (!task) return null;
  const assignee = task.assignee_id
    ? publicUser(get("SELECT * FROM users WHERE id = ?", [task.assignee_id]))
    : null;
  const creator = publicUser(get("SELECT * FROM users WHERE id = ?", [task.creator_id]));
  const commentCount = get(
    "SELECT COUNT(*) AS count FROM comments WHERE task_id = ?",
    [task.id]
  ).count;
  return {
    id: task.id,
    projectId: task.project_id,
    columnId: task.column_id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    dueDate: task.due_date,
    position: task.position,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    assignee,
    creator,
    commentCount,
  };
}

function projectPayload(project) {
  const members = all(
    `SELECT u.*, m.role FROM members m
     JOIN users u ON u.id = m.user_id
     WHERE m.project_id = ?
     ORDER BY m.joined_at`,
    [project.id]
  ).map((row) => ({ ...publicUser(row), role: row.role }));

  const columns = all(
    "SELECT * FROM columns WHERE project_id = ? ORDER BY position",
    [project.id]
  ).map((column) => ({
    id: column.id,
    name: column.name,
    position: column.position,
    tasks: all(
      "SELECT * FROM tasks WHERE column_id = ? ORDER BY position",
      [column.id]
    ).map(taskWithMeta),
  }));

  const openCount = columns.reduce(
    (sum, column) =>
      sum + column.tasks.filter((task) => column.name.toLowerCase() !== "done").length,
    0
  );

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    color: project.color,
    ownerId: project.owner_id,
    createdAt: project.created_at,
    members,
    columns,
    openCount,
  };
}

function emitBoard(io, projectId, extra = {}) {
  io?.to(`project:${projectId}`).emit("board:changed", { projectId, ...extra });
}

function notify(io, { userId, actorId, type, message, projectId, taskId }) {
  if (!userId || userId === actorId) return;
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  run(
    `INSERT INTO notifications
      (id, user_id, actor_id, type, message, project_id, task_id, read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [id, userId, actorId, type, message, projectId || null, taskId || null, createdAt]
  );
  const actor = actorId ? publicUser(get("SELECT * FROM users WHERE id = ?", [actorId])) : null;
  io?.to(`user:${userId}`).emit("notification", {
    id,
    type,
    message,
    projectId: projectId || null,
    taskId: taskId || null,
    read: false,
    createdAt,
    actor,
  });
}

function reindex(columnId) {
  all("SELECT id FROM tasks WHERE column_id = ? ORDER BY position, created_at", [columnId]).forEach(
    (task, index) => {
      run("UPDATE tasks SET position = ? WHERE id = ?", [index, task.id]);
    }
  );
}

export function createRouter(io) {
  const router = Router();

  router.post("/auth/register", (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (name.length < 2) return res.status(400).json({ error: "Name must be at least 2 characters." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Enter a valid email." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }
    if (get("SELECT id FROM users WHERE email = ?", [email])) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }
    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      password_hash: hashPassword(password),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      created_at: new Date().toISOString(),
    };
    run(
      "INSERT INTO users (id, name, email, password_hash, color, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [user.id, user.name, user.email, user.password_hash, user.color, user.created_at]
    );
    res.status(201).json({ token: signUser(user), user: publicUser(user) });
  });

  router.post("/auth/login", (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = get("SELECT * FROM users WHERE email = ?", [email]);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }
    res.json({ token: signUser(user), user: publicUser(user) });
  });

  router.get("/auth/me", auth, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  router.get("/projects", auth, (req, res) => {
    const projects = all(
      `SELECT p.* FROM projects p
       JOIN members m ON m.project_id = p.id
       WHERE m.user_id = ?
       ORDER BY p.created_at DESC`,
      [req.user.id]
    ).map(projectPayload);
    res.json({ projects });
  });

  router.post("/projects", auth, (req, res) => {
    const name = String(req.body.name || "").trim();
    const description = String(req.body.description || "").trim();
    const color = String(req.body.color || "#c4542c");
    if (name.length < 2) return res.status(400).json({ error: "Project name is too short." });
    const now = new Date().toISOString();
    const projectId = crypto.randomUUID();
    const defaults = ["To do", "In progress", "Done"];
    transaction(() => {
      run(
        "INSERT INTO projects (id, name, description, color, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [projectId, name, description, color, req.user.id, now]
      );
      run(
        "INSERT INTO members (project_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)",
        [projectId, req.user.id, now]
      );
      defaults.forEach((columnName, position) => {
        run(
          "INSERT INTO columns (id, project_id, name, position) VALUES (?, ?, ?, ?)",
          [crypto.randomUUID(), projectId, columnName, position]
        );
      });
    });
    const project = get("SELECT * FROM projects WHERE id = ?", [projectId]);
    res.status(201).json({ project: projectPayload(project) });
  });

  router.get("/projects/:id", auth, (req, res) => {
    if (!requireMember(req, res, req.params.id)) return;
    const project = get("SELECT * FROM projects WHERE id = ?", [req.params.id]);
    if (!project) return res.status(404).json({ error: "Project not found." });
    res.json({ project: projectPayload(project) });
  });

  router.patch("/projects/:id", auth, (req, res) => {
    const membership = requireMember(req, res, req.params.id);
    if (!membership) return;
    if (membership.role !== "owner") {
      return res.status(403).json({ error: "Only the owner can edit the project." });
    }
    const project = get("SELECT * FROM projects WHERE id = ?", [req.params.id]);
    const name = req.body.name !== undefined ? String(req.body.name).trim() : project.name;
    const description =
      req.body.description !== undefined ? String(req.body.description).trim() : project.description;
    const color = req.body.color !== undefined ? String(req.body.color) : project.color;
    if (name.length < 2) return res.status(400).json({ error: "Project name is too short." });
    run("UPDATE projects SET name = ?, description = ?, color = ? WHERE id = ?", [
      name,
      description,
      color,
      project.id,
    ]);
    emitBoard(io, project.id);
    res.json({ project: projectPayload(get("SELECT * FROM projects WHERE id = ?", [project.id])) });
  });

  router.delete("/projects/:id", auth, (req, res) => {
    const membership = requireMember(req, res, req.params.id);
    if (!membership) return;
    if (membership.role !== "owner") {
      return res.status(403).json({ error: "Only the owner can delete the project." });
    }
    run("DELETE FROM projects WHERE id = ?", [req.params.id]);
    emitBoard(io, req.params.id);
    res.json({ ok: true });
  });

  router.post("/projects/:id/members", auth, (req, res) => {
    const membership = requireMember(req, res, req.params.id);
    if (!membership) return;
    const email = String(req.body.email || "").trim().toLowerCase();
    const person = get("SELECT * FROM users WHERE email = ?", [email]);
    if (!person) {
      return res.status(404).json({ error: "No Keel account uses that email yet." });
    }
    if (memberOf(person.id, req.params.id)) {
      return res.status(409).json({ error: "That person is already on the project." });
    }
    run(
      "INSERT INTO members (project_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)",
      [req.params.id, person.id, new Date().toISOString()]
    );
    const project = get("SELECT * FROM projects WHERE id = ?", [req.params.id]);
    notify(io, {
      userId: person.id,
      actorId: req.user.id,
      type: "member",
      message: `${req.user.name} added you to ${project.name}`,
      projectId: project.id,
    });
    emitBoard(io, project.id);
    res.status(201).json({ project: projectPayload(project) });
  });

  router.delete("/projects/:id/members/:userId", auth, (req, res) => {
    const membership = requireMember(req, res, req.params.id);
    if (!membership) return;
    const target = memberOf(req.params.userId, req.params.id);
    if (!target) return res.status(404).json({ error: "Member not found." });
    const isSelf = req.params.userId === req.user.id;
    if (!isSelf && membership.role !== "owner") {
      return res.status(403).json({ error: "Only the owner can remove someone else." });
    }
    if (target.role === "owner") {
      return res.status(400).json({ error: "The project owner cannot leave. Delete the project instead." });
    }
    run("UPDATE tasks SET assignee_id = NULL WHERE project_id = ? AND assignee_id = ?", [
      req.params.id,
      req.params.userId,
    ]);
    run("DELETE FROM members WHERE project_id = ? AND user_id = ?", [
      req.params.id,
      req.params.userId,
    ]);
    emitBoard(io, req.params.id);
    res.json({ ok: true });
  });

  router.post("/projects/:id/columns", auth, (req, res) => {
    if (!requireMember(req, res, req.params.id)) return;
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Column name is required." });
    const last = get(
      "SELECT COALESCE(MAX(position), -1) AS max FROM columns WHERE project_id = ?",
      [req.params.id]
    );
    const id = crypto.randomUUID();
    run("INSERT INTO columns (id, project_id, name, position) VALUES (?, ?, ?, ?)", [
      id,
      req.params.id,
      name,
      last.max + 1,
    ]);
    emitBoard(io, req.params.id);
    res.status(201).json({ project: projectPayload(get("SELECT * FROM projects WHERE id = ?", [req.params.id])) });
  });

  router.patch("/columns/:id", auth, (req, res) => {
    const column = get("SELECT * FROM columns WHERE id = ?", [req.params.id]);
    if (!column) return res.status(404).json({ error: "Column not found." });
    if (!requireMember(req, res, column.project_id)) return;
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Column name is required." });
    run("UPDATE columns SET name = ? WHERE id = ?", [name, column.id]);
    emitBoard(io, column.project_id);
    res.json({ project: projectPayload(get("SELECT * FROM projects WHERE id = ?", [column.project_id])) });
  });

  router.delete("/columns/:id", auth, (req, res) => {
    const column = get("SELECT * FROM columns WHERE id = ?", [req.params.id]);
    if (!column) return res.status(404).json({ error: "Column not found." });
    if (!requireMember(req, res, column.project_id)) return;
    const count = get("SELECT COUNT(*) AS count FROM tasks WHERE column_id = ?", [column.id]).count;
    if (count > 0) {
      return res.status(400).json({ error: "Move the cards out of this column before deleting it." });
    }
    const total = get("SELECT COUNT(*) AS count FROM columns WHERE project_id = ?", [column.project_id]).count;
    if (total <= 1) return res.status(400).json({ error: "A board needs at least one column." });
    run("DELETE FROM columns WHERE id = ?", [column.id]);
    emitBoard(io, column.project_id);
    res.json({ ok: true });
  });

  router.post("/projects/:id/tasks", auth, (req, res) => {
    if (!requireMember(req, res, req.params.id)) return;
    const title = String(req.body.title || "").trim();
    const columnId = String(req.body.columnId || "");
    if (!title) return res.status(400).json({ error: "Task title is required." });
    const column = get("SELECT * FROM columns WHERE id = ? AND project_id = ?", [columnId, req.params.id]);
    if (!column) return res.status(400).json({ error: "Choose a column on this board." });
    const description = String(req.body.description || "").trim();
    const priority = ["low", "medium", "high", "urgent"].includes(req.body.priority)
      ? req.body.priority
      : "medium";
    const dueDate = req.body.dueDate ? String(req.body.dueDate) : null;
    let assigneeId = req.body.assigneeId || null;
    if (assigneeId && !memberOf(assigneeId, req.params.id)) {
      return res.status(400).json({ error: "Assignee must be a project member." });
    }
    const now = new Date().toISOString();
    const last = get(
      "SELECT COALESCE(MAX(position), -1) AS max FROM tasks WHERE column_id = ?",
      [columnId]
    );
    const id = crypto.randomUUID();
    run(
      `INSERT INTO tasks
        (id, project_id, column_id, title, description, assignee_id, creator_id, priority, due_date, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.id, columnId, title, description, assigneeId, req.user.id, priority, dueDate, last.max + 1, now, now]
    );
    if (assigneeId) {
      notify(io, {
        userId: assigneeId,
        actorId: req.user.id,
        type: "assigned",
        message: `${req.user.name} assigned you “${title}”`,
        projectId: req.params.id,
        taskId: id,
      });
    }
    emitBoard(io, req.params.id, { taskId: id });
    res.status(201).json({ task: taskWithMeta(get("SELECT * FROM tasks WHERE id = ?", [id])) });
  });

  router.get("/tasks/:id", auth, (req, res) => {
    const task = get("SELECT * FROM tasks WHERE id = ?", [req.params.id]);
    if (!task) return res.status(404).json({ error: "Task not found." });
    if (!requireMember(req, res, task.project_id)) return;
    const comments = all(
      `SELECT c.*, u.name, u.email, u.color
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.task_id = ? ORDER BY c.created_at`,
      [task.id]
    ).map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.created_at,
      author: { id: row.user_id, name: row.name, email: row.email, color: row.color },
    }));
    res.json({ task: taskWithMeta(task), comments });
  });

  router.patch("/tasks/:id", auth, (req, res) => {
    const task = get("SELECT * FROM tasks WHERE id = ?", [req.params.id]);
    if (!task) return res.status(404).json({ error: "Task not found." });
    if (!requireMember(req, res, task.project_id)) return;

    const title = req.body.title !== undefined ? String(req.body.title).trim() : task.title;
    const description =
      req.body.description !== undefined ? String(req.body.description).trim() : task.description;
    const priority =
      req.body.priority !== undefined && ["low", "medium", "high", "urgent"].includes(req.body.priority)
        ? req.body.priority
        : task.priority;
    const dueDate = req.body.dueDate !== undefined ? req.body.dueDate || null : task.due_date;
    let assigneeId = req.body.assigneeId !== undefined ? req.body.assigneeId || null : task.assignee_id;
    if (!title) return res.status(400).json({ error: "Task title is required." });
    if (assigneeId && !memberOf(assigneeId, task.project_id)) {
      return res.status(400).json({ error: "Assignee must be a project member." });
    }
    run(
      `UPDATE tasks SET title = ?, description = ?, priority = ?, due_date = ?, assignee_id = ?, updated_at = ?
       WHERE id = ?`,
      [title, description, priority, dueDate, assigneeId, new Date().toISOString(), task.id]
    );
    if (assigneeId && assigneeId !== task.assignee_id) {
      notify(io, {
        userId: assigneeId,
        actorId: req.user.id,
        type: "assigned",
        message: `${req.user.name} assigned you “${title}”`,
        projectId: task.project_id,
        taskId: task.id,
      });
    }
    emitBoard(io, task.project_id, { taskId: task.id });
    res.json({ task: taskWithMeta(get("SELECT * FROM tasks WHERE id = ?", [task.id])) });
  });

  router.post("/tasks/:id/move", auth, (req, res) => {
    const task = get("SELECT * FROM tasks WHERE id = ?", [req.params.id]);
    if (!task) return res.status(404).json({ error: "Task not found." });
    if (!requireMember(req, res, task.project_id)) return;
    const column = get("SELECT * FROM columns WHERE id = ? AND project_id = ?", [
      req.body.columnId,
      task.project_id,
    ]);
    if (!column) return res.status(400).json({ error: "That column is not on this board." });
    const index = Number.isInteger(req.body.index) ? req.body.index : 100000;
    const fromColumn = task.column_id;
    const ordered = all(
      "SELECT id FROM tasks WHERE column_id = ? AND id != ? ORDER BY position",
      [column.id, task.id]
    ).map((row) => row.id);
    const at = Math.max(0, Math.min(index, ordered.length));
    ordered.splice(at, 0, task.id);
    const now = new Date().toISOString();
    transaction(() => {
      ordered.forEach((id, position) => {
        run("UPDATE tasks SET column_id = ?, position = ?, updated_at = ? WHERE id = ?", [
          column.id,
          position,
          now,
          id,
        ]);
      });
      if (fromColumn !== column.id) reindex(fromColumn);
    });
    emitBoard(io, task.project_id, { taskId: task.id });
    res.json({ ok: true });
  });

  router.delete("/tasks/:id", auth, (req, res) => {
    const task = get("SELECT * FROM tasks WHERE id = ?", [req.params.id]);
    if (!task) return res.status(404).json({ error: "Task not found." });
    if (!requireMember(req, res, task.project_id)) return;
    run("DELETE FROM tasks WHERE id = ?", [task.id]);
    reindex(task.column_id);
    emitBoard(io, task.project_id, { taskId: task.id });
    res.json({ ok: true });
  });

  router.post("/tasks/:id/comments", auth, (req, res) => {
    const task = get("SELECT * FROM tasks WHERE id = ?", [req.params.id]);
    if (!task) return res.status(404).json({ error: "Task not found." });
    if (!requireMember(req, res, task.project_id)) return;
    const body = String(req.body.body || "").trim();
    if (!body) return res.status(400).json({ error: "Write a comment first." });
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    run("INSERT INTO comments (id, task_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)", [
      id,
      task.id,
      req.user.id,
      body,
      createdAt,
    ]);
    const recipients = new Set();
    if (task.assignee_id) recipients.add(task.assignee_id);
    recipients.add(task.creator_id);
    all("SELECT DISTINCT user_id FROM comments WHERE task_id = ?", [task.id]).forEach((row) =>
      recipients.add(row.user_id)
    );
    const snippet = body.length > 80 ? `${body.slice(0, 77)}…` : body;
    for (const userId of recipients) {
      notify(io, {
        userId,
        actorId: req.user.id,
        type: "comment",
        message: `${req.user.name} on “${task.title}”: ${snippet}`,
        projectId: task.project_id,
        taskId: task.id,
      });
    }
    emitBoard(io, task.project_id, { taskId: task.id });
    res.status(201).json({
      comment: {
        id,
        body,
        createdAt,
        author: publicUser(req.user),
      },
    });
  });

  router.get("/notifications", auth, (req, res) => {
    const notifications = all(
      `SELECT n.*, u.name AS actor_name, u.email AS actor_email, u.color AS actor_color
       FROM notifications n
       LEFT JOIN users u ON u.id = n.actor_id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC
       LIMIT 40`,
      [req.user.id]
    ).map((row) => ({
      id: row.id,
      type: row.type,
      message: row.message,
      projectId: row.project_id,
      taskId: row.task_id,
      read: Boolean(row.read),
      createdAt: row.created_at,
      actor: row.actor_id
        ? { id: row.actor_id, name: row.actor_name, email: row.actor_email, color: row.actor_color }
        : null,
    }));
    res.json({ notifications });
  });

  router.post("/notifications/read", auth, (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : null;
    if (ids && ids.length) {
      ids.forEach((id) => {
        run("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?", [id, req.user.id]);
      });
    } else {
      run("UPDATE notifications SET read = 1 WHERE user_id = ?", [req.user.id]);
    }
    res.json({ ok: true });
  });

  return router;
}

function readToken(token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", JWT_SECRET).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString());
  if (!payload.exp || payload.exp < Date.now()) return null;
  return payload;
}

export function verifySocket(token) {
  try {
    const payload = readToken(token);
    if (!payload) return null;
    return get("SELECT * FROM users WHERE id = ?", [payload.id]);
  } catch {
    return null;
  }
}

export function userCanJoin(userId, projectId) {
  return Boolean(memberOf(userId, projectId));
}
