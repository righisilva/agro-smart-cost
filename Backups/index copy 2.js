// Importa módulos (pacotes) necessários para o script funcionar
require("dotenv").config();
const fs = require("fs");           // Sistema de arquivos (ler arquivos)
const path = require("path");
const axios = require("axios");     // Fazer requisições HTTP (API web)
const solc = require("solc");       // Compilador Solidity (contratos)
const { ethers } = require("ethers"); // Biblioteca para interagir com Ethereum
const networks = require("./networks.json"); // JSON com dados das redes blockchain

// Pega o caminho do arquivo passado na linha de comando
// Exemplo de uso: node index.js contracts/MeuContrato.sol
const filePath = process.argv[2];
if (!filePath) {
    console.error("❌ Por favor, informe o caminho do arquivo Solidity.");
    process.exit(1);
}

// Resolve o caminho absoluto para evitar problemas
const absolutePath = path.resolve(filePath);

// Lê o código-fonte Solidity do arquivo local "Contrato.sol" (como abrir um arquivo txt)
const source = fs.readFileSync(absolutePath, "utf8");

// Define o formato de entrada esperado pelo compilador Solidity
const input = {
    language: "Solidity",
    sources: {
      // Usa o nome do arquivo (sem caminho) como chave para o compilador
      [path.basename(filePath)]: {
        content: source,  // código do contrato
      },
    },
    settings: {
      outputSelection: {  // define o que queremos como saída da compilação
        "*": {
          "*": ["abi", "evm.bytecode"],  // ABI e bytecode do contrato
        },
      },
    },
  };  

// Compila o código Solidity com solc
const output = JSON.parse(solc.compile(JSON.stringify(input)));

// Extrai o nome do contrato compilado dentro do arquivo "Contrato.sol"
const contractName = Object.keys(output.contracts[path.basename(filePath)])[0];

// Pega o contrato compilado (ABI + bytecode)
const contract = output.contracts[path.basename(filePath)][contractName];

// ABI (Application Binary Interface) é a "assinatura" das funções do contrato
const abi = contract.abi;

// Bytecode é o código binário que será implantado na blockchain
const bytecode = contract.evm.bytecode.object;


