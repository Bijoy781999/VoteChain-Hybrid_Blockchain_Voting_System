const Election = require("../models/Election");
const Candidate = require("../models/Candidate");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const DeletedOnChainRecord = require("../models/DeletedOnChainRecord");
const relayerService = require("../services/relayerService");

const PHASE_NAMES = ["Created", "Registration", "Voting", "Ended"];
const PHASE_MAP = {
  Created: 0,
  Registration: 1,
  Voting: 2,
  Ended: 3,
};

let activeSyncPromise = null;

/**
 * Imports any elections found on-chain (1..electionCounter) into MongoDB
 * and aligns phase/candidates/voters when starting up or reconciling.
 */
async function importChainElectionsToDb(contract, onChainCount, { syncExistingPhases = true } = {}) {
  for (let i = 1; i <= onChainCount; i++) {
    try {
      const chainElec = await contract.getElection(i);
      const title = chainElec[1];
      const phaseNum = Number(chainElec[2]);
      const phaseName = PHASE_NAMES[phaseNum] || "Created";

      let dbElec = await Election.findOne({ onChainElectionId: i });
      if (!dbElec) {
        const wasDeleted = await DeletedOnChainRecord.exists({
          type: "election",
          onChainElectionId: i,
          label: title,
        });
        if (wasDeleted) {
          continue;
        }
        dbElec = await Election.create({
          title,
          description: `${title} - Verified On-Chain Ballot`,
          onChainElectionId: i,
          phase: phaseName,
          contractAddress: relayerService.contractConfig ? relayerService.contractConfig.address : "",
          startDate: new Date(),
        });
        console.log(`[SyncService] Imported on-chain Election #${i} ("${title}") into MongoDB`);
      } else {
        if (!syncExistingPhases) {
          continue;
        }
        if (dbElec.phase !== phaseName) {
          dbElec.phase = phaseName;
          await dbElec.save();
        }
      }

      // Sync candidates present on-chain
      const chainCandidates = await contract.getAllCandidates(i);
      for (const c of chainCandidates) {
        const cId = Number(c[0]);
        let dbCand = await Candidate.findOne({ onChainElectionId: i, onChainId: cId });
        if (!dbCand) {
          const candDeleted = await DeletedOnChainRecord.exists({
            type: "candidate",
            onChainElectionId: i,
            onChainId: cId,
            label: c[1],
          });
          if (candDeleted) {
            continue;
          }
          await Candidate.create({
            electionId: dbElec._id,
            onChainElectionId: i,
            onChainId: cId,
            name: c[1],
            party: c[2] || "Independent",
            manifesto: `${c[1]} - Official candidate manifesto and representation platform.`,
            isApproved: true,
            approvalStatus: "approved",
            partyLocked: true,
          });
          console.log(`[SyncService] Synced candidate ${c[1]} (ID ${cId}) for Election #${i}`);
        }
      }

      // Sync approved voters to active on-chain election
      if (syncExistingPhases && (phaseName === "Registration" || phaseName === "Voting")) {
        const approvedUsers = await User.find({ isApproved: true });
        for (const u of approvedUsers) {
          try {
            const isReg = await contract.isVoterHashRegistered(i, u.voterHash);
            if (!isReg) {
              await relayerService.registerVoterHashOnChain(i, u.voterHash);
              console.log(`[SyncService] Registered voter hash for ${u.email} on Election #${i}`);
            }
            if (u.kycStatus !== "synced_on_chain") {
              u.kycStatus = "synced_on_chain";
              await u.save();
            }
            if (u.walletAddress) {
              const isAddrReg = await contract.isVoterAddressRegistered(i, u.walletAddress);
              if (!isAddrReg) {
                await relayerService.registerVoterAddressOnChain(i, u.walletAddress);
              }
            }
          } catch (regErr) {
            // Ignore single registration collision
          }
        }
      }
    } catch (err) {
      console.warn(`[SyncService] Warning syncing election #${i}:`, err.message);
    }
  }
}

/**
 * Re-creates any persistent MongoDB elections that are missing on the blockchain
 * (e.g. after a local Hardhat node restart or offline election creation).
 */
