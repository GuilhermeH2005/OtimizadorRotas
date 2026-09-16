import json
import math
import random
import sys
import time
import urllib.request


# ============================================================
# CONTADOR DE AVALIAÇÕES DA FUNÇÃO OBJETIVO
# ============================================================

class ContadorAvaliacoes:
    def __init__(self):
        self.total = 0

    def avaliar(self, rota, matriz, eh_circuito_fechado):
        self.total += 1
        return calcular_distancia_total(
            rota,
            matriz,
            eh_circuito_fechado
        )


# ============================================================
# DISTÂNCIA HAVERSINE
# ============================================================

def calcular_distancia_haversine(coord1, coord2):
    """
    Calcula a distância em metros entre duas coordenadas.
    """

    lat1, lon1 = coord1["lat"], coord1["lng"]
    lat2, lon2 = coord2["lat"], coord2["lng"]

    R = 6371000.0

    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = (
        math.sin(dlat / 2) ** 2
        +
        math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )

    c = 2 * math.atan2(
        math.sqrt(a),
        math.sqrt(1 - a)
    )

    return R * c


# ============================================================
# OSRM
# ============================================================

def obter_matriz_osrm(pontos):
    """
    Consulta o OSRM para instâncias de até 50 pontos.
    """

    coords_str = ";".join(
        f"{p['lng']},{p['lat']}"
        for p in pontos
    )

    url = (
        "http://router.project-osrm.org/"
        f"table/v1/driving/{coords_str}"
        "?annotations=distance"
    )

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "ProjetoTCC-TSP/1.0"
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            dados = json.loads(
                response.read().decode()
            )

            return dados.get("distances")

    except Exception as e:
        raise Exception(
            f"Erro OSRM: {str(e)}"
        )


# ============================================================
# MATRIZ DE DISTÂNCIAS
# ============================================================

def obter_matriz_haversine(pontos):
    n = len(pontos)

    matriz = [
        [0.0 for _ in range(n)]
        for _ in range(n)
    ]

    for i in range(n):
        for j in range(n):

            if i != j:
                matriz[i][j] = calcular_distancia_haversine(
                    pontos[i],
                    pontos[j]
                )

    return matriz


def obter_matriz_distancias(pontos):
    """
    Até 50 pontos:
        OSRM.

    Mais de 50:
        Haversine.

    Caso OSRM falhe:
        Haversine.
    """

    n = len(pontos)

    if n > 50:
        return obter_matriz_haversine(pontos)

    try:
        matriz = obter_matriz_osrm(pontos)

        if matriz is None:
            raise Exception(
                "OSRM não retornou a matriz."
            )

        return matriz

    except Exception:
        return obter_matriz_haversine(pontos)


def validar_matriz(matriz):
    if not matriz:
        return False, "Matriz vazia."

    n = len(matriz)

    if any(len(linha) != n for linha in matriz):
        return False, "Matriz de distâncias inválida."

    for linha in matriz:
        for valor in linha:

            if valor is None:
                return False, (
                    "Falha de rota em alguns pontos."
                )

            if valor < 0:
                return False, (
                    "Matriz contém distância negativa."
                )

    return True, "OK"


# ============================================================
# FUNÇÃO OBJETIVO
# ============================================================

def calcular_distancia_total(
    rota,
    matriz,
    eh_circuito_fechado=True
):
    distancia = 0.0

    for i in range(len(rota) - 1):
        distancia += matriz[
            rota[i]
        ][
            rota[i + 1]
        ]

    if (
        eh_circuito_fechado
        and len(rota) > 1
    ):
        distancia += matriz[
            rota[-1]
        ][
            rota[0]
        ]

    return distancia


# ============================================================
# ORDEM ORIGINAL
# ============================================================

def ordem_original(
    matriz,
    eh_circuito_fechado
):
    inicio = time.perf_counter()

    rota = list(range(len(matriz)))

    distancia = calcular_distancia_total(
        rota,
        matriz,
        eh_circuito_fechado
    )

    tempo = (
        time.perf_counter() - inicio
    ) * 1000

    return (
        rota,
        distancia,
        round(tempo, 2)
    )


# ============================================================
# VIZINHO MAIS PRÓXIMO
# ============================================================

