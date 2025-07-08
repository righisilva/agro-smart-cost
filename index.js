require("dotenv").config();
const fs = require("fs");
const path = require("path");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const axios = require("axios");
const solc = require("solc");
const { ethers } = require("ethers");
const networks = require("./networks.json");

const csvFilePath = path.resolve(__dirname, "relatorio_gas.csv");
const csvWriter = createCsvWriter({
    path: csvFilePath,
    header: [
      { id: 'timestamp', title: 'Timestamp' },
      { id: 'rede', title: 'Rede' },
      { id: 'token', title: 'Token' },
      { id: 'cotacaoUsd', title: 'Cotação USD' },
      { id: 'cotacaoBrl', title: 'Cotação BRL' },
      { id: 'funcao', title: 'Função' },
      { id: 'gas', title: 'Gas Usado' },
      { id: 'gasPrice', title: 'Preço do Gas (em gwei)' },
      { id: 'custoToken', title: 'Custo (token)' },
      { id: 'usd', title: 'USD' },
      { id: 'brl', title: 'BRL' },
    ],
    append: fs.existsSync(csvFilePath), // Se já existe, apenas adiciona
  });

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



// Função que resolve imports, inclusive os do node_modules (ex: @openzeppelin)
function findImports(importPath) {
    try {
        const resolvedPath = require.resolve(importPath);
        const contents = fs.readFileSync(resolvedPath, 'utf8');
        return { contents };
    } catch (err) {
        return { error: `Import not found: ${importPath}` };
    }
}


// // Função que resolve imports, inclusive os do node_modules (ex: @openzeppelin)
// function findImports(importPath) {
//     try {
//         // Suporta imports do tipo 'node_modules/@openzeppelin/...'
//         if (importPath.startsWith('@')) {
//             const fullPath = path.resolve('node_modules', importPath);
//             return {
//                 contents: fs.readFileSync(fullPath, 'utf8')
//             };
//         }

//         // Caminhos relativos
//         const relativePath = path.resolve(path.dirname(filePath), importPath);
//         if (fs.existsSync(relativePath)) {
//             return {
//                 contents: fs.readFileSync(relativePath, 'utf8')
//             };
//         }

//         return { error: `Arquivo não encontrado: ${importPath}` };
//     } catch (e) {
//         return { error: e.message };
//     }
// }


const compiled = solc.compile(JSON.stringify(input), { import: findImports });
const output = JSON.parse(compiled);

// Verifica se houve erro de compilação
if (!output.contracts || !output.contracts[path.basename(filePath)]) {
    console.error("❌ Erro ao compilar o contrato. Verifique se os imports estão corretos.");
    if (output.errors) {
        for (const error of output.errors) {
            console.error(error.formattedMessage);
        }
    }
    process.exit(1);
}

// Captura o nome do contrato principal
const contractName = Object.keys(output.contracts[path.basename(filePath)])[0];
const contract = output.contracts[path.basename(filePath)][contractName];




const abi = contract.abi;
const bytecode = contract.evm.bytecode.object;

async function getTokenPrices() {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=ethereum,binancecoin,matic-network&vs_currencies=usd,brl`;
    const res = await axios.get(url);
    return res.data;
}

async function getGasPricesFromNetworks() {
  const gasPrices = {};
  for (const [key, net] of Object.entries(networks)) {
      if (key === "localhost") continue;

      try {
          const provider = new ethers.providers.JsonRpcProvider(net.rpc);
          const gasPrice = await provider.getGasPrice();
          gasPrices[net.token] = {
              name: net.name,
              gasPrice,
              tokenId: net.token
          };
      } catch (err) {
          console.warn(`⚠️ Falha ao buscar gasPrice da rede ${net.name}: ${err.message}`);
      }
  }
  return gasPrices;
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

    console.log(`📦 Gas usado no deploy: ${deployTxReceipt.gasUsed}`);

    const gasPricesByNetwork = await getGasPricesFromNetworks();
    const tokenPrices = await getTokenPrices();

    for (const [token, data] of Object.entries(gasPricesByNetwork)) {
        const tokenPrice = tokenPrices[token];
        if (!tokenPrice) continue;

        const costInToken = ethers.utils.formatEther(deployTxReceipt.gasUsed.mul(data.gasPrice));
        const costUSD = parseFloat(costInToken) * tokenPrice.usd;
        const costBRL = parseFloat(costInToken) * tokenPrice.brl;

        console.log(`🌍 ${data.name}`);
        console.log (`   🪙  Cotação de 1 ${token}: U$$: ${tokenPrice.usd.toFixed(2)} - R$: ${tokenPrice.brl.toFixed(2)} `)
        console.log(`   ⛽ gasPrice: ${ethers.utils.formatUnits(data.gasPrice, "gwei")} gwei`);
        console.log(`   💰 Custo estimado de deploy: ${costInToken} ${token} ≈ $${costUSD.toFixed(2)} / R$${costBRL.toFixed(2)}\n`);


        const now = new Date().toISOString(); // Timestamp ISO
        await csvWriter.writeRecords([
            {
            timestamp: now,
            rede: data.name,
            token: token,
            cotacaoUsd: tokenPrice.usd.toFixed(4),
            cotacaoBrl: tokenPrice.brl.toFixed(4),
            funcao: "Deploy",
            gas: deployTxReceipt.gasUsed,
            gasPrice: ethers.utils.formatUnits(data.gasPrice, "gwei"),
            custoToken: costInToken,
            usd: costUSD.toFixed(4),
            brl: costBRL.toFixed(4)

            }
        ]);
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
      if (item.type === "function" && !["view", "pure"].includes(item.stateMutability)) {
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
          const estimatedGas = await deployedContract.estimateGas[functionName](...fakeArgs);
          const tx = await deployedContract[functionName](...fakeArgs);
          const receipt = await tx.wait();
          const realGasUsed = receipt.gasUsed;
    
          console.log(`🔧 Função: ${functionName}`);
          console.log(`   📍 Gas estimado:     ${estimatedGas}`);
          console.log(`   ✅ Gas real usado:   ${realGasUsed}`);
    
          for (const [token, data] of Object.entries(gasPricesByNetwork)) {
            const tokenPrice = tokenPrices[token];
            if (!tokenPrice) continue;
            const costInToken = ethers.utils.formatEther(realGasUsed.mul(data.gasPrice));
            const costUSD = parseFloat(costInToken) * tokenPrice.usd;
            const costBRL = parseFloat(costInToken) * tokenPrice.brl;
    
            console.log(`   💰 ${token.toUpperCase()}: ${costInToken} ${token}`);
            console.log(`       ≈ $${costUSD.toFixed(2)} / R$${costBRL.toFixed(2)}`);

            const now = new Date().toISOString(); // Timestamp ISO
            await csvWriter.writeRecords([
                {
                timestamp: now,
                rede: data.name,
                token: data.name,
                cotacaoUsd: tokenPrice.usd.toFixed(4),
                cotacaoBrl: tokenPrice.brl.toFixed(4),
                funcao: functionName,
                gas: realGasUsed,
                gasPrice: ethers.utils.formatUnits(data.gasPrice, "gwei"),
                custoToken: costInToken,
                usd: costUSD.toFixed(4),
                brl: costBRL.toFixed(4)


                }
            ]);
          }

          
    
          console.log("-------------------------------------------------------\n");
    
        } catch (err) {
          console.warn(`⚠️ Erro ao executar "${functionName}": ${err.message}`);
        }
      }
    }
    
}

main();
