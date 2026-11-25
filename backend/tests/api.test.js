jest.mock("../src/services/relayerService", () => ({
  provider: null,
  contract: null,
  contractConfig: { address: "0x5FbDB2315678afecb367f032d93F642f64180aa3" },
  ensureContract: jest.fn(() => {
    throw new Error("Mocked offline blockchain for API integration tests");
  }),
  isContractDeployed: jest.fn().mockResolvedValue(false),
  getElectionCounter: jest.fn().mockResolvedValue(0),
  electionExistsOnChain: jest.fn().mockResolvedValue(false),
  createElectionOnChain: jest.fn().mockRejectedValue(new Error("Mocked offline blockchain")),
  addCandidateOnChain: jest.fn().mockRejectedValue(new Error("Mocked offline blockchain")),
  setElectionPhaseOnChain: jest.fn().mockRejectedValue(new Error("Mocked offline blockchain")),
  registerVoterHashOnChain: jest.fn().mockRejectedValue(new Error("Mocked offline blockchain")),
  registerVoterAddressOnChain: jest.fn().mockRejectedValue(new Error("Mocked offline blockchain")),
  castVoteOnChain: jest.fn().mockRejectedValue(new Error("Mocked offline blockchain")),
  getElectionResultsFromChain: jest.fn().mockResolvedValue(null),
  hasVoted: jest.fn().mockResolvedValue(false),
}));

const request = require("supertest");
const mongoose = require("mongoose");
const fs = require("fs");
const { MongoMemoryServer } = require("mongodb-memory-server");
const app = require("../src/app");
const Admin = require("../src/models/Admin");

let mongoServer;

jest.setTimeout(40000);

