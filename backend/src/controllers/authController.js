const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const Admin = require("../models/Admin");
const Candidate = require("../models/Candidate");
const Election = require("../models/Election");
const AuditLog = require("../models/AuditLog");
const VerificationCode = require("../models/VerificationCode");
const { generateVoterHash, hashSensitiveId } = require("../utils/cryptoHash");
const { ensureDemoAccountByEmailAndRole } = require("../utils/seedAccounts");
const env = require("../config/env");

const generateToken = (payload) => {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
};

const ROLE_MODELS = {
  voter: User,
  candidate: Candidate,
  admin: Admin,
};

const generateSixDigitCode = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const hashVerificationCode = (rawCode) =>
  crypto.createHash("sha256").update(String(rawCode).trim()).digest("hex");

const verifyRegistrationCode = async (normalizedEmail, role, rawCode) => {
  if (!rawCode || !String(rawCode).trim()) {
    return {
      valid: false,
      message:
        "6-digit registration verification code is required. Please request a verification code first.",
    };
  }

  const codeHash = hashVerificationCode(rawCode);
  const record = await VerificationCode.findOne({
    email: normalizedEmail,
    role,
    codeHash,
    expiresAt: { $gt: new Date() },
  });

  if (!record) {
    return {
      valid: false,
      message:
        "Invalid or expired registration verification code. Please request a new code.",
    };
  }

  return { valid: true, record };
};

// Request 6-digit email verification code prior to registration (Voter, Candidate, Admin)
const requestRegistrationCode = async (req, res, next) => {
  try {
    const { email, role, govId } = req.body;
    if (!email || !role) {
      return res.status(400).json({
        success: false,
        message: "Email and role are required",
      });
    }

    const normalizedRole = role.toLowerCase().trim();
    const Model = ROLE_MODELS[normalizedRole];
    if (!Model) {
      return res.status(400).json({
        success: false,
        message: "Role must be 'voter', 'candidate', or 'admin'",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    const existing = await Model.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "An account with this email address already exists",
      });
    }

    if (normalizedRole === "voter" && govId && String(govId).trim()) {
      const existingGovId = await User.findOne({
        hashedGovId: hashSensitiveId(String(govId).trim()),
      });
      if (existingGovId) {
        return res.status(400).json({
          success: false,
          message: "An account with this government/student ID already exists",
        });
      }
    }

    const verificationCode = generateSixDigitCode();
    const codeHash = hashVerificationCode(verificationCode);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await VerificationCode.findOneAndUpdate(
      { email: normalizedEmail, role: normalizedRole },
      { codeHash, expiresAt },
      { upsert: true, new: true }
    );

    await AuditLog.create({
      action: "REGISTRATION_CODE_REQUESTED",
      actorId: normalizedEmail,
      actorRole: normalizedRole,
      details: { email: normalizedEmail, role: normalizedRole },
    });

    res.status(200).json({
      success: true,
      message: `Registration verification code generated for ${normalizedEmail}. It expires in 15 minutes.`,
      verificationCode, // Provided for UI display / auto-fill convenience
    });
  } catch (error) {
    next(error);
  }
};

