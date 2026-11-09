"use client";
import { useEffect, useState } from "react";
type Project = { id: string; projectName: string; teamNumber?: string; reviewedByYou: boolean };
export function MakerModsProjectPicker({ apiBase, currentId, busy, onSelect }: {
  apiBase: string; currentId?: string; busy: boolean; onSelect: (id: string) => Promise<void>;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [loadedKey, setLoadedKey] = useState("");
  const [refresh, setRefresh] = useState(0);
  const loadKey = apiBase + "|" + (currentId || "") + "|" + refresh;
  const loading = loadedKey !== loadKey;
  useEffect(() => {
    let active = true;
    fetch(apiBase + "/queue/projects", { cache: "no-store" })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load projects.");
        if (active) { setProjects(result.projects); setSelected(currentId || ""); setError(""); }
      }).catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoadedKey(loadKey); });
    return () => { active = false; };
  }, [apiBase, currentId, refresh, loadKey]);
  return <section className="card" aria-label="Choose a Creative project"
    style={{ padding: "12px 16px", marginBottom: 16, flexShrink: 0 }}>
    <div style={{ display: "flex", alignItems: "end", gap: 12, flexWrap: "wrap" }}>
      <label className="field" style={{ flex: "1 1 240px", margin: 0 }}>
        <span>Choose a Creative project</span>
        <select value={selected} disabled={busy || loading}
          onChange={event => setSelected(event.target.value)}>
          <option value="">{loading ? "Loading projects…" : "Select a submitted project"}</option>
          {projects.map(project => <option key={project.id} value={project.id} disabled={project.reviewedByYou}>
            {project.teamNumber ? "Team " + project.teamNumber + " · " : ""}{project.projectName}
            {project.reviewedByYou ? " — Reviewed by you" : ""}
          </option>)}
        </select>
      </label>
      <button type="button" className="secondary-button"
        disabled={busy || loading || !selected || selected === currentId}
        onClick={() => void onSelect(selected)}>{busy ? "Opening…" : "Open project"}</button>
      <button type="button" className="secondary-button" disabled={busy || loading}
        onClick={() => setRefresh(value => value + 1)}>Refresh list</button>
    </div>
    <p className="field-hint" style={{ margin: "8px 0 0" }}>Switch projects without submitting. Your unfinished review is saved as a draft.</p>
    {!loading && error && <p role="alert">{error}</p>}
  </section>;
}
