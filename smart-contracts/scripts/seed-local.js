const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Seeding local demo data on Voting contract...");

  const [owner, relayer, voter1, voter2] = await hre.ethers.getSigners();
  const contractPath = path.resolve(__dirname, "../../backend/src/config/contract.json");

  if (!fs.existsSync(contractPath)) {
    throw new Error("Contract JSON not found. Run deploy.js first!");
  }

  const contractData = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  const voting = await hre.ethers.getContractAt("Voting", contractData.address, relayer);

  console.log("Connected to Voting contract at:", contractData.address);

  // 1. Create Election
  const txCreate = await voting.createElection("2026 Student Union Presidential Election");
  await txCreate.wait();
  const electionId = 1;
  console.log(`Created election with ID: ${electionId}`);

  // 2. Add Candidates
  const c1 = await voting.addCandidate(electionId, "Alice Johnson", "Innovation & Progress Party");
  await c1.wait();
  console.log("Candidate 1 added: Alice Johnson");

  const c2 = await voting.addCandidate(electionId, "Bob Martinez", "Student Voice Coalition");
  await c2.wait();
  console.log("Candidate 2 added: Bob Martinez");

  const c3 = await voting.addCandidate(electionId, "Charlie Zhao", "Digital Campus Alliance");
  await c3.wait();
  console.log("Candidate 3 added: Charlie Zhao");

  // 3. Move to Registration Phase (Phase 1)
  const txRegPhase = await voting.setElectionPhase(electionId, 1);
  await txRegPhase.wait();
  console.log("Election moved to Registration phase.");

  // 4. Register sample voter hashes
  const sampleVoterHash1 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("STUDENT-ID-1001-SALT"));
  const sampleVoterHash2 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("STUDENT-ID-1002-SALT"));
  const sampleVoterHash3 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("STUDENT-ID-1003-SALT"));

  const txRegHashes = await voting.batchRegisterVoterHashes(electionId, [
    sampleVoterHash1,
    sampleVoterHash2,
    sampleVoterHash3
  ]);
  await txRegHashes.wait();
  console.log("Registered 3 sample voter hashes.");

  // Register voter1 address for direct wallet voting test
  const txRegAddr = await voting.registerVoterAddress(electionId, voter1.address);
  await txRegAddr.wait();
  console.log(`Registered voter1 wallet (${voter1.address}) for direct voting.`);

  // 5. Advance to Voting Phase (Phase 2)
  const txVotePhase = await voting.setElectionPhase(electionId, 2);
  await txVotePhase.wait();
  console.log("Election moved to Voting phase. Ready for demo voting!");

  console.log("Seed completed successfully.");
}

main().catch((error) => {
  console.error("Seeding failed:", error);
  process.exitCode = 1;
});