beforeAll(async () => {
  process.env.JWT_SECRET = "test_secret_for_ci_blockchain_voting_123";

  try {
    // Connect to local MongoDB test database (instant and stable)
    const testUri = process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017/blockchain_voting_test";
    await mongoose.connect(testUri, { serverSelectionTimeoutMS: 3000 });
  } catch (err) {
    const localMongod = "C:\\Program Files\\MongoDB\\Server\\8.0\\bin\\mongod.exe";
    const binaryConfig = fs.existsSync(localMongod)
      ? { systemBinary: localMongod }
      : {};

    mongoServer = await MongoMemoryServer.create({
      binary: binaryConfig,
      instance: {
        storageEngine: "wiredTiger",
      },
    });
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  }

  // Clean test database collections before starting
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }

  // Seed test admin
  await Admin.create({
    fullName: "System Admin",
    email: "admin@election.gov",
    password: "AdminPassword123!",
    role: "admin",
  });
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

describe("Blockchain Voting API Test Suite", () => {
  let voterToken = "";
  let adminToken = "";

  const fetchRegistrationCode = async (email, role) => {
    const res = await request(app)
      .post("/api/auth/request-registration-code")
      .send({ email, role });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.verificationCode).toMatch(/^\d{6}$/);
    return res.body.verificationCode;
  };

  it("should respond to health check", async () => {
    const res = await request(app).get("/health");
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("healthy");
  });

  describe("Authentication Endpoints", () => {
    it("should reject voter registration without a valid verification code and allow registration with code", async () => {
      const missingCodeRes = await request(app).post("/api/auth/register").send({
        fullName: "John Doe",
        email: "john@example.com",
        govId: "STU-992144",
        password: "securePassword123",
      });
      expect(missingCodeRes.statusCode).toBe(400);
      expect(missingCodeRes.body.success).toBe(false);

      const code = await fetchRegistrationCode("john@example.com", "voter");

      const wrongCodeRes = await request(app).post("/api/auth/register").send({
        fullName: "John Doe",
        email: "john@example.com",
        govId: "STU-992144",
        password: "securePassword123",
        verificationCode: "000000",
      });
      expect(wrongCodeRes.statusCode).toBe(400);

      const res = await request(app).post("/api/auth/register").send({
        fullName: "John Doe",
        email: "john@example.com",
        govId: "STU-992144",
        password: "securePassword123",
        verificationCode: code,
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toHaveProperty("voterHash");
      expect(res.body.user.email).toBe("john@example.com");
      expect(res.body.user.isApproved).toBe(false);
      expect(res.body).toHaveProperty("token");

      voterToken = res.body.token;

      // Verification code request should reject duplicate registered email and invalid role
      const dupReqCode = await request(app)
        .post("/api/auth/request-registration-code")
        .send({ email: "john@example.com", role: "voter" });
      expect(dupReqCode.statusCode).toBe(400);

      const badRoleCode = await request(app)
        .post("/api/auth/request-registration-code")
        .send({ email: "fresh@example.com", role: "superuser" });
      expect(badRoleCode.statusCode).toBe(400);

      // Reusing an already consumed verification code should fail even with a distinct govId
      const reuseRes = await request(app).post("/api/auth/register").send({
        fullName: "Reuse Code",
        email: "john@example.com",
        govId: "STU-UNIQUE-999",
        password: "securePassword123",
        verificationCode: code,
      });
      expect(reuseRes.statusCode).toBe(400);
    });

    it("should prevent duplicate registration with same email or govId", async () => {
      const res = await request(app).post("/api/auth/register").send({
        fullName: "Duplicate User",
        email: "john@example.com",
        govId: "STU-992144",
        password: "anotherPassword",
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("should authenticate voter with valid credentials", async () => {
      const res = await request(app).post("/api/auth/login").send({
        email: "john@example.com",
        password: "securePassword123",
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty("token");
    });

    it("should authenticate admin with valid credentials", async () => {
      const res = await request(app).post("/api/auth/admin/login").send({
        email: "admin@election.gov",
        password: "AdminPassword123!",
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty("token");

      adminToken = res.body.token;
    });

    it("should allow admin registration without MetaMask when verified with code and support optional wallet linking", async () => {
      // 0. Reject admin registration without verification code
      const unverifiedAdmin = await request(app).post("/api/auth/admin/register").send({
        fullName: "No Code Admin",
        email: "nowallet.admin@election.gov",
        password: "AdminPassword123!",
      });
      expect(unverifiedAdmin.statusCode).toBe(400);

      // 1. Register admin cleanly without MetaMask walletAddress using verification code
      const code1 = await fetchRegistrationCode("nowallet.admin@election.gov", "admin");
      const noWalletReg = await request(app).post("/api/auth/admin/register").send({
        fullName: "No Wallet Admin",
        email: "nowallet.admin@election.gov",
        password: "AdminPassword123!",
        verificationCode: code1,
      });
      expect(noWalletReg.statusCode).toBe(201);
      expect(noWalletReg.body.success).toBe(true);
      expect(noWalletReg.body).toHaveProperty("token");
      expect(noWalletReg.body.admin.walletAddress).toBeNull();
      const noWalletAdminToken = noWalletReg.body.token;

      // 2. Register a second admin without walletAddress too (ensuring no duplicate null conflict)
      const code2 = await fetchRegistrationCode("relayer2.admin@election.gov", "admin");
      const secondNoWallet = await request(app).post("/api/auth/admin/register").send({
        fullName: "Second Relayer Admin",
        email: "relayer2.admin@election.gov",
        password: "AdminPassword123!",
        verificationCode: code2,
      });
      expect(secondNoWallet.statusCode).toBe(201);

      // 3. Reject invalid optional walletAddress format if provided during registration
      const invalidWallet = await request(app).post("/api/auth/admin/register").send({
        fullName: "Bad Wallet Admin",
        email: "badwallet.admin@election.gov",
        password: "AdminPassword123!",
        walletAddress: "not-a-valid-address",
      });
      expect(invalidWallet.statusCode).toBe(400);
      expect(invalidWallet.body.message).toMatch(/valid Ethereum MetaMask/i);

      // 4. Optional walletAddress during registration validates & deduplicates
      const validWallet = "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12";
      const code3 = await fetchRegistrationCode("verified.admin@election.gov", "admin");
      const validReg = await request(app).post("/api/auth/admin/register").send({
        fullName: "MetaMask Verified Admin",
        email: "verified.admin@election.gov",
        password: "AdminPassword123!",
        walletAddress: validWallet,
        verificationCode: code3,
      });
      expect(validReg.statusCode).toBe(201);
      expect(validReg.body.success).toBe(true);
      expect(validReg.body.admin.walletAddress).toBe(validWallet.toLowerCase());

      const code4 = await fetchRegistrationCode("dupwallet.admin@election.gov", "admin");
      const dupWallet = await request(app).post("/api/auth/admin/register").send({
        fullName: "Dup Wallet Admin",
        email: "dupwallet.admin@election.gov",
        password: "AdminPassword123!",
        walletAddress: validWallet,
        verificationCode: code4,
      });
      expect(dupWallet.statusCode).toBe(400);
      expect(dupWallet.body.message).toMatch(/wallet address/i);

      // 5. Link optional MetaMask wallet later via POST /api/auth/admin/link-wallet
      const invalidLinkRes = await request(app)
        .post("/api/auth/admin/link-wallet")
        .set("Authorization", `Bearer ${noWalletAdminToken}`)
        .send({ walletAddress: "bad-wallet" });
      expect(invalidLinkRes.statusCode).toBe(400);

      const dupLinkRes = await request(app)
        .post("/api/auth/admin/link-wallet")
        .set("Authorization", `Bearer ${noWalletAdminToken}`)
        .send({ walletAddress: validWallet });
      expect(dupLinkRes.statusCode).toBe(400);

      const newAdminWallet = "0x1111111111111111111111111111111111111111";
      const linkRes = await request(app)
        .post("/api/auth/admin/link-wallet")
        .set("Authorization", `Bearer ${noWalletAdminToken}`)
        .send({ walletAddress: newAdminWallet });
      expect(linkRes.statusCode).toBe(200);
      expect(linkRes.body.success).toBe(true);
      expect(linkRes.body.admin.walletAddress).toBe(newAdminWallet);

      // 6. Demo read-only admin explorer account is blocked from linking wallets
      const demoAdminLogin = await request(app).post("/api/auth/admin/login").send({
        email: "demo.admin@election.gov",
        password: "DemoAdmin123!",
      });
      expect(demoAdminLogin.statusCode).toBe(200);

      const demoLinkRes = await request(app)
        .post("/api/auth/admin/link-wallet")
        .set("Authorization", `Bearer ${demoAdminLogin.body.token}`)
        .send({ walletAddress: "0x2222222222222222222222222222222222222222" });
      expect(demoLinkRes.statusCode).toBe(403);
    });

    it("should allow admin to list and delete any account including their own admin account", async () => {
      // List admins as full admin; reject voter
      const voterListAdmins = await request(app)
        .get("/api/auth/admins")
        .set("Authorization", `Bearer ${voterToken}`);
      expect(voterListAdmins.statusCode).toBe(403);

      const listAdminsRes = await request(app)
        .get("/api/auth/admins")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(listAdminsRes.statusCode).toBe(200);
      expect(listAdminsRes.body.admins.length).toBeGreaterThanOrEqual(3);

      // Register disposable Admin A, Admin B, Voter V, and Candidate C
      const adminACode = await fetchRegistrationCode("delete.adminA@election.gov", "admin");
      const adminARes = await request(app).post("/api/auth/admin/register").send({
        fullName: "Admin Alpha",
        email: "delete.adminA@election.gov",
        password: "AdminPassword123!",
        verificationCode: adminACode,
      });
      expect(adminARes.statusCode).toBe(201);
      const adminAToken = adminARes.body.token;
      const adminAId = adminARes.body.admin.id;

      const adminBCode = await fetchRegistrationCode("delete.adminB@election.gov", "admin");
      const adminBRes = await request(app).post("/api/auth/admin/register").send({
        fullName: "Admin Beta",
        email: "delete.adminB@election.gov",
        password: "AdminPassword123!",
        verificationCode: adminBCode,
      });
      expect(adminBRes.statusCode).toBe(201);
      const adminBId = adminBRes.body.admin.id;

      const voterCode = await fetchRegistrationCode("delete.voter@example.com", "voter");
      const voterRes = await request(app).post("/api/auth/register").send({
        fullName: "Deletable Voter",
        email: "delete.voter@example.com",
        govId: "DEL-VOTER-01",
        password: "VoterPassword123!",
        verificationCode: voterCode,
      });
      expect(voterRes.statusCode).toBe(201);

      const candCode = await fetchRegistrationCode("delete.cand@university.edu", "candidate");
      const candRes = await request(app).post("/api/auth/candidate/register").send({
        name: "Deletable Candidate",
        email: "delete.cand@university.edu",
        password: "CandPassword123!",
        verificationCode: candCode,
      });
      expect(candRes.statusCode).toBe(201);

      // Read-only demo admin is blocked from deleting any admin
      const demoLogin = await request(app).post("/api/auth/admin/login").send({
        email: "demo.admin@election.gov",
        password: "DemoAdmin123!",
      });
      const demoDelBlocked = await request(app)
        .delete(`/api/auth/admins/${adminBId}`)
        .set("Authorization", `Bearer ${demoLogin.body.token}`);
      expect(demoDelBlocked.statusCode).toBe(403);

      // Read-only demo accounts are protected and cannot be deleted by anyone (not even a full admin)
      const demoVoterLogin = await request(app).post("/api/auth/login").send({
        email: "demo.voter@election.gov",
        password: "DemoVoter123!",
      });
      const demoCandLogin = await request(app).post("/api/auth/candidate/login").send({
        email: "demo.candidate@election.gov",
        password: "DemoCandidate123!",
      });

      const fullAdminDelDemoVoter = await request(app)
        .delete(`/api/voters/${demoVoterLogin.body.user.id}`)
        .set("Authorization", `Bearer ${adminAToken}`);
      expect(fullAdminDelDemoVoter.statusCode).toBe(403);

      const fullAdminDelDemoCand = await request(app)
        .delete(`/api/candidates/${demoCandLogin.body.candidate.id}`)
        .set("Authorization", `Bearer ${adminAToken}`);
      expect(fullAdminDelDemoCand.statusCode).toBe(403);

      const fullAdminDelDemoAdmin = await request(app)
        .delete(`/api/auth/admins/${demoLogin.body.admin.id}`)
        .set("Authorization", `Bearer ${adminAToken}`);
      expect(fullAdminDelDemoAdmin.statusCode).toBe(403);

      // Admin Alpha deletes Voter V, Candidate C, and Admin Beta
      const delVoterRes = await request(app)
        .delete(`/api/voters/${voterRes.body.user.id}`)
        .set("Authorization", `Bearer ${adminAToken}`);
      expect(delVoterRes.statusCode).toBe(200);

      const deletedVoterMe = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${voterRes.body.token}`);
      expect(deletedVoterMe.statusCode).toBe(401);

      const delCandRes = await request(app)
        .delete(`/api/candidates/${candRes.body.candidate.id}`)
        .set("Authorization", `Bearer ${adminAToken}`);
      expect(delCandRes.statusCode).toBe(200);

      const delAdminBRes = await request(app)
        .delete(`/api/auth/admins/${adminBId}`)
        .set("Authorization", `Bearer ${adminAToken}`);
      expect(delAdminBRes.statusCode).toBe(200);
      expect(delAdminBRes.body.selfDeleted).toBe(false);

      // Admin Alpha deletes their OWN admin account
      const delSelfRes = await request(app)
        .delete(`/api/auth/admins/${adminAId}`)
        .set("Authorization", `Bearer ${adminAToken}`);
      expect(delSelfRes.statusCode).toBe(200);
      expect(delSelfRes.body.selfDeleted).toBe(true);

      // Deleted Admin Alpha's token is immediately rejected
      const selfMeAfter = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${adminAToken}`);
      expect(selfMeAfter.statusCode).toBe(401);
    });
  });

  describe("Protected Routes and Permissions", () => {
    it("should reject requests to protected routes without a token", async () => {
      const res = await request(app).get("/api/voters/profile");
      expect(res.statusCode).toBe(401);
    });

    it("should allow voter to access their profile with valid token", async () => {
      const res = await request(app)
        .get("/api/voters/profile")
        .set("Authorization", `Bearer ${voterToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.voter.email).toBe("john@example.com");
    });

    it("should prevent voter from accessing admin voter list", async () => {
      const res = await request(app)
        .get("/api/voters")
        .set("Authorization", `Bearer ${voterToken}`);

      expect(res.statusCode).toBe(403);
    });

    it("should allow admin to view voter list", async () => {
      const res = await request(app)
        .get("/api/voters")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.voters.length).toBeGreaterThan(0);
    });
  });

  describe("Election and Audit Endpoints", () => {
    it("should allow public listing of elections", async () => {
      const res = await request(app).get("/api/elections");
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.elections)).toBe(true);
    });

    it("should prevent unauthorized or voter requests from querying audit logs", async () => {
      const noTokenRes = await request(app).get("/api/audit/logs");
      expect(noTokenRes.statusCode).toBe(401);

      const voterRes = await request(app)
        .get("/api/audit/logs")
        .set("Authorization", `Bearer ${voterToken}`);
      expect(voterRes.statusCode).toBe(403);
    });

    it("should allow admin to query audit logs", async () => {
      const res = await request(app)
        .get("/api/audit/logs")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.logs)).toBe(true);
    });
  });

  describe("Candidate Workflow and Party Lock Enforcement", () => {
    let candidateToken = "";

    it("should register a new candidate successfully only with verification code", async () => {
      const noCodeRes = await request(app).post("/api/auth/candidate/register").send({
        name: "Dr. Jane Hope",
        email: "jane.hope@university.edu",
        password: "CandidatePassword123!",
        party: "Progressive Student Alliance",
        manifesto: "Empowering student research.",
      });
      expect(noCodeRes.statusCode).toBe(400);

      const candCode = await fetchRegistrationCode("jane.hope@university.edu", "candidate");

      const res = await request(app).post("/api/auth/candidate/register").send({
        name: "Dr. Jane Hope",
        email: "jane.hope@university.edu",
        password: "CandidatePassword123!",
        party: "Progressive Student Alliance",
        manifesto: "Empowering student research.",
        verificationCode: candCode,
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.candidate.partyLocked).toBe(false);
      expect(res.body).toHaveProperty("token");

      candidateToken = res.body.token;
    });

    it("should authenticate candidate with valid credentials", async () => {
      const res = await request(app).post("/api/auth/candidate/login").send({
        email: "jane.hope@university.edu",
        password: "CandidatePassword123!",
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty("token");
    });

    it("should allow candidate to update details and select party before approval request", async () => {
      const Election = require("../src/models/Election");
      const elec = await Election.create({
        title: "2026 Test Campus Election",
        onChainElectionId: 999,
        phase: "Created",
      });

      const res = await request(app)
        .put("/api/candidates/me")
        .set("Authorization", `Bearer ${candidateToken}`)
        .send({
          electionId: elec._id,
          party: "Green Campus Coalition",
          manifesto: "Sustainability first.",
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.candidate.party).toBe("Green Campus Coalition");
      expect(res.body.candidate.partyLocked).toBe(false);
    });

    it("should lock candidate party upon submitting approval request", async () => {
      const res = await request(app)
        .post("/api/candidates/me/request-approval")
        .set("Authorization", `Bearer ${candidateToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.candidate.partyLocked).toBe(true);
      expect(res.body.candidate.approvalStatus).toBe("pending");
    });

    it("should strictly reject any attempt to change party after approval request", async () => {
      const res = await request(app)
        .put("/api/candidates/me")
        .set("Authorization", `Bearer ${candidateToken}`)
        .send({
          party: "Unauthorized New Party",
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/pending|locked/i);
    });

    it("should allow admin to reject candidate nomination with feedback", async () => {
      const Candidate = require("../src/models/Candidate");
      const cand = await Candidate.findOne({ email: "jane.hope@university.edu" });
      expect(cand).toBeDefined();

      const res = await request(app)
        .post(`/api/candidates/admin/nominations/${cand._id}/review`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          action: "reject",
          feedback: "Please clarify campaign budget and parking proposals.",
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.candidate.approvalStatus).toBe("rejected");
      expect(res.body.candidate.isApproved).toBe(false);
      expect(res.body.candidate.adminFeedback).toBe("Please clarify campaign budget and parking proposals.");
    });

    it("should allow rejected candidate to log in using email and password and view rejection feedback", async () => {
      const res = await request(app).post("/api/auth/candidate/login").send({
        email: "jane.hope@university.edu",
        password: "CandidatePassword123!",
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.candidate.approvalStatus).toBe("rejected");
      expect(res.body.candidate.adminFeedback).toBe("Please clarify campaign budget and parking proposals.");

      candidateToken = res.body.token; // Refresh token
    });

    it("should allow rejected candidate to edit their party affiliation and manifesto", async () => {
      const res = await request(app)
        .put("/api/candidates/me")
        .set("Authorization", `Bearer ${candidateToken}`)
        .send({
          party: "Progressive Student Alliance",
          manifesto: "Updated Platform: Comprehensive parking shuttles and full budget transparency.",
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.candidate.party).toBe("Progressive Student Alliance");
      expect(res.body.candidate.manifesto).toBe("Updated Platform: Comprehensive parking shuttles and full budget transparency.");
    });

    it("should allow candidate to submit 1st reapplication (1 of 2)", async () => {
      const res = await request(app)
        .post("/api/candidates/me/request-approval")
        .set("Authorization", `Bearer ${candidateToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.candidate.approvalStatus).toBe("pending");
      expect(res.body.candidate.reapplicationCount).toBe(1);
    });

    it("should block profile modifications while nomination is pending review", async () => {
      const res = await request(app)
        .put("/api/candidates/me")
        .set("Authorization", `Bearer ${candidateToken}`)
        .send({
          name: "Dr. Jane Modified",
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/pending administrator review/i);
    });

    it("should allow admin to reject candidate nomination a second time", async () => {
      const Candidate = require("../src/models/Candidate");
      const cand = await Candidate.findOne({ email: "jane.hope@university.edu" });

      const res = await request(app)
        .post(`/api/candidates/admin/nominations/${cand._id}/review`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          action: "reject",
          feedback: "Need more details on transit safety.",
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.candidate.approvalStatus).toBe("rejected");
    });

    it("should allow candidate to edit party again and submit 2nd reapplication (2 of 2)", async () => {
      // 1. Edit party after 2nd rejection
      const updateRes = await request(app)
        .put("/api/candidates/me")
        .set("Authorization", `Bearer ${candidateToken}`)
        .send({
          party: "United Student Voice",
          manifesto: "Transit safety and night patrols included.",
        });

      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.body.success).toBe(true);
      expect(updateRes.body.candidate.party).toBe("United Student Voice");

      // 2. Submit 2nd reapplication
      const reapplyRes = await request(app)
        .post("/api/candidates/me/request-approval")
        .set("Authorization", `Bearer ${candidateToken}`);

      expect(reapplyRes.statusCode).toBe(200);
      expect(reapplyRes.body.success).toBe(true);
      expect(reapplyRes.body.candidate.reapplicationCount).toBe(2);
      expect(reapplyRes.body.candidate.approvalStatus).toBe("pending");
    });

    it("should strictly reject a 3rd reapplication when 2-reapplication limit is reached", async () => {
      const Candidate = require("../src/models/Candidate");
      const cand = await Candidate.findOne({ email: "jane.hope@university.edu" });

      // Admin rejects for the 3rd time (after 2 reapplications)
      await request(app)
        .post(`/api/candidates/admin/nominations/${cand._id}/review`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          action: "reject",
          feedback: "Criteria not met.",
        });

      // Attempt 3rd reapplication -> must be rejected with 400
      const thirdReapplyRes = await request(app)
        .post("/api/candidates/me/request-approval")
        .set("Authorization", `Bearer ${candidateToken}`);

      expect(thirdReapplyRes.statusCode).toBe(400);
      expect(thirdReapplyRes.body.success).toBe(false);
      expect(thirdReapplyRes.body.message).toMatch(/limit reached/i);
    });

    it("should allow admin to review and approve candidate, locking name, party, and election", async () => {
      const Candidate = require("../src/models/Candidate");
      const cand = await Candidate.findOne({ email: "jane.hope@university.edu" });

      const res = await request(app)
        .post(`/api/candidates/admin/nominations/${cand._id}/review`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          action: "approve",
          feedback: "Approved for official ballot.",
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.candidate.approvalStatus).toBe("approved");
      expect(res.body.candidate.isApproved).toBe(true);

      // Attempting to change candidate name after approval fails
      const nameRes = await request(app)
        .put("/api/candidates/me")
        .set("Authorization", `Bearer ${candidateToken}`)
        .send({
          name: "Dr. Jane Imposter",
        });
      expect(nameRes.statusCode).toBe(400);
      expect(nameRes.body.message).toMatch(/name is locked/i);

      // Attempting to change party after approval fails
      const partyRes = await request(app)
        .put("/api/candidates/me")
        .set("Authorization", `Bearer ${candidateToken}`)
        .send({
          party: "Unauthorized New Party",
        });
      expect(partyRes.statusCode).toBe(400);
      expect(partyRes.body.message).toMatch(/party affiliation is locked/i);

      // Attempting to change election after approval fails
      const elecRes = await request(app)
        .put("/api/candidates/me")
        .set("Authorization", `Bearer ${candidateToken}`)
        .send({
          electionId: "6b05a0e6e39a32b7108e52cf",
        });
      expect(elecRes.statusCode).toBe(400);
      expect(elecRes.body.message).toMatch(/election is locked/i);
    });

    it("should allow approved candidate to update only Campaign Manifesto & Key Policies", async () => {
      const res = await request(app)
        .put("/api/candidates/me")
        .set("Authorization", `Bearer ${candidateToken}`)
        .send({
          manifesto: "Official Final Manifesto: 24/7 Library Access and Dining Subsidy Expansion.",
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.candidate.manifesto).toBe("Official Final Manifesto: 24/7 Library Access and Dining Subsidy Expansion.");
    });
  });

  describe("Password Recovery Workflow (Voter, Candidate, Admin)", () => {
    let voterResetCode = "";
    let candidateResetCode = "";
    let adminResetCode = "";

    it("should reject forgot password request for nonexistent email or invalid role", async () => {
      const nonexistentRes = await request(app).post("/api/auth/forgot-password").send({
        email: "nobody@university.edu",
        role: "voter",
      });
      expect(nonexistentRes.statusCode).toBe(404);
      expect(nonexistentRes.body.success).toBe(false);

      const invalidRoleRes = await request(app).post("/api/auth/forgot-password").send({
        email: "john@example.com",
        role: "superhacker",
      });
      expect(invalidRoleRes.statusCode).toBe(400);
      expect(invalidRoleRes.body.success).toBe(false);
    });

    it("should generate a 6-digit verification code for Voter forgot password", async () => {
      const res = await request(app).post("/api/auth/forgot-password").send({
        email: "john@example.com",
        role: "voter",
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty("resetCode");
      expect(res.body.resetCode).toMatch(/^\d{6}$/);

      voterResetCode = res.body.resetCode;
    });

    it("should reject voter password reset with invalid verification code or short password", async () => {
      const wrongCodeRes = await request(app).post("/api/auth/reset-password").send({
        email: "john@example.com",
        role: "voter",
        code: "999999",
        newPassword: "NewSecretPassword123!",
      });
      expect(wrongCodeRes.statusCode).toBe(400);
      expect(wrongCodeRes.body.success).toBe(false);
      expect(wrongCodeRes.body.message).toMatch(/invalid or expired/i);

      const shortPassRes = await request(app).post("/api/auth/reset-password").send({
        email: "john@example.com",
        role: "voter",
        code: voterResetCode,
        newPassword: "123",
      });
      expect(shortPassRes.statusCode).toBe(400);
      expect(shortPassRes.body.success).toBe(false);
      expect(shortPassRes.body.message).toMatch(/at least 6 characters/i);

      const mismatchPassRes = await request(app).post("/api/auth/reset-password").send({
        email: "john@example.com",
        role: "voter",
        code: voterResetCode,
        newPassword: "JohnBrandNewPassword2026!",
        confirmPassword: "DifferentPassword2026!",
      });
      expect(mismatchPassRes.statusCode).toBe(400);
      expect(mismatchPassRes.body.success).toBe(false);
      expect(mismatchPassRes.body.message).toMatch(/do not match/i);
    });

    it("should reset voter password with valid code and allow login with new password", async () => {
      const resetRes = await request(app).post("/api/auth/reset-password").send({
        email: "john@example.com",
        role: "voter",
        code: voterResetCode,
        newPassword: "JohnBrandNewPassword2026!",
      });

      expect(resetRes.statusCode).toBe(200);
      expect(resetRes.body.success).toBe(true);

      // Verify login with OLD password fails
      const oldLoginRes = await request(app).post("/api/auth/login").send({
        email: "john@example.com",
        password: "securePassword123",
      });
      expect(oldLoginRes.statusCode).toBe(401);

      // Verify login with NEW password succeeds
      const newLoginRes = await request(app).post("/api/auth/login").send({
        email: "john@example.com",
        password: "JohnBrandNewPassword2026!",
      });
      expect(newLoginRes.statusCode).toBe(200);
      expect(newLoginRes.body.success).toBe(true);
      expect(newLoginRes.body).toHaveProperty("token");
    });

    it("should generate code, reset candidate password, and allow candidate login with new password", async () => {
      // 1. Request code
      const forgotRes = await request(app).post("/api/auth/forgot-password").send({
        email: "jane.hope@university.edu",
        role: "candidate",
      });
      expect(forgotRes.statusCode).toBe(200);
      expect(forgotRes.body.success).toBe(true);
      expect(forgotRes.body).toHaveProperty("resetCode");
      candidateResetCode = forgotRes.body.resetCode;

      // 2. Reset password
      const resetRes = await request(app).post("/api/auth/reset-password").send({
        email: "jane.hope@university.edu",
        role: "candidate",
        code: candidateResetCode,
        newPassword: "CandidateBrandNewSecret2026!",
      });
      expect(resetRes.statusCode).toBe(200);
      expect(resetRes.body.success).toBe(true);

      // 3. Login with new password
      const loginRes = await request(app).post("/api/auth/candidate/login").send({
        email: "jane.hope@university.edu",
        password: "CandidateBrandNewSecret2026!",
      });
      expect(loginRes.statusCode).toBe(200);
      expect(loginRes.body.success).toBe(true);
      expect(loginRes.body).toHaveProperty("token");
    });

    it("should generate code, reset admin password, and allow admin login with new password", async () => {
      // 1. Request code
      const forgotRes = await request(app).post("/api/auth/forgot-password").send({
        email: "admin@election.gov",
        role: "admin",
      });
      expect(forgotRes.statusCode).toBe(200);
      expect(forgotRes.body.success).toBe(true);
      expect(forgotRes.body).toHaveProperty("resetCode");
      adminResetCode = forgotRes.body.resetCode;

      // 2. Reset password
      const resetRes = await request(app).post("/api/auth/reset-password").send({
        email: "admin@election.gov",
        role: "admin",
        code: adminResetCode,
        newPassword: "AdminNewVaultKey2026!",
      });
      expect(resetRes.statusCode).toBe(200);
      expect(resetRes.body.success).toBe(true);

      // 3. Login with new password
      const loginRes = await request(app).post("/api/auth/admin/login").send({
        email: "admin@election.gov",
        password: "AdminNewVaultKey2026!",
      });
      expect(loginRes.statusCode).toBe(200);
      expect(loginRes.body.success).toBe(true);
      expect(loginRes.body).toHaveProperty("token");
      adminToken = loginRes.body.token;
    });
  });

  describe("Admin Delete Management (Election, Candidate, Voter)", () => {
    it("should prevent non-admin voters from deleting elections, candidates, or voters", async () => {
      const Election = require("../src/models/Election");
      const Candidate = require("../src/models/Candidate");
      const User = require("../src/models/User");

      const elec = await Election.findOne();
      const cand = await Candidate.findOne();
      const voter = await User.findOne();

      const delElecRes = await request(app)
        .delete(`/api/elections/${elec._id}`)
        .set("Authorization", `Bearer ${voterToken}`);
      expect(delElecRes.statusCode).toBe(403);

      const delCandRes = await request(app)
        .delete(`/api/candidates/${cand._id}`)
        .set("Authorization", `Bearer ${voterToken}`);
      expect(delCandRes.statusCode).toBe(403);

      const delVoterRes = await request(app)
        .delete(`/api/voters/${voter._id}`)
        .set("Authorization", `Bearer ${voterToken}`);
      expect(delVoterRes.statusCode).toBe(403);
    });

    it("should allow admin to list all candidates and delete a candidate", async () => {
      const Candidate = require("../src/models/Candidate");
      const Election = require("../src/models/Election");

      const elec = await Election.findOne();
      const manualCand = await Candidate.create({
        name: "Manual Temp Candidate",
        party: "Independent",
        electionId: elec._id,
        onChainElectionId: elec.onChainElectionId,
        onChainId: 55,
        isApproved: true,
        approvalStatus: "approved",
      });

      const allRes = await request(app)
        .get("/api/candidates/admin/all")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(allRes.statusCode).toBe(200);
      expect(allRes.body.success).toBe(true);
      expect(allRes.body.candidates.some((c) => c.name === "Manual Temp Candidate")).toBe(true);

      const delRes = await request(app)
        .delete(`/api/candidates/${manualCand._id}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(delRes.statusCode).toBe(200);
      expect(delRes.body.success).toBe(true);

      const verify = await Candidate.findById(manualCand._id);
      expect(verify).toBeNull();
    });

    it("should allow admin to delete an election and cleanly unlink self-registered candidates", async () => {
      const Election = require("../src/models/Election");
      const Candidate = require("../src/models/Candidate");

      const elec = await Election.create({
        title: "Temporary Test Election",
        onChainElectionId: 777,
        phase: "Created",
      });

      const manualCand = await Candidate.create({
        name: "Ballot Only Cand",
        party: "Civic",
        electionId: elec._id,
        onChainElectionId: 777,
        onChainId: 1,
        isApproved: true,
        approvalStatus: "approved",
      });

      const selfCand = await Candidate.create({
        name: "Self Reg Cand",
        email: "self.reg.delete@university.edu",
        password: "Password123!",
        party: "Future",
        electionId: elec._id,
        onChainElectionId: 777,
        onChainId: 2,
        isApproved: true,
        approvalStatus: "approved",
        partyLocked: true,
      });

      const delRes = await request(app)
        .delete(`/api/elections/${elec._id}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(delRes.statusCode).toBe(200);
      expect(delRes.body.success).toBe(true);

      expect(await Election.findById(elec._id)).toBeNull();
      expect(await Candidate.findById(manualCand._id)).toBeNull();

      const updatedSelf = await Candidate.findById(selfCand._id);
      expect(updatedSelf).not.toBeNull();
      expect(updatedSelf.electionId).toBeNull();
      expect(updatedSelf.isApproved).toBe(false);
      expect(updatedSelf.approvalStatus).toBe("draft");
    });

    it("should allow admin to delete a voter", async () => {
      const User = require("../src/models/User");
      const voter = await User.findOne({ email: "john@example.com" });
      expect(voter).not.toBeNull();

      const delRes = await request(app)
        .delete(`/api/voters/${voter._id}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(delRes.statusCode).toBe(200);
      expect(delRes.body.success).toBe(true);

      expect(await User.findById(voter._id)).toBeNull();
    });
  });

  describe("Read-Only Explorer Default Demo Accounts", () => {
    let demoVoterToken = "";
    let demoCandidateToken = "";
    let demoAdminToken = "";

    it("should authenticate all 3 default explorer accounts and return isReadOnly=true", async () => {
      const voterLogin = await request(app).post("/api/auth/login").send({
        email: "demo.voter@election.gov",
        password: "DemoVoter123!",
      });
      expect(voterLogin.statusCode).toBe(200);
      expect(voterLogin.body.user.isReadOnly).toBe(true);
      demoVoterToken = voterLogin.body.token;

      const candLogin = await request(app).post("/api/auth/candidate/login").send({
        email: "demo.candidate@election.gov",
        password: "DemoCandidate123!",
      });
      expect(candLogin.statusCode).toBe(200);
      expect(candLogin.body.candidate.isReadOnly).toBe(true);
      demoCandidateToken = candLogin.body.token;

      const adminLogin = await request(app).post("/api/auth/admin/login").send({
        email: "demo.admin@election.gov",
        password: "DemoAdmin123!",
      });
      expect(adminLogin.statusCode).toBe(200);
      expect(adminLogin.body.admin.isReadOnly).toBe(true);
      demoAdminToken = adminLogin.body.token;
    });

    it("should allow explorer accounts to browse portal GET routes across all roles", async () => {
      const voterMe = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${demoVoterToken}`);
      expect(voterMe.statusCode).toBe(200);
      expect(voterMe.body.role).toBe("voter");
      expect(voterMe.body.profile.isReadOnly).toBe(true);

      const voterProfile = await request(app)
        .get("/api/voters/profile")
        .set("Authorization", `Bearer ${demoVoterToken}`);
      expect(voterProfile.statusCode).toBe(200);
      expect(voterProfile.body.voter.isReadOnly).toBe(true);

      const candProfile = await request(app)
        .get("/api/candidates/me")
        .set("Authorization", `Bearer ${demoCandidateToken}`);
      expect(candProfile.statusCode).toBe(200);
      expect(candProfile.body.candidate.isReadOnly).toBe(true);

      const adminVoters = await request(app)
        .get("/api/voters")
        .set("Authorization", `Bearer ${demoAdminToken}`);
      expect(adminVoters.statusCode).toBe(200);

      const adminAllCands = await request(app)
        .get("/api/candidates/admin/all")
        .set("Authorization", `Bearer ${demoAdminToken}`);
      expect(adminAllCands.statusCode).toBe(200);

      const adminLogs = await request(app)
        .get("/api/audit/logs")
        .set("Authorization", `Bearer ${demoAdminToken}`);
      expect(adminLogs.statusCode).toBe(200);
    });

    it("should block all state-changing actions and password changes for explorer accounts (403)", async () => {
      const Election = require("../src/models/Election");
      const elec = await Election.findOne();

      // Voter explorer blocked from casting vote & linking wallet & password reset
      const voteRes = await request(app)
        .post("/api/votes/relayer")
        .set("Authorization", `Bearer ${demoVoterToken}`)
        .send({ electionId: 1, candidateId: 1 });
      expect(voteRes.statusCode).toBe(403);
      expect(voteRes.body.message).toMatch(/read-only/i);

      const walletRes = await request(app)
        .post("/api/voters/link-wallet")
        .set("Authorization", `Bearer ${demoVoterToken}`)
        .send({ walletAddress: "0x0000000000000000000000000000000000000001" });
      expect(walletRes.statusCode).toBe(403);

      const voterForgotRes = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "demo.voter@election.gov", role: "voter" });
      expect(voterForgotRes.statusCode).toBe(403);

      // Candidate explorer blocked from updating profile or requesting approval
      const candUpdateRes = await request(app)
        .put("/api/candidates/me")
        .set("Authorization", `Bearer ${demoCandidateToken}`)
        .send({ party: "Tampered Party" });
      expect(candUpdateRes.statusCode).toBe(403);

      const candReqRes = await request(app)
        .post("/api/candidates/me/request-approval")
        .set("Authorization", `Bearer ${demoCandidateToken}`);
      expect(candReqRes.statusCode).toBe(403);

      // Admin explorer blocked from creating/updating/deleting elections, candidates, and voters
      const createElecRes = await request(app)
        .post("/api/elections")
        .set("Authorization", `Bearer ${demoAdminToken}`)
        .send({ title: "Blocked Explorer Election" });
      expect(createElecRes.statusCode).toBe(403);

      if (elec) {
        const phaseRes = await request(app)
          .patch(`/api/elections/${elec._id}/phase`)
          .set("Authorization", `Bearer ${demoAdminToken}`)
          .send({ phase: "Voting" });
        expect(phaseRes.statusCode).toBe(403);

        const delElecRes = await request(app)
          .delete(`/api/elections/${elec._id}`)
          .set("Authorization", `Bearer ${demoAdminToken}`);
        expect(delElecRes.statusCode).toBe(403);
      }

      const kycUpdateBlocked = await request(app)
        .put("/api/voters/profile")
        .set("Authorization", `Bearer ${demoVoterToken}`)
        .send({ fullName: "Tampered" });
      expect(kycUpdateBlocked.statusCode).toBe(403);

      const directVoteBlocked = await request(app)
        .post("/api/votes/direct-record")
        .set("Authorization", `Bearer ${demoVoterToken}`)
        .send({ electionId: 1, txHash: "0x123" });
      expect(directVoteBlocked.statusCode).toBe(403);

      const notifReadBlocked = await request(app)
        .post("/api/voters/notifications/read")
        .set("Authorization", `Bearer ${demoVoterToken}`)
        .send({ ids: ["test"] });
      expect(notifReadBlocked.statusCode).toBe(403);
    });
  });

  describe("Public Voter Portal Features (KYC, Turnout Privacy, Receipt Verifier, History, Notifications, Ended Results)", () => {
    let portalVoterToken = "";
    let portalVoterId = "";
    let portalElectionId = 1888;
    const sampleTxHash = "0x" + "a".repeat(64);

    it("should register a portal voter, track KYC rejection & ID resubmission, and approve", async () => {
      const portalCode = await fetchRegistrationCode("portal.voter@university.edu", "voter");
      const regRes = await request(app).post("/api/auth/register").send({
        fullName: "Portal Voter",
        email: "portal.voter@university.edu",
        govId: "PORTAL-2026-88",
        password: "PortalPassword123!",
        verificationCode: portalCode,
      });
      expect(regRes.statusCode).toBe(201);
      portalVoterToken = regRes.body.token;
      portalVoterId = regRes.body.user.id;

      // Profile KYC tracker initially shows idSubmitted=true, adminApproved=false
      const prof1 = await request(app)
        .get("/api/voters/profile")
        .set("Authorization", `Bearer ${portalVoterToken}`);
      expect(prof1.statusCode).toBe(200);
      expect(prof1.body.kycSteps.registered).toBe(true);
      expect(prof1.body.kycSteps.idSubmitted).toBe(true);
      expect(prof1.body.kycSteps.adminApproved).toBe(false);

      // Admin rejects KYC with reason
      const rejRes = await request(app)
        .post(`/api/voters/${portalVoterId}/reject`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ reason: "Blurry ID photo" });
      expect(rejRes.statusCode).toBe(200);
      expect(rejRes.body.voter.kycStatus).toBe("rejected");

      // Voter updates profile & re-uploads ID proof
      const resubRes = await request(app)
        .put("/api/voters/profile")
        .set("Authorization", `Bearer ${portalVoterToken}`)
        .send({
          fullName: "Portal Voter Updated",
          govId: "PORTAL-2026-89",
          idProofName: "student-id-clear.pdf",
          idProofNote: "Clear scanned student ID",
        });
      expect(resubRes.statusCode).toBe(200);
      expect(resubRes.body.voter.kycStatus).toBe("id_submitted");
      expect(resubRes.body.voter.idProofName).toBe("student-id-clear.pdf");

      // Admin approves resubmitted KYC
      const appRes = await request(app)
        .post(`/api/voters/${portalVoterId}/approve`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});
      expect(appRes.statusCode).toBe(200);
      expect(appRes.body.voter.isApproved).toBe(true);
      expect(appRes.body).toHaveProperty("txHash");

      // Verify GET /api/voters attaches syncTxHash from VOTER_HASH_SYNCED logs for copy/display
      const AuditLog = require("../src/models/AuditLog");
      const mockSyncTx = "0x" + "b".repeat(64);
      await AuditLog.create({
        action: "VOTER_HASH_SYNCED",
        actorId: "admin",
        actorRole: "admin",
        electionId: portalElectionId,
        voterHash: appRes.body.voter.voterHash,
        txHash: mockSyncTx,
      });

      const listRes = await request(app)
        .get("/api/voters")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(listRes.statusCode).toBe(200);
      const portalVoterRow = listRes.body.voters.find((v) => v._id === portalVoterId);
      expect(portalVoterRow.syncTxHash).toBe(mockSyncTx);
    });

    it("should expose aggregate turnout without leaking candidate counts before Ended, then unlock Ended results", async () => {
      const Election = require("../src/models/Election");
      const Candidate = require("../src/models/Candidate");

      const elec = await Election.create({
        title: "2026 Public Portal Demo Ballot",
        onChainElectionId: portalElectionId,
        phase: "Voting",
        startDate: new Date(Date.now() - 3600000),
        endDate: new Date(Date.now() + 3600000),
        totalVotes: 0,
      });

      await Candidate.create([
        {
          name: "Candidate Alpha",
          party: "Alpha Party",
          manifesto: "Open libraries; Affordable transit",
          electionId: elec._id,
          onChainElectionId: portalElectionId,
          onChainId: 1,
          voteCount: 5,
          isApproved: true,
          approvalStatus: "approved",
        },
        {
          name: "Candidate Beta",
          party: "Beta Party",
          manifesto: "Digital governance",
          electionId: elec._id,
          onChainElectionId: portalElectionId,
          onChainId: 2,
          voteCount: 2,
          isApproved: true,
          approvalStatus: "approved",
        },
      ]);

      // Before Ended: voter gets turnout stats, NO candidate voteCount, and public-results is 403
      const elecGetRes = await request(app)
        .get(`/api/elections/${portalElectionId}`)
        .set("Authorization", `Bearer ${portalVoterToken}`);
      expect(elecGetRes.statusCode).toBe(200);
      expect(elecGetRes.body.election.turnout).toBeDefined();
      expect(elecGetRes.body.election.candidates[0].voteCount).toBeUndefined();

      const lockedRes = await request(app)
        .get(`/api/elections/${portalElectionId}/public-results`)
        .set("Authorization", `Bearer ${portalVoterToken}`);
      expect(lockedRes.statusCode).toBe(403);

      // Record direct MetaMask ballot & check anonymized receipt + verifier + history + notifications
      const recordRes = await request(app)
        .post("/api/votes/direct-record")
        .set("Authorization", `Bearer ${portalVoterToken}`)
        .send({
          electionId: portalElectionId,
          candidateId: 1,
          txHash: sampleTxHash,
          blockNumber: 42,
        });
      expect(recordRes.statusCode).toBe(200);
      expect(recordRes.body.receipt.txHash).toBe(sampleTxHash);
      expect(recordRes.body.receipt.candidateName).toBeUndefined();

      const verifyRes = await request(app)
        .get(`/api/votes/verify/${sampleTxHash}`)
        .set("Authorization", `Bearer ${portalVoterToken}`);
      expect(verifyRes.statusCode).toBe(200);
      expect(verifyRes.body.verified).toBe(true);
      expect(verifyRes.body.receipt.blockNumber).toBe(42);
      expect(verifyRes.body.receipt.candidateName).toBeUndefined();

      // Admin voter list includes anonymized ballot receiptHash without exposing candidate choice
      const adminListWithReceipt = await request(app)
        .get("/api/voters")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(adminListWithReceipt.statusCode).toBe(200);
      const votedVoterRow = adminListWithReceipt.body.voters.find((v) => v._id === portalVoterId);
      expect(votedVoterRow.receiptHash).toBe(sampleTxHash);

      const historyRes = await request(app)
        .get("/api/votes/history")
        .set("Authorization", `Bearer ${portalVoterToken}`);
      expect(historyRes.statusCode).toBe(200);
      const entry = historyRes.body.history.find((h) => h.onChainElectionId === portalElectionId);
      expect(entry.participated).toBe(true);
      expect(entry.receipt.txHash).toBe(sampleTxHash);

      const notifRes = await request(app)
        .get("/api/voters/notifications")
        .set("Authorization", `Bearer ${portalVoterToken}`);
      expect(notifRes.statusCode).toBe(200);
      expect(notifRes.body.notifications.some((n) => n.type === "kyc_approved")).toBe(true);
      expect(notifRes.body.notifications.some((n) => n.type === "vote_receipt")).toBe(true);

      // Move election to Ended -> public results unlock automatically with winner & VoteCast hashes
      elec.phase = "Ended";
      await elec.save();

      const unlockedRes = await request(app)
        .get(`/api/elections/${portalElectionId}/public-results`)
        .set("Authorization", `Bearer ${portalVoterToken}`);
      expect(unlockedRes.statusCode).toBe(200);
      expect(unlockedRes.body.winner.hasWinner).toBe(true);
      expect(unlockedRes.body.winner.candidates[0].name).toBe("Candidate Alpha");
      expect(unlockedRes.body.voteCastEvents.some((ev) => ev.txHash === sampleTxHash)).toBe(true);

      // Candidate can also view voting history, verify receipts, and view ended results like a voter
      const demoCandLogin = await request(app).post("/api/auth/candidate/login").send({
        email: "demo.candidate@election.gov",
        password: "DemoCandidate123!",
      });
      expect(demoCandLogin.statusCode).toBe(200);
      const demoCandToken = demoCandLogin.body.token;

      const candHistoryRes = await request(app)
        .get("/api/votes/history")
        .set("Authorization", `Bearer ${demoCandToken}`);
      expect(candHistoryRes.statusCode).toBe(200);
      expect(candHistoryRes.body.history.some((h) => h.onChainElectionId === portalElectionId)).toBe(true);

      const candEndedRes = await request(app)
        .get(`/api/elections/${portalElectionId}/public-results`)
        .set("Authorization", `Bearer ${demoCandToken}`);
      expect(candEndedRes.statusCode).toBe(200);
      expect(candEndedRes.body.winner.hasWinner).toBe(true);
      expect(candEndedRes.body.winner.candidates[0].name).toBe("Candidate Alpha");

      const candVerifyRes = await request(app)
        .get(`/api/votes/verify/${sampleTxHash}`)
        .set("Authorization", `Bearer ${demoCandToken}`);
      expect(candVerifyRes.statusCode).toBe(200);
      expect(candVerifyRes.body.verified).toBe(true);

      // Candidate whose email matches a voter account also sees their linked ballot receipt in history
      const linkedCandCode = await fetchRegistrationCode("portal.voter@university.edu", "candidate");
      const linkedCandReg = await request(app).post("/api/auth/candidate/register").send({
        name: "Dual Role Candidate",
        email: "portal.voter@university.edu",
        password: "DualPassword123!",
        party: "Civic Unity",
        verificationCode: linkedCandCode,
      });
      expect(linkedCandReg.statusCode).toBe(201);

      const linkedCandHist = await request(app)
        .get("/api/votes/history")
        .set("Authorization", `Bearer ${linkedCandReg.body.token}`);
      expect(linkedCandHist.statusCode).toBe(200);
      const linkedEntry = linkedCandHist.body.history.find(
        (h) => h.onChainElectionId === portalElectionId
      );
      expect(linkedEntry.participated).toBe(true);
      expect(linkedEntry.receipt.txHash).toBe(sampleTxHash);
    });
  });
});
