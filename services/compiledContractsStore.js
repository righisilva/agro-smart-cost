// services/compiledContractsStore.js

const compiledContracts = new Map();

function clearCompiledContracts() {
    compiledContracts.clear();
}

function registerCompiledContract(name, data) {
    compiledContracts.set(name, data);
}

function getCompiledContract(name) {
    return compiledContracts.get(name) || null;
}

function listCompiledContracts() {
    return Array.from(compiledContracts.keys());
}

module.exports = {
    clearCompiledContracts,
    registerCompiledContract,
    getCompiledContract,
    listCompiledContracts,
};
