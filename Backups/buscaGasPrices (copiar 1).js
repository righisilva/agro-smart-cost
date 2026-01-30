// buscaGasPrices.js

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const axios = require("axios");
const { google } = require("googleapis");
const { Pool } = require("pg");
const networks = require("./networks.json"); // seu arquivo JSON de redes

// === CONFIGURAÇÃO DO POOL NEONDB ===
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // NeonDB
  ssl: { rejectUnauthorized: false },
});

// Cache de IDs de rede
const networkCache = new Map();

// === FUNÇÃO PARA OBTER OU CRIAR NETWORK ID ===
async function getNetworkId(networkName, tokenSymbol) {
  if (networkCache.has(networkName)) return networkCache.get(networkName);

  const res = await pool.query(
    "SELECT id FROM networks WHERE name = $1",
    [networkName]
  );

  if (res.rows.length > 0) {
    networkCache.set(networkName, res.rows[0].id);
    return res.rows[0].id;
  }

  const insertRes = await pool.query(
    "INSERT INTO networks (name, token) VALUES ($1, $2) RETURNING id",
    [networkName, tokenSymbol]
  );

  const newId = insertRes.rows[0].id;
  networkCache.set(networkName, newId);
  return newId;
}

// === FUNÇÃO SALVAR NO BANCO ===
async function saveToDatabase(row) {
  try {
    const networkId = await getNetworkId(row.rede, row.token);

    const query = `
      INSERT INTO gas_history (timestamp, network_id, gas_gwei, price_usd, price_brl)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;

    const values = [
      new Date(row.timestamp),
      networkId,
      parseFloat(row.gasPrice.replace(",", ".")),
      parseFloat(row.cotacaoUsd.replace(",", ".")),
      parseFloat(row.cotacaoBrl.replace(",", ".")),
    ];

    const result = await pool.query(query, values);
    console.log(`🗄️ Salvo no NeonDB (ID: ${result.rows[0].id})`);
  } catch (err) {
    console.error("❌ Erro ao salvar no banco:", err.message);
    throw err;
  }
}

// === FUNÇÃO BACKUP CSV ===
async function saveToCSV(row) {
  const csvFilePath = path.resolve(__dirname, "backup_cotacoes.csv");
  const header = 'timestamp,rede,token,cotacaoUsd,cotacaoBrl,gasPrice\n';

  if (!fs.existsSync(csvFilePath)) fs.writeFileSync(csvFilePath, header);

  const csvRow = `"${row.timestamp}","${row.rede}","${row.token}",${row.cotacaoUsd},${row.cotacaoBrl},${row.gasPrice}\n`;
  fs.appendFileSync(csvFilePath, csvRow);
  console.log("📄 Backup CSV salvo!");
}

// === GOOGLE SHEETS ===
const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const SPREADSHEET_ID = process.env.SHEET_ID;

async function saveToGoogleSheets(data) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  const values = data.map((item) => [
    item.timestamp,
    item.rede,
    item.token,
    item.cotacaoUsd,
    item.cotacaoBrl,
    item.gasPrice,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "Página4!A:F",
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });

  console.log("✅ Dados também salvos no Google Sheets!");
}

// === OBTER PREÇOS DE TOKENS ===
async function getTokenPrices() {
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,binancecoin,polygon-ecosystem-token&vs_currencies=usd,brl";
  const res = await axios.get(url);
  return res.data;
}

// === OBTER GAS DAS REDES ===
async function getGasPricesFromNetworks() {
  const gasPrices = {};

  for (const [key, net] of Object.entries(networks)) {
    if (key === "localhost") continue;

    try {
      const rpcList = Array.isArray(net.rpc) ? net.rpc : [net.rpc];
      let provider, gasPrice;

      for (const rpc of rpcList) {
        try {
          provider = new ethers.providers.JsonRpcProvider(rpc);
          gasPrice = await provider.getGasPrice();
          if (gasPrice) break;
        } catch (e) {
          console.warn(`⚠️ RPC ${rpc} falhou para ${net.name}`);
        }
      }

      if (!gasPrice) {
        console.warn(`⚠️ Nenhum RPC válido para ${net.name}`);
        continue;
      }

      const networkInfo = await provider.getNetwork();
      console.log(`✅ Conectado à ${net.name} (chainId: ${networkInfo.chainId})`);

      gasPrices[net.token] = {
        name: net.name,
        gasPrice,
        tokenId: net.token,
      };
    } catch (err) {
      console.log(`⚠️ Falha ao buscar gasPrice da rede ${net.name}: ${err.message}`);
    }
  }

  return gasPrices;
}

// === MAIN ===
async function main() {
  try {
    const tokenPrices = await getTokenPrices();
    const gasPricesByNetwork = await getGasPricesFromNetworks();

    for (const [token, data] of Object.entries(gasPricesByNetwork)) {
      const tokenPrice = tokenPrices[token];
      if (!tokenPrice) continue;

      const now = new Date().toISOString();

      const row = {
        timestamp: now,
        rede: data.name,
        token: token,
        cotacaoUsd: tokenPrice.usd.toFixed(4).replace(".", ","),
        cotacaoBrl: tokenPrice.brl.toFixed(4).replace(".", ","),
        gasPrice: ethers.utils.formatUnits(data.gasPrice, "gwei").replace(".", ","),
      };

      console.log(`\n🌍 ${data.name}`);
      console.log(`   🪙 1 ${token} = U$ ${row.cotacaoUsd} | R$ ${row.cotacaoBrl}`);
      console.log(`   ⛽ Gas Price: ${row.gasPrice} gwei`);

      try {
        await saveToDatabase(row);
        await saveToGoogleSheets([row]);
      } catch {
        console.warn("⚠️ Banco falhou, fallback para CSV...");
        await saveToCSV(row);
        await saveToGoogleSheets([row]);
      }
    }
  } catch (err) {
    console.error("❌ Erro fatal:", err);
  } finally {
    await pool.end();
  }
}

main();
