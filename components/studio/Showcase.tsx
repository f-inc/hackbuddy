"use client";
/* eslint-disable @next/next/no-img-element -- Partner logos are organizer-owned external artwork. */
import { useEffect, useState } from "react";
import type { Award, Project, Publication } from "@/domain/studio/model";
import { api, Empty, ErrorMessage, Frame, ProjectIcon } from "./shared";
type ShowcaseData = {
  event: {
    name: string;
    slug: string;
    description: string;
    image: string;
    stage: string;
  };
  projects: Project[];
  finalists: Project[];
  sponsors: Award[];
  publication: Publication | null;
};
export function Showcase({ slug }: { slug: string }) {
  const [data, setData] = useState<ShowcaseData | null>(null),
    [error, setError] = useState(""),
    [view, setView] = useState("all"),
    [tv, setTv] = useState(false),
    [page, setPage] = useState(0),
    [query, setQuery] = useState("");
  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    api<ShowcaseData>(`public/${slug}`)
      .then((v) => {
        setData(v);
        setTv(qs.get("tv") === "1");
        setView(qs.get("view") || "all");
      })
      .catch((e) => setError(e.message));
    const load = () =>
      api<ShowcaseData>(`public/${slug}`)
        .then(setData)
        .catch((e) => setError(e.message));
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 30000);
    return () => clearInterval(timer);
  }, [slug]);
  useEffect(() => {
    if (!tv || !data) return;
    const count =
      view === "finalists"
        ? data.finalists.length
        : view === "winners"
          ? data.publication?.winners.length || 0
          : view === "all"
            ? data.projects.length
            : data.projects.filter((p) =>
                matchesAward(
                  p,
                  data.sponsors.find((s) => s.id === view),
                ),
              ).length;
    const timer = setInterval(
      () => setPage((p) => (p + 1) % Math.max(1, Math.ceil(count / 8))),
      14000,
    );
    return () => clearInterval(timer);
  }, [tv, view, data]);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTv(false);
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
  if (!data)
    return (
      <Frame label="Showcase">
        <main className="s-container">
          <ErrorMessage message={error} />
          {!error && <p>Setting the stage…</p>}
        </main>
      </Frame>
    );
  const award = data.sponsors.find((a) => a.id === view),
    title =
      view === "finalists"
        ? "Meet the finalists."
        : view === "winners"
          ? "Ideas worth celebrating."
          : award
            ? award.name
            : "Look what we made.";
  const source =
    view === "finalists"
      ? data.finalists
      : view === "winners"
        ? data.publication?.winners.map((r) => r.project) || []
        : award
          ? data.projects.filter((p) => matchesAward(p, award))
          : data.projects;
  const list = source.filter((p) =>
    `${p.name} ${p.team} ${p.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const currentPage = page % Math.max(1, Math.ceil(list.length / 8));
  const displayed = tv
    ? list.slice(currentPage * 8, (currentPage + 1) * 8)
    : list;
  async function present() {
    setQuery("");
    setPage(0);
    setTv(true);
    try {
      await document.documentElement.requestFullscreen();
    } catch {}
  }
  async function exit() {
    setTv(false);
    if (document.fullscreenElement)
      await document.exitFullscreen().catch(() => {});
  }
  const controls = (
    <>
      <div className="s-showcase-tabs">
        <button
          className={view === "all" ? "s-selected" : ""}
          onClick={() => {
            setView("all");
            setPage(0);
          }}
        >
          All projects
        </button>
        {data.finalists.length > 0 && (
          <button
            className={view === "finalists" ? "s-selected" : ""}
            onClick={() => {
              setView("finalists");
              setPage(0);
            }}
          >
            Finalists
          </button>
        )}
        {data.publication && (
          <button
            className={view === "winners" ? "s-selected" : ""}
            onClick={() => {
              setView("winners");
              setPage(0);
            }}
          >
            Winners
          </button>
        )}
        {data.sponsors.map((a) => (
          <button
            key={a.id}
            className={view === a.id ? "s-selected" : ""}
            onClick={() => {
              setView(a.id);
              setPage(0);
            }}
          >
            {a.name}
          </button>
        ))}
      </div>
      <button className="s-inverse" onClick={tv ? exit : present}>
        {tv ? "Exit presentation" : "Present on TV ↗"}
      </button>
    </>
  );
  if (tv)
    return (
      <div className="studio s-tv">
        <header className="s-tv-header">
          <div>
            <span className="s-eyebrow">{data.event.name}</span>
            <h1>
              {view === "finalists"
                ? "The finalists."
                : view === "winners"
                  ? "The winners."
                  : award
                    ? award.name
                    : "The projects."}
            </h1>
          </div>
          <div className="s-tv-brand">
            HackBuddy <span>✳</span>
          </div>
        </header>
        <div className="s-tv-controls">{controls}</div>
        <div
          className="s-tv-list"
          style={{
            gridTemplateRows: `repeat(${Math.max(1, displayed.length)}, minmax(0, 1fr))`,
          }}
        >
          {displayed.map((p, i) => (
            <article className="s-tv-row" key={p.id}>
              {view === "winners" && (
                <span className="s-tv-place">{currentPage * 8 + i + 1}</span>
              )}
              <div className="s-tv-project">
                <h2>{p.name}</h2>
                <p>{p.description}</p>
              </div>
              <div className="s-tv-team">
                <ProjectIcon name={p.name} image={p.image} />
                <div>
                  <span className="s-eyebrow">Built by</span>
                  <strong>{p.team || "An independent team"}</strong>
                </div>
              </div>
            </article>
          ))}
          {!displayed.length && (
            <Empty
              title="The stage is getting ready."
              detail="Projects will appear here as they are selected or published."
            />
          )}
        </div>
        <footer className="s-tv-footer">
          <span>
            {view === "finalists"
              ? "Alphabetical · no ranking implied"
              : view === "winners"
                ? `Official results · revision ${data.publication?.revision}`
                : "Made together. Shared with everyone."}
          </span>
          <span>
            {list.length} {view === "finalists" ? "finalists" : "projects"}
            {list.length > 8 &&
              ` · page ${currentPage + 1} of ${Math.ceil(list.length / 8)}`}
          </span>
        </footer>
      </div>
    );
  return (
    <Frame
      label={data.event.name}
      actions={
        <span className="s-tag">
          {data.event.stage === "archived" ? "The archive" : "The showcase"}
        </span>
      }
    >
      <main className="s-container">
        <div className="s-showcase-hero">
          <div>
            <span className="s-eyebrow">{data.event.name}</span>
            <h1>{title}</h1>
            <p>
              {award
                ? award.prize ||
                  `Projects ${award.sponsor ? `with ${award.sponsor}` : "in this collection"}.`
                : data.event.description}
            </p>
          </div>
          <span className="s-showcase-flower">✳</span>
        </div>
        <div className="s-section-heading s-showcase-controls">{controls}</div>
        <ErrorMessage message={error} />
        {view !== "winners" && (
          <input
            className="s-search"
            aria-label="Search showcase"
            placeholder="Find an idea, a team, a spark…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        {view === "finalists" && (
          <p className="s-caption">
            Listed alphabetically. Finalists are presented equally, without rank
            or preliminary scores.
          </p>
        )}
        {data.publication && view === "winners" && (
          <p className="s-caption">
            Official results · published{" "}
            {new Date(data.publication.publishedAt).toLocaleDateString()} ·
            revision {data.publication.revision}
          </p>
        )}
        {list.length ? (
          <div
            className={
              view === "winners"
                ? "s-winner-grid"
                : "s-project-grid s-gallery-grid"
            }
          >
            {list.map((p, i) => (
              <article className="s-gallery-card" key={p.id}>
                <div className="s-gallery-art">
                  <ProjectIcon name={p.name} image={p.image} />
                  {view === "winners" ? (
                    <span className="s-place-badge">
                      {i + 1}
                      {["st", "nd", "rd"][i] || "th"} place
                    </span>
                  ) : (
                    p.track && <span className="s-tag">{p.track}</span>
                  )}
                </div>
                <div className="s-gallery-copy">
                  <h2>{p.name}</h2>
                  <p>{p.description}</p>
                  <div className="s-gallery-team">
                    <span className="s-eyebrow">Built by</span>
                    <strong>{p.team || "An independent team"}</strong>
                  </div>
                  <div className="s-actions">
                    {p.demo && (
                      <a
                        className="s-button"
                        href={p.demo}
                        target="_blank"
                        rel="noreferrer"
                      >
                        See the demo ↗
                      </a>
                    )}
                    {p.repository && (
                      <a href={p.repository} target="_blank" rel="noreferrer">
                        Source ↗
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="The stage is getting ready."
            detail={
              view === "winners"
                ? "Official winners will appear after publication."
                : "Projects will appear here as they are added or selected."
            }
          />
        )}
        {data.sponsors.length > 0 && (
          <div className="s-partners">
            <span className="s-eyebrow">
              With a little help from our friends
            </span>
            <div>
              {data.sponsors
                .filter((a) => a.sponsor)
                .map((a) => (
                  <span key={a.id}>
                    {a.logo && <img src={a.logo} alt="" />}
                    {a.sponsor}
                  </span>
                ))}
            </div>
          </div>
        )}
      </main>
    </Frame>
  );
}
function matchesAward(p: Project, a?: Award) {
  if (!a) return false;
  const tools = p.tools
    .toLowerCase()
    .split(/[,;\n]/)
    .map((v) => v.trim());
  return (
    (!a.tool || tools.includes(a.tool.toLowerCase())) &&
    (!a.track || p.track.toLowerCase() === a.track.toLowerCase())
  );
}
