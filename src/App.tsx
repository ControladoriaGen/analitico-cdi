import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

/* =========================
   CONFIG
========================= */

// SharePoint (sempre baixar de novo)
const SP_URL =
  "https://generosocombr-my.sharepoint.com/personal/controladoria_generoso_com_br/_layouts/15/download.aspx?share=ESLYowVkuEBEu82Jfnk-JQ0BfoDxwkd99RFtXTEzbARXEg&download=1";

// A aba verdadeira é "CDIAutomtico1" (sem acento). Vamos localizar de forma tolerante.
const TARGET_SHEET_HINT = "CDIAutomtico1";

// Chave do users.json na branch main
const GH_OWNER = "ControladoriaGen";
const GH_REPO = "analitico-cdi";
const GH_BRANCH = "main";
const GH_USERS_PATH = "public/users.json";

const GH_API_BASE = "https://api.github.com";
const GH_RAW = `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}/${GH_USERS_PATH}`;

// fundo login (coloque a imagem em public/login-bg.jpg)
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
    // serial do Excel
    const o = XLSX.SSF.parse_date_code(v);
    if (o && o.y && o.m && o.d) return new Date(o.y, o.m - 1, o.d);
  }
  const s = String(v).trim();
  // 17/09/2025, 2025-09-17, 17-09-2025 etc.
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
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const fmtInt = (n: number) => n.toLocaleString("pt-BR");
const fmtKg = (n: number) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

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
   DATA TYPES
========================= */

type Row = Record<string, any>;

type MappedCols = {
  dateCol: string | null;
  unitCol: string | null;
  typeCol: string | null;
  relCol: string | null;
  plateCol: string | null;

  // métricas
  receitaCols: string[]; // nomes que contenham 'receita'/'faturamento'
  custoCols: string[];   // nomes que iniciem por 'sum' (custos)
  entregasCols: string[]; // contenham 'entrega'
  coletasCols: string[];  // contenham 'coleta'
  ctrcsCols: string[];    // contenham 'ctrc'
  pesoCols: string[];     // contenham 'peso'
};

