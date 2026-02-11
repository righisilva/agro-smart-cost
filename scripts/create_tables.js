// create_tables.js
const Database = require("better-sqlite3");
const db = new Database("smartagro.db");

try {
    // ------------------------------
    // Tabela de redes
    // ------------------------------
    db.prepare(`
        CREATE TABLE IF NOT EXISTS networks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            token TEXT NOT NULL,
            rpc TEXT NOT NULL
        );
    `).run();

    // ------------------------------
    // Tabela de contratos
    // ------------------------------
    db.prepare(`
        CREATE TABLE IF NOT EXISTS contracts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            address TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `).run();

    // ------------------------------
    // Custos de deploy de contratos por rede
    // ------------------------------
    db.prepare(`
        CREATE TABLE IF NOT EXISTS contract_deploy_costs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contract_id INTEGER NOT NULL,
            network_id INTEGER NOT NULL,
            gas_used INTEGER NOT NULL,
            cost_usd REAL,
            cost_brl REAL,
            FOREIGN KEY (contract_id) REFERENCES contracts(id),
            FOREIGN KEY (network_id) REFERENCES networks(id)
        );
    `).run();

    // ------------------------------
    // Funções de contratos
    // ------------------------------
    db.prepare(`
        CREATE TABLE IF NOT EXISTS contract_functions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contract_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            inputs TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (contract_id) REFERENCES contracts(id)
        );
    `).run();

    // ------------------------------
    // Custos de execução de funções por rede
    // ------------------------------
    db.prepare(`
        CREATE TABLE IF NOT EXISTS contract_function_costs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            function_id INTEGER NOT NULL,
            network_id INTEGER NOT NULL,
            gas_used INTEGER NOT NULL,
            cost_usd REAL,
            cost_brl REAL,
            FOREIGN KEY (function_id) REFERENCES contract_functions(id),
            FOREIGN KEY (network_id) REFERENCES networks(id)
        );
    `).run();

    // ------------------------------
    // Custos gerais por rede (deploy ou função)
    // ------------------------------
    db.prepare(`
        CREATE TABLE IF NOT EXISTS network_costs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            network_id INTEGER NOT NULL,      
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            gas_tracker REAL NOT NULL
            cost_usd REAL,
            cost_brl REAL,
            FOREIGN KEY (network_id) REFERENCES networks(id)
        );
    `).run();

    // ------------------------------
    // Histórico do preço do gas (opcional)
    // ------------------------------
    db.prepare(`
        CREATE TABLE IF NOT EXISTS gas_price_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            network_id INTEGER NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            gas_price INTEGER NOT NULL,
            cotacao_usd REAL,
            cotacao_brl REAL,
            FOREIGN KEY (network_id) REFERENCES networks(id)
        );
    `).run();

    console.log("✅ Tabelas criadas com sucesso!");
} catch (err) {
    console.error("❌ Erro ao criar tabelas:", err.message);
} finally {
    db.close();
}

