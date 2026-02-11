const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const {
  analisarContratoManual,
  getDeployedContract,
  listDeployedContracts,
  registerDeployedContract,
  getGasPricesFromNetworks,
  getTokenPrices
} = require("../contractService");

const upload = multer({ dest: "uploads/" });

module.exports = (db, networks) => {
  const router = express.Router();

  let gasPricesByNetwork = null;
  let tokenPrices = null;


// --- Funções auxiliares para DB ---
function salvarContractNoDB(name, address) {
    const existing = db.prepare("SELECT id FROM contracts WHERE name = ?").get(name);
    if (existing) return existing.id;
    const result = db.prepare("INSERT INTO contracts (name, address) VALUES (?, ?)").run(name, address);
    return result.lastInsertRowid;
}

function salvarFuncaoContratoNoDB(contractId, nomeFuncao) {
    const existing = db.prepare("SELECT id FROM contract_functions WHERE contract_id = ? AND name = ?").get(contractId, nomeFuncao);
    if (existing) return existing.id;
    const result = db.prepare("INSERT INTO contract_functions (contract_id, name) VALUES (?, ?)").run(contractId, nomeFuncao);
    return result.lastInsertRowid;
}

function salvarDeployNoDB(contractId, networkId, gasUsed, costUSD, costBRL) {
    db.prepare(`
        INSERT INTO contract_deploy_costs (contract_id, network_id, gas_used, cost_usd, cost_brl)
        VALUES (?, ?, ?, ?, ?)
    `).run(contractId, networkId, gasUsed, costUSD, costBRL);
}

// function salvarFuncaoNoDB(functionId, networkId, gasUsed, costUSD, costBRL) {
//     db.prepare(`
//         INSERT INTO contract_function_costs (function_id, network_id, gas_used, cost_usd, cost_brl)
//         VALUES (?, ?, ?, ?, ?)
//     `).run(functionId, networkId, gasUsed, costUSD, costBRL);
// }

function salvarFuncaoNoDB(functionId, networkId, gasUsed, costUSD, costBRL) {
  db.prepare(`
    INSERT INTO contract_function_costs
      (function_id, network_id, gas_used, cost_usd, cost_brl)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(function_id, network_id)
    DO UPDATE SET
      gas_used = excluded.gas_used,
      cost_usd = excluded.cost_usd,
      cost_brl = excluded.cost_brl
  `).run(functionId, networkId, gasUsed, costUSD, costBRL);
}


function salvarNetworkCosts(networkId, gasPrice, costUSD, costBRL) {
    db.prepare(`
        INSERT INTO network_costs (network_id, gas_tracker, cost_usd, cost_brl)
        VALUES (?, ?, ?, ?)
    `).run(networkId, gasPrice, costUSD, costBRL);
}

// Converte argumentos com base no formato e tipo esperado
function parseArgument(arg) {
    // Caso o argumento já venha em formato objeto (ex: JSON), tenta converter
    if (typeof arg === "object") return arg;

    // Trata strings
    if (typeof arg === "string") {
        // Endereço Ethereum (address)
        if (/^0x[a-fA-F0-9]{40}$/.test(arg)) return arg;

        // Boolean
        if (arg.toLowerCase() === "true") return true;
        if (arg.toLowerCase() === "false") return false;

        // Array JSON (por ex: "[1,2,3]" ou '["a","b"]')
        if (arg.trim().startsWith("[") && arg.trim().endsWith("]")) {
            try {
                const arr = JSON.parse(arg);
                return Array.isArray(arr)
                    ? arr.map(parseArgument)
                    : arg;
            } catch {
                return arg;
            }
        }

        // Número (inteiro ou decimal)
        if (!isNaN(arg) && arg.trim() !== "") return Number(arg);

        // Bytes32 ou bytes genérico
        if (/^0x[a-fA-F0-9]+$/.test(arg)) return arg;

        // Caso contrário, mantém como string
        return arg;
    }

    // Número direto
    if (typeof arg === "number") return arg;

    return arg;
}



router.post("/load-abi", upload.single("contrato"), async (req, res) => {
    const solc = require("solc");
    const { analisarContratoManual } = require("./contractService");
    const { registerDeployedContract } = require("./contractService");
    let filePath;

    try {
        if (!req.file) return res.status(400).send("❌ Nenhum arquivo enviado.");

        // ------------------------------
        // 🔹 Buscar gasPrices e preços dos tokens (uma vez só)
        // ------------------------------
        gasPricesByNetwork = await getGasPricesFromNetworks();
        tokenPrices = await getTokenPrices();
        console.log("🔹 Gas e preços carregados.");


        const filePath = req.file.path;
        const source = fs.readFileSync(filePath, "utf8");

        // ------------------------------
        // 🔹 Faz deploy do contrato e mede gas
        // ------------------------------
        const deployedContracts = await analisarContratoManual(filePath, console.log);
        if (!deployedContracts.length)
          return res.status(500).send("❌ Nenhum contrato foi deployado.");


//TODO

        
     
     
        const contratosResponse = []; // ← array para acumular tudo


        // salva cada contrato no banco
        for (const c of deployedContracts) {
          const contractId = salvarContractNoDB(c.contractName, c.address);
          c.id = contractId;
          currentDeployedContract = c;
        
          registerDeployedContract(c.contractName, {
            id: contractId,
            address: c.address,
            abi: c.abi,
            name: c.contractName
          });
        




        // ------------------------------
        // 🔹 Calcular custo total do deploy por rede
        // ------------------------------
        const custosPorRede = {};
        const insertDeploy = db.transaction(() => {

            for (const [token, data] of Object.entries(gasPricesByNetwork)) {
                const tokenPrice = tokenPrices[token];
                if (!tokenPrice) continue;

                const costInToken = ethers.utils.formatEther(c.gasUsed.mul(data.gasPrice));
                const costUSD = parseFloat(costInToken) * tokenPrice.usd;
                const costBRL = parseFloat(costInToken) * tokenPrice.brl;

                const networkId = networks[token].id;
                // salvarDeployNoDB(contractId, networks[token].id, c.gasUsed.toNumber(), costUSD, costBRL);
                //TODO
                const functionId = salvarFuncaoContratoNoDB(contractId, "deploy");
                salvarFuncaoNoDB(functionId, networks[token].id, c.gasUsed.toNumber(), costUSD, costBRL);

                salvarNetworkCosts(networkId, parseFloat(ethers.utils.formatUnits(data.gasPrice, "gwei")), tokenPrice.usd, tokenPrice.brl);

                custosPorRede[token] = {
                    name: data.name,
                    token: token,
                    gasPrice: ethers.utils.formatUnits(data.gasPrice, "gwei") + " Gwei",
                    custoTotalToken: costInToken,
                    custoUSD: costUSD ? `$${costUSD.toFixed(4)}` : "N/A",
                    custoBRL: costBRL ? `R$${costBRL.toFixed(4)}` : "N/A",
                    cotacao: { usd: tokenPrice.usd, brl: tokenPrice.brl }
                };
            }
        });
        insertDeploy();
        
          // Adiciona contrato atual ao array final
          contratosResponse.push({
            nome: c.contractName,
            endereco: c.address,
            gas: c.gasUsed.toString(),
            custosPorRede,
            abi: c.abi
          });
        }
        
        res.json({ contratos: contratosResponse });

        // ------------------------------
        // 🔹 Retorna ABI e custos do deploy
        // ------------------------------
        // res.json({
        //     abi: c.abi,
        //     contractName: c.contractName,
        //     deployedAddress: c.address,
        //     deployGas: c.gasUsed.toString(),
        //     funcao: "deploy",
        //     custosPorRede
        // });
        
//TODO

    } catch (err) {
        console.error("Erro ao compilar ou deployar contrato:", err);
        res.status(500).send("❌ Erro inesperado ao compilar ou deployar contrato.");
    } finally {
        // 🧹 Limpeza do arquivo temporário
        if (filePath) {
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error("Erro ao remover arquivo temporário:", err);
                } else {
                    console.log("🧹 Arquivo temporário removido:", filePath);
                }
            });
        }
    }
});


