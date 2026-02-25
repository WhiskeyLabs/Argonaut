export const SCORE_FINDINGS_ESQL_QUERY = `
FROM argonaut_findings
| EVAL canonical_cve = TO_UPPER(cve)
| LEFT JOIN argonaut_threatintel ON canonical_cve == cve
| LEFT JOIN argonaut_reachability ON findingId == findingId
| WHERE analysisVersion IS NULL OR analysisVersion == "1.0"
| EVAL kev = COALESCE(kev, false)
| EVAL epss = COALESCE(epssScore, null)
| EVAL reachable = COALESCE(reachable, false)
| SORT priorityScore DESC, findingId ASC, repo ASC, buildId ASC
`;
