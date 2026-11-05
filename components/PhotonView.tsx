"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "./AppShell";
import { LoadingScreen } from "./LoadingScreen";
import { SubmissionDetails } from "./SubmissionDetails";
import { usesPhoton, type PhotonSubmissionEntry } from "@/domain/photon";
import type { Submission } from "@/domain/submission";
import "./photon.css";

type Session = { name: string; role: "judge" | "admin"; hackathon?: string };

export function PhotonView({ hackathon, hackathonName, hackathonImageUrl, submissionId }: {
  hackathon: string;
  hackathonName: string;
  hackathonImageUrl?: string;
  submissionId?: string;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [submissions, setSubmissions] = useState<PhotonSubmissionEntry[]>([]);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const base = `/${hackathon}`;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      setSubmission(null);
      try {
        const auth = await fetch("/api/auth/session", { signal: controller.signal, cache: "no-store" });
        if (auth.status === 401) { window.location.assign(base); return; }
        if (!auth.ok) throw new Error("Your session could not be loaded.");
        const current = await auth.json() as Session;
        setSession(current);
        if (current.role === "judge" && current.hackathon !== hackathon) {
          window.location.assign(base);
          return;
        }
        const response = await fetch(`/api/hackathons/${hackathon}/${submissionId
          ? `submission?id=${encodeURIComponent(submissionId)}` : "photon"}`, {
          signal: controller.signal, cache: "no-store",
        });
        if (response.status === 401) { window.location.assign(base); return; }
        const result = await response.json() as {
          submissions?: PhotonSubmissionEntry[]; submission?: Submission; error?: string;
        };
        if (!response.ok) throw new Error(result.error || "Photon submissions could not be loaded.");
        if (submissionId) {
          if (!result.submission || !usesPhoton(result.submission)) {
            throw new Error("This submission does not list Photon in its tools used.");
          }
          setSubmission(result.submission);
        } else {
          setSubmissions(result.submissions ?? []);
        }
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Photon submissions could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [hackathon, base, submissionId, retry]);

  const filtered = submissions.filter((entry) =>
    `${entry.submitterNames} ${entry.teamName} ${entry.projectName} ${entry.oneLiner}`
      .toLowerCase().includes(search.trim().toLowerCase()),
  );

  if (loading) return <LoadingScreen />;

  return (
    <AppShell name={session?.name ?? ""} role={session?.role ?? "judge"}
      hackathon={hackathon} hackathonName={hackathonName} hackathonImageUrl={hackathonImageUrl}>
      <main className="workspace-main history-main">
        {submissionId && <Link className="history-back" href={`${base}/photon`}>← Photon submissions</Link>}
        <header className="history-heading">
          <div>
            <span className="eyebrow">Photon</span>
            <h1>{submissionId ? submission?.projectName || "Submission" : "Built with Photon"}</h1>
            <p>{submissionId ? "The full project submission." : "Meet the builders who listed Photon in their tools used."}</p>
          </div>
          <span className="history-event-label">{hackathonName}</span>
        </header>
        {error ? (
          <section className="history-empty card" role="alert">
            <h2>We couldn’t load this view</h2><p>{error}</p>
            <button className="button secondary" type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button>
          </section>
        ) : submission ? <SubmissionDetails submission={submission} /> : (
          <>
            <div className="history-tools">
              <p>{filtered.length} {filtered.length === 1 ? "submission" : "submissions"}{search ? ` of ${submissions.length}` : ""}</p>
              <input aria-label="Search Photon submissions" placeholder="Search builders or projects…" type="search"
                value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            {filtered.length ? (
              <div className="photon-grid">
                {filtered.map((entry) => (
                  <Link key={entry.id} className="photon-entry" href={`${base}/photon/${encodeURIComponent(entry.id)}`}>
                    <span className="photon-label">Photon</span>
                    <h2>{entry.projectName}</h2>
                    <p className="photon-builders">{entry.submitterNames || entry.teamName}</p>
                    {entry.submitterNames && entry.submitterNames !== entry.teamName && <p>{entry.teamName}</p>}
                    <p>{entry.oneLiner || "Open the submission to explore this project."}</p>
                    <span className="photon-open">View full submission <span aria-hidden>↗</span></span>
                  </Link>
                ))}
              </div>
            ) : <section className="history-empty card">
              <h2>{search ? "No matching submissions" : "No Photon submissions yet"}</h2>
              <p>{search ? "Try another builder or project name." : "Submissions that list Photon in Tools Used will appear here, at any judging stage."}</p>
            </section>}
          </>
        )}
      </main>
    </AppShell>
  );
}
