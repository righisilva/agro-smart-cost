const { ethers } = require("hardhat");

async function main() {
  const [deployer, user1, user2, user3] = await ethers.getSigners();

  console.log("Contas disponíveis:");
  console.log("Deployer:", deployer.address);
  console.log("User1:", user1.address);
  console.log("User2:", user2.address);
  console.log("User3:", user3.address);

  // --- Deploy do Token ---
  const Token = await ethers.getContractFactory("Token");
  const initialSupply = 10000; // totalSupply do Token
  const token = await Token.deploy(initialSupply);
  await token.deployed();
  console.log(`✅ Token deployado em: ${token.address}`);
  console.log("Saldo deployer:", (await token.balanceOf(deployer.address)).toString());

  // --- Distribuir tokens para outros usuários para teste ---
  const distributeAmount = 2000;

  await token.transfer(user1.address, distributeAmount);
  await token.transfer(user2.address, distributeAmount);
  await token.transfer(user3.address, distributeAmount);

  console.log("✅ Tokens distribuídos para user1, user2 e user3");
  console.log("Saldo user1:", (await token.balanceOf(user1.address)).toString());
  console.log("Saldo user2:", (await token.balanceOf(user2.address)).toString());
  console.log("Saldo user3:", (await token.balanceOf(user3.address)).toString());

  // --- Deploy do TokenSale ---
  const pricePerToken = ethers.utils.parseEther("0.01"); // 0.01 ETH por token
  const TokenSale = await ethers.getContractFactory("TokenSale");
  const tokenSale = await TokenSale.deploy(token.address, pricePerToken);
  await tokenSale.deployed();
  console.log(`✅ TokenSale deployado em: ${tokenSale.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

