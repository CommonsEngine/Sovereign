import React from "react";
import { Routes, Route, useParams, StaticRouter } from "react-router";
import { BrowserRouter, Link } from "react-router-dom";

// Simple pages
function Home() {
  return (
    <section>
      <h2>Kanban Home</h2>
      <p>
        <Link to="/board/123">Go to Board 123</Link>
      </p>
    </section>
  );
}

function Board() {
  return (
    <section>
      <h2>Board</h2>
      <p>Board index</p>
    </section>
  );
}

function BoardById() {
  const { id } = useParams();
  return (
    <section>
      <h2>Board {id}</h2>
      <p>Welcome!</p>
    </section>
  );
}

export default function KanbanApp({ url }) {
  const basename = "/example/react";
  const isServer = typeof window === "undefined";

  const content = (
    <>
      <header>
        <h1>Kanban</h1>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link to="/">Home</Link>
          <Link to="/board/123">Board 123</Link>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/board" element={<Board />} />
        <Route path="/board/:id" element={<BoardById />} />
        {/* catch-all */}
        <Route path="*" element={<p>Not found</p>} />
      </Routes>
    </>
  );

  if (isServer) {
    return (
      <StaticRouter location={url} basename={basename}>
        {content}
      </StaticRouter>
    );
  }

  return <BrowserRouter basename={basename}>{content}</BrowserRouter>;
}
