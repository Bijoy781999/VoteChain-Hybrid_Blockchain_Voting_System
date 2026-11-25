const app = require("./src/app");
const connectDB = require("./src/config/db");
const env = require("./src/config/env");
const { syncBlockchainAndDb } = require("./src/utils/syncService");
const { seedDefaultAccounts } = require("./src/utils/seedAccounts");

const startServer = async () => {
  await connectDB();
  await seedDefaultAccounts();

  const PORT = env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`=============================================`);
    console.log(` Blockchain Voting Backend Server Running `);
    console.log(` Port: ${PORT}`);
    console.log(` Environment: ${env.NODE_ENV}`);
    console.log(`=============================================`);
  });

  // Run blockchain sync in background so HTTP server is immediately accessible
  syncBlockchainAndDb().catch((err) => {
    console.warn("[SyncService] Startup blockchain sync note:", err.message);
  });
};

startServer();
