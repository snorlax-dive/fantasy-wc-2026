# Dry-run of the Fantasy WC points system on REAL 2022 World Cup results.
# Grounded in real data: scores, goalscorers (per match), clean sheets, knockout progression.
# Modeled: a league of 16 managers across skill tiers (predictions, squad picks, captain, bracket).
# Goal: test the SCORING DESIGN -> column balance, competitiveness, skill-vs-luck, when it's decided.

import json, random, math, statistics as st
random.seed(7)

D = json.load(open('wc2022.json', encoding='utf-8'))
M = D['matches']

# ---------- 1. PARSE THE REAL WORLD ----------
def ftgoals(m):
    s = m['score']['ft']; return s[0], s[1]

teams = []
for m in M:
    for t in (m['team1'], m['team2']):
        if t not in teams: teams.append(t)

# which squad-round does a match belong to (rehaul cadence: group, then each KO round)
def round_bucket(m):
    r = m['round']
    if r.startswith('Matchday'): return 'GROUP'
    if r == 'Round of 16': return 'R16'
    if r == 'Quarter-finals': return 'QF'
    if r == 'Semi-finals': return 'SF'
    return 'FINAL'          # final + 3rd place
ROUNDS = ['GROUP','R16','QF','SF','FINAL']

# deepest KO round each team reached (for the bracket game) + champion + golden boot
order = {'GROUP':0,'R16':1,'QF':2,'SF':3,'FINAL':4}
deepest = {t:0 for t in teams}
for m in M:
    b = order[round_bucket(m)]
    for t in (m['team1'], m['team2']):
        deepest[t] = max(deepest[t], b)
final_m = [m for m in M if m['round']=='Final'][0]
fa,fb = ftgoals(final_m)
# champion via final (incl. pens)
fs = final_m['score']
def winner(m):
    s=m['score']
    if 'p' in s: return m['team1'] if s['p'][0]>s['p'][1] else m['team2']
    a,b = (s.get('et') or s['ft']); return m['team1'] if a>b else (m['team2'] if b>a else None)
CHAMPION = winner(final_m)
reached_R16   = [t for t in teams if deepest[t]>=1]
reached_QF    = [t for t in teams if deepest[t]>=2]
reached_SF    = [t for t in teams if deepest[t]>=3]
reached_FINAL = [t for t,m2 in [(final_m['team1'],0),(final_m['team2'],0)]]

# real goals per team -> golden boot
scorer_goals = {}
for m in M:
    for g in m.get('goals1',[])+m.get('goals2',[]):
        if g.get('og'): continue
        scorer_goals[g['name']] = scorer_goals.get(g['name'],0)+1
GOLDEN_BOOT = max(scorer_goals, key=scorer_goals.get)
total_goals = sum(scorer_goals.values())

# ---------- 2. BUILD A PLAYER UNIVERSE, ground goals in real per-match team output ----------
# pre-tournament strength prior (known BEFORE 2022 -> legitimate skill signal, not lookahead)
HIGH={'Brazil','France','Argentina','England','Spain','Belgium','Portugal','Netherlands','Germany'}
MIDH={'Denmark','Croatia','Uruguay','Switzerland','United States','Senegal','Mexico','Serbia'}
MID ={'Poland','Wales','Japan','Korea Republic','Morocco','Cameroon','Ecuador','Ghana','Tunisia'}
def strength(t):
    if t in HIGH: return 0.9
    if t in MIDH: return 0.7
    if t in MID:  return 0.55
    return 0.4
FORM = [('GK',1),('DEF',4),('MID',3),('FWD',3)]   # 11-a-side
ATT_W = {'GK':0.0,'DEF':0.5,'MID':2.0,'FWD':3.0}
PRICE_BASE = {'GK':5,'DEF':5,'MID':6,'FWD':7}

players = []   # each: id, team, pos, price, reputation
pid=0
for t in teams:
    for pos,n in FORM:
        for k in range(n):
            rep = random.random()                       # within-team pecking order
            price = PRICE_BASE[pos] + strength(t)*4 + rep*ATT_W[pos]
            players.append(dict(id=pid,team=t,pos=pos,price=round(price,1),rep=rep))
            pid+=1
