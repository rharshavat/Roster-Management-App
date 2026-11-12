import { money } from '../lib.js';

const pct = (v) => (v == null ? '' : `${(v * 100).toFixed(1)}%`);

const TYPE = { Drafted: 'Rookie deal', Extension: 'Extension', Signed: 'Signed', 'Re-signed': 'Re-signed' };

export default function ContractSection({ contract, season, fetchedAt }) {
  if (!contract) {
    return <p className="hint">No contract on file for this player in the nflverse/OverTheCap data.</p>;
  }
  const { current, history, seasons } = contract;
  const thisYear = seasons.find((s) => s.year === String(season));
  const onOtherTeam = contract.team && contract.team !== 'Bears';

  return (
    <div className="contract">
      <div className="contract-headline">
        <div className="contract-figure">
          <span className="contract-big">{money(current.value)}</span>
          <span className="contract-label">{current.years} yr{current.years === 1 ? '' : 's'}, signed {current.yearSigned}{onOtherTeam ? ` · ${contract.team}` : ''}</span>
        </div>
        <div className="contract-figure">
          <span className="contract-big">{money(current.apy)}</span>
          <span className="contract-label">per year{current.apyCapPct != null ? ` · ${pct(current.apyCapPct)} of cap` : ''}</span>
        </div>
        <div className="contract-figure">
          <span className="contract-big">{money(current.guaranteed)}</span>
          <span className="contract-label">guaranteed</span>
        </div>
        {thisYear && (
          <div className="contract-figure">
            <span className="contract-big">{money(thisYear.cap_number)}</span>
            <span className="contract-label">{season} cap hit</span>
          </div>
        )}
      </div>
      {!contract.isActive && <p className="hint">No active contract; showing the most recent one.</p>}

      {seasons.length > 0 && (
        <>
          <h4 className="contract-sub">Cap by season</h4>
          <div className="table-wrap">
            <table className="contract-table">
              <thead>
                <tr>
                  <th>Year</th><th>Team</th><th className="num">Cap hit</th><th className="num">% cap</th>
                  <th className="num">Base</th><th className="num">Bonus</th><th className="num">Roster bonus</th>
                  <th className="num">Guaranteed</th><th className="num">Cash</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((s) => (
                  <tr key={`${s.year}-${s.team}`} className={s.year === String(season) ? 'current' : Number(s.year) > season ? 'future' : ''}>
                    <td>{s.year}</td>
                    <td>{s.team}</td>
                    <td className="num strong">{money(s.cap_number)}</td>
                    <td className="num">{pct(s.cap_percent)}</td>
                    <td className="num">{money(s.base_salary)}</td>
                    <td className="num">{money(s.prorated_bonus)}</td>
                    <td className="num">{money(s.roster_bonus)}</td>
                    <td className="num">{money(s.guaranteed_salary)}</td>
                    <td className="num">{money(s.cash_paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {history.length > 0 && (
        <>
          <h4 className="contract-sub">Contract history</h4>
          <div className="table-wrap">
            <table className="contract-table">
              <thead>
                <tr>
                  <th>Signed</th><th>Team</th><th>Type</th><th className="num">Yrs</th>
                  <th className="num">Total</th><th className="num">Per year</th><th className="num">Guaranteed</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((c, i) => (
                  <tr key={i}>
                    <td>{c.year_signed}</td>
                    <td>{c.team}</td>
                    <td>{TYPE[c.contract_type] ?? c.contract_type}</td>
                    <td className="num">{c.yrs}</td>
                    <td className="num strong">{money(c.total)}</td>
                    <td className="num">{money(c.apy)}</td>
                    <td className="num">{money(c.guarantees)}</td>
                    <td>{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="hint">
        Source: nflverse (OverTheCap){fetchedAt ? `, fetched ${new Date(fetchedAt).toLocaleDateString()}` : ''}
        {contract.playerPage && <> · <a href={contract.playerPage} target="_blank" rel="noopener noreferrer">View on OverTheCap</a></>}
      </p>
    </div>
  );
}