def vizinho_mais_proximo_interno(
    matriz,
    eh_circuito_fechado
):
    inicio = time.perf_counter()

    n = len(matriz)

    nao_visitados = list(
        range(1, n)
    )

    rota = [0]

    atual = 0

    while nao_visitados:

        proximo = min(
            nao_visitados,
            key=lambda x: matriz[atual][x]
        )

        rota.append(proximo)

        nao_visitados.remove(
            proximo
        )

        atual = proximo

    distancia = calcular_distancia_total(
        rota,
        matriz,
        eh_circuito_fechado
    )

    tempo = (
        time.perf_counter() - inicio
    ) * 1000

    return (
        rota,
        distancia,
        round(tempo, 2)
    )


# ============================================================
# 2-OPT
# ============================================================

def opt2_local_search(
    matriz,
    eh_circuito_fechado,
    rota_inicial,
    modo_parada="classico",
    tempo_limite_s=10,
    max_iteracoes=1000
):
    """
    2-Opt com first-improvement.

    IMPORTANTE:

    M4 não representa candidatos avaliados.

    Uma iteração = um passe COMPLETO pela vizinhança.

    Durante o passe:

    - todos os candidatos são avaliados;
    - guardamos o primeiro candidato que melhora;
    - continuamos o passe inteiro;
    - ao final, aplicamos a primeira melhoria encontrada.

    No modo clássico:
        termina quando um passe inteiro não encontra melhoria.

    No modo tempo:
        continua até o orçamento terminar.

    Se o tempo acabar no meio de um passe:
        o passe incompleto não conta como iteração.
    """

    inicio = time.perf_counter()

    n = len(rota_inicial)

    contador = ContadorAvaliacoes()

    melhor_rota = rota_inicial[:]

    melhor_dist = contador.avaliar(
        melhor_rota,
        matriz,
        eh_circuito_fechado
    )

    iteracoes = 0

    while True:

        inicio_passe = time.perf_counter()

        rota_base = melhor_rota[:]

        distancia_base = melhor_dist

        primeira_melhoria = None

        # --------------------------------------------------------
        # VIZINHANÇA COMPLETA
        # --------------------------------------------------------

        for i in range(1, n - 1):

            for j in range(i + 1, n):

                # Critério por tempo
                if modo_parada == "tempo":

                    tempo_decorrido = (
                        time.perf_counter()
                        - inicio
                    )

                    if tempo_decorrido >= tempo_limite_s:

                        # Passe incompleto:
                        # NÃO conta como iteração.
                        tempo_total = (
                            time.perf_counter()
                            - inicio
                        ) * 1000

                        return (
                            melhor_rota,
                            melhor_dist,
                            round(tempo_total, 2),
                            iteracoes,
                            contador.total
                        )

                # Critério por número de iterações
                if modo_parada == "iteracoes":

                    if iteracoes >= max_iteracoes:

                        tempo_total = (
                            time.perf_counter()
                            - inicio
                        ) * 1000

                        return (
                            melhor_rota,
                            melhor_dist,
                            round(tempo_total, 2),
                            iteracoes,
                            contador.total
                        )

                nova_rota = (
                    rota_base[:i]
                    +
                    rota_base[i:j + 1][::-1]
                    +
                    rota_base[j + 1:]
                )

                nova_dist = contador.avaliar(
                    nova_rota,
                    matriz,
                    eh_circuito_fechado
                )

                if (
                    primeira_melhoria is None
                    and nova_dist < distancia_base
                ):
                    primeira_melhoria = (
                        nova_rota[:],
                        nova_dist
                    )

        # --------------------------------------------------------
        # PASSE COMPLETO
        # --------------------------------------------------------

        iteracoes += 1

        # Limite de iterações:
        # depois de completar o passe.
        if modo_parada == "iteracoes":
            if iteracoes >= max_iteracoes:

                if primeira_melhoria is not None:
                    melhor_rota = primeira_melhoria[0]
                    melhor_dist = primeira_melhoria[1]

                tempo_total = (
                    time.perf_counter()
                    - inicio
                ) * 1000

                return (
                    melhor_rota,
                    melhor_dist,
                    round(tempo_total, 2),
                    iteracoes,
                    contador.total
                )

        # --------------------------------------------------------
        # APLICA PRIMEIRA MELHORIA
        # --------------------------------------------------------

        if primeira_melhoria is None:

            # Nenhuma melhoria no passe completo.
            # No clássico, termina aqui.
            if modo_parada == "classico":

                tempo_total = (
                    time.perf_counter()
                    - inicio
                ) * 1000

                return (
                    melhor_rota,
                    melhor_dist,
                    round(tempo_total, 2),
                    iteracoes,
                    contador.total
                )

            # Em modo de tempo, a solução já está
            # em ótimo local, mas continuamos até o
            # orçamento de tempo.
            continue

        melhor_rota = primeira_melhoria[0]
        melhor_dist = primeira_melhoria[1]

        # Verificação após passe completo
        if modo_parada == "tempo":

            tempo_decorrido = (
                time.perf_counter()
                - inicio
            )

            if tempo_decorrido >= tempo_limite_s:

                tempo_total = (
                    time.perf_counter()
                    - inicio
                ) * 1000

                return (
                    melhor_rota,
                    melhor_dist,
                    round(tempo_total, 2),
                    iteracoes,
                    contador.total
                )


