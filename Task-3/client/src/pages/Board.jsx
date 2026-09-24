import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useApp } from "../App.jsx";
import { Avatar, Shell, formatDue, timeAgo } from "../ui.jsx";

export default function Board() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { socket, user } = useApp();
  const [project, setProject] = useState(null);
  const [error, setError] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [taskId, setTaskId] = useState(params.get("task") || "");
  const [dragging, setDragging] = useState(null);

  async function load() {
    try {
      const data = await api(`/projects/${id}`);
      setProject(data.project);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (!socket) return;
    socket.emit("join:project", id);
    const onChange = (event) => {
      if (event.projectId === id) load();
    };
    socket.on("board:changed", onChange);
    return () => {
      socket.emit("leave:project", id);
      socket.off("board:changed", onChange);
    };
  }, [socket, id]);

  function openTask(nextId) {
    setTaskId(nextId);
    const next = new URLSearchParams(params);
    if (nextId) next.set("task", nextId);
    else next.delete("task");
    setParams(next, { replace: true });
  }

  async function move(sourceId, columnId, index) {
    setProject((current) => reorderLocal(current, sourceId, columnId, index));
    try {
      await api(`/tasks/${sourceId}/move`, { method: "POST", body: { columnId, index } });
    } catch (err) {
      setError(err.message);
      load();
    }
  }

  if (error && !project) {
    return (
      <Shell>
        <p className="form-error">{error}</p>
      </Shell>
    );
  }
  if (!project) {
    return (
      <Shell>
        <p className="muted pad">Loading board…</p>
      </Shell>
    );
  }

  const mine = project.members.find((member) => member.id === user.id);

  return (
    <Shell>
      <header className="board-head">
        <div>
          <p className="eyebrow" style={{ color: project.color }}>
            {mine?.role === "owner" ? "Owner" : "Member"}
          </p>
          <h1>{project.name}</h1>
          <p className="lede">{project.description}</p>
        </div>
        <div className="board-tools">
          <span className="faces">
            {project.members.map((member) => (
              <Avatar key={member.id} user={member} />
            ))}
          </span>
          <button className="btn" onClick={() => setInviteOpen(true)}>
            Invite
          </button>
          {mine?.role === "owner" && (
            <button
              className="btn danger"
              onClick={async () => {
                if (!confirm("Delete this project and its cards?")) return;
                await api(`/projects/${project.id}`, { method: "DELETE" });
                window.location.assign("/");
              }}
            >
              Delete
            </button>
          )}
        </div>
      </header>
      {error && <p className="form-error pad">{error}</p>}
      <div className="board">
        {project.columns.map((column) => (
          <Column
            key={column.id}
            column={column}
            dragging={dragging}
            onDragStart={setDragging}
            onDragEnd={() => setDragging(null)}
            onOpen={openTask}
            onMove={move}
            onRename={async (name) => {
              await api(`/columns/${column.id}`, { method: "PATCH", body: { name } });
              load();
            }}
            onDelete={async () => {
              try {
                await api(`/columns/${column.id}`, { method: "DELETE" });
                load();
              } catch (err) {
                setError(err.message);
              }
            }}
            onAdd={async (title) => {
              await api(`/projects/${project.id}/tasks`, {
                method: "POST",
                body: { title, columnId: column.id },
              });
              load();
            }}
          />
        ))}
        <AddColumn
          onAdd={async (name) => {
            await api(`/projects/${project.id}/columns`, { method: "POST", body: { name } });
            load();
          }}
        />
      </div>
      {inviteOpen && (
        <InviteModal
          onClose={() => setInviteOpen(false)}
          onInvite={async (email) => {
            await api(`/projects/${project.id}/members`, { method: "POST", body: { email } });
            setInviteOpen(false);
            load();
          }}
        />
      )}
      {taskId && (
        <TaskDrawer
          taskId={taskId}
          members={project.members}
          refreshKey={project}
          onClose={() => openTask("")}
          onChanged={load}
        />
      )}
    </Shell>
  );
}

function Column({ column, onOpen, onMove, onRename, onDelete, onAdd, onDragStart, onDragEnd, dragging }) {
  const [name, setName] = useState(column.name);
  const [draft, setDraft] = useState("");

  useEffect(() => setName(column.name), [column.name]);

  function allow(event) {
    event.preventDefault();
  }

  return (
    <section
      className="column"
      onDragOver={allow}
      onDrop={(event) => {
        event.preventDefault();
        const taskId = event.dataTransfer.getData("text/plain");
        if (taskId) onMove(taskId, column.id, column.tasks.length);
      }}
    >
      <header>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== column.name && onRename(name.trim())}
        />
        <span>{column.tasks.length}</span>
        <button className="icon-btn" title="Delete column" onClick={onDelete}>
          ×
        </button>
      </header>
      <div className="cards">
        {column.tasks.map((task, index) => (
          <article
            key={task.id}
            className={dragging === task.id ? "card dragging" : "card"}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData("text/plain", task.id);
              event.dataTransfer.effectAllowed = "move";
              onDragStart(task.id);
            }}
            onDragEnd={onDragEnd}
            onDragOver={allow}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const sourceId = event.dataTransfer.getData("text/plain");
              if (sourceId && sourceId !== task.id) onMove(sourceId, column.id, index);
            }}
            onClick={() => onOpen(task.id)}
          >
            <span className={`pri ${task.priority}`}>{task.priority}</span>
            <h3>{task.title}</h3>
            <footer>
              {task.dueDate && (
                <em className={formatDue(task.dueDate).late ? "late" : ""}>{formatDue(task.dueDate).label}</em>
              )}
              {task.commentCount > 0 && <em>{task.commentCount} comments</em>}
              {task.assignee && <Avatar user={task.assignee} size={22} />}
            </footer>
          </article>
        ))}
      </div>
      <form
        className="quick-add"
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.trim()) return;
          onAdd(draft.trim());
          setDraft("");
        }}
      >
        <input
          value={draft}
          placeholder="Add a card"
          onChange={(e) => setDraft(e.target.value)}
        />
      </form>
    </section>
  );
}

