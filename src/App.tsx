import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

/* ===========================================================
   BRAND / UI
   =========================================================== */
const BRAND = {
  blue: "#0a2d8d",
  blueLight: "#113bb5",
  bg: "#f5f7fb",
  card: "#ffffff",
  text: "#0a0a0a",
  ok: "#1a9b34",
  bad: "#d83232",
  muted: "#6b7280",
};

const GlobalStyles = () => (
  <style>{`
  :root{ color-scheme: only light; }
  html, body, #root{height:100%;}
  body{
    margin:0; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji","Segoe UI Emoji";
    background:${BRAND.bg}; color:${BRAND.text};
  }
  *{ box-sizing:border-box; }
  .page{ min-height:100%; width:100%; }
  .header{
    background:${BRAND.blue}; color:#fff; padding:16px 20px;
    position:sticky; top:0; z-index:10;
  }
  .sub{ font-size:12px; opacity:.9 }
  .wrap{ max-width:1150px; margin:0 auto; padding:16px; }
  .panel{ background:${BRAND.card}; border-radius:12px; box-shadow:0 2px 10px rgba(0,0,0,.05); margin:14px 0; }
  .panel > .phdr{ background:${BRAND.blue}; color:#fff; padding:10px 14px; border-radius:12px 12px 0 0; font-weight:600; }
  .panel > .pbd{ padding:14px; }
  .row{ display:flex; gap:14px; flex-wrap:wrap; }
  .card{ flex:1 1 170px; background:${BRAND.card}; border:1px solid #e5e7eb; border-radius:12px; padding:12px 14px; }
  .k{ font-size:12px; color:${BRAND.muted}; }
  .v{ font-size:20px; font-weight:700; margin-top:6px; display:flex; align-items:center; gap:8px; }
  .up{ color:${BRAND.ok}; font-weight:700; }
  .down{ color:${BRAND.bad}; font-weight:700; }
  .btn{
    background:${BRAND.blue}; color:#fff; border:none; padding:10px 14px; border-radius:10px; font-weight:600; cursor:pointer;
  }
  .btn:disabled{ opacity:.6; cursor:not-allowed; }
  .btn.sec{ background:#e5e7eb; color:#111827; }
  .btn.ok{ background:${BRAND.ok}; }
  .filters .form{
    display:grid; grid-template-columns: 1fr 1fr 1fr auto auto; gap:12px; align-items:end;
  }
  input[type=text], input[type=password], select{
    width:100%; padding:10px 12px; border-radius:10px; border:1px solid #d1d5db; background:#fff; color:#111;
    appearance:none; -webkit-appearance:none; -moz-appearance:none;
  }
  table{ width:100%; border-collapse:separate; border-spacing:0; }
  thead th{ text-align:left; font-size:12px; color:${BRAND.muted}; padding:10px 12px; position:sticky; top:0; background:${BRAND.card}; }
  tbody td{ padding:10px 12px; border-top:1px solid #eef2f7; }
  .mono{ font-variant-numeric: tabular-nums; }
  /* LOGIN */
  .login{
    min-height:100vh; display:grid; grid-template-columns: 520px 1fr;
    background:${BRAND.bg};
  }
  .login .left{
    padding:24px;
    background:linear-gradient(0deg, rgba(255,255,255,.85), rgba(255,255,255,.85)), url("https://generoso.com.br/static/7044e3eebe94961b290fb958dd42e7bc/17951/top-main-bg.webp") center/cover no-repeat;
  }
  .login .box{
    max-width:340px; background:#fff; border-radius:12px; box-shadow:0 6px 30px rgba(0,0,0,.08); padding:16px; border:1px solid #e5e7eb;
  }
  .login h1{ background:${BRAND.blue}; color:#fff; font-size:16px; padding:10px 12px; border-radius:10px; margin:0 0 8px 0; }
  /* PRINT (Exportar PDF) */
  @media print{
    .header, .filters .form button, .userbox, .logout, .adm-only{ display:none !important; }
    body{ background:#fff; }
    .wrap{ max-width:100%; padding:0; }
    .panel{ page-break-inside:avoid; box-shadow:none; border:1px solid #e5e7eb; }
    .phdr{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  }
`}</style>
);

