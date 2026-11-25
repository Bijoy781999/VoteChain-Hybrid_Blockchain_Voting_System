const mongoose = require("mongoose");
const fs = require("fs");
const { MongoMemoryServer } = require("mongodb-memory-server");
const Election = require("../src/models/Election");
const Candidate = require("../src/models/Candidate");
const User = require("../src/models/User");
const AuditLog = require("../src/models/AuditLog");

// Mock relayerService to simulate an in-memory EVM contract whose state can reset
const mockChainState = {
  deployed: true,
  electionCounter: 0,
  elections: new Map(), // id -> { id, title, phase, candidateCount, totalVotes, exists }
  candidates: new Map(), // id -> []
  voterHashes: new Map(), // id -> Set
};

const resetMockChain = () => {
  mockChainState.deployed = true;
  mockChainState.electionCounter = 0;
  mockChainState.elections.clear();
  mockChainState.candidates.clear();
  mockChainState.voterHashes.clear();
};

jest.mock("../src/services/relayerService", () => ({
  contractConfig: { address: "0x5FbDB2315678afecb367f032d93F642f64180aa3" },
  ensureContract: jest.fn(() => ({
    getElection: async (id) => {
      const e = mockChainState.elections.get(Number(id));
      if (!e || !e.exists) throw new Error("Election does not exist");
      return [BigInt(e.id), e.title, BigInt(e.phase), BigInt(e.candidateCount), BigInt(e.totalVotes)];
    },
    getAllCandidates: async (id) => {
      const e = mockChainState.elections.get(Number(id));
      if (!e || !e.exists) throw new Error("Election does not exist");
      return (mockChainState.candidates.get(Number(id)) || []).map((c) => [
        BigInt(c.id),
        c.name,
        c.party,
        BigInt(c.voteCount),
      ]);
    },
    isVoterHashRegistered: async (id, hash) => {
      const set = mockChainState.voterHashes.get(Number(id));
      return Boolean(set && set.has(hash));
    },
    isVoterAddressRegistered: async () => false,
    elections: async (id) => {
      const e = mockChainState.elections.get(Number(id));
      return e || { id: 0n, title: "", phase: 0n, candidateCount: 0n, totalVotes: 0n, exists: false };
    },
  })),
  isContractDeployed: jest.fn(async () => mockChainState.deployed),
  getElectionCounter: jest.fn(async () => mockChainState.electionCounter),
  electionExistsOnChain: jest.fn(async (id) => {
    const e = mockChainState.elections.get(Number(id));
    return Boolean(e && e.exists);
  }),
  createElectionOnChain: jest.fn(async (title) => {
    mockChainState.electionCounter += 1;
    const id = mockChainState.electionCounter;
    mockChainState.elections.set(id, {
      id,
      title,
      phase: 0,
      candidateCount: 0,
      totalVotes: 0,
      exists: true,
    });
    mockChainState.candidates.set(id, []);
    mockChainState.voterHashes.set(id, new Set());
    return { txHash: `0xcreate_${id}`, blockNumber: id, onChainElectionId: id };
  }),
  addCandidateOnChain: jest.fn(async (electionId, name, party) => {
    const e = mockChainState.elections.get(Number(electionId));
    if (!e || !e.exists) throw new Error("Election does not exist");
    if (e.phase > 1) throw new Error("Candidates can only be added during Created or Registration phase");
    e.candidateCount += 1;
    const candidateId = e.candidateCount;
    mockChainState.candidates.get(Number(electionId)).push({
      id: candidateId,
      name,
      party,
      voteCount: 0,
    });
    return { txHash: `0xcand_${electionId}_${candidateId}`, blockNumber: 10, candidateId };
  }),
  registerVoterHashOnChain: jest.fn(async (electionId, voterHash) => {
    const e = mockChainState.elections.get(Number(electionId));
    if (!e || !e.exists) throw new Error("Election does not exist");
    const set = mockChainState.voterHashes.get(Number(electionId));
    if (set.has(voterHash)) return { alreadyRegistered: true };
    set.add(voterHash);
    return { txHash: `0xvoter_${electionId}`, blockNumber: 11, alreadyRegistered: false };
  }),
  registerVoterAddressOnChain: jest.fn(async () => ({ alreadyRegistered: true })),
  setElectionPhaseOnChain: jest.fn(async (electionId, phaseNum) => {
    const e = mockChainState.elections.get(Number(electionId));
    if (!e || !e.exists) throw new Error("Election does not exist");
    if (e.phase === phaseNum) throw new Error("Election already in requested phase");
    e.phase = phaseNum;
    return { txHash: `0xphase_${electionId}_${phaseNum}`, blockNumber: 12 };
  }),
}));

const {
  syncBlockchainAndDb,
  ensureElectionOnChain,
} = require("../src/utils/syncService");

let mongoServer;
jest.setTimeout(30000);

beforeAll(async () => {
  try {
    const testUri = process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017/blockchain_voting_sync_test";
    await mongoose.connect(testUri, { serverSelectionTimeoutMS: 3000 });
  } catch (err) {
    const localMongod = "C:\\Program Files\\MongoDB\\Server\\8.0\\bin\\mongod.exe";
    const binaryConfig = fs.existsSync(localMongod) ? { systemBinary: localMongod } : {};
    mongoServer = await MongoMemoryServer.create({
      binary: binaryConfig,
      instance: { storageEngine: "wiredTiger" },
    });
    await mongoose.connect(mongoServer.getUri());
  }
});

