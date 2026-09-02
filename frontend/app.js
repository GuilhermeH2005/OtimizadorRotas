// Inicialização do mapa
var map = L.map('mapa').setView([-18.726, -47.498], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
}).addTo(map);

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

// Constantes Logísticas para Cálculo de Frota
const CONSUMO_MEDIO_KML = 8.5; 
const PRECO_COMBUSTIVEL_LITRO = 6.50; 
const VELOCIDADE_MEDIA_KMH = 40; 

const CORES_TRECHOS = [
    '#2563eb', '#ea580c', '#16a34a', '#9333ea', '#e11d48', '#0891b2'
];

// ÍCONES LEAFLET
const iconeInicio = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

const iconeParadaPadrao = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

function criarIconeNumerado(numero, ehPartida = false) {
    const corFundo = ehPartida ? '#ef4444' : '#0284c7';
    return L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="
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
        ">${numero}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });
}

// RENDERIZAÇÃO DO GRÁFICO
function renderizarGraficoComparativo(metodos) {
    const canvas = document.getElementById('graficoComparativo');
    if (!canvas || !metodos) return;

    const ctx = canvas.getContext('2d');
    const labels = ['Original', '2-Opt', 'Simulated Annealing', 'Formigas (ACO)'];
    
    const distancias = [
        metodos.original?.distancia_km || 0,
        metodos.opt2?.distancia_km || 0,
        metodos.sa?.distancia_km || 0,
        metodos.aco?.distancia_km || 0
    ];

    const tempos = [
        metodos.original?.tempo_execucao_ms || 0,
        metodos.opt2?.tempo_execucao_ms || 0,
        metodos.sa?.tempo_execucao_ms || 0,
        metodos.aco?.tempo_execucao_ms || 0
    ];

    if (instanciaGrafico) {
        instanciaGrafico.destroy();
    }

    const pluginsUsados = [];
    if (typeof ChartDataLabels !== 'undefined') {
        pluginsUsados.push(ChartDataLabels);
    }

    instanciaGrafico = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Distância (km)',
                    data: distancias,
                    backgroundColor: 'rgba(59, 130, 246, 0.85)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 1,
                    yAxisID: 'yDistancia'
                },
                {
                    label: 'Tempo Execução (ms)',
                    data: tempos,
                    backgroundColor: 'rgba(239, 68, 68, 0.85)',
                    borderColor: 'rgba(239, 68, 68, 1)',
                    borderWidth: 1,
                    yAxisID: 'yTempo',
                    minBarLength: 4 // 👈 Garante que tempos muito rápidos (ex: 0.2ms) desenhem uma barra visível
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                datalabels: {
                    anchor: 'end',
                    align: 'top',
                    color: '#f8fafc',
                    font: { weight: 'bold', size: 10 },
                    formatter: (value, context) => {
                        // 👈 Ajuste: Permite mostrar decimais se o tempo for menor que 1 ms e maior que zero
                        if (value === 0) return '0 ms'; 
                        
                        if (context.dataset.label.includes('Distância')) {
                            return `${value.toFixed(1)} km`;
                        } else {
                            return value < 1 ? `${value.toFixed(2)} ms` : `${value.toFixed(0)} ms`;
                        }
                    }
                }
            },
            scales: {
                yDistancia: {
                    type: 'linear',
                    position: 'left',
                    beginAtZero: true,
                    title: { display: true, text: 'Distância (km)', color: '#94a3b8' },
                    ticks: { color: '#cbd5e1' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                yTempo: {
                    type: 'linear',
                    position: 'right',
                    beginAtZero: true,
                    title: { display: true, text: 'Tempo (ms)', color: '#94a3b8' },
                    ticks: { color: '#cbd5e1' },
                    grid: { drawOnChartArea: false }
                },
                x: {
                    ticks: { color: '#cbd5e1' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        },
        plugins: pluginsUsados
    });

    atualizarCardVencedor(metodos);
}

// CARD DO VENCEDOR
function atualizarCardVencedor(metodos) {
    const cardVencedor = document.getElementById('card-vencedor');
    if (!cardVencedor || !metodos) return;

    const listaMetodos = [
        { chave: '2-Opt', dados: metodos.opt2 },
        { chave: 'Simulated Annealing', dados: metodos.sa },
        { chave: 'Formigas (ACO)', dados: metodos.aco }
    ].filter(m => m.dados && m.dados.distancia_km > 0);

    if (listaMetodos.length === 0) return;

    let vencedor = listaMetodos.reduce((melhor, atual) => 
        atual.dados.distancia_km < melhor.dados.distancia_km ? atual : melhor
    , listaMetodos[0]);

    const distOriginal = metodos.original?.distancia_km || vencedor.dados.distancia_km;
    const reducao = distOriginal > 0 
        ? (((distOriginal - vencedor.dados.distancia_km) / distOriginal) * 100).toFixed(1)
        : 0;

    cardVencedor.innerHTML = `
        <span class="vencedor-badge">🏆 MELHOR ROTA ENCONTRADA</span>
        <div class="vencedor-info">
            <h3>Método: <span>${vencedor.chave}</span></h3>
            <p>Economia de <strong>${reducao}%</strong> em relação ao trajeto original.</p>
        </div>
        <div class="vencedor-stats">
            <div class="vencedor-stat-card">
                <span>Distância Total</span>
                <strong>${vencedor.dados.distancia_km.toFixed(2)} km</strong>
            </div>
            <div class="vencedor-stat-card">
                <span>Tempo Execução</span>
                <strong>${vencedor.dados.tempo_execucao_ms.toFixed(1)} ms</strong>
            </div>
        </div>
    `;
}

// 1. FILTRO DE CIDADE
const inputCidade = document.getElementById('input-cidade');
if (inputCidade) {
    inputCidade.addEventListener('input', () => {
        clearTimeout(timerCidade);
        const termoCidade = inputCidade.value.trim();
        if (termoCidade.length < 3) return;

        timerCidade = setTimeout(async () => {
            try {
                mostrarLoading(true);
                const url = `https://nominatim.openstreetmap.org/search?format=json&city=${encodeURIComponent(termoCidade)}&country=brazil&limit=1`;
                const res = await fetch(url, { headers: { 'User-Agent': 'OtimizadorTCC-TSP/1.0' } });
                const dados = await res.json();
                mostrarLoading(false);

                if (dados && dados.length > 0) {
                    cidadeAtualFiltro = termoCidade;
                    map.flyTo([parseFloat(dados[0].lat), parseFloat(dados[0].lon)], 13, { duration: 1.2 });
                }
            } catch (err) {
                mostrarLoading(false);
            }
        }, 500);
    });
}

// 2. AUTOCOMPLETE DE ENDEREÇOS
const inputEndereco = document.getElementById('input-endereco');
const sugestoesLista = document.getElementById('sugestoes-lista');

if (inputEndereco && sugestoesLista) {
    inputEndereco.addEventListener('input', () => {
        clearTimeout(timerEndereco);
        const termoRua = inputEndereco.value.trim();
        
        if (termoRua.length < 2) {
            sugestoesLista.classList.add('sugestoes-ocultas');
            sugestoesLista.innerHTML = '';
            return;
        }

        sugestoesLista.innerHTML = '<li class="sugestao-info">🔍 Pesquisando endereços...</li>';
        sugestoesLista.classList.remove('sugestoes-ocultas');

        timerEndereco = setTimeout(async () => {
            try {
                const cidadeFiltro = inputCidade?.value.trim() || cidadeAtualFiltro || "Monte Carmelo";
                const termoSemNumero = termoRua.replace(/\s+\d+.*$/, '').trim();

                let dados = [];
                let url1 = `https://nominatim.openstreetmap.org/search?format=json&street=${encodeURIComponent(termoRua)}&city=${encodeURIComponent(cidadeFiltro)}&country=brazil&limit=5`;
                let res = await fetch(url1, { headers: { 'User-Agent': 'OtimizadorTCC-TSP/1.0' } });
                dados = await res.json();

                if ((!dados || dados.length === 0) && termoSemNumero !== termoRua) {
                    let url2 = `https://nominatim.openstreetmap.org/search?format=json&street=${encodeURIComponent(termoSemNumero)}&city=${encodeURIComponent(cidadeFiltro)}&country=brazil&limit=5`;
                    res = await fetch(url2, { headers: { 'User-Agent': 'OtimizadorTCC-TSP/1.0' } });
                    dados = await res.json();
                }

                if (!dados || dados.length === 0) {
                    const buscaLivre = `${termoRua}, ${cidadeFiltro}, Minas Gerais, Brasil`;
                    let url3 = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(buscaLivre)}&countrycodes=br&limit=5`;
                    res = await fetch(url3, { headers: { 'User-Agent': 'OtimizadorTCC-TSP/1.0' } });
                    dados = await res.json();
                }

                sugestoesLista.innerHTML = '';

                if (dados && dados.length > 0) {
                    dados.forEach(item => {
                        const li = document.createElement('li');
                        li.innerText = item.display_name;
                        li.onclick = () => selecionarEndereco(item);
                        sugestoesLista.appendChild(li);
                    });
                    sugestoesLista.classList.remove('sugestoes-ocultas');
                } else {
                    sugestoesLista.innerHTML = '<li class="sugestao-vazia">⚠️ Rua não encontrada. Clique direto no mapa.</li>';
                    sugestoesLista.classList.remove('sugestoes-ocultas');
                }
            } catch (err) {
                sugestoesLista.innerHTML = '<li class="sugestao-vazia">❌ Erro de conexão na busca.</li>';
            }
        }, 400);
    });
}

function selecionarEndereco(item) {
    if (sugestoesLista) sugestoesLista.classList.add('sugestoes-ocultas');
    if (inputEndereco) inputEndereco.value = '';
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    map.setView([lat, lng], 15);
    adicionarPonto(lat, lng, formatarNomeEndereco(item.display_name));
}

document.addEventListener('click', (e) => {
    if (sugestoesLista && !e.target.closest('.card-busca')) {
        sugestoesLista.classList.add('sugestoes-ocultas');
    }
});

// 3. CLIQUE NO MAPA
map.on('click', async (e) => {
    const { lat, lng } = e.latlng;
    mostrarLoading(true);
    let nomeRua = "Ponto marcado no mapa";
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'OtimizadorTCC-TSP/1.0' } });
        const data = await res.json();
        if (data && data.display_name) nomeRua = formatarNomeEndereco(data.display_name);
    } catch (err) {
    } finally {
        mostrarLoading(false);
    }
    adicionarPonto(lat, lng, nomeRua);
});

function formatarNomeEndereco(displayName) {
    const partes = displayName.split(',');
    if (partes.length >= 3) return `${partes[0].trim()}, ${partes[1].trim()} - ${partes[2].trim()}`;
    return partes[0].trim();
}

function adicionarPonto(lat, lng, nomeEndereco) {
    const novoId = pontos.length;
    const ehInicio = novoId === 0;
    const ponto = { id: novoId, lat, lng, nome: nomeEndereco };
    pontos.push(ponto);

    const marcador = L.marker([lat, lng], {
        icon: ehInicio ? iconeInicio : iconeParadaPadrao,
        draggable: true
    }).addTo(map);

    marcador.on('dragend', function (event) {
        const novaPos = event.target.getLatLng();
        const pEncontrado = pontos.find(p => p.id === novoId);
        if (pEncontrado) {
            pEncontrado.lat = novaPos.lat;
            pEncontrado.lng = novaPos.lng;
        }
        limparRotaDesenhada();
    });

    marcador.bindPopup(`<b>${ehInicio ? '📍 Partida' : '📦 Ponto #' + novoId}:</b><br>${nomeEndereco}`);
    marcadores.push(marcador);

    limparRotaDesenhada();
    atualizarListaUI();
}

function removerPonto(index) {
    pontos.splice(index, 1);
    map.removeLayer(marcadores[index]);
    marcadores.splice(index, 1);

    pontos.forEach((p, idx) => p.id = idx);
    marcadores.forEach((m, idx) => m.setIcon(idx === 0 ? iconeInicio : iconeParadaPadrao));

    limparRotaDesenhada();
    atualizarListaUI();
}

function formatarTempoViagem(distanciaKm) {
    const horasDecimais = distanciaKm / VELOCIDADE_MEDIA_KMH;
    const horas = Math.floor(horasDecimais);
    const minutos = Math.round((horasDecimais - horas) * 60);
    if (horas === 0) return `${minutos} min`;
    return `${horas}h ${minutos}m`;
}

function formatarCustoCombustivel(distanciaKm) {
    const litros = distanciaKm / CONSUMO_MEDIO_KML;
    const custo = litros * PRECO_COMBUSTIVEL_LITRO;
    return `R$ ${custo.toFixed(0)}`;
}

function selecionarMetodo(chaveMetodo, elementoCard) {
    document.querySelectorAll('.card-metodo-item').forEach(card => card.classList.remove('active'));
    if (elementoCard) {
        elementoCard.classList.add('active');
    }

    if (typeof fixarMetodo === 'function') {
        fixarMetodo(chaveMetodo);
    }

    const dados = dadosResultadoGlobal?.metodos?.[chaveMetodo];
    const listaUl = document.getElementById('lista-paradas-algoritmo');
    const titulo = document.getElementById('titulo-sequencia-metodo');

    if (titulo) {
        titulo.innerText = `Sequência da Rota (${chaveMetodo.toUpperCase()}):`;
    }

    if (listaUl && dados?.ordem) {
        listaUl.innerHTML = dados.ordem.map((ponto, idx) => `
            <li><strong>${idx + 1}ª Parada:</strong> ${ponto.nome || ponto.endereco || 'Ponto ' + (idx + 1)}</li>
        `).join('');
    }
}

function atualizarListaUI(ordemExibicao = null) {
    const ul = document.getElementById('lista-pontos');
    const qtdEl = document.getElementById('qtd-pontos');
    if (qtdEl) qtdEl.innerText = pontos.length;
    if (!ul) return;
    
    ul.innerHTML = '';

    if (ordemExibicao) {
        ordemExibicao.forEach((pontoIdx, seq) => {
            const p = pontos[pontoIdx];
            if (!p) return;
            const corTag = seq === 0 ? '#ef4444' : CORES_TRECHOS[(seq - 1) % CORES_TRECHOS.length];
            const li = document.createElement('li');
            li.className = 'item-ponto';
            li.style.cursor = 'pointer';
            li.title = "Clique para localizar no mapa";
            li.onclick = () => focarNoPonto(pontoIdx);

            li.innerHTML = `
                <div class="info-ponto">
                    <span class="tag-ordem" style="background-color: ${corTag};">
                        ${seq === 0 ? '📍 Partida' : `➡️ ${seq}ª Parada`}
                    </span>
                    <span>${p.nome}</span>
                </div>
            `;
            ul.appendChild(li);
        });
    } else {
        pontos.forEach((p, idx) => {
            const li = document.createElement('li');
            li.className = 'item-ponto';
            li.style.cursor = 'pointer';
            li.title = "Clique para localizar no mapa";
            li.onclick = (e) => {
                if (!e.target.closest('.btn-remover-ponto')) {
                    focarNoPonto(idx);
                }
            };

            li.innerHTML = `
                <div class="info-ponto">
                    <span class="tag-ordem" style="background-color: ${idx === 0 ? '#ef4444' : '#0284c7'};">
                        ${idx === 0 ? '📍 Partida' : `📦 Parada #${idx}`}
                    </span>
                    <span>${p.nome}</span>
                </div>
                <button class="btn-remover-ponto" onclick="removerPonto(${idx})" title="Excluir">🗑️</button>
            `;
            ul.appendChild(li);
        });
    }
}

function alternarPainelResultados() {
    const painel = document.getElementById('resultados');
    if (painel) {
        painel.classList.toggle('recolhido');
    }
}

function limparRotaDesenhada() {
    if (camadaRota) {
        map.removeLayer(camadaRota);
        camadaRota = null;
    }
    cacheTrajetosGeoJSON = {};
    const resEl = document.getElementById('resultados');
    if (resEl) resEl.classList.add('oculto');
    marcadores.forEach((m, idx) => m.setIcon(idx === 0 ? iconeInicio : iconeParadaPadrao));
}

// 4. BOTÃO OTIMIZAR
const btnOtimizar = document.getElementById('btn-otimizar');
if (btnOtimizar) {
    btnOtimizar.addEventListener('click', async () => {
        if (pontos.length < 3) return alert('Adicione no mínimo 3 pontos (1 Início + 2 Paradas).');

        const circuitoFechado = document.querySelector('input[name="tipo_circuito"]:checked')?.value === 'fechado';

        try {
            mostrarLoading(true);
            const response = await fetch('http://localhost:3000/api/otimizar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pontos, circuito_fechado: circuitoFechado })
            });

            dadosResultadoGlobal = await response.json();

            if (dadosResultadoGlobal.erro) {
                mostrarLoading(false);
                return alert('Erro: ' + dadosResultadoGlobal.erro);
            }

           const chaves = ['original', 'opt2', 'sa', 'aco'];

chaves.forEach(ch => {
    if (dadosResultadoGlobal.metodos?.[ch]) {
        const dist = dadosResultadoGlobal.metodos[ch].distancia_km;

        // IDs exatos do seu HTML
        const elDist = document.getElementById(`card-dist-${ch}`);
        const elCombustivel = document.getElementById(`card-combustivel-${ch}`);
        const elTempo = document.getElementById(`card-tempo-${ch}`);

        // Preenchimento com formatação adequada
        if (elDist) elDist.innerText = `${dist.toFixed(2)} km`;
        if (elCombustivel) elCombustivel.innerText = `⛽ ${formatarCustoCombustivel(dist)}`;
        if (elTempo) elTempo.innerText = `⏱️ ${formatarTempoViagem(dist)}`;
    }
});

            const resEl = document.getElementById('resultados');
            if (resEl) resEl.classList.remove('oculto');
            
            renderizarGraficoComparativo(dadosResultadoGlobal.metodos);
            await preCarregarTrajetosMemoria();

            const melhorMetodo = ['aco', 'sa', 'opt2', 'nn'].reduce((a, b) => {
                if (!dadosResultadoGlobal.metodos?.[a]) return b;
                if (!dadosResultadoGlobal.metodos?.[b]) return a;
                return dadosResultadoGlobal.metodos[a].distancia_km <= dadosResultadoGlobal.metodos[b].distancia_km ? a : b;
            });

            mostrarLoading(false);
            fixarMetodo(melhorMetodo);

        } catch (err) {
            mostrarLoading(false);
            alert('Falha ao conectar com o backend.');
        }
    });
}

function trocarAba(event, abaId) {
    document.querySelectorAll('.aba-item').forEach(aba => aba.classList.remove('active'));
    document.querySelectorAll('.aba-btn').forEach(btn => btn.classList.remove('active'));

    document.getElementById(abaId)?.classList.add('active');
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    const mapaAbas = {
        'aba-original': 'original',
        'aba-opt2': 'opt2',
        'aba-sa': 'sa',
        'aba-aco': 'aco'
    };

    const chaveMetodo = mapaAbas[abaId];

    if (chaveMetodo && dadosResultadoGlobal?.metodos?.[chaveMetodo]) {
        fixarMetodo(chaveMetodo);
    }
}

async function preCarregarTrajetosMemoria() {
    cacheTrajetosGeoJSON = {};
    if (!dadosResultadoGlobal?.metodos) return;

    const chaves = ['original', 'nn', 'opt2', 'sa', 'aco'];
    const ehCircuitoFechado = dadosResultadoGlobal.circuito_fechado;

    for (const chave of chaves) {
        if (!dadosResultadoGlobal.metodos[chave]) continue;
        
        const ordem = dadosResultadoGlobal.metodos[chave].rota;
        const pontosOrdenados = ordem.map(i => pontos[i]);
        if (ehCircuitoFechado) pontosOrdenados.push(pontos[0]);

        cacheTrajetosGeoJSON[chave] = [];

        for (let i = 0; i < pontosOrdenados.length - 1; i++) {
            const pOrigem = pontosOrdenados[i];
            const pDestino = pontosOrdenados[i + 1];
            if (!pOrigem || !pDestino) continue;

            const url = `https://router.project-osrm.org/route/v1/driving/${pOrigem.lng},${pOrigem.lat};${pDestino.lng},${pDestino.lat}?overview=full&geometries=geojson`;

            try {
                const res = await fetch(url);
                const data = await res.json();
                if (data.routes && data.routes.length > 0) {
                    const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
                    cacheTrajetosGeoJSON[chave].push(coords);
                }
            } catch (e) {}
        }
    }
}

// 5. RENDERIZAÇÃO DE TRAJETO
function renderizarTrajetoDaMemoria(chaveMetodo, corFixa = null) {
    if (camadaRota) {
        map.removeLayer(camadaRota);
        camadaRota = null;
    }

    const trechosCoords = cacheTrajetosGeoJSON[chaveMetodo];
    if (!trechosCoords || trechosCoords.length === 0) return;

    camadaRota = L.featureGroup().addTo(map);

    trechosCoords.forEach((coords, i) => {
        const cor = corFixa || CORES_TRECHOS[i % CORES_TRECHOS.length];

        L.polyline(coords, {
            color: '#0f172a',
            weight: 8,
            opacity: 0.9
        }).addTo(camadaRota);

        const linhaColorida = L.polyline(coords, {
            color: cor,
            weight: 5,
            opacity: 1.0
        }).addTo(camadaRota);

        if (L.polylineDecorator) {
            L.polylineDecorator(linhaColorida, {
                patterns: [
                    {
                        offset: '30px',
                        repeat: '80px',
                        symbol: L.Symbol.arrowHead({
                            pixelSize: 10,
                            headAngle: 60,
                            polygon: true,
                            pathOptions: { stroke: false, fillColor: '#ffffff', fillOpacity: 1.0 }
                        })
                    }
                ]
            }).addTo(camadaRota);
        }
    });

    map.fitBounds(camadaRota.getBounds(), { padding: [40, 40] });
}

function fixarMetodo(chaveMetodo) {
    metodoFixado = chaveMetodo;
    atualizarDestaqueCards(chaveMetodo);
    
    if (dadosResultadoGlobal?.metodos?.[chaveMetodo]) {
        const rota = dadosResultadoGlobal.metodos[chaveMetodo].rota;
        atualizarMarcadoresNumerados(rota);
        atualizarListaUI(rota);
        renderizarTrajetoDaMemoria(chaveMetodo);
    }
}

function preVisualizarRota(chaveMetodo) {
    if (!dadosResultadoGlobal?.metodos?.[chaveMetodo] || !cacheTrajetosGeoJSON[chaveMetodo]) return;
    atualizarDestaqueCards(chaveMetodo, true);
    
    const rota = dadosResultadoGlobal.metodos[chaveMetodo].rota;
    atualizarMarcadoresNumerados(rota);
    renderizarTrajetoDaMemoria(chaveMetodo, '#38bdf8');
}

function restaurarRotaFixada() {
    if (!dadosResultadoGlobal?.metodos || !metodoFixado) return;
    atualizarDestaqueCards(metodoFixado);
    
    const rota = dadosResultadoGlobal.metodos[metodoFixado].rota;
    atualizarMarcadoresNumerados(rota);
    atualizarListaUI(rota);
    renderizarTrajetoDaMemoria(metodoFixado);
}

function atualizarDestaqueCards(chaveAtiva, temporario = false) {
    document.querySelectorAll('.card-metodo').forEach(c => {
        c.classList.remove('ativo');
        c.classList.remove('hover-preview');
    });

    const card = document.getElementById(`card-${chaveAtiva}`);
    if (card) {
        if (temporario) card.classList.add('hover-preview');
        else card.classList.add('ativo');
    }
}

function atualizarMarcadoresNumerados(ordemRota) {
    if (!ordemRota) return;
    ordemRota.forEach((pontoIdx, seq) => {
        if (marcadores[pontoIdx]) {
            if (seq === 0) {
                marcadores[pontoIdx].setIcon(criarIconeNumerado("📍", true));
            } else {
                marcadores[pontoIdx].setIcon(criarIconeNumerado(seq, false));
            }
        }
    });
}

function mostrarLoading(exibir) {
    const el = document.getElementById('loading');
    if (!el) return;
    if (exibir) el.classList.remove('oculto');
    else el.classList.add('oculto');
}

// 6. BOTÃO LIMPAR
const btnLimpar = document.getElementById('btn-limpar');
if (btnLimpar) {
    btnLimpar.addEventListener('click', () => {
        pontos = [];
        marcadores.forEach(m => map.removeLayer(m));
        marcadores = [];
        dadosResultadoGlobal = null;
        metodoFixado = null;
        limparRotaDesenhada();
        atualizarListaUI();
    });
}

function focarNoPonto(pontoIdx) {
    const p = pontos[pontoIdx];
    if (!p) return;
    
    map.setView([p.lat, p.lng], 16, { animate: true });
    
    if (marcadores[pontoIdx]) {
        marcadores[pontoIdx].openPopup();
    }
}