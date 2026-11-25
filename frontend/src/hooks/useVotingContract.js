import { useMemo } from "react";
import { ethers } from "ethers";
import { useWallet } from "../context/WalletContext";
import contractArtifact from "../abi/Voting.json";

export function useVotingContract() {
  const { signer, provider, isConnected, account } = useWallet();

  const contractAddress = contractArtifact.address;
  const contractAbi = contractArtifact.abi;

  const contract = useMemo(() => {
    if (!contractAddress || !contractAbi) return null;
    if (signer) {
      return new ethers.Contract(contractAddress, contractAbi, signer);
    }
    if (provider) {
      return new ethers.Contract(contractAddress, contractAbi, provider);
    }
    return null;
  }, [signer, provider, contractAddress, contractAbi]);

  /**
   * Directly cast vote on-chain with connected wallet
   */
  const castDirectVote = async (electionId, candidateId) => {
    if (!contract || !isConnected) {
      throw new Error("Wallet not connected. Connect MetaMask to cast a direct vote.");
    }

    const tx = await contract.castDirectVote(electionId, candidateId);
    const receipt = await tx.wait();
    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      voterAddress: account,
    };
  };

  /**
   * Check if connected wallet has already voted
   */
  const checkAddressVoted = async (electionId, address = account) => {
    if (!contract || !address) return false;
    try {
      return await contract.hasAddressVoted(electionId, address);
    } catch (e) {
      console.warn("Could not check address voted:", e.message);
      return false;
    }
  };

  /**
   * Directly create an election on-chain with connected Admin/Owner MetaMask wallet
   */
  const createElectionDirect = async (title) => {
    if (!contract || !isConnected || !signer) {
      throw new Error("MetaMask wallet not connected. Connect MetaMask or use Backend Relayer mode.");
    }

    const tx = await contract.createElection(title);
    const receipt = await tx.wait(1);

    let onChainElectionId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed && parsed.name === "ElectionCreated") {
          onChainElectionId = Number(parsed.args.electionId);
          break;
        }
      } catch (e) {}
    }

    if (!onChainElectionId) {
      try {
        onChainElectionId = Number(await contract.electionCounter());
      } catch (e) {}
    }

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      onChainElectionId,
    };
  };

  /**
   * Directly update an election's phase on-chain with connected Admin/Owner MetaMask wallet
   */
  const setElectionPhaseDirect = async (onChainElectionId, phaseNumber) => {
    if (!contract || !isConnected || !signer) {
      throw new Error("MetaMask wallet not connected. Connect MetaMask or use Backend Relayer mode.");
    }

    const tx = await contract.setElectionPhase(Number(onChainElectionId), Number(phaseNumber));
    const receipt = await tx.wait(1);
    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    };
  };

  return {
    contract,
    contractAddress,
    castDirectVote,
    checkAddressVoted,
    createElectionDirect,
    setElectionPhaseDirect,
  };
}