by_team = {t:[p for p in players if p['team']==t] for t in teams}

# assign every REAL goal to a universe player of the scoring team (weighted by attack rep)
goals_by = {p['id']:0 for p in players}                  # per-round goals
pr_goals = {p['id']:{r:0 for r in ROUNDS} for p in players}
appear   = {p['id']:{r:0 for r in ROUNDS} for p in players}
cleansht = {p['id']:{r:0 for r in ROUNDS} for p in players}
for m in M:
    rb = round_bucket(m); a,b = ftgoals(m)
    for side,(tg,opp) in [( 'team1',(a,b)),('team2',(b,a))]:
        t = m[side]; squad = by_team[t]
        for p in squad:                                  # assume the 11 are starters
            appear[p['id']][rb]+=1
            if opp==0 and p['pos'] in ('GK','DEF'): cleansht[p['id']][rb]+=1
        atk = [p for p in squad if p['pos'] in ('MID','FWD','DEF')]
        wts = [ATT_W[p['pos']]*(0.4+p['rep']) for p in atk]
        gl = m.get('goals1',[]) if side=='team1' else m.get('goals2',[])
        for g in gl:
            if g.get('og'): continue
            sc = random.choices(atk, weights=wts)[0]
            pr_goals[sc['id']][rb]+=1; goals_by[sc['id']]+=1

GOAL_PTS={'GK':6,'DEF':6,'MID':5,'FWD':4}
def player_round_points(p, r):
    pts = appear[p['id']][r]*2
    pts += cleansht[p['id']][r]*(4 if p['pos'] in('GK','DEF') else 0)
    pts += pr_goals[p['id']][r]*GOAL_PTS[p['pos']]
    return pts

# ---------- 3. MODELED MANAGERS ----------
N_MGR=16; BUDGET=100.0
def binom(n,p):                                          # normal-approx binomial (numpy-free)
    if n<=0 or p<=0: return 0
    if p>=1: return n
    if n*p<6 and n*p*(1-p)<6:
        return sum(1 for _ in range(n) if random.random()<p)
    v=random.gauss(n*p, math.sqrt(n*p*(1-p)))
    return max(0,min(n,int(round(v))))

def pick_squad(skill, alive):
    """pick 11 under budget from alive teams; sharper managers estimate EV with less noise."""
    pool=[p for p in players if p['team'] in alive]
    chosen=[]; spend=0.0
    for pos,n in FORM:
        cand=[p for p in pool if p['pos']==pos]
        # EV proxy known pre-round: team strength + attack role (NOT real outcome) + skill-scaled noise
        def val(p):
            base = strength(p['team'])*ATT_W.get(p['pos'],1) + strength(p['team'])
            return base + random.gauss(0,(1-skill)*1.3)
        cand.sort(key=val, reverse=True)
        got=0
        for p in cand:
            if got>=n: break
            # crude budget guard so we don't blow the cap on early slots
            if spend+p['price'] <= BUDGET-(sum(nn for _,nn in FORM)-(len(chosen)+1))*5.0+ (n-got-1)*0 +30:
                chosen.append(p); spend+=p['price']; got+=1
        while got<n:                                     # fill if budget squeezed
            p=min((x for x in cand if x not in chosen), key=lambda x:x['price'])
            chosen.append(p); spend+=p['price']; got+=1
    return chosen

def captain(squad, skill):
    return max(squad, key=lambda p: strength(p['team'])*ATT_W.get(p['pos'],1)+random.gauss(0,(1-skill)*1.2))

