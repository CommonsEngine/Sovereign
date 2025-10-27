import React from "react";
import { hydrateRoot } from "react-dom/client";

import KanbanApp from "./index.jsx";

hydrateRoot(document.getElementById("app"), <KanbanApp {...window.__SSR_PROPS__} />);