# ============================================================
# SIMULATED ANNEALING
# ============================================================

def simulated_annealing(
    matriz,
    eh_circuito_fechado,
    rota_inicial,
    modo_parada="classico",
    tempo_limite_s=10,
    max_iteracoes=10000
):
    inicio = time.perf_counter()
    n = len(rota_inicial)
    contador = ContadorAvaliacoes()

    solucao_atual = rota_inicial[:]
    distancia_atual = contador.avaliar(solucao_atual, matriz, eh_circuito_fechado)

    melhor_solucao = solucao_atual[:]
    melhor_dist = distancia_atual

    # Parâmetros exatos do artigo MMEP
    temperatura = 2000.0
    resfriamento = 0.95
    temperatura_minima = 1e-10
    max_rejeicoes_classico = 10000
    
    rejeicoes_consecutivas = 0
    iteracoes = 0

    if n <= 2:
        tempo_total = (time.perf_counter() - inicio) * 1000
        return melhor_solucao, melhor_dist, round(tempo_total, 2), iteracoes, contador.total

    while True:
        tempo_decorrido = time.perf_counter() - inicio

        # Critérios de parada
        if modo_parada == "tempo" and tempo_decorrido >= tempo_limite_s:
            break
        elif modo_parada == "iteracoes" and iteracoes >= max_iteracoes:
            break
        elif modo_parada == "classico":
            if rejeicoes_consecutivas >= max_rejeicoes_classico or temperatura <= temperatura_minima:
                break

        # Geração de Vizinho (2-Opt Swap)
        i, j = sorted(random.sample(range(1, n), 2))
        vizinho = solucao_atual[:i] + solucao_atual[i:j + 1][::-1] + solucao_atual[j + 1:]
        
        distancia_vizinho = contador.avaliar(vizinho, matriz, eh_circuito_fechado)
        iteracoes += 1
        delta = distancia_vizinho - distancia_atual

        # Aceitação Metropolis
        aceitar = False
        if delta < 0:
            aceitar = True
        else:
            expoente = -delta / max(temperatura, 1e-12)
            probabilidade = math.exp(max(expoente, -700))
            if random.random() < probabilidade:
                aceitar = True

        if aceitar:
            solucao_atual = vizinho[:]
            distancia_atual = distancia_vizinho
            
            if distancia_atual < melhor_dist:
                melhor_solucao = solucao_atual[:]
                melhor_dist = distancia_atual
                rejeicoes_consecutivas = 0
            else:
                rejeicoes_consecutivas += 1
        else:
            rejeicoes_consecutivas += 1

        # Resfriamento
        temperatura *= resfriamento

        if modo_parada == "tempo" and temperatura <= temperatura_minima:
            temperatura = max(2000.0, melhor_dist * 0.2)

    tempo_total = (time.perf_counter() - inicio) * 1000
    return melhor_solucao, melhor_dist, round(tempo_total, 2), iteracoes, contador.total


# ============================================================
# NÚMERO DE FORMIGAS
# ============================================================

def determinar_numero_formigas(n):

    if n < 50:
        return n

    if n < 70:
        return 50

    if n < 100:
        return 70

    return 100


# ============================================================
# ANT COLONY OPTIMIZATION
# ============================================================

