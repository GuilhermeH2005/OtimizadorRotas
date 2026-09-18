// ============================================================
// 1. CONFIGURAÇÃO INICIAL DO MAPA
// ============================================================

var map = L.map('mapa').setView([-18.726, -47.498], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
}).addTo(map);

// ============================================================
// 2. VARIÁVEIS GLOBAIS
// ============================================================

let pontos = [];
let marcadores = [];
let camadaRota = null;

let timerCidade = null;
let timerEndereco = null;

let cidadeAtualFiltro = "Monte Carmelo";

let dadosResultadoGlobal = null;
let metodoFixado = null;

let cacheTrajetosGeoJSON = {};
let instanciaGrafico = null;

// ============================================================
// 3. CONFIGURAÇÕES DA API
// ============================================================

const API_BASE_URL = 'http://localhost:3000/api';

// ============================================================
// 4. CONSTANTES LOGÍSTICAS
// ============================================================

const CONSUMO_MEDIO_KML = 8.5;
const PRECO_COMBUSTIVEL_LITRO = 6.50;
const VELOCIDADE_MEDIA_KMH = 40;

const CORES_TRECHOS = [
    '#2563eb',
    '#ea580c',
    '#16a34a',
    '#9333ea',
    '#e11d48',
    '#0891b2'
];

// ============================================================
// 5. ÍCONES LEAFLET
// ============================================================

const iconeInicio = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const iconeParadaPadrao = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

async function excluirRotaHistorico(idRota) {
    if (!confirm("Tem certeza que deseja excluir esta rota do histórico?")) {
        return;
    }

    try {
        const token = localStorage.getItem('token_jwt');

        const resposta = await fetch(`http://localhost:3000/api/rotas/${idRota}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            throw new Error(dados.erro || 'Erro ao excluir rota.');
        }

        alert(dados.mensagem);
        
        carregarMinhasRotas(); 

    } catch (error) {
        console.error('Erro:', error);
        alert(error.message);
    }
}

function criarIconeNumerado(numero, ehPartida = false) {

    const corFundo = ehPartida
        ? '#ef4444'
        : '#0284c7';

    return L.divIcon({
        className: 'custom-div-icon',

        html: `
            <div style="
                background-color: ${corFundo};
                color: white;
                font-weight: bold;
                font-size: 13px;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 2px solid white;
                box-shadow: 0 2px 5px rgba(0,0,0,0.5);
            ">
                ${numero}
            </div>
        `,

        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });
}

// ============================================================
// 6. FUNÇÕES AUXILIARES
// ============================================================

function sincronizarPontosGlobais() {
    window.pontos = pontos;
    window.marcadores = marcadores;
    window.dadosResultadoGlobal = dadosResultadoGlobal;
}

function obterPontosAtuais() {

    if (Array.isArray(pontos)) {
        return pontos;
    }

    if (Array.isArray(window.pontos)) {
        return window.pontos;
    }

    return [];
}

function obterDadosMetodo(chave) {

    if (!dadosResultadoGlobal?.metodos) {
        return null;
    }

    return dadosResultadoGlobal.metodos[chave] || null;
}

function formatarNumero(valor, casas = 2) {

    const numero = Number(valor);

    if (!Number.isFinite(numero)) {
        return '0';
    }

    return numero.toFixed(casas);
}

// ============================================================
// 7. FORMATAÇÃO LOGÍSTICA
// ============================================================

function formatarTempoViagem(distanciaKm) {

    const distancia = Number(distanciaKm) || 0;

    const horasDecimais =
        distancia / VELOCIDADE_MEDIA_KMH;

    const horas =
        Math.floor(horasDecimais);

    const minutos =
        Math.round(
            (horasDecimais - horas) * 60
        );

    if (horas === 0) {
        return `${minutos} min`;
    }

    return `${horas}h ${minutos}m`;
}

function formatarCustoCombustivel(distanciaKm) {

    const distancia = Number(distanciaKm) || 0;

    const litros =
        distancia / CONSUMO_MEDIO_KML;

    const custo =
        litros * PRECO_COMBUSTIVEL_LITRO;

    return `R$ ${custo.toFixed(0)}`;
}

// ============================================================
// 8. GRÁFICO COMPARATIVO
// ============================================================

function renderizarGraficoComparativo(metodos) {

    const canvas =
        document.getElementById('graficoComparativo');

    if (!canvas || !metodos) {
        return;
    }

    const ctx =
        canvas.getContext('2d');

    const labels = [
        'Original',
        '2-Opt',
        'Simulated Annealing',
        'Formigas (ACO)'
    ];

    const chaves = [
        'original',
        'opt2',
        'sa',
        'aco'
    ];

    const distancias = chaves.map(chave =>
        Number(
            metodos[chave]?.distancia_km || 0
        )
    );

    const tempos = chaves.map(chave =>
        Number(
            metodos[chave]?.tempo_execucao_ms || 0
        )
    );

    if (instanciaGrafico) {
        instanciaGrafico.destroy();
        instanciaGrafico = null;
    }

    const pluginsUsados = [];

    if (typeof ChartDataLabels !== 'undefined') {
        pluginsUsados.push(ChartDataLabels);
    }

    instanciaGrafico = new Chart(ctx, {

        type: 'bar',

        data: {

            labels,

            datasets: [

                {
                    label: 'Distância (km)',

                    data: distancias,

                    backgroundColor:
                        'rgba(59, 130, 246, 0.85)',

                    borderColor:
                        'rgba(59, 130, 246, 1)',

                    borderWidth: 1,

                    yAxisID: 'yDistancia'
                },

                {
                    label: 'Tempo Execução (ms)',

                    data: tempos,

                    backgroundColor:
                        'rgba(239, 68, 68, 0.85)',

                    borderColor:
                        'rgba(239, 68, 68, 1)',

                    borderWidth: 1,

                    yAxisID: 'yTempo',

                    minBarLength: 4
                }
            ]
        },

        options: {

            responsive: true,

            maintainAspectRatio: false,

            plugins: {

                tooltip: {

                    callbacks: {

                        footer: function (tooltipItems) {

                            if (
                                !tooltipItems ||
                                tooltipItems.length === 0
                            ) {
                                return '';
                            }

                            const index =
                                tooltipItems[0].dataIndex;

                            const chave =
                                chaves[index];

                            const dados =
                                metodos[chave];

                            if (!dados) {
                                return '';
                            }

                            const iteracoes =
                                dados.iteracoes_realizadas ?? 0;

                            const avaliacoes =
                                dados.avaliacoes ?? 0;

                            const tempo =
                                dados.tempo_execucao_ms ?? 0;

                            const distancia =
                                dados.distancia_km ?? 0;

                            return [
                                `M1 - Distância: ${Number(distancia).toFixed(2)} km`,
                                `M2 - Tempo: ${Number(tempo).toFixed(2)} ms`,
                                `M3 - Avaliações: ${avaliacoes}`,
                                `M4 - Iterações: ${iteracoes}`
                            ];
                        }
                    }
                },

                datalabels: {

                    anchor: 'end',

                    align: 'top',

                    color: '#f8fafc',

                    font: {
                        weight: 'bold',
                        size: 10
                    },

                    formatter: function (value, context) {

                        if (value === 0) {
                            return '0';
                        }

                        if (
                            context.dataset.label
                                .includes('Distância')
                        ) {
                            return `${Number(value).toFixed(1)} km`;
                        }

                        return value < 1
                            ? `${Number(value).toFixed(2)} ms`
                            : `${Number(value).toFixed(0)} ms`;
                    }
                }
            },

            scales: {

                yDistancia: {

                    type: 'linear',

                    position: 'left',

                    beginAtZero: true,

                    title: {
                        display: true,
                        text: 'Distância (km)',
                        color: '#94a3b8'
                    },

                    ticks: {
                        color: '#cbd5e1'
                    },

                    grid: {
                        color:
                            'rgba(255,255,255,0.05)'
                    }
                },

                yTempo: {

                    type: 'linear',

                    position: 'right',

                    beginAtZero: true,

                    title: {
                        display: true,
                        text: 'Tempo (ms)',
                        color: '#94a3b8'
                    },

                    ticks: {
                        color: '#cbd5e1'
                    },

                    grid: {
                        drawOnChartArea: false
                    }
                },

                x: {

                    ticks: {
                        color: '#cbd5e1'
                    },

                    grid: {
                        color:
                            'rgba(255,255,255,0.05)'
                    }
                }
            }
        },

        plugins: pluginsUsados
    });

    atualizarCardVencedor(metodos);
}

// ============================================================
// 9. CARD DO VENCEDOR
// ============================================================

function atualizarCardVencedor(metodos) {

    const cardVencedor =
        document.getElementById('card-vencedor');

    if (!cardVencedor || !metodos) {
        return;
    }

    const listaMetodos = [

        {
            chave: '2-Opt',
            dados: metodos.opt2
        },

        {
            chave: 'Simulated Annealing',
            dados: metodos.sa
        },

        {
            chave: 'Formigas (ACO)',
            dados: metodos.aco
        }

    ].filter(m =>
        m.dados &&
        Number(m.dados.distancia_km) > 0
    );

    if (listaMetodos.length === 0) {
        return;
    }

    const vencedor =
        listaMetodos.reduce(
            (melhor, atual) => {

                return Number(atual.dados.distancia_km)
                    <
                    Number(melhor.dados.distancia_km)
                    ? atual
                    : melhor;

            },
            listaMetodos[0]
        );

    const distOriginal =
        Number(
            metodos.original?.distancia_km ||
            vencedor.dados.distancia_km
        );

    const distVencedor =
        Number(
            vencedor.dados.distancia_km
        );

    const reducao =
        distOriginal > 0
            ? (
                (
                    (distOriginal - distVencedor)
                    / distOriginal
                ) * 100
            ).toFixed(1)
            : 0;

    cardVencedor.innerHTML = `

        <span class="vencedor-badge">
            🏆 MELHOR ROTA ENCONTRADA
        </span>

        <div class="vencedor-info">

            <h3>
                Método:
                <span>${vencedor.chave}</span>
            </h3>

            <p>
                Economia de
                <strong>${reducao}%</strong>
                em relação ao trajeto original.
            </p>

        </div>

        <div class="vencedor-stats">

            <div class="vencedor-stat-card">

                <span>Distância Total</span>

                <strong>
                    ${distVencedor.toFixed(2)} km
                </strong>

            </div>

            <div class="vencedor-stat-card">

                <span>Tempo Execução</span>

                <strong>
                    ${Number(
                        vencedor.dados.tempo_execucao_ms || 0
                    ).toFixed(1)} ms
                </strong>

            </div>

        </div>
    `;
}

// ============================================================
// 10. FILTRO DE CIDADE
// ============================================================

const inputCidade =
    document.getElementById('input-cidade');

if (inputCidade) {

    inputCidade.addEventListener(
        'input',
        () => {

            clearTimeout(timerCidade);

            const termoCidade =
                inputCidade.value.trim();

            if (termoCidade.length < 3) {
                return;
            }

            timerCidade = setTimeout(
                async () => {

                    try {

                        mostrarLoading(true);

                        const url =
                            `https://nominatim.openstreetmap.org/search?format=json&city=${encodeURIComponent(
                                termoCidade
                            )}&country=brazil&limit=1`;

                        const res =
                            await fetch(url, {
                                headers: {
                                    'User-Agent':
                                        'OtimizadorTCC-TSP/1.0'
                                }
                            });

                        const dados =
                            await res.json();

                        mostrarLoading(false);

                        if (
                            dados &&
                            dados.length > 0
                        ) {

                            cidadeAtualFiltro =
                                termoCidade;

                            map.flyTo(
                                [
                                    parseFloat(
                                        dados[0].lat
                                    ),
                                    parseFloat(
                                        dados[0].lon
                                    )
                                ],
                                13,
                                {
                                    duration: 1.2
                                }
                            );
                        }

                    } catch (err) {

                        mostrarLoading(false);
                    }

                },
                500
            );
        }
    );
}

// ============================================================
// 11. AUTOCOMPLETE DE ENDEREÇOS
// ============================================================

const inputEndereco =
    document.getElementById('input-endereco');

const sugestoesLista =
    document.getElementById('sugestoes-lista');

if (inputEndereco && sugestoesLista) {

    inputEndereco.addEventListener(
        'input',
        () => {

            clearTimeout(timerEndereco);

            const termoRua =
                inputEndereco.value.trim();

            if (termoRua.length < 2) {

                sugestoesLista.classList.add(
                    'sugestoes-ocultas'
                );

                sugestoesLista.innerHTML = '';

                return;
            }

            sugestoesLista.innerHTML =
                '<li class="sugestao-info">🔍 Pesquisando endereços...</li>';

            sugestoesLista.classList.remove(
                'sugestoes-ocultas'
            );

            timerEndereco = setTimeout(
                async () => {

                    try {

                        const cidadeFiltro =
                            inputCidade?.value.trim()
                            ||
                            cidadeAtualFiltro
                            ||
                            "Monte Carmelo";

                        const termoSemNumero =
                            termoRua
                                .replace(/\s+\d+.*$/, '')
                                .trim();

                        let dados = [];

                        // Busca por rua + cidade
                        let url1 =
                            `https://nominatim.openstreetmap.org/search?format=json&street=${encodeURIComponent(
                                termoRua
                            )}&city=${encodeURIComponent(
                                cidadeFiltro
                            )}&country=brazil&limit=5`;

                        let res =
                            await fetch(
                                url1,
                                {
                                    headers: {
                                        'User-Agent':
                                            'OtimizadorTCC-TSP/1.0'
                                    }
                                }
                            );

                        dados =
                            await res.json();

                        // Segunda tentativa sem número
                        if (
                            (!dados ||
                                dados.length === 0) &&
                            termoSemNumero !== termoRua
                        ) {

                            const url2 =
                                `https://nominatim.openstreetmap.org/search?format=json&street=${encodeURIComponent(
                                    termoSemNumero
                                )}&city=${encodeURIComponent(
                                    cidadeFiltro
                                )}&country=brazil&limit=5`;

                            res =
                                await fetch(
                                    url2,
                                    {
                                        headers: {
                                            'User-Agent':
                                                'OtimizadorTCC-TSP/1.0'
                                        }
                                    }
                                );

                            dados =
                                await res.json();
                        }

                        // Busca livre
                        if (
                            !dados ||
                            dados.length === 0
                        ) {

                            const buscaLivre =
                                `${termoRua}, ${cidadeFiltro}, Minas Gerais, Brasil`;

                            const url3 =
                                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
                                    buscaLivre
                                )}&countrycodes=br&limit=5`;

                            res =
                                await fetch(
                                    url3,
                                    {
                                        headers: {
                                            'User-Agent':
                                                'OtimizadorTCC-TSP/1.0'
                                        }
                                    }
                                );

                            dados =
                                await res.json();
                        }

                        sugestoesLista.innerHTML = '';

                        if (
                            dados &&
                            dados.length > 0
                        ) {

                            dados.forEach(item => {

                                const li =
                                    document.createElement('li');

                                li.innerText =
                                    item.display_name;

                                li.onclick = () =>
                                    selecionarEndereco(item);

                                sugestoesLista.appendChild(
                                    li
                                );
                            });

                            sugestoesLista.classList.remove(
                                'sugestoes-ocultas'
                            );

                        } else {

                            sugestoesLista.innerHTML =
                                '<li class="sugestao-vazia">⚠️ Rua não encontrada. Clique direto no mapa.</li>';

                            sugestoesLista.classList.remove(
                                'sugestoes-ocultas'
                            );
                        }

                    } catch (err) {

                        sugestoesLista.innerHTML =
                            '<li class="sugestao-vazia">❌ Erro de conexão na busca.</li>';
                    }

                },
                400
            );
        }
    );
}