def predictions_total(skill):
    p_exact=0.07+0.13*skill; p_gd=0.16+0.16*skill; p_ro=0.20+0.14*skill   # exact / gd / result-only
    n_ex=binom(64,p_exact); rem=64-n_ex
    n_gd=binom(rem,p_gd); rem2=rem-n_gd
    n_ro=binom(rem2,p_ro)
    pts=n_ex*5+n_gd*3+n_ro*2
    pts+=binom(128,0.16+0.17*skill)*2                    # 2 anytime-scorer picks/match
    # red-card yes/no: ~6% of matches have a red; sharp managers call a few "yes"
    yes_calls=binom(64,0.12); pts+=binom(yes_calls,0.18+0.2*skill)*4 + binom(64-yes_calls,0.55)*1
    pts+=binom(5,0.3+0.3*skill)*3                        # ~banker bonus across 5 stages
    return pts

def bracket_total(skill):
    pts=0
    for teamset,pp in [(reached_R16,1),(reached_QF,2),(reached_SF,4),(reached_FINAL,8)]:
        for t in teamset:
            if random.random() < min(0.95,(0.32+0.5*skill)*(0.45+0.55*strength(t))): pts+=pp
    if random.random() < 0.15+0.4*skill: pts+=15         # champion
    if random.random() < 0.12+0.33*skill: pts+=10        # golden boot
    return pts

# ---------- 4. RUN MANY LEAGUES ----------
LEAGUES=2000
# fixed skill ladder for the 16 seats (seat 0 sharpest) + small per-league jitter
base_skill=[0.92-0.72*(i/(N_MGR-1)) for i in range(N_MGR)]

col_pred=[]; col_fan=[]; col_brk=[]; finals=[]
gap_1_2=[]; gap_1_med=[]; gap_1_last=[]
grp_leader_wins=0; champ_was_grp_leader=0
skill_rank_corr=[]; sharp_wins=0; sharp_top3=0
lead_changes=[]

for L in range(LEAGUES):
    skills=[max(0.05,min(0.97, s+random.gauss(0,0.05))) for s in base_skill]
    # per-manager pieces
    pred=[predictions_total(s) for s in skills]
    brk =[bracket_total(s) for s in skills]
    # fantasy per round (need ownership for differential -> pick all first)
    squads={}; caps={}
    alive_by_round={'GROUP':set(teams),
                    'R16':set(reached_R16),'QF':set(reached_QF),
                    'SF':set(reached_SF),'FINAL':set(reached_FINAL)}
    for r in ROUNDS:
        alive=alive_by_round[r]
        squads[r]=[pick_squad(skills[i],alive) for i in range(N_MGR)]
        caps[r]  =[captain(squads[r][i],skills[i]) for i in range(N_MGR)]
    fan=[0.0]*N_MGR
    cum_after_group=[0.0]*N_MGR
    cum_running=[0.0]*N_MGR
    leader_seq=[]
    for ri,r in enumerate(ROUNDS):
        own={}
        for i in range(N_MGR):
            for p in squads[r][i]: own[p['id']]=own.get(p['id'],0)+1
        for i in range(N_MGR):
            rp=0.0
            for p in squads[r][i]:
                pp=player_round_points(p,r)
                rp+=pp
                if p['id']==caps[r][i]['id']: rp+=pp            # captain x2
                if own[p['id']]/N_MGR < 0.20:                   # differential bonus
                    rp+=2*pr_goals[p['id']][r]
            fan[i]+=rp
            cum_running[i]+=rp
        # running total incl pred/brk distributed: approximate pred/brk as evenly accrued
        for i in range(N_MGR):
            cum_running[i]+= pred[i]/5 + brk[i]/5
        if r=='GROUP':
            cum_after_group=cum_running[:]
        leader_seq.append(max(range(N_MGR), key=lambda i:cum_running[i]))
    total=[pred[i]+fan[i]+brk[i] for i in range(N_MGR)]
    col_pred+=pred; col_fan+=fan; col_brk+=brk
    finals.append(total)
    order_f=sorted(range(N_MGR), key=lambda i:total[i], reverse=True)
    win=order_f[0]
    s=sorted(total, reverse=True)
    gap_1_2.append(s[0]-s[1]); gap_1_med.append(s[0]-st.median(s)); gap_1_last.append(s[0]-s[-1])
    grp_leader=max(range(N_MGR), key=lambda i:cum_after_group[i])
    if grp_leader==win: grp_leader_wins+=1
    if grp_leader==win: champ_was_grp_leader+=1
    # skill vs result: Spearman-ish via rank correlation of skills vs finishing rank
    fin_rank={mgr:pos for pos,mgr in enumerate(order_f)}
    sk_rank=sorted(range(N_MGR), key=lambda i:skills[i], reverse=True)
    sk_pos={mgr:pos for pos,mgr in enumerate(sk_rank)}
    n=N_MGR
    dsq=sum((fin_rank[i]-sk_pos[i])**2 for i in range(n))
    rho=1-6*dsq/(n*(n*n-1)); skill_rank_corr.append(rho)
    if win==sk_rank[0]: sharp_wins+=1
    if fin_rank[sk_rank[0]]<3: sharp_top3+=1
    lead_changes.append(len(set(leader_seq)))

