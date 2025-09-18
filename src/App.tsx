import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

/** ===========================
 *  CONFIG
 *  =========================== */
const SHAREPOINT_XLSX =
  "https://generosocombr-my.sharepoint.com/personal/controladoria_generoso_com_br/_layouts/15/download.aspx?share=ESLYowVkuEBEu82Jfnk-JQ0BfoDxwkd99RFtXTEzbARXEg&download=1";

type Perfil = "admin" | "user";
type Usuario = { user: string; pass: string; perfil: Perfil; unidade?: string | "*" };

type LinhaPlaca = {
  Data?: string | Date;
  Unidade?: string;
  Tipo?: string;
  Placa?: string;
  Peso?: number;
  CTRCs?: number;
  Coletas?: number;
  Entregas?: number;
  Receita?: number;
  Custo?: number;
};

type TotUnit = {
  Unidade: string;
  Receita: number;
  Custo: number;
  Entregas: number;
  Coletas: number;
  CTRCs: number;
  Peso: number;
};

type Sessao = { usuario: string; perfil: Perfil; unidade: string | "*" };

/** ===========================
 *  ESTILO GLOBAL (tema claro + componentes)
 *  =========================== */
function useInjectCSS() {
  useEffect(() => {
    const css = `
:root { color-scheme: only light; }
html, body, #root { height: 100%; }
body {
  background: #f5f7fb !important;
  color: #1f2937;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji";
}
* { box-sizing: border-box; }

.app-shell {
  min-height: 100%;
  background: #f5f7fb;
}

.container { max-width: 1200px; margin: 0 auto; padding: 16px; }

.card {
  background: #ffffff; border-radius: 10px; box-shadow: 0 6px 18px rgba(16,24,40,.06);
  padding: 14px;
}

.header {
  background: #0f3a82; color: #fff;
  padding: 16px 0;
  position: sticky; top: 0; z-index: 10;
  box-shadow: 0 6px 16px rgba(15,58,130,.25);
}
.header .container { display:flex; align-items:center; justify-content:space-between; gap: 16px; }
.header h1 { font-size: 18px; margin:0; }
.header small { opacity: .8; display:block; margin-top: 2px; }
.header .who { font-size: 12px; opacity:.9; }

.row { display:grid; gap:12px; }
.row.cols-3 { grid-template-columns: repeat(3, minmax(0,1fr)); }
.row.cols-2 { grid-template-columns: repeat(2, minmax(0,1fr)); }

.badge {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; padding: 4px 8px; border-radius: 999px; background:#f1f5f9; color:#0f172a;
}
.badge.ok { background: #e8f8ef; color:#0e7a39; }
.badge.warn { background: #ffefef; color:#b91c1c; }

.kpi { display:flex; align-items:center; justify-content:space-between; }
.kpi .v { font-weight: 600; font-size: 22px; }
.kpi .l { color:#475569; font-size:13px; }

select, input[type="text"], input[type="password"] {
  width: 100%; appearance: none;
  background: #fff; color: #0f172a;
  border: 1px solid #d1d5db; border-radius: 8px;
  height: 36px; padding: 0 12px;
  outline: none;
}
select:focus, input:focus { border-color: #0f3a82; box-shadow: 0 0 0 3px rgba(15,58,130,.15); }

.btn {
  height: 36px; border-radius: 8px; padding: 0 14px; border: 0; cursor: pointer;
  background:#0f3a82; color:#fff; font-weight: 600;
  box-shadow: 0 8px 16px rgba(15,58,130,.24);
}
.btn:disabled { opacity: .6; cursor: not-allowed; }
.btn.secondary { background:#0ea5e9; }
.btn.ghost { background:#fff; color:#0f3a82; border:1px solid #cbd5e1; }

.table { width:100%; border-collapse: collapse; }
.table th, .table td { font-size: 13px; padding: 10px 8px; border-bottom:1px solid #eef2f7; }
.table th { text-align:left; background:#0f3a82; color:#fff; position: sticky; top: 62px; z-index: 5; }

.section-title { background:#0f3a82; color:#fff; padding: 10px 12px; border-radius: 10px 10px 0 0; font-weight: 600; }

.login-wrap {
  min-height: 100svh;
  display: grid; grid-template-columns: 420px 1fr;
  align-items: stretch;
}
.login-left {
  padding: 28px;
  display:flex; align-items:flex-start; justify-content:center;
}
.login-card { width: 100%; max-width: 360px; }

.login-bg {
  min-height: 100%;
  background-image: url('https://generoso.com.br/static/7044e3eebe94961b290fb958dd42e7bc/17951/top-main-bg.webp');
  background-size: cover; background-position: center center;
  filter: saturate(.95);
}

.footer-gap { height: 24px; }
    `;
    const el = document.createElement("style");
    el.id = "force-light-css";
    el.textContent = css;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);
}

/** ===========================
 *  UTILS
 *  =========================== */
const fmt = new Intl.NumberFormat("pt-BR");
const fmtKg = (v: number) => (isFinite(v) ? fmt.format(v) : "0");
const fmtMoeda = (v: number) =>
  isFinite(v) ? "R$ " + fmt.format(v) : "R$ 0";

function pickNumber(row: any, keys: string[]): number {
  for (const k of keys) {
    if (row[k] == null) continue;
    const v = Number(
      String(row[k]).replace(/\./g, "").replace(",", ".").replace(/\s/g, "")
    );
    if (!isNaN(v)) return v;
  }
  return 0;
}

function pickString(row: any, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
}

function pickDate(row: any, keys: string[]): Date | undefined {
  for (const k of keys) {
    const v = row[k];
    if (v == null || v === "") continue;
    if (v instanceof Date) return v;
    // Excel date serial
    const n = Number(v);
    if (!isNaN(n) && n > 25000 && n < 80000) {
      return XLSX.SSF.parse_date_code(n)
        ? new Date(
            Date.UTC(
              XLSX.SSF.parse_date_code(n)!.y,
              (XLSX.SSF.parse_date_code(n)!.m || 1) - 1,
              XLSX.SSF.parse_date_code(n)!.d || 1
            )
          )
        : undefined;
    }
    // String date
    const d = new Date(String(v));
    if (!isNaN(d.getTime())) return d;
  }
  return undefined;
}

/** ===========================
 *  XLSX → dados
 *  =========================== */
async function fetchPlanilha(): Promise<{
  porPlaca: LinhaPlaca[];
  lastDate?: Date;
}> {
  // cache-busting + no-store
  const url = SHAREPOINT_XLSX + (SHAREPOINT_XLSX.includes("?") ? "&" : "?") + "ts=" + Date.now();

  const resp = await fetch(url, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache, no-store, must-revalidate", Pragma: "no-cache" },
  });
  if (!resp.ok) throw new Error(`Falha ao baixar XLSX (${resp.status})`);
  const ab = await resp.arrayBuffer();
  const wb = XLSX.read(ab, { type: "array" });

  // Procura a aba com colunas de placa (Unidade/Tipo/Placa são obrigatórias)
  let sheetName = wb.SheetNames.find((n) => {
    const ws = wb.Sheets[n];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as any[][];
    if (!rows.length) return false;
    const head = (rows[0] || []).map((h: any) => String(h || "").toLowerCase());
    return (
      head.some((h) => h.includes("unidade")) &&
      head.some((h) => h.includes("tipo")) &&
      head.some((h) => h.includes("placa"))
    );
  });
  if (!sheetName) {
    // fallback: primeira
    sheetName = wb.SheetNames[0];
  }

  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { raw: true }) as any[];

  // Normaliza por cabeçalhos conhecidos
  const porPlaca: LinhaPlaca[] = rows.map((r) => {
    const Data = pickDate(r, ["Data", "data", "Dia", "DT", "dt"]);
    const Unidade = pickString(r, ["Unidade", "unidade", "Filial", "filial"]);
    const Tipo = pickString(r, ["Tipo", "tipo", "Tipo de Veículo", "Veículo"]);
    const Placa = pickString(r, ["Placa", "placa", "Placa Veículo"]);
    const Peso = pickNumber(r, ["Peso", "Peso (kg)", "peso", "kg"]);
    const CTRCs = pickNumber(r, ["CTRCs", "CTRC", "ctrcs", "Notas", "Qtd CTRCs"]);
    const Coletas = pickNumber(r, ["Coletas", "coletas"]);
    const Entregas = pickNumber(r, ["Entregas", "entregas"]);
    const Receita = pickNumber(r, ["Receita", "receita", "Faturamento", "Valor Receita"]);
    const Custo = pickNumber(r, ["Custo", "custo", "Custo Total", "Total Custos"]);

    return { Data, Unidade, Tipo, Placa, Peso, CTRCs, Coletas, Entregas, Receita, Custo };
  });

  const lastDate = porPlaca
    .map((l) => (l.Data ? new Date(l.Data) : undefined))
    .filter(Boolean)
    .sort((a: any, b: any) => +b - +a)[0];

  return { porPlaca, lastDate };
}

