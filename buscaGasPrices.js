require("dotenv").config();
const fs = require("fs");
const path = require("path");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const axios = require("axios");
const { ethers } = require("ethers");
const { google } = require("googleapis");
const networks = require("./networks.json");

const csvFilePath = path.resolve(__dirname, "cotacoes_blockchain.csv");
const csvWriter = createCsvWriter({
  path: csvFilePath,
  header: [
    { id: "timestamp", title: "Timestamp" },
    { id: "rede", title: "Rede" },
    { id: "token", title: "Token" },
    { id: "cotacaoUsd", title: "Cotação USD" },
    { id: "cotacaoBrl", title: "Cotação BRL" },
    { id: "gasPrice", title: "Preço do Gas (gwei)" },
  ],
  append: fs.existsSync(csvFilePath),
});

// === CONFIG GOOGLE SHEETS ===
const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json", // chave JSON da Service Account
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// ID da planilha (pegue da URL do Google Sheets)
const SPREADSHEET_ID = process.env.SHEET_ID;

// Função que grava dados na planilha
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
    range: "Página1!A:F",
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });

  console.log("✅ Dados também salvos no Google Sheets!");
}

// === PREÇOS DE TOKENS ===
async function getTokenPrices() {
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,binancecoin,matic-network&vs_currencies=usd,brl";
  const res = await axios.get(url);
  return res.data;
}

// === PREÇOS DO GAS ===
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
        tokenId: net.token,
      };
    } catch (err) {
      console.warn(`⚠️ Falha ao buscar gasPrice da rede ${net.name}: ${err.message}`);
    }
  }
  return gasPrices;
}

// === MAIN ===
async function main() {
  const tokenPrices = await getTokenPrices();
  const gasPricesByNetwork = await getGasPricesFromNetworks();

  for (const [token, data] of Object.entries(gasPricesByNetwork)) {
    const tokenPrice = tokenPrices[token];
    if (!tokenPrice) continue;

    const now = new Date().toISOString(); // UTC

    const row = {
      timestamp: now,
      rede: data.name,
      token: token,
      cotacaoUsd: tokenPrice.usd.toFixed(4).replace(".", ","),
      cotacaoBrl: tokenPrice.brl.toFixed(4).replace(".", ","),
      gasPrice: ethers.utils.formatUnits(data.gasPrice, "gwei").replace(".", ","),
    };

    console.log(`🌍 ${data.name}`);
    console.log(`   🪙  1 ${token} = U$ ${row.cotacaoUsd} | R$ ${row.cotacaoBrl}`);
    console.log(`   ⛽ Gas Price: ${row.gasPrice} gwei\n`);

    // salva no CSV
    await csvWriter.writeRecords([row]);

    // salva no Google Sheets
    await saveToGoogleSheets([row]);
  }
}

main();
