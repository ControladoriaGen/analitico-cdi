// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

// =========================
// CONFIGURAÇÃO / CONSTANTES
// =========================
const DATA_URL =
  "https://generosocombr-my.sharepoint.com/personal/controladoria_generoso_com_br/_layouts/15/download.aspx?share=ESLYowVkuEBEu82Jfnk-JQ0BfoDxwkd99RFtXTEzbARXEg&download=1";

const SHEET_NAME = "CDIAutomtico1";

// Forçar tema claro em todo o app (inclusive selects e inputs)
const globalStyle = `
:root{
  color-scheme: only light;
  --brand:#0a2d8d;
  --bg:#f5f7fb;
  --text:#111827;
  --muted:#6b7280;
  --card:#ffffff;
  --ok:#16a34a;
  --down:#dc2626;
  --chip:#eef2ff;
  --shadow: 0 4px 16px rgba(2,10,40,.08);
}

*{box-sizing:border-box}
html,body,#root{height:100%}
body{
  margin:0;
  background:var(--bg);
  color:var(--text);
  font: 14px/1.3 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
}

/* container cheio */
.container{width:100%; max-width:1400px; margin:0 auto; padding:16px}

/* cards */
.card{background:var(--card); border-radius:10px; box-shadow:var(--shadow); padding:14px}

/* header azul */
.header{background:var(--brand); color:#fff; padding:14px 16px; border-radius:10px}

/* inputs */
input,select,button,textarea{
  font: inherit;
}
input,select{
  width:100%;
  background:#fff !important;
  color:var(--text) !important;
  border:1px solid #e5e7eb;
  border-radius:8px;
  padding:10px 12px;
  outline:none;
}
select{ appearance: none; background-image: linear-gradient(45deg,transparent 50%,#6b7280 50%),linear-gradient(135deg,#6b7280 50%,transparent 50%); background-position: calc(100% - 18px) calc(1em - 1px), calc(100% - 13px) calc(1em - 1px); background-size: 5px 5px,5px 5px; background-repeat:no-repeat;}
button{
  background:var(--brand); color:#fff; border:none; border-radius:8px; padding:10px 14px; cursor:pointer;
}
button[disabled]{opacity:.6; cursor:default}

.badge{display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--muted)}
.kpi{display:flex; gap:12px; flex-wrap:wrap}
.kpi .chip{min-width:180px; flex:1; background:#fff; border:1px solid #e5e7eb; padding:12px; border-radius:10px; box-shadow:var(--shadow)}
.kpi .title{font-size:12px; color:var(--muted); margin-bottom:4px}
.kpi .value{font-size:20px; font-weight:700}
.kpi .trend{font-size:12px; margin-left:6px}
.up{color:var(--ok)} .down{color:var(--down)}

.table{width:100%; border-collapse:separate; border-spacing:0; background:#fff; border-radius:10px; overflow:hidden; box-shadow:var(--shadow)}
.table th, .table td{padding:10px 12px; border-bottom:1px solid #f1f5f9; text-align:left}
.table thead th{background:#f8fafc; font-weight:600}
.table tr:last-child td{border-bottom:none}

.flex{display:flex; gap:14px; align-items:center}
.space{height:14px}

/* LOGIN */
.login-wrap{
  position:relative; min-height:100%;
  background: url('https://generoso.com.br/static/7044e3eebe94961b290fb958dd42e7bc/17951/top-main-bg.webp') center/cover no-repeat fixed;
}
.login-overlay{
  position:absolute; inset:0; background:linear-gradient(90deg, rgba(245,247,251,.9) 0%, rgba(245,247,251,.88) 35%, rgba(245,247,251,.75) 55%, rgba(245,247,251,.35) 100%);
}
.login-card{
  position:relative; z-index:2;
  width: 320px; margin: 60px;
  background:#fff; border-radius:12px; box-shadow:var(--shadow); padding:16px;
}
.login-title{background:var(--brand); color:#fff; padding:12px 14px; border-radius:10px; font-weight:700; margin:-2px -2px 12px}

/* topo */
.topbar{background:var(--brand); color:#fff; padding:14px}
.topbar .title{font-weight:800; font-size:18px}
.topbar .sub{font-size:12px; opacity:.9}
.topbar .right{margin-left:auto}

/* filtros */
.filtros .row{display:grid; grid-template-columns:1fr 1fr 1fr auto; gap:14px}

/* impressão (Exportar PDF) */
@media print{
  body{background:#fff}
  .login-wrap,.login-overlay,.topbar .right, .btns-print{ display:none !important }
  .container{max-width:100%; padding:0}
  .card{box-shadow:none; border:1px solid #e5e7eb; page-break-inside:avoid}
  .header{ -webkit-print-color-adjust:exact; print-color-adjust:exact }
}

/* util */
.small{font-size:12px; color:var(--muted)}
`;

