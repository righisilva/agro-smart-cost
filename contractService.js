// contractService.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const solc = require("solc");
const { ethers } = require("ethers");

const { getHardhatProvider } = require("./services/providerService");

/**
 * Compila um arquivo Solidity e retorna, para cada contrato com bytecode
 * válido, o ABI e os parâmetros do construtor — SEM deployar.
 * @param {string} filePath Caminho do arquivo Solidity
 * @param {function} log Função de log (padrão console.log)
 * @returns {Promise<Array>} lista de { contractName, abi, bytecode, constructorInputs }
 */
async function compilarContrato(filePath, log = console.log) {
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

    const results = [];

    for (const [contractName, contractData] of Object.entries(output.contracts[path.basename(filePath)])) {
        const abi = contractData.abi;
        const bytecode = contractData.evm.bytecode.object;

        if (!bytecode || bytecode === "0x") {
            log(`⚠️ Contrato ${contractName} não possui bytecode (provavelmente é uma interface ou biblioteca).`);
            continue;
        }

        const constructor = abi.find(item => item.type === "constructor");
        const constructorInputs = constructor?.inputs || [];

        log(`📄 Contrato compilado: ${contractName} (${constructorInputs.length} parâmetro(s) de construtor)`);

        results.push({ contractName, abi, bytecode, constructorInputs });
    }

    if (!results.length) {
        log("⚠️ Nenhum contrato compilável encontrado (com bytecode válido).");
    }

    return results;
}

/**
 * Deploya um contrato já compilado (abi + bytecode vindos de compilarContrato)
 * usando os argumentos de construtor fornecidos pelo usuário.
 * @param {string} contractName Nome do contrato (para log)
 * @param {{abi: any[], bytecode: string}} compilado Resultado de compilarContrato
 * @param {any[]} args Argumentos do construtor, já convertidos (ver utils/parseArgument)
 * @param {function} log Função de log (padrão console.log)
 */
async function deployContratoCompilado(contractName, compilado, args, log = console.log) {
    const { abi, bytecode } = compilado;

    log(`🚀 Fazendo deploy do contrato: ${contractName}`);
    log(`📦 Parâmetros de deploy (${contractName}): ${JSON.stringify(args, null, 2)}`);

    const provider = getHardhatProvider();
    const accounts = await provider.listAccounts();
    const wallet = provider.getSigner(accounts[0]);
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);

    const contractInstance = await factory.deploy(...args);
    const txReceipt = await contractInstance.deployTransaction.wait();

    log(`✅ ${contractName} deployado em: ${contractInstance.address}`);

    return {
        contractName,
        address: contractInstance.address,
        gasUsed: txReceipt.gasUsed,
        abi,
    };
}

module.exports = { compilarContrato, deployContratoCompilado };
