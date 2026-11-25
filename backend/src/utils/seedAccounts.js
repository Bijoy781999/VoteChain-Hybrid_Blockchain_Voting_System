const User = require("../models/User");
const Admin = require("../models/Admin");
const Candidate = require("../models/Candidate");
const { generateVoterHash, hashSensitiveId } = require("./cryptoHash");

const DEMO_EXPLORER_ACCOUNTS = {
  voter: {
    fullName: "Public Portal Explorer (Demo)",
    email: "demo.voter@election.gov",
    govId: "DEMO-EXPLORER-VOTER-001",
    password: "DemoVoter123!",
  },
  candidate: {
    name: "Candidate Explorer (Demo)",
    email: "demo.candidate@election.gov",
    password: "DemoCandidate123!",
    party: "Explorer Civic Alliance",
    manifesto:
      "Read-only demo candidate preview showcasing nomination status, manifesto editing, and election options.",
  },
  admin: {
    fullName: "Admin Portal Explorer (Demo)",
    email: "demo.admin@election.gov",
    password: "DemoAdmin123!",
  },
};

async function ensureDemoVoter() {
  const cfg = DEMO_EXPLORER_ACCOUNTS.voter;
  let existing = await User.findOne({ email: cfg.email });
  if (!existing) {
    existing = await User.create({
      fullName: cfg.fullName,
      email: cfg.email,
      hashedGovId: hashSensitiveId(cfg.govId),
      voterHash: generateVoterHash(cfg.govId),
      password: cfg.password,
      isApproved: true,
      kycStatus: "synced_on_chain",
      approvedAt: new Date(),
      isReadOnly: true,
      role: "voter",
    });
  } else if (!existing.isReadOnly) {
    existing.isReadOnly = true;
    await existing.save();
  }
  return existing;
}

async function ensureDemoCandidate() {
  const cfg = DEMO_EXPLORER_ACCOUNTS.candidate;
  let existing = await Candidate.findOne({ email: cfg.email });
  if (!existing) {
    existing = await Candidate.create({
      name: cfg.name,
      email: cfg.email,
      password: cfg.password,
      party: cfg.party,
      manifesto: cfg.manifesto,
      isApproved: false,
      approvalStatus: "draft",
      partyLocked: false,
      isReadOnly: true,
      role: "candidate",
    });
  } else if (!existing.isReadOnly) {
    existing.isReadOnly = true;
    await existing.save();
  }
  return existing;
}

async function ensureDemoAdmin() {
  const cfg = DEMO_EXPLORER_ACCOUNTS.admin;
  let existing = await Admin.findOne({ email: cfg.email });
  if (!existing) {
    existing = await Admin.create({
      fullName: cfg.fullName,
      email: cfg.email,
      password: cfg.password,
      role: "admin",
      isReadOnly: true,
    });
  } else if (!existing.isReadOnly) {
    existing.isReadOnly = true;
    await existing.save();
  }
  return existing;
}

/**
 * Ensures the matching demo explorer account exists when logging in with its email.
 */
async function ensureDemoAccountByEmailAndRole(email, role) {
  if (!email) return;
  const normalized = email.toLowerCase().trim();
  if (role === "voter" && normalized === DEMO_EXPLORER_ACCOUNTS.voter.email) {
    await ensureDemoVoter();
  } else if (role === "candidate" && normalized === DEMO_EXPLORER_ACCOUNTS.candidate.email) {
    await ensureDemoCandidate();
  } else if (role === "admin" && normalized === DEMO_EXPLORER_ACCOUNTS.admin.email) {
    await ensureDemoAdmin();
  }
}

async function seedDefaultAccounts() {
  try {
    // Seed operational admin if no non-demo admin exists yet
    const fullAdminCount = await Admin.countDocuments({ isReadOnly: { $ne: true } });
    if (fullAdminCount === 0) {
      await Admin.create({
        fullName: "Chief Election Commissioner",
        email: "admin@election.gov",
        password: "AdminPassword123!",
        role: "admin",
        isReadOnly: false,
      });
      console.log("Default Admin Account Initialized: admin@election.gov / AdminPassword123!");
    }

    // Ensure read-only explorer accounts exist for all 3 portals
    await ensureDemoVoter();
    await ensureDemoCandidate();
    await ensureDemoAdmin();
    console.log("Read-Only Explorer Accounts ready for Voter, Candidate, and Admin portals.");
  } catch (err) {
    console.warn("Could not check/seed default accounts:", err.message);
  }
}

module.exports = {
  DEMO_EXPLORER_ACCOUNTS,
  seedDefaultAccounts,
  ensureDemoAccountByEmailAndRole,
};
