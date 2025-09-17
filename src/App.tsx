import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ===== Persistência de usuários pra API do GitHub =====
const GH_OWNER = "ControladoriaGen";
const GH_REPO  = "analitico-cdi";    
const GH_BRANCH = "main";
const GH_USERS_PATH = "public/users.json";  // onde salvo os usuários
const GH_API_BASE = "https://api.github.com";
const GH_RAW = `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}/${GH_USERS_PATH}`;

// ================== Api dos logins ====================
async function ghGetFileSha(pat: string) {
  const url = `${GH_API_BASE}/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(GH_USERS_PATH)}?ref=${GH_BRANCH}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${pat}`, Accept: "application/vnd.github+json" }
  });
  if (r.status === 404) return null; // arquivo ainda não existe
  if (!r.ok) throw new Error(`GitHub GET falhou: ${r.status}`);
  const j = await r.json();
  return j.sha as string;
}

async function ghPutFile(pat: string, contentStr: string, sha: string | null, message: string) {
  const url = `${GH_API_BASE}/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(GH_USERS_PATH)}`;
  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(contentStr))),
    branch: GH_BRANCH,
    sha: sha || undefined,
  } as any;

  const r = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const txt = await r.text(); // ajuda a diagnosticar (permissão/SSO/etc)
    throw new Error(`GitHub PUT falhou: ${r.status} ${r.statusText}\n${txt}`);
  }
  return r.json();
}

// =============================================================
// MARCA / CORES / CONFIG
// =============================================================
const BRAND_BLUE = "#0A2D8D"; // cabeçalhos
const BRAND_BLUE_LIGHT = "#3D7ABD"; // cor complementar (gráficos)

const SHAREPOINT_URL =
  "https://generosocombr-my.sharepoint.com/personal/controladoria_generoso_com_br/_layouts/15/download.aspx?share=ESLYowVkuEBEu82Jfnk-JQ0BfoDxwkd99RFtXTEzbARXEg&download=1";
const TARGET_SHEET = "CDIAutomtico1";

const COLS = {
  data: "Custo de Distribuição[Data Baixa]",
  placa: "Custo de Distribuição[Placa]",
  tipo: "Custo de Distribuição[Tipo]",
  unidade: "Custo de Distribuição[Unidade]",
  relacionamento: "Custo de Distribuição[Relacionamento]",
  receita: "[SumReceita_Líquida]",
  custoTotal: "[SumDiária_Total]",
  peso: "[SumPeso]",
  volumes: "[SumVolumes]",
  ctrcs: "[SumCTRC_s]",
  coletas: "[SumColetas]",
  entregas: "[SumEntregas]",
  retorno: "[SumRetorno]",
  cdi1: "[SumCDI]",
  cdi2: "[CDI____]",
};

const COST_FIELDS = [
  "[SumAjudante]",
  "[SumComissão_de_Recepção]",
  "[SumDesconto_de_Coleta]",
  "[SumDiária_Fixa]",
  "[SumDiária_Manual]",
  "[SumDiária_Percentual]",
  "[SumEvento]",
  "[SumGurgelmix]",
  "[SumHerbalife]",
  "[SumSaída]",
  "[SumSetor_400]",
  "[SumCusto_Fixo__Frota]",
  "[SumCusto_Variável__Frota]",
  "[SumSal___Enc___Frota]",
  "[SumH_E__Frota]",
];

// Usuário inicial (seed)
const SEED_ADMIN = { username: "gustavo", password: "admin123", role: "admin", unidade: "*" };