function selecionarEndereco(item) {

    if (sugestoesLista) {

        sugestoesLista.classList.add(
            'sugestoes-ocultas'
        );
    }

    if (inputEndereco) {
        inputEndereco.value = '';
    }

    const lat =
        parseFloat(item.lat);

    const lng =
        parseFloat(item.lon);

    map.setView(
        [lat, lng],
        15
    );

    adicionarPonto(
        lat,
        lng,
        formatarNomeEndereco(
            item.display_name
        )
    );
}

document.addEventListener(
    'click',
    (e) => {

        if (
            sugestoesLista &&
            !e.target.closest('.card-busca')
        ) {

            sugestoesLista.classList.add(
                'sugestoes-ocultas'
            );
        }
    }
);

// ============================================================
// 12. CLIQUE NO MAPA
// ============================================================

map.on(
    'click',
    async (e) => {

        const {
            lat,
            lng
        } = e.latlng;

        mostrarLoading(true);

        let nomeRua =
            "Ponto marcado no mapa";

        try {

            const url =
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;

            const res =
                await fetch(
                    url,
                    {
                        headers: {
                            'User-Agent':
                                'OtimizadorTCC-TSP/1.0'
                        }
                    }
                );

            const data =
                await res.json();

            if (
                data &&
                data.display_name
            ) {

                nomeRua =
                    formatarNomeEndereco(
                        data.display_name
                    );
            }

        } catch (err) {

            // Mantém o nome padrão

        } finally {

            mostrarLoading(false);
        }

        adicionarPonto(
            lat,
            lng,
            nomeRua
        );
    }
);

// ============================================================
// 13. FORMATAÇÃO DE ENDEREÇO
// ============================================================

function formatarNomeEndereco(displayName) {

    if (!displayName) {
        return 'Ponto marcado no mapa';
    }

    const partes =
        displayName.split(',');

    if (partes.length >= 3) {

        return `${partes[0].trim()}, ${partes[1].trim()} - ${partes[2].trim()}`;
    }

    return partes[0].trim();
}

