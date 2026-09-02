import json
import math
import random
import sys
import time
import urllib.request


def obter_matriz_osrm(pontos):
    coords_str = ";".join([f"{p['lng']},{p['lat']}" for p in pontos])
    url = f"http://router.project-osrm.org/table/v1/driving/{coords_str}?annotations=distance"
    req = urllib.request.Request(
        url, headers={"User-Agent": "ProjetoTCC-TSP/1.0"}
    )
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode()).get("distances")
    except Exception as e:
        print(json.dumps({"erro": f"Erro OSRM: {str(e)}"}), file=sys.stderr)
        sys.exit(1)


def validar_matriz_osrm(matriz):
    if not matriz:
        return False, "Matriz vazia."
    for row in matriz:
        for val in row:
            if val is None or val < 0:
                return False, "Falha de rota em alguns pontos."
    return True, "OK"


def calcular_distancia_total(rota, matriz, eh_circuito_fechado=True):
    distancia = 0
    for i in range(len(rota) - 1):
        distancia += matriz[rota[i]][rota[i + 1]]
    if eh_circuito_fechado and len(rota) > 1:
        distancia += matriz[rota[-1]][rota[0]]
    return distancia


def ordem_original(matriz, eh_circuito_fechado):
    t0 = time.perf_counter() # 👈 Alterado para perf_counter
    rota = list(range(len(matriz)))
    dist = calcular_distancia_total(rota, matriz, eh_circuito_fechado)
    dt = (time.perf_counter() - t0) * 1000
    return rota, dist, round(dt, 2)


def vizinho_mais_proximo_interno(matriz, eh_circuito_fechado):
    t0 = time.perf_counter() # 👈 Alterado para perf_counter
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
    dt = (time.perf_counter() - t0) * 1000
    return rota, dist, round(dt, 2)


