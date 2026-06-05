export const dynamic = 'force-dynamic'

export default function RulesPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5 pb-24 sm:pb-10">
      <h1 className="text-xl font-extrabold text-cro-navy">Rules</h1>
      <p className="mt-1 text-sm text-slate-500">
        You score in three ways — Predictions, your Fantasy squad, and the Bracket. Your total is the sum
        of all three.
      </p>

      <Section title="Getting in">
        <ul className="list-disc space-y-1 pl-5">
          <li>Open the app, enter your email and the league invite code, then click the magic link.</li>
          <li>Set your club name, crest and colour under <b>Your club</b>.</li>
        </ul>
      </Section>

      <Section title="1 · Predictions (every match)">
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Exact score</b> — 5 points</li>
          <li>Correct result + correct goal difference — 3</li>
          <li>Correct result, wrong margin — 2</li>
          <li>Wrong result — 0</li>
          <li><b>Anytime goalscorer</b> (up to 2) — +2 each</li>
          <li><b>Red card in the match?</b> — +4 for a correct “yes”, +1 for a correct “no”</li>
          <li><b>Banker</b> — once per stage, double one match’s prediction points</li>
        </ul>
        <p className="mt-2 text-slate-500">Each match locks at kickoff. After that, everyone’s picks become visible.</p>
      </Section>

      <Section title="2 · Fantasy squad">
        <p>
          11 players, <b>€100m</b> budget, formation <b>1 GK · 3–5 DEF · 2–5 MID · 1–3 FWD</b>. Choose a
          captain.
        </p>
        <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-400">
              <tr>
                <th className="px-2 py-1.5 text-left">Event</th>
                <th className="px-2 py-1.5 text-right">GK</th>
                <th className="px-2 py-1.5 text-right">DEF</th>
                <th className="px-2 py-1.5 text-right">MID</th>
                <th className="px-2 py-1.5 text-right">FWD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-cro-navy">
              <Tr e="Played 60+ min" v={['+2', '+2', '+2', '+2']} />
              <Tr e="Played 1–59 min" v={['+1', '+1', '+1', '+1']} />
              <Tr e="Goal" v={['+6', '+6', '+5', '+4']} />
              <Tr e="Clean sheet (60+ min)" v={['+4', '+4', '+1', '0']} />
              <Tr e="Penalty save" v={['+5', '—', '—', '—']} />
              <Tr e="Penalty miss" v={['−2', '−2', '−2', '−2']} />
              <Tr e="Red card" v={['−3', '−3', '−3', '−3']} />
              <Tr e="Own goal" v={['−2', '−2', '−2', '−2']} />
            </tbody>
          </table>
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li><b>Captain</b> — double points (×2).</li>
          <li><b>Triple Captain</b> — once per tournament, your captain scores ×3.</li>
          <li><b>Differential bonus</b> — own a player selected by fewer than 20% of the league and get +2 per goal he scores.</li>
          <li><b>Re-draft</b> — build a brand-new squad before each stage (group, R32, R16, QF, SF, final). It locks at the first match of that stage.</li>
        </ul>
      </Section>

      <Section title="3 · Blocks & shields (from the knockouts)">
        <ul className="list-disc space-y-1 pl-5">
          <li>Once per round you can <b>block one rival’s player</b> — that player scores 0 for them that round (even if captained).</li>
          <li>Blocks are <b>secret until kickoff</b>, then revealed.</li>
          <li>At most <b>2 blocks</b> can land on one manager per round.</li>
          <li>You get <b>2 shields</b> for the tournament — a shield protects you from all blocks for that round.</li>
        </ul>
      </Section>

      <Section title="4 · Bracket & awards (locked before kickoff)">
        <p>Place each team at the furthest round you think it reaches:</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Round of 16: <b>+1</b> · Quarter-final: <b>+2</b> · Semi-final: <b>+4</b> · Final: <b>+8</b></li>
          <li><b>Champion</b>: +15 · <b>Golden Boot</b> (top scorer): +10</li>
        </ul>
      </Section>

      <Section title="Leaderboard">
        <p>
          <b>Total = Predictions + Fantasy + Bracket.</b> Most points at the end of the tournament wins.
        </p>
      </Section>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl bg-white p-4 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200">
      <h2 className="mb-2 text-sm font-bold text-cro-navy">{title}</h2>
      {children}
    </section>
  )
}

function Tr({ e, v }: { e: string; v: [string, string, string, string] }) {
  return (
    <tr>
      <td className="px-2 py-1.5">{e}</td>
      {v.map((x, i) => (
        <td key={i} className="px-2 py-1.5 text-right tabular-nums">
          {x}
        </td>
      ))}
    </tr>
  )
}