// Voter Registration (Public, no wallet required — requires email verification code)
const registerVoter = async (req, res, next) => {
  try {
    const {
      fullName,
      email,
      govId,
      password,
      walletAddress,
      verificationCode,
      code,
    } = req.body;

    if (!fullName || !email || !govId || !password) {
      return res.status(400).json({
        success: false,
        message: "Full name, email, government/student ID, and password are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "An account with this email address already exists",
      });
    }

    const hashedGovId = hashSensitiveId(govId);
    const existingGovId = await User.findOne({ hashedGovId });
    if (existingGovId) {
      return res.status(400).json({
        success: false,
        message: "An account with this government/student ID already exists",
      });
    }

    const codeCheck = await verifyRegistrationCode(
      normalizedEmail,
      "voter",
      verificationCode || code
    );
    if (!codeCheck.valid) {
      return res.status(400).json({
        success: false,
        message: codeCheck.message,
      });
    }

    // Generate deterministic on-chain voterHash
    const voterHash = generateVoterHash(govId);

    const user = await User.create({
      fullName,
      email: normalizedEmail,
      hashedGovId,
      voterHash,
      password,
      walletAddress: walletAddress ? walletAddress.trim().toLowerCase() : null,
      isApproved: false,
      kycStatus: "id_submitted",
    });

    await VerificationCode.deleteOne({ _id: codeCheck.record._id });

    await AuditLog.create({
      action: "VOTER_REGISTERED",
      actorId: user._id.toString(),
      actorRole: "voter",
      voterHash: user.voterHash,
      details: { email: user.email, fullName: user.fullName },
    });

    const token = generateToken({
      id: user._id,
      role: "voter",
      email: user.email,
      voterHash: user.voterHash,
      isApproved: user.isApproved,
    });

    res.status(201).json({
      success: true,
      message: "Voter registered successfully. Pending administrator verification.",
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        voterHash: user.voterHash,
        walletAddress: user.walletAddress,
        isApproved: user.isApproved,
        kycStatus: user.kycStatus || "id_submitted",
        rejectionReason: user.rejectionReason || "",
        role: "voter",
      },
    });
  } catch (error) {
    next(error);
  }
};

