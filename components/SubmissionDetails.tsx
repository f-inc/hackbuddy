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

export function SubmissionDetails({
  submission,
}: {
  submission: Submission;
}) {
  const [showTeamPhoto, setShowTeamPhoto] = useState(false);
  const repositoryUrl = submission.repositoryUrl
    ? externalUrl(submission.repositoryUrl)
    : "";
  const repository = repositoryUrl
    ? repositoryDetails(repositoryUrl)
    : null;
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
      <article
        aria-label="Submission details"
        className="project-workspace card"
        tabIndex={0}
      >
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
                  <span
                    aria-hidden
                    className="repository-mini-icon github-icon"
                  />
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
              <span>No media preview submitted</span>
            </div>
          )}

          <div className="media-actions">
            {submission.previewImageUrl && (
              <a
                href={submission.previewImageUrl}
                rel="noreferrer"
                target="_blank"
              >
                Progress image ↗
              </a>
            )}
          </div>
        </section>

        <section className="submission-story">
          <div className="story-block one-liner-block">
            <p>
              {submission.oneLiner ||
                "No one-line description was provided."}
            </p>
          </div>
          {submission.description &&
            submission.description.trim() !== submission.oneLiner.trim() && (
              <div className="story-block">
                <span>Project description</span>
                <p>{submission.description}</p>
              </div>
            )}
        </section>

        <section className="submission-details">
          <div className="detail-item builders">
            {submission.teamPhotoUrl ? (
              <button
                aria-label={`Enlarge photo of ${
                  submission.submitterNames || submission.teamName
                }`}
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
              <strong>
                {submission.submitterNames || submission.teamName}
              </strong>
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
                <a href={`mailto:${submission.contactEmail}`}>
                  {submission.contactEmail}
                </a>
              ) : (
                <strong>Not provided</strong>
              )}
            </div>
          </div>
        </section>
      </article>

      {showTeamPhoto && submission.teamPhotoUrl && (
        <div
          aria-label="Builder photo preview"
          aria-modal="true"
          className="photo-modal"
          onClick={() => setShowTeamPhoto(false)}
          role="dialog"
        >
          <div
            className="photo-modal-content"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              aria-label="Close photo"
              className="photo-modal-close"
              onClick={() => setShowTeamPhoto(false)}
              type="button"
            >
              ×
            </button>
            <div
              aria-label={`Builders: ${
                submission.submitterNames || submission.teamName
              }`}
              className="photo-modal-image"
              role="img"
              style={{
                backgroundImage: `url("${submission.teamPhotoUrl}")`,
              }}
            />
            <div className="photo-modal-caption">
              <span>Builders</span>
              <strong>
                {submission.submitterNames || submission.teamName}
              </strong>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