type Row = {
  data: Date;
  unidade: string;
  tipo: string;
  placa: string;
  rel: string;
  receita: number;
  custo: number;
  peso: number;
  ctrcs: number;
  coletas: number;
  entregas: number;
  // custos específicos (parcial)
  ajudante: number;
  comrec: number;
  desconto: number;
  diariafixa: number;
  diariamanual: number;
  diariaperc: number;
  evento: number;
  gurgelmix: number;
  herbalife: number;
  setor400: number;
  custofixofrota: number;
  custovarifrota: number;
  salenfrota: number;
  hefrota: number;
  retorno: number;
  cdi_perc: number; // ignorado na UI
};

type User = {
  user: string;
  pass: string;
  role: "admin" | "user";
  unit: string; // escopo
};

// util numérico
const nf0 = (n: number) =>
  (isNaN(n) ? 0 : Math.round(n)).toLocaleString("pt-BR", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });

const fmtDate = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).toLocaleDateString(
    "pt-BR",
    { day: "2-digit", month: "2-digit", year: "numeric" }
  );

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

// =========================
// USUÁRIOS (sem mudanças)
// =========================
async function fetchUsers(): Promise<User[]> {
  try {
    // usa a versão publicada do próprio repositório
    const r = await fetch(
      "https://controladoriagen.github.io/analitico-cdi/public/users.json" +
        `?t=${Date.now()}`
    );
    if (!r.ok) throw new Error(String(r.status));
    const arr = (await r.json()) as User[];
    // fallback de segurança
    if (!arr?.length) throw new Error("vazio");
    return arr;
  } catch {
    // admin padrão – não mexer
    return [{ user: "gustavo", pass: "admin123", role: "admin", unit: "*" }];
  }
}

