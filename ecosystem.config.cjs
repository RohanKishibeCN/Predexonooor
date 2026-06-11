module.exports = {
  apps: [
    {
      name: "predexonooor-pm-lt",
      script: "dist/cli.js",
      args: "--env-file .env.pm-lt bot",
      autorestart: true,
      max_restarts: 10,
      time: true,
      env: {
        NODE_ENV: "production",
        LOG_LEVEL: "info"
      }
    },
    {
      name: "predexonooor-pm-hl",
      script: "dist/cli.js",
      args: "--env-file .env.pm-hl bot",
      autorestart: true,
      max_restarts: 10,
      time: true,
      env: {
        NODE_ENV: "production",
        LOG_LEVEL: "info"
      }
    }
  ]
};