// =============================================================
// HELPERS
// =============================================================
function sameDay(a?: Date | null, b?: Date | null) {
  return !!(
    a && b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function excelSerialToDate(serial: number | any) {
  if (typeof serial !== "number" || !isFinite(serial)) return null as any;
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return new Date(epoch.getTime() + serial * 86400000);
}

function parseDateFlexible(val: any): Date | null {
  if (val == null || val === "") return null;
  if (val instanceof Date && !isNaN(val as any)) return val as Date;
  if (typeof val === "number") return excelSerialToDate(val);
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let d = parseInt(m[1], 10);
    let mo = parseInt(m[2], 10) - 1;
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    const dt = new Date(y, mo, d);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const iso = new Date(s);
  return isNaN(iso.getTime()) ? null : iso;
}

function formatDateBR(dt?: Date | null) {
  if (!(dt instanceof Date) || isNaN(dt.getTime())) return "";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function toNumberBR(v: any) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}
function fmt0(n: any) {
  const v = Math.round(toNumberBR(n));
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
function sum<T>(arr: T[], sel: (x: T) => any) {
  let t = 0;
  for (const x of arr) t += toNumberBR(sel(x));
  return t;
}
function groupBy<T>(arr: T[], keyFn: (x: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of arr) {
    const k = keyFn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return map;
}
function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr.filter((x: any) => x != null && x !== "")));
}
function findPrevDate(rows: any[], last: Date | null) {
  let prev: Date | null = null;
  for (const r of rows) {
    if (r.__date && last && r.__date < last && (!prev || r.__date > prev)) prev = r.__date;
  }
  return prev;
}
function trendArrow(curr: number, prev: number) {
  if (!(prev >= 0 || prev < 0)) return null;
  if (curr > prev) return <span className="text-green-600 text-sm">▲</span>;
  if (curr < prev) return <span className="text-red-600 text-sm">▼</span>;
  return <span className="text-gray-500 text-sm">＝</span>;
}
function arrowColorLabel(v: number, avg: number) {
  if (!(avg >= 0 || avg < 0)) return { node: null as any, label: "" };
  if (v > avg) return { node: <span className="text-green-600">▲</span>, label: "acima" };
  if (v < avg) return { node: <span className="text-red-600">▼</span>, label: "abaixo" };
  return { node: <span className="text-gray-500">＝</span>, label: "média" };
}

// =============================================================
// AUTENTICAÇÃO simples (localStorage)
// =============================================================
const USERS_KEY = "cdi_users_v1";
const SESSION_KEY = "cdi_session_v1";

type Session = { username: string; role: "admin" | "user"; unidade: string };

type User = { username: string; password: string; role: "admin" | "user"; unidade: string };

function loadUsers(): User[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [SEED_ADMIN as User];
    const parsed = JSON.parse(raw);
    return parsed && parsed.length ? parsed : [SEED_ADMIN as User];
  } catch {
    return [SEED_ADMIN as User];
  }
}
function saveUsers(users: User[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}
function ensureSeedAdmin(): User[] {
  const users = loadUsers();
  if (!users.length) {
    saveUsers([SEED_ADMIN as User]);
    return [SEED_ADMIN as User];
  }
  return users;
}
function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function setSession(sess: Session | null) {
  if (!sess) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
}

// =============================================================
// UI PRIMITIVOS
// =============================================================
function Panel({ title, children, right }: { title: string; children: any; right?: any }) {
  return (
    <section className="rounded-2xl border bg-white shadow-sm">
      <div className="flex items-center justify-between px-4 py-3" style={{ background: BRAND_BLUE, color: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
        <h3 className="font-semibold">{title}</h3>
        {right}
      </div>
      <div className="p-4 text-gray-900">{children}</div>
    </section>
  );
}
function Stat({ label, value, trend, hint }: { label: string; value: any; trend?: any; hint?: string }) {
  return (
    <div className="rounded-xl border p-4 bg-white shadow-sm">
      <div className="text-xs text-gray-600">{label}</div>
      <div className="flex items-baseline gap-2"><div className="text-xl font-semibold">{value}</div>{trend}</div>
      {hint ? <div className="text-xs text-gray-500 mt-1">{hint}</div> : null}
    </div>
  );
}
function Table({ columns, data, keyField }: { columns: any[]; data: any[]; keyField?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-100 text-gray-700">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2 text-left font-semibold">
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={keyField ? row[keyField] ?? idx : idx} className={idx % 2 ? "bg-white" : "bg-gray-50"}>
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2 align-top">
                  {c.render ? c.render(row) : String(row[c.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// =============================================================
// APP
// =============================================================
export default function App() {
  // força tema claro no host (evita seguir modo escuro do SO/navegador)
  useEffect(() => {
    document.documentElement.classList.remove("dark");
    const style = document.createElement("style");
    style.id = "force-light";
    style.innerHTML = `:root{color-scheme:light;} html,body{background:#fff !important;color:#111 !important;}`;
    document.head.appendChild(style);
    return () => { try { document.head.removeChild(style); } catch {} };
  }, []);

  // auth
  const [users, setUsers] = useState<User[]>(() => ensureSeedAdmin());
  const [session, setSess] = useState<Session | null>(() => getSession());
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [authError, setAuthError] = useState("");

  // dados
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [lastDate, setLastDate] = useState<Date | null>(null);

  // filtros
  const [filterUnidade, setFilterUnidade] = useState("");
  const [filterTipo, setFilterTipo] = useState("");
  const [filterRel, setFilterRel] = useState("");

  function signIn(e?: any) {
    e?.preventDefault?.();
    setAuthError("");
    const u = users.find((x) => x.username === loginUser && x.password === loginPass);
    if (!u) { setAuthError("Usuário ou senha inválidos."); return; }
    const sess: Session = { username: u.username, role: u.role as any, unidade: u.unidade };
    setSess(sess); setSession(sess);
  }
  function signOut() { setSess(null); setSession(null); }
  function addUser(newUser: User) {
    const exists = users.some((u) => u.username === newUser.username);
    if (exists) throw new Error("Já existe um usuário com esse nome");
    const next = [...users, newUser]; setUsers(next); saveUsers(next);
  }

  async function loadData() {
    setLoading(true); setError("");
    try {
      const resp = await fetch(SHAREPOINT_URL);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ao baixar o arquivo.`);
      const buf = await resp.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const chosen = wb.SheetNames.find((n) => n.toLowerCase() === TARGET_SHEET.toLowerCase()) ||
        wb.SheetNames.find((n) => n.toLowerCase().includes(TARGET_SHEET.toLowerCase()));
      if (!chosen) throw new Error(`A aba "${TARGET_SHEET}" não foi encontrada. Abas: ${wb.SheetNames.join(", ")}`);
      const ws = wb.Sheets[chosen];
      const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      if (!aoa || aoa.length === 0) throw new Error(`A aba "${chosen}" está vazia.`);
      const headers = aoa[0].map((h) => (h == null ? "" : String(h)));
      const data = aoa.slice(1).map((row) => {
        const o: any = {};
        headers.forEach((h, i) => (o[h] = row[i] ?? ""));
        const dt = parseDateFlexible(o[COLS.data]);
        o.__date = dt; o.__date_str = formatDateBR(dt);
        [COLS.receita, COLS.custoTotal, COLS.peso, COLS.volumes, COLS.ctrcs, COLS.coletas, COLS.entregas, COLS.retorno, ...COST_FIELDS].forEach((k) => {
          if (o[k] !== undefined) o[k] = toNumberBR(o[k]);
        });
        return o;
      });
      let maxDt: Date | null = null;
      for (const r of data) { if (r.__date && (!maxDt || r.__date > maxDt)) maxDt = r.__date; }
      setRawRows(data); setLastDate(maxDt);
      if (session && session.role !== "admin" && session.unidade !== "*") setFilterUnidade(session.unidade);
    } catch (e: any) {
      const msg = e && e.message ? e.message : String(e);
      const hint = msg.toLowerCase().includes("cors") || msg.includes("Failed to fetch")
        ? "\nPossível bloqueio CORS do SharePoint. Hospede este app ou use um proxy com CORS liberado."
        : "";
      setError(`Falha ao carregar: ${msg}${hint}`);
    } finally { setLoading(false); }
  }

  useEffect(() => { if (session) loadData(); }, [session]);

  // SUBCONJUNTOS
  const rowsLastDay = useMemo(() => {
    if (!rawRows.length || !lastDate) return [] as any[];
    return rawRows.filter((r) => sameDay(r.__date, lastDate));
  }, [rawRows, lastDate]);

  const allUnidades = useMemo(() => uniq(rowsLastDay.map((r) => r[COLS.unidade])), [rowsLastDay]);
  const allTipos = useMemo(() => uniq(rowsLastDay.map((r) => r[COLS.tipo])), [rowsLastDay]);
  const allRels = useMemo(() => uniq(rowsLastDay.map((r) => r[COLS.relacionamento])), [rowsLastDay]);

  const scopedRows = useMemo(() => {
    let arr = rowsLastDay;
    if (session && session.role !== "admin" && session.unidade !== "*") arr = arr.filter((r) => r[COLS.unidade] === session.unidade);
    if (filterUnidade) arr = arr.filter((r) => r[COLS.unidade] === filterUnidade);
    if (filterTipo) arr = arr.filter((r) => r[COLS.tipo] === filterTipo);
    if (filterRel) arr = arr.filter((r) => r[COLS.relacionamento] === filterRel);
    return arr;
  }, [rowsLastDay, session, filterUnidade, filterTipo, filterRel]);

  const prevDate = useMemo(() => findPrevDate(rawRows, lastDate), [rawRows, lastDate]);
  const rowsPrevDay = useMemo(() => {
    if (!prevDate) return [] as any[];
    let arr = rawRows.filter((r) => sameDay(r.__date, prevDate));
    if (session && session.role !== "admin" && session.unidade !== "*") arr = arr.filter((r) => r[COLS.unidade] === session.unidade);
    if (filterUnidade) arr = arr.filter((r) => r[COLS.unidade] === filterUnidade);
    if (filterTipo) arr = arr.filter((r) => r[COLS.tipo] === filterTipo);
    if (filterRel) arr = arr.filter((r) => r[COLS.relacionamento] === filterRel);
    return arr;
  }, [rawRows, prevDate, session, filterUnidade, filterTipo, filterRel]);

  const totalsCurr = useMemo(() => ({
    receita: sum(scopedRows, (x) => x[COLS.receita]),
    custo: sum(scopedRows, (x) => x[COLS.custoTotal]),
    entregas: sum(scopedRows, (x) => x[COLS.entregas]),
    coletas: sum(scopedRows, (x) => x[COLS.coletas]),
    ctrcs: sum(scopedRows, (x) => x[COLS.ctrcs]),
    peso: sum(scopedRows, (x) => x[COLS.peso]),
  }), [scopedRows]);
  const totalsPrev = useMemo(() => ({
    receita: sum(rowsPrevDay, (x) => x[COLS.receita]),
    custo: sum(rowsPrevDay, (x) => x[COLS.custoTotal]),
    entregas: sum(rowsPrevDay, (x) => x[COLS.entregas]),
    coletas: sum(rowsPrevDay, (x) => x[COLS.coletas]),
    ctrcs: sum(rowsPrevDay, (x) => x[COLS.ctrcs]),
    peso: sum(rowsPrevDay, (x) => x[COLS.peso]),
  }), [rowsPrevDay]);

  const resumoPorUnidade = useMemo(() => {
    const g = groupBy(scopedRows, (r) => r[COLS.unidade] || "(sem unidade)");
    const out: any[] = [];
    for (const [uni, items] of g.entries()) {
      out.push({ unidade: uni, receita: sum(items, (x) => x[COLS.receita]), custo: sum(items, (x) => x[COLS.custoTotal]), peso: sum(items, (x) => x[COLS.peso]), ctrcs: sum(items, (x) => x[COLS.ctrcs]), coletas: sum(items, (x) => x[COLS.coletas]), entregas: sum(items, (x) => x[COLS.entregas]) });
    }
    return out.sort((a, b) => a.unidade.localeCompare(b.unidade));
  }, [scopedRows]);

  const mediasTipoNaUnidade = useMemo(() => {
    const key = (r: any) => `${r[COLS.unidade]}||${r[COLS.tipo]}`;
    const g = groupBy(scopedRows, key);
    const out = new Map<string, any>();
    for (const [k, items] of g.entries()) {
      const n = items.length || 1;
      out.set(k, {
        peso: sum(items, (x) => x[COLS.peso]) / n,
        ctrcs: sum(items, (x) => x[COLS.ctrcs]) / n,
        coletas: sum(items, (x) => x[COLS.coletas]) / n,
        entregas: sum(items, (x) => x[COLS.entregas]) / n,
      });
    }
    return out;
  }, [scopedRows]);

  const porPlaca = useMemo(() => {
    const g = groupBy(scopedRows, (r) => r[COLS.placa] || "(sem placa)");
    const out: any[] = [];
    for (const [placa, items] of g.entries()) {
      out.push({ placa, unidade: items[0][COLS.unidade], tipo: items[0][COLS.tipo], relacionamento: items[0][COLS.relacionamento], receita: sum(items, (x) => x[COLS.receita]), custo: sum(items, (x) => x[COLS.custoTotal]), coletas: sum(items, (x) => x[COLS.coletas]), entregas: sum(items, (x) => x[COLS.entregas]), ctrcs: sum(items, (x) => x[COLS.ctrcs]) });
    }
    return out;
  }, [scopedRows]);

  const topReceita = useMemo(() => [...porPlaca].sort((a, b) => b.receita - a.receita).slice(0, 10), [porPlaca]);
  const bottomReceita = useMemo(() => [...porPlaca].sort((a, b) => a.receita - b.receita).slice(0, 10), [porPlaca]);
  const maioresCustos = useMemo(() => [...porPlaca].sort((a, b) => b.custo - a.custo).slice(0, 10), [porPlaca]);

  const custosDecomp = useMemo(() => {
    const tot = sum(scopedRows, (x) => x[COLS.custoTotal]);
    const parts = COST_FIELDS.map((f) => ({ campo: f, valor: sum(scopedRows, (x) => x[f]) }))
      .filter((x) => x.valor > 0)
      .sort((a, b) => b.valor - a.valor);
    return { tot, parts };
  }, [scopedRows]);

  const custosProd = useMemo(() => {
    return COST_FIELDS.map((f) => {
      const items = scopedRows.filter((x) => toNumberBR(x[f]) > 0);
      return { campo: f, ctrcs: sum(items, (x) => x[COLS.ctrcs]), coletas: sum(items, (x) => x[COLS.coletas]), entregas: sum(items, (x) => x[COLS.entregas]), peso: sum(items, (x) => x[COLS.peso]) };
    }).filter((r) => r.ctrcs || r.coletas || r.entregas || r.peso);
  }, [scopedRows]);

  const grafColetasEntregas = useMemo(() => {
    const g = groupBy(scopedRows, (r) => r[COLS.placa] || "(sem placa)");
    const rows: any[] = [];
    for (const [placa, items] of g.entries()) rows.push({ placa, coletas: sum(items, (x) => x[COLS.coletas]), entregas: sum(items, (x) => x[COLS.entregas]) });
    return rows.slice(0, 30);
  }, [scopedRows]);
  const grafCustoVsDesempenho = useMemo(() => porPlaca.map((p) => ({ placa: p.placa, custo: p.custo, entregas: p.entregas, grupo: (p.relacionamento || "").toLowerCase().includes("frota") ? "Frota" : "Agregado/Outro" })), [porPlaca]);

  const resumoTexto = useMemo(() => {
    if (!scopedRows.length) return "Sem registros para os filtros.";
    return `Resumo do dia ${formatDateBR(lastDate)} — Unidade: ${filterUnidade || (session && session.role !== "admin" ? session.unidade : "todas as unidades")}. Receita ${fmt0(totalsCurr.receita)}, Custo ${fmt0(totalsCurr.custo)}, Entregas ${fmt0(totalsCurr.entregas)}, Coletas ${fmt0(totalsCurr.coletas)}.`;
  }, [scopedRows, lastDate, filterUnidade, session, totalsCurr]);

  // =============================================================
  // TELAS
  // =============================================================
  if (!session) {
    // LOGIN com imagem de fundo à direita (preenche espaço sobrando)
    return (
      <div className="min-h-screen w-screen bg-white text-gray-900 antialiased">
        <div className="flex min-h-screen">
          <div className="flex items-center justify-center w-full md:w-[480px] p-6">
            <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow">
              <h1 className="text-2xl font-bold mb-4">CDI – Análise Diária</h1>
              <form onSubmit={signIn} className="space-y-3">
                <div>
                  <label className="text-sm">Usuário</label>
                  <input className="mt-1 w-full rounded-xl border px-3 py-2 text-gray-900" value={loginUser} onChange={(e) => setLoginUser(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm">Senha</label>
                  <input type="password" className="mt-1 w-full rounded-xl border px-3 py-2 text-gray-900" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} />
                </div>
                {authError && <div className="text-sm text-red-600">{authError}</div>}
                <button className="w-full rounded-xl" style={{ background: BRAND_BLUE, color: "#fff", padding: "8px 0" }}>Entrar</button>
              </form>
            </div>
          </div>
          {/* Área de imagem de marca ao lado direito */}
          <div className="hidden md:block flex-1" style={{ backgroundImage: "url(https://generoso.com.br/static/7044e3eebe94961b290fb958dd42e7bc/17951/top-main-bg.webp)", backgroundSize: "cover", backgroundPosition: "center" }} />
        </div>
      </div>
    );
  }

  function AdminPanel() {
    const [u, setU] = useState("");
    const [p, setP] = useState("");
    const [un, setUn] = useState("");
    const [err, setErr] = useState("");
    const [ok, setOk] = useState("");
    return (
      <Panel title="Admin – Gerenciar usuários" right={<span className="text-xs text-white/80">Somente administrador</span>}>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div>
              <label className="text-sm">Usuário</label>
              <input className="mt-1 w-full rounded-xl border px-3 py-2 text-gray-900" value={u} onChange={(e) => setU(e.target.value)} />
            </div>
            <div>
              <label className="text-sm">Senha</label>
              <input type="password" className="mt-1 w-full rounded-xl border px-3 py-2 text-gray-900" value={p} onChange={(e) => setP(e.target.value)} />
            </div>
            <div>
              <label className="text-sm">Unidade (escopo)</label>
              <input className="mt-1 w-full rounded-xl border px-3 py-2 text-gray-900" placeholder="Ex.: MATRIZ, SP, BAURU…" value={un} onChange={(e) => setUn(e.target.value)} />
            </div>
            <button
              className="rounded-xl text-white px-4 py-2"
              style={{ background: BRAND_BLUE }}
              onClick={() => {
                setErr(""); setOk("");
                try {
                  if (!u || !p || !un) throw new Error("Preencha usuário, senha e unidade.");
                  addUser({ username: u, password: p, role: "user", unidade: un });
                  setOk("Usuário criado!"); setU(""); setP(""); setUn("");
                } catch (e: any) { setErr(String(e.message || e)); }
              }}
            >Criar usuário</button>
            {err && <div className="text-sm text-red-600">{err}</div>}
            {ok && <div className="text-sm text-green-700">{ok}</div>}
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-2">Usuários cadastrados</div>
            <Table columns={[{ key: "username", title: "Usuário" }, { key: "role", title: "Perfil" }, { key: "unidade", title: "Unidade" }]} data={users} keyField="username" />
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <div className="min-h-screen w-screen bg-white text-gray-900 antialiased">
      <header className="sticky top-0 z-10" style={{ background: BRAND_BLUE, color: "#fff", borderBottom: "0" }}>
        <div className="w-full px-4 md:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">CDI – Análise Diária</div>
            <div className="text-xs text-white/90">Transporte Generoso - Controladoria</div>
            <div className="text-xs text-white/80">Último dia do arquivo: {lastDate ? formatDateBR(lastDate) : "—"}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-200">{session.username} ({session.role})</span>
            <button className="rounded-lg px-3 py-1 text-sm" style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff" }} onClick={signOut}>Sair</button>
          </div>
        </div>
      </header>

      {/* Conteúdo sem limite de largura, ocupando a página toda */}
      <main className="w-full max-w-none px-4 md:px-6 lg:px-8 py-4 space-y-6">
        <Panel
          title="Filtros"
          right={<button className="rounded-lg text-white text-sm px-3 py-1" style={{ background: BRAND_BLUE }} onClick={loadData}>{loading ? "Carregando…" : "Recarregar"}</button>}
        >
          {error && (
            <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 whitespace-pre-wrap">{error}</div>
          )}
          <div className="grid md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-gray-600">Unidade</label>
              <select className="mt-1 w-full rounded-xl border px-3 py-2 text-gray-900" value={filterUnidade} onChange={(e) => setFilterUnidade(e.target.value)} disabled={session.role !== "admin" && session.unidade !== "*"}>
                <option value="">(todas)</option>
                {allUnidades.map((u) => (<option key={u} value={u}>{u}</option>))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600">Tipo de Veículo</label>
              <select className="mt-1 w-full rounded-xl border px-3 py-2 text-gray-900" value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)}>
                <option value="">(todos)</option>
                {allTipos.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600">Relacionamento</label>
              <select className="mt-1 w-full rounded-xl border px-3 py-2 text-gray-900" value={filterRel} onChange={(e) => setFilterRel(e.target.value)}>
                <option value="">(todos)</option>
                {allRels.map((r) => (<option key={r} value={r}>{r}</option>))}
              </select>
            </div>
          </div>
        </Panel>

        <Panel title="Resumo do Dia">
          <div className="mb-3 text-sm text-gray-700">{resumoTexto}</div>
          <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Stat label="Receita" value={fmt0(totalsCurr.receita)} trend={trendArrow(totalsCurr.receita, totalsPrev.receita)} />
            <Stat label="Custo" value={fmt0(totalsCurr.custo)} trend={trendArrow(totalsCurr.custo, totalsPrev.custo)} />
            <Stat label="Entregas" value={fmt0(totalsCurr.entregas)} trend={trendArrow(totalsCurr.entregas, totalsPrev.entregas)} />
            <Stat label="Coletas" value={fmt0(totalsCurr.coletas)} trend={trendArrow(totalsCurr.coletas, totalsPrev.coletas)} />
            <Stat label="CTRCs" value={fmt0(totalsCurr.ctrcs)} trend={trendArrow(totalsCurr.ctrcs, totalsPrev.ctrcs)} />
            <Stat label="Peso (kg)" value={fmt0(totalsCurr.peso)} trend={trendArrow(totalsCurr.peso, totalsPrev.peso)} />
          </div>
          <div className="mt-4">
            <Table
              columns={[
                { key: "unidade", title: "Unidade" },
                { key: "receita", title: "Receita", render: (r: any) => fmt0(r.receita) },
                { key: "custo", title: "Custo", render: (r: any) => fmt0(r.custo) },
                { key: "entregas", title: "Entregas" },
                { key: "coletas", title: "Coletas" },
                { key: "ctrcs", title: "CTRCs" },
                { key: "peso", title: "Peso (kg)", render: (r: any) => fmt0(r.peso) },
              ]}
              data={resumoPorUnidade}
              keyField="unidade"
            />
          </div>
        </Panel>

        <Panel title="Por Tipo de Veículo → Placa (sinalização vs. média do tipo na unidade)">
          <Table
            columns={[
              { key: "unidade", title: "Unidade", render: (r: any) => r[COLS.unidade] },
              { key: "tipo", title: "Tipo", render: (r: any) => r[COLS.tipo] },
              { key: "placa", title: "Placa", render: (r: any) => r[COLS.placa] },
              { key: "peso", title: "Peso", render: (r: any) => { const k = `${r[COLS.unidade]}||${r[COLS.tipo]}`; const m = mediasTipoNaUnidade.get(k); const v = r[COLS.peso]; if (!m) return fmt0(v); const a = arrowColorLabel(v, m.peso); return <span>{fmt0(v)} <span className="ml-1">{a.node} <span className="text-xs text-gray-600">{a.label}</span></span></span>; } },
              { key: "ctrcs", title: "CTRCs", render: (r: any) => { const k = `${r[COLS.unidade]}||${r[COLS.tipo]}`; const m = mediasTipoNaUnidade.get(k); const v = r[COLS.ctrcs]; if (!m) return fmt0(v); const a = arrowColorLabel(v, m.ctrcs); return <span>{fmt0(v)} <span className="ml-1">{a.node} <span className="text-xs text-gray-600">{a.label}</span></span></span>; } },
              { key: "coletas", title: "Coletas", render: (r: any) => { const k = `${r[COLS.unidade]}||${r[COLS.tipo]}`; const m = mediasTipoNaUnidade.get(k); const v = r[COLS.coletas]; if (!m) return fmt0(v); const a = arrowColorLabel(v, m.coletas); return <span>{fmt0(v)} <span className="ml-1">{a.node} <span className="text-xs text-gray-600">{a.label}</span></span></span>; } },
              { key: "entregas", title: "Entregas", render: (r: any) => { const k = `${r[COLS.unidade]}||${r[COLS.tipo]}`; const m = mediasTipoNaUnidade.get(k); const v = r[COLS.entregas]; if (!m) return fmt0(v); const a = arrowColorLabel(v, m.entregas); return <span>{fmt0(v)} <span className="ml-1">{a.node} <span className="text-xs text-gray-600">{a.label}</span></span></span>; } },
            ]}
            data={scopedRows}
            keyField={COLS.placa}
          />
        </Panel>

        <div className="grid lg:grid-cols-2 gap-6">
          <Panel title="Top 10 Receitas por Placa (dia)">
            <Table columns={[{ key: "placa", title: "Placa" }, { key: "unidade", title: "Unidade" }, { key: "tipo", title: "Tipo" }, { key: "receita", title: "Receita", render: (r: any) => fmt0(r.receita) }]} data={topReceita} keyField="placa" />
          </Panel>
          <Panel title="Bottom 10 Receitas por Placa (dia)">
            <Table columns={[{ key: "placa", title: "Placa" }, { key: "unidade", title: "Unidade" }, { key: "tipo", title: "Tipo" }, { key: "receita", title: "Receita", render: (r: any) => fmt0(r.receita) }]} data={bottomReceita} keyField="placa" />
          </Panel>
        </div>

        <Panel title="Maiores Custos por Placa (Top 10 no dia)">
          <Table columns={[{ key: "placa", title: "Placa" }, { key: "unidade", title: "Unidade" }, { key: "tipo", title: "Tipo" }, { key: "custo", title: "Custo Total", render: (r: any) => fmt0(r.custo) }, { key: "entregas", title: "Entregas" }, { key: "coletas", title: "Coletas" }]} data={maioresCustos} keyField="placa" />
        </Panel>

        <div className="grid lg:grid-cols-2 gap-6">
          <Panel title="Desempenho Operacional – Coletas x Entregas por Placa (dia)">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={grafColetasEntregas}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="placa" hide />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="coletas" fill={BRAND_BLUE_LIGHT} />
                  <Bar dataKey="entregas" fill={BRAND_BLUE} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel title="Custo x Retorno (por Placa) – destaque para baixo desempenho">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="custo" name="Custo" />
                  <YAxis type="number" dataKey="entregas" name="Entregas" />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                  <Legend />
                  <Scatter data={grafCustoVsDesempenho.filter((d) => d.grupo === 'Frota')} name="Frota" fill={BRAND_BLUE} />
                  <Scatter data={grafCustoVsDesempenho.filter((d) => d.grupo !== 'Frota')} name="Agregado/Outro" fill={BRAND_BLUE_LIGHT} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="text-xs text-gray-600 mt-2">Eixo X: custo total do dia; Eixo Y: entregas.</div>
          </Panel>
        </div>

        <Panel title="Relação – Frota x Agregado">
          <Table
            columns={[{ key: "rel", title: "Relacionamento" }, { key: "receita", title: "Receita", render: (r: any) => fmt0(r.receita) }, { key: "custo", title: "Custo", render: (r: any) => fmt0(r.custo) }, { key: "entregas", title: "Entregas" }, { key: "coletas", title: "Coletas" }]}
            data={(() => { const g = groupBy(scopedRows, (r) => r[COLS.relacionamento] || "(sem)" ); const arr: any[] = []; for (const [rel, items] of g.entries()) { arr.push({ rel, receita: sum(items, (x) => x[COLS.receita]), custo: sum(items, (x) => x[COLS.custoTotal]), entregas: sum(items, (x) => x[COLS.entregas]), coletas: sum(items, (x) => x[COLS.coletas]) }); } return arr; })()}
          />
        </Panel>

        <Panel title="Decomposição dos Tipos de Custo (contribuição no total do dia)">
          <div className="text-sm text-gray-700 mb-2">Custo total: {fmt0(custosDecomp.tot)}</div>
          <Table columns={[{ key: "campo", title: "Tipo de Custo" }, { key: "valor", title: "Valor", render: (r: any) => fmt0(r.valor) }, { key: "pct", title: "% do Total", render: (r: any) => (custosDecomp.tot ? ((r.valor / custosDecomp.tot) * 100).toFixed(1) + '%' : '-') }]} data={custosDecomp.parts.map((p) => ({ ...p }))} />
          <div className="mt-6">
            <div className="text-sm text-gray-700 mb-2">Produção total do dia por tipo de custo (veículos com custo &gt; 0)</div>
            <Table columns={[{ key: "campo", title: "Tipo de Custo" }, { key: "ctrcs", title: "CTRCs", render: (r: any) => fmt0(r.ctrcs) }, { key: "coletas", title: "Coletas", render: (r: any) => fmt0(r.coletas) }, { key: "entregas", title: "Entregas", render: (r: any) => fmt0(r.entregas) }, { key: "peso", title: "Peso (kg)", render: (r: any) => fmt0(r.peso) }]} data={custosProd} keyField="campo" />
          </div>
        </Panel>

        {session.role === "admin" && <AdminPanel />}
      </main>
    </div>
  );
}

    </div>
  );
}
