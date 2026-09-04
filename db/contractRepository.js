// db/contractRepository.js

// Recebe a instância do better-sqlite3 (mesma usada em server.js) e devolve
// funções de acesso aos dados de contratos/funções/custos.
function createContractRepository(db) {
    function salvarContractNoDB(name, address) {
        const existing = db.prepare("SELECT id FROM contracts WHERE name = ?").get(name);
        if (existing) return existing.id;
        const result = db
            .prepare("INSERT INTO contracts (name, address) VALUES (?, ?)")
            .run(name, address);
        return result.lastInsertRowid;
    }

    function salvarFuncaoContratoNoDB(contractId, nomeFuncao) {
        const existing = db
            .prepare("SELECT id FROM contract_functions WHERE contract_id = ? AND name = ?")
            .get(contractId, nomeFuncao);
        if (existing) return existing.id;
        const result = db
            .prepare("INSERT INTO contract_functions (contract_id, name) VALUES (?, ?)")
            .run(contractId, nomeFuncao);
        return result.lastInsertRowid;
    }

    function salvarFuncaoNoDB(functionId, networkId, gasUsed, costUSD, costBRL) {
        db.prepare(`
            INSERT INTO contract_function_costs
                (function_id, network_id, gas_used, cost_usd, cost_brl)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(function_id, network_id)
            DO UPDATE SET
                gas_used = excluded.gas_used,
                cost_usd = excluded.cost_usd,
                cost_brl = excluded.cost_brl
        `).run(functionId, networkId, gasUsed, costUSD, costBRL);
    }

    function salvarNetworkCosts(networkId, gasPrice, costUSD, costBRL) {
        db.prepare(`
            INSERT INTO network_costs (network_id, gas_tracker, cost_usd, cost_brl)
            VALUES (?, ?, ?, ?)
        `).run(networkId, gasPrice, costUSD, costBRL);
    }

    function listarContratos() {
        return db.prepare("SELECT DISTINCT name FROM contracts ORDER BY name").all();
    }

    function listarRedes() {
        return db.prepare("SELECT DISTINCT name FROM networks").all();
    }

    function listarFuncoes(contractName) {
        let query = `
            SELECT DISTINCT f.name
            FROM contract_functions f
            JOIN contracts c ON c.id = f.contract_id
            WHERE 1=1
        `;
        const params = {};

        if (contractName) {
            query += " AND c.name = @contract";
            params.contract = contractName;
        }

        return db.prepare(query).all(params);
    }

    return {
        salvarContractNoDB,
        salvarFuncaoContratoNoDB,
        salvarFuncaoNoDB,
        salvarNetworkCosts,
        listarContratos,
        listarRedes,
        listarFuncoes,
    };
}

module.exports = { createContractRepository };
