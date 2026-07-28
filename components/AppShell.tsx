"use client";

import { JUDGING_POLICY } from "@/domain/judging-policy";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const eventNavigation = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/judging", label: "Judging", icon: "✓" },
  { href: "/results", label: "Results", icon: "≡" },
  {
    href: "/leaderboard",
    label: `Top ${JUDGING_POLICY.finals.finalistCount}`,
    icon: "★",
  },
];

export function AppShell({
  children,
  name,
  role = "judge",
  hackathon,
  hackathonName,
  hackathonImageUrl,
}: {
  children: React.ReactNode;
  name: string;
  role?: "judge" | "admin";
  hackathon?: string;
  hackathonName?: string;
  hackathonImageUrl?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const navigation = [
    ...(hackathon
      ? eventNavigation.map((item) => ({
          ...item,
          href: `/${hackathon}${item.href}`,
        }))
      : []),
  ];

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push(hackathon ? `/${hackathon}` : "/");
    router.refresh();
  }

  const eventIdentityContent = hackathonName ? (
    <>
      <span
        aria-hidden
        className={`sidebar-event-image${
          hackathonImageUrl ? "" : " fallback"
        }`}
        style={
          hackathonImageUrl
            ? { backgroundImage: `url("${hackathonImageUrl}")` }
            : undefined
        }
      >
        {!hackathonImageUrl && hackathonName.slice(0, 1).toUpperCase()}
      </span>
      <span className="sidebar-event-copy">
        <small>
          <span className="event-label-current">Current event</span>
          {role === "admin" && (
            <span className="event-label-switch">Other hackathons</span>
          )}
        </small>
        <strong>{hackathonName}</strong>
      </span>
      {role === "admin" && (
        <span aria-hidden className="sidebar-event-switch-arrow">
          →
        </span>
      )}
    </>
  ) : null;

  return (
    <div className="product-shell">
      <aside className="sidebar">
        <div className="sidebar-brand-stack">
          <div className="sidebar-brand">
            <span aria-hidden className="brand-mark small" />
            <span className="brand-wordmark">
              Hack<span>Buddy</span>
            </span>
          </div>
          {hackathonName && role === "admin" ? (
            <Link
              aria-label={`View other hackathons. Current event: ${hackathonName}`}
              className="sidebar-event-identity is-switcher"
              href="/hackathons"
            >
              {eventIdentityContent}
            </Link>
          ) : hackathonName ? (
            <div
              aria-label={`Current event: ${hackathonName}`}
              className="sidebar-event-identity"
            >
              {eventIdentityContent}
            </div>
          ) : null}
        </div>

        {navigation.length > 0 && (
          <nav className="sidebar-nav" aria-label="Main navigation">
            <span className="nav-label">Workspace</span>
            {navigation.map((item) => (
              <a
                className={pathname === item.href ? "active" : ""}
                href={item.href}
                key={item.href}
              >
                <span className="nav-icon" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </a>
            ))}
          </nav>
        )}

        <div className="sidebar-account">
          <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{name}</strong>
            <span>{role === "admin" ? "Administrator" : "Judge"}</span>
          </div>
          <button aria-label="Sign out" onClick={logout} type="button">
            ↗
          </button>
        </div>
      </aside>

      <div className="product-content">
        <header className="mobile-header">
          <div className="sidebar-brand">
            <span aria-hidden className="brand-mark small" />
            <span className="brand-wordmark">
              Hack<span>Buddy</span>
            </span>
          </div>
          <nav>
            {navigation.map((item) => (
              <a
                className={pathname === item.href ? "active" : ""}
                href={item.href}
                key={item.href}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
}
