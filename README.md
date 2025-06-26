# gas-estimator
mkdir gas-estimator
cd gas-estimator
npm init -y

npm install solc ethers dotenv
npm install axios
npm install ethers@5

node index.js


// Importa módulos (pacotes) necessários para o script funcionar
const fs = require("fs");           // Sistema de arquivos (ler arquivos)
const axios = require("axios");     // Fazer requisições HTTP (API web)
const solc = require("solc");       // Compilador Solidity (contratos)
const { ethers } = require("ethers"); // Biblioteca para interagir com Ethereum
const networks = require("./networks.json"); // JSON com dados das redes blockchain

// Lê o código-fonte Solidity do arquivo local "Contrato.sol" (como abrir um arquivo txt)
const source = fs.readFileSync("Contrato.sol", "utf8");

// Define o formato de entrada esperado pelo compilador Solidity
const input = {
  language: "Solidity",
  sources: {
    "Contrato.sol": {
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
const contractName = Object.keys(output.contracts["Contrato.sol"])[0];

// Pega o contrato compilado (ABI + bytecode)
const contract = output.contracts["Contrato.sol"][contractName];

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
  const wallet = ethers.Wallet.createRandom().connect(provider);

  // Cria um "factory" para gerar transações de deploy do contrato
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);

  // Busca os preços atuais dos tokens (ETH, BNB, MATIC)
  const prices = await getTokenPrices();

  // Seleciona o token correto da rede atual (ex: 'ethereum', 'binancecoin' ou 'matic-network')
  const tokenId = net.token.toLowerCase();

  // Pega o preço do token na API (se não existir, usa o ETH como padrão)
  const tokenPrice = prices[tokenId] || prices.ethereum;

  // Prepara uma transação de deploy do contrato com parâmetros de exemplo
  // Atenção: estes parâmetros devem bater com o construtor do contrato Solidity!
  const tx = factory.getDeployTransaction("ProdutoX", 999);

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