/* ===========================================================
   SHAREPOINT ORIGEM (aba CDIAutomtico1)
   =========================================================== */
const XLSX_URL =
  "https://generosocombr-my.sharepoint.com/personal/controladoria_generoso_com_br/_layouts/15/download.aspx?share=ESLYowVkuEBEu82Jfnk-JQ0BfoDxwkd99RFtXTEzbARXEg&download=1";
const SHEET = "CDIAutomtico1";

/* Mapeamento por NOME de coluna (não por posição) */
const F = {
  data: "Custo de Distribuição[Data Baixa]",
  placa: "Custo de Distribuição[Placa]",
  tipo: "Custo de Distribuição[Tipo]",
  unidade: "Custo de Distribuição[Unidade]",
  rel: "Custo de Distribuição[Relacionamento]",

  receita: "[SumReceita_Líquida]",
  custoTotal: "[SumDiária_Total]",

  ajudante: "[SumAjudante]",
  comRec: "[SumComissão_de_Recepção]",
  descColeta: "[SumDesconto_de_Coleta]",
  diariaFixa: "[SumDiária_Fixa]",
  diariaManual: "[SumDiária_Manual]",
  diariaPerc: "[SumDiária_Percentual]",
  evento: "[SumEvento]",
  gurgelmix: "[SumGurgelmix]",
  herbalife: "[SumHerbalife]",
  saida: "[SumSaída]",
  setor400: "[SumSetor_400]",
  cfFrota: "[SumCusto_Fixo__Frota]",
  cvFrota: "[SumCusto_Variável__Frota]",
  salEncFrota: "[SumSal___Enc___Frota]",
  heFrota: "[SumH_E__Frota]",

  peso: "[SumPeso]",
  volumes: "[SumVolumes]",
  ctrcs: "[SumCTRC_s]",
  coletas: "[SumColetas]",
  entregas: "[SumEntregas]",
  valorMerc: "[SumValor_de_Mercadoria]",
  retorno: "[SumRetorno]",
  cdiPct: "[SumCDI]",
  cdi____: "[CDI____]",
} as const;

const COST_FIELDS: (keyof typeof F)[] = [
  "ajudante",
  "comRec",
  "descColeta",
  "diariaFixa",
  "diariaManual",
  "diariaPerc",
  "evento",
  "gurgelmix",
  "herbalife",
  "saida",
  "setor400",
  "cfFrota",
  "cvFrota",
  "salEncFrota",
  "heFrota",
];

/* ===========================================================
   HELPERS
   =========================================================== */
type Row = Record<string, any>;
type DataRow = {
  [F.data]: Date | number | string;
} & Row;

