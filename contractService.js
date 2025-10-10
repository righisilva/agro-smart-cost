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

// Variável que armazenará o contrato deployado em memória
let deployedContract = null;




/**
 * Retorna o contrato que foi deployado (ou null se ainda não tiver deploy)
 */
function getDeployedContract() {
    return deployedContract;
}

/**
 * Busca preços dos tokens em USD e BRL via CoinGecko
 */
async function getTokenPrices() {
    const url = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,binancecoin,matic-network&vs_currencies=usd,brl";
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
            const provider = new ethers.providers.JsonRpcProvider(net.rpc);
            const networkInfo = await provider.getNetwork();
            console.log(`✅ Conectado à ${net.name} (chainId: ${networkInfo.chainId})`);
            const gasPrice = await provider.getGasPrice();
            gasPrices[net.token] = { name: net.name, gasPrice, tokenId: net.token };
        } catch (err) {
            console.log(`⚠️ Falha ao buscar gasPrice da rede ${net.name}: ${err.message}`);
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

    // Converte o caminho relativo para absoluto
    const absolutePath = path.resolve(filePath);

    // Lê o conteúdo do contrato Solidity
    const source = fs.readFileSync(absolutePath, "utf8");

    // Configuração para compilação com solc
    const input = {
        language: "Solidity",
        sources: { [path.basename(filePath)]: { content: source } },
        settings: { outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } } },
    };

    /**
     * Função para resolver imports do Solidity
     * @param {string} importPath Caminho do import
     */
    function findImports(importPath) {
      try {
        // 1️⃣ Caminho relativo ao arquivo principal
        const baseDir = path.dirname(filePath);
        let resolvedPath = path.resolve(baseDir, importPath);
        if (fs.existsSync(resolvedPath)) {
          return { contents: fs.readFileSync(resolvedPath, "utf8") };
        }

        // 2️⃣ Caminho na pasta "contracts"
        const contractsDir = path.resolve(__dirname, "contracts");
        resolvedPath = path.resolve(contractsDir, importPath);
        if (fs.existsSync(resolvedPath)) {
          return { contents: fs.readFileSync(resolvedPath, "utf8") };
        }

        // 3️⃣ Pacote npm
        const npmResolved = require.resolve(importPath);
        return { contents: fs.readFileSync(npmResolved, "utf8") };

      } catch (err) {
        // Se não encontrar o import, retorna erro
        return { error: `Import não encontrado: ${importPath}` };
      }
    }

    // Compila o contrato usando solc
    const compiled = solc.compile(JSON.stringify(input), { import: findImports });
    const output = JSON.parse(compiled);

    // Verifica se compilou corretamente
    if (!output.contracts || !output.contracts[path.basename(filePath)]) {
        log("❌ Erro ao compilar o contrato. Verifique os imports.");
        if (output.errors) output.errors.forEach(e => log(e.formattedMessage));
        return;
    }

    // Pega o primeiro contrato definido no arquivo
    const contractFileName = Object.keys(output.contracts[path.basename(filePath)])[0];
    const contractData = output.contracts[path.basename(filePath)][contractFileName];

    // ABI do contrato (interface)
    const abi = contractData.abi;

    // Bytecode do contrato (código binário para deploy)
    const bytecode = contractData.evm.bytecode.object;

    // Conecta ao nó Hardhat local
    log("🔌 Conectando ao Hardhat local...");
    const provider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");

    // Lista contas disponíveis no Hardhat node
    const accounts = await provider.listAccounts();
    if (!accounts.length) { log("❌ Nenhuma conta encontrada no Hardhat node."); return; }

    // Usa a primeira conta como signer
    const wallet = provider.getSigner(accounts[0]);

    // Cria a fábrica de contratos (para deploy)
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);

    // Analisa o constructor e cria "fake args" para deploy
    const constructor = abi.find(item => item.type === "constructor");
    const fakeArgs = constructor?.inputs?.map((input, i) => {
        switch (input.type) {
            case "string": return `fake_string_${i}`;
            case "uint256": case "uint": case "int": case "int256": return 1000 + i;
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

    // Faz o deploy do contrato
    log("🚀 Fazendo deploy do contrato...");
    try {
        const contractInstance = await factory.deploy(...fakeArgs); // deploy
        const txReceipt = await contractInstance.deployTransaction.wait(); // espera confirmação
        deployedContract = await contractInstance.deployed(); // guarda instância em memória
        log(`✅ Contrato deployado: ${deployedContract.address}`);
        return { address: deployedContract.address, gasUsed: txReceipt.gasUsed };
    } catch (err) {
        log(`❌ Falha no deploy: ${err.message}`);
        return null;
    }

    log("🔍 Contrato pronto para execução de funções.");
}

// Permite alterar o contrato deployado em memória
function setDeployedContract(contract) {
    deployedContract = contract;
}

// Exporta funções para uso externo
module.exports = { analisarContratoManual, getDeployedContract, getGasPricesFromNetworks, getTokenPrices };

