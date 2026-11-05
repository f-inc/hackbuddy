"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "./AppShell";
import { LoadingScreen } from "./LoadingScreen";
import { SubmissionDetails } from "./SubmissionDetails";
import { matchesCollection } from "@/domain/event-settings";
import { useEventSettings } from "./EventConfig";
type ProjectEntry = Pick<
  Submission,
  "id" | "projectName" | "teamName" | "submitterNames" | "oneLiner" | "track" | "toolsUsed"
>;
import type { Submission } from "@/domain/submission";
import "./photon.css";

type Session = { name: string; role: "judge" | "admin"; hackathon?: string };

export function ProjectsView({
  hackathon,
  hackathonName,
  hackathonImageUrl,
  submissionId,
  collectionId = "",
}: {
  hackathon: string;
  hackathonName: string;
  hackathonImageUrl?: string;
  submissionId?: string;
  collectionId?: string;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [submissions, setSubmissions] = useState<ProjectEntry[]>([]);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const base = `/${hackathon}`;
  const settings = useEventSettings();
  const collection = settings.collections.find((c) => c.id === collectionId);
  const title = collection?.name || "Projects";

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      setSubmission(null);
      try {
        const auth = await fetch("/api/auth/session", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (auth.status === 401) {
          window.location.assign(base);
          return;
        }
        if (!auth.ok) throw new Error("Your session could not be loaded.");
        const current = (await auth.json()) as Session;
        setSession(current);
        if (current.role === "judge" && current.hackathon !== hackathon) {
          window.location.assign(base);
          return;
        }
        const response = await fetch(
          `/api/hackathons/${hackathon}/${
            submissionId ? `submission?id=${encodeURIComponent(submissionId)}` : "projects"
          }`,
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );
        if (response.status === 401) {
          window.location.assign(base);
          return;
        }
        const result = (await response.json()) as {
          submissions?: ProjectEntry[];
          submission?: Submission;
          error?: string;
        };
        if (!response.ok) throw new Error(result.error || "Projects could not be loaded.");
        if (submissionId) {
          if (!result.submission) {
            throw new Error("Submission not found.");
          }
          setSubmission(result.submission);
        } else {
          setSubmissions(result.submissions ?? []);
        }
      } catch (caught) {
        if (!controller.signal.aborted)
          setError(caught instanceof Error ? caught.message : "Projects could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [hackathon, base, submissionId, retry]);

  const filtered = submissions
    .filter((entry) => !collection || matchesCollection(entry, collection))
    .filter((entry) =>
      `${entry.submitterNames} ${entry.teamName} ${entry.projectName} ${entry.oneLiner}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    );

  if (loading) return <LoadingScreen />;

  return (
    <AppShell
      name={session?.name ?? ""}
      role={session?.role ?? "judge"}
      activeCollection={collectionId}
      hackathon={hackathon}
      hackathonName={hackathonName}
      hackathonImageUrl={hackathonImageUrl}
    >
      <main className="workspace-main history-main">
        {submissionId && (
          <Link className="history-back" href={`${base}/projects`}>
            ← Projects
          </Link>
        )}
        <header className="history-heading">
          <div>
            <span className="eyebrow">{title}</span>
            <h1>{submissionId ? submission?.projectName || "Submission" : title}</h1>
            <p>
              {submissionId
                ? "The full project submission."
                : collection?.prize || "Explore project submissions."}
            </p>
          </div>
          <span className="history-event-label">{hackathonName}</span>
          {session?.role === "admin" && (
            <a
              className="secondary-button"
              href={
                submissionId
                  ? `${base}/submit?id=${encodeURIComponent(submissionId)}`
                  : `${base}/submit`
              }
            >
              {submissionId ? "Edit submission" : "Add project"}
            </a>
          )}
        </header>
        {error ? (
          <section className="history-empty card" role="alert">
            <h2>We couldn’t load this view</h2>
            <p>{error}</p>
            <button
              className="button secondary"
              type="button"
              onClick={() => setRetry((value) => value + 1)}
            >
              Try again
            </button>
          </section>
        ) : submission ? (
          <SubmissionDetails submission={submission} />
        ) : (
          <>
            <div className="history-tools">
              <p>
                {filtered.length} {filtered.length === 1 ? "submission" : "submissions"}
                {search ? ` of ${submissions.length}` : ""}
              </p>
              <input
                aria-label="Search projects"
                placeholder="Search builders or projects…"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            {filtered.length ? (
              <div className="photon-grid">
                {filtered.map((entry) => (
                  <Link
                    key={entry.id}
                    className="photon-entry"
                    href={`${base}/projects/${encodeURIComponent(entry.id)}`}
                  >
                    <span className="photon-label">{entry.track || title}</span>
                    <h2>{entry.projectName}</h2>
                    <p className="photon-builders">{entry.submitterNames || entry.teamName}</p>
                    {entry.submitterNames && entry.submitterNames !== entry.teamName && (
                      <p>{entry.teamName}</p>
                    )}
                    <p>{entry.oneLiner || "Open the submission to explore this project."}</p>
                    <span className="photon-open">
                      View full submission <span aria-hidden>↗</span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <section className="history-empty card">
                <h2>{search ? "No matching submissions" : "No projects yet"}</h2>
                <p>
                  {search
                    ? "Try another builder or project name."
                    : "Matching project submissions will appear here."}
                </p>
              </section>
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}
