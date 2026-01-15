// server.js
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { analisarContrato } = require("./index.js");
const { analisarContratoManual, listDeployedContracts, getDeployedContract, getGasPricesFromNetworks, getTokenPrices } = require("./contractService");
const { ethers } = require("ethers");
const solc = require("solc");

const app = express();
const upload = multer({ dest: "uploads/" });
const networksJson = require("./networks.json");

// --- Variáveis globais ---
let gasPricesByNetwork = null;
let tokenPrices = null;
let currentDeployedContract = null;  // objeto { id, address, abi, name, ... }
const deployedContracts = new Map();




// --- Banco de dados SQLite ---
const db = new Database("smartagro.db");

// --- Inicializa redes no banco ---
const networks = {};
for (const [key, n] of Object.entries(networksJson)) {
    const existing = db.prepare("SELECT id FROM networks WHERE name = ?").get(n.name);
    if (!existing) {
        const result = db.prepare("INSERT INTO networks (name, token, rpc) VALUES (?, ?, ?)").run(n.name, n.token, n.rpc);
        networks[n.token] = { id: result.lastInsertRowid, ...n };
    } else {
        networks[n.token] = { id: existing.id, ...n };
    }
}

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
// --- 1️⃣ Dashboard IBGE ---

// Serve arquivos estáticos da pasta "public" na raiz "/"
app.use("/dashboard", express.static("public/IBGE"));

// Conecta ao banco de dados SQLite


// Endpoint para consultar dados IBGE via API
app.get("/api/ibge", (req, res) => {
    // Extrai filtros e parâmetros da query string
    const { regiao, classificacao, familiar, obrigatorio, top, orderBy } = req.query;

    // Monta query base
    let query = `
        SELECT i.id, r.nome AS regiao, p.nome AS produto, c.nome AS classificacao,
               i.estabelecimentos, i.valor_vendas, i.familiar, i.obrigatorio
        FROM ibge_dados i
        JOIN produtos p ON i.produto_id = p.id
        JOIN classificacoes_ibge c ON p.classificacao_id = c.id
        JOIN regioes r ON i.regiao_id = r.id
        WHERE 1=1
    `;
    const params = {};

    // Adiciona filtros opcionais
    if (regiao) { query += " AND r.nome = @regiao"; params.regiao = regiao; }
    if (classificacao) { query += " AND c.nome = @classificacao"; params.classificacao = classificacao; }
    if (familiar !== undefined) { query += " AND i.familiar = @familiar"; params.familiar = Number(familiar); }
    if (obrigatorio !== undefined) { query += " AND i.obrigatorio = @obrigatorio"; params.obrigatorio = Number(obrigatorio); }

    // Executa a query no banco
    let dados = db.prepare(query).all(params);

    // Define chave para ordenação (padrão "valor_vendas")
    const chaveOrdenacao = orderBy === "estabelecimentos" ? "estabelecimentos" : "valor_vendas";

    // Agrupa dados por produto
    const agregados = {};
    dados.forEach(d => {
        agregados[d.produto] = (agregados[d.produto] || 0) + (d[chaveOrdenacao] || 0);
    });

    // Ordena produtos do maior para o menor
    let produtosOrdenados = Object.entries(agregados)
        .sort((a, b) => b[1] - a[1]);

    // Limita aos top N se fornecido
    const topN = top ? Number(top) : produtosOrdenados.length;
    produtosOrdenados = produtosOrdenados.slice(0, topN);

    // Reconstrói array de objetos para enviar como resultado
    const resultado = produtosOrdenados.map(([produto, valor]) => {
        const registros = dados.filter(d => d.produto === produto);
        return registros.reduce((acc, r) => ({
            ...r,
            [chaveOrdenacao]: valor
        }), registros[0]);
    });

    // Retorna JSON para o frontend
    res.json(resultado);
});


// --- 2️⃣ Gas Estimator automático ---

// Serve arquivos estáticos da pasta "gas-estimator" na rota "/gas"
app.use("/gas", express.static("public/gas-estimator"));

// Endpoint para analisar contrato enviado pelo usuário
app.post("/analisar", upload.single("contrato"), async (req, res) => {
    // Verifica se um arquivo foi enviado
    if (!req.file) return res.status(400).send("❌ Nenhum arquivo enviado.");

    // Configura resposta para envio em chunks (texto HTML)
    res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Transfer-Encoding": "chunked"
    });

    // Função de log que escreve no console e no cliente
    const log = (msg) => {
        console.log(msg);
        res.write(msg.replace(/\n/g, "<br>") + "<br>");
    };

    try {
        // Analisa o contrato
        await analisarContrato(req.file.path, log);

        // Deleta arquivo temporário
        fs.unlink(req.file.path, err => {
            if (err) console.warn("⚠️ Não foi possível deletar arquivo temporário:", err.message);
        });

        res.write("<br>✅ Análise concluída!<br>");
        res.end();
    } catch (err) {
        res.write(`<br>❌ Erro: ${err.message}<br>`);
        res.end();
    }
});


