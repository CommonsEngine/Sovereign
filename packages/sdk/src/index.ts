import { auth } from "./auth";
import { events } from "./events";
import { notifications } from "./notifications";
import { storage } from "./storage";

export * from "./auth";
export * from "./events";
export * from "./notifications";
export * from "./storage";

export const sovereign = {
  auth,
  events,
  notifications,
  storage,
};
