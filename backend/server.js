const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const mysql = require('mysql2');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'otimizador_rotas',
    waitForConnections: true,
    connectionLimit: 10
});

app.post('/api/otimizar', (req, res) => {
    const { pontos, circuito_fechado } = req.body;

    if (!pontos || !Array.isArray(pontos) || pontos.length < 3) {
        return res.status(400).json({ erro: 'Envie no mínimo 3 pontos de parada.' });
    }

    const scriptPath = path.join(__dirname, 'engine', 'tsp_osrm.py');
    const payloadJson = JSON.stringify({ pontos, circuito_fechado });

    const pythonProcess = spawn('py', [scriptPath, payloadJson]);

    let dataBuffer = '';
    let errorBuffer = '';

    pythonProcess.stdout.on('data', (data) => { dataBuffer += data.toString(); });
    pythonProcess.stderr.on('data', (data) => { errorBuffer += data.toString(); });

    pythonProcess.on('close', (code) => {
        if (code !== 0) {
            return res.status(500).json({ erro: 'Falha no motor Python.', detalhes: errorBuffer });
        }

        try {
            const resultado = JSON.parse(dataBuffer);

            // Trata erros repassados explicitamente pelo Python (ex: matriz OSRM com None)
            if (resultado.erro) {
                return res.status(400).json({ erro: resultado.erro });
            }

            // Distância da Ordem Original Real (Linha de base do usuário)
            const distInicial = resultado.metodos.original.distancia_km;

            // Encontra a melhor rota entre os algoritmos de otimização
            const melhorDist = Math.min(
                resultado.metodos.nn.distancia_km,
                resultado.metodos.opt2.distancia_km,
                resultado.metodos.sa.distancia_km
            );

            const economia = Math.max(0, distInicial - melhorDist);
            const percentual = distInicial > 0 ? (economia / distInicial) * 100 : 0;

            const querySql = `
                INSERT INTO historico_rotas 
                (qtd_pontos, distancia_inicial_km, distancia_otimizada_km, economia_km, melhoria_percentual) 
                VALUES (?, ?, ?, ?, ?)
            `;

            db.query(querySql, [pontos.length, distInicial, melhorDist, economia.toFixed(2), percentual.toFixed(2)], (err) => {
                if (err) console.error('Erro MySQL:', err);
                return res.json(resultado);
            });

        } catch (parseError) {
            return res.status(500).json({ erro: 'Resposta inválida do servidor.' });
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor backend completo rodando em http://localhost:${PORT}`);
});