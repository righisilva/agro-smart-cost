// index.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const solc = require("solc");
const { ethers } = require("ethers");

const { getHardhatProvider } = require("./services/providerService");
const { getGasPricesFromNetworks } = require("./services/gasPriceService");
const { getTokenPrices } = require("./services/priceService");

// ------------------------------
// Função principal (fluxo "automático" usado pelo endpoint /analisar)
// ------------------------------
async function analisarContrato(filePath, log = console.log) {
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
            const resolvedPath = require.resolve(importPath);
            const contents = fs.readFileSync(resolvedPath, "utf8");
            return { contents };
        } catch (err) {
            return { error: `Import not found: ${importPath}` };
        }
    }

    const compiled = solc.compile(JSON.stringify(input), { import: findImports });
    const output = JSON.parse(compiled);

    if (!output.contracts || !output.contracts[path.basename(filePath)]) {
        log("❌ Erro ao compilar o contrato. Verifique os imports.");
        if (output.errors) output.errors.forEach(e => log(e.formattedMessage));
        return;
    }

    const contractName = Object.keys(output.contracts[path.basename(filePath)])[0];
    const contract = output.contracts[path.basename(filePath)][contractName];
    const abi = contract.abi;
    const bytecode = contract.evm.bytecode.object;

    log(`🔌 Conectando ao Hardhat local...`);
    const provider = getHardhatProvider();
    const network = await provider.getNetwork().catch(() => { log("❌ Falha ao conectar ao Hardhat local."); return null; });
    if (!network) return;

    log(`✅ Conectado à ${network.name} (chainId: ${network.chainId})`);
    const signer = (await provider.listAccounts())[0];
    if (!signer) { log("❌ Nenhuma conta encontrada no Hardhat node."); return; }
    const wallet = provider.getSigner(signer);
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);

    const constructor = abi.find(item => item.type === "constructor");
    const fakeArgs = constructor?.inputs?.map((input, i) => {
        switch (input.type) {
            case "string": return `fake_string_${i}`;
            case "uint256": case "uint": case "int": case "int256": return 1000 + i;
            case "address": return signer;
            case "bool": return i % 2 === 0;
            case "bytes32": return ethers.utils.formatBytes32String(`val${i}`);
            case "bytes": return ethers.utils.toUtf8Bytes(`data${i}`);
            case "string[]": return [`str1_${i}`, `str2_${i}`];
            case "uint256[]": return [1 + i, 2 + i];
            case "address[]": return [signer];
            default: return null;
        }
    }) || [];

    // ------------------------------
    // Deploy
    // ------------------------------
    log("🚀 Fazendo deploy REAL na Hardhat local...");
    let deployTxReceipt;
    let deployedContractInstance;
    try {
        const deployTx = await factory.deploy(...fakeArgs);
        log("⏳ Aguardando confirmação do deploy...\n");
        deployTxReceipt = await deployTx.deployTransaction.wait();
        deployedContractInstance = await deployTx.deployed();
        log(`✅ Contrato deployado: ${deployedContractInstance.address}`);
    } catch (err) {
        log(`❌ Falha no deploy: ${err.message}`);
        return;
    }

    log(`📦 Gas usado no deploy: ${deployTxReceipt.gasUsed}\n`);

    const gasPricesByNetwork = await getGasPricesFromNetworks();
    const tokenPrices = await getTokenPrices();
    log(`\n`);

    // ------------------------------
    // Cálculo de custos deploy
    // ------------------------------
    for (const [token, data] of Object.entries(gasPricesByNetwork)) {
        const tokenPrice = tokenPrices[token];
        if (!tokenPrice) continue;
        const costInToken = ethers.utils.formatEther(deployTxReceipt.gasUsed.mul(data.gasPrice));
        const costUSD = parseFloat(costInToken) * tokenPrice.usd;
        const costBRL = parseFloat(costInToken) * tokenPrice.brl;
        log(`🌍 ${data.name}`);
        log(`   🪙 Cotação de 1 ${token}: U$${tokenPrice.usd.toFixed(2)} / R$${tokenPrice.brl.toFixed(2)}`);
        log(`   ⛽ gasPrice: ${ethers.utils.formatUnits(data.gasPrice, "gwei")} gwei`);
        log(`   💰 Custo estimado de deploy: ${costInToken} ${token} ≈ $${costUSD.toFixed(4)} / R$${costBRL.toFixed(4)}\n`);
    }

    // ------------------------------
    // Estimativa de gas para funções públicas
    // ------------------------------
    log("🔍 Estimando GÁS para funções públicas...\n");

    const txFunctions = abi.filter(
        item => item.type === "function" && !["view", "pure"].includes(item.stateMutability)
    );

    for (const item of txFunctions) {
        const functionName = item.name;
        const args = item.inputs.map((input) => {
            if (input.type.startsWith("uint")) return 1;
            if (input.type.startsWith("int")) return -1;
            if (input.type === "address") return signer;
            if (input.type === "string") return "exemplo";
            if (input.type === "bool") return false;
            if (input.type === "bytes32") return ethers.utils.formatBytes32String("ex");
            if (input.type.startsWith("bytes")) return "0x1234";
            if (input.type.endsWith("[]")) return [1, 2, 3];
            return null;
        });

        try {
            const estimatedGas = await deployedContractInstance.estimateGas[functionName](...args);
            const tx = await deployedContractInstance[functionName](...args);
            const receipt = await tx.wait();
            log(`🔧 Função: ${functionName}`);
            log(`   📍 Gas estimado: ${estimatedGas}`);
            log(`   ✅ Gas real usado: ${receipt.gasUsed}`);

            for (const [token, data] of Object.entries(gasPricesByNetwork)) {
                const tokenPrice = tokenPrices[token]; if (!tokenPrice) continue;
                const costInToken = ethers.utils.formatEther(receipt.gasUsed.mul(data.gasPrice));
                const costUSD = parseFloat(costInToken) * tokenPrice.usd;
                const costBRL = parseFloat(costInToken) * tokenPrice.brl;
                log(`   💰 ${token.toUpperCase()}: ${costInToken} ${token} ≈ $${costUSD.toFixed(4)} / R$${costBRL.toFixed(4)}`);
            }
            log("-------------------------------------------------------\n");
        } catch (err) {
            log(`⚠️ Erro ao executar "${functionName}": ${err.message}`);
        }
    }
}

// ------------------------------
// CLI
// ------------------------------
if (require.main === module) {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error("❌ Por favor, informe o caminho do arquivo Solidity.");
        process.exit(1);
    }

    analisarContrato(filePath, console.log)
        .then(() => console.log("✅ Análise concluída!"))
        .catch(err => console.error("❌ Erro:", err.message));
}

module.exports = { analisarContrato };
