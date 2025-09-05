require("dotenv").config();
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const solc = require("solc");
const { ethers } = require("ethers");
const networks = require("./networks.json");

const filePath = process.argv[2];
if (!filePath) {
    console.error("❌ Por favor, informe o caminho do arquivo Solidity.");
    process.exit(1);
}

const absolutePath = path.resolve(filePath);
const source = fs.readFileSync(absolutePath, "utf8");

const input = {
    language: "Solidity",
    sources: {
        [path.basename(filePath)]: { content: source },
    },
    settings: {
        outputSelection: {
            "*": { "*": ["abi", "evm.bytecode"] },
        },
    },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const contractName = Object.keys(output.contracts[path.basename(filePath)])[0];
const contract = output.contracts[path.basename(filePath)][contractName];
const abi = contract.abi;
const bytecode = contract.evm.bytecode.object;

async function getTokenPrices() {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=ethereum,binancecoin,matic-network&vs_currencies=usd,brl`;
    const res = await axios.get(url);
    return res.data;
}

async function main() {
    console.log(`🔌 Conectando ao Hardhat local...`);

    const provider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");

    let network;
    try {
        network = await provider.getNetwork();
        console.log(`✅ Conectado à ${network.name} (chainId: ${network.chainId})`);
    } catch (e) {
        console.error(`❌ Falha ao conectar ao Hardhat local.`);
        return;
    }

    const signer = (await provider.listAccounts())[0];
    if (!signer) {
        console.error(`❌ Nenhuma conta encontrada no Hardhat node. Verifique se o node está rodando.`);
        return;
    }
    const wallet = provider.getSigner(signer);

    const factory = new ethers.ContractFactory(abi, bytecode, wallet);

    const constructor = abi.find(item => item.type === "constructor");
    const fakeArgs = constructor?.inputs?.map((input, index) => {
        switch (input.type) {
            case "string": return `fake_string_${index}`;
            case "uint256":
            case "uint":
            case "int":
            case "int256": return 1000 + index;
            case "address": return signer;
            case "bool": return index % 2 === 0;
            case "bytes32": return ethers.utils.formatBytes32String(`val${index}`);
            case "bytes": return ethers.utils.toUtf8Bytes(`data${index}`);
            case "string[]": return [`str1_${index}`, `str2_${index}`];
            case "uint256[]": return [1 + index, 2 + index];
            case "address[]": return [signer];
            default: return null;
        }
    }) || [];

    console.log(`🚀 Fazendo deploy REAL na Hardhat local...`);
    let deployedContract, deployTxReceipt;

    try {
        const deployTx = await factory.deploy(...fakeArgs);
        console.log(`⏳ Aguardando confirmação do deploy...`);
        deployTxReceipt = await deployTx.deployTransaction.wait();
        deployedContract = await deployTx.deployed();
        console.log(`✅ Contrato deployado: ${deployedContract.address}\n`);
    } catch (deployErr) {
        console.error(`❌ Falha no deploy: ${deployErr.message}`);
        return;
    }

    const gasPrice = await provider.getGasPrice();
    const prices = await getTokenPrices();

    console.log(`📦 Gas usado no deploy: ${deployTxReceipt.gasUsed}`);
    for (const [token, price] of Object.entries(prices)) {
        const costInToken = ethers.utils.formatEther(deployTxReceipt.gasUsed.mul(gasPrice));
        const costUSD = parseFloat(costInToken) * price.usd;
        const costBRL = parseFloat(costInToken) * price.brl;
        console.log(`💰 Custo do deploy em ${token}: ${costInToken} ${token} ≈ $${costUSD.toFixed(2)} / R$${costBRL.toFixed(2)}`);
    }
    console.log();

    console.log(`📌 Populando estado inicial (se necessário)...`);
    try {
        if (deployedContract.addState) {
            const tx = await deployedContract.addState("msg1", "buyer1", "cpf1", "loc1", 1);
            await tx.wait();
        }
    } catch (err) {
        console.warn(`⚠️ Não foi possível popular o estado: ${err.message}`);
    }

    console.log(`🔍 Estimando GÁS para funções públicas...\n`);

    for (const item of abi) {
        if (item.type === "function" && item.stateMutability !== "view" && item.stateMutability !== "pure") {
            const functionName = item.name;
            const fakeArgs = item.inputs.map((input, index) => {
                if (input.type.startsWith("uint")) return 1;
                if (input.type.startsWith("int")) return -1;
                if (input.type === "address") return signer;
                if (input.type === "string") return "exemplo";
                if (input.type === "bool") return false;
                if (input.type === "bytes32") return ethers.utils.formatBytes32String("ex");
                if (input.type.startsWith("bytes")) return "0x1234";
                if (input.type === "uint256[]") return [1, 2, 3];
                if (input.type === "address[]") return [signer, signer];
                if (input.type === "string[]") return ["um", "dois"];
                if (input.type === "bool[]") return [true, false];
                return null;
            });

            try {
                const estimatedGasFn = await deployedContract.estimateGas[functionName](...fakeArgs);
                console.log(`🔧 Função: ${functionName}`);
                console.log(`   📦 Gas estimado: ${estimatedGasFn}`);

                for (const [token, price] of Object.entries(prices)) {
                    const costInToken = ethers.utils.formatEther(estimatedGasFn.mul(gasPrice));
                    const costUSD = parseFloat(costInToken) * price.usd;
                    const costBRL = parseFloat(costInToken) * price.brl;
                    console.log(`   💰 ${token}: ${costInToken} ${token} ≈ $${costUSD.toFixed(2)} / R$${costBRL.toFixed(2)}`);
                }
                console.log();
            } catch (err) {
                console.warn(`⚠️ Erro ao estimar função "${functionName}": ${err.message}`);
            }
        }
    }
}

main();
