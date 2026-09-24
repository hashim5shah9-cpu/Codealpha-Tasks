import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "./App.jsx";

export function Avatar({ user, size = 28 }) {
  const initials = (user?.name || "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span className="avatar" title={user?.name} style={{ background: user?.color || "#6f675e", width: size, height: size }}>
      {initials}
    </span>
  );
}

export function Shell({ children }) {
  const { user, logout, notifications, unread, markRead } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  async function openNote(note) {
    if (!note.read) await markRead([note.id]);
    setOpen(false);
    if (note.projectId) navigate(`/projects/${note.projectId}?task=${note.taskId || ""}`);
  }

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="mark">
          Keel
        </Link>
        <div className="top-actions">
          <div className="bell-wrap">
            <button className="icon-btn" onClick={() => setOpen((v) => !v)} aria-label="Notifications">
              <Bell />
              {unread > 0 && <i>{unread}</i>}
            </button>
            {open && (
              <div className="bell-panel">
                <header>
                  <strong>Notifications</strong>
                  {unread > 0 && (
                    <button onClick={() => markRead()}>Mark all read</button>
                  )}
                </header>
                {notifications.length === 0 && <p className="muted">Nothing yet.</p>}
                {notifications.map((note) => (
                  <button key={note.id} className={note.read ? "note" : "note unread"} onClick={() => openNote(note)}>
                    {note.actor && <Avatar user={note.actor} size={24} />}
                    <span>
                      {note.message}
                      <small>{timeAgo(note.createdAt)}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Avatar user={user} />
          <button className="btn tiny" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

function Bell() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 7H3s3 0 3-7Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function timeAgo(iso) {
  const delta = Date.now() - new Date(iso).getTime();
  const mins = Math.round(delta / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function formatDue(date) {
  if (!date) return "";
  const due = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((due - today) / 86400000);
  if (diff < 0) return { label: "Overdue", late: true };
  if (diff === 0) return { label: "Due today", late: false };
  if (diff === 1) return { label: "Due tomorrow", late: false };
  return {
    label: due.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    late: false,
  };
}
