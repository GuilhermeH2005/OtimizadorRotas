const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'sua_chave_secreta_tcc_2026';

// ==========================================
// CONFIGURAÇÕES GERAIS
// ==========================================

app.use(cors());
app.use(express.json());

// ==========================================
// CONEXÃO COM MYSQL
// ==========================================

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
// FUNÇÃO AUXILIAR - EXECUTAR PYTHON
// ==========================================
//
// Essa função centraliza a comunicação com
// o motor Python tsp_osrm.py.
//
// O payload é enviado como argumento para o
// Python.
//
// Retorna uma Promise com o JSON produzido
// pelo Python.
//

function executarPython(payload) {

    return new Promise((resolve, reject) => {

        const scriptPath = path.join(
            __dirname,
            'engine',
            'tsp_osrm.py'
        );

        const pythonCmd =
            process.platform === 'win32'
                ? 'py'
                : 'python3';

        const payloadJson = JSON.stringify(payload);

        const pythonProcess = spawn(
            pythonCmd,
            [scriptPath, payloadJson]
        );

        let dataBuffer = '';
        let errorBuffer = '';

        // --------------------------------------
        // Saída normal
        // --------------------------------------

        pythonProcess.stdout.on('data', (data) => {
            dataBuffer += data.toString();
        });

        // --------------------------------------
        // Erros / logs
        // --------------------------------------

        pythonProcess.stderr.on('data', (data) => {
            errorBuffer += data.toString();
        });

        // --------------------------------------
        // Erro ao iniciar Python
        // --------------------------------------

        pythonProcess.on('error', (error) => {
            reject(error);
        });

        // --------------------------------------
        // Finalização
        // --------------------------------------

        pythonProcess.on('close', (code) => {

            if (code !== 0) {

                reject(
                    new Error(
                        `Falha no motor Python. Código: ${code}. ` +
                        `${errorBuffer}`
                    )
                );

                return;
            }

            try {

                const resultado = JSON.parse(dataBuffer);

                resolve(resultado);

            } catch (parseError) {

                reject(
                    new Error(
                        'Resposta JSON inválida do Python.\n' +
                        `stdout: ${dataBuffer}\n` +
                        `stderr: ${errorBuffer}`
                    )
                );
            }
        });
    });
}

// ==========================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ==========================================

function autenticarToken(req, res, next) {

    const authHeader = req.headers['authorization'];

    const token =
        authHeader &&
        authHeader.split(' ')[1];

    if (!token) {

        return res.status(401).json({
            erro:
                'Acesso negado. Faça login para continuar.'
        });
    }

    jwt.verify(
        token,
        JWT_SECRET,
        (err, usuario) => {

            if (err) {

                return res.status(403).json({
                    erro:
                        'Sessão expirada ou inválida.'
                });
            }

            req.usuario = usuario;

            next();
        }
    );
}

// ==========================================
// 1. AUTENTICAÇÃO
// ==========================================

// ------------------------------------------
// CADASTRO
// ------------------------------------------

app.post(
    '/api/auth/register',
    async (req, res) => {

        const {
            nome,
            email,
            senha
        } = req.body;

        if (!nome || !email || !senha) {

            return res.status(400).json({
                erro:
                    'Preencha todos os campos.'
            });
        }

        try {

            const hashSenha =
                await bcrypt.hash(
                    senha,
                    10
                );

            const sql = `
                INSERT INTO usuarios
                (
                    nome,
                    email,
                    senha_hash
                )
                VALUES (?, ?, ?)
            `;

            db.query(
                sql,
                [
                    nome,
                    email,
                    hashSenha
                ],
                (err, result) => {

                    if (err) {

                        console.error(
                            'Erro MySQL:',
                            err
                        );

                        if (
                            err.code ===
                            'ER_DUP_ENTRY'
                        ) {

                            return res.status(400).json({
                                erro:
                                    'Este e-mail já está cadastrado.'
                            });
                        }

                        return res.status(500).json({
                            erro:
                                'Erro ao registrar usuário.',
                            detalhe:
                                err.message
                        });
                    }

                    res.json({
                        mensagem:
                            'Usuário cadastrado com sucesso!'
                    });
                }
            );

        } catch (e) {

            res.status(500).json({
                erro:
                    'Erro interno no servidor.'
            });
        }
    }
);

