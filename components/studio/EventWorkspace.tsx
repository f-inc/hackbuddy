"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EventView } from "@/domain/studio/model";
import {
  api,
  ErrorMessage,
  formats,
  Frame,
  flowSectionFromUrl,
  setFlowUrl,
} from "./shared";
import { EventOverview } from "./EventOverview";
import { EventFlow, type FlowSection } from "./EventFlow";
import { EventSettings } from "./EventSettings";
import { ProjectImport } from "./ProjectImport";
import { JudgeRoster } from "./JudgeRoster";
import { EventResults } from "./EventResults";
export type RunAction = (data: Record<string, unknown>) => Promise<void>;
const tabs = [
  "Dashboard",
  "First pass judging",
  "Top finalists",
  "Second pass judging",
  "Winners",
];
const management = ["Projects", "Judges", "Settings", "Results", "Activity"];
export function EventWorkspace({ id }: { id: string }) {
  const router = useRouter(),
    [view, setView] = useState<EventView | null>(null),
    [tab, setTab] = useState("Dashboard"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const sync = () => setTab(flowSectionFromUrl() || "Dashboard");
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [id]);
  const load = useCallback(async () => {
    const v = await api<EventView>(`events/${id}`);
    if (v.actor.role !== "organizer")
      throw new Error("Open your organizer workspace to manage this event.");
    setView(v);
  }, [id]);
  useEffect(() => {
    let alive = true;
    api<EventView>(`events/${id}`)
      .then((v) => {
        if (!alive) return;
        if (v.actor.role !== "organizer")
          throw new Error("Organizer access required.");
        setView(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    const timer = setInterval(() => {
      if (!document.hidden) load().catch(() => {});
    }, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [id, load]);
  useEffect(() => {
    const menus = () =>
      document.querySelectorAll<HTMLDetailsElement>(
        ".s-workspace-menu[open], .s-workspace .s-result-exports[open], .s-workspace .s-judge-actions[open], .s-workspace .s-result-decisions[open], .s-workspace .s-scoring-help[open]",
      );
    const outside = (event: PointerEvent) => {
      menus().forEach((menu) => {
        if (!menu.contains(event.target as Node)) menu.open = false;
      });
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape")
        menus().forEach((menu) => {
          const focused = menu.contains(document.activeElement);
          menu.open = false;
          if (focused) menu.querySelector("summary")?.focus();
        });
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const run: RunAction = async (data) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const v = await api<EventView>(`events/${id}`, data);
      if (data.action === "duplicate") {
        router.push(`/studio/${v.event.id}`);
        return;
      }
      await load();
      setNotice("Saved.");
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const fire = (data: Record<string, unknown>) => {
    run(data).catch(() => {});
  };
  if (!view)
    return (
      <Frame>
        <main className="s-container">
          <ErrorMessage message={error} />
          {!error ? (
            <p>Opening your event…</p>
          ) : (
            <Link href="/studio">Go to workspace ↗</Link>
          )}
        </main>
      </Frame>
    );
  const e = view.event;
  const ready = view.readiness.every((item) => item.ok);
  const select = (next: string) => {
    setTab(next);
    setFlowUrl(next);
    setError("");
    setNotice("");
  };
  const closeMenu = (target: HTMLElement) =>
    target.closest("details")?.removeAttribute("open");
  const shownTabs = management.includes(tab) ? [...tabs, tab] : tabs;
  return (
    <Frame
      className="s-workspace"
      label="Organizer"
      actions={<Link href="/studio">All hackathons ↗</Link>}
    >
      <main className="s-container s-workspace-main">
        <div className="s-workspace-heading">
          <div className="s-workspace-title">
            <h1 title={e.name}>{e.name}</h1>
            <span className={`s-tag s-stage-${e.stage}`}>{e.stage}</span>
          </div>
          <div className="s-workspace-tools">
            {view.actor.demo && (
              <details className="s-workspace-menu" name="workspace-tools">
                <summary className="s-tag">Demo</summary>
                <div className="s-workspace-menu-body">
                  <strong>Sample workspace</strong>
                  <p>
                    Try the full workflow with sample projects. The judge
                    password is <strong>judges</strong>.
                  </p>
                </div>
              </details>
            )}
            <details className="s-workspace-menu" name="workspace-tools">
              <summary className="s-button">Invite judges ↗</summary>
              <div className="s-workspace-menu-body s-share-menu">
                <strong>Share the judge link</strong>
                <p>
                  Judges use their name and the event password. Send the
                  password separately.
                </p>
                <input
                  aria-label="Judge link"
                  readOnly
                  value={
                    typeof window === "undefined"
                      ? `/events/${e.slug}`
                      : `${location.origin}/events/${e.slug}`
                  }
                  onFocus={(event) => event.target.select()}
                />
                <div className="s-actions">
                  <button
                    onClick={(event) => {
                      navigator.clipboard
                        .writeText(`${location.origin}/events/${e.slug}`)
                        .then(() => setNotice("Judge link copied."))
                        .catch(() =>
                          setError(
                            "Copy the judge link from the invitation menu.",
                          ),
                        );
                      closeMenu(event.currentTarget);
                    }}
                  >
                    Copy link
                  </button>
                  <Link href={`/events/${e.slug}`} target="_blank">
                    Open ↗
                  </Link>
                </div>
                <button
                  onClick={(event) => {
                    select("Judges");
                    closeMenu(event.currentTarget);
                  }}
                >
                  Manage judge roster →
                </button>
              </div>
            </details>
            <details className="s-workspace-menu" name="workspace-tools">
              <summary className="s-button" aria-label="More hackathon actions">
                •••
              </summary>
              <div className="s-workspace-menu-body">
                <strong>Hackathon details</strong>
                <p>{e.description || "No description added."}</p>
                <p>{formats[e.rules.template]}</p>
                <Link href={`/showcase/${e.slug}`} target="_blank">
                  Public project gallery ↗
                </Link>
                <button
                  onClick={(event) => {
                    select("Activity");
                    closeMenu(event.currentTarget);
                  }}
                >
                  Activity log
                </button>
                <button
                  disabled={busy}
                  onClick={(event) => {
                    closeMenu(event.currentTarget);
                    fire({ action: "duplicate" });
                  }}
                >
                  Duplicate settings
                </button>
                {e.stage === "published" && (
                  <button
                    disabled={busy}
                    onClick={(event) => {
                      closeMenu(event.currentTarget);
                      fire({ action: "archive" });
                    }}
                  >
                    Archive hackathon
                  </button>
                )}
              </div>
            </details>
            {e.stage === "draft" && (
              <button
                className="s-inverse"
                disabled={busy || !ready}
                title={
                  !ready ? "Complete the setup checklist first" : undefined
                }
                onClick={() => fire({ action: "ready" })}
              >
                Mark ready →
              </button>
            )}
            {e.stage === "ready" && (
              <button
                className="s-inverse"
                disabled={busy}
                onClick={() => fire({ action: "start" })}
              >
                Open first pass ↗
              </button>
            )}
          </div>
        </div>
        <div className="s-workspace-nav">
          <div className="s-tabs" role="tablist" aria-label="Event sections">
            {shownTabs.map((t) => (
              <button
                key={t}
                id={`workspace-tab-${t.replaceAll(" ", "-")}`}
                role="tab"
                aria-selected={tab === t}
                aria-controls="workspace-content"
                className={tab === t ? "s-tab-active" : ""}
                onClick={() => select(t)}
              >
                {t === "Top finalists" ? `Top ${e.rules.finalistCount}` : t}
                {t === "Projects" && <span>{view.projects.length}</span>}
              </button>
            ))}
          </div>
          <details
            className="s-workspace-menu s-manage-menu"
            name="workspace-tools"
          >
            <summary className="s-button">Manage ▾</summary>
            <div className="s-workspace-menu-body">
              {management.map((item) => (
                <button
                  key={item}
                  onClick={(event) => {
                    select(item);
                    closeMenu(event.currentTarget);
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </details>
          {notice && (
            <span className="s-workspace-feedback" role="status">
              {notice}
            </span>
          )}
        </div>
        <ErrorMessage message={error} />
        <div
          className={`s-workspace-pane${tab === "Dashboard" ? " s-overview-pane" : ""}`}
          role="tabpanel"
          id="workspace-content"
          aria-labelledby={`workspace-tab-${tab.replaceAll(" ", "-")}`}
          tabIndex={0}
        >
          {tab === "Dashboard" && <EventOverview view={view} select={select} />}
          {tabs.includes(tab) && tab !== "Dashboard" && (
            <EventFlow
              key={tab}
              view={view}
              section={tab as FlowSection}
              run={run}
              busy={busy}
              select={select}
            />
          )}
          {tab === "Projects" && (
            <ProjectImport view={view} run={run} busy={busy} />
          )}
          {tab === "Judges" && (
            <JudgeRoster view={view} run={run} busy={busy} />
          )}
          {tab === "Settings" && (
            <EventSettings view={view} run={run} busy={busy} />
          )}
          {tab === "Results" && (
            <EventResults view={view} run={run} busy={busy} />
          )}
          {tab === "Activity" && (
            <section>
              <div className="s-section-heading">
                <h2>Activity log</h2>
                <a
                  className="s-button"
                  href={`/api/studio/events/${id}/export?kind=audit`}
                >
                  Export activity ↓
                </a>
              </div>
              <div className="s-table-wrap">
                <table className="s-table">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Who</th>
                      <th>When</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.audit.map((item) => (
                      <tr key={item.id}>
                        <td>{item.action}</td>
                        <td>{item.actor}</td>
                        <td>{new Date(item.at).toLocaleString()}</td>
                        <td className="s-muted">{item.detail || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </main>
    </Frame>
  );
}