// ============================================================
// 14. ADICIONAR PONTO
// ============================================================

function adicionarPonto(
    lat,
    lng,
    nomeEndereco
) {

    const novoId =
        pontos.length;

    const ehInicio =
        novoId === 0;

    const ponto = {

        id: novoId,

        lat: Number(lat),

        lng: Number(lng),

        nome:
            nomeEndereco ||
            `Ponto ${novoId + 1}`
    };

    pontos.push(ponto);

    const marcador =
        L.marker(
            [lat, lng],
            {
                icon:
                    ehInicio
                        ? iconeInicio
                        : iconeParadaPadrao,

                draggable: true
            }
        ).addTo(map);

    marcador.on(
        'dragend',
        function (event) {

            const novaPos =
                event.target.getLatLng();

            const pEncontrado =
                pontos.find(
                    p => p.id === novoId
                );

            if (pEncontrado) {

                pEncontrado.lat =
                    novaPos.lat;

                pEncontrado.lng =
                    novaPos.lng;
            }

            sincronizarPontosGlobais();

            limparRotaDesenhada();
        }
    );

    marcador.bindPopup(
        `<b>${ehInicio ? '📍 Partida' : '📦 Ponto #' + novoId}:</b><br>${ponto.nome}`
    );

    marcadores.push(marcador);

    sincronizarPontosGlobais();

    limparRotaDesenhada();

    atualizarListaUI();
}

// ============================================================
// 15. REMOVER PONTO
// ============================================================

function removerPonto(index) {

    if (
        index < 0 ||
        index >= pontos.length
    ) {
        return;
    }

    const marcador =
        marcadores[index];

    if (
        marcador &&
        map.hasLayer(marcador)
    ) {

        map.removeLayer(
            marcador
        );
    }

    pontos.splice(
        index,
        1
    );

    marcadores.splice(
        index,
        1
    );

    pontos.forEach(
        (p, idx) => {
            p.id = idx;
        }
    );

    marcadores.forEach(
        (m, idx) => {

            m.setIcon(
                idx === 0
                    ? iconeInicio
                    : iconeParadaPadrao
            );
        }
    );

    limparRotaDesenhada();

    sincronizarPontosGlobais();

    atualizarListaUI();
}

// ============================================================
// 16. ATUALIZAR LISTA DE PONTOS
// ============================================================

