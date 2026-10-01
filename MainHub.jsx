import React, { useEffect, useState } from "react";
import StudioEditor from "./studio-editor(4).jsx";

/*
  MainHub.jsx
  Separate launcher / home screen for the Studio software.

  Put this file beside studio-editor(4).jsx and render <MainHub /> from
  your application's entry point.
*/

const COLORS = {
  bg: "#1e1e1e",
  panel: "#252526",
  panel2: "#2d2d30",
  border: "#3e3e42",
  text: "#f1f1f1",
  muted: "#a0a0a0",
  accent: "#3399ff",
  accentHover: "#4aa7ff",
};

const Icon = ({ children, size = 22 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

const Icons = {
  cube: (
    <Icon>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </Icon>
  ),
  plus: (
    <Icon>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  ),
  folder: (
    <Icon>
      <path d="M3 6.5h6l2 2h10v9.5H3z" />
    </Icon>
  ),
  gear: (
    <Icon>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .35 2l.05.05-1.8 1.8-.05-.05a1.8 1.8 0 0 0-2-.35 1.8 1.8 0 0 0-1.1 1.65V20h-2.6v-.1A1.8 1.8 0 0 0 11.1 18.25a1.8 1.8 0 0 0-2 .35l-.05.05-1.8-1.8.05-.05a1.8 1.8 0 0 0 .35-2A1.8 1.8 0 0 0 6 13.7H5.9v-2.6H6a1.8 1.8 0 0 0 1.65-1.1 1.8 1.8 0 0 0-.35-2l-.05-.05 1.8-1.8.05.05a1.8 1.8 0 0 0 2 .35A1.8 1.8 0 0 0 12.2 5V4.9h2.6V5a1.8 1.8 0 0 0 1.1 1.65 1.8 1.8 0 0 0 2-.35l.05-.05 1.8 1.8-.05.05a1.8 1.8 0 0 0-.35 2A1.8 1.8 0 0 0 21 11.1h.1v2.6H21A1.8 1.8 0 0 0 19.4 15z" />
    </Icon>
  ),
  code: (
    <Icon>
      <path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />
    </Icon>
  ),
  book: (
    <Icon>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z" />
      <path d="M4 5.5v15M8 7h8M8 11h8" />
    </Icon>
  ),
  package: (
    <Icon>
      <path d="m12 3 8 4.5-8 4.5-8-4.5zM4 7.5V16l8 5 8-5V7.5M12 12v9" />
    </Icon>
  ),
};

function MainHubHome({ onOpenEditor }) {
  const [projects, setProjects] = useState(() => {
    try { return JSON.parse(localStorage.getItem("studio-hub-projects") || "[]"); } catch { return []; }
  });
  const [showCreate, setShowCreate] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const getUnnamedName = (list) => {
    let number = 0;
    while (list.some((project) => project.name === `Unnamed ${number}`)) number++;
    return `Unnamed ${number}`;
  };

  const createProject = () => {
    const name = projectName.trim() || getUnnamedName(projects);
    const project = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name, createdAt: Date.now() };
    const next = [...projects, project];
    setProjects(next);
    localStorage.setItem("studio-hub-projects", JSON.stringify(next));

    // Remove the project-creation GUI immediately after creation.
    setShowCreate(false);
    setProjectName("");
  };

  const deleteProject = (id) => {
    const next = projects.filter((project) => project.id !== id);
    setProjects(next);
    localStorage.setItem("studio-hub-projects", JSON.stringify(next));
  };

  return (
    <div style={{ minHeight: "100vh", width: "100%", boxSizing: "border-box", background: COLORS.bg, color: COLORS.text, fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif', display: "flex", flexDirection: "column" }}>
      <header style={{ height: 58, flexShrink: 0, display: "flex", alignItems: "center", padding: "0 28px", borderBottom: `1px solid ${COLORS.border}`, background: "#181818" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 31, height: 31, borderRadius: 7, display: "grid", placeItems: "center", background: COLORS.accent, color: "#fff" }}>{Icons.cube}</div>
          <div><div style={{ fontSize: 15, fontWeight: 700 }}>ez studio</div><div style={{ fontSize: 10, color: COLORS.muted }}>MAIN HUB</div></div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          <button
            title="Help"
            onClick={() => setShowHelp(true)}
            style={{ width: 36, height: 36, display: "grid", placeItems: "center", background: "transparent", border: 0, color: "#cfcfcf", cursor: "pointer" }}
          >
            {Icons.book}
          </button>
          <button
            title="Settings"
            onClick={() => setShowSettings(true)}
            style={{ width: 36, height: 36, display: "grid", placeItems: "center", background: "transparent", border: 0, color: "#cfcfcf", cursor: "pointer" }}
          >
            {Icons.gear}
          </button>
        </div>
      </header>

      <main style={{ width: "min(1120px, calc(100% - 48px))", margin: "0 auto", padding: "58px 0 70px", flex: 1, boxSizing: "border-box" }}>
        <section style={{ marginBottom: 38 }}>
          <div style={{ color: COLORS.accent, fontSize: 12, fontWeight: 700, letterSpacing: 1.4 }}>welcom to</div>
          <h1 style={{ margin: "8px 0", fontSize: 36, letterSpacing: -0.8 }}>ez studio</h1>
          <p style={{ margin: 0, color: COLORS.muted, fontSize: 14 }}>the easiest studio you can use</p>
        </section>

        <section style={{ marginBottom: 42 }}>
          <button onClick={() => setShowCreate(true)} style={{ width: "100%", minHeight: 112, textAlign: "left", display: "flex", alignItems: "center", gap: 18, padding: "20px 22px", borderRadius: 9, border: `1px solid ${COLORS.accent}`, background: "#123b5c", color: COLORS.text, cursor: "pointer" }}>
            <div style={{ color: "#fff", display: "flex" }}>{Icons.plus}</div>
            <div><div style={{ fontSize: 17, fontWeight: 650, marginBottom: 5 }}>Create New Project</div></div>
          </button>
        </section>

        <section>
          <div style={{ color: "#d8d8d8", fontSize: 13, fontWeight: 650, marginBottom: 9 }}>Projects</div>
          <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 8, minHeight: 110 }}>
            {projects.length === 0 ? <div style={{ minHeight: 110, display: "grid", placeItems: "center", color: COLORS.muted, fontSize: 13 }}>No projects yet. Create one to get started.</div> : projects.map((project) => (
              <div key={project.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px" }}>
                <div style={{ color: COLORS.accent }}>{Icons.cube}</div>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 550 }}>{project.name}</div><div style={{ color: COLORS.muted, fontSize: 11, marginTop: 3 }}>Project</div></div>
                <button onClick={() => onOpenEditor(project)} style={{ padding: "7px 15px", border: `1px solid ${COLORS.accent}`, borderRadius: 5, background: COLORS.accent, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Edit</button>
                <button onClick={() => deleteProject(project.id)} style={{ padding: "7px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 5, background: "transparent", color: COLORS.muted, cursor: "pointer", fontSize: 12 }}>Delete</button>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer style={{ padding: "14px 28px", borderTop: `1px solid ${COLORS.border}`, color: COLORS.muted, fontSize: 11, display: "flex", justifyContent: "space-between", background: "#181818" }}><span>ez studio Main Hub</span><span>Projects</span></footer>

      {showCreate && <div onMouseDown={(e) => e.target === e.currentTarget && setShowCreate(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.58)", display: "grid", placeItems: "center", zIndex: 10000 }}>
        <div style={{ width: "min(480px, calc(100% - 32px))", background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 10, boxShadow: "0 20px 70px rgba(0,0,0,.5)", overflow: "hidden" }}>
          <div style={{ padding: "15px 18px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center" }}><strong>Create New Project</strong><button onClick={() => setShowCreate(false)} style={closeButtonStyle}>×</button></div>
          <div style={{ padding: 20 }}>
            <label style={{ display: "block", color: COLORS.muted, fontSize: 12, marginBottom: 8 }}>Project Name</label>
            <input autoFocus value={projectName} onChange={(e) => setProjectName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createProject()} placeholder={getUnnamedName(projects)} style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 6, border: `1px solid ${COLORS.border}`, outline: "none", background: "#1b1b1c", color: COLORS.text, fontSize: 14 }} />
            <div style={{ color: COLORS.muted, fontSize: 11, marginTop: 8 }}>Leave this empty and it will default to <strong>{getUnnamedName(projects)}</strong>.</div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowCreate(false)} style={{ padding: "8px 14px", borderRadius: 5, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.text, cursor: "pointer" }}>Cancel</button>
              <button onClick={createProject} style={{ padding: "8px 16px", borderRadius: 5, border: `1px solid ${COLORS.accent}`, background: COLORS.accent, color: "#fff", cursor: "pointer", fontWeight: 600 }}>Create</button>
            </div>
          </div>
        </div>
      </div>}

      {showHelp && (
        <Modal title="Help" onClose={() => setShowHelp(false)}>
          <p style={modalTextStyle}>
            Welcome to ez studio. Create a project, give it a name, and use the
            Edit button on the project to open the Studio Editor.
          </p>
        </Modal>
      )}

      {showSettings && (
        <Modal title="Settings" onClose={() => setShowSettings(false)}>
          <p style={modalTextStyle}>
            Application-wide settings will go here. The top-left Settings button remains available.
          </p>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.58)",
        display: "grid",
        placeItems: "center",
        zIndex: 10000,
      }}
    >
      <div
        style={{
          width: "min(520px, calc(100% - 32px))",
          background: COLORS.panel,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 10,
          boxShadow: "0 20px 70px rgba(0,0,0,.5)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "15px 18px",
            borderBottom: `1px solid ${COLORS.border}`,
            display: "flex",
            alignItems: "center",
          }}
        >
          <strong>{title}</strong>
          <button onClick={onClose} style={closeButtonStyle}>×</button>
        </div>

        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

const headerButtonStyle = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 10px",
  background: "transparent",
  border: "1px solid transparent",
  borderRadius: 5,
  color: "#cfcfcf",
  cursor: "pointer",
  fontSize: 12,
};

const sectionTitleStyle = {
  color: "#d8d8d8",
  fontSize: 13,
  fontWeight: 650,
  marginBottom: 9,
};

const modalTextStyle = {
  color: COLORS.muted,
  fontSize: 13,
  lineHeight: 1.6,
  marginTop: 0,
};

const closeButtonStyle = {
  marginLeft: "auto",
  background: "transparent",
  border: 0,
  color: COLORS.muted,
  fontSize: 22,
  cursor: "pointer",
};

export default function MainHub() {
  const [screen, setScreen] = useState("hub");

  useEffect(() => {
    document.title = screen === "hub" ? "ez studio — Main Hub" : "ez studio Editor";
  }, [screen]);

  if (screen === "editor") {
    return (
      <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
        <StudioEditor />
      </div>
    );
  }

  return <MainHubHome onOpenEditor={() => setScreen("editor")} />;
}
