import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

/* ===================== CONFIG ===================== */
// Link do Excel (SharePoint) – sempre com cache-buster
const XLSX_URL =
  "https://generosocombr-my.sharepoint.com/personal/controladoria_generoso_com_br/_layouts/15/download.aspx?share=ESLYowVkuEBEu82Jfnk-JQ0BfoDxwkd99RFtXTEzbARXEg&download=1";

const SHEET_NAMES_TRY = ["CDIAutomtico1", "CDIAutomático1", "CDI Automático 1"];

// Nomes de colunas (exatamente como estão na planilha)
const COL = {
  data: "Custo de Distribuição[Data Baixa]",
  placa: "Custo de Distribuição[Placa]",
  tipo: "Custo de Distribuição[Tipo]",
  unidade: "Custo de Distribuição[Unidade]",
  rel: "Custo de Distribuição[Relacionamento]",

  receita: "SumReceita_Líquida",
  custoTotal: "SumDiária_Total",

  peso: "SumPeso",
  volumes: "SumVolumes",
  ctrcs: "SumCTRC_s",
  coletas: "SumColetas",
  entregas: "SumEntregas",
  valorMerc: "SumValor_de_Mercadoria",
  retorno: "SumRetorno",
  cdiPct: "SumCDI",
  cdiPct2: "CDI____",
} as const;

// Tipos de custo (apenas custos – sem receita/produção/retorno)
const COST_KEYS: Array<{ key: string; label: string }> = [
  { key: "SumAjudante", label: "Ajudante" },
  { key: "SumComissão_de_Recepção", label: "Comissão de Recepção" },
  { key: "SumDesconto_de_Coleta", label: "Desconto de Coleta" },
  { key: "SumDiária_Fixa", label: "Diária Fixa" },
  { key: "SumDiária_Manual", label: "Diária Manual" },
  { key: "SumDiária_Percentual", label: "Diária Percentual" },
  { key: "SumEvento", label: "Evento" },
  { key: "SumGurgelmix", label: "Gurgelmix" },
  { key: "SumHerbalife", label: "Herbalife" },
  { key: "SumSaída", label: "Saída" },
  { key: "SumSetor_400", label: "Setor 400" },
  { key: "SumCusto_Fixo__Frota", label: "Custo Fixo Frota" },
  { key: "SumCusto_Variável__Frota", label: "Custo Variável Frota" },
  { key: "SumSal___Enc___Frota", label: "Salário/Encargos Frota" },
  { key: "SumH_E__Frota", label: "H.E. Frota" },
];

// Tema TG (claro)
const THEME = {
  blue: "#0a2d8d",
  blue2: "#0d38b0",
  bg: "#f5f7fb",
  card: "#ffffff",
  text: "#0a0a0a",
  ok: "#149c3f",
  bad: "#db2f2f",
  muted: "#6b7280",
};

