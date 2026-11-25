const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Starting deployment of Voting contract...");

  const [deployer, relayer] = await hre.ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  console.log("Relayer address:", (relayer || deployer).address);

  const Voting = await hre.ethers.getContractFactory("Voting");
  const voting = await Voting.deploy((relayer || deployer).address);
  await voting.waitForDeployment();

  const contractAddress = await voting.getAddress();
  console.log("Voting contract successfully deployed to:", contractAddress);

  // Extract artifact and ABI
  const artifact = await hre.artifacts.readArtifact("Voting");
  const contractData = {
    address: contractAddress,
    network: hre.network.name,
    chainId: hre.network.config.chainId || 31337,
    abi: artifact.abi,
    deployedAt: new Date().toISOString()
  };

  // Sync with backend
  const backendConfigDir = path.resolve(__dirname, "../../backend/src/config");
  if (!fs.existsSync(backendConfigDir)) {
    fs.mkdirSync(backendConfigDir, { recursive: true });
  }
  const backendFilePath = path.join(backendConfigDir, "contract.json");
  fs.writeFileSync(backendFilePath, JSON.stringify(contractData, null, 2));
  console.log("Contract config synced to backend:", backendFilePath);

  // Sync with frontend
  const frontendAbiDir = path.resolve(__dirname, "../../frontend/src/abi");
  if (!fs.existsSync(frontendAbiDir)) {
    fs.mkdirSync(frontendAbiDir, { recursive: true });
  }
  const frontendFilePath = path.join(frontendAbiDir, "Voting.json");
  fs.writeFileSync(frontendFilePath, JSON.stringify(contractData, null, 2));
  console.log("Contract config synced to frontend:", frontendFilePath);

  console.log("Deployment and sync complete!");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});
