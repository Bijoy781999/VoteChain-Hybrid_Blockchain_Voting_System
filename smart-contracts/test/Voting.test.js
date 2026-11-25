const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Voting Contract", function () {
  let Voting;
  let voting;
  let owner, relayer, voter1, voter2, unauthorized;

  const sampleVoterHash1 = ethers.keccak256(ethers.toUtf8Bytes("voter_salt_1"));
  const sampleVoterHash2 = ethers.keccak256(ethers.toUtf8Bytes("voter_salt_2"));

  beforeEach(async function () {
    [owner, relayer, voter1, voter2, unauthorized] = await ethers.getSigners();
    Voting = await ethers.getContractFactory("Voting");
    voting = await Voting.deploy(relayer.address);
    await voting.waitForDeployment();
  });

  describe("Deployment and Roles", function () {
    it("should set deployer as owner and configure relayer", async function () {
      expect(await voting.owner()).to.equal(owner.address);
      expect(await voting.relayer()).to.equal(relayer.address);
    });

    it("should allow owner to update relayer", async function () {
      await voting.setRelayer(voter1.address);
      expect(await voting.relayer()).to.equal(voter1.address);
    });

    it("should prevent unauthorized user from updating relayer", async function () {
      await expect(
        voting.connect(unauthorized).setRelayer(unauthorized.address)
      ).to.be.revertedWith("Only owner can call this function");
    });
  });

  describe("Election & Candidate Management", function () {
    it("should allow relayer to create an election", async function () {
      await expect(voting.connect(relayer).createElection("Campus General Election"))
        .to.emit(voting, "ElectionCreated")
        .withArgs(1, "Campus General Election");

      const election = await voting.getElection(1);
      expect(election.id).to.equal(1n);
      expect(election.title).to.equal("Campus General Election");
      expect(election.phase).to.equal(0n); // Phase.Created
    });

    it("should allow adding candidates during Created and Registration phases", async function () {
      await voting.connect(relayer).createElection("Campus General Election");

      await voting.connect(relayer).addCandidate(1, "Alice", "Tech Party");
      await voting.connect(relayer).addCandidate(1, "Bob", "Green Party");

      const candidates = await voting.getAllCandidates(1);
      expect(candidates.length).to.equal(2);
      expect(candidates[0].name).to.equal("Alice");
      expect(candidates[1].name).to.equal("Bob");
    });

    it("should disallow adding candidates once in Voting phase", async function () {
      await voting.connect(relayer).createElection("Election 1");
      await voting.connect(relayer).setElectionPhase(1, 2); // Phase.Voting

      await expect(
        voting.connect(relayer).addCandidate(1, "Eve", "Party")
      ).to.be.revertedWith("Candidates can only be added during Created or Registration phase");
    });
  });

  describe("Relayer (Gasless / Voter Hash) Voting", function () {
    beforeEach(async function () {
      await voting.connect(relayer).createElection("Election 1");
      await voting.connect(relayer).addCandidate(1, "Alice", "Party A");
      await voting.connect(relayer).addCandidate(1, "Bob", "Party B");
      await voting.connect(relayer).registerVoterHash(1, sampleVoterHash1);
      await voting.connect(relayer).setElectionPhase(1, 2); // Phase.Voting
    });

    it("should allow relayer to cast vote with registered hash", async function () {
      await expect(voting.connect(relayer).castRelayerVote(1, 1, sampleVoterHash1))
        .to.emit(voting, "VoteCastByRelayer")
        .withArgs(1, 1, sampleVoterHash1, relayer.address);

      expect(await voting.hasVoted(1, sampleVoterHash1)).to.be.true;

      const cand = await voting.getCandidate(1, 1);
      expect(cand.voteCount).to.equal(1n);

      const election = await voting.getElection(1);
      expect(election.totalVotes).to.equal(1n);
    });

    it("should prevent double voting with same voter hash", async function () {
      await voting.connect(relayer).castRelayerVote(1, 1, sampleVoterHash1);

      await expect(
        voting.connect(relayer).castRelayerVote(1, 2, sampleVoterHash1)
      ).to.be.revertedWith("Voter has already cast a ballot");
    });

    it("should reject relayer vote if hash is not registered", async function () {
      await expect(
        voting.connect(relayer).castRelayerVote(1, 1, sampleVoterHash2)
      ).to.be.revertedWith("Voter hash is not registered");
    });

    it("should prevent non-relayer from submitting relayer votes", async function () {
      await expect(
        voting.connect(unauthorized).castRelayerVote(1, 1, sampleVoterHash1)
      ).to.be.revertedWith("Caller must be relayer or owner");
    });
  });

  describe("Direct Web3 Wallet Voting", function () {
    beforeEach(async function () {
      await voting.connect(relayer).createElection("Election 1");
      await voting.connect(relayer).addCandidate(1, "Alice", "Party A");
      await voting.connect(relayer).registerVoterAddress(1, voter1.address);
      await voting.connect(relayer).setElectionPhase(1, 2); // Phase.Voting
    });

    it("should allow registered wallet address to vote directly", async function () {
      await expect(voting.connect(voter1).castDirectVote(1, 1))
        .to.emit(voting, "VoteCastDirect")
        .withArgs(1, 1, voter1.address);

      expect(await voting.hasAddressVoted(1, voter1.address)).to.be.true;

      const cand = await voting.getCandidate(1, 1);
      expect(cand.voteCount).to.equal(1n);
    });

    it("should prevent double voting from the same wallet address", async function () {
      await voting.connect(voter1).castDirectVote(1, 1);

      await expect(
        voting.connect(voter1).castDirectVote(1, 1)
      ).to.be.revertedWith("Wallet has already voted");
    });

    it("should reject direct vote from unregistered wallet address", async function () {
      await expect(
        voting.connect(unauthorized).castDirectVote(1, 1)
      ).to.be.revertedWith("Wallet address is not registered");
    });
  });

  describe("Phases and Final Results", function () {
    it("should block votes once election phase is set to Ended", async function () {
      await voting.connect(relayer).createElection("Election 1");
      await voting.connect(relayer).addCandidate(1, "Alice", "Party A");
      await voting.connect(relayer).registerVoterHash(1, sampleVoterHash1);
      await voting.connect(relayer).setElectionPhase(1, 2); // Voting

      await voting.connect(relayer).castRelayerVote(1, 1, sampleVoterHash1);

      // Transition to Ended
      await voting.connect(relayer).setElectionPhase(1, 3); // Phase.Ended

      await voting.connect(relayer).registerVoterHash(1, sampleVoterHash2);

      await expect(
        voting.connect(relayer).castRelayerVote(1, 1, sampleVoterHash2)
      ).to.be.revertedWith("Election is not in Voting phase");
    });
  });
});
