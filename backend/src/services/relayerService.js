const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const env = require("../config/env");

class RelayerService {
  constructor() {
    this.provider = null;
    this.wallet = null;
    this.contract = null;
    this.contractConfig = null;
    this.mutex = Promise.resolve();
    this._lastNonce = undefined;
    this.init();
  }

  init() {
    try {
      this.provider = new ethers.JsonRpcProvider(env.RPC_URL, 31337, {
        staticNetwork: true,
        cacheTimeout: -1,
      });
      if (env.RELAYER_PRIVATE_KEY) {
        this.wallet = new ethers.Wallet(env.RELAYER_PRIVATE_KEY, this.provider);
      }

      const contractJsonPath = path.resolve(__dirname, "../config/contract.json");
      if (fs.existsSync(contractJsonPath)) {
        this.contractConfig = JSON.parse(fs.readFileSync(contractJsonPath, "utf8"));
        const contractAddress = env.CONTRACT_ADDRESS || this.contractConfig.address;
        if (contractAddress && this.wallet) {
          this.contract = new ethers.Contract(
            contractAddress,
            this.contractConfig.abi,
            this.wallet
          );
        }
      }
    } catch (err) {
      console.warn("RelayerService warning during initialization:", err.message);
    }
  }

  ensureContract() {
    if (!this.contract) {
      this.init();
    }
    if (!this.contract) {
      throw new Error(
        "Smart contract not initialized. Please deploy the contract first or set CONTRACT_ADDRESS."
      );
    }
    return this.contract;
  }

  async runWithLock(action) {
    let release;
    const currentLock = this.mutex;
    this.mutex = new Promise((resolve) => {
      release = resolve;
    });

    try {
      await currentLock;
      return await action();
    } finally {
      release();
    }
  }

  async getNextNonce() {
    const chainNonce = await this.provider.getTransactionCount(this.wallet.address, "pending");
    this._lastNonce = chainNonce;
    return this._lastNonce;
  }

  async getElectionCounter() {
    const contract = this.ensureContract();
    const counter = await contract.electionCounter();
    return Number(counter);
  }

  async electionExistsOnChain(onChainElectionId) {
    const contract = this.ensureContract();
    if (!onChainElectionId || Number(onChainElectionId) <= 0) {
      return false;
    }
    const data = await contract.elections(Number(onChainElectionId));
    return Boolean(data && data.exists);
  }

  async isContractDeployed() {
    const contract = this.ensureContract();
    const targetAddress = await contract.getAddress();
    const code = await this.provider.getCode(targetAddress);
    return Boolean(code && code !== "0x");
  }

  async createElectionOnChain(title) {
    return this.runWithLock(async () => {
      const contract = this.ensureContract();
      const nonce = await this.getNextNonce();
      const tx = await contract.createElection(title, { nonce });
      const receipt = await tx.wait(1);

      let onChainElectionId = 1;
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed && parsed.name === "ElectionCreated") {
            onChainElectionId = Number(parsed.args.electionId);
            break;
          }
        } catch (e) {}
      }

      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        onChainElectionId,
      };
    });
  }

  async addCandidateOnChain(onChainElectionId, name, party) {
    return this.runWithLock(async () => {
      const contract = this.ensureContract();
      const nonce = await this.getNextNonce();
      const tx = await contract.addCandidate(onChainElectionId, name, party || "", { nonce });
      const receipt = await tx.wait(1);

      let candidateId = 1;
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed && parsed.name === "CandidateAdded") {
            candidateId = Number(parsed.args.candidateId);
            break;
          }
        } catch (e) {}
      }

      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        candidateId,
      };
    });
  }

  async setElectionPhaseOnChain(onChainElectionId, phaseNumber) {
    return this.runWithLock(async () => {
      const contract = this.ensureContract();
      const nonce = await this.getNextNonce();
      const tx = await contract.setElectionPhase(onChainElectionId, phaseNumber, { nonce });
      const receipt = await tx.wait(1);
      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      };
    });
  }

  async registerVoterHashOnChain(onChainElectionId, voterHash) {
    return this.runWithLock(async () => {
      const contract = this.ensureContract();
      const isAlready = await contract.isVoterHashRegistered(onChainElectionId, voterHash);
      if (isAlready) {
        return { alreadyRegistered: true };
      }
      const nonce = await this.getNextNonce();
      const tx = await contract.registerVoterHash(onChainElectionId, voterHash, { nonce });
      const receipt = await tx.wait(1);
      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        alreadyRegistered: false,
      };
    });
  }

  async registerVoterAddressOnChain(onChainElectionId, walletAddress) {
    return this.runWithLock(async () => {
      const contract = this.ensureContract();
      const isAlready = await contract.isVoterAddressRegistered(onChainElectionId, walletAddress);
      if (isAlready) {
        return { alreadyRegistered: true };
      }
      const nonce = await this.getNextNonce();
      const tx = await contract.registerVoterAddress(onChainElectionId, walletAddress, { nonce });
      const receipt = await tx.wait(1);
      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        alreadyRegistered: false,
      };
    });
  }

  async castVoteOnChain(onChainElectionId, candidateId, voterHash) {
    return this.runWithLock(async () => {
      const contract = this.ensureContract();
      const hasVoted = await contract.hasVoted(onChainElectionId, voterHash);
      if (hasVoted) {
        throw new Error("Voter has already cast a ballot for this election on-chain.");
      }

      const nonce = await this.getNextNonce();
      const tx = await contract.castRelayerVote(onChainElectionId, candidateId, voterHash, {
        nonce,
      });
      const receipt = await tx.wait(1);

      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        relayerAddress: this.wallet ? this.wallet.address : "",
      };
    });
  }

  async getElectionResultsFromChain(onChainElectionId) {
    const contract = this.ensureContract();
    const electionData = await contract.getElection(onChainElectionId);
    const rawCandidates = await contract.getAllCandidates(onChainElectionId);

    const candidates = rawCandidates.map((c) => ({
      id: Number(c.id),
      name: c.name,
      party: c.party,
      voteCount: Number(c.voteCount),
    }));

    return {
      onChainElectionId: Number(electionData.id),
      title: electionData.title,
      phase: Number(electionData.phase),
      totalVotes: Number(electionData.totalVotes),
      candidates,
    };
  }

  async hasVoted(onChainElectionId, voterHash) {
    const contract = this.ensureContract();
    return await contract.hasVoted(onChainElectionId, voterHash);
  }
}

module.exports = new RelayerService();