function atualizarListaUI(
    ordemExibicao = null
) {

    const ul =
        document.getElementById(
            'lista-pontos'
        );

    const qtdEl =
        document.getElementById(
            'qtd-pontos'
        );

    if (qtdEl) {
        qtdEl.innerText =
            pontos.length;
    }

    if (!ul) {
        return;
    }

    ul.innerHTML = '';

    // ------------------------------------------
    // ORDEM OTIMIZADA
    // ------------------------------------------

    if (ordemExibicao) {

        ordemExibicao.forEach(
            (pontoIdx, seq) => {

                const p =
                    pontos[pontoIdx];

                if (!p) {
                    return;
                }

                const corTag =
                    seq === 0
                        ? '#ef4444'
                        : CORES_TRECHOS[
                            (seq - 1)
                            %
                            CORES_TRECHOS.length
                        ];

                const li =
                    document.createElement('li');

                li.className =
                    'item-ponto';

                li.style.cursor =
                    'pointer';

                li.title =
                    'Clique para localizar no mapa';

                li.onclick =
                    () => focarNoPonto(
                        pontoIdx
                    );

                li.innerHTML = `

                    <div class="info-ponto">

                        <span
                            class="tag-ordem"
                            style="background-color: ${corTag};"
                        >
                            ${
                                seq === 0
                                    ? '📍 Partida'
                                    : `➡️ ${seq}ª Parada`
                            }
                        </span>

                        <span>
                            ${p.nome}
                        </span>

                    </div>
                `;

                ul.appendChild(li);
            }
        );

        return;
    }

    // ------------------------------------------
    // ORDEM ORIGINAL
    // ------------------------------------------

    pontos.forEach(
        (p, idx) => {

            const li =
                document.createElement('li');

            li.className =
                'item-ponto';

            li.style.cursor =
                'pointer';

            li.title =
                'Clique para localizar no mapa';

            li.onclick =
                (e) => {

                    if (
                        !e.target.closest(
                            '.btn-remover-ponto'
                        )
                    ) {

                        focarNoPonto(
                            idx
                        );
                    }
                };

            li.innerHTML = `

                <div class="info-ponto">

                    <span
                        class="tag-ordem"
                        style="background-color: ${
                            idx === 0
                                ? '#ef4444'
                                : '#0284c7'
                        };"
                    >
                        ${
                            idx === 0
                                ? '📍 Partida'
                                : `📦 Parada #${idx}`
                        }
                    </span>

                    <span>
                        ${p.nome}
                    </span>

                </div>

                <button
                    class="btn-remover-ponto"
                    onclick="removerPonto(${idx})"
                    title="Excluir"
                >
                    🗑️
                </button>
            `;

            ul.appendChild(li);
        }
    );
}

// ============================================================
// 17. SELECIONAR MÉTODO
// ============================================================

function selecionarMetodo(
    chaveMetodo,
    elementoCard
) {

    document
        .querySelectorAll(
            '.card-metodo-item'
        )
        .forEach(
            card =>
                card.classList.remove(
                    'active'
                )
        );

    if (elementoCard) {

        elementoCard.classList.add(
            'active'
        );
    }

    if (
        typeof fixarMetodo === 'function'
    ) {

        fixarMetodo(
            chaveMetodo
        );
    }

    const dados =
        dadosResultadoGlobal
            ?.metodos
            ?.[chaveMetodo];

    const listaUl =
        document.getElementById(
            'lista-paradas-algoritmo'
        );

    const titulo =
        document.getElementById(
            'titulo-sequencia-metodo'
        );

    if (titulo) {

        titulo.innerText =
            `Sequência da Rota (${chaveMetodo.toUpperCase()}):`;
    }

    if (
        listaUl &&
        dados?.ordem
    ) {

        listaUl.innerHTML =
            dados.ordem
                .map(
                    (ponto, idx) => `

                        <li>
                            <strong>
                                ${idx + 1}ª Parada:
                            </strong>

                            ${
                                ponto.nome ||
                                ponto.endereco ||
                                'Ponto ' + (idx + 1)
                            }
                        </li>
                    `
                )
                .join('');
    }
}

// ============================================================
// 18. SALVAR ROTA ATUAL
// ============================================================

async function salvarRotaAtual() {

    const token =
        localStorage.getItem(
            'token_jwt'
        );

    if (!token) {

        alert(
            'Faça login para salvar suas rotas!'
        );

        return;
    }

    const pontosAtuais =
        obterPontosAtuais();

    if (
        !pontosAtuais ||
        pontosAtuais.length === 0
    ) {

        alert(
            'Nenhum ponto selecionado no mapa.'
        );

        return;
    }

    const nomeRota =
        prompt(
            'Digite um nome para identificar esta rota:',
            'Minha Rota Otimizada'
        );

    if (!nomeRota) {
        return;
    }

    const metodo =
        metodoFixado ||
        'aco';

    const dadosMetodo =
        dadosResultadoGlobal
            ?.metodos
            ?.[metodo];

    const payload = {

        nome_rota:
            nomeRota,

        metodo_utilizado:
            metodo,

        distancia_km:
            dadosMetodo?.distancia_km || 0,

        tempo_execucao_ms:
            dadosMetodo?.tempo_execucao_ms || 0,

        pontos:
            pontosAtuais,

        rota_ordenada:
            dadosMetodo?.ordem ||
            dadosMetodo?.rota ||
            pontosAtuais
    };

    try {

        mostrarLoading(true);

        const res =
            await fetch(
                `${API_BASE_URL}/rotas/salvar`,
                {
                    method: 'POST',

                    headers: {
                        'Content-Type':
                            'application/json',

                        'Authorization':
                            `Bearer ${token}`
                    },

                    body:
                        JSON.stringify(
                            payload
                        )
                }
            );

        const data =
            await res.json();

        if (!res.ok) {

            throw new Error(
                data.erro ||
                'Erro ao salvar rota.'
            );
        }

        alert(
            'Rota salva com sucesso no seu histórico!'
        );

    } catch (err) {

        alert(
            'Falha ao salvar rota: ' +
            err.message
        );

    } finally {

        mostrarLoading(false);
    }
}

// ============================================================
// 19. VERIFICAÇÃO DE SESSÃO
// ============================================================

document.addEventListener(
    'DOMContentLoaded',
    () => {

        verificarSessao();

        // Garante estado inicial correto
        if (
            typeof alternarCamposCriterio ===
            'function'
        ) {

            alternarCamposCriterio();
        }
    }
);

function verificarSessao() {

    const token =
        localStorage.getItem(
            'token_jwt'
        );

    const usuarioJson =
        localStorage.getItem(
            'usuario_dados'
        );

    const userName =
        document.getElementById(
            'userName'
        );

    const guestControls =
        document.getElementById(
            'guestControls'
        );

    const userControls =
        document.getElementById(
            'userControls'
        );

    if (
        token &&
        usuarioJson
    ) {

        try {

            const usuario =
                JSON.parse(
                    usuarioJson
                );

            if (userName) {
                userName.innerText =
                    usuario.nome;
            }

            if (guestControls) {
                guestControls.style.display =
                    'none';
            }

            if (userControls) {
                userControls.style.display =
                    'block';
            }

        } catch (err) {

            localStorage.removeItem(
                'token_jwt'
            );

            localStorage.removeItem(
                'usuario_dados'
            );

            verificarSessao();
        }

    } else {

        if (guestControls) {
            guestControls.style.display =
                'block';
        }

        if (userControls) {
            userControls.style.display =
                'none';
        }
    }
}

// ============================================================
// 20. MODAL DE AUTENTICAÇÃO
// ============================================================

function abrirModalAuth() {

    const modal =
        document.getElementById(
            'authModal'
        );

    if (modal) {
        modal.style.display =
            'block';
    }

    alternarFormAuth(
        'login'
    );
}

function fecharModalAuth() {

    const modal =
        document.getElementById(
            'authModal'
        );

    if (modal) {
        modal.style.display =
            'none';
    }
}

function alternarFormAuth(tipo) {

    const formLogin =
        document.getElementById(
            'formLogin'
        );

    const formCadastro =
        document.getElementById(
            'formCadastro'
        );

    if (tipo === 'cadastro') {

        if (formLogin) {
            formLogin.style.display =
                'none';
        }

        if (formCadastro) {
            formCadastro.style.display =
                'block';
        }

    } else {

        if (formLogin) {
            formLogin.style.display =
                'block';
        }

        if (formCadastro) {
            formCadastro.style.display =
                'none';
        }
    }
}

// ============================================================
// 21. LOGOUT
// ============================================================

function realizarLogout() {

    localStorage.removeItem(
        'token_jwt'
    );

    localStorage.removeItem(
        'usuario_dados'
    );

    verificarSessao();

    alert(
        'Você saiu do sistema.'
    );
}

// ============================================================
// 22. RELATÓRIO DE ENTREGA
// ============================================================

function gerarRelatorioEntrega() {

    const listaPontos =
        obterPontosAtuais();

    if (
        !listaPontos ||
        listaPontos.length === 0
    ) {

        return alert(
            'Nenhum ponto selecionado no mapa para gerar o relatório.'
        );
    }

    const metodo =
        metodoFixado ||
        'aco';

    const dadosMetodo =
        dadosResultadoGlobal
            ?.metodos
            ?.[metodo];

    const ordem =
        dadosMetodo?.ordem ||
        dadosMetodo?.rota;

    let pontosOrdenados = [];

    if (
        ordem &&
        Array.isArray(ordem)
    ) {

        pontosOrdenados =
            ordem
                .map(
                    idx =>
                        listaPontos[idx]
                )
                .filter(Boolean);

    } else {

        pontosOrdenados =
            [...listaPontos];
    }

    const agora =
        new Date();

    const dataFormatada =
        agora.toLocaleDateString(
            'pt-BR',
            {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            }
        );

    const horaFormatada =
        agora.toLocaleTimeString(
            'pt-BR',
            {
                hour: '2-digit',
                minute: '2-digit'
            }
        );

    const dataHoraCompleta =
        `${dataFormatada} às ${horaFormatada}`;

    const distanciaKm =
        dadosMetodo?.distancia_km
            ? `${Number(
                dadosMetodo.distancia_km
            ).toFixed(2)} km`
            : 'N/A';

    let tabelaHtml = '';

    pontosOrdenados.forEach(
        (p, index) => {

            const tipoLabel =
                index === 0
                    ? '📍 Ponto de Partida'
                    : `📦 ${index}ª Entrega`;

            tabelaHtml += `

                <tr>

                    <td
                        style="
                            text-align: center;
                            font-weight: bold;
                        "
                    >
                        ${
                            index === 0
                                ? 'PARTIDA'
                                : index
                        }
                    </td>

                    <td>

                        <strong>
                            ${tipoLabel}
                        </strong>

                        <br>

                        <span>
                            ${
                                p.nome ||
                                'Endereço não informado'
                            }
                        </span>

                    </td>

                    <td
                        style="
                            font-size: 11px;
                            color: #555;
                        "
                    >
                        Lat:
                        ${Number(
                            p.lat
                        ).toFixed(5)}

                        <br>

                        Lng:
                        ${Number(
                            p.lng
                        ).toFixed(5)}
                    </td>

                    <td
                        style="
                            text-align: center;
                            vertical-align: middle;
                        "
                    >
                        [ &nbsp; ]
                    </td>

                </tr>
            `;
        }
    );

    const janelaImpressao =
        window.open(
            '',
            '_blank'
        );

    if (!janelaImpressao) {

        alert(
            'O navegador bloqueou a janela de impressão. Permita pop-ups para este site.'
        );

        return;
    }

    janelaImpressao.document.write(`

        <!DOCTYPE html>

        <html lang="pt-BR">

        <head>

            <meta charset="UTF-8">

            <title>
                Relatório de Ordem de Entrega
            </title>

            <style>

                body {
                    font-family: Arial, sans-serif;
                    padding: 20px;
                    color: #333;
                }

                .header {
                    border-bottom: 2px solid #0284c7;
                    padding-bottom: 10px;
                    margin-bottom: 20px;
                }

                .header h2 {
                    margin: 0;
                    color: #0284c7;
                }

                .info {
                    margin-bottom: 15px;
                    font-size: 14px;
                    display: flex;
                    justify-content: space-between;
                }

                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 10px;
                }

                th,
                td {
                    border: 1px solid #ccc;
                    padding: 8px 12px;
                    text-align: left;
                    font-size: 13px;
                }

                th {
                    background-color: #f1f5f9;
                }

                @media print {

                    button {
                        display: none;
                    }
                }

            </style>

        </head>

        <body>

            <div class="header">

                <h2>
                    📋 Relatório de Ordem de Entrega
                </h2>

                <p
                    style="
                        margin: 5px 0 0 0;
                        font-size: 12px;
                        color: #666;
                    "
                >
                    Otimizador de Rotas Logísticas
                </p>

            </div>

            <div class="info">

                <div>
                    <strong>
                        Data de Emissão:
                    </strong>

                    ${dataHoraCompleta}
                </div>

                <div>
                    <strong>
                        Total de Paradas:
                    </strong>

                    ${Math.max(
                        pontosOrdenados.length - 1,
                        0
                    )}
                </div>

                <div>
                    <strong>
                        Distância Estimada:
                    </strong>

                    ${distanciaKm}
                </div>

            </div>

            <table>

                <thead>

                    <tr>

                        <th
                            style="
                                width: 8%;
                                text-align: center;
                            "
                        >
                            Seq.
                        </th>

                        <th
                            style="
                                width: 52%;
                            "
                        >
                            Local / Endereço
                        </th>

                        <th
                            style="
                                width: 25%;
                            "
                        >
                            Coordenadas
                        </th>

                        <th
                            style="
                                width: 15%;
                                text-align: center;
                            "
                        >
                            Status
                        </th>

                    </tr>

                </thead>

                <tbody>

                    ${tabelaHtml}

                </tbody>

            </table>

            <script>

                window.onload = function() {
                    window.print();
                };

            </script>

        </body>

        </html>
    `);

    janelaImpressao.document.close();
}

// ============================================================
// 23. CADASTRO
// ============================================================

async function realizarCadastro(event) {

    event.preventDefault();

    const nome =
        document.getElementById(
            'cadNome'
        ).value;

    const email =
        document.getElementById(
            'cadEmail'
        ).value;

    const senha =
        document.getElementById(
            'cadSenha'
        ).value;

    try {

        const res =
            await fetch(
                `${API_BASE_URL}/auth/register`,
                {
                    method: 'POST',

                    headers: {
                        'Content-Type':
                            'application/json'
                    },

                    body:
                        JSON.stringify({
                            nome,
                            email,
                            senha
                        })
                }
            );

        const data =
            await res.json();

        if (!res.ok) {

            throw new Error(
                data.erro ||
                'Erro ao realizar cadastro.'
            );
        }

        alert(
            'Cadastro realizado com sucesso! Faça login para continuar.'
        );

        alternarFormAuth(
            'login'
        );

    } catch (err) {

        alert(
            err.message
        );
    }
}

// ============================================================
// 24. LOGIN
// ============================================================

async function realizarLogin(event) {

    event.preventDefault();

    const email =
        document.getElementById(
            'loginEmail'
        ).value;

    const senha =
        document.getElementById(
            'loginSenha'
        ).value;

    try {

        const res =
            await fetch(
                `${API_BASE_URL}/auth/login`,
                {
                    method: 'POST',

                    headers: {
                        'Content-Type':
                            'application/json'
                    },

                    body:
                        JSON.stringify({
                            email,
                            senha
                        })
                }
            );

        const data =
            await res.json();

        if (!res.ok) {

            throw new Error(
                data.erro ||
                'Erro ao realizar login.'
            );
        }

        localStorage.setItem(
            'token_jwt',
            data.token
        );

        localStorage.setItem(
            'usuario_dados',
            JSON.stringify(
                data.usuario
            )
        );

        alert(
            'Login realizado com sucesso!'
        );

        fecharModalAuth();

        verificarSessao();

    } catch (err) {

        alert(
            err.message
        );
    }
}

// ============================================================
// 25. HISTÓRICO DE ROTAS
// ============================================================

function fecharModalHistorico() {

    const modal =
        document.getElementById(
            'historicoModal'
        );

    if (modal) {
        modal.style.display =
            'none';
    }
}

async function carregarMinhasRotas() {
    const token = localStorage.getItem('token_jwt');
    if (!token) {
        return alert('Faça login para ver suas rotas!');
    }

    try {
        mostrarLoading(true); // Exibe o loading aqui para não travar a tela vazia

        const res = await fetch(`${API_BASE_URL}/rotas/minhas-rotas`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        // TRATAMENTO DO ERRO 401 / 403
        if (res.status === 401 || res.status === 403) {
            realizarLogout();
            throw new Error('Sua sessão expirou. Por favor, faça login novamente.');
        }

        const rotas = await res.json();

        if (!res.ok) {
            throw new Error(rotas.erro || 'Erro ao buscar rotas.');
        }

        const container = document.getElementById('lista-rotas-historico');
        if (!container) return;

        container.innerHTML = '';

        if (!rotas || rotas.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666;">Nenhuma rota salva encontrada.</p>';
        } else {
            rotas.forEach(rota => {
                const dataFormatada = new Date(rota.data_criacao).toLocaleString('pt-BR');
                container.innerHTML += `
                    <div style="border: 1px solid #ddd; border-radius: 6px; padding: 12px; margin-bottom: 10px; background: #f9f9f9; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h4 style="margin: 0 0 5px 0; color: #333;">${rota.nome_rota}</h4>
                            <p style="margin: 3px 0; font-size: 13px; color: #555;">
                                <strong>Método:</strong> ${String(rota.metodo_utilizado).toUpperCase()} | 
                                <strong>Distância:</strong> ${rota.distancia_km} km | 
                                <strong>Pontos:</strong> ${rota.qtd_pontos}
                            </p>
                            <p style="margin: 3px 0; font-size: 11px; color: #888;">Salvo em: ${dataFormatada}</p>
                        </div>
                        <button onclick="carregarRotaNoMapa(${rota.id})" class="btn primary" style="padding: 8px 12px; font-size: 12px; cursor: pointer;">
                            🗺️ Abrir no Mapa
                        </button>

                        <button onclick="excluirRotaHistorico(${rota.id})" class="btn" style="padding: 8px 12px; font-size: 12px; cursor: pointer; background-color: #ef4444; color: white;">
                                🗑️ Excluir
                        </button>
                    </div>
                `;
            });
        }

        const modal = document.getElementById('historicoModal');
        if (modal) modal.style.display = 'block';

    } catch (err) {
        alert(err.message);
    } finally {
        mostrarLoading(false);
    }
}

// ============================================================
// 26. CARREGAR ROTA SALVA
// ============================================================

async function carregarRotaNoMapa(idRota) {
    const token = localStorage.getItem('token_jwt');
    if (!token) {
        return alert('Sessão expirada. Faça login novamente.');
    }

    try {
        mostrarLoading(true);

        const res = await fetch(`${API_BASE_URL}/rotas/${idRota}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        // TRATAMENTO DO ERRO 401 / 403
        if (res.status === 401 || res.status === 403) {
            realizarLogout();
            throw new Error('Sua sessão expirou. Por favor, faça login novamente.');
        }

        const rota = await res.json();
        if (!res.ok) {
            throw new Error(rota.erro || 'Erro ao carregar detalhes da rota.');
        }

        limparTudo();

        let pontosRecuperados = rota.pontos_json || rota.pontos;
        if (typeof pontosRecuperados === 'string') {
            pontosRecuperados = JSON.parse(pontosRecuperados);
        }

        if (!Array.isArray(pontosRecuperados) || pontosRecuperados.length === 0) {
            throw new Error('A rota selecionada não possui coordenadas válidas.');
        }

        pontosRecuperados.forEach(p => {
            const lat = Number(p.lat !== undefined ? p.lat : p[0]);
            const lng = Number(p.lng !== undefined ? p.lng : p[1]);
            const nomeEndereco = p.nome || p.endereco || "Ponto da rota salva";

            if (!isNaN(lat) && !isNaN(lng)) {
                adicionarPonto(lat, lng, nomeEndereco);
            }
        });

        if (marcadores.length > 0) {
            const grupoMarcadores = new L.featureGroup(marcadores);
            map.fitBounds(grupoMarcadores.getBounds().pad(0.1));
        }

        fecharModalHistorico();

        if (pontos.length >= 3) {
            const btnOtimizar = document.getElementById('btn-otimizar');
            if (btnOtimizar) btnOtimizar.click();
        }

    } catch (err) {
        alert('Falha ao carregar rota: ' + err.message);
    } finally {
        mostrarLoading(false);
    }
}