def ant_colony_optimization(
    matriz,
    eh_circuito_fechado,
    modo_parada="classico",
    tempo_limite_s=10,
    max_iteracoes=100
):
    inicio = time.perf_counter()
    n = len(matriz)

    if n <= 1:
        return list(range(n)), 0.0, 0.0, 0, 0

    contador = ContadorAvaliacoes()
    num_formigas = determinar_numero_formigas(n)

    # Parâmetros Ótimos do Ant-Cycle (Dorigo et al., 1996)
    alfa = 1.0
    beta = 5.0
    evaporacao = 0.5
    Q = 100.0
    e_elitista = 8  # Peso da estratégia elitista (EAS)

    tau_0 = 1.0 / n
    feromonio = [[tau_0 for _ in range(n)] for _ in range(n)]

    melhor_rota = list(range(n))
    melhor_dist = contador.avaliar(melhor_rota, matriz, eh_circuito_fechado)

    ciclos = 0
    ultima_rota_todas_formigas = None

    while True:
        tempo_decorrido = time.perf_counter() - inicio

        # ====================================================
        # CRITÉRIOS DE PARADA (Atualizado com Trava de Segurança)
        # ====================================================
        if modo_parada == "tempo" and tempo_decorrido >= tempo_limite_s:
            break
        elif modo_parada == "iteracoes" and ciclos >= max_iteracoes:
            break
        elif modo_parada == "classico":
            # 1. Parada por estagnação (todas as formigas fizeram a mesma rota)
            if ultima_rota_todas_formigas:
                primeira = ultima_rota_todas_formigas[0]
                if all(rota == primeira for rota in ultima_rota_todas_formigas):
                    break
            
            # 2. Trava de segurança para problemas grandes (evita loop infinito)
            if ciclos >= 2500:
                break
        # ====================================================

        rotas_formigas = []
        distancias_formigas = []
        ciclo_completo = True

        for _ in range(num_formigas):
            if modo_parada == "tempo" and (time.perf_counter() - inicio) >= tempo_limite_s:
                ciclo_completo = False
                break

            rota = [0]
            nao_visitados = list(range(1, n))
            atual = 0

            while nao_visitados:
                probabilidades = []
                soma_probabilidades = 0.0

                for proximo in nao_visitados:
                    distancia = matriz[atual][proximo]
                    visibilidade = 1.0 / distancia if distancia > 0 else 1e10
                    tau = feromonio[atual][proximo]
                    
                    valor = (tau ** alfa) * (visibilidade ** beta)
                    probabilidades.append((proximo, valor))
                    soma_probabilidades += valor

                if soma_probabilidades > 0:
                    sorteio = random.uniform(0, soma_probabilidades)
                    acumulado = 0.0
                    proximo_escolhido = nao_visitados[-1]

                    for no, probabilidade in probabilidades:
                        acumulado += probabilidade
                        if acumulado >= sorteio:
                            proximo_escolhido = no
                            break
                else:
                    proximo_escolhido = random.choice(nao_visitados)

                rota.append(proximo_escolhido)
                nao_visitados.remove(proximo_escolhido)
                atual = proximo_escolhido

            distancia_rota = contador.avaliar(rota, matriz, eh_circuito_fechado)
            rotas_formigas.append(rota)
            distancias_formigas.append(distancia_rota)

            if distancia_rota < melhor_dist:
                melhor_dist = distancia_rota
                melhor_rota = rota[:]

        if not ciclo_completo:
            break

        ciclos += 1
        ultima_rota_todas_formigas = [rota[:] for rota in rotas_formigas]

        # Evaporação
        for i in range(n):
            for j in range(n):
                feromonio[i][j] *= (1.0 - evaporacao)

        # Depósito de Feromônio das Formigas
        for k in range(num_formigas):
            rota = rotas_formigas[k]
            distancia_rota = distancias_formigas[k]
            deposito = Q / max(distancia_rota, 1e-10)

            for i in range(len(rota) - 1):
                origem, destino = rota[i], rota[i + 1]
                feromonio[origem][destino] += deposito
                feromonio[destino][origem] += deposito  # Matriz simétrica
            
            if eh_circuito_fechado and len(rota) > 1:
                origem, destino = rota[-1], rota[0]
                feromonio[origem][destino] += deposito
                feromonio[destino][origem] += deposito

        # Reforço Elitista (EAS) - Deposita feromônio extra na melhor rota global
        if melhor_rota:
            deposito_elitista = (e_elitista * Q) / max(melhor_dist, 1e-10)
            for i in range(len(melhor_rota) - 1):
                origem, destino = melhor_rota[i], melhor_rota[i + 1]
                feromonio[origem][destino] += deposito_elitista
                feromonio[destino][origem] += deposito_elitista
            
            if eh_circuito_fechado and len(melhor_rota) > 1:
                origem, destino = melhor_rota[-1], melhor_rota[0]
                feromonio[origem][destino] += deposito_elitista
                feromonio[destino][origem] += deposito_elitista

    tempo_total = (time.perf_counter() - inicio) * 1000
    return melhor_rota, melhor_dist, round(tempo_total, 2), ciclos, contador.total


