"use client";
/* eslint-disable @next/next/no-img-element -- Event artwork is supplied by organizers from arbitrary hosts; avoid an image proxy allowlist. */
import Link from "next/link";
import type { ReactNode } from "react";
export async function api<T>(path: string, data?: unknown): Promise<T> {
  const res = await fetch(`/api/studio/${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
    cache: "no-store",
  });
  const value = await res.json();
  if (!res.ok)
    throw new Error(value.error || "Something went wrong. Try again.");
  return value as T;
}
export const formats = {
  single: "One scored round",
  "scored-final": "Scores + scored final",
  "ranked-final": "Scores + ranked final",
};
export function Frame({
  children,
  label = "Event studio",
  actions,
}: {
  children: ReactNode;
  label?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="studio">
      <header className="s-header">
        <Link href="/studio" className="s-brand">
          <span className="s-mark">h.</span> HackBuddy{" "}
          <span className="s-muted">/ {label}</span>
        </Link>
        <div className="s-actions">{actions}</div>
      </header>
      {children}
      <footer className="s-footer">
        <span>Good ideas deserve a good stage.</span>
        <Link href="/hackathons">Original hackathon workspace ↗</Link>
      </footer>
    </div>
  );
}
export function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <div className="s-alert" role="alert">
      {message}
    </div>
  ) : null;
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="s-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Empty({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <div className="s-empty">
      <span className="s-empty-symbol">✳</span>
      <h3>{title}</h3>
      <p>{detail}</p>
      {children}
    </div>
  );
}
export function Progress({ value, max }: { value: number; max: number }) {
  return (
    <div
      className="s-progress"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max || 1}
    >
      <span
        style={{ width: `${Math.min(100, (value / (max || 1)) * 100)}%` }}
      />
    </div>
  );
}
export function ProjectIcon({ name, image }: { name: string; image?: string }) {
  return image ? (
    <span className="s-project-icon">
      <img
        src={image}
        alt=""
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    </span>
  ) : (
    <span className="s-project-icon">{name.slice(0, 1).toUpperCase()}</span>
  );
}

export function judgeApi<T>(path: string, data?: unknown) {
  return api<T>(path + "?as=judge", data);
}
