const Database = require("better-sqlite3");
const db = new Database("smartagro.db");

/**
 * Limpa todos os dados de uma tabela de forma segura.
 * @param {string} tableName - Nome da tabela a ser limpa.
 */
function limparTabela(tableName) {
    try {
        // Verifica se a tabela existe
        const tabelaExiste = db.prepare(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name=@name
        `).get({ name: tableName });

        if (!tabelaExiste) {
            console.warn(`⚠️ Tabela "${tableName}" não existe.`);
            return;
        }

        // Apaga todos os registros
        db.prepare(`DELETE FROM ${tableName}`).run();
        console.log(`✅ Todos os registros da tabela "${tableName}" foram apagados.`);

        // Reseta o autoincremento, se houver
        db.prepare(`DELETE FROM sqlite_sequence WHERE name=@name`).run({ name: tableName });
        console.log(`🔄 Autoincremento da tabela "${tableName}" resetado.`);
    } catch (err) {
        console.error(`❌ Erro ao limpar a tabela "${tableName}":`, err.message);
    }
}

// Exemplo de uso:
limparTabela("network_costs");
limparTabela("contract_function_costs");
limparTabela("contract_functions");
limparTabela("contract_deploy_costs");
limparTabela("contracts");
// limparTabela("networks");
