// contractService.js

// Carrega variáveis de ambiente do arquivo .env
require("dotenv").config();

// Módulo do Node para manipular arquivos (ler, escrever, etc)
const fs = require("fs");

// Módulo do Node para manipular caminhos de arquivos
const path = require("path");

// Biblioteca HTTP para fazer requisições externas
const axios = require("axios");

// Compilador Solidity
const solc = require("solc");

// Biblioteca ethers.js para interagir com Ethereum/Smart Contracts
const { ethers } = require("ethers");

// JSON com informações de redes (ex: Hardhat, testnets, mainnet)
const networks = require("./networks.json");


const deployedContracts = new Map();

// Obter um contrato específico
function getDeployedContract(nameOrAddress) {
    return deployedContracts.get(nameOrAddress) || null;
}

// Registrar contrato
function registerDeployedContract(nameOrAddress, contractInstance) {
    deployedContracts.set(nameOrAddress, contractInstance);
    // console.log("📦 Contratos deployados:", [...deployedContracts.entries()]);
}

// Retornar lista de todos
function listDeployedContracts() {
    return Array.from(deployedContracts.keys());
}


// Variável que armazenará o contrato deployado em memória
// let deployedContract = null;
/**
 * Retorna o contrato que foi deployado (ou null se ainda não tiver deploy)
 */
// function getDeployedContract() {
//     return deployedContract;
// }

/**
 * Busca preços dos tokens em USD e BRL via CoinGecko
 */
async function getTokenPrices() {
    const url = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,binancecoin,polygon-ecosystem-token&vs_currencies=usd,brl";
    try {
        const res = await axios.get(url);
        return res.data; // Ex: { ethereum: { usd: 2400, brl: 12800 }, ... }
    } catch (err) {
        console.error("⚠️ Erro ao buscar preços dos tokens:", err.message);
        return {};
    }
}

async function getGasPricesFromNetworks() {
    const gasPrices = {};

    for (const [key, net] of Object.entries(networks)) {
        if (key === "localhost") continue;

        try {
            // Permite um ou mais RPCs (fallback automático)
            const rpcList = Array.isArray(net.rpc) ? net.rpc : [net.rpc];
            let provider, gasPrice;

            // Tenta RPCs alternativos até conseguir um resultado válido
            for (const rpc of rpcList) {
                try {
                    provider = new ethers.providers.JsonRpcProvider(rpc);
                    gasPrice = await provider.getGasPrice();
                    if (gasPrice) break;
                } catch (e) {
                    console.warn(`⚠️  RPC ${rpc} falhou para ${net.name}`);
                }
            }

            if (!gasPrice) {
                console.warn(`⚠️  Nenhum RPC válido para ${net.name}`);
                continue;
            }

            const networkInfo = await provider.getNetwork();
            console.log(`✅ Conectado à ${net.name} (chainId: ${networkInfo.chainId})`);

            gasPrices[net.token] = {
                name: net.name,
                gasPrice,
                tokenId: net.token
            };

        } catch (err) {
            console.log(`⚠️  Falha ao buscar gasPrice da rede ${net.name}: ${err.message}`);
        }
    }

    return gasPrices;
}


/**
 * Função principal para analisar e deployar um contrato Solidity manualmente
 * @param {string} filePath Caminho do arquivo Solidity
 * @param {function} log Função de log (padrão console.log)
 */
async function analisarContratoManual(filePath, log = console.log) {
  if (!filePath) throw new Error("❌ Por favor, informe o caminho do arquivo Solidity.");

  const absolutePath = path.resolve(filePath);
  const source = fs.readFileSync(absolutePath, "utf8");

  const input = {
    language: "Solidity",
    sources: { [path.basename(filePath)]: { content: source } },
    settings: { outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } } },
  };

  function findImports(importPath) {
    try {
      const baseDir = path.dirname(filePath);
      let resolvedPath = path.resolve(baseDir, importPath);
      if (fs.existsSync(resolvedPath)) {
        return { contents: fs.readFileSync(resolvedPath, "utf8") };
      }

      const contractsDir = path.resolve(__dirname, "contracts");
      resolvedPath = path.resolve(contractsDir, importPath);
      if (fs.existsSync(resolvedPath)) {
        return { contents: fs.readFileSync(resolvedPath, "utf8") };
      }

      const npmResolved = require.resolve(importPath);
      return { contents: fs.readFileSync(npmResolved, "utf8") };
    } catch (err) {
      return { error: `Import não encontrado: ${importPath}` };
    }
  }

  const compiled = solc.compile(JSON.stringify(input), { import: findImports });
  const output = JSON.parse(compiled);

  if (!output.contracts || !output.contracts[path.basename(filePath)]) {
    log("❌ Erro ao compilar o contrato. Verifique os imports.");
    if (output.errors) output.errors.forEach(e => log(e.formattedMessage));
    return [];
  }

  // Conecta ao nó Hardhat local
  log("🔌 Conectando ao Hardhat local...");
  const provider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");
  const accounts = await provider.listAccounts();
  const wallet = provider.getSigner(accounts[0]);

  const results = [];

  // Percorre todos os contratos compilados no arquivo
  for (const [contractName, contractData] of Object.entries(output.contracts[path.basename(filePath)])) {
    log(`🚀 Fazendo deploy do contrato: ${contractName}`);

    const abi = contractData.abi;
    const bytecode = contractData.evm.bytecode.object;
    if (!bytecode || bytecode === "0x") {
      log(`⚠️ Contrato ${contractName} não possui bytecode (provavelmente é uma interface ou biblioteca).`);
      continue;
    }

    const factory = new ethers.ContractFactory(abi, bytecode, wallet);

    const constructor = abi.find(item => item.type === "constructor");
    const fakeArgs = constructor?.inputs?.map((input, i) => {
      switch (input.type) {
        case "string": return `fake_string_${i}`;
        case "uint256": case "uint": case "int": return 1000 + i;
        case "address": return accounts[0];
        case "bool": return i % 2 === 0;
        case "bytes32": return ethers.utils.formatBytes32String(`val${i}`);
        case "bytes": return ethers.utils.toUtf8Bytes(`data${i}`);
        case "string[]": return [`str1_${i}`, `str2_${i}`];
        case "uint256[]": return [1 + i, 2 + i];
        case "address[]": return [accounts[0]];
        default: return null;
      }
    }) || [];

    try {
      const contractInstance = await factory.deploy(...fakeArgs);
      const txReceipt = await contractInstance.deployTransaction.wait();

      log(`✅ ${contractName} deployado em: ${contractInstance.address}`);
      results.push({
        contractName,
        address: contractInstance.address,
        gasUsed: txReceipt.gasUsed,
        abi,
      });
    } catch (err) {
      log(`❌ Falha no deploy de ${contractName}: ${err.message}`);
    }
  }

  if (!results.length) {
    log("⚠️ Nenhum contrato foi deployado com sucesso.");
  }

  return results;
}


// Permite alterar o contrato deployado em memória
function setDeployedContract(contract) {
    deployedContract = contract;
}

// Exporta funções para uso externo
module.exports = {
  analisarContratoManual,
  getDeployedContract,
  setDeployedContract,
  registerDeployedContract,
  listDeployedContracts,
  getGasPricesFromNetworks,
  getTokenPrices
};

