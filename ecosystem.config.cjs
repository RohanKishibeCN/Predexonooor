module.exports = {
  apps: [
    {
      name: "predexonooor",
      script: "dist/cli.js",
      args: "bot --config config.local.yaml --state state.json",
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

