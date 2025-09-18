import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ScatterChart, Scatter,
  PieChart, Pie, Cell
} from "recharts";

/* =========================
   CONFIG (manter layout e fluxo existentes)
========================= */

// SharePoint (sempre baixar de novo; sem cache)
const SP_URL =
  "https://generosocombr-my.sharepoint.com/personal/controladoria_generoso_com_br/_layouts/15/download.aspx?share=ESLYowVkuEBEu82Jfnk-JQ0BfoDxwkd99RFtXTEzbARXEg&download=1";

// A aba verdadeira é "CDIAutomtico1" (sem acento). Vamos localizar de forma tolerante.
const TARGET_SHEET_HINT = "CDIAutomtico1";

// Users (GitHub)
const GH_OWNER = "ControladoriaGen";
const GH_REPO = "analitico-cdi";
const GH_BRANCH = "main";
const GH_USERS_PATH = "public/users.json";
const GH_API_BASE = "https://api.github.com";
const GH_RAW = `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}/${GH_USERS_PATH}`;

// Fundo do login (imagem em public/login-bg.jpg)
const LOGIN_BG = "/analitico-cdi/login-bg.jpg";

/* =========================
   UTILS
========================= */

const stripDiacritics = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normalizeKey = (s: string) =>
  stripDiacritics(String(s)).toLowerCase().replace(/\s+|_/g, "");

const coerceNumberBR = (val: any): number | null => {
  if (val == null) return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  const s = String(val).trim();
  if (!s) return null;
  // remove milhar ".", troca "," por "."
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
};

