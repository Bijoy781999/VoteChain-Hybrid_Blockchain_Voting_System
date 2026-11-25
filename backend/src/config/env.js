require("dotenv").config();

const env = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || "development",
  MONGO_URI: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/blockchain_voting",
  JWT_SECRET: process.env.JWT_SECRET || "supersecretkey_blockchain_voting_jwt_2026",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "24h",
  RPC_URL: process.env.RPC_URL || "http://127.0.0.1:8545",
  RELAYER_PRIVATE_KEY:
    process.env.RELAYER_PRIVATE_KEY ||
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // Hardhat account 1
  CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS || "",
  HASH_SALT: process.env.HASH_SALT || "blockchain_voting_secure_salt_2026",
};

module.exports = env;