// ============================================================
// 27. LIMPAR TUDO
// ============================================================

function limparTudo() {

    marcadores.forEach(
        marcador => {

            if (
                map &&
                map.hasLayer(marcador)
            ) {

                map.removeLayer(
                    marcador
                );
            }
        }
    );

    marcadores = [];
    pontos = [];

    dadosResultadoGlobal = null;
    metodoFixado = null;

    limparRotaDesenhada();

    atualizarListaUI();

    sincronizarPontosGlobais();

    const elQtd =
        document.getElementById(
            'qtd-pontos'
        );

    if (elQtd) {
        elQtd.innerText =
            '0';
    }
}

// ============================================================
// 28. PAINEL DE RESULTADOS
// ============================================================

function alternarPainelResultados() {

    const painel =
        document.getElementById(
            'resultados'
        );

    if (painel) {

        painel.classList.toggle(
            'recolhido'
        );
    }
}

// ============================================================
// 29. LIMPAR ROTA DESENHADA
// ============================================================

function limparRotaDesenhada() {

    if (camadaRota) {

        map.removeLayer(
            camadaRota
        );

        camadaRota = null;
    }

    cacheTrajetosGeoJSON = {};

    const resEl =
        document.getElementById(
            'resultados'
        );

    if (resEl) {

        resEl.classList.add(
            'oculto'
        );
    }

    marcadores.forEach(
        (m, idx) => {

            m.setIcon(
                idx === 0
                    ? iconeInicio
                    : iconeParadaPadrao
            );
        }
    );
}

// ============================================================
// 30. BOTÃO OTIMIZAR - EXECUÇÃO NORMAL
// ============================================================

const btnOtimizar =
    document.getElementById(
        'btn-otimizar'
    );

