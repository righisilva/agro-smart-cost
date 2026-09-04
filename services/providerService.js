// services/providerService.js
const { ethers } = require("ethers");

const HARDHAT_RPC_URL = process.env.HARDHAT_RPC_URL || "http://127.0.0.1:8545";

let provider = null;

// Provider único para o node Hardhat local, reaproveitado por todos os módulos
function getHardhatProvider() {
    if (!provider) {
        provider = new ethers.providers.JsonRpcProvider(HARDHAT_RPC_URL);
    }
    return provider;
}

module.exports = { getHardhatProvider };