async function syncMissingDbElectionsToChain() {
  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  activeSyncPromise = (async () => {
    const contract = relayerService.ensureContract();
    const deployed = await relayerService.isContractDeployed();
    if (!deployed) {
      throw new Error(
        "Voting smart contract is not deployed on the connected node. Run 'npm run deploy:local' in smart-contracts."
      );
    }

    const onChainCount = await relayerService.getElectionCounter();
    if (onChainCount > 0) {
      // Import any unknown on-chain elections first so DB IDs never collide
      await importChainElectionsToDb(contract, onChainCount, { syncExistingPhases: false });
    }

    const dbElections = await Election.find().sort({ onChainElectionId: 1 });
    for (const dbElec of dbElections) {
      const exists = await relayerService.electionExistsOnChain(dbElec.onChainElectionId);
      if (exists) continue;

      const oldChainId = dbElec.onChainElectionId;
      const created = await relayerService.createElectionOnChain(dbElec.title);
      const newChainId = created.onChainElectionId;

      if (newChainId !== oldChainId) {
        dbElec.onChainElectionId = newChainId;
        await Candidate.updateMany({ electionId: dbElec._id }, { onChainElectionId: newChainId });
        await AuditLog.updateMany({ electionId: oldChainId }, { electionId: newChainId });
        await User.updateMany(
          { hasVotedElections: oldChainId },
          { $set: { "hasVotedElections.$[elem]": newChainId } },
          { arrayFilters: [{ elem: oldChainId }] }
        );
      }

      if (relayerService.contractConfig && relayerService.contractConfig.address) {
        dbElec.contractAddress = relayerService.contractConfig.address;
      }
      await dbElec.save();

      // Restore candidates on-chain while election is still in Created phase
      const candidates = await Candidate.find({
        electionId: dbElec._id,
        $or: [{ isApproved: true }, { onChainId: { $ne: null } }],
      }).sort({ onChainId: 1, createdAt: 1 });

      for (const cand of candidates) {
        try {
          const added = await relayerService.addCandidateOnChain(
            newChainId,
            cand.name,
            cand.party || "Independent"
          );
          cand.onChainElectionId = newChainId;
          cand.onChainId = added.candidateId;
          await cand.save();
        } catch (candErr) {
          console.warn(
            `[SyncService] Warning restoring candidate ${cand.name} for Election #${newChainId}:`,
            candErr.message
          );
        }
      }

      // Restore approved voter whitelist when election is in Registration or Voting
      if (dbElec.phase === "Registration" || dbElec.phase === "Voting") {
        const approvedUsers = await User.find({ isApproved: true });
        for (const u of approvedUsers) {
          try {
            await relayerService.registerVoterHashOnChain(newChainId, u.voterHash);
            if (u.walletAddress) {
              await relayerService.registerVoterAddressOnChain(newChainId, u.walletAddress);
            }
          } catch (voterErr) {
            // Ignore duplicate registration
          }
        }
      }

      // Restore current MongoDB phase on-chain
      const targetPhaseNum = PHASE_MAP[dbElec.phase];
      if (targetPhaseNum !== undefined && targetPhaseNum > 0) {
        await relayerService.setElectionPhaseOnChain(newChainId, targetPhaseNum);
      }

      console.log(
        `[SyncService] Restored MongoDB Election #${newChainId} ("${dbElec.title}", phase: ${dbElec.phase}) onto blockchain`
      );
    }
  })().finally(() => {
    activeSyncPromise = null;
  });

  return activeSyncPromise;
}

/**
 * Ensures a specific MongoDB Election exists on the connected smart contract.
 * Fast-paths with a single view call if it already exists.
 */
async function ensureElectionOnChain(electionDoc) {
  if (!electionDoc) {
    throw new Error("Election record is required");
  }
  const deployed = await relayerService.isContractDeployed();
  if (!deployed) {
    throw new Error(
      "Voting smart contract is not deployed on the connected node. Run 'npm run deploy:local' in smart-contracts."
    );
  }

  const exists = await relayerService.electionExistsOnChain(electionDoc.onChainElectionId);
  if (exists) {
    return electionDoc;
  }

  await syncMissingDbElectionsToChain();
  const refreshed = await Election.findById(electionDoc._id);
  return refreshed || electionDoc;
}

async function syncBlockchainAndDb() {
  try {
    const contract = relayerService.ensureContract();
    if (!contract) return;

    const deployed = await relayerService.isContractDeployed();
    if (!deployed) {
      console.warn("[SyncService] Contract not deployed on RPC node; skipping auto-sync.");
      return;
    }

    const onChainCount = await relayerService.getElectionCounter();
    console.log(`[SyncService] Checking sync: ${onChainCount} on-chain election(s) found.`);

    if (onChainCount > 0) {
      await importChainElectionsToDb(contract, onChainCount, { syncExistingPhases: true });
    }

    // Push any persistent MongoDB elections missing on-chain onto the contract
    await syncMissingDbElectionsToChain();

    console.log("[SyncService] Synchronization complete.");
  } catch (error) {
    console.warn("[SyncService] Blockchain auto-sync skipped:", error.message);
  }
}

module.exports = {
  syncBlockchainAndDb,
  syncMissingDbElectionsToChain,
  ensureElectionOnChain,
};
