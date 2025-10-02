const express = require("express");
const multer = require("multer");
const fs = require("fs");
const { analisarContrato } = require("./index.js");

const app = express();
const upload = multer({ dest: "uploads/" });

// Página inicial com formulário
app.get("/", (req, res) => {
  res.send(`
    <h1>Gas Estimator</h1>
    <p>Envie um arquivo Solidity para análise:</p>
    <form action="/analisar" method="post" enctype="multipart/form-data">
      <input type="file" name="contrato" accept=".sol" required />
      <button type="submit">Enviar</button>
    </form>
    <pre id="log" style="font-family: monospace; background:#222; color:#fff; padding:10px; border-radius:5px; max-height:80vh; overflow:auto;"></pre>
    <script>
      // Apenas para manter o scroll automático (opcional)
      const logElem = document.getElementById("log");
      const observer = new MutationObserver(() => logElem.scrollTop = logElem.scrollHeight);
      observer.observe(logElem, { childList: true });
    </script>
  `);
});

// Rota POST /analisar com streaming
app.post("/analisar", upload.single("contrato"), async (req, res) => {
  if (!req.file) return res.status(400).send("❌ Nenhum arquivo enviado.");

  // Configura streaming
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Transfer-Encoding": "chunked"
  });

  // Função de log em tempo real
  const log = (msg) => {
    console.log(msg); // terminal
    res.write(msg.replace(/\n/g,"<br>") + "<br>"); // navegador
  };

  try {
    await analisarContrato(req.file.path, log);

    // Remove arquivo temporário
    fs.unlink(req.file.path, err => {
      if (err) console.warn("⚠️ Não foi possível deletar arquivo temporário:", err.message);
    });

    res.write("<br>✅ Análise concluída!<br>");
    res.end();
  } catch (err) {
    res.write(`<br>❌ Erro: ${err.message}<br>`);
    res.end();
  }
});

// Inicia servidor
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🌍 Servidor rodando em http://localhost:${PORT}`);
});
