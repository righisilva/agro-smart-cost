// server.js

// Importa o framework web Express
const express = require("express");

// Importa Multer para lidar com uploads de arquivos
const multer = require("multer");

// Módulo do Node para manipulação de arquivos
const fs = require("fs");

// Módulo do Node para manipulação de caminhos de arquivos
const path = require("path");

// Biblioteca para banco de dados SQLite
const Database = require("better-sqlite3");

// Importa função de análise de contrato do arquivo index.js
const { analisarContrato } = require("./index.js");

// Importa funções do service de contratos
const { analisarContratoManual, getDeployedContract } = require("./contractService");

// Biblioteca ethers.js para interagir com contratos Ethereum
const { ethers } = require("ethers");

// Cria a aplicação Express
const app = express();

// Configura Multer para salvar arquivos enviados na pasta "uploads/"
const upload = multer({ dest: "uploads/" });


// --- 1️⃣ Dashboard IBGE ---

// Serve arquivos estáticos da pasta "public" na raiz "/"
app.use("/", express.static("public"));

// Conecta ao banco de dados SQLite
const db = new Database("smartagro.db");

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
app.use("/gas", express.static("gas-estimator"));

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
app.use("/interface", express.static(path.join(__dirname, "interface-contratos")));

// Permite receber JSON no body das requisições
app.use(express.json());


// --- 1️⃣ Carregar ABI e deploy automático ---

app.post("/api/load-abi", upload.single("contrato"), async (req, res) => {
    const solc = require("solc");
    const { analisarContratoManual } = require("./contractService"); // importa função de deploy

    try {
        if (!req.file) return res.status(400).send("❌ Nenhum arquivo enviado.");

        const filePath = req.file.path;
        const source = fs.readFileSync(filePath, "utf8");

        // Faz deploy do contrato e mede gas
        const deployedInfo = await analisarContratoManual(filePath, console.log);

        if (!deployedInfo || !deployedInfo.address) {
            return res.status(500).send("❌ Erro ao fazer deploy do contrato.");
        }

        // Configuração para recompilar o contrato e extrair ABI
        const input = {
            language: "Solidity",
            sources: {
                [path.basename(filePath)]: { content: source }
            },
            settings: { outputSelection: { "*": { "*": ["abi"] } } }
        };

        // Função para resolver imports
        function findImports(importPath) {
            try {
                const baseDir = path.dirname(filePath);
                let resolvedPath = path.resolve(baseDir, importPath);
                if (fs.existsSync(resolvedPath)) return { contents: fs.readFileSync(resolvedPath, "utf8") };

                const contractsDir = path.resolve(__dirname, "contracts");
                resolvedPath = path.resolve(contractsDir, importPath);
                if (fs.existsSync(resolvedPath)) return { contents: fs.readFileSync(resolvedPath, "utf8") };

                const npmResolved = require.resolve(importPath);
                return { contents: fs.readFileSync(npmResolved, "utf8") };
            } catch (err) {
                return { error: `Import não encontrado: ${importPath}` };
            }
        }

        // Compila o contrato
        const compiled = solc.compile(JSON.stringify(input), { import: findImports });
        const output = JSON.parse(compiled);

        // Checa erros de compilação
        if (output.errors) {
            const hasError = output.errors.some(e => e.severity === "error");
            output.errors.forEach(e => console.log(e.formattedMessage));
            if (hasError) return res.status(500).send("❌ Erro ao compilar contrato. Veja o console para detalhes.");
        }

        // Extrai nome e ABI do contrato
        const contractsObj = output.contracts[path.basename(filePath)];
        if (!contractsObj) return res.status(500).send("❌ Contrato não encontrado no output da compilação.");

        const contractName = Object.keys(contractsObj)[0];
        const abi = contractsObj[contractName].abi;

        // Retorna ABI e info do deploy para o frontend
        res.json({
            abi,
            contractName,
            deployedAddress: deployedInfo.address,
            deployGas: deployedInfo.gasUsed.toString()
        });

    } catch (err) {
        console.error("Erro ao compilar ou deployar contrato:", err);
        res.status(500).send("❌ Erro inesperado ao compilar ou deployar contrato.");
    }
});


// --- 2️⃣ Executar funções do contrato deployado ---

app.post("/api/execute-function", async (req, res) => {
    const { nomeFuncao, args } = req.body;
    const contract = getDeployedContract();

    if (!contract) return res.status(400).send("❌ Nenhum contrato deployado ainda.");

    try {
        // Converte strings em tipos adequados (número, boolean)
        const processedArgs = args.map(arg => {
            if (!isNaN(arg)) return Number(arg);
            if (arg === "true") return true;
            if (arg === "false") return false;
            return arg;
        });

        // Estima gas da função
        const estimatedGas = await contract.estimateGas[nomeFuncao](...processedArgs);

        // Executa função
        const tx = await contract[nomeFuncao](...processedArgs);
        const receipt = await tx.wait();

        // Retorna dados para frontend
        res.json({
            funcao: nomeFuncao,
            gasEstimado: estimatedGas.toString(),
            gasReal: receipt.gasUsed.toString()
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


// --- Servidor ---

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`
🌍 Servidor unificado rodando!
- Dashboard IBGE:      http://localhost:${PORT}/
- Gas Estimator:       http://localhost:${PORT}/gas
- Interface Contratos: http://localhost:${PORT}/interface
`);
});