# ---------- 5. REPORT ----------
def ms(x): return f"{st.mean(x):6.1f} +/- {st.pstdev(x):4.1f}"
mp,mf,mb = st.mean(col_pred), st.mean(col_fan), st.mean(col_brk)
tot=mp+mf+mb
print("="*64)
print("REAL 2022 WORLD CUP  (grounding facts)")
print("="*64)
print(f"matches: {len(M)} | goals: {total_goals} ({total_goals/len(M):.2f}/match) | teams: {len(teams)}")
print(f"finalists: {reached_FINAL} | champion: {CHAMPION} | golden boot: {GOLDEN_BOOT} ({scorer_goals[GOLDEN_BOOT]})")
print()
print("="*64); print(f"COLUMN BALANCE   (per manager, avg over {LEAGUES} leagues of {N_MGR})"); print("="*64)
print(f"  Predictions : {ms(col_pred)}   ->  {mp/tot*100:4.1f}% of total")
print(f"  Fantasy     : {ms(col_fan)}   ->  {mf/tot*100:4.1f}% of total")
print(f"  Bracket     : {ms(col_brk)}   ->  {mb/tot*100:4.1f}% of total")
print(f"  TOTAL       : {tot:6.1f}")
print()
print("="*64); print("COMPETITIVENESS"); print("="*64)
print(f"  avg winning score      : {st.mean([max(t) for t in finals]):.1f}")
print(f"  gap 1st -> 2nd         : {st.mean(gap_1_2):.1f}")
print(f"  gap 1st -> median      : {st.mean(gap_1_med):.1f}")
print(f"  gap 1st -> last        : {st.mean(gap_1_last):.1f}")
print(f"  end-of-group leader wins title : {grp_leader_wins/LEAGUES*100:.0f}%   (lower = stays open)")
print(f"  distinct leaders across 5 rounds: {st.mean(lead_changes):.2f}")
print()
print("="*64); print("SKILL vs LUCK"); print("="*64)
print(f"  rank corr(skill, finish): {st.mean(skill_rank_corr):+.2f}   (1=pure skill, 0=coin flip)")
print(f"  sharpest manager wins   : {sharp_wins/LEAGUES*100:.0f}%   (random would be {100/N_MGR:.0f}%)")
print(f"  sharpest finishes top-3 : {sharp_top3/LEAGUES*100:.0f}%   (random would be {3*100//N_MGR}%)")
print()
print("="*64); print("ONE REPRESENTATIVE LEAGUE (final table)"); print("="*64)
ex=finals[0]
# rebuild that league's columns
rows=sorted(range(N_MGR), key=lambda i:ex[i], reverse=True)
print(f"  {'seat':>4} {'skill':>5} {'PRED':>6} {'FAN':>6} {'BRK':>6} {'TOTAL':>7}")
for i in rows:
    print(f"  {i:>4} {base_skill[i]:>5.2f} {col_pred[i]:>6.0f} {col_fan[i]:>6.0f} {col_brk[i]:>6.0f} {ex[i]:>7.0f}")