const GlobalStyles = () => (
  <style>{`
  :root{color-scheme: only light;}
  *{box-sizing:border-box}
  html,body,#root{height:100%}
  body{margin:0;background:${THEME.bg};color:${THEME.text};font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial}
  .container{max-width:1200px;margin:0 auto;padding:16px}
  header{background:${THEME.blue};color:#fff;padding:16px 0;margin-bottom:12px}
  h1{margin:0 0 2px 0;font-size:20px}
  .sub{font-size:12px;opacity:.9}
  .bar{display:flex;align-items:center;gap:8px;justify-content:flex-end}
  .user{font-size:12px;opacity:.95;margin-right:8px}
  .btn{background:${THEME.blue2};border:none;border-radius:8px;color:#fff;padding:10px 14px;cursor:pointer}
  .btn.secondary{background:#e5e7eb;color:#111}
  .btn.success{background:${THEME.ok}}
  .btn:disabled{opacity:.6;cursor:not-allowed}

  .filters{background:${THEME.blue};border-radius:10px;color:#fff;padding:14px;margin:12px 0}
  .filters .row{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:12px}
  select{appearance:none;background:#fff;color:#111;border:1px solid #d7dce3;border-radius:8px;padding:10px;width:100%}
  .reload{background:#fff;color:${THEME.blue};font-weight:600}

  .panel{background:${THEME.card};border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,.06);padding:12px;margin:10px 0}
  .panelTitle{background:${THEME.blue};color:#fff;padding:10px 12px;border-top-left-radius:12px;border-top-right-radius:12px;margin:-12px -12px 12px -12px;font-weight:600}

  .kpis{display:grid;grid-template-columns: repeat(6,1fr);gap:12px;margin-top:10px}
  .kpi{background:#fff;border-radius:10px;border:1px solid #e7e9ef;padding:12px}
  .kpi .name{font-size:12px;color:${THEME.muted};margin-bottom:2px}
  .kpi .value{font-size:20px;font-weight:700}
  .delta{font-size:12px;margin-left:6px}
  .up{color:${THEME.ok}} .down{color:${THEME.bad}}

  table{width:100%;border-collapse:collapse}
  th,td{padding:10px;border-bottom:1px solid #eef1f6;font-size:13px}
  th{color:${THEME.muted};font-weight:600;text-align:left}
  .chip{display:inline-block;padding:2px 6px;border-radius:6px;border:1px solid #e6e9f2;background:#fafbff}
  .chip.ok{color:${THEME.ok};border-color:${THEME.ok}33}
  .chip.bad{color:${THEME.bad};border-color:${THEME.bad}33}
  .muted{color:${THEME.muted}}

  /* LOGIN */
  .loginWrap{min-height:100vh;display:grid;grid-template-columns:minmax(320px,420px) 1fr}
  .loginLeft{padding:28px}
  .loginCard{background:#fff;border-radius:12px;box-shadow:0 2px 18px rgba(0,0,0,.08);padding:18px 18px 14px}
  .loginTitle{background:${THEME.blue};color:#fff;padding:10px 12px;border-radius:10px;margin:-18px -18px 14px -18px;font-weight:700}
  .loginBg{position:relative;overflow:hidden}
  .loginBg:before{
    content:"";
    position:absolute;inset:0;
    background:url('https://generoso.com.br/static/7044e3eebe94961b290fb958dd42e7bc/17951/top-main-bg.webp') center left / cover no-repeat;
    filter:brightness(.97);
  }
  label{display:block;font-size:12px;color:${THEME.muted};margin:8px 0 4px}
  input{width:100%;padding:10px;border-radius:8px;border:1px solid #d7dce3;background:#fff;color:#111}
  .loginActions{display:flex;justify-content:flex-start;margin-top:12px}

  /* print */
  @media print{
    body{background:#fff}
    header,.filters .reload,.btn, .loginWrap{display:none !important}
    .panel{break-inside:avoid-page}
    .container{max-width:none}
  }
`}</style>
);

/* ===================== UTILS ===================== */
const fmtInt = (n: number) => (isFinite(n) ? Math.round(n).toLocaleString("pt-BR") : "0");
const parseDatePt = (s: any): Date | null => {
  if (!s && s !== 0) return null;
  // já pode vir "16/09/2025"
  if (typeof s === "string") {
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      const d = parseInt(m[1], 10), mo = parseInt(m[2], 10) - 1, y = parseInt(m[3], 10);
      return new Date(y < 100 ? 2000 + y : y, mo, d);
    }
  }
  // serial Excel
  if (typeof s === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = s * 86400000;
    return new Date(epoch.getTime() + ms);
  }
  return null;
};
const sameDay = (a: Date, b: Date) =>
  a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

type Row = Record<string, any>;

/* ===================== LOGIN (usa users.json se existir) ===================== */
type User = { user: string; pass: string; role: "admin" | "user"; unidade: string | "*" };
const DEFAULT_USERS: User[] = [{ user: "gustavo", pass: "admin123", role: "admin", unidade: "*" }];

async function loadUsers(): Promise<User[]> {
  try {
    const r = await fetch("./users.json?v=" + Date.now(), { cache: "no-store" });
    if (r.ok) {
      const js = await r.json();
      if (Array.isArray(js)) return js as User[];
    }
  } catch {}
  return DEFAULT_USERS;
}

