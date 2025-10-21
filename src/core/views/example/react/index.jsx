import React from "react";
import { Routes, Route, useParams, StaticRouter } from "react-router";
import { BrowserRouter, Link } from "react-router-dom";

const BASENAME = "/example/react";

const colors = {
  bg: "var(--color-bg-secondary)",
  surface: "var(--color-surface)",
  border: "var(--color-border-primary)",
  muted: "var(--color-bg-muted)",
  textPrimary: "var(--color-text-primary)",
  textSecondary: "var(--color-text-secondary)",
  textMuted: "var(--color-text-muted)",
  accent: "var(--color-accent)",
  primary: "var(--color-primary)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
};

const radii = {
  m: "var(--radius-m)",
  l: "var(--radius-l)",
  pill: "var(--radius-round)",
};

const shadows = {
  s: "var(--shadow-s)",
  m: "var(--shadow-m)",
};

const layoutStyles = {
  minHeight: "100vh",
  margin: 0,
  fontFamily: "var(--font-sans)",
  backgroundColor: colors.bg,
  color: colors.textPrimary,
};

const shellStyles = {
  maxWidth: "960px",
  margin: "0 auto",
  padding: "clamp(1.5rem, 3vw, 3rem)",
  display: "flex",
  flexDirection: "column",
  gap: "clamp(1.5rem, 3vw, 2.75rem)",
};

const headerStyles = {
  display: "flex",
  flexDirection: "column",
  gap: "clamp(1rem, 2vw, 1.5rem)",
};

const navStyles = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.75rem",
};

const linkStyles = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
  padding: "0.65rem 1.1rem",
  borderRadius: radii.pill,
  textDecoration: "none",
  color: colors.textPrimary,
  background: colors.muted,
  border: `1px solid ${colors.border}`,
  transition: `all var(--transition-base) var(--transition-easing-standard)`,
};

const linkActiveStyles = {
  background: `linear-gradient(135deg, ${colors.accent} 0%, ${colors.primary} 100%)`,
  boxShadow: shadows.s,
  color: "#ffffff",
  borderColor: "transparent",
};

const boardGridStyles = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "clamp(1.2rem, 2.5vw, 2rem)",
};

const boardCardStyles = {
  background: colors.surface,
  borderRadius: radii.l,
  padding: "clamp(1.5rem, 2.5vw, 2rem)",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  border: `1px solid ${colors.border}`,
  boxShadow: shadows.s,
};

const boardFooterStyles = {
  marginTop: "auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  fontSize: "0.9rem",
};

const badgeStyles = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  padding: "0.45rem 0.85rem",
  borderRadius: radii.pill,
  background: colors.muted,
  color: colors.textPrimary,
  border: `1px solid ${colors.border}`,
  fontSize: "0.85rem",
};

const statusColor = (status) => {
  switch (status) {
    case "On Track":
      return colors.success;
    case "At Risk":
      return colors.warning;
    case "Blocked":
      return colors.danger;
    default:
      return "transparent";
  }
};

const boards = [
  {
    id: "123",
    title: "Product Launch",
    summary: "Cross-functional board tracking the launch roadmap.",
    status: "On Track",
    metric: "42 active cards",
    href: "/board/123",
    accent: colors.accent,
  },
  {
    id: "marketing",
    title: "Marketing Funnel Revamp",
    summary: "Campaign experiments, copy drafts, and KPI tracking.",
    status: "At Risk",
    metric: "5 blockers",
    href: "/board/marketing",
    accent: colors.warning,
  },
  {
    id: "ops",
    title: "Operations",
    summary: "Hiring pipeline, vendor management, and operations OKRs.",
    status: "On Track",
    metric: "21 open tasks",
    href: "/board/ops",
    accent: colors.success,
  },
];