if (btnOtimizar) {

    btnOtimizar.addEventListener(
        'click',
        async () => {

            const listaPontos =
                obterPontosAtuais();

            if (
                listaPontos.length < 3
            ) {

                return alert(
                    'Adicione no mínimo 3 pontos (1 Início + 2 Paradas).'
                );
            }

            const circuitoFechado =
                document.querySelector(
                    'input[name="tipo_circuito"]:checked'
                )?.value === 'fechado';

            const modoParada =
                document.getElementById(
                    'select-criterio-parada'
                )?.value ||
                'classico';

            let tempoLimite = null;
            let maxIteracoes = null;

            // --------------------------------------
            // E1 - CLÁSSICO
            // --------------------------------------

            if (
                modoParada ===
                'classico'
            ) {

                tempoLimite = null;
                maxIteracoes = null;
            }

            // --------------------------------------
            // ORÇAMENTO DE TEMPO
            // --------------------------------------

            else if (
                modoParada ===
                'tempo'
            ) {

                tempoLimite =
                    parseInt(
                        document.getElementById(
                            'input-tempo'
                        )?.value
                    ) || 10;
            }

            // --------------------------------------
            // ITERAÇÕES CUSTOMIZADAS
            // --------------------------------------

            else if (
                modoParada ===
                'iteracoes'
            ) {

                maxIteracoes =
                    parseInt(
                        document.getElementById(
                            'input-iteracoes'
                        )?.value
                    ) || 100;
            }

            try {

                mostrarLoading(true);

                const response =
                    await fetch(
                        `${API_BASE_URL}/otimizar`,
                        {
                            method: 'POST',

                            headers: {
                                'Content-Type':
                                    'application/json'
                            },

                            body:
                                JSON.stringify({

                                    pontos:
                                        listaPontos,

                                    circuito_fechado:
                                        circuitoFechado,

                                    modo_parada:
                                        modoParada,

                                    tempo_limite_s:
                                        tempoLimite,

                                    max_iteracoes:
                                        maxIteracoes
                                })
                        }
                    );

                const resultado =
                    await response.json();

                if (
                    !response.ok ||
                    resultado.erro
                ) {

                    throw new Error(
                        resultado.erro ||
                        'Erro ao executar a otimização.'
                    );
                }

                // 🔒 TRAVA DE SEGURANÇA: Garante que a resposta possui o objeto metodos
                if (!resultado || !resultado.metodos) {
                    throw new Error('A resposta do servidor está incompleta ou inválida (objeto "metodos" ausente).');
                }

                dadosResultadoGlobal =
                    resultado;

                sincronizarPontosGlobais();

                // ----------------------------------
                // Atualização dos cards
                // ----------------------------------

                const chaves = [
                    'original',
                    'opt2',
                    'sa',
                    'aco'
                ];

                chaves.forEach(
                    ch => {

                        if (
                            dadosResultadoGlobal
                                .metodos
                                ?.[ch]
                        ) {

                            const dados =
                                dadosResultadoGlobal
                                    .metodos[ch];

                            const dist =
                                Number(
                                    dados.distancia_km ||
                                    0
                                );

                            const elDist =
                                document.getElementById(
                                    `card-dist-${ch}`
                                );

                            const elCombustivel =
                                document.getElementById(
                                    `card-combustivel-${ch}`
                                );

                            const elTempoCard =
                                document.getElementById(
                                    `card-tempo-${ch}`
                                );

                            if (elDist) {

                                elDist.innerText =
                                    `${dist.toFixed(2)} km`;
                            }

                            if (elCombustivel) {

                                elCombustivel.innerText =
                                    `⛽ ${formatarCustoCombustivel(dist)}`;
                            }

                            if (elTempoCard) {

                                elTempoCard.innerText =
                                    `⏱️ ${formatarTempoViagem(dist)}`;
                            }
                        }
                    }
                );

                const resEl =
                    document.getElementById(
                        'resultados'
                    );

                if (resEl) {

                    resEl.classList.remove(
                        'oculto'
                    );
                }

                renderizarGraficoComparativo(
                    dadosResultadoGlobal.metodos
                );

                await preCarregarTrajetosMemoria();

                // ----------------------------------
                // Seleciona melhor algoritmo
                // ----------------------------------

                const candidatos = [
                    'aco',
                    'sa',
                    'opt2'
                ];

                let melhorMetodo = null;

                candidatos.forEach(
                    chave => {

                        const dados =
                            dadosResultadoGlobal
                                .metodos
                                ?.[chave];

                        if (!dados) {
                            return;
                        }

                        if (
                            !melhorMetodo ||
                            Number(
                                dados.distancia_km
                            )
                            <
                            Number(
                                dadosResultadoGlobal
                                    .metodos
                                    [melhorMetodo]
                                    .distancia_km
                            )
                        ) {

                            melhorMetodo =
                                chave;
                        }
                    }
                );

                mostrarLoading(false);

                if (melhorMetodo) {

                    fixarMetodo(
                        melhorMetodo
                    );
                }

            } catch (err) {

                mostrarLoading(false);

                console.error(
                    'Erro na otimização:',
                    err
                );

                alert(
                    'Falha ao conectar com o backend: ' +
                    err.message
                );
            }
        }
    );
}

// ============================================================
// 31. CRITÉRIO DE PARADA NORMAL
// ============================================================

function alternarCamposCriterio() {

    const select =
        document.getElementById(
            'select-criterio-parada'
        );

    const boxTempo =
        document.getElementById(
            'box-tempo'
        );

    const boxIteracoes =
        document.getElementById(
            'box-iteracoes'
        );

    if (!select) {
        return;
    }

    const modo =
        select.value;

    if (boxTempo) {

        boxTempo.style.display =
            modo === 'tempo'
                ? 'block'
                : 'none';
    }

    if (boxIteracoes) {

        boxIteracoes.style.display =
            modo === 'iteracoes'
                ? 'block'
                : 'none';
    }
}

// ============================================================
// 32. ABAS DOS MÉTODOS
// ============================================================

function trocarAba(
    event,
    abaId
) {

    document
        .querySelectorAll(
            '.aba-item'
        )
        .forEach(
            aba =>
                aba.classList.remove(
                    'active'
                )
        );

    document
        .querySelectorAll(
            '.aba-btn'
        )
        .forEach(
            btn =>
                btn.classList.remove(
                    'active'
                )
        );

    document
        .getElementById(
            abaId
        )
        ?.classList.add(
            'active'
        );

    if (
        event &&
        event.currentTarget
    ) {

        event.currentTarget.classList.add(
            'active'
        );
    }

    const mapaAbas = {

        'aba-original':
            'original',

        'aba-opt2':
            'opt2',

        'aba-sa':
            'sa',

        'aba-aco':
            'aco'
    };

    const chaveMetodo =
        mapaAbas[abaId];

    if (
        chaveMetodo &&
        dadosResultadoGlobal
            ?.metodos
            ?.[chaveMetodo]
    ) {

        fixarMetodo(
            chaveMetodo
        );
    }
}

// ============================================================
// 33. PRÉ-CARREGAR TRAJETOS
// ============================================================

async function preCarregarTrajetosMemoria() {

    cacheTrajetosGeoJSON = {};

    if (
        !dadosResultadoGlobal
            ?.metodos
    ) {

        return;
    }

    const chaves = [
        'original',
        'nn',
        'opt2',
        'sa',
        'aco'
    ];

    const ehCircuitoFechado =
        Boolean(
            dadosResultadoGlobal
                .circuito_fechado
        );

    for (
        const chave
        of chaves
    ) {

        const metodo =
            dadosResultadoGlobal
                .metodos
                [chave];

        if (!metodo) {
            continue;
        }

        const ordem =
            metodo.rota;

        if (
            !Array.isArray(
                ordem
            )
        ) {

            continue;
        }

        const pontosOrdenados =
            ordem
                .map(
                    i =>
                        pontos[i]
                )
                .filter(Boolean);

        if (
            ehCircuitoFechado &&
            pontos.length > 0
        ) {

            pontosOrdenados.push(
                pontos[0]
            );
        }

        cacheTrajetosGeoJSON[chave] =
            [];

        for (
            let i = 0;
            i <
            pontosOrdenados.length - 1;
            i++
        ) {

            const pOrigem =
                pontosOrdenados[i];

            const pDestino =
                pontosOrdenados[i + 1];

            if (
                !pOrigem ||
                !pDestino
            ) {

                continue;
            }

            const url =
                `https://router.project-osrm.org/route/v1/driving/${pOrigem.lng},${pOrigem.lat};${pDestino.lng},${pDestino.lat}?overview=full&geometries=geojson`;

            try {

                const res =
                    await fetch(url);

                const data =
                    await res.json();

                if (
                    data.routes &&
                    data.routes.length > 0
                ) {

                    const coords =
                        data.routes[0]
                            .geometry
                            .coordinates
                            .map(
                                c =>
                                    [
                                        c[1],
                                        c[0]
                                    ]
                            );

                    cacheTrajetosGeoJSON[chave]
                        .push(
                            coords
                        );
                }

            } catch (e) {

                console.warn(
                    'Não foi possível carregar trecho da rota:',
                    e
                );
            }
        }
    }
}

// ============================================================
// 34. RENDERIZAR TRAJETO
// ============================================================

function renderizarTrajetoDaMemoria(
    chaveMetodo,
    corFixa = null
) {

    if (camadaRota) {

        map.removeLayer(
            camadaRota
        );

        camadaRota = null;
    }

    const trechosCoords =
        cacheTrajetosGeoJSON[
            chaveMetodo
        ];

    if (
        !trechosCoords ||
        trechosCoords.length === 0
    ) {

        return;
    }

    camadaRota =
        L.featureGroup()
            .addTo(map);

    trechosCoords.forEach(
        (coords, i) => {

            const cor =
                corFixa ||
                CORES_TRECHOS[
                    i %
                    CORES_TRECHOS.length
                ];

            // Contorno
            L.polyline(
                coords,
                {
                    color:
                        '#0f172a',

                    weight:
                        8,

                    opacity:
                        0.9
                }
            ).addTo(
                camadaRota
            );

            // Linha principal
            const linhaColorida =
                L.polyline(
                    coords,
                    {
                        color:
                            cor,

                        weight:
                            5,

                        opacity:
                            1.0
                    }
                ).addTo(
                    camadaRota
                );

            // Setas
            if (
                L.polylineDecorator
            ) {

                L.polylineDecorator(
                    linhaColorida,
                    {
                        patterns: [
                            {
                                offset:
                                    '30px',

                                repeat:
                                    '80px',

                                symbol:
                                    L.Symbol.arrowHead(
                                        {
                                            pixelSize:
                                                10,

                                            headAngle:
                                                60,

                                            polygon:
                                                true,

                                            pathOptions:
                                                {
                                                    stroke:
                                                        false,

                                                    fillColor:
                                                        '#ffffff',

                                                    fillOpacity:
                                                        1.0
                                                }
                                        }
                                    )
                            }
                        ]
                    }
                ).addTo(
                    camadaRota
                );
            }
        }
    );

    try {

        map.fitBounds(
            camadaRota.getBounds(),
            {
                padding:
                    [40, 40]
            }
        );

    } catch (e) {
        // Ignora se não houver bounds
    }
}