function mapColumns(headers: string[]): MappedCols {
  const norm = (h: string) => normalizeKey(h);

  const dateCol =
    headers.find((h) => /datab|databas|data/.test(norm(h))) || null;

  const unitCol =
    headers.find((h) => /unidade/.test(norm(h))) || null;

  const typeCol =
    headers.find((h) => /tipo/.test(norm(h))) || null;

  const relCol =
    headers.find((h) => /relaciona/.test(norm(h))) || null;

  const plateCol =
    headers.find((h) => /placa/.test(norm(h))) || null;

  const receitaCols = headers.filter(
    (h) => /receita|fatura/.test(norm(h))
  );

  const custoCols = headers.filter(
    (h) => /^sum/.test(h) || /^sum/.test(norm(h)) // SumAjudante, SumComissao...
  );

  const entregasCols = headers.filter((h) => /entrega/.test(norm(h)));
  const coletasCols = headers.filter((h) => /coleta/.test(norm(h)));
  const ctrcsCols   = headers.filter((h) => /ctrc/.test(norm(h)));
  const pesoCols    = headers.filter((h) => /peso/.test(norm(h)));

  return {
    dateCol,
    unitCol,
    typeCol,
    relCol,
    plateCol,
    receitaCols,
    custoCols,
    entregasCols,
    coletasCols,
    ctrcsCols,
    pesoCols,
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
      // prioridade: remoto -> local
      const remote = await fetchUsersRemote();
      if (remote) {
        setUsers(remote);
        return;
      }
      const local = loadUsersLocal();
      setUsers(local || []);
    })();
  }, []);

  function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    if (!users || !users.length) {
      setAuthError("Lista de usuários não carregada.");
      return;
    }
    const found = users.find(
      (u) => u.usuario === loginU && u.senha === loginP
    );
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
      if (!chosen)
        chosen = wb.SheetNames.find((n) =>
          normalizeKey(n).includes(want)
        );
      if (!chosen) {
        throw new Error(
          `Aba "${TARGET_SHEET_HINT}" não encontrada. Abas: ${wb.SheetNames.join(", ")}`
        );
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
    if (user) loadFromSharePoint();
  }, [user]);

  // ======= FILTRO & AGREGAÇÃO =======
  const unidades = useMemo(() => {
    if (!mapped?.unitCol) return [];
    const s = new Set<string>();
    rows.forEach((r) => {
      const v = String(r[mapped.unitCol as string] ?? "").trim();
      if (v) s.add(v);
    });
    return Array.from(s).sort();
  }, [rows, mapped]);

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
    if (unidade !== "(todos)" && mapped?.unitCol) {
      arr = arr.filter((r) => String(r[mapped.unitCol as string]) === unidade);
    }
    if (tipo !== "(todos)" && mapped?.typeCol) {
      arr = arr.filter((r) => String(r[mapped.typeCol as string]) === tipo);
    }
    if (rel !== "(todos)" && mapped?.relCol) {
      arr = arr.filter((r) => String(r[mapped.relCol as string]) === rel);
    }
    return arr;
  }, [rows, lastDate, unidade, tipo, rel, mapped]);

  const totals = useMemo(() => {
    if (!mapped) return { receita: 0, custo: 0, entregas: 0, coletas: 0, ctrcs: 0, peso: 0 };
    const receita = sumCols(filtered, mapped.receitaCols);
    const custo = sumCols(filtered, mapped.custoCols);
    const entregas = sumCols(filtered, mapped.entregasCols, true);
    const coletas = sumCols(filtered, mapped.coletasCols, true);
    const ctrcs = sumCols(filtered, mapped.ctrcsCols, true);
    const peso = sumCols(filtered, mapped.pesoCols, true);
    return { receita, custo, entregas, coletas, ctrcs, peso };
  }, [filtered, mapped]);

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
        <form
          onSubmit={doLogin}
          className="w-[360px] rounded-2xl bg-white/90 shadow-lg backdrop-blur border border-slate-200 p-6 space-y-4"
        >
          <div className="rounded-xl bg-[#0b3a8c] text-white px-4 py-3 font-semibold">
            CDI – Análise Diária
          </div>
          <p className="text-xs text-slate-600">
            Transporte Generoso – Controladoria
          </p>
          <div>
            <label className="text-sm text-slate-600">Usuário</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={loginU}
              onChange={(e) => setLoginU(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm text-slate-600">Senha</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2"
              type="password"
              value={loginP}
              onChange={(e) => setLoginP(e.target.value)}
            />
          </div>
          {authError && (
            <div className="text-red-700 text-sm">{authError}</div>
          )}
          <button
            className="w-full rounded-lg bg-[#0b3a8c] text-white py-2 font-semibold hover:brightness-95"
            type="submit"
          >
            Entrar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0b3a8c] text-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <div className="font-semibold">CDI – Análise Diária</div>
            <div className="text-xs opacity-90">
              Transporte Generoso – Controladoria
            </div>
            <div className="text-[11px] mt-1 opacity-90">
              Último dia do arquivo:{" "}
              {lastDate ? lastDate.toLocaleDateString("pt-BR") : "—"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-90">
              {user.usuario} ({user.perfil})
            </span>
            <button
              onClick={logout}
              className="rounded-md bg-white/10 hover:bg-white/20 px-3 py-1 text-sm"
            >
              Sair
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Filtros */}
        <div className="rounded-2xl bg-white shadow border p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grow min-w-[240px]">
              <select
                className="w-full rounded-lg border px-3 py-2 bg-white"
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
              >
                <option>(todos)</option>
                {unidades.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
            <div className="grow min-w-[240px]">
              <select
                className="w-full rounded-lg border px-3 py-2 bg-white"
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
              >
                <option>(todos)</option>
                {tipos.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="grow min-w-[240px]">
              <select
                className="w-full rounded-lg border px-3 py-2 bg-white"
                value={rel}
                onChange={(e) => setRel(e.target.value)}
              >
                <option>(todos)</option>
                {rels.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>

            <button
              onClick={loadFromSharePoint}
              className="rounded-xl bg-[#0b3a8c] text-white px-4 py-2 font-medium hover:brightness-95"
              disabled={loading}
            >
              {loading ? "Carregando..." : "Recarregar"}
            </button>

            {/* Exportar PDF – simples (print da página) */}
            <button
              onClick={() => window.print()}
              className="rounded-xl bg-emerald-600 text-white px-4 py-2 font-medium hover:brightness-95"
            >
              Exportar PDF
            </button>
          </div>
        </div>

        {/* Resumo */}
        <div className="rounded-2xl bg-white shadow border p-3">
          <div className="text-sm text-slate-600 mb-3">
            Resumo do dia{" "}
            {lastDate ? lastDate.toLocaleDateString("pt-BR") : "—"} — Unidades:{" "}
            {unidade === "(todos)" ? "(todas)" : unidade}.
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <Kpi label="Receita" value={fmtBRL(totals.receita)} />
            <Kpi label="Custo" value={fmtBRL(totals.custo)} />
            <Kpi label="Entregas" value={fmtInt(totals.entregas)} />
            <Kpi label="Coletas" value={fmtInt(totals.coletas)} />
            <Kpi label="CTRCs" value={fmtInt(totals.ctrcs)} />
            <Kpi label="Peso (kg)" value={fmtKg(totals.peso)} />
          </div>

          {/* Tabela por Unidade (se existir coluna Unidade) */}
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
                  {groupBy(filtered, mapped.unitCol).map(({ key, items }, i) => {
                    const rec = sumCols(items, mapped.receitaCols);
                    const cus = sumCols(items, mapped.custoCols);
                    const ent = sumCols(items, mapped.entregasCols, true);
                    const col = sumCols(items, mapped.coletasCols, true);
                    const ctr = sumCols(items, mapped.ctrcsCols, true);
                    const pes = sumCols(items, mapped.pesoCols, true);
                    return (
                      <tr key={key} className={i % 2 ? "bg-white" : "bg-slate-50"}>
                        <Td>{key || "-"}</Td>
                        <Td className="text-right">{fmtBRL(rec)}</Td>
                        <Td className="text-right">{fmtBRL(cus)}</Td>
                        <Td className="text-right">{fmtInt(ent)}</Td>
                        <Td className="text-right">{fmtInt(col)}</Td>
                        <Td className="text-right">{fmtInt(ctr)}</Td>
                        <Td className="text-right">{fmtKg(pes)}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Por Tipo → Placa (sinalização) */}
        {mapped?.plateCol && mapped?.typeCol && (
          <div className="rounded-2xl bg-white shadow border">
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
                    <Th className="text-right">Peso</Th>
                    <Th className="text-right">CTRCs</Th>
                    <Th className="text-right">Coletas</Th>
                    <Th className="text-right">Entregas</Th>
                  </tr>
                </thead>
                <tbody>
                  {byTypePlateSignals(filtered, mapped).map((r, i) => (
                    <tr key={i} className={i % 2 ? "bg-white" : "bg-slate-50"}>
                      <Td>{r.unidade}</Td>
                      <Td>{r.tipo}</Td>
                      <Td>{r.placa}</Td>
                      <Td className="text-right">
                        <BadgeSignal value={r.peso} avg={r.avgPeso} />
                      </Td>
                      <Td className="text-right">
                        <BadgeSignal value={r.ctrcs} avg={r.avgCtrcs} />
                      </Td>
                      <Td className="text-right">
                        <BadgeSignal value={r.coletas} avg={r.avgColetas} />
                      </Td>
                      <Td className="text-right">
                        <BadgeSignal value={r.entregas} avg={r.avgEntregas} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Decomposição de custos (só colunas Sum*) */}
        {!!mapped?.custoCols.length && (
          <div className="rounded-2xl bg-white shadow border">
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
                  {costBreakdown(filtered, mapped).map((r, i) => (
                    <tr key={r.nome} className={i % 2 ? "bg-white" : "bg-slate-50"}>
                      <Td>{r.nome}</Td>
                      <Td className="text-right">{fmtBRL(r.valor)}</Td>
                      <Td className="text-right">
                        {(r.pct * 100).toLocaleString("pt-BR", {
                          maximumFractionDigits: 1,
                        })}%
                      </Td>
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

        {/* Análise automática do dia (texto) */}
        <div className="rounded-2xl bg-white shadow border p-3">
          <div className="font-semibold mb-2">Análise automática do dia</div>
          <div className="text-sm text-slate-800">
            Unidade: {unidade === "(todos)" ? "todas" : unidade}. Dia{" "}
            {lastDate ? lastDate.toLocaleDateString("pt-BR") : "—"}.
            {" "}Receita {fmtBRL(totals.receita)} (— vs. dia anterior), custo{" "}
            {fmtBRL(totals.custo)} (—), entregas {fmtInt(totals.entregas)} (—),
            coletas {fmtInt(totals.coletas)} (—), CTRCs {fmtInt(totals.ctrcs)} (—),
            peso {fmtKg(totals.peso)} (—).
            {" "}Custos que mais impactaram hoje: veja a tabela de decomposição.
          </div>
        </div>

        {/* Admin (mesma lógica de antes) */}
        {user.perfil === "admin" && (
          <AdminBox />
        )}

        {/* Erros */}
        {err && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-red-800">
            {err}
          </div>
        )}
      </div>
    </div>
  );
};

/* =========================
   SUBCOMPONENTES / HELPERS
========================= */

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
    Math.abs(diff) < 1e-9
      ? "bg-slate-100 text-slate-700"
      : diff >= 0
      ? "bg-green-100 text-green-700"
      : "bg-red-100 text-red-700";
  const text =
    Math.abs(diff) < 1e-9
      ? "= = média"
      : diff > 0
      ? "▲ acima"
      : "▼ abaixo";
  return (
    <span className={`inline-block rounded-md px-2 py-[2px] text-[11px] ${cls}`}>
      {fmtInt(clamp(value))} {text}
    </span>
  );
};

function byTypePlateSignals(rows: Row[], m: MappedCols) {
  if (!m.unitCol || !m.typeCol || !m.plateCol) return [];
  // médias por (unidade,tipo)
  const keyUT = (r: Row) => `${r[m.unitCol!]}||${r[m.typeCol!]}`;
  const groups = new Map<string, Row[]>();
  rows.forEach((r) => {
    const k = keyUT(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  });
  const avg = new Map<string, { peso: number; ctrcs: number; coletas: number; entregas: number }>();
  for (const [k, items] of groups) {
    const a = {
      peso: sumCols(items, m.pesoCols, true) / Math.max(items.length, 1),
      ctrcs: sumCols(items, m.ctrcsCols, true) / Math.max(items.length, 1),
      coletas: sumCols(items, m.coletasCols, true) / Math.max(items.length, 1),
      entregas: sumCols(items, m.entregasCols, true) / Math.max(items.length, 1),
    };
    avg.set(k, a);
  }
  // linhas
  return rows.map((r) => {
    const k = keyUT(r);
    const a = avg.get(k) || { peso: 0, ctrcs: 0, coletas: 0, entregas: 0 };
    return {
      unidade: r[m.unitCol!],
      tipo: r[m.typeCol!],
      placa: r[m.plateCol!],
      peso: clamp(sumCols([r], m.pesoCols, true)),
      ctrcs: clamp(sumCols([r], m.ctrcsCols, true)),
      coletas: clamp(sumCols([r], m.coletasCols, true)),
      entregas: clamp(sumCols([r], m.entregasCols, true)),
      avgPeso: clamp(a.peso),
      avgCtrcs: clamp(a.ctrcs),
      avgColetas: clamp(a.coletas),
      avgEntregas: clamp(a.entregas),
    };
  });
}

function costBreakdown(rows: Row[], m: MappedCols) {
  if (!m.custoCols.length) return [];
  const total = sumCols(rows, m.custoCols);
  const out = m.custoCols.map((c) => {
    const nome = c.replace(/^Sum/i, "");
    const valor = sumCols(rows, [c]);
    const pct = total > 0 ? valor / total : 0;
    const ctrcs = sumCols(rows, m.ctrcsCols, true);
    const coletas = sumCols(rows, m.coletasCols, true);
    const entregas = sumCols(rows, m.entregasCols, true);
    const peso = sumCols(rows, m.pesoCols, true);
    return { nome, valor, pct, ctrcs, coletas, entregas, peso };
  });
  // ordena desc por valor
  out.sort((a, b) => b.valor - a.valor);
  return out;
}

/* ============== Admin simples (mantém o que já funcionava) ============== */

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
    <div className="rounded-2xl bg-white shadow border p-3">
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