/* ===================== DATA ===================== */
async function fetchSheet(): Promise<Row[]> {
  const url = `${XLSX_URL}&t=${Date.now()}`; // cache-buster
  const r = await fetch(url, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
  if (!r.ok) throw new Error("Falha ao baixar XLSX (" + r.status + ")");
  const buf = await r.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  let ws: XLSX.WorkSheet | undefined;
  for (const nm of SHEET_NAMES_TRY) {
    if (wb.Sheets[nm]) {
      ws = wb.Sheets[nm];
      break;
    }
  }
  if (!ws) ws = wb.Sheets[wb.SheetNames[0]];
  const rows: Row[] = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
  // normaliza a coluna de data
  for (const r2 of rows) {
    const d = parseDatePt(r2[COL.data]);
    r2.__dateObj = d;
  }
  return rows.filter((r) => r.__dateObj);
}

function maxDate(rows: Row[]) {
  return rows.reduce<Date | null>((acc, r) => {
    const d: Date = r.__dateObj;
    if (!acc) return d;
    return d > acc ? d : acc;
  }, null);
}
function prevDate(rows: Row[], last: Date | null) {
  let prev: Date | null = null;
  for (const r of rows) {
    const d: Date = r.__dateObj;
    if (!last || sameDay(d, last)) continue;
    if (!prev || d > prev) prev = d;
  }
  return prev;
}

/* ===================== APP ===================== */
export default function App() {
  const [users, setUsers] = useState<User[]>([]);
  const [session, setSession] = useState<User | null>(null);

  const [raw, setRaw] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);

  const [unid, setUnid] = useState<string>("(todos)");
  const [tipo, setTipo] = useState<string>("(todos)");
  const [rel, setRel] = useState<string>("(todos)");

  const [last, setLast] = useState<Date | null>(null);
  const [prev, setPrev] = useState<Date | null>(null);

  // carrega usuários
  useEffect(() => {
    loadUsers().then(setUsers);
  }, []);

  // login simples
  const [u, setU] = useState("gustavo");
  const [p, setP] = useState("");

  const tryLogin = () => {
    const found = users.find((x) => x.user.toLowerCase() === u.toLowerCase() && x.pass === p);
    if (!found) {
      alert("Usuário ou senha inválidos.");
      return;
    }
    setSession(found);
  };

  // carrega dados
  const load = async () => {
    try {
      setLoading(true);
      const rows = await fetchSheet();
      const l = maxDate(rows);
      const pr = prevDate(rows, l);
      setRaw(rows);
      setLast(l);
      setPrev(pr);
    } catch (e: any) {
      alert(e?.message || "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (session) load();
  }, [session]);

  /* ======== filtros derivados ======== */
  const allUnid = useMemo(() => {
    if (!raw) return [];
    const s = new Set<string>();
    raw.forEach((r) => s.add(r[COL.unidade]));
    return ["(todos)", ...Array.from(s).sort()];
  }, [raw]);
  const allTipo = useMemo(() => {
    if (!raw) return [];
    const s = new Set<string>();
    raw.forEach((r) => s.add(r[COL.tipo]));
    return ["(todos)", ...Array.from(s).sort()];
  }, [raw]);
  const allRel = useMemo(() => {
    if (!raw) return [];
    const s = new Set<string>();
    raw.forEach((r) => s.add(r[COL.rel]));
    return ["(todos)", ...Array.from(s).sort()];
  }, [raw]);

  const filteredForDate = (d: Date | null) => {
    if (!raw || !d) return [];
    return raw.filter((r) => {
      if (!sameDay(r.__dateObj, d)) return false;
      if (unid !== "(todos)" && r[COL.unidade] !== unid) return false;
      if (tipo !== "(todos)" && r[COL.tipo] !== tipo) return false;
      if (rel !== "(todos)" && r[COL.rel] !== rel) return false;
      return true;
    });
  };

  const rowsLast = useMemo(() => filteredForDate(last), [raw, last, unid, tipo, rel]);
  const rowsPrev = useMemo(() => filteredForDate(prev), [raw, prev, unid, tipo, rel]);

  // agregadores
  const sum = (rows: Row[], col: string) =>
    rows.reduce((acc, r) => acc + (Number(r[col]) || 0), 0);

  const kpis = useMemo(() => {
    const receita = sum(rowsLast, COL.receita);
    const custo = sum(rowsLast, COL.custoTotal);
    const entregas = sum(rowsLast, COL.entregas);
    const coletas = sum(rowsLast, COL.coletas);
    const ctrcs = sum(rowsLast, COL.ctrcs);
    const peso = sum(rowsLast, COL.peso);

    const receitaP = sum(rowsPrev, COL.receita);
    const custoP = sum(rowsPrev, COL.custoTotal);
    const entregasP = sum(rowsPrev, COL.entregas);
    const coletasP = sum(rowsPrev, COL.coletas);
    const ctrcsP = sum(rowsPrev, COL.ctrcs);
    const pesoP = sum(rowsPrev, COL.peso);

    return {
      receita: { v: receita, d: receita - receitaP },
      custo: { v: custo, d: custo - custoP },
      entregas: { v: entregas, d: entregas - entregasP },
      coletas: { v: coletas, d: coletas - coletasP },
      ctrcs: { v: ctrcs, d: ctrcs - ctrcsP },
      peso: { v: peso, d: peso - pesoP },
    };
  }, [rowsLast, rowsPrev]);

  // por unidade (quando filtro = (todos))
  const porUnidade = useMemo(() => {
    const rows = rowsLast;
    const map = new Map<string, { receita: number; custo: number; entregas: number; coletas: number; ctrcs: number; peso: number }>();
    for (const r of rows) {
      const u = r[COL.unidade] || "-";
      const it = map.get(u) || { receita: 0, custo: 0, entregas: 0, coletas: 0, ctrcs: 0, peso: 0 };
      it.receita += Number(r[COL.receita]) || 0;
      it.custo += Number(r[COL.custoTotal]) || 0;
      it.entregas += Number(r[COL.entregas]) || 0;
      it.coletas += Number(r[COL.coletas]) || 0;
      it.ctrcs += Number(r[COL.ctrcs]) || 0;
      it.peso += Number(r[COL.peso]) || 0;
      map.set(u, it);
    }
    return Array.from(map.entries()).map(([u, v]) => ({ unidade: u, ...v }));
  }, [rowsLast]);

  // por tipo/unidade média & linhas de placa
  const placaTable = useMemo(() => {
    const rows = rowsLast;
    // média por (unidade,tipo)
    const key = (r: Row) => `${r[COL.unidade]}||${r[COL.tipo]}`;
    const aggr = new Map<string, { n: number; peso: number; ctrcs: number; coletas: number; entregas: number }>();
    for (const r of rows) {
      const k = key(r);
      const it = aggr.get(k) || { n: 0, peso: 0, ctrcs: 0, coletas: 0, entregas: 0 };
      it.n++;
      it.peso += Number(r[COL.peso]) || 0;
      it.ctrcs += Number(r[COL.ctrcs]) || 0;
      it.coletas += Number(r[COL.coletas]) || 0;
      it.entregas += Number(r[COL.entregas]) || 0;
      aggr.set(k, it);
    }
    const avg = (k: string) => {
      const it = aggr.get(k);
      if (!it || !it.n) return { peso: 0, ctrcs: 0, coletas: 0, entregas: 0 };
      return {
        peso: it.peso / it.n,
        ctrcs: it.ctrcs / it.n,
        coletas: it.coletas / it.n,
        entregas: it.entregas / it.n,
      };
    };
    // linhas
    return rows.map((r) => {
      const k = key(r);
      const m = avg(k);
      const peso = Number(r[COL.peso]) || 0;
      const ctrcs = Number(r[COL.ctrcs]) || 0;
      const coletas = Number(r[COL.coletas]) || 0;
      const entregas = Number(r[COL.entregas]) || 0;
      const flag = (v: number, base: number) =>
        v > base ? { dir: "▲", cls: "ok", txt: "acima" } : v < base ? { dir: "▼", cls: "bad", txt: "abaixo" } : { dir: "=", cls: "", txt: " = média" };
      return {
        unidade: r[COL.unidade],
        tipo: r[COL.tipo],
        placa: r[COL.placa],
        peso: { v: peso, ...flag(peso, m.peso) },
        ctrcs: { v: ctrcs, ...flag(ctrcs, m.ctrcs) },
        coletas: { v: coletas, ...flag(coletas, m.coletas) },
        entregas: { v: entregas, ...flag(entregas, m.entregas) },
      };
    });
  }, [rowsLast]);

  // decomposição de custos + produção por tipo de custo
  const decomp = useMemo(() => {
    const total = sum(rowsLast, COL.custoTotal);
    const linhas = COST_KEYS.map(({ key, label }) => {
      const valor = sum(rowsLast, key);
      // produção agregada (veículos onde esse custo >0)
      let prod = { ctrcs: 0, coletas: 0, entregas: 0, peso: 0 };
      for (const r of rowsLast) {
        if ((Number(r[key]) || 0) > 0) {
          prod.ctrcs += Number(r[COL.ctrcs]) || 0;
          prod.coletas += Number(r[COL.coletas]) || 0;
          prod.entregas += Number(r[COL.entregas]) || 0;
          prod.peso += Number(r[COL.peso]) || 0;
        }
      }
      return { label, valor, pct: total ? (valor / total) * 100 : 0, ...prod };
    }).filter((l) => l.valor > 0.0001);
    return { total, linhas };
  }, [rowsLast]);

  const dateStr = (d: Date | null) =>
    d ? new Intl.DateTimeFormat("pt-BR").format(d) : "-";

  const onPrint = () => window.print();

  /* ===================== RENDER ===================== */
  if (!session) {
    return (
      <>
        <GlobalStyles />
        <div className="loginWrap">
          <div className="loginLeft">
            <div className="loginCard">
              <div className="loginTitle">CDI – Análise Diária</div>
              <div className="muted" style={{ marginBottom: 8 }}>
                Transporte Generoso – Controladoria
              </div>
              <label>Usuário</label>
              <input value={u} onChange={(e) => setU(e.target.value)} placeholder="usuário" />
              <label>Senha</label>
              <input value={p} onChange={(e) => setP(e.target.value)} placeholder="senha" type="password" />
              <div className="loginActions">
                <button className="btn" onClick={tryLogin}>Entrar</button>
              </div>
            </div>
          </div>
          <div className="loginBg" />
        </div>
      </>
    );
  }

  const k = kpis;

  return (
    <>
      <GlobalStyles />
      <header>
        <div className="container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1>CDI – Análise Diária</h1>
            <div className="sub">Transporte Generoso – Controladoria</div>
            <div className="sub">Último dia do arquivo: {dateStr(last)}</div>
          </div>
          <div className="bar">
            <div className="user">{session.user} ({session.role})</div>
            <button className="btn secondary" onClick={() => setSession(null)}>Sair</button>
          </div>
        </div>
      </header>

      <div className="container" style={{ minHeight: "100vh" }}>
        <div className="filters">
          <div className="row">
            <select value={unid} onChange={(e) => setUnid(e.target.value)}>
              {allUnid.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {allTipo.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <select value={rel} onChange={(e) => setRel(e.target.value)}>
              {allRel.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <div style={{ display:"flex", gap:8 }}>
              <button className="btn reload" onClick={load} disabled={loading}>{loading ? "Carregando..." : "Recarregar"}</button>
              <button className="btn success" onClick={onPrint}>Exportar PDF</button>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panelTitle">Resumo do Dia</div>
          <div className="muted" style={{ marginBottom: 8 }}>
            Resumo do dia {dateStr(last)} — Unidades: {unid}.
          </div>
          <div className="kpis">
            {[
              { name: "Receita", obj: k.receita },
              { name: "Custo", obj: k.custo },
              { name: "Entregas", obj: k.entregas },
              { name: "Coletas", obj: k.coletas },
              { name: "CTRCs", obj: k.ctrcs },
              { name: "Peso (kg)", obj: k.peso },
            ].map(({ name, obj }) => {
              const cls = obj.d > 0 ? "up" : obj.d < 0 ? "down" : "";
              const sym = obj.d > 0 ? "▲" : obj.d < 0 ? "▼" : "•";
              return (
                <div className="kpi" key={name}>
                  <div className="name">{name}</div>
                  <div className="value">
                    {fmtInt(obj.v)}
                    <span className={`delta ${cls}`}> {sym} {fmtInt(Math.abs(obj.d))}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tabela por unidade (quando (todos)) */}
          <div style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Unidade</th>
                  <th>Receita</th>
                  <th>Custo</th>
                  <th>Entregas</th>
                  <th>Coletas</th>
                  <th>CTRCs</th>
                  <th>Peso (kg)</th>
                </tr>
              </thead>
              <tbody>
                {(unid === "(todos)" ? porUnidade : porUnidade.filter((r) => r.unidade === unid)).map((r) => (
                  <tr key={r.unidade}>
                    <td>{r.unidade}</td>
                    <td>{fmtInt(r.receita)}</td>
                    <td>{fmtInt(r.custo)}</td>
                    <td>{fmtInt(r.entregas)}</td>
                    <td>{fmtInt(r.coletas)}</td>
                    <td>{fmtInt(r.ctrcs)}</td>
                    <td>{fmtInt(r.peso)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* placa vs média do tipo/unidade */}
        <div className="panel">
          <div className="panelTitle">Por Tipo de Veículo → Placa (sinalização vs. média do tipo na unidade)</div>
          <table>
            <thead>
              <tr>
                <th>Unidade</th><th>Tipo</th><th>Placa</th>
                <th>Peso</th><th>CTRCs</th><th>Coletas</th><th>Entregas</th>
              </tr>
            </thead>
            <tbody>
              {placaTable.map((r, i) => (
                <tr key={r.placa + i}>
                  <td>{r.unidade}</td>
                  <td>{r.tipo}</td>
                  <td>{r.placa}</td>
                  <td>
                    {fmtInt(r.peso.v)}{" "}
                    <span className={`chip ${r.peso.cls}`}>{r.peso.dir} {r.peso.txt}</span>
                  </td>
                  <td>
                    {fmtInt(r.ctrcs.v)}{" "}
                    <span className={`chip ${r.ctrcs.cls}`}>{r.ctrcs.dir} {r.ctrcs.txt}</span>
                  </td>
                  <td>
                    {fmtInt(r.coletas.v)}{" "}
                    <span className={`chip ${r.coletas.cls}`}>{r.coletas.dir} {r.coletas.txt}</span>
                  </td>
                  <td>
                    {fmtInt(r.entregas.v)}{" "}
                    <span className={`chip ${r.entregas.cls}`}>{r.entregas.dir} {r.entregas.txt}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Decomposição de custos */}
        <div className="panel">
          <div className="panelTitle">Decomposição de tipos de custo + produção do dia (por tipo de custo)</div>
          <table>
            <thead>
              <tr>
                <th>Tipo de custo</th><th>Valor</th><th>% do total</th>
                <th>CTRCs</th><th>Coletas</th><th>Entregas</th><th>Peso (kg)</th>
              </tr>
            </thead>
            <tbody>
              {decomp.linhas.map((l, i) => (
                <tr key={l.label + i}>
                  <td>{l.label}</td>
                  <td>{fmtInt(l.valor)}</td>
                  <td>{l.pct.toFixed(1).replace(".", ",")}%</td>
                  <td>{fmtInt(l.ctrcs)}</td>
                  <td>{fmtInt(l.coletas)}</td>
                  <td>{fmtInt(l.entregas)}</td>
                  <td>{fmtInt(l.peso)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Análise automática simples */}
        <div className="panel" style={{ marginBottom: 40 }}>
          <div className="panelTitle">Análise automática do dia</div>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            Unidade: {unid}. Dia {dateStr(last)}.
            {" "}
            Receita {fmtInt(k.receita.v)} ({k.receita.d === 0 ? "estável" : (k.receita.d > 0 ? `▲ +${fmtInt(k.receita.d)}` : `▼ ${fmtInt(k.receita.d)}`)} vs. dia anterior),
            {" "}custo {fmtInt(k.custo.v)} ({k.custo.d === 0 ? "estável" : (k.custo.d > 0 ? `▲ +${fmtInt(k.custo.d)}` : `▼ ${fmtInt(k.custo.d)}`)}),
            {" "}entregas {fmtInt(k.entregas.v)} ({k.entregas.d === 0 ? "estável" : (k.entregas.d > 0 ? `▲ +${fmtInt(k.entregas.d)}` : `▼ ${fmtInt(k.entregas.d)}`)}),
            {" "}coletas {fmtInt(k.coletas.v)} ({k.coletas.d === 0 ? "estável" : (k.coletas.d > 0 ? `▲ +${fmtInt(k.coletas.d)}` : `▼ ${fmtInt(k.coletas.d)}`)}),
            {" "}CTRCs {fmtInt(k.ctrcs.v)} ({k.ctrcs.d === 0 ? "estável" : (k.ctrcs.d > 0 ? `▲ +${fmtInt(k.ctrcs.d)}` : `▼ ${fmtInt(k.ctrcs.d)}`)}),
            {" "}peso {fmtInt(k.peso.v)} ({k.peso.d === 0 ? "estável" : (k.peso.d > 0 ? `▲ +${fmtInt(k.peso.d)}` : `▼ ${fmtInt(k.peso.d)}`)}).
            {" "}Custos que mais impactaram hoje:{" "}
            {decomp.linhas
              .slice()
              .sort((a, b) => b.valor - a.valor)
              .slice(0, 3)
              .map((l) => l.label)
              .join(", ") || "—"}.
          </div>
        </div>
      </div>
    </>
  );
}
