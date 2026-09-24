const TOKEN_KEY = "keel_token";
const app = document.querySelector("#app");
const state = { user: null, notifications: [], socket: null, project: null, task: null, comments: [] };

const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function initials(name) {
  return (name || "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function avatar(user, size = 28) {
  if (!user) return "";
  return `<span class="avatar" title="${escapeHtml(user.name)}" style="background:${user.color};width:${size}px;height:${size}px">${initials(user.name)}</span>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function timeAgo(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function formatDue(date) {
  if (!date) return null;
  const due = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((due - today) / 86400000);
  if (diff < 0) return { label: "Overdue", late: true };
  if (diff === 0) return { label: "Due today", late: false };
  if (diff === 1) return { label: "Due tomorrow", late: false };
  return { label: due.toLocaleDateString(undefined, { month: "short", day: "numeric" }), late: false };
}

function connectSocket() {
  if (!state.user || state.socket) return;
  const socket = new WebSocket(`${location.origin.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(getToken())}`);
  state.socket = socket;
  socket.addEventListener("message", (event) => {
    const packet = JSON.parse(event.data);
    if (packet.event === "notification") {
      state.notifications.unshift(packet.data);
      paintChrome();
    }
    if (packet.event === "board:changed" && location.pathname.startsWith("/projects/")) {
      const id = location.pathname.split("/")[2];
      if (packet.data.projectId === id) loadBoard(id, { keepTask: true });
    }
  });
  socket.addEventListener("close", () => {
    state.socket = null;
  });
}

function sendSocket(message) {
  if (state.socket?.readyState === 1) state.socket.send(JSON.stringify(message));
  else state.socket?.addEventListener("open", () => state.socket.send(JSON.stringify(message)), { once: true });
}

function shell(inner) {
  const unread = state.notifications.filter((note) => !note.read).length;
  return `
    <div class="shell">
      <header class="topbar">
        <a class="mark" href="/">Keel</a>
        <div class="top-actions">
          <div class="bell-wrap">
            <button class="icon-btn" id="bell" aria-label="Notifications">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 7H3s3 0 3-7Z" stroke="currentColor" stroke-width="1.7"/><path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.7"/></svg>
              ${unread ? `<i>${unread}</i>` : ""}
            </button>
            <div class="bell-panel" id="bell-panel" hidden>
              <header><strong>Notifications</strong>${unread ? `<button id="read-all">Mark all read</button>` : ""}</header>
              ${state.notifications.length ? state.notifications.map((note) => `
                <button class="note ${note.read ? "" : "unread"}" data-note="${note.id}" data-project="${note.projectId || ""}" data-task="${note.taskId || ""}">
                  ${note.actor ? avatar(note.actor, 24) : ""}
                  <span>${escapeHtml(note.message)}<small>${timeAgo(note.createdAt)}</small></span>
                </button>`).join("") : `<p class="muted">Nothing yet.</p>`}
            </div>
          </div>
          ${avatar(state.user)}
          <button class="btn tiny" id="logout">Sign out</button>
        </div>
      </header>
      <main>${inner}</main>
    </div>`;
}

function bindChrome() {
  document.querySelector("#logout")?.addEventListener("click", () => {
    clearToken();
    state.user = null;
    state.socket?.close();
    state.socket = null;
    go("/login");
  });
  document.querySelector("#bell")?.addEventListener("click", () => {
    const panel = document.querySelector("#bell-panel");
    panel.hidden = !panel.hidden;
  });
  document.querySelector("#read-all")?.addEventListener("click", async () => {
    await api("/notifications/read", { method: "POST", body: {} });
    state.notifications.forEach((note) => { note.read = true; });
    paintChrome();
  });
  document.querySelectorAll("[data-note]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.note;
      await api("/notifications/read", { method: "POST", body: { ids: [id] } });
      const note = state.notifications.find((item) => item.id === id);
      if (note) note.read = true;
      if (button.dataset.project) go(`/projects/${button.dataset.project}${button.dataset.task ? `?task=${button.dataset.task}` : ""}`);
    });
  });
}

function paintChrome() {
  const panel = document.querySelector("#bell-panel");
  const open = panel && !panel.hidden;
  const main = document.querySelector("main");
  const html = main?.innerHTML;
  if (!document.querySelector(".shell")) return;
  const shellEl = document.querySelector(".shell");
  const parent = shellEl.parentElement;
  parent.innerHTML = shell(html || "");
  if (html) document.querySelector("main").innerHTML = html;
  bindChrome();
  if (open) document.querySelector("#bell-panel").hidden = false;
  bindPage();
}

let pageBinder = () => {};
function bindPage() { pageBinder(); }

function go(path) {
  history.pushState({}, "", path);
  route();
}

async function route() {
  const path = location.pathname;
  if (!state.user && path !== "/login" && path !== "/register") return go("/login");
  if (state.user && (path === "/login" || path === "/register")) return go("/");
  if (path === "/login" || path === "/register") return renderAuth(path === "/login");
  if (path === "/") return renderHome();
  if (path.startsWith("/projects/")) return loadBoard(path.split("/")[2]);
  go(state.user ? "/" : "/login");
}

function renderAuth(isLogin) {
  app.innerHTML = `
    <div class="auth">
      <section class="auth-panel">
        <p class="mark">Keel</p>
        <h1>Keep the work in one place, and the conversation on the card.</h1>
        <ul>
          <li>Group projects with a shared board</li>
          <li>Assign cards, set a due date, drag them across</li>
          <li>Comment where the work actually lives</li>
        </ul>
        <div class="auth-sample">
          <article><span class="pri high">High</span><strong>Write the launch announcement</strong><em>Amira · 2 comments</em></article>
          <article><span class="pri urgent">Urgent</span><strong>Review pricing copy</strong><em>Hashim · due tomorrow</em></article>
        </div>
      </section>
      <section class="auth-form">
        <form id="auth-form">
          <h2>${isLogin ? "Sign in" : "Create an account"}</h2>
          <p class="lede">${isLogin ? "Use a demo account or one you registered." : "You’ll land on an empty workspace and can start a project immediately."}</p>
          ${isLogin ? "" : `<label>Name<input name="name" required minlength="2" /></label>`}
          <label>Email<input name="email" type="email" required /></label>
          <label>Password<input name="password" type="password" required minlength="6" /></label>
          <p class="form-error" id="auth-error"></p>
          <button class="btn solid" type="submit">${isLogin ? "Sign in" : "Create account"}</button>
          <p class="switch">${isLogin ? `New here? <a href="/register">Create an account</a>` : `Already have an account? <a href="/login">Sign in</a>`}</p>
          ${isLogin ? `<p class="hint">Demo: <code>hashim@keel.app</code> / <code>keel123</code><br>Also <code>amira@keel.app</code> and <code>leo@keel.app</code></p>` : ""}
        </form>
      </section>
    </div>`;
  document.querySelectorAll("a[href^='/']").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      go(link.getAttribute("href"));
    });
  });
  document.querySelector("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    try {
      const data = await api(isLogin ? "/auth/login" : "/auth/register", {
        method: "POST",
        body: { name: form.get("name"), email: form.get("email"), password: form.get("password") },
      });
      setToken(data.token);
      state.user = data.user;
      connectSocket();
      const notes = await api("/notifications");
      state.notifications = notes.notifications;
      go("/");
    } catch (error) {
      document.querySelector("#auth-error").textContent = error.message;
    }
  });
}

async function renderHome() {
  const { projects } = await api("/projects");
  app.innerHTML = shell(`
    <header class="page-head">
      <div>
        <p class="eyebrow">Workspace</p>
        <h1>Good to see you, ${escapeHtml(state.user.name.split(" ")[0])}.</h1>
      </div>
      <button class="btn solid" id="new-project">New project</button>
    </header>
    <div class="project-grid" id="grid">
      ${projects.map(projectCard).join("") || `<div class="empty"><h2>No projects yet</h2><p>Start a board, then invite people by the email they used to register.</p></div>`}
    </div>
    <div id="modal"></div>`);
  bindChrome();
  document.querySelectorAll("[data-href]").forEach((card) => {
    card.addEventListener("click", () => go(card.dataset.href));
  });
  document.querySelector("#new-project").addEventListener("click", () => openProjectModal());
}

function projectCard(project) {
  return `<article class="project-card" data-href="/projects/${project.id}">
    <span class="swatch" style="background:${project.color}"></span>
    <h2>${escapeHtml(project.name)}</h2>
    <p>${escapeHtml(project.description || "No description yet.")}</p>
    <footer><span class="faces">${project.members.slice(0, 4).map((member) => avatar(member)).join("")}</span><span>${project.openCount} open</span></footer>
  </article>`;
}

function openProjectModal() {
  const colors = ["#c4542c", "#2f5d4a", "#3d5a80", "#8a5a2a", "#6b3f69", "#1f6f6a"];
  document.querySelector("#modal").innerHTML = `
    <div class="modal-back" id="modal-back">
      <form class="modal" id="project-form">
        <h2>New project</h2>
        <label>Name<input name="name" required /></label>
        <label>Description<textarea name="description" rows="3"></textarea></label>
        <div class="swatches">${colors.map((color, index) => `<button type="button" class="${index === 0 ? "on" : ""}" data-color="${color}" style="background:${color}"></button>`).join("")}</div>
        <p class="form-error" id="project-error"></p>
        <div class="row"><button type="button" class="btn" id="cancel">Cancel</button><button class="btn solid">Create project</button></div>
      </form>
    </div>`;
  let color = colors[0];
  document.querySelectorAll("[data-color]").forEach((button) => {
    button.addEventListener("click", () => {
      color = button.dataset.color;
      document.querySelectorAll("[data-color]").forEach((item) => item.classList.toggle("on", item === button));
    });
  });
  const close = () => { document.querySelector("#modal").innerHTML = ""; };
  document.querySelector("#cancel").addEventListener("click", close);
  document.querySelector("#modal-back").addEventListener("mousedown", (event) => { if (event.target.id === "modal-back") close(); });
  document.querySelector("#project-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    try {
      await api("/projects", { method: "POST", body: { name: form.get("name"), description: form.get("description"), color } });
      renderHome();
    } catch (error) {
      document.querySelector("#project-error").textContent = error.message;
    }
  });
}

async function loadBoard(id, { keepTask = false } = {}) {
  const taskQuery = new URLSearchParams(location.search).get("task");
  const { project } = await api(`/projects/${id}`);
  state.project = project;
  const mine = project.members.find((member) => member.id === state.user.id);
  app.innerHTML = shell(`
    <header class="board-head">
      <div>
        <p class="eyebrow" style="color:${project.color}">${mine?.role === "owner" ? "Owner" : "Member"}</p>
        <h1>${escapeHtml(project.name)}</h1>
        <p class="lede">${escapeHtml(project.description)}</p>
      </div>
      <div class="board-tools">
        <span class="faces">${project.members.map((member) => avatar(member)).join("")}</span>
        <button class="btn" id="invite">Invite</button>
        ${mine?.role === "owner" ? `<button class="btn danger" id="delete-project">Delete</button>` : ""}
      </div>
    </header>
    <p class="form-error pad" id="board-error"></p>
    <div class="board">
      ${project.columns.map(columnHtml).join("")}
      <form class="add-column" id="add-column"><input name="name" placeholder="New column" /><button class="btn">Add</button></form>
    </div>
    <div id="modal"></div>
    <div id="drawer"></div>`);
  bindChrome();
  sendSocket({ type: "join", projectId: id });
  pageBinder = bindBoard;
  bindBoard();
  const openId = keepTask ? (state.task?.id || taskQuery) : taskQuery;
  if (openId) openTask(openId);
}

function columnHtml(column) {
  return `<section class="column" data-column="${column.id}">
    <header>
      <input value="${escapeHtml(column.name)}" data-rename="${column.id}" />
      <span>${column.tasks.length}</span>
      <button class="icon-btn" data-delete-column="${column.id}" title="Delete column">×</button>
    </header>
    <div class="cards">
      ${column.tasks.map((task, index) => cardHtml(task, column.id, index)).join("")}
    </div>
    <form class="quick-add" data-add="${column.id}"><input name="title" placeholder="Add a card" /></form>
  </section>`;
}

function cardHtml(task, columnId, index) {
  const due = formatDue(task.dueDate);
  return `<article class="card tone-${task.priority}" draggable="true" data-task="${task.id}" data-column="${columnId}" data-index="${index}">
    <span class="pri ${task.priority}">${task.priority}</span>
    <h3>${escapeHtml(task.title)}</h3>
    <footer>
      ${due ? `<em class="${due.late ? "late" : ""}">${due.label}</em>` : ""}
      ${task.commentCount ? `<em>${task.commentCount} comments</em>` : ""}
      ${task.assignee ? avatar(task.assignee, 22) : ""}
    </footer>
  </article>`;
}

function bindBoard() {
  const project = state.project;
  if (!project) return;
  document.querySelector("#invite")?.addEventListener("click", openInvite);
  document.querySelector("#delete-project")?.addEventListener("click", async () => {
    if (!confirm("Delete this project and its cards?")) return;
    await api(`/projects/${project.id}`, { method: "DELETE" });
    go("/");
  });
  document.querySelector("#add-column")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = new FormData(event.target).get("name").trim();
    if (!name) return;
    await api(`/projects/${project.id}/columns`, { method: "POST", body: { name } });
    loadBoard(project.id, { keepTask: true });
  });
  document.querySelectorAll("[data-rename]").forEach((input) => {
    input.addEventListener("blur", async () => {
      const name = input.value.trim();
      const column = project.columns.find((item) => item.id === input.dataset.rename);
      if (name && column && name !== column.name) {
        await api(`/columns/${column.id}`, { method: "PATCH", body: { name } });
        loadBoard(project.id, { keepTask: true });
      }
    });
  });
  document.querySelectorAll("[data-delete-column]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`/columns/${button.dataset.deleteColumn}`, { method: "DELETE" });
        loadBoard(project.id, { keepTask: true });
      } catch (error) {
        document.querySelector("#board-error").textContent = error.message;
      }
    });
  });
  document.querySelectorAll("[data-add]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const title = new FormData(form).get("title").trim();
      if (!title) return;
      await api(`/projects/${project.id}/tasks`, { method: "POST", body: { title, columnId: form.dataset.add } });
      loadBoard(project.id, { keepTask: true });
    });
  });
  document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", () => openTask(card.dataset.task));
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", card.dataset.task);
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    card.addEventListener("dragover", (event) => event.preventDefault());
    card.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const source = event.dataTransfer.getData("text/plain");
      if (source && source !== card.dataset.task) moveTask(source, card.dataset.column, Number(card.dataset.index));
    });
  });
  document.querySelectorAll(".column").forEach((column) => {
    column.addEventListener("dragover", (event) => event.preventDefault());
    column.addEventListener("drop", (event) => {
      const source = event.dataTransfer.getData("text/plain");
      const target = project.columns.find((item) => item.id === column.dataset.column);
      if (source) moveTask(source, column.dataset.column, target.tasks.length);
    });
  });
}

async function moveTask(taskId, columnId, index) {
  await api(`/tasks/${taskId}/move`, { method: "POST", body: { columnId, index } });
  loadBoard(state.project.id, { keepTask: true });
}

function openInvite() {
  document.querySelector("#modal").innerHTML = `
    <div class="modal-back" id="modal-back">
      <form class="modal" id="invite-form">
        <h2>Invite a teammate</h2>
        <p class="lede">They need a Keel account. Use the email they registered with.</p>
        <label>Email<input name="email" type="email" required /></label>
        <p class="form-error" id="invite-error"></p>
        <div class="row"><button type="button" class="btn" id="cancel">Cancel</button><button class="btn solid">Add to project</button></div>
      </form>
    </div>`;
  document.querySelector("#cancel").addEventListener("click", () => { document.querySelector("#modal").innerHTML = ""; });
  document.querySelector("#invite-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api(`/projects/${state.project.id}/members`, { method: "POST", body: { email: new FormData(event.target).get("email") } });
      loadBoard(state.project.id, { keepTask: true });
    } catch (error) {
      document.querySelector("#invite-error").textContent = error.message;
    }
  });
}

async function openTask(taskId) {
  const data = await api(`/tasks/${taskId}`);
  state.task = data.task;
  state.comments = data.comments;
  const members = state.project.members.map((member) => `<option value="${member.id}" ${state.task.assignee?.id === member.id ? "selected" : ""}>${escapeHtml(member.name)}</option>`).join("");
  document.querySelector("#drawer").innerHTML = `
    <aside class="drawer">
      <header><span class="pri ${state.task.priority}">${state.task.priority}</span><button class="icon-btn" id="close-task">×</button></header>
      <input class="title" id="task-title" value="${escapeHtml(state.task.title)}" />
      <label>Description<textarea id="task-desc" rows="4">${escapeHtml(state.task.description)}</textarea></label>
      <div class="split">
        <label>Assignee<select id="task-assignee"><option value="">Unassigned</option>${members}</select></label>
        <label>Priority<select id="task-priority">${["low", "medium", "high", "urgent"].map((level) => `<option ${level === state.task.priority ? "selected" : ""}>${level}</option>`).join("")}</select></label>
      </div>
      <label>Due date<input id="task-due" type="date" value="${state.task.dueDate || ""}" /></label>
      <section class="thread">
        <h3>Comments</h3>
        ${state.comments.map((comment) => `<article>${avatar(comment.author, 26)}<div><strong>${escapeHtml(comment.author.name)} <small>${timeAgo(comment.createdAt)}</small></strong><p>${escapeHtml(comment.body)}</p></div></article>`).join("") || `<p class="muted">No comments yet. Start the thread.</p>`}
        <form id="comment-form"><textarea name="body" rows="3" placeholder="Write a comment"></textarea><button class="btn solid">Comment</button></form>
      </section>
      <p class="form-error" id="task-error"></p>
      <button class="btn danger" id="delete-task">Delete card</button>
    </aside>`;
  const save = async (patch) => {
    try {
      const updated = await api(`/tasks/${taskId}`, { method: "PATCH", body: patch });
      state.task = updated.task;
      loadBoard(state.project.id, { keepTask: true });
    } catch (error) {
      document.querySelector("#task-error").textContent = error.message;
    }
  };
  document.querySelector("#close-task").addEventListener("click", () => { document.querySelector("#drawer").innerHTML = ""; state.task = null; });
  document.querySelector("#task-title").addEventListener("blur", (event) => {
    if (event.target.value.trim() && event.target.value.trim() !== state.task.title) save({ title: event.target.value.trim() });
  });
  document.querySelector("#task-desc").addEventListener("blur", (event) => {
    if (event.target.value !== state.task.description) save({ description: event.target.value });
  });
  document.querySelector("#task-assignee").addEventListener("change", (event) => save({ assigneeId: event.target.value || null }));
  document.querySelector("#task-priority").addEventListener("change", (event) => save({ priority: event.target.value }));
  document.querySelector("#task-due").addEventListener("change", (event) => save({ dueDate: event.target.value || null }));
  document.querySelector("#comment-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = new FormData(event.target).get("body").trim();
    if (!body) return;
    await api(`/tasks/${taskId}/comments`, { method: "POST", body: { body } });
    await loadBoard(state.project.id, { keepTask: true });
  });
  document.querySelector("#delete-task").addEventListener("click", async () => {
    if (!confirm("Delete this card?")) return;
    await api(`/tasks/${taskId}`, { method: "DELETE" });
    state.task = null;
    loadBoard(state.project.id);
  });
}

window.addEventListener("popstate", route);
document.addEventListener("click", (event) => {
  const link = event.target.closest("a.mark");
  if (!link) return;
  event.preventDefault();
  go("/");
});

const token = getToken();
if (location.protocol === "file:") {
  /* The static page already explains that the API needs the Node server. */
} else if (token) {
  api("/auth/me")
    .then(async (data) => {
      state.user = data.user;
      connectSocket();
      state.notifications = (await api("/notifications")).notifications;
      route();
    })
    .catch(() => {
      clearToken();
      go("/login");
    });
} else {
  route();
}