beforeEach(async () => {
  resetMockChain();
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe("Blockchain <-> MongoDB Reconciliation (syncService)", () => {
  it("should restore persistent DB elections (including ID 5) onto a restarted empty/seeded chain", async () => {
    // Seed chain with only Election #1 (simulating Hardhat restart + seed:local)
    mockChainState.electionCounter = 1;
    mockChainState.elections.set(1, {
      id: 1,
      title: "Election 1",
      phase: 2,
      candidateCount: 0,
      totalVotes: 0,
      exists: true,
    });
    mockChainState.candidates.set(1, []);
    mockChainState.voterHashes.set(1, new Set());

    // Create DB Elections 1, 2, 5 (notice gap between 2 and 5 too!)
    const e1 = await Election.create({ title: "Election 1", onChainElectionId: 1, phase: "Voting" });
    const e2 = await Election.create({ title: "Election 2", onChainElectionId: 2, phase: "Registration" });
    const e5 = await Election.create({ title: "Election 5", onChainElectionId: 5, phase: "Voting" });

    await Candidate.create({
      electionId: e5._id,
      onChainElectionId: 5,
      onChainId: 1,
      name: "Prof. Ada Lovelace",
      party: "Algorithmic Party",
      isApproved: true,
      approvalStatus: "approved",
    });

    await User.create({
      fullName: "Approved Voter",
      email: "voter@test.edu",
      hashedGovId: "hash1",
      voterHash: "0x" + "1".repeat(64),
      password: "Password123!",
      isApproved: true,
      hasVotedElections: [5],
    });

    await AuditLog.create({
      action: "ELECTION_CREATED",
      actorId: "admin",
      actorRole: "admin",
      electionId: 5,
    });

    // Ensure Election 5 exists on-chain before ending it
    const syncedE5 = await ensureElectionOnChain(e5);

    // Since Election 1 existed on-chain, E2 took ID 2 and E5 remapped cleanly to ID 3!
    expect(mockChainState.electionCounter).toBe(3);
    expect(syncedE5.onChainElectionId).toBe(3);
    expect(mockChainState.elections.get(3).phase).toBe(2); // Voting restored on-chain
    expect(mockChainState.candidates.get(3)).toHaveLength(1);
    expect(mockChainState.candidates.get(3)[0].name).toBe("Prof. Ada Lovelace");
    expect(mockChainState.voterHashes.get(3).has("0x" + "1".repeat(64))).toBe(true);

    // References should stay aligned
    const updatedUser = await User.findOne({ email: "voter@test.edu" });
    expect(updatedUser.hasVotedElections).toContain(3);
    const updatedLog = await AuditLog.findOne({ action: "ELECTION_CREATED" });
    expect(updatedLog.electionId).toBe(3);

    // Verify fast-path works when Election #2 already exists on-chain
    const syncedE2 = await ensureElectionOnChain(e2);
    expect(syncedE2.onChainElectionId).toBe(2);
    expect(e1.onChainElectionId).toBe(1);
  });

  it("should preserve exact onChainElectionId when DB IDs 1..5 are contiguous", async () => {
    // Chain starts empty (counter = 0)
    for (let i = 1; i <= 5; i++) {
      await Election.create({
        title: `Election ${i}`,
        onChainElectionId: i,
        phase: i === 5 ? "Voting" : "Created",
      });
    }

    await syncBlockchainAndDb();

    expect(mockChainState.electionCounter).toBe(5);
    expect(mockChainState.elections.get(5).exists).toBe(true);
    expect(mockChainState.elections.get(5).title).toBe("Election 5");
    expect(mockChainState.elections.get(5).phase).toBe(2);
  });

  it("should reject clearly when contract bytecode is not deployed on the RPC node", async () => {
    mockChainState.deployed = false;
    const e1 = await Election.create({ title: "Test", onChainElectionId: 1, phase: "Voting" });

    await expect(ensureElectionOnChain(e1)).rejects.toThrow(/not deployed/i);
  });

  it("should not re-import deleted on-chain elections or candidates during sync", async () => {
    const DeletedOnChainRecord = require("../src/models/DeletedOnChainRecord");

    mockChainState.electionCounter = 2;
    mockChainState.elections.set(1, {
      id: 1,
      title: "Deleted Election",
      phase: 2,
      candidateCount: 0,
      totalVotes: 0,
      exists: true,
    });
    mockChainState.elections.set(2, {
      id: 2,
      title: "Active Election",
      phase: 1,
      candidateCount: 2,
      totalVotes: 0,
      exists: true,
    });
    mockChainState.candidates.set(1, []);
    mockChainState.candidates.set(2, [
      { id: 1, name: "Removed Candidate", party: "Old", voteCount: 0 },
      { id: 2, name: "Active Candidate", party: "New", voteCount: 0 },
    ]);
    mockChainState.voterHashes.set(1, new Set());
    mockChainState.voterHashes.set(2, new Set());

    await DeletedOnChainRecord.create({
      type: "election",
      onChainElectionId: 1,
      label: "Deleted Election",
    });
    await DeletedOnChainRecord.create({
      type: "candidate",
      onChainElectionId: 2,
      onChainId: 1,
      label: "Removed Candidate",
    });

    await syncBlockchainAndDb();

    expect(await Election.findOne({ onChainElectionId: 1 })).toBeNull();
    expect(await Election.findOne({ onChainElectionId: 2 })).not.toBeNull();
    expect(await Candidate.findOne({ onChainElectionId: 2, onChainId: 1 })).toBeNull();
    expect(await Candidate.findOne({ onChainElectionId: 2, onChainId: 2 })).not.toBeNull();
  });
});
