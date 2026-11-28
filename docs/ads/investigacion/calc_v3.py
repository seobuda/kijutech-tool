import math, random
from math import lgamma, exp, log, comb

# ---------- Beta regularizada (fraccion continua de Lentz) ----------
def betacf(a, b, x):
    MAXIT, EPS, FPMIN = 500, 3e-14, 1e-300
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c, d = 1.0, 1.0 - qab * x / qap
    if abs(d) < FPMIN: d = FPMIN
    d = 1.0 / d
    h = d
    for m in range(1, MAXIT + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < FPMIN: d = FPMIN
        c = 1.0 + aa / c
        if abs(c) < FPMIN: c = FPMIN
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < FPMIN: d = FPMIN
        c = 1.0 + aa / c
        if abs(c) < FPMIN: c = FPMIN
        d = 1.0 / d
        de = d * c
        h *= de
        if abs(de - 1.0) < EPS: break
    return h

def betai(a, b, x):
    if x <= 0: return 0.0
    if x >= 1: return 1.0
    bt = exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * log(x) + b * log(1.0 - x))
    if x < (a + 1.0) / (a + b + 2.0):
        return bt * betacf(a, b, x) / a
    return 1.0 - bt * betacf(b, a, 1.0 - x) / b

CPC, CPL = 2.0, 40.0
CRT = CPC / CPL  # 5 %

def post(mu, m, n, c):
    return m * mu + c, m * (1 - mu) + n - c

def p_meets(mu, m, n, c):          # P(CR >= CR*)
    a, b = post(mu, m, n, c)
    return 1 - betai(a, b, CRT)

def p_bad_margin(mu, m, n, c, k=1.5):   # P(CPA > k*CPL) = P(CR < CR*/k)
    a, b = post(mu, m, n, c)
    return betai(a, b, CRT / k)

def losses(mu, m, n, c):
    # por clic, valorando el lead al CPL maximo
    a, b = post(mu, m, n, c)
    mean = a / (a + b)
    I0 = betai(a, b, CRT)
    I1 = betai(a + 1, b, CRT)
    over = CPL * (mean * (1 - I1) - CRT * (1 - I0))      # E[(CR*V - CPC)+]
    under = CPL * (CRT * I0 - mean * I1)                 # E[(CPC - CR*V)+]
    return under, over

def binom_pmf(n, p):
    return [comb(n, k) * p**k * (1 - p)**(n - k) for k in range(n + 1)]

def run(rule, true_cr, clicks_week, weeks=52, looks=None):
    """DP exacta. rule(n, c) -> True si negativiza. looks: funcion(week, n) -> bool si se mira."""
    pmf = binom_pmf(clicks_week, true_cr)
    state = {0: 1.0}
    cut_by_week = []
    cache = {}
    for w in range(1, weeks + 1):
        new = {}
        for c, pr in state.items():
            for k, pk in enumerate(pmf):
                if pk < 1e-15: continue
                new[c + k] = new.get(c + k, 0.0) + pr * pk
        n = w * clicks_week
        cut = 0.0
        if looks is None or looks(w, n):
            for c in list(new.keys()):
                key = (n, c)
                if key not in cache: cache[key] = rule(n, c)
                if cache[key]:
                    cut += new.pop(c)
        cut_by_week.append(cut)
        state = new
    total = sum(cut_by_week)
    med = None
    if total > 0:
        acc = 0.0
        for w, x in enumerate(cut_by_week, 1):
            acc += x
            if acc >= total / 2:
                med = w * clicks_week * CPC
                break
    return total, med

def old_rule(mu, m):
    return lambda n, c: p_meets(mu, m, n, c) < 0.10

def new_rule(mu, m, pthr=0.9, k=1.5, min_spend_x=2.0, n4=None, n26=None, use_loss=True, cw=10):
    def r(n, c):
        if n * CPC < min_spend_x * CPL: return False
        if p_bad_margin(mu, m, n, c, k) <= pthr: return False
        if use_loss:
            under, over = losses(mu, m, n, c)
            if not (4 * cw * under > 26 * cw * over): return False
        return True
    return r

print("== A. Foto fija (prior Beta(2,48)): tabla antigua y nueva ==")
for (n, c) in [(0, 0), (30, 0), (40, 0), (45, 0), (60, 0), (90, 0), (120, 0), (30, 1), (60, 1), (120, 1), (150, 1), (200, 2), (10, 3)]:
    a, b = post(0.04, 50, n, c)
    u, o = losses(0.04, 50, n, c)
    print(f"n={n:3d} c={c} gasto={n*CPC:5.0f} media={a/(a+b)*100:4.1f}% P(cumple)={p_meets(0.04,50,n,c)*100:5.1f}% P(CPA>1.5x)={p_bad_margin(0.04,50,n,c)*100:5.1f}% perdida4sem(10cl/sem)={40*u:5.2f} perdida26sem={260*o:5.2f}")

print("\n== B. Regla antigua P(cumple)<10%, mirada semanal, 52 semanas ==")
for cw in (10, 5):
    for cr in (0.05, 0.07, 0.03):
        t, med = run(old_rule(0.04, 50), cr, cw)
        print(f"clics/sem={cw} CR={cr:.2f} P(neg)={t*100:5.1f}% gasto mediano={med}")

print("\n== C. Regla nueva, variantes ==")
def show(label, mk, crs=(0.05, 0.07, 0.04, 0.03, 0.02, 0.01, 0.0), cws=(10, 5, 20), looks=None):
    print(label)
    for cw in cws:
        row = []
        for cr in crs:
            t, med = run(mk(cw), cr, cw, looks=looks)
            row.append(f"CR={cr*100:.0f}%: {t*100:5.1f}% ({med})")
        print(f"  {cw:2d} clics/sem | " + " | ".join(row))