// =========================
// LEITURA DO EXCEL
// =========================
function parseValue(v: any): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function parseDate(cell: any): Date | null {
  if (!cell && cell !== 0) return null;
  // XLSX às vezes traz número em serial
  if (typeof cell === "number") {
    const date = XLSX.SSF.parse_date_code(cell);
    if (!date) return null;
    return new Date(date.y, date.m - 1, date.d);
  }
  const d = new Date(cell);
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function mapRow(r: any): Row | null {
  const d = parseDate(r["Custo de Distribuição[Data Baixa]"]);
  if (!d) return null;
  return {
    data: d,
    placa: String(r["Custo de Distribuição[Placa]"] ?? "").trim(),
    tipo: String(r["Custo de Distribuição[Tipo]"] ?? "").trim(),
    unidade: String(r["Custo de Distribuição[Unidade]"] ?? "").trim(),
    rel: String(r["Custo de Distribuição[Relacionamento]"] ?? "").trim(),
    receita: parseValue(r["[SumReceita_Líquida]"]),
    custo: parseValue(r["[SumDiária_Total]"]),
    peso: parseValue(r["[SumPeso]"]),
    ctrcs: parseValue(r["[SumCTRC_s]"]),
    coletas: parseValue(r["[SumColetas]"]),
    entregas: parseValue(r["[SumEntregas]"]),
    ajudante: parseValue(r["[SumAjudante]"]),
    comrec: parseValue(r["[SumComissão_de_Recepção]"]),
    desconto: parseValue(r["[SumDesconto_de_Coleta]"]),
    diariafixa: parseValue(r["[SumDiária_Fixa]"]),
    diariamanual: parseValue(r["[SumDiária_Manual]"]),
    diariaperc: parseValue(r["[SumDiária_Percentual]"]),
    evento: parseValue(r["[SumEvento]"]),
    gurgelmix: parseValue(r["[SumGurgelmix]"]),
    herbalife: parseValue(r["[SumHerbalife]"]),
    setor400: parseValue(r["[SumSetor_400]"]),
    custofixofrota: parseValue(r["[SumCusto_Fixo__Frota]"]),
    custovarifrota: parseValue(r["[SumCusto_Variável__Frota]"]),
    salenfrota: parseValue(r["[SumSal___Enc___Frota]"]),
    hefrota: parseValue(r["[SumH_E__Frota]"]),
    retorno: parseValue(r["[SumRetorno]"]),
    cdi_perc: parseValue(r["[CDI____]"]),
  };
}

async function loadExcel(): Promise<Row[]> {
  const r = await fetch(DATA_URL + `&t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`download: ${r.status}`);
  const buf = await r.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) throw new Error(`Aba "${SHEET_NAME}" não encontrada`);
  const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
  const rows: Row[] = [];
  for (const raw of json) {
    const m = mapRow(raw);
    if (m) rows.push(m);
  }
  return rows;
}

// agregações
type Tot = {
  receita: number;
  custo: number;
  entregas: number;
  coletas: number;
  ctrcs: number;
  peso: number;
};

const emptyTot: Tot = { receita: 0, custo: 0, entregas: 0, coletas: 0, ctrcs: 0, peso: 0 };

function sumRows(rows: Row[]): Tot {
  return rows.reduce(
    (acc, r) => {
      acc.receita += r.receita;
      acc.custo += r.custo;
      acc.entregas += r.entregas;
      acc.coletas += r.coletas;
      acc.ctrcs += r.ctrcs;
      acc.peso += r.peso;
      return acc;
    },
    { ...emptyTot }
  );
}

// =========================
// APP
// =========================
export default function App() {
  // estilo global
  useEffect(() => {
    const el = document.createElement("style");
    el.innerHTML = globalStyle;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);

  // auth
  const [users, setUsers] = useState<User[] | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [u, setU] = useState("");
  const [p, setP] = useState("");

  useEffect(() => {
    fetchUsers().then(setUsers).catch(() => setUsers([{ user: "gustavo", pass: "admin123", role: "admin", unit: "*" }]));
  }, []);

  function doLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!users) return;
    const found = users.find((x) => x.user.toLowerCase() === u.toLowerCase() && x.pass === p);
    if (!found) {
      alert("Usuário não encontrado");
      return;
    }
    setMe(found);
    sessionStorage.setItem("auth", JSON.stringify(found));
  }

  useEffect(() => {
    const s = sessionStorage.getItem("auth");
    if (s) try { setMe(JSON.parse(s)); } catch {}
  }, []);

  function logout() {
    sessionStorage.removeItem("auth");
    setMe(null);
  }

  // dados
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);

  // filtros
  const [fUnid, setFUnid] = useState<string>("(todos)");
  const [fTipo, setFTipo] = useState<string>("(todos)");
  const [fRel, setFRel] = useState<string>("(todos)");

  // carregar
  async function recarregar() {
    try {
      setLoading(true);
      const all = await loadExcel();
      setRows(all);
    } catch (err: any) {
      console.error(err);
      alert("Erro ao baixar/processar o Excel.");
    } finally {
      setLoading(false);
    }
  }

  // primeira carga
  useEffect(() => {
    recarregar();
  }, []);

  // universo por última data disponível
  const { lastDate, prevDate, rowsLast, rowsPrev, allUnidades, allTipos, allRels } = useMemo(() => {
    const base = rows ?? [];
    let dates = Array.from(
      new Set(base.map((r) => dateKey(r.data)))
    )
      .map((s) => new Date(s))
      .sort((a, b) => b.getTime() - a.getTime());

    const last = dates[0] ?? null;
    const prev = dates.find((d) => (last ? d.getTime() < last.getTime() : false)) ?? null;

    const filterBy = (arr: Row[]) =>
      arr.filter((r) => {
        if (last && dateKey(r.data) !== dateKey(last)) return false;
        if (me && me.unit && me.unit !== "*" && r.unidade !== me.unit) return false;
        if (fUnid !== "(todos)" && r.unidade !== fUnid) return false;
        if (fTipo !== "(todos)" && r.tipo !== fTipo) return false;
        if (fRel !== "(todos)" && r.rel !== fRel) return false;
        return true;
      });

    const filterPrev = (arr: Row[]) =>
      arr.filter((r) => {
        if (prev && dateKey(r.data) !== dateKey(prev)) return false;
        if (me && me.unit && me.unit !== "*" && r.unidade !== me.unit) return false;
        if (fUnid !== "(todos)" && r.unidade !== fUnid) return false;
        if (fTipo !== "(todos)" && r.tipo !== fTipo) return false;
        if (fRel !== "(todos)" && r.rel !== fRel) return false;
        return true;
      });

    const rowsLast = filterBy(base);
    const rowsPrev = filterPrev(base);

    const allUnid = Array.from(new Set(base.filter(r => !last || dateKey(r.data)===dateKey(last)).map((r) => r.unidade))).sort();
    const allTipos = Array.from(new Set(base.filter(r => !last || dateKey(r.data)===dateKey(last)).map((r) => r.tipo))).sort();
    const allRels = Array.from(new Set(base.filter(r => !last || dateKey(r.data)===dateKey(last)).map((r) => r.rel))).sort();

    return {
      lastDate: last,
      prevDate: prev,
      rowsLast,
      rowsPrev,
      allUnidades: allUnid,
      allTipos,
      allRels,
    };
  }, [rows, fUnid, fTipo, fRel, me]);

  const totLast = useMemo(() => sumRows(rowsLast), [rowsLast]);
  const totPrev = useMemo(() => sumRows(rowsPrev), [rowsPrev]);

  // resumo por unidade (quando “(todos)”)
  const resumoUnid = useMemo(() => {
    const map = new Map<string, Tot>();
    for (const r of rowsLast) {
      const k = r.unidade;
      const t = map.get(k) ?? { ...emptyTot };
      t.receita += r.receita;
      t.custo += r.custo;
      t.entregas += r.entregas;
      t.coletas += r.coletas;
      t.ctrcs += r.ctrcs;
      t.peso += r.peso;
      map.set(k, t);
    }
    return Array.from(map.entries()).map(([un, t]) => ({ un, ...t }));
  }, [rowsLast]);

  // por tipo → placa com setas vs média do tipo na unidade
  const porTipoPlaca = useMemo(() => {
    // médias por (unidade,tipo)
    const base = rowsLast;
    const grup: Record<string, { peso: number; ctrcs: number; coletas: number; entregas: number; n: number }> = {};
    for (const r of base) {
      const k = `${r.unidade}||${r.tipo}`;
      const g = (grup[k] ??= { peso: 0, ctrcs: 0, coletas: 0, entregas: 0, n: 0 });
      g.peso += r.peso;
      g.ctrcs += r.ctrcs;
      g.coletas += r.coletas;
      g.entregas += r.entregas;
      g.n++;
    }
    const media: Record<string, { peso: number; ctrcs: number; coletas: number; entregas: number }> = {};
    Object.entries(grup).forEach(([k, g]) => {
      media[k] = {
        peso: g.n ? g.peso / g.n : 0,
        ctrcs: g.n ? g.ctrcs / g.n : 0,
        coletas: g.n ? g.coletas / g.n : 0,
        entregas: g.n ? g.entregas / g.n : 0,
      };
    });

    return base
      .map((r) => {
        const m = media[`${r.unidade}||${r.tipo}`] ?? { peso: 0, ctrcs: 0, coletas: 0, entregas: 0 };
        const sinal = (v: number, ref: number) =>
          v > ref ? { s: "acima", css: "up" } : v < ref ? { s: "abaixo", css: "down" } : { s: "= média", css: "" };
        return {
          unidade: r.unidade,
          tipo: r.tipo,
          placa: r.placa,
          peso: `${nf0(r.peso)} `,
          pesoTag: sinal(r.peso, m.peso),
          ctrcs: `${nf0(r.ctrcs)} `,
          ctrcsTag: sinal(r.ctrcs, m.ctrcs),
          coletas: `${nf0(r.coletas)} `,
          coletasTag: sinal(r.coletas, m.coletas),
          entregas: `${nf0(r.entregas)} `,
          entregasTag: sinal(r.entregas, m.entregas),
        };
      })
      .sort((a, b) => a.unidade.localeCompare(b.unidade) || a.tipo.localeCompare(b.tipo) || a.placa.localeCompare(b.placa));
  }, [rowsLast]);

  // top/bottom receitas e maiores custos
  const topReceita = useMemo(() => {
    return [...rowsLast]
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 10)
      .map((r) => ({ placa: r.placa, unidade: r.unidade, tipo: r.tipo, receita: nf0(r.receita) }));
  }, [rowsLast]);

  const bottomReceita = useMemo(() => {
    return [...rowsLast]
      .sort((a, b) => a.receita - b.receita)
      .slice(0, 10)
      .map((r) => ({ placa: r.placa, unidade: r.unidade, tipo: r.tipo, receita: nf0(r.receita) }));
  }, [rowsLast]);

  const maioresCustos = useMemo(() => {
    return [...rowsLast]
      .sort((a, b) => b.custo - a.custo)
      .slice(0, 10)
      .map((r) => ({
        placa: r.placa,
        unidade: r.unidade,
        tipo: r.tipo,
        custo: nf0(r.custo),
        entregas: nf0(r.entregas),
        coletas: nf0(r.coletas),
        ctrcs: nf0(r.ctrcs),
      }));
  }, [rowsLast]);

  // decomposição por tipo de custo + produção do dia (veículos que incorreram)
  const decomposicao = useMemo(() => {
    type Linha = { tipo: string; valor: number; pct: number; ctrcs: number; coletas: number; entregas: number; peso: number };
    const somaTotal = rowsLast.reduce((acc, r) => acc + r.custo, 0) || 1;

    const add = (map: Map<string, Linha>, tipo: string, valor: number, r: Row) => {
      if (!valor) return;
      const key = tipo;
      const at = map.get(key) ?? { tipo, valor: 0, pct: 0, ctrcs: 0, coletas: 0, entregas: 0, peso: 0 };
      at.valor += valor;
      at.ctrcs += r.ctrcs;
      at.coletas += r.coletas;
      at.entregas += r.entregas;
      at.peso += r.peso;
      map.set(key, at);
    };

    const map = new Map<string, Linha>();
    for (const r of rowsLast) {
      add(map, "Ajudante", r.ajudante, r);
      add(map, "Comissão de Recepção", r.comrec, r);
      add(map, "Desconto de Coleta", r.desconto, r);
      add(map, "Diária Fixa", r.diariafixa, r);
      add(map, "Diária Manual", r.diariamanual, r);
      add(map, "Diária Percentual", r.diariaperc, r);
      add(map, "Evento", r.evento, r);
      add(map, "Gurgelmix", r.gurgelmix, r);
      add(map, "Herbalife", r.herbalife, r);
      add(map, "Setor 400", r.setor400, r);
      add(map, "Custo Fixo (Frota)", r.custofixofrota, r);
      add(map, "Custo Variável (Frota)", r.custovarifrota, r);
      add(map, "Sal/Enc (Frota)", r.salenfrota, r);
      add(map, "H.E. (Frota)", r.hefrota, r);
      add(map, "Retorno", r.retorno, r);
    }
    const out = Array.from(map.values())
      .map((x) => ({ ...x, pct: x.valor / somaTotal }))
      .sort((a, b) => b.valor - a.valor);
    return out;
  }, [rowsLast]);

  // análise automática (texto)
  const analiseTexto = useMemo(() => {
    if (!lastDate) return "";
    const t = totLast;
    const y = totPrev;
    const delta = (a: number, b: number) => {
      const d = a - b;
      const s = d === 0 ? "estável" : d > 0 ? "acima" : "abaixo";
      return `${s} (${nf0(Math.abs(d))})`;
    };

    // principais alavancas (3 maiores linhas de custo)
    const topCustos = [...decomposicao].slice(0, 3).map((x) => x.tipo).join(", ");

    // veículos com baixa produtividade (abaixo média em 3+ métricas)
    const critic = porTipoPlaca
      .filter((r) => {
        let below = 0;
        if (r.pesoTag.css === "down") below++;
        if (r.ctrcsTag.css === "down") below++;
        if (r.coletasTag.css === "down") below++;
        if (r.entregasTag.css === "down") below++;
        return below >= 3;
      })
      .slice(0, 6)
      .map((x) => `${x.placa} (${x.unidade}/${x.tipo})`)
      .join(", ");

    const un = fUnid === "(todos)" ? "todas" : fUnid;
    return [
      `Unidade: ${un}. Dia ${fmtDate(lastDate)}.`,
      `Receita ${nf0(t.receita)} – ${delta(t.receita, y.receita)} vs. dia anterior;`,
      `custo ${nf0(t.custo)} – ${delta(t.custo, y.custo)}; entregas ${nf0(t.entregas)} – ${delta(
        t.entregas,
        y.entregas
      )}; coletas ${nf0(t.coletas)} – ${delta(t.coletas, y.coletas)}; CTRCs ${nf0(t.ctrcs)} – ${delta(
        t.ctrcs,
        y.ctrcs
      )}.`,
      `Pontos de atenção (custo alto ou produtividade abaixo da média do tipo/unidade): ${critic || "—"}.`,
      `Sugestões: revisar escalas e roteirização das placas acima; reavaliar tipos de pagamento que mais impactaram o custo do dia; observar setores com entregas abaixo da média.`,
      `Custos que mais impactaram hoje: ${topCustos || "—"}.`,
    ].join(" ");
  }, [totLast, totPrev, decomposicao, porTipoPlaca, lastDate, fUnid]);

  // exportar PDF
  function exportarPDF() {
    window.print();
  }

  // =========================
  // RENDER
  // =========================
  if (!me) {
    return (
      <div className="login-wrap">
        <div className="login-overlay" />
        <form className="login-card" onSubmit={doLogin}>
          <div className="login-title">CDI – Análise Diária</div>
          <div className="small" style={{ marginBottom: 8 }}>
            Transporte Generoso – Controladoria
          </div>
          <div style={{ marginBottom: 8 }}>
            <label className="small">Usuário</label>
            <input value={u} onChange={(e) => setU(e.target.value)} autoFocus />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="small">Senha</label>
            <input type="password" value={p} onChange={(e) => setP(e.target.value)} />
          </div>
          <button type="submit" style={{ width: "100%", background: "var(--brand)" }}>
            Entrar
          </button>
        </form>
      </div>
    );
  }

  return (
    <>
      <div className="topbar">
        <div className="container" style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div>
            <div className="title">CDI – Análise Diária</div>
            <div className="sub">Transporte Generoso – Controladoria</div>
            <div className="sub">Último dia do arquivo: {lastDate ? fmtDate(lastDate) : "…"}</div>
          </div>
          <div className="right flex">
            <span className="small"> {me.user} ({me.role}) </span>
            <button onClick={logout}>Sair</button>
          </div>
        </div>
      </div>

      <div className="container">
        {/* Filtros */}
        <div className="card filtros">
          <div className="header" style={{ margin:-14, marginBottom:12 }}>Filtros</div>
          <div className="row">
            <select value={fUnid} onChange={(e) => setFUnid(e.target.value)}>
              <option>(todos)</option>
              {allUnidades.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            <select value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
              <option>(todos)</option>
              {allTipos.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select value={fRel} onChange={(e) => setFRel(e.target.value)}>
              <option>(todos)</option>
              {allRels.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            <div className="flex">
              <button onClick={recarregar} disabled={loading}>
                {loading ? "Carregando..." : "Recarregar"}
              </button>
              <button className="btns-print" onClick={exportarPDF} style={{ background:"#0b4", boxShadow:"var(--shadow)" }}>
                Exportar PDF
              </button>
            </div>
          </div>
        </div>

        {/* Resumo do Dia */}
        <div className="card">
          <div className="header" style={{ margin:-14, marginBottom:12 }}>Resumo do Dia</div>
          <div className="small" style={{ marginBottom: 10 }}>
            Resumo do dia {lastDate ? fmtDate(lastDate) : "…"}
            {fUnid !== "(todos)" ? ` — Unidade: ${fUnid}.` : " — Unidades (todas)."}
          </div>

          <div className="kpi">
            <Kpi label="Receita" v={totLast.receita} prev={totPrev.receita} />
            <Kpi label="Custo" v={totLast.custo} prev={totPrev.custo} />
            <Kpi label="Entregas" v={totLast.entregas} prev={totPrev.entregas} />
            <Kpi label="Coletas" v={totLast.coletas} prev={totPrev.coletas} />
            <Kpi label="CTRCs" v={totLast.ctrcs} prev={totPrev.ctrcs} />
            <Kpi label="Peso (kg)" v={totLast.peso} prev={totPrev.peso} />
          </div>

          {/* tabela por unidade quando "(todos)" */}
          <div className="space" />
          <table className="table">
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
              {(fUnid === "(todos)" ? resumoUnid : resumoUnid.filter((x) => x.un === fUnid)).map((x) => (
                <tr key={x.un}>
                  <td>{x.un}</td>
                  <td>{nf0(x.receita)}</td>
                  <td>{nf0(x.custo)}</td>
                  <td>{nf0(x.entregas)}</td>
                  <td>{nf0(x.coletas)}</td>
                  <td>{nf0(x.ctrcs)}</td>
                  <td>{nf0(x.peso)}</td>
                </tr>
              ))}
              {resumoUnid.length === 0 && (
                <tr><td colSpan={7} className="small">Sem dados para os filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Por Tipo → Placa */}
        <div className="space" />
        <div className="card">
          <div className="header" style={{ margin:-14, marginBottom:12 }}>
            Por Tipo de Veículo → Placa (sinalização vs. média do tipo na unidade)
          </div>
          <table className="table">
            <thead>
            <tr>
              <th>Unidade</th><th>Tipo</th><th>Placa</th>
              <th>Peso</th><th>CTRCs</th><th>Coletas</th><th>Entregas</th>
            </tr>
            </thead>
            <tbody>
              {porTipoPlaca.map((r, i) => (
                <tr key={r.unidade + r.tipo + r.placa + i}>
                  <td>{r.unidade}</td>
                  <td>{r.tipo}</td>
                  <td>{r.placa}</td>
                  <td>
                    {r.peso}
                    <span className={`small ${r.pesoTag.css}`}> {arrow(r.pesoTag.css)} {r.pesoTag.s}</span>
                  </td>
                  <td>
                    {r.ctrcs}
                    <span className={`small ${r.ctrcsTag.css}`}> {arrow(r.ctrcsTag.css)} {r.ctrcsTag.s}</span>
                  </td>
                  <td>
                    {r.coletas}
                    <span className={`small ${r.coletasTag.css}`}> {arrow(r.coletasTag.css)} {r.coletasTag.s}</span>
                  </td>
                  <td>
                    {r.entregas}
                    <span className={`small ${r.entregasTag.css}`}> {arrow(r.entregasTag.css)} {r.entregasTag.s}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Top/Bottom receitas + maiores custos */}
        <div className="space" />
        <div className="flex">
          <div className="card" style={{ flex: 1 }}>
            <div className="header" style={{ margin:-14, marginBottom:12 }}>Top 10 Receitas por Placa (dia)</div>
            <table className="table">
              <thead><tr><th>Placa</th><th>Unidade</th><th>Tipo</th><th>Receita</th></tr></thead>
              <tbody>
                {topReceita.map((r, i) => (
                  <tr key={r.placa + i}><td>{r.placa}</td><td>{r.unidade}</td><td>{r.tipo}</td><td>{r.receita}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <div className="header" style={{ margin:-14, marginBottom:12 }}>Bottom 10 Receitas por Placa (dia)</div>
            <table className="table">
              <thead><tr><th>Placa</th><th>Unidade</th><th>Tipo</th><th>Receita</th></tr></thead>
              <tbody>
                {bottomReceita.map((r, i) => (
                  <tr key={r.placa + i}><td>{r.placa}</td><td>{r.unidade}</td><td>{r.tipo}</td><td>{r.receita}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space" />
        <div className="card">
          <div className="header" style={{ margin:-14, marginBottom:12 }}>Maiores Custos por Placa (Top 10 no dia)</div>
          <table className="table">
            <thead><tr><th>Placa</th><th>Unidade</th><th>Tipo</th><th>Custo Total</th><th>Entregas</th><th>Coletas</th><th>CTRCs</th></tr></thead>
            <tbody>
              {maioresCustos.map((r, i) => (
                <tr key={r.placa + i}><td>{r.placa}</td><td>{r.unidade}</td><td>{r.tipo}</td><td>{r.custo}</td><td>{r.entregas}</td><td>{r.coletas}</td><td>{r.ctrcs}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Decomposição */}
        <div className="space" />
        <div className="card">
          <div className="header" style={{ margin:-14, marginBottom:12 }}>
            Decomposição de tipos de custo + produção do dia (por tipo de custo)
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Tipo de custo</th><th>Valor</th><th>% do total</th>
                <th>CTRCs</th><th>Coletas</th><th>Entregas</th><th>Peso (kg)</th>
              </tr>
            </thead>
            <tbody>
              {decomposicao.map((x) => (
                <tr key={x.tipo}>
                  <td>{x.tipo}</td>
                  <td>{nf0(x.valor)}</td>
                  <td>{(x.pct * 100).toFixed(1).replace(".", ",")}%</td>
                  <td>{nf0(x.ctrcs)}</td>
                  <td>{nf0(x.coletas)}</td>
                  <td>{nf0(x.entregas)}</td>
                  <td>{nf0(x.peso)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Análise automática */}
        <div className="space" />
        <div className="card">
          <div className="header" style={{ margin:-14, marginBottom:12 }}>Análise automática do dia</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{analiseTexto}</div>
        </div>

        <div className="space" />
      </div>
    </>
  );
}

// =========================
// COMPONENTES MENORES
// =========================
function Kpi({ label, v, prev }: { label: string; v: number; prev: number }) {
  const diff = v - prev;
  const css = diff === 0 ? "" : diff > 0 ? "up" : "down";
  return (
    <div className="chip">
      <div className="title">{label}</div>
      <div className="value">
        {nf0(v)}{" "}
        <span className={`trend ${css}`}>
          {css ? arrow(css) : "•"} {nf0(Math.abs(diff))}
        </span>
      </div>
    </div>
  );
}

function arrow(kind: "up" | "down" | "") {
  if (kind === "up") return "▲";
  if (kind === "down") return "▼";
  return "•";
}