// Voter Login
const loginVoter = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    await ensureDemoAccountByEmailAndRole(normalizedEmail, "voter");

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = generateToken({
      id: user._id,
      role: "voter",
      email: user.email,
      voterHash: user.voterHash,
      isApproved: user.isApproved,
      isReadOnly: Boolean(user.isReadOnly),
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        voterHash: user.voterHash,
        walletAddress: user.walletAddress,
        isApproved: user.isApproved,
        kycStatus: user.kycStatus || (user.isApproved ? "approved" : "id_submitted"),
        rejectionReason: user.rejectionReason || "",
        idProofName: user.idProofName || "",
        idProofNote: user.idProofNote || "",
        hasVotedElections: user.hasVotedElections,
        role: "voter",
        isReadOnly: Boolean(user.isReadOnly),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Admin Registration / First-time setup (Standard email & password; requires verification code)
const registerAdmin = async (req, res, next) => {
  try {
    const { fullName, email, password, walletAddress, verificationCode, code } = req.body;

    let normalizedWallet = null;
    if (walletAddress && walletAddress.trim()) {
      normalizedWallet = walletAddress.trim().toLowerCase();
      if (!/^0x[a-f0-9]{40}$/.test(normalizedWallet)) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid Ethereum MetaMask wallet address (0x...)",
        });
      }

      const existingWallet = await Admin.findOne({ walletAddress: normalizedWallet });
      if (existingWallet) {
        return res.status(400).json({
          success: false,
          message: "An admin account is already registered with this MetaMask wallet address",
        });
      }
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingAdmin = await Admin.findOne({ email: normalizedEmail });
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: "Admin with this email already exists",
      });
    }

    const codeCheck = await verifyRegistrationCode(
      normalizedEmail,
      "admin",
      verificationCode || code
    );
    if (!codeCheck.valid) {
      return res.status(400).json({
        success: false,
        message: codeCheck.message,
      });
    }

    const admin = await Admin.create({
      fullName,
      email: normalizedEmail,
      password,
      walletAddress: normalizedWallet,
      role: "admin",
    });

    await VerificationCode.deleteOne({ _id: codeCheck.record._id });

    const token = generateToken({
      id: admin._id,
      role: "admin",
      email: admin.email,
      walletAddress: admin.walletAddress,
      isReadOnly: Boolean(admin.isReadOnly),
    });

    res.status(201).json({
      success: true,
      message: "Admin registered successfully",
      token,
      admin: {
        id: admin._id,
        fullName: admin.fullName,
        email: admin.email,
        walletAddress: admin.walletAddress,
        role: "admin",
        isReadOnly: Boolean(admin.isReadOnly),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Admin Login
const loginAdmin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();
    await ensureDemoAccountByEmailAndRole(normalizedEmail, "admin");

    const admin = await Admin.findOne({ email: normalizedEmail });
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin credentials",
      });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin credentials",
      });
    }

    const token = generateToken({
      id: admin._id,
      role: "admin",
      email: admin.email,
      walletAddress: admin.walletAddress,
      isReadOnly: Boolean(admin.isReadOnly),
    });

    res.status(200).json({
      success: true,
      message: "Admin authenticated successfully",
      token,
      admin: {
        id: admin._id,
        fullName: admin.fullName,
        email: admin.email,
        walletAddress: admin.walletAddress,
        role: "admin",
        isReadOnly: Boolean(admin.isReadOnly),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Candidate Registration (requires email verification code)
const registerCandidate = async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      party,
      manifesto,
      electionId,
      verificationCode,
      code,
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Full name, email, and password are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingCandidate = await Candidate.findOne({ email: normalizedEmail });
    if (existingCandidate) {
      return res.status(400).json({
        success: false,
        message: "A candidate account with this email address already exists",
      });
    }

    const codeCheck = await verifyRegistrationCode(
      normalizedEmail,
      "candidate",
      verificationCode || code
    );
    if (!codeCheck.valid) {
      return res.status(400).json({
        success: false,
        message: codeCheck.message,
      });
    }

    let linkedElection = null;
    if (electionId) {
      linkedElection = (await Election.findById(electionId)) || (await Election.findOne({ onChainElectionId: Number(electionId) }));
    }

    const candidate = await Candidate.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      party: party ? party.trim() : "Independent",
      manifesto: manifesto ? manifesto.trim() : "",
      electionId: linkedElection ? linkedElection._id : null,
      onChainElectionId: linkedElection ? linkedElection.onChainElectionId : null,
      isApproved: false,
      approvalStatus: "draft",
      partyLocked: false,
      role: "candidate",
    });

    await VerificationCode.deleteOne({ _id: codeCheck.record._id });

    await AuditLog.create({
      action: "CANDIDATE_REGISTERED",
      actorId: candidate._id.toString(),
      actorRole: "candidate",
      details: { name: candidate.name, email: candidate.email, party: candidate.party },
    });

    const token = generateToken({
      id: candidate._id,
      role: "candidate",
      email: candidate.email,
      name: candidate.name,
    });

    res.status(201).json({
      success: true,
      message: "Candidate registered successfully. Please complete your profile and request approval.",
      token,
      candidate: {
        id: candidate._id,
        name: candidate.name,
        email: candidate.email,
        party: candidate.party,
        manifesto: candidate.manifesto,
        electionId: candidate.electionId,
        isApproved: candidate.isApproved,
        approvalStatus: candidate.approvalStatus,
        partyLocked: candidate.partyLocked,
        adminFeedback: candidate.adminFeedback,
        role: "candidate",
      },
    });
  } catch (error) {
    next(error);
  }
};

