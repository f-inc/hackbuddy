"use client";

import { JUDGING_POLICY } from "@/domain/judging-policy";
import Link from "next/link";
import "./mobile-navigation.css";
import { usePathname, useRouter } from "next/navigation";

const eventNavigation = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/judging", label: "First pass judging", icon: "✓" },
  {
    href: "/leaderboard",
    label: `Top ${JUDGING_POLICY.finals.finalistCount}`,
    icon: "★",
  },
  { href: "/second-pass", label: "Second pass judging", icon: "◷" },
  { href: "/winners", label: "Winners", icon: "♛" },
  { href: "/results", label: "Results", icon: "≡" },
  { href: "/photon", label: "Photon", icon: "✦" },
  { href: "/judged", label: "Projects judged", icon: "▤" },
];

function MobileTabIcon({ route }: { route: string }) {
  const paths: Record<string, string> = {
    judging: "m5 12 4 4L19 6",
    leaderboard:
      "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z",
    "second-pass": "M8 5H5v14h14V5h-3M9 3h6v4H9V3Zm-1 9 2 2 5-5",
    winners:
      "M8 4h8v4a4 4 0 0 1-8 0V4Zm0 2H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 0v5m-4 3h8m-6-3h4",
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[route]} />
    </svg>
  );
}

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

  const primaryRoutes = new Set([
    "judging",
    "leaderboard",
    "second-pass",
    "winners",
  ]);
  const primaryNavigation = navigation.filter((item) =>
    primaryRoutes.has(item.href.split("/").at(-1)!),
  );
  const otherNavigation = navigation.filter(
    (item) => !primaryRoutes.has(item.href.split("/").at(-1)!),
  );
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push(hackathon ? `/${hackathon}` : "/");
    router.refresh();
  }

  const eventIdentityContent = hackathonName ? (
    <>
      <span
        aria-hidden
        className={`sidebar-event-image${hackathonImageUrl ? "" : " fallback"}`}
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
                aria-current={
                  pathname === item.href || pathname.startsWith(`${item.href}/`)
                    ? "page"
                    : undefined
                }
                className={
                  pathname === item.href || pathname.startsWith(`${item.href}/`)
                    ? "active"
                    : ""
                }
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
          <div className="mobile-event-brand">
            <div className="sidebar-brand">
              <span aria-hidden className="brand-mark small" />
              <span className="brand-wordmark">
                Hack<span>Buddy</span>
              </span>
            </div>
            {hackathonName && (
              <span className="mobile-event-name">{hackathonName}</span>
            )}
          </div>
          <button
            className="mobile-menu-trigger"
            popoverTarget="mobile-workspace-menu"
            type="button"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            Menu
          </button>
        </header>
        <div
          className="mobile-workspace-menu"
          id="mobile-workspace-menu"
          popover="auto"
        >
          <div className="mobile-menu-heading">
            <span>Workspace</span>
            <button
              type="button"
              popoverTarget="mobile-workspace-menu"
              popoverTargetAction="hide"
              aria-label="Close menu"
            >
              ×
            </button>
          </div>
          <nav aria-label="Other views">
            {otherNavigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </a>
            ))}
            {role === "admin" && (
              <Link href="/hackathons">
                <span aria-hidden="true">↗</span>Switch event
              </Link>
            )}
          </nav>
          <div className="mobile-menu-account">
            <span>
              <strong>{name}</strong>
              <small>{role === "admin" ? "Administrator" : "Judge"}</small>
            </span>
            <button type="button" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>
        {primaryNavigation.length > 0 && (
          <nav className="mobile-tab-bar" aria-label="Judging tabs">
            {primaryNavigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
              >
                <span className="mobile-tab-icon">
                  <MobileTabIcon route={item.href.split("/").at(-1)!} />
                </span>
                <span>{item.label}</span>
              </a>
            ))}
          </nav>
        )}
        {children}
      </div>
    </div>
  );
}
