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

// Constantes Logísticas para Cálculo de Frota
const CONSUMO_MEDIO_KML = 8.5; 
const PRECO_COMBUSTIVEL_LITRO = 6.50; 
const VELOCIDADE_MEDIA_KMH = 40; 

const CORES_TRECHOS = [
    '#2563eb', '#ea580c', '#16a34a', '#9333ea', '#e11d48', '#0891b2'
];

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

// 1. FILTRO DE CIDADE
const inputCidade = document.getElementById('input-cidade');
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

// 2. AUTOCOMPLETE DE ENDEREÇOS
const inputEndereco = document.getElementById('input-endereco');
const sugestoesLista = document.getElementById('sugestoes-lista');

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
            const cidadeFiltro = inputCidade.value.trim() || cidadeAtualFiltro || "Monte Carmelo";
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

function selecionarEndereco(item) {
    sugestoesLista.classList.add('sugestoes-ocultas');
    sugestoesLista.innerHTML = '';
    inputEndereco.value = '';
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    map.setView([lat, lng], 15);
    adicionarPonto(lat, lng, formatarNomeEndereco(item.display_name));
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.card-busca')) {
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
        draggable: true // 1. Permite arrastar o pino no mapa
    }).addTo(map);

    // 2. Atualiza a posição da parada quando o pino é arrastado
    marcador.on('dragend', function (event) {
        const novaPos = event.target.getLatLng();
        
        // Procura o ponto na lista global pelo ID/índice correspondente
        const ponto = pontos.find(p => p.id === (ehInicio ? 'inicio' : novoId));
        if (ponto) {
            ponto.lat = novaPos.lat;
            ponto.lng = novaPos.lng;
        }

        limparRotaDesenhada(); // Reseta as linhas desenhadas para o novo cálculo
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

function atualizarListaUI(ordemExibicao = null) {
    const ul = document.getElementById('lista-pontos');
    document.getElementById('qtd-pontos').innerText = pontos.length;
    ul.innerHTML = '';

    if (ordemExibicao) {
        // MODO OTIMIZADO (Exibe as paradas na ordem da rota calculada)
        ordemExibicao.forEach((pontoIdx, seq) => {
            const p = pontos[pontoIdx];
            const corTag = seq === 0 ? '#ef4444' : CORES_TRECHOS[(seq - 1) % CORES_TRECHOS.length];
            const li = document.createElement('li');
            li.className = 'item-ponto';
            
            // 📍 AQUI ENTRA A MELHORIA: Interatividade ao clicar na parada
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
        // MODO PADRÃO (Exibe as paradas na ordem original de adição)
        pontos.forEach((p, idx) => {
            const li = document.createElement('li');
            li.className = 'item-ponto';
            
            // 📍 AQUI ENTRA A MELHORIA: Interatividade ao clicar na parada
            li.style.cursor = 'pointer';
            li.title = "Clique para localizar no mapa";
            li.onclick = (e) => {
                // Evita focar no mapa se o usuário estiver clicando no botão de excluir
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

function limparRotaDesenhada() {
    if (camadaRota) {
        map.removeLayer(camadaRota);
        camadaRota = null;
    }
    cacheTrajetosGeoJSON = {};
    document.getElementById('resultados').classList.add('oculto');
    marcadores.forEach((m, idx) => m.setIcon(idx === 0 ? iconeInicio : iconeParadaPadrao));
}

// 4. BOTÃO OTIMIZAR
document.getElementById('btn-otimizar').addEventListener('click', async () => {
    if (pontos.length < 3) return alert('Adicione no mínimo 3 pontos (1 Início + 2 Paradas).');

    const circuitoFechado = document.querySelector('input[name="tipo_circuito"]:checked').value === 'fechado';

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

        // Atualização de Métricas nos Cards (Original + Métodos)
        const chaves = ['original', 'nn', 'opt2', 'sa'];
        chaves.forEach(ch => {
            if (dadosResultadoGlobal.metodos[ch]) {
                const dist = dadosResultadoGlobal.metodos[ch].distancia_km;
                const elDist = document.getElementById(`dist-${ch}`);
                const elTempo = document.getElementById(`tempo-${ch}`);
                const elCusto = document.getElementById(`custo-${ch}`);

                if (elDist) elDist.innerText = dist;
                if (elTempo) elTempo.innerText = formatarTempoViagem(dist);
                if (elCusto) elCusto.innerText = formatarCustoCombustivel(dist);
            }
        });

        document.getElementById('resultados').classList.remove('oculto');

        await preCarregarTrajetosMemoria();

        const melhorMetodo = ['sa', 'opt2', 'nn'].reduce((a, b) => 
            dadosResultadoGlobal.metodos[a].distancia_km <= dadosResultadoGlobal.metodos[b].distancia_km ? a : b
        );

        mostrarLoading(false);
        fixarMetodo(melhorMetodo);

    } catch (err) {
        mostrarLoading(false);
        alert('Falha ao conectar com o backend.');
    }
});

async function preCarregarTrajetosMemoria() {
    cacheTrajetosGeoJSON = {};
    const chaves = ['original', 'nn', 'opt2', 'sa'];
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

// 5. RENDERIZAÇÃO
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
    
    const rota = dadosResultadoGlobal.metodos[chaveMetodo].rota;
    atualizarMarcadoresNumerados(rota);
    atualizarListaUI(rota);
    renderizarTrajetoDaMemoria(chaveMetodo);
}

function preVisualizarRota(chaveMetodo) {
    if (!dadosResultadoGlobal || !cacheTrajetosGeoJSON[chaveMetodo]) return;
    atualizarDestaqueCards(chaveMetodo, true);
    
    const rota = dadosResultadoGlobal.metodos[chaveMetodo].rota;
    atualizarMarcadoresNumerados(rota);
    renderizarTrajetoDaMemoria(chaveMetodo, '#38bdf8');
}

function restaurarRotaFixada() {
    if (!dadosResultadoGlobal || !metodoFixado) return;
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
    if (exibir) el.classList.remove('oculto');
    else el.classList.add('oculto');
}

// 6. BOTÃO LIMPAR
document.getElementById('btn-limpar').addEventListener('click', () => {
    pontos = [];
    marcadores.forEach(m => map.removeLayer(m));
    marcadores = [];
    dadosResultadoGlobal = null;
    metodoFixado = null;
    limparRotaDesenhada();
    atualizarListaUI();
});

function focarNoPonto(pontoIdx) {
    const p = pontos[pontoIdx];
    if (!p) return;
    
    // Centraliza e dá zoom no mapa na coordenada da parada
    map.setView([p.lat, p.lng], 16, { animate: true });
    
    // Abre o popup do marcador correspondente
    if (marcadores[pontoIdx]) {
        marcadores[pontoIdx].openPopup();
    }
}