// ============================================================
// 35. FIXAR MÉTODO
// ============================================================

function fixarMetodo(
    chaveMetodo
) {

    metodoFixado =
        chaveMetodo;

    atualizarDestaqueCards(
        chaveMetodo
    );

    if (
        dadosResultadoGlobal
            ?.metodos
            ?.[chaveMetodo]
    ) {

        const rota =
            dadosResultadoGlobal
                .metodos
                [chaveMetodo]
                .rota;

        atualizarMarcadoresNumerados(
            rota
        );

        atualizarListaUI(
            rota
        );

        renderizarTrajetoDaMemoria(
            chaveMetodo
        );
    }
}

// ============================================================
// 36. PRÉ-VISUALIZAÇÃO
// ============================================================

function preVisualizarRota(
    chaveMetodo
) {

    if (
        !dadosResultadoGlobal
            ?.metodos
            ?.[chaveMetodo] ||
        !cacheTrajetosGeoJSON[
            chaveMetodo
        ]
    ) {

        return;
    }

    atualizarDestaqueCards(
        chaveMetodo,
        true
    );

    const rota =
        dadosResultadoGlobal
            .metodos
            [chaveMetodo]
            .rota;

    atualizarMarcadoresNumerados(
        rota
    );

    renderizarTrajetoDaMemoria(
        chaveMetodo,
        '#38bdf8'
    );
}

function restaurarRotaFixada() {

    if (
        !dadosResultadoGlobal
            ?.metodos ||
        !metodoFixado
    ) {

        return;
    }

    atualizarDestaqueCards(
        metodoFixado
    );

    const rota =
        dadosResultadoGlobal
            .metodos
            [metodoFixado]
            .rota;

    atualizarMarcadoresNumerados(
        rota
    );

    atualizarListaUI(
        rota
    );

    renderizarTrajetoDaMemoria(
        metodoFixado
    );
}

// ============================================================
// 37. DESTAQUE DOS CARDS
// ============================================================

function atualizarDestaqueCards(
    chaveAtiva,
    temporario = false
) {

    document
        .querySelectorAll(
            '.card-metodo'
        )
        .forEach(
            c => {

                c.classList.remove(
                    'ativo'
                );

                c.classList.remove(
                    'hover-preview'
                );
            }
        );

    const card =
        document.getElementById(
            `card-${chaveAtiva}`
        );

    if (card) {

        if (temporario) {

            card.classList.add(
                'hover-preview'
            );

        } else {

            card.classList.add(
                'ativo'
            );
        }
    }
}

// ============================================================
// 38. MARCADORES NUMERADOS
// ============================================================

function atualizarMarcadoresNumerados(
    ordemRota
) {

    if (
        !Array.isArray(
            ordemRota
        )
    ) {

        return;
    }

    // Primeiro restaura todos
    marcadores.forEach(
        (marcador, idx) => {

            marcador.setIcon(
                idx === 0
                    ? iconeInicio
                    : iconeParadaPadrao
            );
        }
    );

    // Depois aplica a ordem
    ordemRota.forEach(
        (pontoIdx, seq) => {

            if (
                marcadores[pontoIdx]
            ) {

                if (seq === 0) {

                    marcadores[pontoIdx]
                        .setIcon(
                            criarIconeNumerado(
                                "📍",
                                true
                            )
                        );

                } else {

                    marcadores[pontoIdx]
                        .setIcon(
                            criarIconeNumerado(
                                seq,
                                false
                            )
                        );
                }
            }
        }
    );
}

// ============================================================
// 39. LOADING
// ============================================================

function mostrarLoading(exibir, texto = null, mostrarBarra = false, valorBarra = 0, maxBarra = 100) {
    const el = document.getElementById('loading');
    const span = document.getElementById('loading-texto');
    const barra = document.getElementById('loading-barra');

    if (!el) return;

    if (exibir) {
        if (span && texto) {
            span.innerText = texto;
        } else if (span) {
            span.innerText = 'Processando algoritmos e geocodificação...';
        }

        if (barra) {
            if (mostrarBarra) {
                barra.style.display = 'block';
                barra.max = maxBarra;
                barra.value = valorBarra;
            } else {
                barra.style.display = 'none';
            }
        }

        el.classList.remove('oculto');
    } else {
        el.classList.add('oculto');
        if (barra) barra.style.display = 'none';
    }
}

// ============================================================
// 40. BOTÃO LIMPAR
// ============================================================

const btnLimpar =
    document.getElementById(
        'btn-limpar'
    );

if (btnLimpar) {

    btnLimpar.addEventListener(
        'click',
        () => {

            limparTudo();
        }
    );
}

// ============================================================
// 41. FOCAR NO PONTO
// ============================================================

function focarNoPonto(
    pontoIdx
) {

    const p =
        pontos[pontoIdx];

    if (!p) {
        return;
    }

    map.setView(
        [
            p.lat,
            p.lng
        ],
        16,
        {
            animate: true
        }
    );

    if (
        marcadores[pontoIdx]
    ) {

        marcadores[pontoIdx]
            .openPopup();
    }
}

// ============================================================
// 42. EXPERIMENTOS - CONFIGURAÇÃO
// ============================================================
//
// Esta parte NÃO interfere na execução normal.
//
// E1 = critério clássico
// E2 = 10 segundos
// E3 = 30 segundos
// E4 = 60 segundos
//
// Repetições padrão = 30
//
// O critério "iterações customizado" NÃO entra aqui.
//

const CONFIG_EXPERIMENTOS = {

    repeticoesPadrao: 30,

    condicoes: {

        E1: {
            codigo: 'e1',
            nome: 'E1 - Clássico',
            tipo: 'classico',
            valor: null
        },

        E2: {
            codigo: 'e2',
            nome: 'E2 - 10 segundos',
            tipo: 'tempo',
            valor: 10
        },

        E3: {
            codigo: 'e3',
            nome: 'E3 - 30 segundos',
            tipo: 'tempo',
            valor: 30
        },

        E4: {
            codigo: 'e4',
            nome: 'E4 - 60 segundos',
            tipo: 'tempo',
            valor: 60
        }
    }
};

// ============================================================
// 43. LER CONDIÇÕES EXPERIMENTAIS SELECIONADAS
// ============================================================

function obterCondicoesExperimentaisSelecionadas() {

    const selecionadas = [];

    // ------------------------------------------
    // Se existir checkbox "todos"
    // ------------------------------------------

    const todos =
        document.getElementById(
            'experimento-todos'
        );

    if (
        todos &&
        todos.checked
    ) {

        return [
            'E1',
            'E2',
            'E3',
            'E4'
        ];
    }

    // ------------------------------------------
    // Procura checkboxes E1-E4
    // ------------------------------------------

    ['E1', 'E2', 'E3', 'E4']
        .forEach(
            codigo => {

                const checkbox =
                    document.getElementById(
                        `experimento-${codigo.toLowerCase()}`
                    );

                if (
                    checkbox &&
                    checkbox.checked
                ) {

                    selecionadas.push(
                        codigo
                    );
                }
            }
        );

    return selecionadas;
}

// ============================================================
// 44. SELECIONAR TODOS OS EXPERIMENTOS
// ============================================================

function selecionarTodosExperimentos(
    marcado
) {

    [
        'E1',
        'E2',
        'E3',
        'E4'
    ].forEach(
        codigo => {

            const checkbox =
                document.getElementById(
                    `experimento-${codigo.toLowerCase()}`
                );

            if (checkbox) {

                checkbox.checked =
                    marcado;
            }
        }
    );
}

// ============================================================
// 45. OBTER NÚMERO DE REPETIÇÕES
// ============================================================

function obterNumeroRepeticoes() {

    const input =
        document.getElementById(
            'input-repeticoes-experimentos'
        );

    if (!input) {

        return CONFIG_EXPERIMENTOS
            .repeticoesPadrao;
    }

    const valor =
        parseInt(
            input.value
        );

    if (
        !Number.isInteger(valor) ||
        valor < 1
    ) {

        return CONFIG_EXPERIMENTOS
            .repeticoesPadrao;
    }

    return valor;
}

