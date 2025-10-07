const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { analisarContratoManual, getDeployedContract } = require("./contractService");
const { ethers } = require("ethers");


const app = express();
const upload = multer({ dest: "uploads/" });

app.use("/interface", express.static(path.join(__dirname, "interface-contratos")));
app.use(express.json());

// --- 1️⃣ Carregar ABI e deploy automático ---
app.post("/api/load-abi", upload.single("contrato"), async (req, res) => {
  const solc = require("solc");
  const { analisarContratoManual } = require("./contractService"); // ✅ importa a função que faz o deploy

  try {
    if (!req.file) {
      return res.status(400).send("❌ Nenhum arquivo enviado.");
    }

    const filePath = req.file.path;
    const source = fs.readFileSync(filePath, "utf8");

    // 🔧 Faz o deploy e mede o gas antes de gerar a ABI
    const deployedInfo = await analisarContratoManual(filePath, console.log);

    if (!deployedInfo || !deployedInfo.address) {
      return res.status(500).send("❌ Erro ao fazer deploy do contrato.");
    }

    // 🧩 Compila novamente para extrair a ABI
    const input = {
      language: "Solidity",
      sources: {
        [path.basename(filePath)]: { content: source }
      },
      settings: {
        outputSelection: { "*": { "*": ["abi"] } }
      }
    };

    // Função para resolver imports locais e pacotes npm
    function findImports(importPath) {
      console.log("📂 Procurando import:", importPath);
      try {
        // 1️⃣ Caminho relativo ao arquivo que está sendo compilado
        const baseDir = path.dirname(filePath);
        let resolvedPath = path.resolve(baseDir, importPath);
        if (fs.existsSync(resolvedPath)) {
          return { contents: fs.readFileSync(resolvedPath, "utf8") };
        }

        // 2️⃣ Caminho dentro da pasta contracts
        const contractsDir = path.resolve(__dirname, "contracts");
        resolvedPath = path.resolve(contractsDir, importPath);
        if (fs.existsSync(resolvedPath)) {
          return { contents: fs.readFileSync(resolvedPath, "utf8") };
        }

        // 3️⃣ Pacote npm
        const npmResolved = require.resolve(importPath);
        return { contents: fs.readFileSync(npmResolved, "utf8") };

      } catch (err) {
        return { error: `Import não encontrado: ${importPath}` };
      }
    }



    // Compila com suporte a imports locais
    const compiled = solc.compile(JSON.stringify(input), { import: findImports });
    const output = JSON.parse(compiled);


    if (output.errors) {
      const hasError = output.errors.some(e => e.severity === "error");
      output.errors.forEach(e => console.log(e.formattedMessage));
      if (hasError) {
        return res.status(500).send("❌ Erro ao compilar contrato. Veja o console para detalhes.");
      }
    }

    // Extrai o nome e a ABI do contrato
    const contractsObj = output.contracts[path.basename(filePath)];
    if (!contractsObj) {
      return res.status(500).send("❌ Contrato não encontrado no output da compilação.");
    }

    const contractName = Object.keys(contractsObj)[0];
    const abi = contractsObj[contractName].abi;

    // ✅ Retorna tudo para o frontend
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
    const processedArgs = args.map(arg => {
      if (!isNaN(arg)) return Number(arg);
      if (arg === "true") return true;
      if (arg === "false") return false;
      return arg;
    });

    const estimatedGas = await contract.estimateGas[nomeFuncao](...processedArgs);
    const tx = await contract[nomeFuncao](...processedArgs);
    const receipt = await tx.wait();

    res.json({
      funcao: nomeFuncao,
      gasEstimado: estimatedGas.toString(),
      gasReal: receipt.gasUsed.toString()
    });

  } catch (err) {
    res.status(500).send(`⚠️ Erro ao executar "${nomeFuncao}": ${err.message}`);
  }
});

//console.log("Ethers object:", ethers);


// Novo endpoint para pegar accounts do Hardhat
app.get("/api/accounts", async (req, res) => {
  try {
    console.log("Listando contas do Hardhat...");
    const provider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");
    const accounts = await provider.listAccounts();
    console.log("Accounts encontradas:", accounts);
    res.json(accounts);
  } catch (err) {
    res.status(500).send("Erro ao obter contas: " + err.message);
  }
});


// --- Servidor ---
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`
🌍 Servidor de contratos rodando!
- Interface: http://localhost:${PORT}/interface
`);
});

