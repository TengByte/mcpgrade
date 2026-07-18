#!/usr/bin/env node
/**
 * results.ndjson → leaderboard.html (standalone, sortable, zero deps)
 * Usage: node scripts/render-leaderboard-html.mjs [results.ndjson] [out.html]
 */
import { readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2] ?? "results.ndjson";
const out = process.argv[3] ?? "leaderboard.html";

const rows = readFileSync(src, "utf8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l))
  .filter((r) => !r.failed)
  .sort((a, b) => b.score - a.score);
const failed = readFileSync(src, "utf8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l))
  .filter((r) => r.failed);

const gradeClass = (g) => ({ A: "a", B: "b", C: "c", D: "d", F: "f" }[g] ?? "f");
const date = new Date().toISOString().slice(0, 10);

const tr = rows.map((r, i) => `<tr>
<td>${i + 1}</td>
<td class="name">${r.name}</td>
<td><span class="grade ${gradeClass(r.grade)}">${r.grade}</span></td>
<td data-v="${r.score}">${r.score}</td>
<td data-v="${r.tools}">${r.tools}</td>
<td data-v="${r.errors}">${r.errors}</td>
<td data-v="${r.warns}">${r.warns}</td>
<td data-v="${r.cats.desc}">${r.cats.desc}</td>
<td data-v="${r.cats.schema}">${r.cats.schema}</td>
<td data-v="${r.cats.name}">${r.cats.name}</td>
<td data-v="${r.cats.token}">${r.cats.token}</td>
</tr>`).join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MCP Server Agent-Usability Leaderboard · mcplint</title>
<meta name="description" content="A-F agent-usability scores for ${rows.length} popular MCP servers, measured by mcplint.">
<style>
:root{--bg:#fff;--text:#1a1a1a;--muted:#6b6b6b;--border:#e5e5e5;--code:#f6f6f6;color-scheme:light dark}
@media(prefers-color-scheme:dark){:root{--bg:#121212;--text:#e8e8e8;--muted:#9a9a9a;--border:#2a2a2a;--code:#1e1e1e}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif}
main{max-width:64rem;margin:0 auto;padding:2.5rem 1rem 4rem}
h1{font-size:1.5rem;margin:0 0 .3rem}
.sub{color:var(--muted);font-size:.9rem;margin-bottom:1.6rem}
table{border-collapse:collapse;width:100%;font-size:.88rem}
th,td{border-bottom:1px solid var(--border);padding:.45rem .55rem;text-align:right;white-space:nowrap}
th{cursor:pointer;user-select:none;position:sticky;top:0;background:var(--bg)}
th:hover{color:#0b63c4}
td.name,th.name{text-align:left;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.82rem}
.grade{display:inline-block;min-width:1.6em;text-align:center;padding:.05em .35em;border-radius:5px;font-weight:700;color:#fff}
.grade.a{background:#1a7f37}.grade.b{background:#4d9375}.grade.c{background:#bf8700}.grade.d{background:#d4640c}.grade.f{background:#cf222e}
.failed{color:var(--muted);font-size:.85rem;margin-top:1.2rem}
footer{margin-top:2.5rem;color:var(--muted);font-size:.85rem}
a{color:#0b63c4}
</style>
</head>
<body>
<main>
<h1>MCP Server Agent-Usability Leaderboard</h1>
<div class="sub">${rows.length} servers · scanned ${date} by <a href="REPO_URL">mcplint</a> (static rules) · point-in-time snapshot · click headers to sort ·
fixed your score? <a href="REPO_URL/issues">request a re-scan</a></div>
<table id="lb">
<thead><tr>
<th>#</th><th class="name">Server</th><th>Grade</th><th>Score</th><th>Tools</th><th>Errors</th><th>Warnings</th><th>Desc</th><th>Schema</th><th>Naming</th><th>Token</th>
</tr></thead>
<tbody>
${tr}
</tbody>
</table>
${failed.length ? `<p class="failed">Could not scan with dummy credentials (excluded, not graded): ${failed.map((f) => f.name).join(" · ")}</p>` : ""}
<footer>Scores weight descriptions 30% · schema 30% · naming 15% · token cost 15% · consistency 10%, density-normalized by tool count.
Methodology &amp; rule rationale: <a href="REPO_URL/blob/main/docs/rules.md">docs/rules.md</a></footer>
</main>
<script>
document.querySelectorAll("#lb th").forEach((th,i)=>{
  th.addEventListener("click",()=>{
    const tb=document.querySelector("#lb tbody");
    const dir=th.dataset.dir==="asc"?-1:1;th.dataset.dir=dir===1?"asc":"desc";
    [...tb.rows].sort((a,b)=>{
      const av=a.cells[i].dataset.v??a.cells[i].textContent, bv=b.cells[i].dataset.v??b.cells[i].textContent;
      const an=parseFloat(av), bn=parseFloat(bv);
      return (isNaN(an)||isNaN(bn)) ? av.localeCompare(bv)*-dir : (bn-an)*dir;
    }).forEach(r=>tb.appendChild(r));
  });
});
</script>
</body>
</html>`;

writeFileSync(out, html);
console.log(`${out}: ${rows.length} rows + ${failed.length} failed`);