// ============================================================
// 46. EXECUTAR EXPERIMENTOS
// ============================================================

async function executarExperimentos() {
    const listaPontos = obterPontosAtuais();
    if (listaPontos.length < 3) {
        return alert('Adicione no mínimo 3 pontos antes de executar os experimentos.');
    }

    const condicoes = obterCondicoesExperimentaisSelecionadas();
    if (condicoes.length === 0) {
        return alert('Selecione pelo menos uma condição experimental: E1, E2, E3 ou E4.');
    }

    const repeticoes = obterNumeroRepeticoes();
    const circuitoFechado = document.querySelector('input[name="tipo_circuito"]:checked')?.value === 'fechado';
    const cenarioInput = document.getElementById('input-cenario-id');
    const cenarioId = cenarioInput ? parseInt(cenarioInput.value) : null;

    // Fecha a janela de configuração
    fecharModalExperimentos();

    // Inicializa a variável global que guardará todos os dados
    window.resultadoExperimentos = { dados: [] };

    const totalPassos = condicoes.length * repeticoes;
    let passoAtual = 0;

    try {
        // Loop Externo: Condições (E1, E2...)
        for (const condicao of condicoes) {
            
            // Loop Interno: Repetições (1, 2, 3...)
            for (let rep = 1; rep <= repeticoes; rep++) {
                passoAtual++;
                
                // Atualiza a interface a cada passo
                const msgLoading = `Executando ${condicao.toUpperCase()}\nRepetição ${rep} de ${repeticoes}\nProgresso Total: ${passoAtual}/${totalPassos}`;
                mostrarLoading(true, msgLoading, true, passoAtual, totalPassos);

                // Faz a chamada APENAS para essa repetição
                const response = await fetch(`${API_BASE_URL}/experimento-unico`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        cenario_id: cenarioId,
                        pontos: listaPontos,
                        circuito_fechado: circuitoFechado,
                        experimento: condicao.toLowerCase(),
                        repeticao: rep
                    })
                });

                // Tratamento caso a sessão caia no meio do teste
                if (response.status === 401 || response.status === 403) {
                    realizarLogout();
                    throw new Error('Sua sessão expirou no meio do teste. Faça login novamente.');
                }

                const resultado = await response.json();

                if (!response.ok || resultado.erro) {
                    throw new Error(resultado.erro || `Falha na condição ${condicao.toUpperCase()} (Repetição ${rep}).`);
                }

                // Insere os resultados desse passo na matriz global
                window.resultadoExperimentos.dados.push(...resultado.registros);
            }
        }

        // FIM DO LOOP: Esconde loading e abre a tela de Sucesso/Exportação
        mostrarLoading(false);
        abrirModalExportacao();

    } catch (err) {
        console.error('Erro nos experimentos:', err);
        mostrarLoading(false);
        alert('A execução foi interrompida: ' + err.message);
    }
}

function abrirModalExperimentos() {
    const modal = document.getElementById('experimentosModal');
    if (modal) modal.style.display = 'block';
}

function fecharModalExperimentos() {
    const modal = document.getElementById('experimentosModal');
    if (modal) modal.style.display = 'none';
}

function abrirModalExportacao() {
    const modal = document.getElementById('exportacaoModal');
    if (modal) modal.style.display = 'block';
}

function fecharModalExportacao() {
    const modal = document.getElementById('exportacaoModal');
    if (modal) modal.style.display = 'none';
}

// ============================================================
// 47. ATUALIZAR RESULTADOS DOS EXPERIMENTOS
// ============================================================

function atualizarInterfaceExperimentos(
    resultado
) {

    if (!resultado) {
        return;
    }

    // A estrutura final será tratada quando o
    // endpoint /api/experimentos estiver pronto.

    const container =
        document.getElementById(
            'resultado-experimentos'
        );

    if (!container) {
        return;
    }

    if (
        Array.isArray(
            resultado.resultados
        )
    ) {

        container.innerHTML =
            `<p>
                ${resultado.resultados.length}
                registros experimentais processados.
            </p>`;
    }
}

// ============================================================
// 48. EXPORTAÇÃO DOS EXPERIMENTOS (CORRIGIDO)
// ============================================================

function exportarExperimentos(metrica) {
    const resultado = window.resultadoExperimentos;

    if (!resultado) {
        return alert('Execute os experimentos antes de exportar os resultados.');
    }

    const registros = resultado.dados || resultado.resultados;

    if (!Array.isArray(registros) || registros.length === 0) {
        return alert('Não existem dados experimentais para exportar.');
    }

    let colunas;

    // Colunas atualizadas para bater exatamente com as chaves do backend
    switch (metrica) {
        case 'distancia':
            colunas = ['experimento', 'repeticao', 'algoritmo', 'distancia_km'];
            break;
        case 'avaliacoes':
            colunas = ['experimento', 'repeticao', 'algoritmo', 'avaliacoes'];
            break;
        case 'tempo':
            colunas = ['experimento', 'repeticao', 'algoritmo', 'tempo_execucao_ms'];
            break;
        case 'iteracoes':
            colunas = ['experimento', 'repeticao', 'algoritmo', 'iteracoes_realizadas'];
            break;
        case 'todos':
        default:
            colunas = [
                'experimento',
                'repeticao',
                'algoritmo',
                'distancia_km',
                'tempo_execucao_ms',
                'avaliacoes',
                'iteracoes_realizadas'
            ];
            break;
    }

    const linhas = [];

    // Cabeçalho do CSV
    linhas.push(colunas.join(';'));

    // Preenchimento dos Dados
    registros.forEach(registro => {
        const linha = colunas.map(coluna => {
            let valor = registro[coluna];

            if (valor === undefined || valor === null) {
                valor = '';
            }

            // Tratamento do texto para o formato seguro do CSV
            const texto = String(valor).replace(/"/g, '""');
            return `"${texto}"`;
        });

        linhas.push(linha.join(';'));
    });

    // Criação do arquivo (BOM incluído para aceitar acentos no Excel)
    const csv = '\uFEFF' + linhas.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    
    const data = new Date().toISOString().slice(0, 10);
    link.download = `experimentos_${metrica}_${data}.csv`;

    document.body.appendChild(link);
    link.click();
    
    // Limpeza da memória
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ============================================================
// 49. EXPORTAÇÕES INDIVIDUAIS
// ============================================================

function exportarDistancias() {

    exportarExperimentos(
        'distancia'
    );
}

function exportarAvaliacoes() {

    exportarExperimentos(
        'avaliacoes'
    );
}

function exportarTempos() {

    exportarExperimentos(
        'tempo'
    );
}

function exportarIteracoes() {

    exportarExperimentos(
        'iteracoes'
    );
}

function exportarTodosDados() {

    exportarExperimentos(
        'todos'
    );
}

// ============================================================
// 50. DISPONIBILIZA FUNÇÕES NO WINDOW
// ============================================================

window.pontos = pontos;
window.marcadores = marcadores;
window.dadosResultadoGlobal =
    dadosResultadoGlobal;

window.adicionarPonto =
    adicionarPonto;

window.removerPonto =
    removerPonto;

window.salvarRotaAtual =
    salvarRotaAtual;

window.carregarMinhasRotas =
    carregarMinhasRotas;

window.carregarRotaNoMapa =
    carregarRotaNoMapa;

window.fecharModalHistorico =
    fecharModalHistorico;

window.limparTudo =
    limparTudo;

window.abrirModalAuth =
    abrirModalAuth;

window.fecharModalAuth =
    fecharModalAuth;

window.alternarFormAuth =
    alternarFormAuth;

window.realizarLogin =
    realizarLogin;

window.realizarCadastro =
    realizarCadastro;

window.realizarLogout =
    realizarLogout;

window.gerarRelatorioEntrega =
    gerarRelatorioEntrega;

window.alternarCamposCriterio =
    alternarCamposCriterio;

window.trocarAba =
    trocarAba;

window.selecionarMetodo =
    selecionarMetodo;

window.preVisualizarRota =
    preVisualizarRota;

window.restaurarRotaFixada =
    restaurarRotaFixada;

window.fixarMetodo =
    fixarMetodo;

window.alternarPainelResultados =
    alternarPainelResultados;

window.focarNoPonto =
    focarNoPonto;

window.executarExperimentos =
    executarExperimentos;

window.selecionarTodosExperimentos =
    selecionarTodosExperimentos;

window.exportarExperimentos =
    exportarExperimentos;

window.exportarDistancias =
    exportarDistancias;

window.exportarAvaliacoes =
    exportarAvaliacoes;

window.exportarTempos =
    exportarTempos;

window.exportarIteracoes =
    exportarIteracoes;

window.exportarTodosDados =
    exportarTodosDados;

window.abrirModalExperimentos = abrirModalExperimentos;
window.fecharModalExperimentos = fecharModalExperimentos;

window.excluirRotaHistorico = excluirRotaHistorico;