const parseDate = (v: any): Date | null => {
  if (v == null || v === "") return null;
  if (v instanceof Date) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  if (typeof v === "number") {
    // Excel serial -> JS date (assume 1900 system)
    const epoch = new Date(Date.UTC(1899, 11, 30)).getTime();
    const ms = epoch + v * 24 * 60 * 60 * 1000;
    const d = new Date(ms);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  // string
  const d = new Date(v);
  if (isNaN(+d)) return null;
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};

const fmtDateBR = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

const keyDate = (d: Date) => d.toISOString().slice(0, 10);
const sum = (arr: number[]) => arr.reduce((a, b) => a + (isFinite(b) ? b : 0), 0);
const num = (v: any) => (v == null || v === "" ? 0 : Number(v));

const unique = <T,>(arr: T[]) => Array.from(new Set(arr));

/* ===========================================================
   LOGIN mínimo (usa users.json já existente). Mantido simples.
   =========================================================== */
type User = { user: string; pass: string; role: "admin" | "user"; unidade?: string | "*" };

async function loadUsers(base: string): Promise<User[]> {
  try {
    const r = await fetch(`${base}users.json?${Date.now()}`, { cache: "no-store" });
    if (!r.ok) throw 0;
    return await r.json();
  } catch {
    // fallback local
    return [{ user: "gustavo", pass: "admin123", role: "admin", unidade: "*" }];
  }
}

/* ===========================================================
   APP
   =========================================================== */
export default function App() {
  const [logged, setLogged] = useState<User | null>(null);
  const base = (import.meta as any).env?.BASE_URL ?? "/";

  // login state
  const [u, setU] = useState("");
  const [p, setP] = useState("");

  // dados
  const [rows, setRows] = useState<DataRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastInfoDate, setLastInfoDate] = useState<Date | null>(null); // "Último dia do arquivo"

  // filtros
  const [selUnid, setSelUnid] = useState<string>("(todos)");
  const [selTipo, setSelTipo] = useState<string>("(todos)");
  const [selRel, setSelRel] = useState<string>("(todos)");

  // força leitura do último dia sempre que recarregar
  const [reloadNonce, setReloadNonce] = useState(0);

  /* ----------- login ------------- */
  useEffect(() => {
    const cache = localStorage.getItem("session_user");
    if (cache) setLogged(JSON.parse(cache));
  }, []);
  const doLogin = async () => {
    const list = await loadUsers(base);
    const found = list.find((x) => x.user.toLowerCase() === u.toLowerCase() && x.pass === p);
    if (!found) {
      alert("Usuário não encontrado");
      return;
    }
    setLogged(found);
    localStorage.setItem("session_user", JSON.stringify(found));
  };
  const logout = () => {
    setLogged(null);
    localStorage.removeItem("session_user");
  };

  /* ----------- carregar Excel ------------- */
  const loadXlsx = async () => {
    setLoading(true);
    try {
      // cache-buster para matar qualquer cache do CDN/ServiceWorker
      const url = `${XLSX_URL}&_=${Date.now()}`;
      const resp = await fetch(url, { cache: "no-store" });
      const buf = await resp.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true, raw: false });
      const ws = wb.Sheets[SHEET];
      const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: null });
      // normaliza data
      const withDate: DataRow[] = json.map((r) => {
        const d = parseDate(r[F.data]);
        return { ...r, [F.data]: d };
      });
      // último dia disponível do arquivo
      const dates = unique(
        withDate
          .map((r) => r[F.data] as Date | null)
          .filter((d): d is Date => !!d)
          .map((d) => keyDate(d))
      ).sort();
      const lastKey = dates[dates.length - 1];
      const lastD = new Date(lastKey + "T00:00:00Z");
      setLastInfoDate(lastD);
      setRows(withDate);
    } catch (e) {
      console.error(e);
      alert("Falha ao ler planilha.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (logged) loadXlsx();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logged, reloadNonce]);

  /* ----------- filtros + seleção do dia ------------- */
  const allUnids = useMemo(
    () => ["(todos)", ...unique(rows.map((r) => String(r[F.unidade] ?? "")).filter(Boolean)).sort()],
    [rows]
  );
  const allTipos = useMemo(
    () => ["(todos)", ...unique(rows.map((r) => String(r[F.tipo] ?? "")).filter(Boolean)).sort()],
    [rows]
  );
  const allRels = useMemo(
    () => ["(todos)", ...unique(rows.map((r) => String(r[F.rel] ?? "")).filter(Boolean)).sort()],
    [rows]
  );

  const filtered = useMemo(() => {
    let arr = rows.filter((r) => r[F.data] instanceof Date);
    if (selUnid !== "(todos)") arr = arr.filter((r) => r[F.unidade] === selUnid);
    if (selTipo !== "(todos)") arr = arr.filter((r) => r[F.tipo] === selTipo);
    if (selRel !== "(todos)") arr = arr.filter((r) => r[F.rel] === selRel);
    // escopo do admin quando não tem restrição de unidade
    if (logged && logged.role !== "admin" && logged.unidade && logged.unidade !== "*") {
      arr = arr.filter((r) => r[F.unidade] === logged.unidade);
    }
    return arr as (Row & { [F.data]: Date })[];
  }, [rows, selUnid, selTipo, selRel, logged]);

  // último dia REAL dentro do filtro
  const lastDay = useMemo(() => {
    const keys = unique(filtered.map((r) => keyDate(r[F.data] as Date))).sort();
    const k = keys[keys.length - 1];
    return k ? new Date(k + "T00:00:00Z") : null;
  }, [filtered]);

  // dia imediatamente anterior (disponível na base) para comparação
  const prevDay = useMemo(() => {
    const keys = unique(filtered.map((r) => keyDate(r[F.data] as Date))).sort();
    return keys.length > 1 ? new Date(keys[keys.length - 2] + "T00:00:00Z") : null;
  }, [filtered]);

  const atDay = (d: Date | null) =>
    d ? filtered.filter((r) => keyDate(r[F.data] as Date) === keyDate(d)) : [];

  const todayRows = useMemo(() => atDay(lastDay), [lastDay, filtered]);
  const prevRows = useMemo(() => atDay(prevDay), [prevDay, filtered]);

  /* ----------- agregações ------------- */
  const sumField = (arr: Row[], field: keyof typeof F) => sum(arr.map((r) => num(r[F[field]])));
  const sumsToday = useMemo(() => {
    return {
      receita: sumField(todayRows, "receita"),
      custo: sumField(todayRows, "custoTotal"),
      entregas: sumField(todayRows, "entregas"),
      coletas: sumField(todayRows, "coletas"),
      ctrcs: sumField(todayRows, "ctrcs"),
      peso: sumField(todayRows, "peso"),
    };
  }, [todayRows]);

  const sumsPrev = useMemo(() => {
    return {
      receita: sumField(prevRows, "receita"),
      custo: sumField(prevRows, "custoTotal"),
      entregas: sumField(prevRows, "entregas"),
      coletas: sumField(prevRows, "coletas"),
      ctrcs: sumField(prevRows, "ctrcs"),
      peso: sumField(prevRows, "peso"),
    };
  }, [prevRows]);

  const diff = (cur: number, old: number, invert = false) => {
    const delta = cur - old;
    if (!old) return { s: "•", cls: "k" };
    const up = delta > 0;
    const good = invert ? !up : up;
    return {
      s: `${up ? "▲" : "▼"} ${Math.abs(delta).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`,
      cls: good ? "up" : "down",
    };
  };

  // resumo por unidade
  const resumoUnid = useMemo(() => {
    const src = todayRows;
    const groups = new Map<
      string,
      { receita: number; custo: number; entr: number; col: number; ctrc: number; peso: number }
    >();
    for (const r of src) {
      const k = String(r[F.unidade] ?? "");
      const g = groups.get(k) || { receita: 0, custo: 0, entr: 0, col: 0, ctrc: 0, peso: 0 };
      g.receita += num(r[F.receita]);
      g.custo += num(r[F.custoTotal]);
      g.entr += num(r[F.entregas]);
      g.col += num(r[F.coletas]);
      g.ctrc += num(r[F.ctrcs]);
      g.peso += num(r[F.peso]);
      groups.set(k, g);
    }
    return [...groups.entries()]
      .map(([un, g]) => ({ un, ...g }))
      .sort((a, b) => a.un.localeCompare(b.un));
  }, [todayRows]);

  // vs média do tipo por unidade (peso/ctrcs/coletas/entregas)
  const mediaTipoUn = useMemo(() => {
    // agrupa por (unidade,tipo) e calcula médias por placa
    const map = new Map<string, { n: number; peso: number; ctrcs: number; coletas: number; entregas: number }>();
    for (const r of todayRows) {
      const key = `${r[F.unidade]}||${r[F.tipo]}`;
      const g = map.get(key) || { n: 0, peso: 0, ctrcs: 0, coletas: 0, entregas: 0 };
      g.n += 1;
      g.peso += num(r[F.peso]);
      g.ctrcs += num(r[F.ctrcs]);
      g.coletas += num(r[F.coletas]);
      g.entregas += num(r[F.entregas]);
      map.set(key, g);
    }
    const avg = new Map<string, { peso: number; ctrcs: number; coletas: number; entregas: number }>();
    for (const [k, g] of map) {
      avg.set(k, { peso: g.peso / g.n, ctrcs: g.ctrcs / g.n, coletas: g.coletas / g.n, entregas: g.entregas / g.n });
    }
    return avg;
  }, [todayRows]);

  const porPlaca = useMemo(() => {
    const rows = todayRows
      .map((r) => {
        const key = `${r[F.unidade]}||${r[F.tipo]}`;
        const avg = mediaTipoUn.get(key) || { peso: 0, ctrcs: 0, coletas: 0, entregas: 0 };
        const peso = num(r[F.peso]);
        const ctrcs = num(r[F.ctrcs]);
        const coletas = num(r[F.coletas]);
        const entregas = num(r[F.entregas]);

        const comp = (v: number, m: number) => {
          if (!m) return { tag: "= média", cls: "k" };
          if (v > m) return { tag: "▲ acima", cls: "up" };
          if (v < m) return { tag: "▼ abaixo", cls: "down" };
          return { tag: "= média", cls: "k" };
        };

        return {
          unidade: String(r[F.unidade] ?? ""),
          tipo: String(r[F.tipo] ?? ""),
          placa: String(r[F.placa] ?? ""),
          peso,
          ctrcs,
          coletas,
          entregas,
          pesoTag: comp(peso, avg.peso),
          ctrcsTag: comp(ctrcs, avg.ctrcs),
          coletasTag: comp(coletas, avg.coletas),
          entregasTag: comp(entregas, avg.entregas),
        };
      })
      .sort((a, b) => a.unidade.localeCompare(b.unidade) || a.tipo.localeCompare(b.tipo) || a.placa.localeCompare(b.placa));
    return rows;
  }, [todayRows, mediaTipoUn]);

  // top/bottom receitas e maiores custos
  const topReceitas = useMemo(() => {
    const arr = todayRows
      .map((r) => ({ placa: r[F.placa], unidade: r[F.unidade], tipo: r[F.tipo], receita: num(r[F.receita]) }))
      .sort((a, b) => b.receita - a.receita);
    return { top: arr.slice(0, 10), bottom: [...arr].reverse().slice(0, 10) };
  }, [todayRows]);

  const maiorCusto = useMemo(() => {
    const arr = todayRows
      .map((r) => ({
        placa: r[F.placa],
        unidade: r[F.unidade],
        tipo: r[F.tipo],
        custo: num(r[F.custoTotal]),
        entregas: num(r[F.entregas]),
        coletas: num(r[F.coletas]),
        ctrcs: num(r[F.ctrcs]),
      }))
      .sort((a, b) => b.custo - a.custo)
      .slice(0, 10);
    return arr;
  }, [todayRows]);

  // decomposição de TIPOS DE CUSTO (exclui Retorno/CDI); produção por tipo de custo
  const decomp = useMemo(() => {
    const lines = COST_FIELDS.map((f) => {
      const valor = sum(todayRows.map((r) => num(r[F[f]])));
      const prodRows = todayRows.filter((r) => num(r[F[f]]) > 0);
      const prod = {
        ctrcs: sum(prodRows.map((r) => num(r[F.ctrcs]))),
        coletas: sum(prodRows.map((r) => num(r[F.coletas]))),
        entregas: sum(prodRows.map((r) => num(r[F.entregas]))),
        peso: sum(prodRows.map((r) => num(r[F.peso]))),
      };
      return { nome: f, valor, ...prod };
    });
    const totalCustos = sum(lines.map((l) => l.valor));
    return lines
      .filter((l) => l.valor > 0)
      .map((l) => ({
        ...l,
        pct: totalCustos ? (l.valor / totalCustos) * 100 : 0,
        label: prettyCostLabel(l.nome),
      }))
      .sort((a, b) => b.valor - a.valor);
  }, [todayRows]);

  function prettyCostLabel(k: keyof typeof F) {
    const map: Record<string, string> = {
      ajudante: "Ajudante",
      comRec: "Comissão de Recepção",
      descColeta: "Desconto de Coleta",
      diariaFixa: "Diária Fixa",
      diariaManual: "Diária Manual",
      diariaPerc: "Diária Percentual",
      evento: "Evento",
      gurgelmix: "Gurgelmix",
      herbalife: "Herbalife",
      saida: "Saída",
      setor400: "Setor 400",
      cfFrota: "Custo Fixo (Frota)",
      cvFrota: "Custo Variável (Frota)",
      salEncFrota: "Sal.+Enc. (Frota)",
      heFrota: "H.E. (Frota)",
    };
    return map[k] || k;
  }

  // texto automático (curto e sem crases para evitar erro de string)
  const analiseTexto = useMemo(() => {
    const d = lastDay ? fmtDateBR(lastDay) : "-";
    const uni = selUnid === "(todos)" ? "todas" : selUnid;
    const difEntrega = diff(sumsToday.entregas, sumsPrev.entregas);
    const difColeta = diff(sumsToday.coletas, sumsPrev.coletas);
    const difCtrc = diff(sumsToday.ctrcs, sumsPrev.ctrcs);
    const difPeso = diff(sumsToday.peso, sumsPrev.peso);
    const topCusto = decomp[0]?.label || "-";

    const pontos = [
      `Unidade: ${uni}. Dia ${d}.`,
      `Receita ${sumsToday.receita.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} e Custo ${sumsToday.custo.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}.`,
      `Entregas ${difEntrega.s}, Coletas ${difColeta.s}, CTRCs ${difCtrc.s}, Peso ${difPeso.s}.`,
      `Custo que mais impactou hoje: ${topCusto}.`,
    ];
    return pontos.join(" ");
  }, [lastDay, selUnid, sumsToday, sumsPrev, decomp]);

  /* ===========================================================
     RENDER
     =========================================================== */
  if (!logged) {
    return (
      <>
        <GlobalStyles />
        <div className="login">
          <div className="left">
            <div className="box">
              <h1>CDI – Análise Diária</h1>
              <div className="k" style={{ marginBottom: 10 }}>
                Transporte Generoso – Controladoria
              </div>
              <div className="k">Usuário</div>
              <input value={u} onChange={(e) => setU(e.target.value)} placeholder="usuário" />
              <div className="k" style={{ marginTop: 10 }}>
                Senha
              </div>
              <input type="password" value={p} onChange={(e) => setP(e.target.value)} placeholder="senha" />
              <div style={{ marginTop: 12 }}>
                <button className="btn" onClick={doLogin}>
                  Entrar
                </button>
              </div>
            </div>
          </div>
          <div />
        </div>
      </>
    );
  }

  const lastInfo = lastInfoDate ? fmtDateBR(lastInfoDate) : "-";
  const dayLabel = lastDay ? fmtDateBR(lastDay) : "-";

  return (
    <div className="page">
      <GlobalStyles />

      <div className="header">
        <div className="wrap">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 800 }}>CDI – Análise Diária</div>
              <div className="sub">Transporte Generoso – Controladoria</div>
              <div className="sub">Último dia do arquivo: {lastInfo}</div>
            </div>
            <div className="userbox">
              <span className="sub" style={{ marginRight: 8 }}>
                {logged.user} ({logged.role})
              </span>
              <button className="btn sec logout" onClick={logout}>
                Sair
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="wrap">
        {/* FILTROS */}
        <div className="panel filters">
          <div className="phdr">Filtros</div>
          <div className="pbd">
            <div className="form">
              <div>
                <div className="k">Unidade</div>
                <select value={selUnid} onChange={(e) => setSelUnid(e.target.value)}>
                  {allUnids.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="k">Tipo de Veículo</div>
                <select value={selTipo} onChange={(e) => setSelTipo(e.target.value)}>
                  {allTipos.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="k">Relacionamento</div>
                <select value={selRel} onChange={(e) => setSelRel(e.target.value)}>
                  {allRels.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn" onClick={() => setReloadNonce((n) => n + 1)} disabled={loading}>
                {loading ? "Carregando..." : "Recarregar"}
              </button>
              <button className="btn ok" onClick={() => window.print()}>
                Exportar PDF
              </button>
            </div>
          </div>
        </div>

        {/* RESUMO DO DIA */}
        <div className="panel">
          <div className="phdr">Resumo do Dia</div>
          <div className="pbd">
            <div className="k" style={{ marginBottom: 8 }}>
              {`Resumo do dia ${dayLabel} — Unidades: ${selUnid === "(todos)" ? "todas" : selUnid}.`}
            </div>
            <div className="row">
              <div className="card">
                <div className="k">Receita</div>
                <div className="v mono">
                  {sumsToday.receita.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                  <span className={diff(sumsToday.receita, sumsPrev.receita).cls}>
                    {diff(sumsToday.receita, sumsPrev.receita).s}
                  </span>
                </div>
              </div>
              <div className="card">
                <div className="k">Custo</div>
                <div className="v mono">
                  {sumsToday.custo.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                  {/* custo: inverso (mais alto é pior) */}
                  <span className={diff(sumsToday.custo, sumsPrev.custo, true).cls}>
                    {diff(sumsToday.custo, sumsPrev.custo, true).s}
                  </span>
                </div>
              </div>
              <div className="card">
                <div className="k">Entregas</div>
                <div className="v mono">
                  {sumsToday.entregas.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                  <span className={diff(sumsToday.entregas, sumsPrev.entregas).cls}>
                    {diff(sumsToday.entregas, sumsPrev.entregas).s}
                  </span>
                </div>
              </div>
              <div className="card">
                <div className="k">Coletas</div>
                <div className="v mono">
                  {sumsToday.coletas.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                  <span className={diff(sumsToday.coletas, sumsPrev.coletas).cls}>
                    {diff(sumsToday.coletas, sumsPrev.coletas).s}
                  </span>
                </div>
              </div>
              <div className="card">
                <div className="k">CTRCs</div>
                <div className="v mono">
                  {sumsToday.ctrcs.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                  <span className={diff(sumsToday.ctrcs, sumsPrev.ctrcs).cls}>
                    {diff(sumsToday.ctrcs, sumsPrev.ctrcs).s}
                  </span>
                </div>
              </div>
              <div className="card">
                <div className="k">Peso (kg)</div>
                <div className="v mono">
                  {sumsToday.peso.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                  <span className={diff(sumsToday.peso, sumsPrev.peso).cls}>{diff(sumsToday.peso, sumsPrev.peso).s}</span>
                </div>
              </div>
            </div>

            {/* tabela por unidade */}
            <div style={{ marginTop: 12, overflowX: "auto" }}>
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
                  {(selUnid === "(todos)" ? resumoUnid : resumoUnid.filter((r) => r.un === selUnid)).map((r) => (
                    <tr key={r.un}>
                      <td>{r.un}</td>
                      <td className="mono">{r.receita.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                      <td className="mono">{r.custo.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                      <td className="mono">{r.entr.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                      <td className="mono">{r.col.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                      <td className="mono">{r.ctrc.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                      <td className="mono">{r.peso.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Por tipo → placa */}
        <div className="panel">
          <div className="phdr">Por Tipo de Veículo → Placa (sinalização vs. média do tipo na unidade)</div>
          <div className="pbd" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Unidade</th>
                  <th>Tipo</th>
                  <th>Placa</th>
                  <th>Peso</th>
                  <th>CTRCs</th>
                  <th>Coletas</th>
                  <th>Entregas</th>
                </tr>
              </thead>
              <tbody>
                {porPlaca.map((r) => (
                  <tr key={r.unidade + r.tipo + r.placa}>
                    <td>{r.unidade}</td>
                    <td>{r.tipo}</td>
                    <td>{r.placa}</td>
                    <td className="mono">
                      {r.peso.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}{" "}
                      <span className={r.pesoTag.cls}>{r.pesoTag.tag}</span>
                    </td>
                    <td className="mono">
                      {r.ctrcs.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}{" "}
                      <span className={r.ctrcsTag.cls}>{r.ctrcsTag.tag}</span>
                    </td>
                    <td className="mono">
                      {r.coletas.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}{" "}
                      <span className={r.coletasTag.cls}>{r.coletasTag.tag}</span>
                    </td>
                    <td className="mono">
                      {r.entregas.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}{" "}
                      <span className={r.entregasTag.cls}>{r.entregasTag.tag}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top/bottom receitas + maiores custos */}
        <div className="panel">
          <div className="phdr">Top 10 Receitas por Placa (dia)</div>
          <div className="pbd" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Unidade</th>
                  <th>Tipo</th>
                  <th>Receita</th>
                </tr>
              </thead>
              <tbody>
                {topReceitas.top.map((r, i) => (
                  <tr key={r.placa + i}>
                    <td>{String(r.placa)}</td>
                    <td>{String(r.unidade)}</td>
                    <td>{String(r.tipo)}</td>
                    <td className="mono">{r.receita.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="phdr">Bottom 10 Receitas por Placa (dia)</div>
          <div className="pbd" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Unidade</th>
                  <th>Tipo</th>
                  <th>Receita</th>
                </tr>
              </thead>
              <tbody>
                {topReceitas.bottom.map((r, i) => (
                  <tr key={r.placa + i}>
                    <td>{String(r.placa)}</td>
                    <td>{String(r.unidade)}</td>
                    <td>{String(r.tipo)}</td>
                    <td className="mono">{r.receita.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="phdr">Maiores Custos por Placa (Top 10 no dia)</div>
          <div className="pbd" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Unidade</th>
                  <th>Tipo</th>
                  <th>Custo Total</th>
                  <th>Entregas</th>
                  <th>Coletas</th>
                  <th>CTRCs</th>
                </tr>
              </thead>
              <tbody>
                {maiorCusto.map((r, i) => (
                  <tr key={r.placa + i}>
                    <td>{String(r.placa)}</td>
                    <td>{String(r.unidade)}</td>
                    <td>{String(r.tipo)}</td>
                    <td className="mono">{r.custo.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                    <td className="mono">{r.entregas.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                    <td className="mono">{r.coletas.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                    <td className="mono">{r.ctrcs.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Decomposição de custos */}
        <div className="panel">
          <div className="phdr">Decomposição de tipos de custo + produção do dia (por tipo de custo)</div>
          <div className="pbd" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Tipo de custo</th>
                  <th>Valor</th>
                  <th>% do total</th>
                  <th>CTRCs</th>
                  <th>Coletas</th>
                  <th>Entregas</th>
                  <th>Peso (kg)</th>
                </tr>
              </thead>
              <tbody>
                {decomp.map((l) => (
                  <tr key={l.nome}>
                    <td>{l.label}</td>
                    <td className="mono">{l.valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                    <td className="mono">{l.pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</td>
                    <td className="mono">{l.ctrcs.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                    <td className="mono">{l.coletas.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                    <td className="mono">{l.entregas.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                    <td className="mono">{l.peso.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Análise automática */}
        <div className="panel">
          <div className="phdr">Análise automática do dia</div>
          <div className="pbd">{analiseTexto}</div>
        </div>
      </div>
    </div>
  );
}
