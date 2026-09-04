// services/deployedContractsStore.js

const deployedContracts = new Map();

function clearDeployedContracts() {
    deployedContracts.clear();
}

function getDeployedContract(nameOrAddress) {
    return deployedContracts.get(nameOrAddress) || null;
}

function registerDeployedContract(nameOrAddress, contractInstance) {
    deployedContracts.set(nameOrAddress, contractInstance);
}

function listDeployedContracts() {
    return Array.from(deployedContracts.keys());
}

module.exports = {
    clearDeployedContracts,
    getDeployedContract,
    registerDeployedContract,
    listDeployedContracts,
};
