import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";

function App() {
  const [count, setCount] = useState(0);

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank" rel="noreferrer">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank" rel="noreferrer">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>{{ DISPLAY_NAME }}</h1>
      <p>{{ DESCRIPTION }}</p>
      <div className="card">
        <button onClick={() => setCount((value) => value + 1)}>count is {count}</button>
        <p>
          Edit <code>src/App.jsx</code> to start building your plugin UI.
        </p>
      </div>
      <p className="read-the-docs">
        Update <code>plugin.json</code> plus the Vite config to expose entry points, dev server
        proxy info, and bundle settings.
      </p>
    </>
  );
}

export default App;