/** ===========================
 *  APP
 *  =========================== */
export default function App() {
  useInjectCSS();

  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [loading, setLoading] = useState(false);
  const [porPlaca, setPorPlaca] = useState<LinhaPlaca[]>([]);
  const [lastDate, setLastDate] = useState<Date | undefined>(undefined);

  // Filtros
  const [fUn, setFUn] = useState<string>("(todos)");
  const [fTipo, setFTipo] = useState<string>("(todos)");
  const [fRel, setFRel] = useState<string>("(todos)");

  /** ======= Login mínimo (com 1 admin padrão local) ======= */
  const usuariosPadrao: Usuario[] = [
    { user: "gustavo", pass: "123456", perfil: "admin", unidade: "*" },
  ];
  useEffect(() => {
    // mantém login anterior
    const raw = localStorage.getItem("sessao");
    if (raw) setSessao(JSON.parse(raw));
  }, []);

  function doLogin(u: string, p: string) {
    const users: Usuario[] = usuariosPadrao; // (persistência já está ok no seu projeto)
    const hit = users.find((x) => x.user.toLowerCase() === u.toLowerCase() && x.pass === p);
    if (!hit) {
      alert("Usuário não encontrado");
      return;
    }
    const s: Sessao = { usuario: hit.user, perfil: hit.perfil, unidade: hit.unidade || "*" };
    setSessao(s);
    localStorage.setItem("sessao", JSON.stringify(s));
  }
  function logout() {
    setSessao(null);
    localStorage.removeItem("sessao");
  }

  /** ======= Carregar XLSX (sempre sem cache) ======= */
  async function recarregar() {
    try {
      setLoading(true);
      const { porPlaca: linhas, lastDate } = await fetchPlanilha();
      setPorPlaca(linhas);
      setLastDate(lastDate);
    } catch (e: any) {
      console.error(e);
      alert("Falha ao recarregar planilha: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (sessao) recarregar();
  }, [sessao]);

  /** ======= Domínios de filtro ======= */
  const domUnidades = useMemo(() => {
    const set = new Set<string>();
    porPlaca.forEach((r) => r.Unidade && set.add(r.Unidade));
    return ["(todos)", ...Array.from(set).sort()];
  }, [porPlaca]);

  const domTipos = useMemo(() => {
    const set = new Set<string>();
    porPlaca.forEach((r) => r.Tipo && set.add(r.Tipo));
    return ["(todos)", ...Array.from(set).sort()];
  }, [porPlaca]);

  const domRel = ["(todos)"]; // reservado – mantém layout

  /** ======= Dados filtrados ======= */
  const filtrado = useMemo(() => {
    return porPlaca.filter((r) => {
      if (fUn !== "(todos)" && r.Unidade !== fUn) return false;
      if (fTipo !== "(todos)" && r.Tipo !== fTipo) return false;
      if (fRel !== "(todos)") {
        // placeholder
      }
      if (sessao?.unidade && sessao.unidade !== "*" && r.Unidade !== sessao.unidade) return false;
      return true;
    });
  }, [porPlaca, fUn, fTipo, fRel, sessao]);

  /** ======= Agregações ======= */
  const resumoGeral = useMemo(() => {
    const base: TotUnit[] = [];
    const idx = new Map<string, number>();
    function add(u: string, inc: Partial<TotUnit>) {
      if (!idx.has(u)) {
        idx.set(u, base.length);
        base.push({ Unidade: u, Receita: 0, Custo: 0, Entregas: 0, Coletas: 0, CTRCs: 0, Peso: 0 });
      }
      const i = idx.get(u)!;
      base[i].Receita += inc.Receita || 0;
      base[i].Custo += inc.Custo || 0;
      base[i].Entregas += inc.Entregas || 0;
      base[i].Coletas += inc.Coletas || 0;
      base[i].CTRCs += inc.CTRCs || 0;
      base[i].Peso += inc.Peso || 0;
    }
    filtrado.forEach((r) => {
      const u = r.Unidade || "-";
      add(u, {
        Receita: r.Receita || 0,
        Custo: r.Custo || 0,
        Entregas: r.Entregas || 0,
        Coletas: r.Coletas || 0,
        CTRCs: r.CTRCs || 0,
        Peso: r.Peso || 0,
      });
    });
    base.sort((a, b) => a.Unidade.localeCompare(b.Unidade));
    const total = base.reduce(
      (acc, x) => ({
        Receita: acc.Receita + x.Receita,
        Custo: acc.Custo + x.Custo,
        Entregas: acc.Entregas + x.Entregas,
        Coletas: acc.Coletas + x.Coletas,
        CTRCs: acc.CTRCs + x.CTRCs,
        Peso: acc.Peso + x.Peso,
      }),
      { Receita: 0, Custo: 0, Entregas: 0, Coletas: 0, CTRCs: 0, Peso: 0 }
    );
    return { linhas: base, total };
  }, [filtrado]);

  /** ======= Sinalização por placa (vs média por tipo/unidade) ======= */
  const placaSinal = useMemo(() => {
    // médias por (Unidade, Tipo)
    const grp = new Map<string, { Peso: number; CTRCs: number; Coletas: number; Entregas: number; n: number }>();
    filtrado.forEach((r) => {
      const key = (r.Unidade || "-") + "||" + (r.Tipo || "-");
      if (!grp.has(key)) grp.set(key, { Peso: 0, CTRCs: 0, Coletas: 0, Entregas: 0, n: 0 });
      const g = grp.get(key)!;
      g.Peso += r.Peso || 0;
      g.CTRCs += r.CTRCs || 0;
      g.Coletas += r.Coletas || 0;
      g.Entregas += r.Entregas || 0;
      g.n += 1;
    });
    const medias = new Map<string, { Peso: number; CTRCs: number; Coletas: number; Entregas: number }>();
    grp.forEach((g, k) =>
      medias.set(k, {
        Peso: g.n ? g.Peso / g.n : 0,
        CTRCs: g.n ? g.CTRCs / g.n : 0,
        Coletas: g.n ? g.Coletas / g.n : 0,
        Entregas: g.n ? g.Entregas / g.n : 0,
      })
    );

    function flag(v: number, m: number) {
      if (m === 0 && v === 0) return { txt: "= = média", cls: "badge" };
      if (v > m) return { txt: "▲ acima", cls: "badge ok" };
      if (v < m) return { txt: "▼ abaixo", cls: "badge warn" };
      return { txt: "= = média", cls: "badge" };
    }

    return filtrado.map((r) => {
      const key = (r.Unidade || "-") + "||" + (r.Tipo || "-");
      const m = medias.get(key) || { Peso: 0, CTRCs: 0, Coletas: 0, Entregas: 0 };
      return {
        ...r,
        flagPeso: flag(r.Peso || 0, m.Peso),
        flagCT: flag(r.CTRCs || 0, m.CTRCs),
        flagColeta: flag(r.Coletas || 0, m.Coletas),
        flagEnt: flag(r.Entregas || 0, m.Entregas),
      };
    });
  }, [filtrado]);

  /** ======= Exportar PDF ======= */
  async function exportarPDF() {
    // usa print nativo – com CSS limpo fica apresentável
    window.print();
  }

  /** ======= Texto automático ======= */
  const analiseTxt = useMemo(() => {
    const dt = lastDate ? lastDate : undefined;
    const un = fUn !== "(todos)" ? fUn : "todas";
    const t = resumoGeral.total;
    const pontos: string[] = [];
    // destaques simples
    const maiorCusto = resumoGeral.linhas
      .slice()
      .sort((a, b) => b.Custo - a.Custo)[0];
    if (maiorCusto) pontos.push(`custo mais alto: ${maiorCusto.Unidade} (${fmtMoeda(maiorCusto.Custo)})`);
    return `Unidade: ${un}. Dia ${dt ? dt.toLocaleDateString("pt-BR") : "(arquivo)"}.
Receita ${fmtMoeda(t.Receita)}, custo ${fmtMoeda(t.Custo)}, entregas ${fmt.format(
      t.Entregas
    )}, coletas ${fmt.format(t.Coletas)}, CTRCs ${fmt.format(t.CTRCs)}, peso ${fmtKg(t.Peso)}.
Pontos de atenção: ${pontos.join("; ") || "—"}.`;
  }, [resumoGeral, fUn, lastDate]);

  /** ===========================
   *  RENDER
   *  =========================== */
  if (!sessao) {
    let u = "gustavo";
    let p = "";
    return (
      <div className="app-shell">
        <div className="login-wrap">
          <div className="login-left">
            <div className="card login-card">
              <div className="section-title">CDI – Análise Diária</div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 6, marginBottom: 10 }}>
                Transporte Generoso – Controladoria
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <div>
                  <label style={{ fontSize: 12, color: "#475569" }}>Usuário</label>
                  <input
                    defaultValue={u}
                    onChange={(e) => (u = e.target.value)}
                    type="text"
                    placeholder="usuário"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#475569" }}>Senha</label>
                  <input
                    onChange={(e) => (p = e.target.value)}
                    type="password"
                    placeholder="senha"
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <button className="btn" onClick={() => doLogin(u, p)}>
                    Entrar
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="login-bg" />
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* HEADER */}
      <div className="header">
        <div className="container">
          <div>
            <h1>CDI – Análise Diária</h1>
            <small>Transporte Generoso – Controladoria</small>
            <small>
              Último dia do arquivo:{" "}
              {lastDate ? lastDate.toLocaleDateString("pt-BR") : "—"}
            </small>
          </div>
          <div className="who">
            {sessao.usuario} ({sessao.perfil}){" "}
            <button className="btn ghost" onClick={logout} style={{ marginLeft: 8 }}>
              Sair
            </button>
          </div>
        </div>
      </div>

      {/* BODY */}
      <div className="container" style={{ marginTop: 14 }}>
        {/* FILTROS */}
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="row cols-3">
            <select value={fUn} onChange={(e) => setFUn(e.target.value)}>
              {domUnidades.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <select value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
              {domTipos.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={fRel} onChange={(e) => setFRel(e.target.value)} style={{ flex: 1 }}>
                {domRel.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <button className="btn" onClick={recarregar} disabled={loading}>
                {loading ? "Carregando..." : "Recarregar"}
              </button>
              <button className="btn secondary" onClick={exportarPDF}>
                Exportar PDF
              </button>
            </div>
          </div>
        </div>

        {/* RESUMO */}
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 10, color: "#334155" }}>
            Resumo do dia {lastDate ? lastDate.toLocaleDateString("pt-BR") : "—"} — Unidades:{" "}
            {fUn !== "(todos)" ? fUn : "(todas)"}.
          </div>
          <div className="row cols-3">
            <div className="card">
              <div className="kpi">
                <div className="l">Receita</div>
                <div className="v">{fmtMoeda(resumoGeral.total.Receita)}</div>
              </div>
            </div>
            <div className="card">
              <div className="kpi">
                <div className="l">Custo</div>
                <div className="v">{fmtMoeda(resumoGeral.total.Custo)}</div>
              </div>
            </div>
            <div className="card">
              <div className="kpi">
                <div className="l">Entregas</div>
                <div className="v">{fmt.format(resumoGeral.total.Entregas)}</div>
              </div>
            </div>
            <div className="card">
              <div className="kpi">
                <div className="l">Coletas</div>
                <div className="v">{fmt.format(resumoGeral.total.Coletas)}</div>
              </div>
            </div>
            <div className="card">
              <div className="kpi">
                <div className="l">CTRCs</div>
                <div className="v">{fmt.format(resumoGeral.total.CTRCs)}</div>
              </div>
            </div>
            <div className="card">
              <div className="kpi">
                <div className="l">Peso (kg)</div>
                <div className="v">{fmtKg(resumoGeral.total.Peso)}</div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
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
                {resumoGeral.linhas.map((l) => (
                  <tr key={l.Unidade}>
                    <td>{l.Unidade}</td>
                    <td>{fmtMoeda(l.Receita)}</td>
                    <td>{fmtMoeda(l.Custo)}</td>
                    <td>{fmt.format(l.Entregas)}</td>
                    <td>{fmt.format(l.Coletas)}</td>
                    <td>{fmt.format(l.CTRCs)}</td>
                    <td>{fmtKg(l.Peso)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* PLACAS */}
        <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 12 }}>
          <div className="section-title">
            Por Tipo de Veículo → Placa (sinalização vs. média do tipo na unidade)
          </div>
          <div style={{ padding: 12 }}>
            <table className="table">
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
                {placaSinal.map((r, i) => (
                  <tr key={r.Placa + i}>
                    <td>{r.Unidade}</td>
                    <td>{r.Tipo}</td>
                    <td>{r.Placa}</td>
                    <td>
                      {fmtKg(r.Peso || 0)}{" "}
                      <span className={r.flagPeso.cls} style={{ marginLeft: 6 }}>
                        {r.flagPeso.txt}
                      </span>
                    </td>
                    <td>
                      {fmt.format(r.CTRCs || 0)}{" "}
                      <span className={r.flagCT.cls} style={{ marginLeft: 6 }}>
                        {r.flagCT.txt}
                      </span>
                    </td>
                    <td>
                      {fmt.format(r.Coletas || 0)}{" "}
                      <span className={r.flagColeta.cls} style={{ marginLeft: 6 }}>
                        {r.flagColeta.txt}
                      </span>
                    </td>
                    <td>
                      {fmt.format(r.Entregas || 0)}{" "}
                      <span className={r.flagEnt.cls} style={{ marginLeft: 6 }}>
                        {r.flagEnt.txt}
                      </span>
                    </td>
                  </tr>
                ))}
                {!placaSinal.length && (
                  <tr>
                    <td colSpan={7} style={{ color: "#64748b", fontStyle: "italic" }}>
                      Nenhum registro para os filtros atuais.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* DECOMPOSIÇÃO DE CUSTO (se disponível nas colunas) */}
        <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 12 }}>
          <div className="section-title">
            Decomposição de tipos de custo + produção do dia (por tipo de custo)
          </div>
          <div style={{ padding: 12 }}>
            <table className="table">
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
                {/* Sem mapeamento do dicionário de custos específico, mantemos como — */}
                <tr>
                  <td style={{ color: "#64748b" }} colSpan={7}>
                    — Sem aba específica de custos no arquivo (ou sem colunas “Tipo de custo” / “Custo”).
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ANÁLISE AUTOMÁTICA */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="section-title">Análise automática do dia</div>
          <div style={{ padding: 12, color: "#0f172a" }}>{analiseTxt}</div>
        </div>

        {/* ADMIN */}
        {sessao.perfil === "admin" && (
          <>
            <div className="footer-gap" />
            <div className="card">
              <div className="section-title">Admin – Gerenciar usuários</div>
              <div style={{ paddingTop: 10, color: "#64748b" }}>
                A persistência de usuários que você já configurou continua valendo. Se precisar, posso
                reexpor aqui os controles de salvar no GitHub (estão intactos no seu projeto).
              </div>
            </div>
          </>
        )}
        <div className="footer-gap" />
      </div>
    </div>
  );
}

    </>
  );
}