// ------------------------------------------
// LOGIN
// ------------------------------------------

app.post(
    '/api/auth/login',
    (req, res) => {

        const {
            email,
            senha
        } = req.body;

        if (!email || !senha) {

            return res.status(400).json({
                erro:
                    'Informe e-mail e senha.'
            });
        }

        db.query(
            'SELECT * FROM usuarios WHERE email = ?',
            [email],
            async (err, results) => {

                if (err) {

                    return res.status(500).json({
                        erro:
                            'Erro ao consultar banco de dados.'
                    });
                }

                if (results.length === 0) {

                    return res.status(400).json({
                        erro:
                            'E-mail ou senha incorretos.'
                    });
                }

                const usuario = results[0];

                const senhaValida =
                    await bcrypt.compare(
                        senha,
                        usuario.senha_hash
                    );

                if (!senhaValida) {

                    return res.status(400).json({
                        erro:
                            'E-mail ou senha incorretos.'
                    });
                }

                const token =
                    jwt.sign(
                        {
                            id: usuario.id,
                            nome: usuario.nome,
                            email: usuario.email
                        },
                        JWT_SECRET,
                        {
                            expiresIn: '8h'
                        }
                    );

                res.json({

                    mensagem:
                        'Login realizado com sucesso!',

                    token,

                    usuario: {
                        id: usuario.id,
                        nome: usuario.nome,
                        email: usuario.email
                    }
                });
            }
        );
    }
);

// ==========================================
// 2. HISTÓRICO DE ROTAS
// ==========================================

// ------------------------------------------
// SALVAR ROTA
// ------------------------------------------

