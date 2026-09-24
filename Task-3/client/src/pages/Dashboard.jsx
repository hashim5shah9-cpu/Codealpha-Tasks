import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useApp } from "../App.jsx";
import { Avatar, Shell } from "../ui.jsx";

const SWATCHES = ["#c4542c", "#2f5d4a", "#3d5a80", "#8a5a2a", "#6b3f69", "#1f6f6a"];

export default function Dashboard() {
  const { user } = useApp();
  const [projects, setProjects] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  function load() {
    api("/projects").then((data) => setProjects(data.projects));
  }

  useEffect(load, []);

  const visible = projects.filter((project) =>
    project.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <Shell>
      <header className="page-head">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Good to see you, {user.name.split(" ")[0]}.</h1>
        </div>
        <button className="btn solid" onClick={() => setOpen(true)}>
          New project
        </button>
      </header>
      <input
        className="search"
        placeholder="Search projects"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {visible.length === 0 ? (
        <div className="empty">
          <h2>{projects.length ? "No matching projects" : "No projects yet"}</h2>
          <p>Start a board, then invite people by the email they used to register.</p>
        </div>
      ) : (
        <div className="project-grid">
          {visible.map((project) => (
            <Link key={project.id} to={`/projects/${project.id}`} className="project-card">
              <span className="swatch" style={{ background: project.color }} />
              <h2>{project.name}</h2>
              <p>{project.description || "No description yet."}</p>
              <footer>
                <span className="faces">
                  {project.members.slice(0, 4).map((member) => (
                    <Avatar key={member.id} user={member} />
                  ))}
                </span>
                <span>{project.openCount} open</span>
              </footer>
            </Link>
          ))}
        </div>
      )}
      {open && (
        <ProjectModal
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false);
            load();
          }}
          onError={setError}
        />
      )}
      {error && <p className="toast">{error}</p>}
    </Shell>
  );
}

function ProjectModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(SWATCHES[0]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/projects", { method: "POST", body: { name, description, color } });
      onCreated();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <form className="modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <h2>New project</h2>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </label>
        <div className="swatches">
          {SWATCHES.map((swatch) => (
            <button
              type="button"
              key={swatch}
              className={swatch === color ? "on" : ""}
              style={{ background: swatch }}
              onClick={() => setColor(swatch)}
              aria-label={swatch}
            />
          ))}
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="row">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn solid" disabled={busy}>
            Create project
          </button>
        </div>
      </form>
    </div>
  );
}
