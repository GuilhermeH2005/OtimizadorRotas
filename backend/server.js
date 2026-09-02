const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const mysql = require('mysql2');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Pool de conexão com o banco MySQL (Padrão XAMPP: user 'root' e sem senha)
const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '', 
    database: 'otimizador_rotas',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// ==========================================
// 1. ROTAS PARA GERENCIAMENTO DE CENÁRIOS
// ==========================================

// Salva um cenário de pontos fixos para testes repetíveis
app.post('/api/cenarios', (req, res) => {
    const { nome, pontos } = req.body;

    if (!nome || !pontos || !Array.isArray(pontos) || pontos.length < 3) {
        return res.status(400).json({ erro: 'Forneça um nome para o cenário e no mínimo 3 pontos de parada.' });
    }

    const querySql = 'INSERT INTO cenarios (nome, qtd_pontos, pontos_json) VALUES (?, ?, ?)';
    db.query(querySql, [nome, pontos.length, JSON.stringify(pontos)], (err, result) => {
        if (err) {
            console.error('Erro ao salvar cenário:', err);
            return res.status(500).json({ erro: 'Erro interno ao salvar o cenário no banco de dados.' });
        }
        res.json({ id: result.insertId, mensagem: 'Cenário registrado com sucesso!' });
    });
});

// Lista todos os cenários cadastrados
app.get('/api/cenarios', (req, res) => {
    db.query('SELECT id, nome, qtd_pontos, data_criacao FROM cenarios ORDER BY id DESC', (err, results) => {
        if (err) {
            console.error('Erro ao buscar cenários:', err);
            return res.status(500).json({ erro: 'Erro interno ao consultar cenários.' });
        }
        res.json(results);
    });
});

// ==========================================
// 2. ROTA PRINCIPAL DE OTIMIZAÇÃO E EXPERIMENTOS
// ==========================================

app.post('/api/otimizar', (req, res) => {
    const { cenario_id, pontos, circuito_fechado, tipo_parada, valor_parada } = req.body;

    if (!pontos || !Array.isArray(pontos) || pontos.length < 3) {
        return res.status(400).json({ erro: 'Envie no mínimo 3 pontos de parada.' });
    }

    const scriptPath = path.join(__dirname, 'engine', 'tsp_osrm.py');
    const payloadJson = JSON.stringify({
        pontos,
        circuito_fechado: circuito_fechado ?? true,
        tipo_parada: tipo_parada || 'iteracoes_sem_melhoria',
        valor_parada: Number(valor_parada) || 20
    });

    const pythonCmd = process.platform === 'win32' ? 'py' : 'python3';
    const pythonProcess = spawn(pythonCmd, [scriptPath, payloadJson]);

    let dataBuffer = '';
    let errorBuffer = '';

    pythonProcess.stdout.on('data', (data) => { dataBuffer += data.toString(); });
    pythonProcess.stderr.on('data', (data) => { errorBuffer += data.toString(); });

    pythonProcess.on('close', (code) => {
        if (code !== 0) {
            console.error('Erro no Python:', errorBuffer);
            return res.status(500).json({ erro: 'Falha no motor Python.', detalhes: errorBuffer });
        }

        try {
            const resultado = JSON.parse(dataBuffer);

            if (resultado.erro) {
                return res.status(400).json({ erro: resultado.erro });
            }

            // Grava os resultados dos testes na tabela 'experimentos' caso um cenario_id tenha sido informado
            if (cenario_id && resultado.metodos) {
                const metodosParaSalvar = ['opt2', 'sa', 'aco'];
                metodosParaSalvar.forEach((mKey) => {
                    const m = resultado.metodos[mKey];
                    if (m) {
                        const sqlExp = `
                            INSERT INTO experimentos 
                            (cenario_id, algoritmo, condicao_parada_tipo, condicao_parada_valor, distancia_km, tempo_execucao_ms, iteracoes_realizadas) 
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `;
                        db.query(sqlExp, [
                            cenario_id,
                            m.nome,
                            tipo_parada || 'iteracoes_sem_melhoria',
                            valor_parada || 20,
                            m.distancia_km,
                            m.tempo_execucao_ms || 0,
                            m.iteracoes_realizadas || 0
                        ], (err) => {
                            if (err) console.error('Erro ao salvar experimento:', err);
                        });
                    }
                });
            }

            return res.json(resultado);

        } catch (parseError) {
            return res.status(500).json({ erro: 'Resposta JSON inválida do servidor Python.' });
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor backend completo rodando em http://localhost:${PORT}`);
});