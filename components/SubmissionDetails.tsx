"use client";

import type { Submission } from "@/lib/types";
import { useEffect, useState } from "react";

function formatSubmitted(value: string) {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function externalUrl(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function repositoryDetails(value: string) {
  try {
    const url = new URL(value);
    const path = decodeURIComponent(url.pathname)
      .replace(/^\/|\/$/g, "")
      .replace(/\.git$/i, "");
    return {
      label: path || url.hostname,
    };
  } catch {
    return { label: value };
  }
}

type SubmissionDetailData = Pick<
  Submission,
  | "files"
  | "importedFields"
  | "liveDemoUrl"
  | "projectName"
  | "teamName"
  | "teamNumber"
  | "repositoryUrl"
  | "demoType"
  | "demoUrl"
  | "demoVideoUrl"
  | "previewImageUrl"
  | "oneLiner"
  | "description"
  | "progressOutline"
  | "toolsUsed"
  | "teamPhotoUrl"
  | "submitterNames"
  | "attendance"
  | "createdAt"
  | "contactEmail"
>;
export function SubmissionDetails({ submission }: { submission: SubmissionDetailData }) {
  const [showTeamPhoto, setShowTeamPhoto] = useState(false);
  const repositoryUrl = submission.repositoryUrl ? externalUrl(submission.repositoryUrl) : "";
  const repository = repositoryUrl ? repositoryDetails(repositoryUrl) : null;
  const isVideo =
    submission.demoType.startsWith("video/") ||
    Boolean(submission.demoUrl.match(/\.(mp4|webm|mov)(?:\?|$)/i));

  useEffect(() => {
    if (!showTeamPhoto) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setShowTeamPhoto(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [showTeamPhoto]);

  return (
    <>
      <article aria-label="Submission details" className="project-workspace card" tabIndex={0}>
        <header className="project-header">
          <div>
            <div className="project-title-row">
              <h2>{submission.projectName}</h2>
              {repositoryUrl && repository && (
                <a
                  aria-label={`Open ${repository.label} on GitHub`}
                  className="repository-mini-card"
                  href={repositoryUrl}
                  rel="noreferrer"
                  target="_blank"
                  title={repository.label}
                >
                  <span aria-hidden className="repository-mini-icon github-icon" />
                  <span>GitHub</span>
                  <span aria-hidden>↗</span>
                </a>
              )}
            </div>
            <p className="project-byline">by {submission.teamName}</p>
          </div>
        </header>

        <section className="media-stage">
          {isVideo && submission.demoUrl ? (
            <video
              autoPlay
              controls
              loop
              muted
              playsInline
              poster={submission.previewImageUrl || undefined}
              preload="metadata"
              src={submission.demoUrl}
            >
              Your browser does not support embedded video.
            </video>
          ) : submission.previewImageUrl ? (
            <div
              className="media-image"
              style={{
                backgroundImage: `url("${submission.previewImageUrl}")`,
              }}
            />
          ) : (
            <div className="media-placeholder">
              <span>
                {submission.demoUrl
                  ? "Watch the demo using the link below"
                  : "No media preview submitted"}
              </span>
            </div>
          )}

          <div className="media-actions">
            {submission.liveDemoUrl && (
              <a href={externalUrl(submission.liveDemoUrl)} rel="noreferrer" target="_blank">
                Open live demo ↗
              </a>
            )}
            {submission.demoUrl && submission.demoUrl !== submission.demoVideoUrl && (
              <a href={externalUrl(submission.demoUrl)} rel="noreferrer" target="_blank">
                Open uploaded demo video ↗
              </a>
            )}
            {submission.demoVideoUrl && (
              <a href={externalUrl(submission.demoVideoUrl)} rel="noreferrer" target="_blank">
                Watch submitted video link ↗
              </a>
            )}
            {submission.previewImageUrl && (
              <a href={submission.previewImageUrl} rel="noreferrer" target="_blank">
                Progress image ↗
              </a>
            )}
          </div>
        </section>

        <section className="submission-story">
          <div className="story-block one-liner-block">
            <p>{submission.oneLiner || "No one-line description was provided."}</p>
          </div>
          {submission.description &&
            submission.description.trim() !== submission.oneLiner.trim() && (
              <div className="story-block">
                <span>Project description</span>
                <p>{submission.description}</p>
              </div>
            )}
          {submission.progressOutline && (
            <div className="story-block">
              <span>Progress outline</span>
              <p>{submission.progressOutline}</p>
            </div>
          )}
          {Boolean(submission.toolsUsed?.length) && (
            <div className="story-block">
              <span>Tools used</span>
              <p>{submission.toolsUsed!.join(", ")}</p>
            </div>
          )}
        </section>

        <section className="submission-details">
          {submission.teamNumber && (
            <div className="detail-item">
              <div><span>Team number</span><p>{submission.teamNumber}</p></div>
            </div>
          )}
          <div className="detail-item builders">
            {submission.teamPhotoUrl ? (
              <button
                aria-label={`Enlarge photo of ${submission.submitterNames || submission.teamName}`}
                className="team-photo"
                onClick={() => setShowTeamPhoto(true)}
                style={{
                  backgroundImage: `url("${submission.teamPhotoUrl}")`,
                }}
                type="button"
              />
            ) : (
              <span className="detail-icon">◎</span>
            )}
            <div>
              <span>Builders</span>
              <strong>{submission.submitterNames || submission.teamName}</strong>
            </div>
          </div>
          <div className="detail-item">
            <span className="detail-icon">⌂</span>
            <div>
              <span>Demo attendance</span>
              <strong>{submission.attendance || "Not provided"}</strong>
            </div>
          </div>
          <div className="detail-item">
            <span className="detail-icon">◷</span>
            <div>
              <span>Submitted</span>
              <strong>{formatSubmitted(submission.createdAt)}</strong>
            </div>
          </div>
          <div className="detail-item">
            <span className="detail-icon">@</span>
            <div>
              <span>Contact</span>
              {submission.contactEmail ? (
                <a href={`mailto:${submission.contactEmail}`}>{submission.contactEmail}</a>
              ) : (
                <strong>Not provided</strong>
              )}
            </div>
          </div>
        </section>
        {Boolean(submission.files?.length) && (
          <details className="story-block" style={{ margin: "0 24px 20px" }}>
            <summary>All submitted files ({submission.files!.length})</summary>
            <ul>
              {submission.files!.map((file) => (
                <li key={file.id}>
                  <a href={file.url} target="_blank" rel="noreferrer">
                    {file.filename}
                  </a>{" "}
                  <small>{file.field}</small>
                </li>
              ))}
            </ul>
          </details>
        )}
        {submission.importedFields && (
          <details className="story-block" style={{ margin: "0 24px 20px" }}>
            <summary>Original submission fields</summary>
            <dl>
              {Object.entries(submission.importedFields).map(([name, value]) => (
                <div key={name} style={{ marginTop: 12 }}>
                  <dt>{name}</dt>
                  <dd style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {typeof value === "string" || typeof value === "number"
                      ? String(value)
                      : JSON.stringify(value, null, 2)}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </article>

      {showTeamPhoto && submission.teamPhotoUrl && (
        <div
          aria-label="Builder photo preview"
          aria-modal="true"
          className="photo-modal"
          onClick={() => setShowTeamPhoto(false)}
          role="dialog"
        >
          <div className="photo-modal-content" onClick={(event) => event.stopPropagation()}>
            <button
              aria-label="Close photo"
              className="photo-modal-close"
              onClick={() => setShowTeamPhoto(false)}
              type="button"
            >
              ×
            </button>
            <div
              aria-label={`Builders: ${submission.submitterNames || submission.teamName}`}
              className="photo-modal-image"
              role="img"
              style={{
                backgroundImage: `url("${submission.teamPhotoUrl}")`,
              }}
            />
            <div className="photo-modal-caption">
              <span>Builders</span>
              <strong>{submission.submitterNames || submission.teamName}</strong>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