// Candidate Login
const loginCandidate = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    await ensureDemoAccountByEmailAndRole(normalizedEmail, "candidate");
    const candidate = await Candidate.findOne({ email: normalizedEmail });

    if (!candidate || !candidate.password) {
      return res.status(401).json({
        success: false,
        message: "Invalid candidate email or password",
      });
    }

    const isMatch = await candidate.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid candidate email or password",
      });
    }

    const token = generateToken({
      id: candidate._id,
      role: "candidate",
      email: candidate.email,
      name: candidate.name,
      isReadOnly: Boolean(candidate.isReadOnly),
    });

    res.status(200).json({
      success: true,
      message: "Candidate logged in successfully",
      token,
      candidate: {
        id: candidate._id,
        name: candidate.name,
        email: candidate.email,
        party: candidate.party,
        manifesto: candidate.manifesto,
        photoUrl: candidate.photoUrl,
        electionId: candidate.electionId,
        onChainElectionId: candidate.onChainElectionId,
        isApproved: candidate.isApproved,
        approvalStatus: candidate.approvalStatus,
        partyLocked: candidate.partyLocked,
        adminFeedback: candidate.adminFeedback,
        role: "candidate",
        isReadOnly: Boolean(candidate.isReadOnly),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Current authenticated user profile
const getCurrentUser = async (req, res, next) => {
  try {
    if (req.user.role === "admin") {
      const admin = await Admin.findById(req.user.id).select("-password");
      if (!admin) {
        return res.status(404).json({ success: false, message: "Admin account not found" });
      }
      return res.status(200).json({ success: true, profile: admin, role: "admin" });
    }

    if (req.user.role === "candidate") {
      const candidate = await Candidate.findById(req.user.id).select("-password").populate("electionId");
      if (!candidate) {
        return res.status(404).json({ success: false, message: "Candidate not found" });
      }
      return res.status(200).json({
        success: true,
        profile: candidate,
        role: "candidate",
      });
    }

    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({
      success: true,
      role: "voter",
      profile: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        voterHash: user.voterHash,
        walletAddress: user.walletAddress,
        isApproved: user.isApproved,
        kycStatus: user.kycStatus || (user.isApproved ? "approved" : "id_submitted"),
        rejectionReason: user.rejectionReason || "",
        idProofName: user.idProofName || "",
        idProofNote: user.idProofNote || "",
        hasVotedElections: user.hasVotedElections,
        role: "voter",
        isReadOnly: Boolean(user.isReadOnly),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Forgot Password: generate 6-digit verification code
const forgotPassword = async (req, res, next) => {
  try {
    const { email, role } = req.body;
    if (!email || !role) {
      return res.status(400).json({
        success: false,
        message: "Email and role are required",
      });
    }

    const normalizedRole = role.toLowerCase().trim();
    if (!["voter", "candidate", "admin"].includes(normalizedRole)) {
      return res.status(400).json({
        success: false,
        message: "Role must be 'voter', 'candidate', or 'admin'",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    let account = null;

    if (normalizedRole === "voter") {
      account = await User.findOne({ email: normalizedEmail });
    } else if (normalizedRole === "candidate") {
      account = await Candidate.findOne({ email: normalizedEmail });
    } else if (normalizedRole === "admin") {
      account = await Admin.findOne({ email: normalizedEmail });
    }

    if (!account) {
      return res.status(404).json({
        success: false,
        message: `No registered ${normalizedRole} account found with that email address.`,
      });
    }

    if (account.isReadOnly) {
      return res.status(403).json({
        success: false,
        message: "Demo explorer accounts are read-only and cannot change passwords.",
      });
    }

    // Generate secure 6-digit verification code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedCode = crypto.createHash("sha256").update(resetCode).digest("hex");

    account.resetPasswordToken = hashedCode;
    account.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
    await account.save();

    await AuditLog.create({
      action: "PASSWORD_RESET_REQUESTED",
      actorId: account._id.toString(),
      actorRole: normalizedRole,
      details: { email: account.email, role: normalizedRole },
    });

    res.status(200).json({
      success: true,
      message: `Password reset verification code generated for ${account.email}. It expires in 15 minutes.`,
      resetCode, // Provided for user display / dev autofill convenience
    });
  } catch (error) {
    next(error);
  }
};

// Reset Password: verify 6-digit code and set new password
const resetPassword = async (req, res, next) => {
  try {
    const { email, role, code, newPassword, confirmPassword } = req.body;

    if (!email || !role || !code || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email, role, verification code, and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long",
      });
    }

    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "New password and re-entered password do not match",
      });
    }

    const normalizedRole = role.toLowerCase().trim();
    if (!["voter", "candidate", "admin"].includes(normalizedRole)) {
      return res.status(400).json({
        success: false,
        message: "Role must be 'voter', 'candidate', or 'admin'",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const hashedCode = crypto.createHash("sha256").update(code.trim()).digest("hex");

    let Model = null;
    if (normalizedRole === "voter") Model = User;
    else if (normalizedRole === "candidate") Model = Candidate;
    else if (normalizedRole === "admin") Model = Admin;

    const account = await Model.findOne({
      email: normalizedEmail,
      resetPasswordToken: hashedCode,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!account) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired password reset verification code. Please request a new code.",
      });
    }

    if (account.isReadOnly) {
      return res.status(403).json({
        success: false,
        message: "Demo explorer accounts are read-only and cannot change passwords.",
      });
    }

    // Set new password (pre-save hook will hash with bcrypt)
    account.password = newPassword;
    account.resetPasswordToken = null;
    account.resetPasswordExpires = null;
    await account.save();

    await AuditLog.create({
      action: "PASSWORD_RESET_COMPLETED",
      actorId: account._id.toString(),
      actorRole: normalizedRole,
      details: { email: account.email, role: normalizedRole },
    });

    res.status(200).json({
      success: true,
      message: `Password has been reset successfully for your ${normalizedRole} account! You can now log in.`,
    });
  } catch (error) {
    next(error);
  }
};

// Link or update optional MetaMask wallet address on Admin profile
const linkAdminWallet = async (req, res, next) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress || !walletAddress.trim()) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid MetaMask wallet address (0x...)",
      });
    }

    const normalizedWallet = walletAddress.trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(normalizedWallet)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid Ethereum MetaMask wallet address (0x...)",
      });
    }

    const existingWalletOwner = await Admin.findOne({
      walletAddress: normalizedWallet,
      _id: { $ne: req.user.id },
    });
    if (existingWalletOwner) {
      return res.status(400).json({
        success: false,
        message: "This MetaMask wallet address is already linked to another admin account.",
      });
    }

    const admin = await Admin.findById(req.user.id);
    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin account not found" });
    }

    admin.walletAddress = normalizedWallet;
    await admin.save();

    await AuditLog.create({
      action: "ADMIN_WALLET_LINKED",
      actorId: admin._id.toString(),
      actorRole: "admin",
      details: { email: admin.email, walletAddress: normalizedWallet },
    });

    const safeAdmin = await Admin.findById(admin._id).select("-password");

    res.status(200).json({
      success: true,
      message: "MetaMask wallet linked to your Admin profile successfully",
      admin: safeAdmin,
    });
  } catch (error) {
    next(error);
  }
};