app.post(
    '/api/rotas/salvar',
    autenticarToken,
    (req, res) => {

        const {
            nome_rota,
            metodo_utilizado,
            distancia_km,
            tempo_execucao_ms,
            avaliacoes,           // <-- NOVA MÉTRICA
            iteracoes_realizadas, // <-- NOVA MÉTRICA
            pontos,
            rota_ordenada
        } = req.body;

        const usuario_id = req.usuario.id;

        if (!nome_rota || !metodo_utilizado || !pontos) {
            return res.status(400).json({
                erro: 'Dados incompletos para salvar a rota.'
            });
        }

        const sql = `
            INSERT INTO rotas_salvas
            (
                usuario_id,
                nome_rota,
                metodo_utilizado,
                distancia_km,
                tempo_execucao_ms,
                avaliacoes,           -- <-- COLUNA NOVA
                iteracoes_realizadas, -- <-- COLUNA NOVA
                qtd_pontos,
                pontos_json,
                rota_ordenada_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(
            sql,
            [
                usuario_id,
                nome_rota,
                metodo_utilizado,
                distancia_km,
                tempo_execucao_ms,
                avaliacoes || 0,           // <-- VALOR NOVO
                iteracoes_realizadas || 0, // <-- VALOR NOVO
                pontos.length,
                JSON.stringify(pontos),
                JSON.stringify(rota_ordenada)
            ],
            (err, result) => {
                if (err) {
                    console.error('Erro ao salvar rota:', err);
                    return res.status(500).json({
                        erro: 'Erro ao salvar rota no histórico.'
                    });
                }

                res.json({
                    id: result.insertId,
                    mensagem: 'Rota salva com sucesso!'
                });
            }
        );
    }
);

// ------------------------------------------
// LISTAR ROTAS DO USUÁRIO
// ------------------------------------------

app.get(
    '/api/rotas/minhas-rotas',
    autenticarToken,
    (req, res) => {

        const usuario_id = req.usuario.id;

        const sql = `
            SELECT
                id,
                nome_rota,
                metodo_utilizado,
                distancia_km,
                tempo_execucao_ms,
                avaliacoes,           -- <-- RECUPERAR COLUNA
                iteracoes_realizadas, -- <-- RECUPERAR COLUNA
                qtd_pontos,
                data_criacao
            FROM rotas_salvas
            WHERE usuario_id = ?
            ORDER BY id DESC
        `;

        db.query(sql, [usuario_id], (err, results) => {
            if (err) {
                return res.status(500).json({
                    erro: 'Erro ao carregar histórico.'
                });
            }
            res.json(results);
        });
    }
);

// ------------------------------------------
// DETALHES DA ROTA
// ------------------------------------------

app.get(
    '/api/rotas/:id',
    autenticarToken,
    (req, res) => {

        const sql = `
            SELECT *
            FROM rotas_salvas
            WHERE id = ?
            AND usuario_id = ?
        `;

        db.query(
            sql,
            [
                req.params.id,
                req.usuario.id
            ],
            (err, results) => {

                if (err) {

                    return res.status(500).json({
                        erro:
                            'Erro ao buscar detalhes da rota.'
                    });
                }

                if (results.length === 0) {

                    return res.status(404).json({
                        erro:
                            'Rota não encontrada.'
                    });
                }

                const rota =
                    results[0];

                try {

                    rota.pontos_json =
                        JSON.parse(
                            rota.pontos_json
                        );

                    rota.rota_ordenada_json =
                        JSON.parse(
                            rota.rota_ordenada_json
                        );

                } catch (parseError) {

                    console.error(
                        'Erro ao interpretar JSON da rota:',
                        parseError
                    );
                }

                res.json(rota);
            }
        );
    }
);

// ------------------------------------------
// EXCLUIR ROTA DO HISTÓRICO
// ------------------------------------------

app.delete(
    '/api/rotas/:id',
    autenticarToken,
    (req, res) => {

        const rotaId = req.params.id;
        const usuarioId = req.usuario.id;

        const sql = `
            DELETE FROM rotas_salvas
            WHERE id = ? AND usuario_id = ?
        `;

        db.query(sql, [rotaId, usuarioId], (err, result) => {
            if (err) {
                console.error('Erro ao excluir rota:', err);
                return res.status(500).json({
                    erro: 'Erro ao excluir rota do histórico.'
                });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    erro: 'Rota não encontrada ou você não tem permissão para excluí-la.'
                });
            }

            res.json({
                mensagem: 'Rota excluída com sucesso!'
            });
        });
    }
);

// ==========================================
// 3. CENÁRIOS
// ==========================================

// ------------------------------------------
// SALVAR CENÁRIO
// ------------------------------------------

app.post(
    '/api/cenarios',
    (req, res) => {

        const {
            nome,
            pontos
        } = req.body;

        if (
            !nome ||
            !pontos ||
            !Array.isArray(pontos) ||
            pontos.length < 3
        ) {

            return res.status(400).json({
                erro:
                    'Forneça um nome para o cenário e no mínimo 3 pontos de parada.'
            });
        }

        const querySql = `
            INSERT INTO cenarios
            (
                nome,
                qtd_pontos,
                pontos_json
            )
            VALUES (?, ?, ?)
        `;

        db.query(
            querySql,
            [
                nome,
                pontos.length,
                JSON.stringify(pontos)
            ],
            (err, result) => {

                if (err) {

                    console.error(
                        'Erro ao salvar cenário:',
                        err
                    );

                    return res.status(500).json({
                        erro:
                            'Erro interno ao salvar o cenário no banco de dados.'
                    });
                }

                res.json({
                    id:
                        result.insertId,

                    mensagem:
                        'Cenário registrado com sucesso!'
                });
            }
        );
    }
);

// ------------------------------------------
// LISTAR CENÁRIOS
// ------------------------------------------

app.get(
    '/api/cenarios',
    (req, res) => {

        db.query(
            `
            SELECT
                id,
                nome,
                qtd_pontos,
                data_criacao
            FROM cenarios
            ORDER BY id DESC
            `,
            (err, results) => {

                if (err) {

                    console.error(
                        'Erro ao buscar cenários:',
                        err
                    );

                    return res.status(500).json({
                        erro:
                            'Erro interno ao consultar cenários.'
                    });
                }

                res.json(results);
            }
        );
    }
);

// ==========================================
// 4. OTIMIZAÇÃO NORMAL
// ==========================================
//
// Essa rota continua sendo usada pelo mapa.
//
// Ela permite:
// - Critério clássico
// - Tempo
// - Iterações customizadas
//
// O modo de iterações NÃO participa do
// experimento E1-E4.
//

app.post(
    '/api/otimizar',
    async (req, res) => {

        try {

            const {
                cenario_id,
                pontos,
                circuito_fechado,
                modo_parada,
                tipo_parada,
                valor_parada,
                tempo_limite_s,
                max_iteracoes
            } = req.body;

            // ----------------------------------
            // VALIDAÇÃO
            // ----------------------------------

            if (
                !pontos ||
                !Array.isArray(pontos) ||
                pontos.length < 3
            ) {

                return res.status(400).json({
                    erro:
                        'Envie no mínimo 3 pontos de parada.'
                });
            }

            // ----------------------------------
            // MODO DE PARADA
            // ----------------------------------

            const modoFinal =
                String(
                    modo_parada ||
                    tipo_parada ||
                    'classico'
                )
                    .trim()
                    .toLowerCase();

            let tempoLimiteFinal = null;

            let maxIteracoesFinal = null;

            // ----------------------------------
            // TEMPO
            // ----------------------------------

            if (
                modoFinal === 'tempo'
            ) {

                tempoLimiteFinal =
                    Number(
                        tempo_limite_s ??
                        valor_parada
                    );

                if (
                    !Number.isFinite(
                        tempoLimiteFinal
                    ) ||
                    tempoLimiteFinal <= 0
                ) {

                    tempoLimiteFinal = 10;
                }
            }

            // ----------------------------------
            // ITERAÇÕES
            // ----------------------------------

            else if (
                modoFinal === 'iteracoes'
            ) {

                maxIteracoesFinal =
                    Number(
                        max_iteracoes ??
                        valor_parada
                    );

                if (
                    !Number.isInteger(
                        maxIteracoesFinal
                    ) ||
                    maxIteracoesFinal < 1
                ) {

                    maxIteracoesFinal = 2500;
                }
            }

            // ----------------------------------
            // PAYLOAD
            // ----------------------------------

            const payload = {

                pontos,

                circuito_fechado:
                    circuito_fechado ?? true,

                modo_parada:
                    modoFinal,

                tipo_parada:
                    modoFinal,

                tempo_limite_s:
                    tempoLimiteFinal,

                max_iteracoes:
                    maxIteracoesFinal
            };

            // ----------------------------------
            // EXECUTA PYTHON
            // ----------------------------------

            const resultado =
                await executarPython(
                    payload
                );

            // ----------------------------------
            // VERIFICA ERRO DO PYTHON
            // ----------------------------------

            if (resultado.erro) {

                return res.status(400).json({
                    erro:
                        resultado.erro
                });
            }

            // ----------------------------------
            // SALVAR EXPERIMENTO
            // ----------------------------------

            if (
                cenario_id &&
                resultado.metodos
            ) {

                const metodosParaSalvar = [
                    'opt2',
                    'sa',
                    'aco'
                ];

                for (
                    const mKey
                    of metodosParaSalvar
                ) {

                    const m =
                        resultado.metodos[mKey];

                    if (!m) {
                        continue;
                    }

                    let valorSalvar = 0;

                    if (
                        modoFinal ===
                        'tempo'
                    ) {

                        valorSalvar =
                            tempoLimiteFinal;

                    } else if (
                        modoFinal ===
                        'iteracoes'
                    ) {

                        valorSalvar =
                            maxIteracoesFinal;
                    }

                    const sqlExp = `
                        INSERT INTO experimentos
                        (
                            cenario_id,
                            algoritmo,
                            condicao_parada_tipo,
                            condicao_parada_valor,
                            repeticao,
                            distancia_km,
                            tempo_execucao_ms,
                            iteracoes_realizadas,
                            avaliacoes
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `;

                    db.query(
                        sqlExp,
                        [
                            cenario_id,

                            m.nome ||
                                mKey,

                            modoFinal,

                            valorSalvar,

                            1,

                            Number(
                                m.distancia_km || 0
                            ),

                            Number(
                                m.tempo_execucao_ms || 0
                            ),

                            Number(
                                m.iteracoes_realizadas || 0
                            ),

                            Number(
                                m.avaliacoes || 0
                            )
                        ],
                        (err) => {

                            if (err) {

                                console.error(
                                    'Erro ao salvar experimento:',
                                    err
                                );
                            }
                        }
                    );
                }
            }

            // ----------------------------------
            // RETORNA RESULTADO
            // ----------------------------------

            return res.json(
                resultado
            );

        } catch (error) {

            console.error(
                'Erro em /api/otimizar:',
                error
            );

            return res.status(500).json({
                erro:
                    'Erro ao executar otimização.',

                detalhes:
                    error.message
            });
        }
    }
);

// ==========================================
// 5. EXECUÇÃO DOS EXPERIMENTOS E1-E4
// ==========================================

app.post(
    '/api/experimento-unico',
    async (req, res) => {
        try {
            const { cenario_id, pontos, circuito_fechado, experimento, repeticao } = req.body;

            if (!pontos || pontos.length < 3) {
                return res.status(400).json({ erro: 'Pontos insuficientes.' });
            }

            const configuracoes = {
                e1: { tipo: 'classico', valor: null },
                e2: { tipo: 'tempo', valor: 10 },
                e3: { tipo: 'tempo', valor: 30 },
                e4: { tipo: 'tempo', valor: 60 }
            };

            const config = configuracoes[experimento];
            if (!config) {
                return res.status(400).json({ erro: 'Condição inválida.' });
            }

            // Payload para o Python
            const payload = {
                pontos,
                circuito_fechado: circuito_fechado ?? true,
                modo_parada: config.tipo,
                tipo_parada: config.tipo,
                tempo_limite_s: config.tipo === 'tempo' ? config.valor : null,
                max_iteracoes: null
            };

            // Executa Python
            const resultado = await executarPython(payload);

            if (resultado.erro) {
                return res.status(400).json({ erro: resultado.erro });
            }

            const registrosSalvos = [];
            const algoritmos = [
                ['opt2', resultado.metodos?.opt2],
                ['sa', resultado.metodos?.sa],
                ['aco', resultado.metodos?.aco]
            ];

            // Salva no banco se tiver Cenario ID
            if (cenario_id) {
                for (const [algoritmo, dados] of algoritmos) {
                    if (!dados) continue;

                    const sqlExp = `
                        INSERT INTO experimentos 
                        (cenario_id, algoritmo, condicao_parada_tipo, condicao_parada_valor, repeticao, distancia_km, tempo_execucao_ms, iteracoes_realizadas, avaliacoes) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `;

                    await new Promise((resolve, reject) => {
                        db.query(sqlExp, [
                            cenario_id, algoritmo, config.tipo, config.valor || 0, repeticao,
                            Number(dados.distancia_km || 0),
                            Number(dados.tempo_execucao_ms || 0),
                            Number(dados.iteracoes_realizadas || 0),
                            Number(dados.avaliacoes || 0)
                        ], (err) => {
                            if (err) reject(err); else resolve();
                        });
                    });
                }
            }

            // Prepara resposta
            for (const [algoritmo, dados] of algoritmos) {
                if (!dados) continue;
                registrosSalvos.push({
                    experimento: experimento.toUpperCase(),
                    repeticao,
                    algoritmo,
                    distancia_km: Number(dados.distancia_km || 0),
                    tempo_execucao_ms: Number(dados.tempo_execucao_ms || 0),
                    avaliacoes: Number(dados.avaliacoes || 0),
                    iteracoes_realizadas: Number(dados.iteracoes_realizadas || 0)
                });
            }

            return res.json({ sucesso: true, registros: registrosSalvos });

        } catch (error) {
            console.error('Erro no experimento:', error);
            return res.status(500).json({ erro: 'Erro interno ao processar o teste.', detalhes: error.message });
        }
    }
);

// ==========================================
// 6. INICIALIZAÇÃO
// ==========================================

app.listen(
    PORT,
    () => {

        console.log(
            `🚀 Servidor backend completo rodando em http://localhost:${PORT}`
        );
    }
);