// --- 3️⃣ Interface de Contratos (execução manual) ---

// Serve arquivos estáticos da interface de contratos
app.use("/interface", express.static(path.join(__dirname, "public/interface-contratos")));

// Permite receber JSON no body das requisições
app.use(express.json());


// --- 1️⃣ Carregar ABI e deploy automático ---

app.post("/api/load-abi", upload.single("contrato"), async (req, res) => {
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


// --- 2️⃣ Executar funções do contrato deployado ---

app.post("/api/execute-function", async (req, res) => {
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

app.get("/api/accounts", async (req, res) => {
    try {
        const provider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");
        const accounts = await provider.listAccounts();
        res.json(accounts);
    } catch (err) {
        res.status(500).send("Erro ao obter contas: " + err.message);
    }
});

app.use("/results", express.static(path.join(__dirname, "public/results")));

// --- Endpoint combinado: IBGE + Custos de Contrato ---
app.get("/api/results", (req, res) => {
  try {
    const {
      regiao,
      classificacao,
      familiar,
      obrigatorio,
      top,
      orderBy,
      contract,
      network,
      functionName,
    } = req.query;

    console.log("📥 Query recebida:", req.query);

    // --- 1️⃣ Query base do IBGE ---
    let queryIBGE = `
      SELECT i.id, r.nome AS regiao, p.nome AS produto, c.nome AS classificacao,
             i.estabelecimentos, i.valor_vendas, i.familiar, i.obrigatorio
      FROM ibge_dados i
      JOIN produtos p ON i.produto_id = p.id
      JOIN classificacoes_ibge c ON p.classificacao_id = c.id
      JOIN regioes r ON i.regiao_id = r.id
      WHERE 1=1
    `;
    const paramsIBGE = {};

    // --- Filtros IBGE (iguais ao endpoint original) ---
    if (regiao) { queryIBGE += " AND r.nome = @regiao"; paramsIBGE.regiao = regiao; }
    if (classificacao) { queryIBGE += " AND c.nome = @classificacao"; paramsIBGE.classificacao = classificacao; }
    if (familiar !== undefined) { queryIBGE += " AND i.familiar = @familiar"; paramsIBGE.familiar = Number(familiar); }
    if (obrigatorio !== undefined) { queryIBGE += " AND i.obrigatorio = @obrigatorio"; paramsIBGE.obrigatorio = Number(obrigatorio); }

    console.log("🧾 Query IBGE:", queryIBGE);
    console.log("📌 Params IBGE:", paramsIBGE);


    const dadosIBGE = db.prepare(queryIBGE).all(paramsIBGE);
    console.log("📊 Dados IBGE:", dadosIBGE);

    if (!dadosIBGE.length) return res.json([]);
    //Até aqui filtrou os dados do IBGE
    //Abaixo filtra os dados do contrato


    // --- 2️⃣ Query base dos contratos ---
    let queryContratos = `
      SELECT
        c.id AS contract_id,
        c.name AS contract_name,
        f.name AS function_name,
        n.name AS network,
        d.cost_usd,
        d.cost_brl
      FROM contracts c
      JOIN contract_functions f ON f.contract_id = c.id
      JOIN contract_function_costs d ON d.function_id = f.id
      JOIN networks n ON n.id = d.network_id
      WHERE 1=1
    `;
    const paramsContratos = {};

    // --- Filtros Contratos ---
    if (contract) { queryContratos += " AND c.name LIKE @contract"; paramsContratos.contract = `%${contract}%`; }
    if (network) { queryContratos += " AND n.name LIKE @network"; paramsContratos.network = `%${network}%`; }
    if (functionName) { queryContratos += " AND f.name LIKE @functionName"; paramsContratos.functionName = `%${functionName}%`; }

    console.log("📜 Query Contratos:", queryContratos);
    console.log("📌 Params Contratos:", paramsContratos);


    const dadosContratos = db.prepare(queryContratos).all(paramsContratos);
    console.log("💰 Dados Contratos:", dadosContratos);

    if (!dadosContratos.length) return res.json([]);

    // --- 3️⃣ Cálculo do custo médio dos contratos selecionados ---
    // const custoMedioBRL =
      // dadosContratos.reduce((acc, d) => acc + (d.cost_brl || 0), 0) / dadosContratos.length;
    const custoTotalBRL = dadosContratos.reduce((acc, d) => acc + (d.cost_brl || 0), 0);
    console.log("💵 Custo total BRL:", custoTotalBRL);


    // const chaveOrdenacao =
    //   orderBy === "estabelecimentos" ? "estabelecimentos" : "valor_vendas";

    // --- 4️⃣ Agregação de produtos (quantidade × custo) ---
    // const agregados = {};
    // dadosIBGE.forEach(d => {
    //     const baseCalculo = Number(d.estabelecimentos) || 0;
    //     agregados[d.produto] = (agregados[d.produto] || 0) + baseCalculo * custoTotalBRL;
    // });
    // console.log("📦 Agregados:", agregados)
    // ;

    // --- 4️⃣ Agregação de produtos (produto + classificação) ---
    const agregados = {};

    dadosIBGE.forEach(d => {
        const estabelecimentos = Number(d.estabelecimentos) || 0;
        const chave = `${d.produto} | ${d.classificacao}`;

        if (!agregados[chave]) {
            agregados[chave] = {
                produto: d.produto,
                classificacao: d.classificacao,
                regiao: d.regiao,
                familiar: d.familiar,
                obrigatorio: d.obrigatorio,
                estabelecimentos: 0,
                total_estimado_brl: 0,
                valor_vendas: d.valor_vendas
            };
        }

        agregados[chave].estabelecimentos += estabelecimentos;
        agregados[chave].total_estimado_brl += estabelecimentos * custoTotalBRL;
    });





    // --- 5️⃣ Ordenação e Top N ---
    let produtosOrdenados = Object.entries(agregados);

    // --- 6️⃣ Montagem do resultado final ---
    const resultado = Object.values(agregados).map(d => {
        const totalEstimado = d.total_estimado_brl;
        const MIL = 1000;
        const valorVendas = (Number(d.valor_vendas) || 0) * MIL;

        const percentual = valorVendas > 0
            ? Number(((totalEstimado / valorVendas) * 100).toFixed(2))
            : 0;

        return {
            produto: d.produto,
            regiao: d.regiao,
            classificacao: d.classificacao,
            familiar: d.familiar,
            obrigatorio: d.obrigatorio,
            estabelecimentos: d.estabelecimentos,
            valor_vendas: valorVendas,
            total_estimado_brl: Number(totalEstimado.toFixed(2)),
            custo_medio_contrato_brl: Number(custoTotalBRL.toFixed(2)),

            // 👇 NOVO CAMPO
            percentual_custo: percentual
        };
    });


        console.log(
    resultado.slice(0, 5).map(r => ({
        produto: r.produto,
        valor_vendas: r.valor_vendas,
        tipo: typeof r.valor_vendas
    }))
    );

    switch (orderBy) {
  case "estabelecimentos":
    resultado.sort((a, b) => b.estabelecimentos - a.estabelecimentos);
    break;

  case "valor_vendas":
    resultado.sort((a, b) => b.valor_vendas - a.valor_vendas);
    break;

  case "total":
  default:
    resultado.sort((a, b) => b.total_estimado_brl - a.total_estimado_brl);
    break;
}


    const topN = top ? Number(top) : resultado.length;
    const resultadoFinal = resultado.slice(0, topN);




    // console.log("✅ Resultado final:", resultadoFinal);


    res.json(resultadoFinal);

  } catch (err) {
    console.error("Erro em /api/results:", err);
    res.status(500).send("Erro ao gerar resultados combinados");
  }
});

// 🔹 Listar contratos
app.get("/api/contracts-list", (req, res) => {
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
app.get("/api/networks-list", (req, res) => {
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
app.get("/api/functions-list", (req, res) => {
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

app.get("/api/contract-abi", (req, res) => {
 const { contract } = req.query;
 const contrato = getDeployedContract(contract);
 if (!contrato) return res.status(404).send("Contrato não encontrado");
 res.json({ abi: contrato.abi, name: contrato.name, address: contrato.address });
});


app.get("/api/deployed-contracts", (req, res) => {
    try {
        const contratos = Array.from(listDeployedContracts().map(name => getDeployedContract(name)));
        console.log("Contratos enviados ao frontend:", contratos);
        res.json(contratos);
    } catch (err) {
        res.status(500).send("Erro ao listar contratos em memória: " + err.message);
    }
});


app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --- Servidor ---

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`
🌍 Servidor unificado rodando!
- Home:                http://localhost:${PORT}/
- Dashboard IBGE:      http://localhost:${PORT}/dashboard
- Gas Estimator:       http://localhost:${PORT}/gas
- Interface Contratos: http://localhost:${PORT}/interface
- Resultados:          http://localhost:${PORT}/results
`);
});

