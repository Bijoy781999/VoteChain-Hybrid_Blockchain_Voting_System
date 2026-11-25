const crypto = require("crypto");
const { ethers } = require("ethers");
const env = require("../config/env");

/**
 * Creates a deterministic, salted keccak256 hash formatted as bytes32 for on-chain identity.
 * @param {string} rawId - Government or student ID
 * @param {string} salt - Optional custom salt
 * @returns {string} - bytes32 hex string
 */
function generateVoterHash(rawId, salt = env.HASH_SALT) {
  if (!rawId) {
    throw new Error("Raw ID is required to generate voter hash");
  }
  const normalized = rawId.trim().toUpperCase();
  const combined = `${normalized}:${salt}`;
  return ethers.keccak256(ethers.toUtf8Bytes(combined));
}

/**
 * Creates a standard SHA-256 hash for database storage so plaintext IDs are never persisted.
 * @param {string} rawId
 * @returns {string}
 */
function hashSensitiveId(rawId) {
  if (!rawId) {
    throw new Error("Raw ID is required for hashing");
  }
  const normalized = rawId.trim().toUpperCase();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

module.exports = {
  generateVoterHash,
  hashSensitiveId,
};
