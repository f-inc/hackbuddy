"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Project } from "@/domain/studio/model";
import { Empty, ProjectIcon } from "./shared";
export type PresentationRow = {
  project: Project;
  score?: number;
  place?: number;
};
export function FlowPresentation({
  eventName,
  title,
  rows,
  caption,
  winners = false,
}: {
  eventName: string;
  title: string;
  rows: PresentationRow[];
  caption: string;
  winners?: boolean;
}) {
  const [presenting, setPresenting] = useState(false),
    [page, setPage] = useState(0),
    [revealed, setRevealed] = useState<number | null>(null);
  const pages = Math.max(1, Math.ceil(rows.length / 8));
  async function exit() {
    setPresenting(false);
    if (document.fullscreenElement)
      await document.exitFullscreen().catch(() => {});
  }
  useEffect(() => {
    if (!presenting) return;
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest("input,select,textarea"))
        return;
      if (event.key === "Escape") {
        setPresenting(false);
      }
      if (event.key === "ArrowRight") {
        if (winners && revealed !== null)
          setRevealed((n) => Math.min(rows.length, (n || 0) + 1));
        else setPage((n) => (n + 1) % pages);
      }
      if (event.key === "ArrowLeft") {
        if (winners && revealed !== null)
          setRevealed((n) => Math.max(0, (n || 0) - 1));
        else setPage((n) => (n + pages - 1) % pages);
      }
    };
    const full = () => {
      if (!document.fullscreenElement) setPresenting(false);
    };
    document.addEventListener("keydown", key);
    document.addEventListener("fullscreenchange", full);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("fullscreenchange", full);
    };
  }, [presenting, winners, revealed, rows.length, pages]);
  useEffect(() => {
    if (!presenting || winners || pages < 2) return;
    const timer = setInterval(() => setPage((n) => (n + 1) % pages), 14000);
    return () => clearInterval(timer);
  }, [presenting, winners, pages]);
  useEffect(() => {
    if (!presenting) return;
    const roots = Array.from(
      document.querySelectorAll<HTMLElement>(".s-workspace, .s-judge-screen"),
    ).filter((root) => !root.inert);
    roots.forEach((root) => {
      root.inert = true;
    });
    return () => {
      roots.forEach((root) => {
        root.inert = false;
      });
      if (document.fullscreenElement)
        void document.exitFullscreen().catch(() => {});
    };
  }, [presenting]);
  const current = page % pages,
    shown = rows.slice(current * 8, (current + 1) * 8);
  return (
    <>
      <button
        className="s-button"
        onClick={async () => {
          setPage(0);
          setRevealed(null);
          setPresenting(true);
          try {
            await document.documentElement.requestFullscreen();
          } catch {}
        }}
      >
        Present on TV ↗
      </button>
      {presenting &&
        createPortal(
          <div
            className="studio s-tv s-flow-tv"
            role="dialog"
            aria-modal="true"
            aria-label={`${title} presentation`}
          >
            <header className="s-tv-header">
              <div>
                <span className="s-eyebrow">{eventName}</span>
                <h1>{title}</h1>
              </div>
              <div className="s-tv-brand">
                HackBuddy <span>✳</span>
              </div>
            </header>
            <div className="s-tv-controls s-flow-tv-controls">
              {winners && (
                <>
                  <button onClick={() => setRevealed(0)}>
                    Replay winner reveal
                  </button>
                  {revealed !== null && (
                    <>
                      <button
                        disabled={revealed === 0}
                        onClick={() =>
                          setRevealed((n) => Math.max(0, (n || 0) - 1))
                        }
                      >
                        ← Back
                      </button>
                      <button
                        disabled={revealed >= rows.length}
                        onClick={() =>
                          setRevealed((n) =>
                            Math.min(rows.length, (n || 0) + 1),
                          )
                        }
                      >
                        Reveal next →
                      </button>
                    </>
                  )}
                </>
              )}
              {pages > 1 && (
                <>
                  <button
                    onClick={() => setPage((n) => (n + pages - 1) % pages)}
                  >
                    ← Previous
                  </button>
                  <button onClick={() => setPage((n) => (n + 1) % pages)}>
                    Next →
                  </button>
                </>
              )}
              <button autoFocus onClick={exit}>
                Exit presentation
              </button>
            </div>
            <div
              className="s-tv-list"
              style={{
                gridTemplateRows: `repeat(${Math.max(1, shown.length)}, minmax(0, 1fr))`,
              }}
            >
              {shown.map((row, i) => {
                const visible =
                  revealed === null || i >= shown.length - revealed;
                return (
                  <article className="s-tv-row" key={row.project.id}>
                    {row.place !== undefined && (
                      <span className="s-tv-place">{row.place}</span>
                    )}
                    <div className="s-tv-project">
                      <h2>{visible ? row.project.name : "Ready to reveal…"}</h2>
                      <p>
                        {visible
                          ? row.project.description
                          : "Use → to reveal the next winner"}
                      </p>
                    </div>
                    {visible && (
                      <div className="s-tv-team">
                        <ProjectIcon
                          name={row.project.name}
                          image={row.project.image}
                        />
                        <div>
                          <span className="s-eyebrow">Built by</span>
                          <strong>
                            {row.project.team || "An independent team"}
                          </strong>
                        </div>
                      </div>
                    )}
                    {visible && row.score !== undefined && (
                      <strong className="s-tv-score">
                        {row.score.toFixed(2)}
                      </strong>
                    )}
                  </article>
                );
              })}
              {!shown.length && (
                <Empty
                  title="Waiting for projects"
                  detail="This presentation updates as the event progresses."
                />
              )}
            </div>
            <footer className="s-tv-footer">
              <span>{caption}</span>
              <span>
                {rows.length} projects
                {pages > 1 ? ` · page ${current + 1} of ${pages}` : ""}
              </span>
            </footer>
          </div>,
          document.body,
        )}
    </>
  );
}
