const Database = require("better-sqlite3");
const db = new Database("smartagro.db");

function mostrarTabela(nomeTabela) {
    const rows = db.prepare(`SELECT * FROM ${nomeTabela}`).all();
    console.log(`\n📊 Tabela ${nomeTabela}:`);
    console.table(rows);
}

mostrarTabela("networks");
mostrarTabela("contracts");
mostrarTabela("contract_deploy_costs");
mostrarTabela("contract_functions");
mostrarTabela("contract_function_costs");
mostrarTabela("network_costs");
mostrarTabela("gas_price_history");

db.close();