router.post("/execute-function", async (req, res) => {
    const {nomeContrato, nomeFuncao, args } = req.body;
    const contratoSelecionado = getDeployedContract(nomeContrato);

    if (!contratoSelecionado)
        return res.status(400).send(`❌ Contrato "${nomeContrato}" não encontrado.`);

    // Constrói o contrato real com ethers
    const provider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");
    const signer = provider.getSigner(0);
    const contract = new ethers.Contract(
        contratoSelecionado.address,
        contratoSelecionado.abi,
        signer
    );

    try {
        const processedArgs = args.map(parseArgument);

        // Estima o gas da função
        const estimatedGas = await contract.estimateGas[nomeFuncao](...processedArgs);

        // Executa função
        const tx = await contract[nomeFuncao](...processedArgs);
        const receipt = await tx.wait();



        // ------------------------------
        // 🔹 Calcular custo total por rede
        // ------------------------------
        const custosPorRede = {};

        const insertFunc = db.transaction(() => {
            const functionId = salvarFuncaoContratoNoDB(contratoSelecionado.id, nomeFuncao);

            for (const [token, data] of Object.entries(gasPricesByNetwork)) {
                // console.log(data);
                const tokenPrice = tokenPrices[token]; if (!tokenPrice) continue;
                 console.log(tokenPrice);
                const costInToken = ethers.utils.formatEther(receipt.gasUsed.mul(data.gasPrice));
                const costUSD = parseFloat(costInToken) * tokenPrice.usd;
                const costBRL = parseFloat(costInToken) * tokenPrice.brl;

                custosPorRede[token] = {
                    name: data.name,
                    token: token,
                    gasPrice: ethers.utils.formatUnits(data.gasPrice, "gwei") + " Gwei",
                    custoTotalToken: costInToken,
                    custoUSD: costUSD ? `$${costUSD.toFixed(4)}` : "N/A",
                    custoBRL: costBRL ? `R$${costBRL.toFixed(4)}` : "N/A",
                    cotacao: tokenPrice
                        ? { usd: tokenPrice.usd, brl: tokenPrice.brl }
                        : { usd: null, brl: null }
                };

                const networkId = networks[token].id;
                salvarFuncaoNoDB(functionId, networkId, receipt.gasUsed.toNumber(), costUSD, costBRL);

            }
        });
        insertFunc();
        // ------------------------------
        // 🔹 Retorna dados para o frontend
        // ------------------------------
        res.json({
            funcao: nomeFuncao,
            gasEstimado: estimatedGas.toString(),
            gasReal: receipt.gasUsed.toString(),
            custosPorRede
        });

    } catch (err) {
        res.status(500).send(`⚠️ Erro ao executar "${nomeFuncao}": ${err.message}`);
    }
});



