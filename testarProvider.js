const { ethers } = require("ethers");

async function testarConexao(rpcUrl) {
  try {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const rede = await provider.getNetwork();
    console.log(`✅ Conectado à rede: ${rede.name} (chainId: ${rede.chainId})`);
  } catch (err) {
    console.error(`❌ Erro ao conectar com ${rpcUrl}`);
    console.error(err.message);
  }
}

// Teste com três RPCs
testarConexao("https://eth.llamarpc.com");
testarConexao("https://polygon-rpc.com");
testarConexao("https://bsc-dataseed.binance.org");

