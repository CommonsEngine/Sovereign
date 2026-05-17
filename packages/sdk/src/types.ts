import type { auth } from "./auth";
import type { events } from "./events";
import type { notifications } from "./notifications";
import type { storage } from "./storage";

export interface SovereignAppSdk {
  auth?: typeof auth;
  storage?: typeof storage;
  events?: typeof events;
  notifications?: typeof notifications;
}

export interface SovereignAppProps {
  sdk: SovereignAppSdk;
}