# ============================================================
# CONFIGURAÇÃO DA PARADA
# ============================================================

def configurar_parada(payload):
    """
    Converte os critérios enviados pelo frontend.

    E1 = clássico
    E2 = 10 segundos
    E3 = 30 segundos
    E4 = 60 segundos

    O modo 'iteracoes' continua existindo
    somente para a execução normal.
    """

    modo = str(
        payload.get(
            "modo_parada",
            payload.get(
                "tipo_parada",
                "classico"
            )
        )
    ).lower()

    # --------------------------------------------------------
    # E1
    # --------------------------------------------------------

    if modo in (
        "e1",
        "classico",
        "classica",
        "classic"
    ):

        return {
            "modo": "classico",
            "tempo": None,
            "iteracoes": None,
            "experimento": "E1"
        }

    # --------------------------------------------------------
    # E2
    # --------------------------------------------------------

    if modo in (
        "e2",
        "tempo_10",
        "10s",
        "10"
    ):

        return {
            "modo": "tempo",
            "tempo": 10,
            "iteracoes": None,
            "experimento": "E2"
        }

    # --------------------------------------------------------
    # E3
    # --------------------------------------------------------

    if modo in (
        "e3",
        "tempo_30",
        "30s",
        "30"
    ):

        return {
            "modo": "tempo",
            "tempo": 30,
            "iteracoes": None,
            "experimento": "E3"
        }

    # --------------------------------------------------------
    # E4
    # --------------------------------------------------------

    if modo in (
        "e4",
        "tempo_60",
        "60s",
        "60"
    ):

        return {
            "modo": "tempo",
            "tempo": 60,
            "iteracoes": None,
            "experimento": "E4"
        }

    # --------------------------------------------------------
    # EXECUÇÃO NORMAL POR ITERAÇÕES
    # --------------------------------------------------------

    if modo in (
        "iteracoes",
        "numero_iteracoes",
        "n_iteracoes"
    ):

        valor = payload.get(
            "max_iteracoes",
            100
        )

        try:
            valor = int(valor)
        except Exception:
            valor = 100

        if valor < 1:
            valor = 1

        return {
            "modo": "iteracoes",
            "tempo": None,
            "iteracoes": valor,
            "experimento": None
        }

    # --------------------------------------------------------
    # COMPATIBILIDADE COM TEMPO GENÉRICO
    # --------------------------------------------------------

    if modo == "tempo":

        valor = payload.get(
            "tempo_limite_s",
            10
        )

        try:
            valor = float(valor)
        except Exception:
            valor = 10

        if valor <= 0:
            valor = 10

        return {
            "modo": "tempo",
            "tempo": valor,
            "iteracoes": None,
            "experimento": None
        }

    # Padrão
    return {
        "modo": "classico",
        "tempo": None,
        "iteracoes": None,
        "experimento": "E1"
    }


# ============================================================
# EXECUÇÃO PRINCIPAL
# ============================================================

