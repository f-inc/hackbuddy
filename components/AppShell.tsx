"use client";

import { usePathname, useRouter } from "next/navigation";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/judging", label: "Judging", icon: "✓" },
  { href: "/results", label: "Results", icon: "≡" },
];

export function AppShell({
  children,
  name,
  role = "judge",
}: {
  children: React.ReactNode;
  name: string;
  role?: "judge" | "admin";
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="product-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span aria-hidden className="brand-mark small" />
          <span className="brand-wordmark">
            Hack<span>Buddy</span>
          </span>
        </div>

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
