module.exports = {
  apps: [
    {
      name: "sovereign",
      cwd: __dirname,
      script: "dist/index.mjs",
      interpreter: "node",
      node_args: "--enable-source-maps",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: "5000",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