function Home() {
  return (
    <section
      style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}
    >
      <header
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <h2 style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)", margin: 0 }}>
          Your Kanban Boards
        </h2>
        <p
          style={{
            margin: 0,
            maxWidth: "540px",
            color: colors.textSecondary,
            lineHeight: 1.6,
          }}
        >
          Keep track of priorities, surface blockers early, and give your team a
          calm overview of the work that matters most.
        </p>
      </header>

      <div style={boardGridStyles}>
        {boards.map((board) => {
          const statusBg = statusColor(board.status);
          const semantic = statusBg !== "transparent";

          return (
            <article key={board.id} style={boardCardStyles}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: "52px",
                    height: "3px",
                    borderRadius: "999px",
                    background: board.accent,
                  }}
                />
                <h3
                  style={{
                    margin: 0,
                    fontSize: "clamp(1.2rem, 2vw, 1.5rem)",
                  }}
                >
                  {board.title}
                </h3>
                <p
                  style={{
                    margin: 0,
                    color: colors.textMuted,
                    lineHeight: 1.5,
                  }}
                >
                  {board.summary}
                </p>
              </div>

              <div style={boardFooterStyles}>
                <span
                  style={{
                    ...badgeStyles,
                    background: semantic ? statusBg : colors.muted,
                    border: `1px solid ${semantic ? statusBg : colors.border}`,
                    color: semantic ? "#ffffff" : colors.textPrimary,
                    fontWeight: 600,
                  }}
                >
                  {board.status}
                </span>
                <span
                  style={{
                    ...badgeStyles,
                    fontSize: "0.8rem",
                    color: colors.textSecondary,
                  }}
                >
                  {board.metric}
                </span>
              </div>

              <Link
                to={board.href}
                style={{
                  ...linkStyles,
                  justifyContent: "center",
                  marginTop: "1rem",
                }}
              >
                View board
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Board() {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "clamp(1.6rem, 2.5vw, 2rem)" }}>
          Board Overview
        </h2>
        <p
          style={{
            margin: 0,
            maxWidth: "520px",
            color: colors.textSecondary,
            lineHeight: 1.6,
          }}
        >
          Explore the columns, identify bottlenecks, and inspire focus. Add a
          Note about how your real board works here.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "1.25rem",
        }}
      >
        {["Backlog", "In Progress", "Review", "Done"].map((column) => (
          <article key={column} style={boardCardStyles}>
            <header
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.35rem",
              }}
            >
              <h3 style={{ margin: 0 }}>{column}</h3>
              <span style={{ color: colors.textMuted, fontSize: "0.85rem" }}>
                0 cards
              </span>
            </header>
            <p style={{ margin: 0, color: colors.textMuted }}>
              Populate this column with sample data to showcase interactions.
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function BoardById() {
  const { id } = useParams();

  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "clamp(1rem, 2vw, 1.75rem)",
      }}
    >
      <header
        style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}
      >
        <h2 style={{ margin: 0, fontSize: "clamp(1.75rem, 3vw, 2.25rem)" }}>
          Board {id}
        </h2>
        <p style={{ margin: 0, color: colors.textMuted }}>
          Use this route to demo parameters, routing transitions, or fetch data
          for board{" "}
          <code
            style={{
              color: colors.accent,
              fontFamily: "var(--font-mono)",
            }}
          >
            {id}
          </code>
          .
        </p>
      </header>

      <div style={{ display: "grid", gap: "clamp(1rem, 2vw, 1.5rem)" }}>
        {[
          {
            title: "Key Metrics",
            description:
              "Highlight counts, velocity, or workloads from your API.",
          },
          {
            title: "Recent Activity",
            description:
              "Render actual activity (server-side) or hydrate with client data.",
          },
          {
            title: "Team Notes",
            description:
              "Add collaborative context—this is where comments can live.",
          },
        ].map((panel) => (
          <article
            key={panel.title}
            style={{
              ...boardCardStyles,
              borderRadius: "16px",
              padding: "1.35rem 1.6rem",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "1.1rem" }}>{panel.title}</h3>
            <p style={{ margin: "0.35rem 0 0", color: colors.textMuted }}>
              {panel.description}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Layout({ children }) {
  return (
    <div style={layoutStyles}>
      <main style={shellStyles}>{children}</main>
    </div>
  );
}

function AppShell({ children }) {
  return (
    <Layout>
      <header style={headerStyles}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(2rem, 4vw, 2.75rem)",
                letterSpacing: "-0.015em",
              }}
            >
              Sovereign Kanban
            </h1>
            <p
              style={{
                margin: "0.35rem 0 0",
                color: colors.textSecondary,
                maxWidth: "560px",
              }}
            >
              A polished playground to showcase React SSR + hydration alongside
              the Sovereign Handlebars stack.
            </p>
          </div>
        </div>

        <nav style={navStyles} aria-label="Application">
          <PrimaryLink href="/">Dashboard</PrimaryLink>
          <PrimaryLink href="/board">Board overview</PrimaryLink>
          <PrimaryLink href="/board/123" highlight>
            Board 123
          </PrimaryLink>
          <PrimaryLink href="/board/ops">Ops</PrimaryLink>
        </nav>
      </header>

      <section
        style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}
      >
        {children}
      </section>
    </Layout>
  );
}

function PrimaryLink({ href, highlight = false, children }) {
  return (
    <Link
      to={href}
      style={{
        ...linkStyles,
        ...(highlight ? linkActiveStyles : {}),
      }}
      aria-current={highlight ? "page" : undefined}
    >
      {children}
    </Link>
  );
}

export default function KanbanApp({ url }) {
  const isServer = typeof window === "undefined";

  const content = (
    <AppShell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/board" element={<Board />} />
        <Route path="/board/:id" element={<BoardById />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
  );

  if (isServer) {
    return (
      <StaticRouter location={url} basename={BASENAME}>
        {content}
      </StaticRouter>
    );
  }

  return <BrowserRouter basename={BASENAME}>{content}</BrowserRouter>;
}

function NotFound() {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: "1.25rem",
        padding: "clamp(2rem, 4vw, 3rem)",
        borderRadius: "24px",
        border: `1px solid ${colors.border}`,
        background: colors.surface,
        boxShadow: shadows.s,
      }}
    >
      <h2 style={{ margin: 0, fontSize: "clamp(1.75rem, 3vw, 2.35rem)" }}>
        Coming soon
      </h2>
      <p
        style={{
          margin: 0,
          maxWidth: "420px",
          color: colors.textSecondary,
        }}
      >
        Feeling adventurous? Extend this demo by adding dynamic data, persisted
        cards, or team activity streams. React views can mix SSR and client
        renders freely.
      </p>
      <PrimaryLink href="/" highlight>
        Back to dashboard
      </PrimaryLink>
    </section>
  );
}