const asDate = (v: any): Date | null => {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === "number") {
    const o = XLSX.SSF.parse_date_code(v);
    if (o && o.y && o.m && o.d) return new Date(o.y, o.m - 1, o.d);
  }
  const s = String(v).trim();
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m1) {
    const d = +m1[1], mo = +m1[2], y = +m1[3] < 100 ? 2000 + +m1[3] : +m1[3];
    const dt = new Date(y, mo - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const fmtBRL = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "R$ 0";
const fmtInt = (n: number) => Number.isFinite(n) ? n.toLocaleString("pt-BR") : "0";
const fmtKg = (n: number) => Number.isFinite(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "0";

/* =========================
   LOGIN / USERS
========================= */

type UserRec = { usuario: string; senha: string; perfil: "admin" | "user"; unidade?: string };

async function fetchUsersRemote(): Promise<UserRec[] | null> {
  try {
    const r = await fetch(GH_RAW, { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j) ? (j as UserRec[]) : null;
  } catch {
    return null;
  }
}

function loadUsersLocal(): UserRec[] | null {
  try {
    const s = localStorage.getItem("users_local");
    if (!s) return null;
    const j = JSON.parse(s);
    return Array.isArray(j) ? (j as UserRec[]) : null;
  } catch {
    return null;
  }
}

/* =========================
   DATA TYPES & COLUMN MAP
========================= */

type Row = Record<string, any>;

type MappedCols = {
  dateCol: string | null;
  unitCol: string | null;
  typeCol: string | null;
  relCol: string | null;
  plateCol: string | null;

  receitaCol: string | null;     // SumReceita_Líquida
  custoTotalCol: string | null;  // SumDiária_Total
  retornoCol: string | null;     // SumRetorno

  entregasCols: string[]; // contém 'entrega'
  coletasCols: string[];  // contém 'coleta'
  ctrcsCols: string[];    // contém 'ctrc'
  pesoCols: string[];     // contém 'peso'

  costComponentCols: string[];   // todas as Sum* EXCETO receita, total, retorno, cdi
};

// labels amigáveis fornecidas
const COST_LABELS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const put = (raw: string, label: string) => (map[normalizeKey(raw)] = label);
  put("SumAjudante", "Custo de Ajudantes");
  put("SumComissão_de_Recepção", "Comissão de Recepção");
  put("SumDesconto_de_Coleta", "Desconto de Coletas");
  put("SumDiária_Fixa", "Diárias Fixas: Agregados");
  put("SumDiária_Manual", "Diária Manual");
  put("SumDiária_Percentual", "Pagamento Percentual: Agregados");
  put("SumEvento", "Diária de Eventos: Agregados");
  put("SumGurgelmix", "Eventos Gurgelmix: Agregados");
  put("SumHerbalife", "Eventos Herbalife: Agregados");
  put("SumSaída", "Pagamento de Saídas");
  put("SumSetor_400", "Pagamento Setor 400");
  put("SumCusto_Fixo__Frota", "Custo Fixo: Frota");
  put("SumCusto_Variável__Frota", "Custo Variável: Frota");
  put("SumSal___Enc___Frota", "Custo de MO: Frota");
  put("SumH_E__Frota", "Custo de HEX: Frota");
  return map;
})();

function mapColumns(headers: string[]): MappedCols {
  const norm = (h: string) => normalizeKey(h);
  const has = (s: string, ...bits: string[]) => bits.every((b) => s.includes(b));

  const dateCol = headers.find((h) => /datab|databas|data/.test(norm(h))) || null;
  const unitCol = headers.find((h) => /unidade/.test(norm(h))) || null;
  const typeCol = headers.find((h) => /tipo/.test(norm(h))) || null;
  const relCol = headers.find((h) => /relaciona/.test(norm(h))) || null;
  const plateCol = headers.find((h) => /placa/.test(norm(h))) || null;

  // específicos
  const receitaCol = headers.find((h) => has(norm(h), "sumreceita", "liquida")) || null;
  const custoTotalCol = headers.find((h) => has(norm(h), "sumdiaria", "total")) || null;
  const retornoCol = headers.find((h) => has(norm(h), "sumretorno")) || null;

  const entregasCols = headers.filter((h) => /entrega/.test(norm(h)));
  const coletasCols  = headers.filter((h) => /coleta/.test(norm(h)));
  const ctrcsCols    = headers.filter((h) => /ctrc/.test(norm(h)));
  const pesoCols     = headers.filter((h) => /peso/.test(norm(h)));

  // componentes de custo = tudo que começa com sum*, MENOS total/receita/retorno/cdi
  const isComponent = (h: string) => {
    const n = norm(h);
    if (!/^sum/.test(n)) return false;
    if (n.includes("receita")) return false;
    if (n.includes("diariatotal")) return false;
    if (n.includes("retorno")) return false;
    if (n === "cdi____" || n.includes("sumcdi")) return false;
    return true;
  };
  const costComponentCols = headers.filter(isComponent);

  return {
    dateCol, unitCol, typeCol, relCol, plateCol,
    receitaCol, custoTotalCol, retornoCol,
    entregasCols, coletasCols, ctrcsCols, pesoCols,
    costComponentCols,
  };
}

function sumCols(rows: Row[], cols: string[], parseAsNumber = true): number {
  if (!cols.length) return 0;
  let total = 0;
  for (const r of rows) {
    for (const c of cols) {
      const v = r[c];
      const n = parseAsNumber ? coerceNumberBR(v) : Number(v);
      if (n != null) total += n;
    }
  }
  return total;
}

function sumCol(rows: Row[], col: string | null): number {
  if (!col) return 0;
  return sumCols(rows, [col]);
}

/* =========================
   APP
========================= */

const App: React.FC = () => {
  // auth
  const [users, setUsers] = useState<UserRec[] | null>(null);
  const [user, setUser] = useState<UserRec | null>(null);
  const [loginU, setLoginU] = useState("");
  const [loginP, setLoginP] = useState("");
  const [authError, setAuthError] = useState("");

  // dados
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapped, setMapped] = useState<MappedCols | null>(null);

  const [unidade, setUnidade] = useState<string>("(todos)");
  const [tipo, setTipo] = useState<string>("(todos)");
  const [rel, setRel] = useState<string>("(todos)");

  const [lastDate, setLastDate] = useState<Date | null>(null);

  // ======= LOGIN =======
  useEffect(() => {
    (async () => {
      const remote = await fetchUsersRemote();
      if (remote) {
        setUsers(remote);
      } else {
        const local = loadUsersLocal();
        setUsers(local || []);
      }
    })();
  }, []);

  function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    if (!users || !users.length) {
      setAuthError("Lista de usuários não carregada.");
      return;
    }
    const found = users.find((u) => u.usuario === loginU && u.senha === loginP);
    if (!found) {
      setAuthError("Usuário ou senha inválidos.");
      return;
    }
    setUser(found);
    setLoginP("");
  }

  function logout() {
    setUser(null);
  }

  // ======= LEITURA SHAREPOINT =======
  async function loadFromSharePoint() {
    setLoading(true);
    setErr("");
    try {
      const url = `${SP_URL}${SP_URL.includes("?") ? "&" : "?"}t=${Date.now()}`;
      const resp = await fetch(url, { method: "GET", cache: "no-store" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ao baixar o arquivo`);

      const buf = await resp.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });

      // localizar a aba de forma tolerante
      const want = normalizeKey(TARGET_SHEET_HINT);
      let chosen = wb.SheetNames.find((n) => normalizeKey(n) === want);
      if (!chosen) chosen = wb.SheetNames.find((n) => normalizeKey(n).includes(want));
      if (!chosen) {
        throw new Error(`Aba "${TARGET_SHEET_HINT}" não encontrada. Abas: ${wb.SheetNames.join(", ")}`);
      }

      const ws = wb.Sheets[chosen];
      const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      if (!aoa || !aoa.length) throw new Error(`Aba "${chosen}" vazia.`);

      const hdr = aoa[0].map((h) => String(h || "").trim());
      const data = aoa.slice(1).map((line) => {
        const o: Row = {};
        hdr.forEach((h, i) => (o[h] = line[i]));
        return o;
      });

      setHeaders(hdr);
      const m = mapColumns(hdr);
      setMapped(m);

      // normaliza a coluna Data Base -> Date
      const dateCol = m.dateCol;
      const normalized = dateCol
        ? data.map((r) => ({ ...r, __date__: asDate(r[dateCol]) }))
        : data.map((r) => ({ ...r, __date__: null as Date | null }));

      // último dia disponível
      let maxDate: Date | null = null;
      for (const r of normalized) {
        if (r.__date__ && (!maxDate || r.__date__ > maxDate)) maxDate = r.__date__;
      }
      setLastDate(maxDate);
      setRows(normalized);
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || String(e));
      setHeaders([]);
      setRows([]);
      setMapped(null);
      setLastDate(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) {
      // Força unidade do usuário comum
      if (user.perfil === "user" && user.unidade) setUnidade(user.unidade);
      loadFromSharePoint();
    }
  }, [user]);

  // ======= FILTRO & AGREGAÇÃO =======
  const unidadesRaw = useMemo(() => {
    if (!mapped?.unitCol) return [];
    const s = new Set<string>();
    rows.forEach((r) => {
      const v = String(r[mapped.unitCol as string] ?? "").trim();
      if (v) s.add(v);
    });
    return Array.from(s).sort();
  }, [rows, mapped]);

  // Se user (perfil user) tiver unidade fixa, restringe a lista
  const unidades = useMemo(() => {
    if (user?.perfil === "user" && user.unidade) return [user.unidade];
    return unidadesRaw;
  }, [unidadesRaw, user]);

  const tipos = useMemo(() => {
    if (!mapped?.typeCol) return [];
    const s = new Set<string>();
    rows.forEach((r) => {
      const v = String(r[mapped.typeCol as string] ?? "").trim();
      if (v) s.add(v);
    });
    return Array.from(s).sort();
  }, [rows, mapped]);

  const rels = useMemo(() => {
    if (!mapped?.relCol) return [];
    const s = new Set<string>();
    rows.forEach((r) => {
      const v = String(r[mapped.relCol as string] ?? "").trim();
      if (v) s.add(v);
    });
    return Array.from(s).sort();
  }, [rows, mapped]);

  const filtered = useMemo(() => {
    let arr = rows;
    // por padrão, mostrar somente o último dia (se existir)
    if (lastDate) {
      arr = arr.filter((r) => r.__date__ && +r.__date__ === +lastDate);
    }
    // Restrição de perfil user: força unidade
    if (user?.perfil === "user" && user.unidade && mapped?.unitCol) {
      arr = arr.filter((r) => String(r[mapped.unitCol as string]) === user.unidade);
    } else if (unidade !== "(todos)" && mapped?.unitCol) {
      arr = arr.filter((r) => String(r[mapped.unitCol as string]) === unidade);
    }
    if (tipo !== "(todos)" && mapped?.typeCol) {
      arr = arr.filter((r) => String(r[mapped.typeCol as string]) === tipo);
    }
    if (rel !== "(todos)" && mapped?.relCol) {
      arr = arr.filter((r) => String(r[mapped.relCol as string]) === rel);
    }
    return arr;
  }, [rows, lastDate, unidade, tipo, rel, mapped, user]);

  const totals = useMemo(() => {
    if (!mapped) return { receita: 0, custo: 0, entregas: 0, coletas: 0, ctrcs: 0, peso: 0 };
    const receita = sumCol(filtered, mapped.receitaCol);
    // custo total vem apenas da coluna SumDiária_Total
    const custo = sumCol(filtered, mapped.custoTotalCol);
    const entregas = sumCols(filtered, mapped.entregasCols, true);
    const coletas = sumCols(filtered, mapped.coletasCols, true);
    const ctrcs = sumCols(filtered, mapped.ctrcsCols, true);
    const peso = sumCols(filtered, mapped.pesoCols, true);
    return { receita, custo, entregas, coletas, ctrcs, peso };
  }, [filtered, mapped]);

  // agrupamentos por placa e por relacionamento
  const byPlaca = useMemo(() => {
    if (!mapped?.plateCol) return [];
    const map = new Map<string, Row[]>();
    filtered.forEach((r) => {
      const p = String(r[mapped.plateCol as string] ?? "");
      if (!map.has(p)) map.set(p, []);
      map.get(p)!.push(r);
    });
    const arr = Array.from(map.entries()).map(([placa, items]) => ({
      placa,
      receita: sumCol(items, mapped!.receitaCol),
      custo: sumCol(items, mapped!.custoTotalCol),
      entregas: sumCols(items, mapped!.entregasCols, true),
      coletas: sumCols(items, mapped!.coletasCols, true),
      ctrcs: sumCols(items, mapped!.ctrcsCols, true),
      peso: sumCols(items, mapped!.pesoCols, true),
      retorno: sumCol(items, mapped!.retornoCol),
      unidade: mapped!.unitCol ? String(items[0][mapped!.unitCol]) : "",
      tipo: mapped!.typeCol ? String(items[0][mapped!.typeCol]) : "",
      rel: mapped!.relCol ? String(items[0][mapped!.relCol]) : "",
    }));
    return arr;
  }, [filtered, mapped]);

  const byRel = useMemo(() => {
    if (!mapped?.relCol) return [];
    const map = new Map<string, Row[]>();
    filtered.forEach((r) => {
      const k = String(r[mapped.relCol as string] ?? "");
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    });
    return Array.from(map.entries()).map(([rel, items]) => ({
      rel,
      receita: sumCol(items, mapped!.receitaCol),
      custo: sumCol(items, mapped!.custoTotalCol),
      entregas: sumCols(items, mapped!.entregasCols, true),
      coletas: sumCols(items, mapped!.coletasCols, true),
      ctrcs: sumCols(items, mapped!.ctrcsCols, true),
      peso: sumCols(items, mapped!.pesoCols, true),
    }));
  }, [filtered, mapped]);

  // Pie de custo por tipo
  const costTable = useMemo(() => costBreakdown(filtered, mapped || undefined), [filtered, mapped]);
  const pieData = useMemo(() => costTable.map(c => ({ name: c.nome, value: c.valor })), [costTable]);

  // Top 12 coleta/entrega
  const barsData = useMemo(() => {
    return [...byPlaca]
      .sort((a,b)=> (b.entregas+b.coletas) - (a.entregas+a.coletas))
      .slice(0,12)
      .map(r => ({ label: r.placa, Entregas: r.entregas, Coletas: r.coletas }));
  }, [byPlaca]);

  const scatterData = useMemo(() => byPlaca.map(r => ({ x: r.custo, y: r.retorno, label: r.placa })), [byPlaca]);

  // ==== NOVO: “5 piores em Peso (por placa)”, usando a mesma lógica de sinalização da tabela ====
  const worstWeightData = useMemo(() => {
    if (!mapped) return [];
    const sig = byTypePlateSignals(filtered, mapped); // usa mesma base da tabela
    // Para cada placa, pegue o pior desvio (mais negativo)
    const perPlate = new Map<string, { placa: string; peso: number; diff: number }>();
    sig.forEach((r) => {
      const diff = r.peso - r.avgPeso;
      const prev = perPlate.get(r.placa);
      if (!prev || diff < prev.diff) perPlate.set(r.placa, { placa: r.placa, peso: r.peso, diff });
    });
    return Array.from(perPlate.values())
      .sort((a,b)=> a.diff - b.diff)
      .slice(0,5)
      .map(d => ({ label: d.placa, Peso: d.peso }));
  }, [filtered, mapped]);

  // ==== NOVO: Barras de valor total por tipo de custo (dia) ====
  const costBarData = useMemo(() => costTable.map(c => ({ name: c.nome, valor: c.valor, pct: c.pct })), [costTable]);

  /* =========================
     RENDER
  ========================= */

  if (!user) {
    return (
      <div
        className="min-h-screen bg-slate-100 flex items-start justify-center py-12"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,.75), rgba(255,255,255,.75)), url('${LOGIN_BG}')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        }}
      >
        <form onSubmit={doLogin} className="w-[360px] rounded-2xl bg-white/90 shadow-lg backdrop-blur border border-slate-200 p-6 space-y-4">
          <div className="rounded-xl bg-[#0b3a8c] text-white px-4 py-3 font-semibold">CDI – Análise Diária</div>
          <p className="text-xs text-slate-600">Transporte Generoso – Controladoria</p>
          <div>
            <label className="text-sm text-slate-600">Usuário</label>
            <input className="mt-1 w-full rounded-lg border px-3 py-2" value={loginU} onChange={(e) => setLoginU(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="text-sm text-slate-600">Senha</label>
            <input className="mt-1 w-full rounded-lg border px-3 py-2" type="password" value={loginP} onChange={(e) => setLoginP(e.target.value)} />
          </div>
          {authError && <div className="text-red-700 text-sm">{authError}</div>}
          <button className="w-full rounded-lg bg-[#0b3a8c] text-white py-2 font-semibold hover:brightness-95" type="submit">Entrar</button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Print-only CSS (melhor PDF) */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          .no-print { display: none !important; }
          .shadow, .shadow-sm, .shadow-lg { box-shadow: none !important; }
          .print-keep { break-inside: avoid; page-break-inside: avoid; }
          body { background: white !important; }
        }
      `}</style>

      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0b3a8c] text-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <div className="font-semibold">CDI – Análise Diária</div>
            <div className="text-xs opacity-90">Transporte Generoso – Controladoria</div>
            <div className="text-[11px] mt-1 opacity-90">
              Último dia do arquivo: {lastDate ? lastDate.toLocaleDateString("pt-BR") : "—"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-90">{user.usuario} ({user.perfil})</span>
            <button onClick={logout} className="rounded-md bg-white/10 hover:bg-white/20 px-3 py-1 text-sm no-print">Sair</button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Filtros */}
        <div className="rounded-2xl bg-white shadow border p-3 no-print">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grow min-w-[240px]">
              <select
                className="w-full rounded-lg border px-3 py-2 bg-white"
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
                disabled={user.perfil === "user" && !!user.unidade}
              >
                {user.perfil === "admin" && <option>(todos)</option>}
                {unidades.map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div className="grow min-w-[240px]">
              <select className="w-full rounded-lg border px-3 py-2 bg-white" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option>(todos)</option>
                {tipos.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="grow min-w-[240px]">
              <select className="w-full rounded-lg border px-3 py-2 bg-white" value={rel} onChange={(e) => setRel(e.target.value)}>
                <option>(todos)</option>
                {rels.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>

            <button onClick={loadFromSharePoint} className="rounded-xl bg-[#0b3a8c] text-white px-4 py-2 font-medium hover:brightness-95" disabled={loading}>
              {loading ? "Carregando..." : "Recarregar"}
            </button>

            <button onClick={() => window.print()} className="rounded-xl bg-emerald-600 text-white px-4 py-2 font-medium hover:brightness-95">
              Exportar PDF
            </button>
          </div>
        </div>

        {/* Resumo */}
        <div className="rounded-2xl bg-white shadow border p-3 print-keep">
          <div className="text-sm text-slate-600 mb-3">
            Resumo do dia {lastDate ? lastDate.toLocaleDateString("pt-BR") : "—"} — Unidades: {user.perfil === "user" && user.unidade ? user.unidade : (unidade === "(todos)" ? "(todas)" : unidade)}.
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <Kpi label="Receita" value={fmtBRL(totals.receita)} />
            <Kpi label="Custo" value={fmtBRL(totals.custo)} />
            <Kpi label="Entregas" value={fmtInt(totals.entregas)} />
            <Kpi label="Coletas" value={fmtInt(totals.coletas)} />
            <Kpi label="CTRCs" value={fmtInt(totals.ctrcs)} />
            <Kpi label="Peso (kg)" value={fmtKg(totals.peso)} />
          </div>

          {/* Tabela por Unidade */}
          {mapped?.unitCol && (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-slate-100">
                    <Th>Unidade</Th>
                    <Th className="text-right">Receita</Th>
                    <Th className="text-right">Custo</Th>
                    <Th className="text-right">Entregas</Th>
                    <Th className="text-right">Coletas</Th>
                    <Th className="text-right">CTRCs</Th>
                    <Th className="text-right">Peso (kg)</Th>
                  </tr>
                </thead>
                <tbody>
                  {groupBy(filtered, mapped.unitCol).map(({ key, items }, i) => (
                    <tr key={key} className={i % 2 ? "bg-white" : "bg-slate-50"}>
                      <Td>{key || "-"}</Td>
                      <Td className="text-right">{fmtBRL(sumCol(items, mapped!.receitaCol))}</Td>
                      <Td className="text-right">{fmtBRL(sumCol(items, mapped!.custoTotalCol))}</Td>
                      <Td className="text-right">{fmtInt(sumCols(items, mapped!.entregasCols, true))}</Td>
                      <Td className="text-right">{fmtInt(sumCols(items, mapped!.coletasCols, true))}</Td>
                      <Td className="text-right">{fmtInt(sumCols(items, mapped!.ctrcsCols, true))}</Td>
                      <Td className="text-right">{fmtKg(sumCols(items, mapped!.pesoCols, true))}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Por Tipo → Placa (sinalização) */}
        {mapped?.plateCol && mapped?.typeCol && (
          <div className="rounded-2xl bg-white shadow border print-keep">
            <div className="px-3 py-2 font-semibold bg-[#0b3a8c] text-white rounded-t-2xl">
              Por Tipo de Veículo → Placa (sinalização vs. média do tipo na unidade)
            </div>
            <div className="p-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-slate-100">
                    <Th>Unidade</Th>
                    <Th>Tipo</Th>
                    <Th>Placa</Th>
                    <Th className="text-right">Receita</Th>       {/* NOVO */}
                    <Th className="text-right">Custo</Th>         {/* NOVO */}
                    <Th className="text-right">Peso</Th>
                    <Th className="text-right">CTRCs</Th>
                    <Th className="text-right">Coletas</Th>
                    <Th className="text-right">Entregas</Th>
                  </tr>
                </thead>
                <tbody>
                  {byTypePlateSignals(filtered, mapped).map((r, i) => (
                    <tr key={`${r.unidade}|${r.tipo}|${r.placa}|${i}`} className={i % 2 ? "bg-white" : "bg-slate-50"}>
                      <Td>{r.unidade}</Td>
                      <Td>{r.tipo}</Td>
                      <Td>{r.placa}</Td>
                      <Td className="text-right">{fmtBRL(r.receitaPlaca || 0)}</Td>   {/* NOVO */}
                      <Td className="text-right">{fmtBRL(r.custoPlaca || 0)}</Td>     {/* NOVO */}
                      <Td className="text-right"><BadgeSignal value={r.peso} avg={r.avgPeso} /></Td>
                      <Td className="text-right"><BadgeSignal value={r.ctrcs} avg={r.avgCtrcs} /></Td>
                      <Td className="text-right"><BadgeSignal value={r.coletas} avg={r.avgColetas} /></Td>
                      <Td className="text-right"><BadgeSignal value={r.entregas} avg={r.avgEntregas} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tabelas e Gráficos */}
        {byPlaca.length > 0 && (
          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="Top 10 Receitas por Placa (dia)">
              <SimpleTable
                headers={["Placa", "Unidade", "Tipo", "Receita"]}
                rows={[...byPlaca].sort((a,b)=>b.receita-a.receita).slice(0,10).map(r => [r.placa, r.unidade, r.tipo, fmtBRL(r.receita)])}
                rightCols={[3]}
              />
            </Card>
            <Card title="Bottom 10 Receitas por Placa (dia)">
              <SimpleTable
                headers={["Placa", "Unidade", "Tipo", "Receita"]}
                rows={[...byPlaca].sort((a,b)=>a.receita-b.receita).slice(0,10).map(r => [r.placa, r.unidade, r.tipo, fmtBRL(r.receita)])}
                rightCols={[3]}
              />
            </Card>

            {/* NOVO: 5 piores em Peso vs média (por placa) */}
            <Card title="5 piores em Peso (comparado à média do tipo na unidade)">
              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer>
                  <BarChart data={worstWeightData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Peso" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Custo x Retorno por Placa (dispersão)">
              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer>
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="x" type="number" name="Custo (R$)" />
                    <YAxis dataKey="y" type="number" name="Retorno" />
                    <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                    <Legend />
                    <Scatter name="Placas" data={scatterData} fill="#2563eb" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Coletas e Entregas por Placa (Top 12)">
              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer>
                  <BarChart data={barsData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Entregas" fill="#2563eb" />
                    <Bar dataKey="Coletas" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        )}

        {/* NOVO: Barras de valor total por tipo de custo + tabela de % do total */}
        {!!costBarData.length && (
          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="Valor total por Tipo de Custo (dia)">
              <div style={{ width: "100%", height: 360 }}>
                <ResponsiveContainer>
                  <BarChart data={costBarData} margin={{ top: 10, right: 20, bottom: 30, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-20} textAnchor="end" interval={0} height={60} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="valor" name="Valor (R$)" fill="#0b3a8c" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="% de cada Tipo de Custo sobre o CUSTO TOTAL (dia)">
              <SimpleTable
                headers={["Tipo de Custo", "% do Custo Total"]}
                rows={costBarData.map(r => [r.name, (r.pct*100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%"])}
                rightCols={[1]}
              />
            </Card>
          </div>
        )}

        {/* NOVO (já existia): Pizza custo por tipo */}
        {!!pieData.length && (
          <Card title="Custo por Tipo (representatividade no total do dia)">
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Tooltip />
                  <Legend />
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={110}
                    label={(e: any) => `${e.name} (${((e.value/Math.max(1, totals.custo))*100).toFixed(1)}%)`}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* Decomposição de custos + produtividade por tipo */}
        {!!mapped?.costComponentCols.length && (
          <div className="rounded-2xl bg-white shadow border print-keep">
            <div className="px-3 py-2 font-semibold bg-[#0b3a8c] text-white rounded-t-2xl">
              Decomposição de tipos de custo + produção do dia (por tipo de custo)
            </div>
            <div className="p-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-slate-100">
                    <Th>Tipo de custo</Th>
                    <Th className="text-right">Valor</Th>
                    <Th className="text-right">% do total</Th>
                    <Th className="text-right">CTRCs</Th>
                    <Th className="text-right">Coletas</Th>
                    <Th className="text-right">Entregas</Th>
                    <Th className="text-right">Peso (kg)</Th>
                  </tr>
                </thead>
                <tbody>
                  {costTable.map((r, i) => (
                    <tr key={r.nome} className={i % 2 ? "bg-white" : "bg-slate-50"}>
                      <Td>{r.nome}</Td>
                      <Td className="text-right">{fmtBRL(r.valor)}</Td>
                      <Td className="text-right">{(r.pct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</Td>
                      <Td className="text-right">{fmtInt(r.ctrcs)}</Td>
                      <Td className="text-right">{fmtInt(r.coletas)}</Td>
                      <Td className="text-right">{fmtInt(r.entregas)}</Td>
                      <Td className="text-right">{fmtKg(r.peso)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Custo e Receita por Relacionamento */}
        {byRel.length > 0 && (
          <Card title="Custo e Receita por Relacionamento">
            <SimpleTable
              headers={["Relacionamento", "Receita", "Custo", "Entregas", "Coletas", "CTRCs", "Peso (kg)"]}
              rows={byRel.map(r => [r.rel, fmtBRL(r.receita), fmtBRL(r.custo), fmtInt(r.entregas), fmtInt(r.coletas), fmtInt(r.ctrcs), fmtKg(r.peso)])}
              rightCols={[1,2,3,4,5,6]}
            />
          </Card>
        )}

        {/* Análise automática do dia (texto) */}
        <div className="rounded-2xl bg-white shadow border p-3 print-keep">
          <div className="font-semibold mb-2">Análise automática do dia</div>
          <div className="text-sm text-slate-800 leading-relaxed">
            {renderNarrative({
              unidade: (user.perfil === "user" && user.unidade) ? user.unidade! : unidade,
              lastDate,
              totals,
              byPlaca,
              costTable,
              filteredRows: filtered,     // passa as linhas filtradas
              mappedCols: mapped          // e o mapeamento
            })}
          </div>
        </div>

        {/* Admin */}
        {user.perfil === "admin" && <AdminBox />}

        {/* Erro */}
        {err && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-red-800">{err}</div>}
      </div>
    </div>
  );
};

/* =========================
   SUBCOMPONENTES / HELPERS
========================= */

const PIE_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#22d3ee", "#84cc16", "#ec4899"];

const Th: React.FC<React.HTMLAttributes<HTMLTableCellElement>> = ({ children, className }) => (
  <th className={`px-3 py-2 text-left font-semibold text-slate-700 ${className || ""}`}>{children}</th>
);
const Td: React.FC<React.HTMLAttributes<HTMLTableCellElement>> = ({ children, className }) => (
  <td className={`px-3 py-2 align-top ${className || ""}`}>{children}</td>
);
const Kpi: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl border bg-white p-3 shadow-sm">
    <div className="text-xs text-slate-600">{label}</div>
    <div className="text-xl font-bold">{value}</div>
  </div>
);

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-2xl bg-white shadow border print-keep">
    <div className="px-3 py-2 font-semibold bg-[#0b3a8c] text-white rounded-t-2xl">{title}</div>
    <div className="p-3">{children}</div>
  </div>
);

const SimpleTable: React.FC<{ headers: string[]; rows: (string | number)[][]; rightCols?: number[] }> = ({ headers, rows, rightCols = [] }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full text-sm">
      <thead>
        <tr className="bg-slate-100">
          {headers.map((h, i) => <Th key={i} className={rightCols.includes(i) ? "text-right" : ""}>{h}</Th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={i % 2 ? "bg-white" : "bg-slate-50"}>
            {r.map((c, j) => <Td key={j} className={rightCols.includes(j) ? "text-right" : ""}>{c}</Td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

function groupBy(arr: Row[], col: string | null) {
  if (!col) return [];
  const map = new Map<string, Row[]>();
  for (const r of arr) {
    const key = String(r[col] ?? "");
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return Array.from(map.entries()).map(([key, items]) => ({ key, items }));
}

const clamp = (n: number) => (Number.isFinite(n) ? n : 0);

const BadgeSignal: React.FC<{ value: number; avg: number }> = ({ value, avg }) => {
  const diff = value - avg;
  const cls =
    Math.abs(diff) < 1e-9 ? "bg-slate-100 text-slate-700"
    : diff >= 0 ? "bg-green-100 text-green-700"
    : "bg-red-100 text-red-700";
  const text =
    Math.abs(diff) < 1e-9 ? "= = média"
    : diff > 0 ? "▲ acima"
    : "▼ abaixo";
  return <span className={`inline-block rounded-md px-2 py-[2px] text-[11px] ${cls}`}>{fmtInt(clamp(value))} {text}</span>;
};

function byTypePlateSignals(rows: Row[], m: MappedCols) {
  if (!m.unitCol || !m.typeCol || !m.plateCol) return [];
  const keyUT = (r: Row) => `${r[m.unitCol!]}||${r[m.typeCol!]}`;
  const keyUTP = (r: Row) => `${r[m.unitCol!]}||${r[m.typeCol!]}||${r[m.plateCol!]}`;

  const groupsUT = new Map<string, Row[]>();
  rows.forEach((r) => {
    const k = keyUT(r);
    if (!groupsUT.has(k)) groupsUT.set(k, []);
    groupsUT.get(k)!.push(r);
  });

  // Médias por (Unidade, Tipo) baseadas na média dos REGISTROS (mesma lógica anterior)
  const avg = new Map<string, { peso: number; ctrcs: number; coletas: number; entregas: number }>();
  for (const [k, items] of groupsUT) {
    const a = {
      peso: sumCols(items, m.pesoCols, true) / Math.max(items.length, 1),
      ctrcs: sumCols(items, m.ctrcsCols, true) / Math.max(items.length, 1),
      coletas: sumCols(items, m.coletasCols, true) / Math.max(items.length, 1),
      entregas: sumCols(items, m.entregasCols, true) / Math.max(items.length, 1),
    };
    avg.set(k, a);
  }

  // Totais por (Unidade, Tipo, Placa) para Receita/Custo (e também métricas) — usados nas novas colunas
  const totalsUTP = new Map<string, { receita: number; custo: number; peso: number; ctrcs: number; coletas: number; entregas: number }>();
  rows.forEach((r) => {
    const k = keyUTP(r);
    const prev = totalsUTP.get(k) || { receita: 0, custo: 0, peso: 0, ctrcs: 0, coletas: 0, entregas: 0 };
    prev.receita += sumCols([r], [m.receitaCol!]);
    prev.custo   += sumCols([r], [m.custoTotalCol!]);
    prev.peso    += sumCols([r], m.pesoCols, true);
    prev.ctrcs   += sumCols([r], m.ctrcsCols, true);
    prev.coletas += sumCols([r], m.coletasCols, true);
    prev.entregas+= sumCols([r], m.entregasCols, true);
    totalsUTP.set(k, prev);
  });

  // Para evitar linhas duplicadas por placa, retornamos UMA linha por (UT, Placa)
  const emitted = new Set<string>();
  const out: any[] = [];
  rows.forEach((r) => {
    const kUT  = keyUT(r);
    const kUTP = keyUTP(r);
    if (emitted.has(kUTP)) return;
    emitted.add(kUTP);

    const a = avg.get(kUT) || { peso: 0, ctrcs: 0, coletas: 0, entregas: 0 };
    const t = totalsUTP.get(kUTP)!;

    out.push({
      unidade: r[m.unitCol!],
      tipo: r[m.typeCol!],
      placa: r[m.plateCol!],
      // Para a sinalização, usamos os totais por placa
      peso: clamp(t.peso),
      ctrcs: clamp(t.ctrcs),
      coletas: clamp(t.coletas),
      entregas: clamp(t.entregas),
      avgPeso: clamp(a.peso),
      avgCtrcs: clamp(a.ctrcs),
      avgColetas: clamp(a.coletas),
      avgEntregas: clamp(a.entregas),
      // NOVO: totais financeiros por placa
      receitaPlaca: t.receita,
      custoPlaca: t.custo,
    });
  });

  return out;
}

function costBreakdown(rows: Row[], m?: MappedCols) {
  if (!m || !m.costComponentCols.length) return [];
  const total = sumCol(rows, m.custoTotalCol) || 0;
  const out = m.costComponentCols.map((c) => {
    const valor = sumCols(rows, [c]);
    const pct = total > 0 ? valor / total : 0;
    // subset de linhas onde o tipo de custo ocorreu (>0)
    const subset = rows.filter(r => {
      const n = coerceNumberBR(r[c]);
      return n != null && Math.abs(n) > 0;
    });
    const ctrcs = sumCols(subset, m.ctrcsCols, true);
    const coletas = sumCols(subset, m.coletasCols, true);
    const entregas = sumCols(subset, m.entregasCols, true);
    const peso = sumCols(subset, m.pesoCols, true);
    // nome amigável
    const pretty = COST_LABELS[normalizeKey(c)] || c.replace(/^Sum/i, "");
    return { nome: pretty, valor, pct, ctrcs, coletas, entregas, peso };
  });
  out.sort((a, b) => b.valor - a.valor);
  return out;
}

/* ======= Narrative (com análise de tipos de custo) ======= */

function renderNarrative(args: {
  unidade: string;
  lastDate: Date | null;
  totals: { receita: number; custo: number; entregas: number; coletas: number; ctrcs: number; peso: number };
  byPlaca: { placa: string; receita: number; custo: number; entregas: number; coletas: number; ctrcs: number; peso: number; retorno: number }[];
  costTable: { nome: string; valor: number; pct: number }[];
  filteredRows: Row[];
  mappedCols: MappedCols | null;
}) {
  const { unidade, lastDate, totals, byPlaca, costTable, filteredRows, mappedCols } = args;
  const uniTxt = unidade === "(todos)" ? "todas" : unidade;
  const dataTxt = lastDate ? lastDate.toLocaleDateString("pt-BR") : "—";
  const topRec = [...byPlaca].sort((a,b)=>b.receita-a.receita)[0];
  const topCus = [...byPlaca].sort((a,b)=>b.custo-a.custo)[0];
  const worstRet = [...byPlaca].sort((a,b)=> (b.custo - b.entregas - b.coletas) - (a.custo - a.entregas - a.coletas))[0];
  const topCostType = costTable[0];

  const parts: string[] = [];
  parts.push(`Unidade: ${uniTxt}. Dia ${dataTxt}.`);
  parts.push(`Receita ${fmtBRL(totals.receita)} e custo ${fmtBRL(totals.custo)}; produção: ${fmtInt(totals.entregas)} entregas, ${fmtInt(totals.coletas)} coletas, ${fmtInt(totals.ctrcs)} CTRCs e ${fmtKg(totals.peso)} kg.`);

  if (topRec && topRec.receita > 0) parts.push(`Maior receita no dia: placa ${topRec.placa} com ${fmtBRL(topRec.receita)}.`);
  if (topCus && topCus.custo > 0) parts.push(`Maior custo no dia: placa ${topCus.placa} com ${fmtBRL(topCus.custo)}.`);
  if (topCostType && topCostType.valor > 0) parts.push(`Tipo de custo com maior impacto no total: ${topCostType.nome} (${(topCostType.pct*100).toFixed(1)}% do custo do dia).`);
  if (worstRet) parts.push(`Atenção para baixa eficiência: placa ${worstRet.placa} com custo elevado frente à produção; avaliar escala, roteirização e relacionamento.`);

  // Análise por tipo de custo (valor, % e peso vs receita)
  if (mappedCols && mappedCols.costComponentCols?.length && mappedCols.receitaCol) {
    const totalCustoDia = Math.max(0, totals.custo);

    type Ctx = { nome: string; valor: number; pct: number; receitaAssoc: number; ratioCostOverRevenue: number };
    const porTipo: Ctx[] = mappedCols.costComponentCols.map((col) => {
      const nomeAmigavel =
        COST_LABELS[normalizeKey(col)] || col.replace(/^Sum/i, "");
      const subset = filteredRows.filter(r => {
        const n = coerceNumberBR(r[col]);
        return n != null && Math.abs(n) > 0;
      });
      const valor = sumCols(subset, [col]);
      const pct   = totalCustoDia > 0 ? (valor / totalCustoDia) : 0;
      const receitaAssoc = sumCol(subset, mappedCols.receitaCol);
      const ratioCostOverRevenue = receitaAssoc > 0 ? (valor / receitaAssoc) : Infinity;
      return { nome: nomeAmigavel, valor, pct, receitaAssoc, ratioCostOverRevenue };
    }).filter(x => x.valor > 0)
      .sort((a,b)=> b.valor - a.valor);

    if (porTipo.length) {
      const top3 = porTipo.slice(0,3).map(t => `${t.nome}: ${fmtBRL(t.valor)} (${(t.pct*100).toFixed(1)}%)`).join("; ");
      parts.push(`Por tipo de custo (dia), os maiores valores foram — ${top3}.`);

      const candidatos = porTipo.filter(t => Number.isFinite(t.ratioCostOverRevenue) && t.receitaAssoc > 0);
      if (candidatos.length) {
        const piorRazao = [...candidatos].sort((a,b)=> b.ratioCostOverRevenue - a.ratioCostOverRevenue)[0];
        const pctReceita = (piorRazao.ratioCostOverRevenue * 100);
        parts.push(`O tipo de custo com maior peso relativo à receita dos veículos em que ocorre é ${piorRazao.nome}, somando ${fmtBRL(piorRazao.valor)} (${(piorRazao.pct*100).toFixed(1)}% do custo do dia) e equivalendo a ${pctReceita.toFixed(0)}% da receita desses veículos.`);
      }
    }
  }

  parts.push(`Sugestões: priorizar veículos com maior receita por operação; reduzir componentes de custo líderes; reavaliar diárias e eventos em placas com baixa produção; conferir devoluções/retornos e causas.`);

  return parts.join(" ");
}

/* ============== Admin (mantido) ============== */

const AdminBox: React.FC = () => {
  const [pat, setPat] = useState<string>(localStorage.getItem("gh_pat") || "");
  const [saveMsg, setSaveMsg] = useState<string>("");

  async function ghGetFileSha(path: string) {
    const url = `${GH_API_BASE}/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(path)}?ref=${GH_BRANCH}`;
    const r = await fetch(url, {
      headers: { Accept: "application/vnd.github+json", Authorization: pat ? `Bearer ${pat}` : "" },
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub GET status=${r.status}`);
    const j = await r.json();
    return j.sha as string;
  }

  async function ghPutJson(path: string, contentObj: any) {
    const url = `${GH_API_BASE}/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(path)}`;
    const sha = await ghGetFileSha(path);
    const body = {
      message: `update ${path}`,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(contentObj, null, 2)))),
      branch: GH_BRANCH,
      ...(sha ? { sha } : {}),
    };
    const r = await fetch(url, {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: pat ? `Bearer ${pat}` : "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`GitHub PUT falhou: ${r.status}`);
    return await r.json();
  }

  async function recarregarDoGh() {
    setSaveMsg("Carregando usuários do GitHub…");
    try {
      const r = await fetch(GH_RAW, { cache: "no-store" });
      const j = await r.json();
      localStorage.setItem("users_local", JSON.stringify(j));
      setSaveMsg("Usuários recarregados do GitHub e salvos localmente.");
    } catch (e: any) {
      setSaveMsg(`Erro: ${e?.message || e}`);
    }
  }

  async function salvarNoGh() {
    setSaveMsg("Lendo local e publicando no GitHub…");
    try {
      const local = localStorage.getItem("users_local");
      const arr = local ? JSON.parse(local) : [];
      await ghPutJson(GH_USERS_PATH, arr);
      setSaveMsg("Publicado com sucesso no GitHub.");
    } catch (e: any) {
      setSaveMsg(`Erro: ${e?.message || e}`);
    }
  }

  return (
    <div className="rounded-2xl bg-white shadow border p-3 print-keep">
      <div className="font-semibold mb-2">Admin — Gerenciar usuários</div>
      <div className="text-sm text-slate-600 mb-2">
        Repositório: <code>{GH_OWNER}/{GH_REPO}</code> — arquivo: <code>{GH_USERS_PATH}</code>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="w-[380px] max-w-full rounded-lg border px-3 py-2"
          type="password"
          placeholder="Personal Access Token (repo contents:read/write)"
          value={pat}
          onChange={(e) => {
            setPat(e.target.value);
            localStorage.setItem("gh_pat", e.target.value);
          }}
        />
        <button className="rounded-lg bg-slate-800 text-white px-3 py-2" onClick={recarregarDoGh}>
          Recarregar do GitHub
        </button>
        <button className="rounded-lg bg-emerald-600 text-white px-3 py-2" onClick={salvarNoGh}>
          Salvar usuários no GitHub
        </button>
      </div>
      {!!saveMsg && <div className="mt-2 text-sm">{saveMsg}</div>}
    </div>
  );
};

export default App;