// --- Endpoint para pegar contas do Hardhat ---

router.get("/accounts", async (req, res) => {
    try {
        const provider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");
        const accounts = await provider.listAccounts();
        res.json(accounts);
    } catch (err) {
        res.status(500).send("Erro ao obter contas: " + err.message);
    }
});


router.get("/contracts-list", (req, res) => {
    try {
        const rows = db.prepare("SELECT DISTINCT name FROM contracts ORDER BY name").all();
        res.json(rows.map(r => r.name));
    } catch (err) {
        console.error("Erro ao listar contratos:", err);
        res.status(500).send("Erro ao listar contratos");
    }
});

// 🔹 Listar redes
// 🔹 Listar redes
router.get("/networks-list", (req, res) => {
    try {
        const rows = db
            .prepare("SELECT DISTINCT name FROM networks ORDER BY name")
            .all();

        const redes = rows
            .map(r => r.name)
            .filter(name => {
                const n = name.toLowerCase();
                return !n.includes('local') && !n.includes('hardhat');
            });

        res.json(redes);
    } catch (err) {
        console.error("Erro ao listar redes:", err);
        res.status(500).send("Erro ao listar redes");
    }
});


// 🔹 Listar funções de um contrato específico (ou todas se não for passado)
router.get("/functions-list", (req, res) => {
    try {
        const { contract } = req.query;
        let query = `
            SELECT DISTINCT f.name
            FROM contract_functions f
            JOIN contracts c ON c.id = f.contract_id
            WHERE 1=1
        `;
        const params = {};

        if (contract) {
            query += " AND c.name = @contract";
            params.contract = contract;
        }

        query += " ORDER BY f.name";

        const rows = db.prepare(query).all(params);
        res.json(rows.map(r => r.name));
    } catch (err) {
        console.error("Erro ao listar funções:", err);
        res.status(500).send("Erro ao listar funções");
    }
});

router.get("/contract-abi", (req, res) => {
 const { contract } = req.query;
 const contrato = getDeployedContract(contract);
 if (!contrato) return res.status(404).send("Contrato não encontrado");
 res.json({ abi: contrato.abi, name: contrato.name, address: contrato.address });
});


router.get("/deployed-contracts", (req, res) => {
    try {
        const contratos = Array.from(listDeployedContracts().map(name => getDeployedContract(name)));
        console.log("Contratos enviados ao frontend:", contratos);
        res.json(contratos);
    } catch (err) {
        res.status(500).send("Erro ao listar contratos em memória: " + err.message);
    }
});


  return router;
};
