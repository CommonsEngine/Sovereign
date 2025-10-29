/* eslint-disable no-undef */
// Simple StartupManager that attaches to window for non-module usage
(function () {
  if (window.StartupManager) return;

  const tasks = new Map(); // name -> { fn, status, result, error, promise }
  const listeners = new Set();

  function notify() {
    const snapshot = getState();
    listeners.forEach((cb) => {
      try {
        cb(snapshot);
      } catch (e) {
        /* swallow */
        console.log(e);
      }
    });
  }

  function register(name, fn) {
    if (!name || typeof fn !== "function") throw new Error("register(name, fn) required");
    tasks.set(name, {
      fn,
      status: "idle",
      result: null,
      error: null,
      promise: null,
    });
    notify();
  }

  function unregister(name) {
    tasks.delete(name);
    notify();
  }

  function getState() {
    const items = {};
    for (const [k, v] of tasks) {
      items[k] = { status: v.status, error: v.error, result: v.result };
    }
    const isLoading = [...tasks.values()].some((t) => t.status === "pending");
    const hasError = [...tasks.values()].some((t) => t.status === "error");
    return { items, isLoading, hasError };
  }

  function runTask(name) {
    const t = tasks.get(name);
    if (!t) return Promise.reject(new Error("unknown task: " + name));
    if (t.status === "pending") return t.promise;
    t.status = "pending";
    t.error = null;
    t.result = null;
    notify();
    const p = (async () => {
      try {
        const res = await t.fn();
        t.status = "done";
        t.result = res;
        t.promise = null;
        notify();
        return res;
      } catch (err) {
        t.status = "error";
        t.error = err;
        t.promise = null;
        notify();
        throw err;
      }
    })();
    t.promise = p;
    return p;
  }

  async function runAll(options) {
    const { parallel = true } = options || {};
    const names = [...tasks.keys()];
    if (parallel) return Promise.all(names.map((n) => runTask(n).catch((e) => e)));
    const results = [];
    for (const n of names) {
      try {
        results.push(await runTask(n));
      } catch (e) {
        results.push(e);
      }
    }
    return results;
  }

  function onChange(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  function reset() {
    for (const [k, v] of tasks)
      tasks.set(k, {
        fn: v.fn,
        status: "idle",
        result: null,
        error: null,
        promise: null,
      });
    notify();
  }

  window.StartupManager = {
    register,
    unregister,
    getState,
    runTask,
    runAll,
    onChange,
    reset,
  };
})();