// Função assíncrona para buscar preços atuais de tokens na API CoinGecko
async function getTokenPrices() {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=ethereum,binancecoin,matic-network&vs_currencies=usd,brl`;
    const res = await axios.get(url);  // Faz a requisição HTTP (await = espera o resultado)
    return res.data;                   // Retorna os dados obtidos (preços)
  }  

// Função assíncrona que executa o cálculo de gás para uma rede específica
async function runForNetwork(netKey) {
    const net = networks[netKey];  // Pega os dados da rede atual do JSON
    console.log(`🔌 Conectando à ${net.name}...`);
  
    // Cria um provedor (provider) para se conectar ao nó RPC da rede
    const provider = new ethers.providers.JsonRpcProvider(net.rpc);
  
    // Detecta a rede para garantir que a conexão está ok
    try {
      const network = await provider.getNetwork();
      console.log(`✅ Conectado à ${network.name} (chainId: ${network.chainId})`);
    } catch (e) {
      throw new Error("❌ Falha ao detectar a rede.");
    }
  
    // Cria uma carteira nova e aleatória conectada ao provider
    // (a carteira é necessária para estimar o custo de deploy)
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  
    // Cria um "factory" para gerar transações de deploy do contrato
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  
    // Busca os preços atuais dos tokens (ETH, BNB, MATIC)
    const prices = await getTokenPrices();
  
    // Seleciona o token correto da rede atual (ex: 'ethereum', 'binancecoin' ou 'matic-network')
    const tokenId = net.token.toLowerCase();
  
    // Pega o preço do token na API (se não existir, usa o ETH como padrão)
    if (!prices[tokenId]) {
        throw new Error(`❌ Preço do token "${tokenId}" não encontrado na API. Verifique se o nome está correto.`);
    }
    const tokenPrice = prices[tokenId];
      
  
    // Prepara uma transação de deploy do contrato com parâmetros de exemplo
    // Encontra o construtor no ABI do contrato (se houver)
    const constructor = abi.find(item => item.type === "constructor");

    // Gera argumentos falsos com base nos tipos dos parâmetros do construtor
    const fakeArgs = constructor?.inputs?.map((input, index) => {
      switch (input.type) {
        case "string":
          return `fake_string_${index}`; // Ex: "fake_string_0"
        case "uint256":
        case "uint":
        case "int":
        case "int256":
          return 1000 + index; // Qualquer número inteiro
        case "address":
          return wallet.address; // Usa o endereço da carteira temporária
        case "bool":
          return index % 2 === 0; // Alterna true/false
        case "bytes32":
          return ethers.utils.formatBytes32String(`val${index}`); // Converte string em bytes32
        case "bytes":
          return ethers.utils.toUtf8Bytes(`data${index}`); // Converte string em bytes
        case "string[]":
          return [`str1_${index}`, `str2_${index}`]; // Array de strings fictícias
        case "uint256[]":
          return [1 + index, 2 + index]; // Array de inteiros
        case "address[]":
          return [wallet.address]; // Array com um endereço
        default:
          console.warn(`⚠️ Tipo "${input.type}" não suportado. Usando null.`);
          return null;
      }
    }) || []; // Se não houver construtor, fakeArgs = []

    // Cria a transação de deploy com ou sem argumentos, dependendo do construtor
    const tx = fakeArgs.length
      ? factory.getDeployTransaction(...fakeArgs)
      : factory.getDeployTransaction(); // Caso o contrato não exija argumentos

  
    // Estima o gás necessário para executar essa transação
    const estimatedGas = await provider.estimateGas(tx);
  
    // Consulta o preço atual do gás na rede (em wei)
    const gasPrice = await provider.getGasPrice();
  
    // Calcula o custo da transação multiplicando gás pelo preço do gás
    // e converte para uma unidade legível (Ether e tokens)
    const costInToken = ethers.utils.formatEther(estimatedGas.mul(gasPrice));
  
    // Converte o custo para dólar e real usando os preços do token
    const costUSD = parseFloat(costInToken) * tokenPrice.usd;
    const costBRL = parseFloat(costInToken) * tokenPrice.brl;
  
    // Imprime no console os resultados
    console.log(`📦 Gas estimado: ${estimatedGas}`);
    console.log(`💰 Custo: ${costInToken} ${net.token} ≈ $${costUSD.toFixed(2)} / R$${costBRL.toFixed(2)}\n`);
    
  // Imprime no console qual contrato está sendo analisado
  console.log(`🔍 Estimando funções públicas do contrato ${contractName}...\n`);

  // Percorre cada item da ABI (Application Binary Interface)
  for (const item of abi) {
    // Verifica se o item é uma função que NÃO é 'view' nem 'pure' (ou seja, que consome gas)
    if (item.type === "function" && item.stateMutability !== "view" && item.stateMutability !== "pure") {
      const functionName = item.name;  // Pega o nome da função

      // Cria uma lista de argumentos falsos de exemplo para chamar a função
      const fakeArgs = item.inputs.map(input => {
        if (input.type.startsWith("uint")) return 1;
        if (input.type.startsWith("int")) return -1;
        if (input.type === "address") return wallet.address;
        if (input.type === "string") return "exemplo";
        if (input.type === "bool") return false;
        if (input.type === "bytes32") return ethers.utils.formatBytes32String("ex");
        if (input.type.startsWith("bytes")) return "0x1234";
      
        // Arrays
        if (input.type === "uint256[]") return [1, 2, 3];
        if (input.type === "address[]") return [wallet.address, wallet.address];
        if (input.type === "string[]") return ["um", "dois"];
        if (input.type === "bool[]") return [true, false];
      
        console.warn(`⚠️ Tipo não tratado: ${input.type}`);
        return null;
      });
      

      try {
        // Cria uma instância do contrato com endereço fictício (apenas para gerar dados da transação)
        const contractInstance = new ethers.Contract(
          "0x0000000000000000000000000000000000000001", // Endereço fake (nunca será executado)
          abi,
          wallet
        );

        // Gera a transação que chamaria a função com os argumentos fictícios
        const txData = await contractInstance.populateTransaction[functionName](...fakeArgs);

        // Estima o gás que seria gasto para executar essa transação
        const estimatedGasFn = await provider.estimateGas({
          ...txData,       // Inclui os dados da transação
          from: wallet.address,  // Define o remetente da transação
        });

        // Converte o valor estimado de gás * preço do gás para token (ETH, BNB etc.)
        const costFn = ethers.utils.formatEther(estimatedGasFn.mul(gasPrice));

        // Converte esse custo para USD e BRL
        const costFnUSD = parseFloat(costFn) * tokenPrice.usd;
        const costFnBRL = parseFloat(costFn) * tokenPrice.brl;

        // Imprime os dados da função analisada
        console.log(`🔧 Função: ${functionName}`);
        console.log(`   📦 Gas: ${estimatedGasFn}`);
        console.log(`   💰 Custo estimado: ${costFn} ${net.token} ≈ $${costFnUSD.toFixed(2)} / R$${costFnBRL.toFixed(2)}\n`);
      } catch (err) {
        // Se deu erro (por exemplo, tipo de dado inválido), imprime uma mensagem
        console.log(`⚠️  Não foi possível estimar a função "${functionName}": ${err.message}\n`);
      }
    }
  }

    

}
  

// Função principal que executa a estimativa para todas as redes definidas
async function main() {
    // Para cada rede (ethereum, polygon, bsc) no arquivo networks.json
    for (const netKey of Object.keys(networks)) {
      try {
        await runForNetwork(netKey);  // Executa o cálculo para cada rede (espera o resultado)
      } catch (err) {
        // Se ocorrer erro, imprime mensagem
        console.error(`❌ Erro na rede ${netKey}:`, err.message);
      }
    }
  }
  
  // Executa a função principal (async) logo no carregamento do script
  main();
  
