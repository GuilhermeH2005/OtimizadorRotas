import json
import math
import random
import sys
import urllib.request


def obter_matriz_osrm(pontos):
    """Consulta OSRM Table Service e retorna matriz de distâncias (metros)."""
    coords_str = ";".join([f"{p['lng']},{p['lat']}" for p in pontos])
    url = f"http://router.project-osrm.org/table/v1/driving/{coords_str}?annotations=distance"

    req = urllib.request.Request(url, headers={"User-Agent": "ProjetoTCC-TSP/1.0"})
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            return data.get("distances")
    except Exception as e:
        print(
            json.dumps({"erro": f"Falha na comunicação com o OSRM: {str(e)}"}), file=sys.stderr
        )
        sys.exit(1)


def validar_matriz_osrm(matriz):
    """Verifica se a matriz retornada pelo OSRM é válida e não contém None."""
    if not matriz:
        return False, "A matriz de distâncias retornou vazia da API do OSRM."
    
    n = len(matriz)
    for i in range(n):
        for j in range(n):
            valor = matriz[i][j]
            if valor is None or valor < 0:
                return False, f"Não foi possível encontrar uma rota viável de trânsito entre a parada {i} e a parada {j}."
                
    return True, "Matriz válida"


def calcular_distancia_total(rota, matriz, eh_circuito_fechado=True):
    """Calcula a distância total em metros. Trata circuito aberto ou fechado."""
    distancia = 0
    for i in range(len(rota) - 1):
        distancia += matriz[rota[i]][rota[i + 1]]
    if eh_circuito_fechado and len(rota) > 1:
        distancia += matriz[rota[-1]][rota[0]]
    return distancia


# ORDEM ORIGINAL (LINHA DE BASE REAL)
def ordem_original(matriz, eh_circuito_fechado):
    n = len(matriz)
    rota = list(range(n))
    dist = calcular_distancia_total(rota, matriz, eh_circuito_fechado)
    return rota, dist


# VIZINHO MAIS PRÓXIMO
def vizinho_mais_proximo(matriz, eh_circuito_fechado):
    n = len(matriz)
    nao_visitados = list(range(1, n))
    rota = [0]
    atual = 0

    while nao_visitados:
        proximo = min(nao_visitados, key=lambda x: matriz[atual][x])
        rota.append(proximo)
        nao_visitados.remove(proximo)
        atual = proximo

    dist = calcular_distancia_total(rota, matriz, eh_circuito_fechado)
    return rota, dist


#  2-OPT (BUSCA LOCAL)
def dois_opt(rota_inicial, matriz, eh_circuito_fechado):
    melhor_rota = rota_inicial[:]
    melhor_dist = calcular_distancia_total(
        melhor_rota, matriz, eh_circuito_fechado
    )
    melhorou = True

    while melhorou:
        melhorou = False
        for i in range(1, len(melhor_rota) - 1):
            for j in range(i + 1, len(melhor_rota)):
                nova_rota = (
                    melhor_rota[:i] + melhor_rota[i : j + 1][::-1] + melhor_rota[j + 1 :]
                )
                nova_dist = calcular_distancia_total(
                    nova_rota, matriz, eh_circuito_fechado
                )
                if nova_dist < melhor_dist:
                    melhor_rota = nova_rota
                    melhor_dist = nova_dist
                    melhorou = True
                    break
            if melhorou:
                break

    return melhor_rota, melhor_dist


# 3️⃣ SIMULATED ANNEALING (RECOZIMENTO SIMULADO)
def simulated_annealing(
    matriz,
    eh_circuito_fechado,
    temp_inicial=1000.0,
    resfriamento=0.995,
    temp_final=0.1,
):
    n = len(matriz)
    solucao_atual = list(range(n))
    if n > 2:
        miolo = solucao_atual[1:]
        random.shuffle(miolo)
        solucao_atual = [0] + miolo

    dist_atual = calcular_distancia_total(
        solucao_atual, matriz, eh_circuito_fechado
    )
    melhor_solucao = solucao_atual[:]
    melhor_dist = dist_atual

    temp = temp_inicial
    while temp > temp_final:
        i, j = sorted(random.sample(range(1, n), 2)) if n > 2 else (1, 1)
        if i == j:
            temp *= resfriamento
            continue

        vizinho = (
            solucao_atual[:i] + solucao_atual[i : j + 1][::-1] + solucao_atual[j + 1 :]
        )
        dist_vizinho = calcular_distancia_total(
            vizinho, matriz, eh_circuito_fechado
        )

        delta = dist_vizinho - dist_atual

        if delta < 0 or random.random() < math.exp(-delta / temp):
            solucao_atual = vizinho[:]
            dist_atual = dist_vizinho

            if dist_atual < melhor_dist:
                melhor_solucao = solucao_atual[:]
                melhor_dist = dist_atual

        temp *= resfriamento

    return melhor_solucao, melhor_dist


if __name__ == "__main__":
    dados_entrada = None
    eh_circuito_fechado = True

    if len(sys.argv) > 1:
        try:
            payload = json.loads(sys.argv[1])
            if isinstance(payload, dict):
                dados_entrada = payload.get("pontos")
                eh_circuito_fechado = payload.get("circuito_fechado", True)
            else:
                dados_entrada = payload
        except Exception:
            dados_entrada = None

    if not dados_entrada:
        dados_entrada = [
            {"id": 0, "lat": -23.55052, "lng": -46.633308},
            {"id": 1, "lat": -23.55720, "lng": -46.660133},
            {"id": 2, "lat": -23.56141, "lng": -46.655881},
            {"id": 3, "lat": -23.54317, "lng": -46.636972},
            {"id": 4, "lat": -23.57088, "lng": -46.644331},
        ]

    matriz = obter_matriz_osrm(dados_entrada)

    # Validação rigorosa dos dados da matriz
    valido, mensagem_erro = validar_matriz_osrm(matriz)
    if not valido:
        print(json.dumps({"erro": mensagem_erro}))
        sys.exit(1)

    # 0. Ordem Original (Linha de base sem otimização)
    r_orig, d_orig = ordem_original(matriz, eh_circuito_fechado)

    # 1. Vizinho Mais Próximo
    r_nn, d_nn = vizinho_mais_proximo(matriz, eh_circuito_fechado)

    # 2. 2-Opt
    r_2opt, d_2opt = dois_opt(r_nn, matriz, eh_circuito_fechado)

    # 3. Simulated Annealing
    r_sa, d_sa = simulated_annealing(matriz, eh_circuito_fechado)

    resultado = {
        "circuito_fechado": eh_circuito_fechado,
        "metodos": {
            "original": {
                "nome": "Ordem Original",
                "rota": r_orig,
                "distancia_km": round(d_orig / 1000, 2),
                "descricao": "Sequência original dos pontos digitada pelo usuário sem otimização.",
            },
            "nn": {
                "nome": "Vizinho Mais Próximo",
                "rota": r_nn,
                "distancia_km": round(d_nn / 1000, 2),
                "descricao": "Escolhe a parada mais perto a cada passo. Rápida, mas simples.",
            },
            "opt2": {
                "nome": "2-Opt (Busca Local)",
                "rota": r_2opt,
                "distancia_km": round(d_2opt / 1000, 2),
                "descricao": "Corrige e descruza caminhos para evitar ida e volta desnecessária.",
            },
            "sa": {
                "nome": "Simulated Annealing",
                "rota": r_sa,
                "distancia_km": round(d_sa / 1000, 2),
                "descricao": "Testa combinações mais inteligentes para encontrar o menor trajeto global.",
            },
        },
    }

    print(json.dumps(resultado, indent=2))