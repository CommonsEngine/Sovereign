// TODO: Replace with a proper logging library like Winston or Pino

const logger = {
  log: (...args) => console.log("[sovereign]", ...args),
  info: (...args) => console.info("[sovereign]", ...args),
  warn: (...args) => console.warn("[sovereign]", ...args),
  error: (...args) => console.error("[sovereign]", ...args),
  debug: (...args) => console.debug("[sovereign]", ...args),
};

export default logger;
