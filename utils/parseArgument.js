// utils/parseArgument.js

// Converte argumentos com base no formato e tipo esperado
function parseArgument(arg) {
    // Caso o argumento já venha em formato objeto (ex: JSON), tenta converter
    if (typeof arg === "object") return arg;

    // Trata strings
    if (typeof arg === "string") {
        // Endereço Ethereum (address)
        if (/^0x[a-fA-F0-9]{40}$/.test(arg)) return arg;

        // Boolean
        if (arg.toLowerCase() === "true") return true;
        if (arg.toLowerCase() === "false") return false;

        // Array JSON (por ex: "[1,2,3]" ou '["a","b"]')
        if (arg.trim().startsWith("[") && arg.trim().endsWith("]")) {
            try {
                const arr = JSON.parse(arg);
                return Array.isArray(arr)
                    ? arr.map(parseArgument)
                    : arg;
            } catch {
                return arg;
            }
        }

        // Número (inteiro ou decimal)
        if (!isNaN(arg) && arg.trim() !== "") return Number(arg);

        // Bytes32 ou bytes genérico
        if (/^0x[a-fA-F0-9]+$/.test(arg)) return arg;

        // Caso contrário, mantém como string
        return arg;
    }

    // Número direto
    if (typeof arg === "number") return arg;

    return arg;
}

module.exports = { parseArgument };
