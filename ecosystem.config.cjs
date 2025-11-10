module.exports = {
  apps: [
    {
      name: "sovereign",
      cwd: __dirname,
      script: "platform/index.cjs",
      interpreter: "node",
      node_args: [
        "--import",
        "./platform/scripts/register-alias.mjs",
        // Create /etc/sovereign.env with KEY=VALUE lines (no quotes)
        // "--env-file=/etc/sovereign.env"
      ],

      // Keep 1 process with SQLite; go cluster when you switch to Postgres.
      instances: 1,
      exec_mode: "fork",
      watch: false,

      // Restart hygiene
      autorestart: true,
      restart_delay: 2000, // 2s between restarts
      exp_backoff_restart_delay: 100, // exponential backoff base
      max_memory_restart: "512M", // restart on leak

      // Graceful lifecycle
      kill_timeout: 5000, // give app up to 5s to close on SIGINT/SIGTERM
      listen_timeout: 8000, // wait for the app to start listening

      // Logs
      merge_logs: true,
      out_file: "./logs/sovereign.out.log",
      error_file: "./logs/sovereign.err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",

      // Defaults; overridden by --env-file above
      env: {
        NODE_ENV: "production",
        PORT: "4000",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
