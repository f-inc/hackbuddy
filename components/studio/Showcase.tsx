"use client";
/* eslint-disable @next/next/no-img-element -- Partner logos are organizer-owned external artwork. */
import { useEffect, useState } from "react";
import type { Award, Project, Publication, Rank } from "@/domain/studio/model";
import { api, Empty, ErrorMessage, Frame, ProjectIcon } from "./shared";
type ShowcaseData = {
  event: {
    name: string;
    slug: string;
    description: string;
    image: string;
    stage: string;
    finalistCount: number;
  };
  projects: Project[];
  finalists: Project[];
  sponsors: Award[];
  publication: Publication | null;
  liveWinners: Rank[];
};
export function Showcase({ slug }: { slug: string }) {
  const [data, setData] = useState<ShowcaseData | null>(null),
    [error, setError] = useState(""),
    [view, setView] = useState("all"),
    [tv, setTv] = useState(false),
    [page, setPage] = useState(0),
    [query, setQuery] = useState("");
  const [gallerySize, setGallerySize] = useState(4);
  useEffect(() => {
    const compact = window.matchMedia(
      "(min-width: 901px) and (max-height: 839px)",
    );
    const resize = () => setGallerySize(compact.matches ? 2 : 4);
    resize();
    compact.addEventListener("change", resize);
    return () => compact.removeEventListener("change", resize);
  }, []);
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
          ? data.publication?.winners.length || data.liveWinners?.length || 0
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
        ? `Top ${data.event.finalistCount || 7}`
        : view === "winners"
          ? "Ideas worth celebrating."
          : award
            ? award.name
            : "Look what we made.";
  const source =
    view === "finalists"
      ? data.finalists
      : view === "winners"
        ? (data.publication?.winners || data.liveWinners || []).map(
            (r) => r.project,
          )
        : award
          ? data.projects.filter((p) => matchesAward(p, award))
          : data.projects;
  const list = source.filter((p) =>
    `${p.name} ${p.team} ${p.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const pageSize = tv ? 8 : gallerySize;
  const currentPage = page % Math.max(1, Math.ceil(list.length / pageSize));
  const displayed = list.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );
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
            Top {data.event.finalistCount || 7}
          </button>
        )}
        {(data.publication || data.liveWinners?.length > 0) && (
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
                ? `Top ${data.event.finalistCount || 7}`
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
                ? data.publication
                  ? `Official results · revision ${data.publication.revision}`
                  : "Live · provisional winners"
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
      className="s-screen s-showcase-screen"
      label={data.event.name}
      actions={
        <span className="s-tag">
          {data.event.stage === "archived" ? "The archive" : "The showcase"}
        </span>
      }
    >
      <main className="s-container s-screen-main">
        <div className="s-showcase-hero">
          <div>
            <h1>{title}</h1>
            <details className="s-inline-help">
              <summary>About this {award ? "award" : "hackathon"}</summary>
              <p>
                {award
                  ? award.prize ||
                    `Projects ${award.sponsor ? `with ${award.sponsor}` : "in this collection"}.`
                  : data.event.description}
              </p>
            </details>
          </div>
        </div>
        <div className="s-section-heading s-showcase-controls">{controls}</div>
        <ErrorMessage message={error} />
        {view !== "winners" && (
          <input
            className="s-search"
            aria-label="Search showcase"
            placeholder="Find an idea, a team, a spark…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        )}
        {view === "finalists" && (
          <p className="s-caption">
            Listed alphabetically. Finalists are presented equally, without rank
            or preliminary scores.
          </p>
        )}
        {!data.publication && view === "winners" && (
          <p className="s-caption">Live · provisional until published</p>
        )}
        {data.publication && view === "winners" && (
          <p className="s-caption">
            Official results · published{" "}
            {new Date(data.publication.publishedAt).toLocaleDateString()} ·
            revision {data.publication.revision}
          </p>
        )}
        <div className="s-screen-body">
          {list.length ? (
            <div
              className={
                view === "winners"
                  ? "s-winner-grid"
                  : "s-project-grid s-gallery-grid"
              }
            >
              {displayed.map((p, i) => (
                <article className="s-gallery-card" key={p.id}>
                  <div className="s-gallery-art">
                    <ProjectIcon name={p.name} image={p.image} />
                    {view === "winners" ? (
                      <span className="s-place-badge">
                        {currentPage * pageSize + i + 1}
                        {["st", "nd", "rd"][currentPage * pageSize + i] ||
                          "th"}{" "}
                        place
                      </span>
                    ) : (
                      p.track && <span className="s-tag">{p.track}</span>
                    )}
                  </div>
                  <div className="s-gallery-copy">
                    <h2>{p.name}</h2>
                    <details
                      className="s-gallery-description"
                      name="showcase-project"
                    >
                      <summary>About the project</summary>
                      <p>{p.description}</p>
                    </details>
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
        </div>
        {list.length > pageSize && (
          <div className="s-pagination">
            <span>
              Page {currentPage + 1} of {Math.ceil(list.length / pageSize)} ·{" "}
              {list.length} projects
            </span>
            <div className="s-actions">
              <button
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                ← Previous
              </button>
              <button
                disabled={(currentPage + 1) * pageSize >= list.length}
                onClick={() => setPage(currentPage + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        )}
        {data.sponsors.length > 0 && (
          <details className="s-partners">
            <summary>Partners & sponsors</summary>
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
          </details>
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