if __name__ == "__main__":

    payload = {}

    if len(sys.argv) > 1:

        try:
            payload = json.loads(
                sys.argv[1]
            )

        except Exception as erro:

            print(
                json.dumps({
                    "erro": (
                        "JSON inválido: "
                        f"{str(erro)}"
                    )
                }),
                file=sys.stderr
            )

            sys.exit(1)

    pontos = payload.get(
        "pontos",
        []
    )

    eh_circuito_fechado = bool(
        payload.get(
            "circuito_fechado",
            True
        )
    )

    if len(pontos) < 3:

        print(
            json.dumps({
                "erro": (
                    "É necessário informar "
                    "pelo menos 3 pontos."
                )
            }),
            file=sys.stderr
        )

        sys.exit(1)

    # --------------------------------------------------------
    # CONFIGURA PARADA
    # --------------------------------------------------------

    parada = configurar_parada(
        payload
    )

    modo_parada = parada["modo"]

    tempo_limite_s = (
        parada["tempo"]
        if parada["tempo"] is not None
        else 10
    )

    max_iteracoes = (
        parada["iteracoes"]
        if parada["iteracoes"] is not None
        else 10000
    )

    # --------------------------------------------------------
    # MATRIZ
    # --------------------------------------------------------

    try:

        matriz = obter_matriz_distancias(
            pontos
        )

    except Exception as erro:

        print(
            json.dumps({
                "erro": str(erro)
            }),
            file=sys.stderr
        )

        sys.exit(1)

    valido, mensagem = validar_matriz(
        matriz
    )

    if not valido:

        print(
            json.dumps({
                "erro": mensagem
            }),
            file=sys.stderr
        )

        sys.exit(1)

    # ========================================================
    # ORDEM ORIGINAL
    # ========================================================

    (
        r_orig,
        d_orig,
        t_orig
    ) = ordem_original(
        matriz,
        eh_circuito_fechado
    )

    # ========================================================
    # VIZINHO MAIS PRÓXIMO
    # ========================================================

    (
        r_nn,
        d_nn,
        t_nn
    ) = vizinho_mais_proximo_interno(
        matriz,
        eh_circuito_fechado
    )

    # ========================================================
    # 2-OPT
    # ========================================================

    (
        r_2opt,
        d_2opt,
        t_2opt,
        it_2opt,
        av_2opt
    ) = opt2_local_search(
        matriz=matriz,
        eh_circuito_fechado=eh_circuito_fechado,
        rota_inicial=r_nn,
        modo_parada=modo_parada,
        tempo_limite_s=tempo_limite_s,
        max_iteracoes=max_iteracoes
    )

    # ========================================================
    # SIMULATED ANNEALING
    # ========================================================

    (
        r_sa,
        d_sa,
        t_sa,
        it_sa,
        av_sa
    ) = simulated_annealing(
        matriz=matriz,
        eh_circuito_fechado=eh_circuito_fechado,
        rota_inicial=r_nn,
        modo_parada=modo_parada,
        tempo_limite_s=tempo_limite_s,
        max_iteracoes=max_iteracoes
    )

    # ========================================================
    # ACO
    # ========================================================

    (
        r_aco,
        d_aco,
        t_aco,
        it_aco,
        av_aco
    ) = ant_colony_optimization(
        matriz=matriz,
        eh_circuito_fechado=eh_circuito_fechado,
        modo_parada=modo_parada,
        tempo_limite_s=tempo_limite_s,
        max_iteracoes=max_iteracoes
    )

    # ========================================================
    # RESULTADO
    # ========================================================

    resultado = {

        "circuito_fechado":
            eh_circuito_fechado,

        "criterio_parada": {
            "experimento":
                parada["experimento"],

            "modo":
                modo_parada,

            "tempo_limite_s":
                parada["tempo"],

            "max_iteracoes":
                parada["iteracoes"]
        },

        "metodos": {

            "original": {
                "nome":
                    "Ordem Original",

                "rota":
                    r_orig,

                "distancia_km":
                    round(
                        d_orig / 1000,
                        2
                    ),

                "tempo_execucao_ms":
                    t_orig,

                "iteracoes_realizadas":
                    1,

                "avaliacoes":
                    1
            },

            "nn": {
                "nome":
                    "Vizinho Mais Próximo",

                "rota":
                    r_nn,

                "distancia_km":
                    round(
                        d_nn / 1000,
                        2
                    ),

                "tempo_execucao_ms":
                    t_nn,

                "iteracoes_realizadas":
                    1,

                "avaliacoes":
                    1
            },

            "opt2": {
                "nome":
                    "2-Opt (Busca Local)",

                "rota":
                    r_2opt,

                "distancia_km":
                    round(
                        d_2opt / 1000,
                        2
                    ),

                "tempo_execucao_ms":
                    t_2opt,

                "iteracoes_realizadas":
                    it_2opt,

                "avaliacoes":
                    av_2opt
            },

            "sa": {
                "nome":
                    "Simulated Annealing",

                "rota":
                    r_sa,

                "distancia_km":
                    round(
                        d_sa / 1000,
                        2
                    ),

                "tempo_execucao_ms":
                    t_sa,

                "iteracoes_realizadas":
                    it_sa,

                "avaliacoes":
                    av_sa
            },

            "aco": {
                "nome":
                    "Colônia de Formigas (ACO)",

                "rota":
                    r_aco,

                "distancia_km":
                    round(
                        d_aco / 1000,
                        2
                    ),

                "tempo_execucao_ms":
                    t_aco,

                "iteracoes_realizadas":
                    it_aco,

                "avaliacoes":
                    av_aco
            }
        }
    }

    print(
        json.dumps(
            resultado,
            indent=2,
            ensure_ascii=False
        )
    )