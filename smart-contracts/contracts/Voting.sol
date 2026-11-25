// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Voting
 * @dev Hybrid on-chain voting system supporting gasless relayer votes (voter hash)
 *      and direct Web3 wallet voting.
 */
contract Voting {
    enum Phase { Created, Registration, Voting, Ended }

    struct Candidate {
        uint256 id;
        string name;
        string party;
        uint256 voteCount;
    }

    struct Election {
        uint256 id;
        string title;
        Phase phase;
        uint256 candidateCount;
        uint256 totalVotes;
        bool exists;
    }

    address public owner;
    address public relayer;

    uint256 public electionCounter;

    // electionId => Election
    mapping(uint256 => Election) public elections;

    // electionId => candidateId => Candidate
    mapping(uint256 => mapping(uint256 => Candidate)) public candidates;

    // Double voting prevention
    // electionId => voterHash => hasVoted
    mapping(uint256 => mapping(bytes32 => bool)) public hasVotedHash;

    // electionId => voterAddress => hasVoted
    mapping(uint256 => mapping(address => bool)) public hasVotedAddress;

    // Voter registration whitelist
    mapping(uint256 => mapping(bytes32 => bool)) public registeredHashes;
    mapping(uint256 => mapping(address => bool)) public registeredAddresses;

    // Events
    event ElectionCreated(uint256 indexed electionId, string title);
    event PhaseChanged(uint256 indexed electionId, Phase newPhase);
    event CandidateAdded(uint256 indexed electionId, uint256 indexed candidateId, string name, string party);
    event VoterHashRegistered(uint256 indexed electionId, bytes32 indexed voterHash);
    event VoterAddressRegistered(uint256 indexed electionId, address indexed voterAddress);
    event VoteCastByRelayer(uint256 indexed electionId, uint256 indexed candidateId, bytes32 indexed voterHash, address relayer);
    event VoteCastDirect(uint256 indexed electionId, uint256 indexed candidateId, address indexed voter);
    event RelayerUpdated(address indexed oldRelayer, address indexed newRelayer);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    modifier onlyRelayerOrOwner() {
        require(msg.sender == relayer || msg.sender == owner, "Caller must be relayer or owner");
        _;
    }

    modifier electionMustExist(uint256 _electionId) {
        require(elections[_electionId].exists, "Election does not exist");
        _;
    }

    constructor(address _relayer) {
        owner = msg.sender;
        relayer = _relayer == address(0) ? msg.sender : _relayer;
        emit RelayerUpdated(address(0), relayer);
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "New owner is zero address");
        emit OwnershipTransferred(owner, _newOwner);
        owner = _newOwner;
    }

    function setRelayer(address _newRelayer) external onlyOwner {
        require(_newRelayer != address(0), "Relayer cannot be zero address");
        emit RelayerUpdated(relayer, _newRelayer);
        relayer = _newRelayer;
    }

    function createElection(string calldata _title) external onlyRelayerOrOwner returns (uint256) {
        require(bytes(_title).length > 0, "Title cannot be empty");
        electionCounter++;
        uint256 newId = electionCounter;

        elections[newId] = Election({
            id: newId,
            title: _title,
            phase: Phase.Created,
            candidateCount: 0,
            totalVotes: 0,
            exists: true
        });

        emit ElectionCreated(newId, _title);
        return newId;
    }

    function setElectionPhase(uint256 _electionId, Phase _newPhase) external onlyRelayerOrOwner electionMustExist(_electionId) {
        Election storage election = elections[_electionId];
        require(election.phase != _newPhase, "Election already in requested phase");
        election.phase = _newPhase;
        emit PhaseChanged(_electionId, _newPhase);
    }

    function addCandidate(
        uint256 _electionId,
        string calldata _name,
        string calldata _party
    ) external onlyRelayerOrOwner electionMustExist(_electionId) returns (uint256) {
        Election storage election = elections[_electionId];
        require(
            election.phase == Phase.Created || election.phase == Phase.Registration,
            "Candidates can only be added during Created or Registration phase"
        );
        require(bytes(_name).length > 0, "Candidate name cannot be empty");

        election.candidateCount++;
        uint256 candidateId = election.candidateCount;

        candidates[_electionId][candidateId] = Candidate({
            id: candidateId,
            name: _name,
            party: _party,
            voteCount: 0
        });

        emit CandidateAdded(_electionId, candidateId, _name, _party);
        return candidateId;
    }

    function registerVoterHash(uint256 _electionId, bytes32 _voterHash) external onlyRelayerOrOwner electionMustExist(_electionId) {
        require(_voterHash != bytes32(0), "Invalid voter hash");
        require(!registeredHashes[_electionId][_voterHash], "Voter hash already registered");

        registeredHashes[_electionId][_voterHash] = true;
        emit VoterHashRegistered(_electionId, _voterHash);
    }

    function batchRegisterVoterHashes(uint256 _electionId, bytes32[] calldata _hashes) external onlyRelayerOrOwner electionMustExist(_electionId) {
        for (uint256 i = 0; i < _hashes.length; i++) {
            bytes32 vHash = _hashes[i];
            if (vHash != bytes32(0) && !registeredHashes[_electionId][vHash]) {
                registeredHashes[_electionId][vHash] = true;
                emit VoterHashRegistered(_electionId, vHash);
            }
        }
    }

    function registerVoterAddress(uint256 _electionId, address _voter) external onlyRelayerOrOwner electionMustExist(_electionId) {
        require(_voter != address(0), "Invalid voter address");
        require(!registeredAddresses[_electionId][_voter], "Voter address already registered");

        registeredAddresses[_electionId][_voter] = true;
        emit VoterAddressRegistered(_electionId, _voter);
    }

    function castRelayerVote(
        uint256 _electionId,
        uint256 _candidateId,
        bytes32 _voterHash
    ) external onlyRelayerOrOwner electionMustExist(_electionId) {
        Election storage election = elections[_electionId];
        require(election.phase == Phase.Voting, "Election is not in Voting phase");
        require(registeredHashes[_electionId][_voterHash], "Voter hash is not registered");
        require(!hasVotedHash[_electionId][_voterHash], "Voter has already cast a ballot");
        require(_candidateId > 0 && _candidateId <= election.candidateCount, "Invalid candidate ID");

        hasVotedHash[_electionId][_voterHash] = true;
        candidates[_electionId][_candidateId].voteCount++;
        election.totalVotes++;

        emit VoteCastByRelayer(_electionId, _candidateId, _voterHash, msg.sender);
    }

    function castDirectVote(
        uint256 _electionId,
        uint256 _candidateId
    ) external electionMustExist(_electionId) {
        Election storage election = elections[_electionId];
        require(election.phase == Phase.Voting, "Election is not in Voting phase");
        require(registeredAddresses[_electionId][msg.sender], "Wallet address is not registered");
        require(!hasVotedAddress[_electionId][msg.sender], "Wallet has already voted");
        require(_candidateId > 0 && _candidateId <= election.candidateCount, "Invalid candidate ID");

        hasVotedAddress[_electionId][msg.sender] = true;
        candidates[_electionId][_candidateId].voteCount++;
        election.totalVotes++;

        emit VoteCastDirect(_electionId, _candidateId, msg.sender);
    }

    function getElection(uint256 _electionId) external view electionMustExist(_electionId) returns (
        uint256 id,
        string memory title,
        Phase phase,
        uint256 candidateCount,
        uint256 totalVotes
    ) {
        Election storage election = elections[_electionId];
        return (
            election.id,
            election.title,
            election.phase,
            election.candidateCount,
            election.totalVotes
        );
    }

    function getCandidate(uint256 _electionId, uint256 _candidateId) external view electionMustExist(_electionId) returns (
        uint256 id,
        string memory name,
        string memory party,
        uint256 voteCount
    ) {
        require(_candidateId > 0 && _candidateId <= elections[_electionId].candidateCount, "Invalid candidate ID");
        Candidate storage candidate = candidates[_electionId][_candidateId];
        return (candidate.id, candidate.name, candidate.party, candidate.voteCount);
    }

    function getAllCandidates(uint256 _electionId) external view electionMustExist(_electionId) returns (Candidate[] memory) {
        uint256 count = elections[_electionId].candidateCount;
        Candidate[] memory result = new Candidate[](count);
        for (uint256 i = 1; i <= count; i++) {
            result[i - 1] = candidates[_electionId][i];
        }
        return result;
    }

    function hasVoted(uint256 _electionId, bytes32 _voterHash) external view returns (bool) {
        return hasVotedHash[_electionId][_voterHash];
    }

    function hasAddressVoted(uint256 _electionId, address _voter) external view returns (bool) {
        return hasVotedAddress[_electionId][_voter];
    }

    function isVoterHashRegistered(uint256 _electionId, bytes32 _voterHash) external view returns (bool) {
        return registeredHashes[_electionId][_voterHash];
    }

    function isVoterAddressRegistered(uint256 _electionId, address _voter) external view returns (bool) {
        return registeredAddresses[_electionId][_voter];
    }
}