def dois_opt(rota_inicial, matriz, eh_circuito_fechado):
    t0 = time.perf_counter() # 👈 Alterado para perf_counter
    melhor_rota = rota_inicial[:]
    melhor_dist = calcular_distancia_total(
        melhor_rota, matriz, eh_circuito_fechado
    )
    melhorou = True
    iteracoes = 0

    while melhorou:
        melhorou = False
        iteracoes += 1
        for i in range(1, len(melhor_rota) - 1):
            for j in range(i + 1, len(melhor_rota)):
                nova_rota = (
                    melhor_rota[:i]
                    + melhor_rota[i : j + 1][::-1]
                    + melhor_rota[j + 1 :]
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

    dt = (time.perf_counter() - t0) * 1000
    return melhor_rota, melhor_dist, round(dt, 2), iteracoes


def simulated_annealing(
    matriz,
    eh_circuito_fechado,
    rota_inicial=None,
    tipo_parada="iteracoes_sem_melhoria",
    valor_parada=1500,
):
    t0 = time.perf_counter() # 👈 Alterado para perf_counter
    n = len(matriz)

    if rota_inicial is None:
        solucao_atual = list(range(n))
    else:
        solucao_atual = rota_inicial[:]

    dist_atual = calcular_distancia_total(
        solucao_atual, matriz, eh_circuito_fechado
    )
    melhor_solucao = solucao_atual[:]
    melhor_dist = dist_atual

    temp = dist_atual * 0.2 if dist_atual > 0 else 10000.0
    resfriamento = 0.995
    sem_melhoria = 0
    iteracoes = 0

    while temp > 0.01:
        dt_atual_sec = time.perf_counter() - t0

        if tipo_parada == "tempo" and dt_atual_sec >= valor_parada:
            break
        if (
            tipo_parada == "iteracoes_sem_melhoria"
            and sem_melhoria >= valor_parada
        ):
            break

        iteracoes += 1
        if n <= 2:
            break

        i, j = sorted(random.sample(range(1, n), 2))
        vizinho = (
            solucao_atual[:i]
            + solucao_atual[i : j + 1][::-1]
            + solucao_atual[j + 1 :]
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
                sem_melhoria = 0
            else:
                sem_melhoria += 1
        else:
            sem_melhoria += 1

        temp *= resfriamento

    dt = (time.perf_counter() - t0) * 1000
    return melhor_solucao, melhor_dist, round(dt, 2), iteracoes


def ant_colony_optimization(
    matriz,
    eh_circuito_fechado,
    tipo_parada="iteracoes_sem_melhoria",
    valor_parada=20,
):
    t0 = time.perf_counter() # 👈 Alterado para perf_counter
    n = len(matriz)
    if n <= 1:
        return list(range(n)), 0, 0, 0

    num_formigas = 10
    evaporacao = 0.5
    alpha = 1.0
    beta = 2.0
    q = 100.0

    feromonio = [[1.0 for _ in range(n)] for _ in range(n)]
    melhor_rota_global = None
    melhor_dist_global = float("inf")
    sem_melhoria = 0
    iteracoes = 0

    while True:
        dt_atual_sec = time.perf_counter() - t0

        if tipo_parada == "tempo" and dt_atual_sec >= valor_parada:
            break
        if (
            tipo_parada == "iteracoes_sem_melhoria"
            and sem_melhoria >= valor_parada
        ):
            break

        iteracoes += 1
        todas_rotas = []
        todas_distancias = []
        melhorou_nesta_iteracao = False

        for _ in range(num_formigas):
            rota = [0]
            nao_visitados = set(range(1, n))
            atual = 0

            while nao_visitados:
                probabilidades = []
                soma_probs = 0.0

                for proximo in nao_visitados:
                    dist = matriz[atual][proximo]
                    if dist == 0:
                        dist = 0.1
                    tau = feromonio[atual][proximo] ** alpha
                    eta = (1.0 / dist) ** beta
                    p = tau * eta
                    probabilidades.append((proximo, p))
                    soma_probs += p

                if soma_probs == 0:
                    proximo_no = random.choice(list(nao_visitados))
                else:
                    r = random.uniform(0, soma_probs)
                    acumulado = 0.0
                    proximo_no = list(nao_visitados)[-1]
                    for no, prob in probabilidades:
                        acumulado += prob
                        if acumulado >= r:
                            proximo_no = no
                            break

                rota.append(proximo_no)
                nao_visitados.remove(proximo_no)
                atual = proximo_no

            dist = calcular_distancia_total(rota, matriz, eh_circuito_fechado)
            todas_rotas.append(rota)
            todas_distancias.append(dist)

            if dist < melhor_dist_global:
                melhor_dist_global = dist
                melhor_rota_global = rota[:]
                melhorou_nesta_iteracao = True

        if melhorou_nesta_iteracao:
            sem_melhoria = 0
        else:
            sem_melhoria += 1

        for i in range(n):
            for j in range(n):
                feromonio[i][j] *= 1.0 - evaporacao

        for k in range(num_formigas):
            rota_k = todas_rotas[k]
            dist_k = todas_distancias[k]
            deposito = q / dist_k if dist_k > 0 else 0
            for i in range(len(rota_k) - 1):
                u, v = rota_k[i], rota_k[i + 1]
                feromonio[u][v] += deposito
                feromonio[v][u] += deposito

    dt = (time.perf_counter() - t0) * 1000
    return melhor_rota_global, melhor_dist_global, round(dt, 2), iteracoes


if __name__ == "__main__":
    payload = {}
    if len(sys.argv) > 1:
        try:
            payload = json.loads(sys.argv[1])
        except Exception:
            payload = {}

    pontos = payload.get("pontos", [])
    eh_circuito_fechado = payload.get("circuito_fechado", True)
    tipo_parada = payload.get("tipo_parada", "iteracoes_sem_melhoria")
    valor_parada = payload.get("valor_parada", 1500)

    if not pontos:
        pontos = [
            {"id": 0, "lat": -23.55052, "lng": -46.633308},
            {"id": 1, "lat": -23.55720, "lng": -46.660133},
            {"id": 2, "lat": -23.56141, "lng": -46.655881},
            {"id": 3, "lat": -23.54317, "lng": -46.636972},
            {"id": 4, "lat": -23.57088, "lng": -46.644331},
        ]

    matriz = obter_matriz_osrm(pontos)
    valido, msg = validar_matriz_osrm(matriz)
    if not valido:
        print(json.dumps({"erro": msg}))
        sys.exit(1)

    r_orig, d_orig, t_orig = ordem_original(matriz, eh_circuito_fechado)
    r_nn, d_nn, t_nn = vizinho_mais_proximo_interno(
        matriz, eh_circuito_fechado
    )
    r_2opt, d_2opt, t_2opt, it_2opt = dois_opt(
        r_nn, matriz, eh_circuito_fechado
    )
    r_sa, d_sa, t_sa, it_sa = simulated_annealing(
        matriz=matriz,
        eh_circuito_fechado=eh_circuito_fechado,
        rota_inicial=r_nn,
        tipo_parada=tipo_parada,
        valor_parada=valor_parada,
    )
    r_aco, d_aco, t_aco, it_aco = ant_colony_optimization(
        matriz, eh_circuito_fechado, tipo_parada, valor_parada
    )

    resultado = {
        "circuito_fechado": eh_circuito_fechado,
        "metodos": {
            "original": {
                "nome": "Ordem Original",
                "rota": r_orig,
                "distancia_km": round(d_orig / 1000, 2),
                "tempo_execucao_ms": t_orig,
                "iteracoes_realizadas": 1,
            },
            "nn": {
                "nome": "Vizinho Mais Próximo",
                "rota": r_nn,
                "distancia_km": round(d_nn / 1000, 2),
                "tempo_execucao_ms": t_nn,
                "iteracoes_realizadas": 1,
            },
            "opt2": {
                "nome": "2-Opt (Busca Local)",
                "rota": r_2opt,
                "distancia_km": round(d_2opt / 1000, 2),
                "tempo_execucao_ms": t_2opt,
                "iteracoes_realizadas": it_2opt,
            },
            "sa": {
                "nome": "Simulated Annealing",
                "rota": r_sa,
                "distancia_km": round(d_sa / 1000, 2),
                "tempo_execucao_ms": t_sa,
                "iteracoes_realizadas": it_sa,
            },
            "aco": {
                "nome": "Colônia de Formigas (ACO)",
                "rota": r_aco,
                "distancia_km": round(d_aco / 1000, 2),
                "tempo_execucao_ms": t_aco,
                "iteracoes_realizadas": it_aco,
            },
        },
    }

    print(json.dumps(resultado, indent=2))