function AddColumn({ onAdd }) {
  const [name, setName] = useState("");
  return (
    <form
      className="add-column"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        onAdd(name.trim());
        setName("");
      }}
    >
      <input value={name} placeholder="New column" onChange={(e) => setName(e.target.value)} />
      <button className="btn">Add</button>
    </form>
  );
}

function InviteModal({ onClose, onInvite }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <form
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onInvite(email.trim());
          } catch (err) {
            setError(err.message);
            setBusy(false);
          }
        }}
      >
        <h2>Invite a teammate</h2>
        <p className="lede">They need a Keel account. Use the email they registered with.</p>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="row">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn solid" disabled={busy}>
            Add to project
          </button>
        </div>
      </form>
    </div>
  );
}

function TaskDrawer({ taskId, members, onClose, onChanged, refreshKey }) {
  const [detail, setDetail] = useState(null);
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const data = await api(`/tasks/${taskId}`);
    setDetail(data.task);
    setComments(data.comments);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [taskId, refreshKey]);

  async function save(patch) {
    try {
      const data = await api(`/tasks/${taskId}`, { method: "PATCH", body: patch });
      setDetail(data.task);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!detail) {
    return (
      <aside className="drawer">
        <p className="muted">{error || "Loading…"}</p>
      </aside>
    );
  }

  return (
    <aside className="drawer">
      <header>
        <span className={`pri ${detail.priority}`}>{detail.priority}</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      <input
        className="title"
        defaultValue={detail.title}
        key={detail.title}
        onBlur={(e) => e.target.value.trim() && e.target.value !== detail.title && save({ title: e.target.value.trim() })}
      />
      <label>
        Description
        <textarea
          key={detail.id + detail.updatedAt}
          defaultValue={detail.description}
          rows={4}
          onBlur={(e) => e.target.value !== detail.description && save({ description: e.target.value })}
        />
      </label>
      <div className="split">
        <label>
          Assignee
          <select
            value={detail.assignee?.id || ""}
            onChange={(e) => save({ assigneeId: e.target.value || null })}
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select value={detail.priority} onChange={(e) => save({ priority: e.target.value })}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
      </div>
      <label>
        Due date
        <input
          type="date"
          value={detail.dueDate || ""}
          onChange={(e) => save({ dueDate: e.target.value || null })}
        />
      </label>
      <section className="thread">
        <h3>Comments</h3>
        {comments.length === 0 && <p className="muted">No comments yet. Start the thread.</p>}
        {comments.map((comment) => (
          <article key={comment.id}>
            <Avatar user={comment.author} size={26} />
            <div>
              <strong>
                {comment.author.name} <small>{timeAgo(comment.createdAt)}</small>
              </strong>
              <p>{comment.body}</p>
            </div>
          </article>
        ))}
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!body.trim()) return;
            const data = await api(`/tasks/${taskId}/comments`, {
              method: "POST",
              body: { body: body.trim() },
            });
            setComments((current) => [...current, data.comment]);
            setBody("");
            onChanged();
          }}
        >
          <textarea
            value={body}
            rows={3}
            placeholder="Write a comment"
            onChange={(e) => setBody(e.target.value)}
          />
          <button className="btn solid" type="submit">
            Comment
          </button>
        </form>
      </section>
      {error && <p className="form-error">{error}</p>}
      <button
        className="btn danger"
        onClick={async () => {
          if (!confirm("Delete this card?")) return;
          await api(`/tasks/${taskId}`, { method: "DELETE" });
          onChanged();
          onClose();
        }}
      >
        Delete card
      </button>
    </aside>
  );
}

function reorderLocal(project, taskId, columnId, index) {
  if (!project) return project;
  const columns = project.columns.map((column) => ({
    ...column,
    tasks: column.tasks.filter((task) => task.id !== taskId),
  }));
  const task = project.columns.flatMap((column) => column.tasks).find((item) => item.id === taskId);
  if (!task) return project;
  const target = columns.find((column) => column.id === columnId);
  if (!target) return project;
  const next = { ...task, columnId };
  const at = Math.max(0, Math.min(index, target.tasks.length));
  target.tasks = [...target.tasks.slice(0, at), next, ...target.tasks.slice(at)];
  return { ...project, columns };
}