// Admin: List all Admin accounts
const listAdmins = async (req, res, next) => {
  try {
    const admins = await Admin.find()
      .select("-password -resetPasswordToken -resetPasswordExpires")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: admins.length,
      admins,
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Delete any Admin account (including Admin's own account)
const deleteAdminAccount = async (req, res, next) => {
  try {
    const { adminId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(404).json({ success: false, message: "Admin account not found" });
    }

    const targetAdmin = await Admin.findById(adminId);
    if (!targetAdmin) {
      return res.status(404).json({ success: false, message: "Admin account not found" });
    }

    if (targetAdmin.isReadOnly) {
      return res.status(403).json({
        success: false,
        message: "Read-only demo accounts are protected and cannot be deleted by anyone.",
      });
    }

    const selfDeleted = targetAdmin._id.toString() === req.user.id.toString();

    await Admin.deleteOne({ _id: targetAdmin._id });
    await VerificationCode.deleteMany({ email: targetAdmin.email, role: "admin" });

    await AuditLog.create({
      action: "ADMIN_DELETED",
      actorId: req.user.id,
      actorRole: "admin",
      details: {
        deletedAdminId: targetAdmin._id,
        email: targetAdmin.email,
        fullName: targetAdmin.fullName,
        selfDeleted,
      },
    });

    res.status(200).json({
      success: true,
      message: selfDeleted
        ? `Your admin account "${targetAdmin.fullName}" has been deleted.`
        : `Admin account "${targetAdmin.fullName}" deleted successfully.`,
      deletedId: targetAdmin._id,
      selfDeleted,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerVoter,
  loginVoter,
  registerAdmin,
  loginAdmin,
  registerCandidate,
  loginCandidate,
  requestRegistrationCode,
  forgotPassword,
  resetPassword,
  linkAdminWallet,
  listAdmins,
  deleteAdminAccount,
  getCurrentUser,
};