show("C1 prior 4%, margen 1.5, P>0.9, gasto>=2x, con perdida esperada", lambda cw: new_rule(0.04, 50, cw=cw))
show("C2 igual sin perdida esperada", lambda cw: new_rule(0.04, 50, use_loss=False, cw=cw))
show("C3 prior 5% (en objetivo)", lambda cw: new_rule(0.05, 50, cw=cw))
show("C4 prior 4%, P>0.95", lambda cw: new_rule(0.04, 50, pthr=0.95, cw=cw))
show("C5 prior 4%, gasto>=3x", lambda cw: new_rule(0.04, 50, min_spend_x=3.0, cw=cw))
show("C6 prior 4%, margen 2", lambda cw: new_rule(0.04, 50, k=2.0, cw=cw))
show("C7 prior 8% (media sector)", lambda cw: new_rule(0.08, 50, cw=cw))
show("C8 prior 4%, m=20", lambda cw: new_rule(0.04, 20, cw=cw))
show("C9 prior 4%, P>0.95, gasto>=3x", lambda cw: new_rule(0.04, 50, pthr=0.95, min_spend_x=3.0, cw=cw))

# miradas solo en hitos de gasto (2x,3x,4x,6x,8x,12x,16x CPL)
def milestone_looks(cw):
    ms = [2, 3, 4, 6, 8, 12, 16, 24, 32, 48]
    weeks = set()
    for x in ms:
        weeks.add(math.ceil(x * CPL / CPC / cw))
    return lambda w, n: w in weeks
for cw in (10, 5, 20):
    row = []
    for cr in (0.05, 0.07, 0.04, 0.03, 0.02, 0.01, 0.0):
        t, med = run(new_rule(0.04, 50, cw=cw), cr, cw, looks=milestone_looks(cw))
        row.append(f"CR={cr*100:.0f}%: {t*100:5.1f}% ({med})")
    print(f"C10 hitos de gasto, {cw} clics/sem | " + " | ".join(row))

print("\n== D. k=3 de oficio (gasto >= 3xCPL sin ninguna conversion en la vida del termino) ==")
for cw in (10, 5, 20):
    row = []
    for cr in (0.05, 0.07, 0.04, 0.03, 0.02, 0.01, 0.0):
        t, med = run(lambda n, c: c == 0 and n * CPC >= 3 * CPL, cr, cw)
        row.append(f"CR={cr*100:.0f}%: {t*100:5.1f}% ({med})")
    print(f"  {cw} clics/sem | " + " | ".join(row))

print("\n== E. Poisson y binomial negativa: P(0 en N dias) ==")
def nb0(mu, k): return (k / (k + mu)) ** k
def days_needed(lam, alpha, k=None):
    N = 1
    while True:
        p = exp(-lam * N) if k is None else nb0(lam * N, k)
        if p < alpha: return N
        N += 1
for lam in (3, 2, 1.5, 1, 0.5, 0.2):
    print(f"lam={lam}: Poisson P0(2d)={exp(-2*lam)*100:5.1f} P0(3d)={exp(-3*lam)*100:5.1f} | k=5 P0(3d)={nb0(3*lam,5)*100:5.1f} | k=2 P0(3d)={nb0(3*lam,2)*100:5.1f} | k=1 P0(3d)={nb0(3*lam,1)*100:5.1f} || dias a5%: P={days_needed(lam,.05)} k5={days_needed(lam,.05,5)} k2={days_needed(lam,.05,2)} k1={days_needed(lam,.05,1)} | a2%: P={days_needed(lam,.02)} k5={days_needed(lam,.02,5)} k2={days_needed(lam,.02,2)}")

print("\n== F. P(al menos una racha de 3 dias a cero en 30 dias), dias independientes ==")
def run_prob(p0, days=30, L=3):
    # estados: racha actual 0..L-1 ; absorbente al llegar a L
    st = [1.0] + [0.0] * (L - 1)
    hit = 0.0
    for _ in range(days):
        ns = [0.0] * L
        for r, pr in enumerate(st):
            ns[0] += pr * (1 - p0)
            if r + 1 == L: hit += pr * p0
            else: ns[r + 1] += pr * p0
        st = ns
    return hit
for lam in (3, 2, 1.5, 1, 0.5, 0.2):
    pp = exp(-lam)
    print(f"lam={lam}: Poisson {run_prob(pp)*100:5.1f}% | NB diaria k=2 {run_prob(nb0(lam,2))*100:5.1f}% | al anio (365d) Poisson {run_prob(pp,365)*100:5.1f}% ; rachas esperadas/anio aprox {12*run_prob(pp):.1f}")

print("\n== G. Racha de 3xCPA sin conversion en un anio (proceso de Poisson en gasto) ==")
random.seed(7)
def gap_prob(N, k=3.0, reps=200000):
    hit = 0
    for _ in range(reps):
        t, ok = 0.0, False
        while True:
            g = random.expovariate(1.0)
            if t + g >= N:
                if N - t >= k: ok = True
                break
            if g >= k: ok = True; break
            t += g
        hit += ok
    return hit / reps
print("12 conv/anio:", gap_prob(12), " 30 conv/anio:", gap_prob(30))

print("\n== H. Ejemplo 4.7: mu=4.5 ==")
print("Poisson", exp(-4.5), "NB k=2", nb0(4.5, 2), "NB k=5", nb0(4.5, 5))
print("\n== I. Falsas alarmas: 2% por campania y dia, 100 campanias ==", 0.02 * 100 * 7, "a la semana")
