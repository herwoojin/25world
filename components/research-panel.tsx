"use client";

// 헤르메스 연구소 — 히어로 아래 "연구하기".
// 질문을 Firestore researchJobs 에 넣으면 맥북의 헤르메스 에이전트(tg-post-saver research/worker.js)가
// 사이트들의 특성 카드를 근거로 연구해 같은 문서에 결과를 쓴다. 화면은 문서를 실시간 구독해
// 에이전트들이 차례로 일하는 모습을 그린다 — 연출이 아니라 실제 진행 상태다.
// 연구가 끝나면 NotebookLM 노트북·슬라이드까지 만들어 이 안에서 슬라이드쇼로 보여준다.
// 주인장(또는 관리자 등급)에게만 보인다. Firestore 규칙도 같은 기준으로 막는다.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { ChevronDown, FlaskConical, History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFirebaseApp } from "@/lib/firebase";
import { OWNER_EMAIL, useMyProfile } from "@/lib/membership";
import { useSites } from "@/lib/use-sites";
import { CATEGORIES } from "@/lib/sites";
import { formatKST } from "@/lib/posts";

type StepStatus = "pending" | "running" | "done" | "error";

interface Job {
  id: string;
  question: string;
  status: "queued" | "running" | "done" | "error";
  steps?: Record<string, { status: StepStatus; ms?: number; note?: string }>;
  intent?: string;
  selected?: { id: string; name: string; cat: string; reason: string }[];
  report?: string;
  error?: string;
  notebookUrl?: string;
  /** 슬라이드 PDF — Firestore researchFiles 에 조각으로 저장 (이 프로젝트엔 Storage 가 없다) */
  slidesPdf?: { fileId: string; parts: number; bytes: number };
  nlmError?: string;
  createdAt?: string;
  startedAt?: string;
  endedAt?: string;
}

const AGENTS = [
  { id: "catalog", emoji: "🗂️", name: "카드 준비", role: "사이트 특성 카드" },
  { id: "select", emoji: "🔍", name: "사서", role: "관련 사이트 고르기" },
  { id: "research", emoji: "🔬", name: "연구원", role: "헤르메스 보고서" },
  { id: "notebook", emoji: "📓", name: "노트북", role: "NotebookLM 전송" },
  { id: "slides", emoji: "🎞️", name: "디자이너", role: "슬라이드 생성" },
] as const;

const MAC_FRESH_MS = 90_000;

/** researchFiles 조각들을 이어 붙여 PDF Blob 주소로 */
async function loadPdfUrl(f: NonNullable<Job["slidesPdf"]>): Promise<string> {
  const parts = await Promise.all(
    Array.from({ length: f.parts }, (_, n) => getDoc(doc(db(), "researchFiles", `${f.fileId}__p${n}`)))
  );
  const chunks = parts.map((p) => {
    const data = p.get("data");
    if (!data) throw new Error("슬라이드 조각이 빠졌어요.");
    // 원본 바이트를 그대로 담아야 PDF 가 깨지지 않는다 (공유 버퍼 대신 새 배열)
    return new Uint8Array(data.toUint8Array());
  });
  return URL.createObjectURL(new Blob(chunks, { type: "application/pdf" }));
}

async function deleteFile(f: NonNullable<Job["slidesPdf"]>) {
  await Promise.all(
    Array.from({ length: f.parts }, (_, n) => deleteDoc(doc(db(), "researchFiles", `${f.fileId}__p${n}`)))
  );
  await deleteDoc(doc(db(), "researchFiles", f.fileId));
}
const db = () => getFirestore(getFirebaseApp());
const catEmoji = (cat: string) => CATEGORIES.find((c) => c.id === cat)?.emoji ?? "🌐";
const secs = (ms?: number) => (ms != null ? `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}초` : "");

function agentState(job: Job | null, id: string): StepStatus {
  return job?.steps?.[id]?.status ?? "pending";
}

// ── 보고서 (마크다운 일부만: ## 제목, 목록, **굵게**, [사이트id] 인용) ──────────
function Inline({ text, siteUrl }: { text: string; siteUrl: Map<string, string> }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|\[[\w-]+\])/g).map((part, i) => {
        if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
        const m = part.match(/^\[([\w-]+)\]$/);
        if (m && siteUrl.has(m[1])) {
          return (
            <a
              key={i}
              href={siteUrl.get(m[1])}
              target="_blank"
              rel="noopener noreferrer"
              className="mx-0.5 rounded bg-violet-400/15 px-1 text-[11px] font-semibold text-violet-600 hover:underline dark:text-violet-300"
            >
              {m[1]}
            </a>
          );
        }
        return part;
      })}
    </>
  );
}

function Report({ text, siteUrl }: { text: string; siteUrl: Map<string, string> }) {
  const blocks: JSX.Element[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={blocks.length} className="my-2 list-disc space-y-1 pl-5">
        {list.map((li, i) => (
          <li key={i}>
            <Inline text={li} siteUrl={siteUrl} />
          </li>
        ))}
      </ul>
    );
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const h = line.match(/^#{1,4}\s+(.*)/);
    const li = line.match(/^(?:[-*]|\d+\.)\s+(.*)/);
    if (li) {
      list.push(li[1]);
      continue;
    }
    flush();
    if (h) {
      blocks.push(
        <h3 key={blocks.length} className="mt-4 text-sm font-bold text-foreground first:mt-0">
          {h[1]}
        </h3>
      );
    } else if (line) {
      blocks.push(
        <p key={blocks.length} className="my-1.5">
          <Inline text={line} siteUrl={siteUrl} />
        </p>
      );
    }
  }
  flush();
  return <div className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{blocks}</div>;
}

// ── 에이전트 작업대 — 단계마다 캐릭터가 일하는 모습 ──────────────────────
function AgentStation({
  emoji,
  name,
  role,
  state,
  note,
}: {
  emoji: string;
  name: string;
  role: string;
  state: StepStatus;
  note?: string;
}) {
  const ring =
    state === "running"
      ? "ring-2 ring-violet-400 shadow-[0_0_24px_rgba(167,139,250,0.55)]"
      : state === "done"
        ? "ring-2 ring-emerald-400"
        : state === "error"
          ? "ring-2 ring-red-400"
          : "ring-1 ring-zinc-300 dark:ring-zinc-700";
  return (
    <div className="flex w-20 shrink-0 flex-col items-center text-center">
      <div
        className={`relative flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl transition-all dark:bg-zinc-900 ${ring} ${
          state === "running" ? "agent-working" : state === "pending" ? "grayscale" : ""
        }`}
      >
        {emoji}
        {state === "done" && (
          <span className="absolute -right-1 -top-1 rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
            ✓
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs font-bold text-foreground">{name}</p>
      <p className="text-[10px] leading-tight text-zinc-500 dark:text-zinc-400">
        {state === "running" ? "작업 중…" : state === "error" ? "실패" : role}
      </p>
      {note && (
        <p className="mt-0.5 text-[10px] leading-tight text-violet-600 dark:text-violet-300">{note}</p>
      )}
    </div>
  );
}

function Beam({ on, flowing }: { on: boolean; flowing: boolean }) {
  return (
    <div className="mt-6 h-0.5 min-w-4 flex-1 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
      <div className={`h-full ${flowing ? "agent-beam" : on ? "bg-emerald-400" : ""}`} />
    </div>
  );
}

export default function ResearchPanel() {
  const profile = useMyProfile();
  const { sites } = useSites();
  const isAdmin =
    !!profile && (profile.email.toLowerCase() === OWNER_EMAIL || profile.group === "admin");

  const [question, setQuestion] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [submitErr, setSubmitErr] = useState("");
  const [macAt, setMacAt] = useState<number>(0);
  const [now, setNow] = useState(() => Date.now());
  const [history, setHistory] = useState<Job[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfErr, setPdfErr] = useState("");

  const siteUrl = useMemo(() => new Map(sites.map((s) => [s.id, s.url])), [sites]);
  const busy = job?.status === "queued" || job?.status === "running";
  const macAlive = now - macAt < MAC_FRESH_MS;

  // 맥북 하트비트 — 연구는 맥북의 헤르메스가 하므로 켜져 있어야 한다
  useEffect(() => {
    if (!isAdmin) return;
    return onSnapshot(
      doc(db(), "runtime", "mac"),
      (s) => setMacAt(new Date(String(s.get("at") || 0)).getTime() || 0),
      () => {}
    );
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const t = setInterval(() => setNow(Date.now()), busy ? 1000 : 15_000);
    return () => clearInterval(t);
  }, [isAdmin, busy]);

  // 진행 중인 작업 실시간 구독
  useEffect(() => {
    if (!jobId) return;
    return onSnapshot(
      doc(db(), "researchJobs", jobId),
      (s) => s.exists() && setJob({ id: s.id, ...(s.data() as Omit<Job, "id">) }),
      () => {}
    );
  }, [jobId]);

  // 슬라이드가 완성되면 조각을 받아 바로 슬라이드쇼로 연다
  const pdfKey = job?.slidesPdf?.fileId;
  useEffect(() => {
    if (!job?.slidesPdf) {
      setPdfUrl(null);
      return;
    }
    let url: string | null = null;
    let alive = true;
    setPdfErr("");
    loadPdfUrl(job.slidesPdf)
      .then((u) => {
        url = u;
        if (alive) setPdfUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch((e) => alive && setPdfErr(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [pdfKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadHistory = useCallback(async () => {
    if (!profile?.uid) return;
    try {
      const snap = await getDocs(
        query(collection(db(), "researchJobs"), where("uid", "==", profile.uid), limit(50))
      );
      setHistory(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Job, "id">) }))
          .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      );
    } catch {
      setHistory([]);
    }
  }, [profile?.uid]);

  useEffect(() => {
    if (isAdmin) loadHistory();
  }, [isAdmin, loadHistory]);

  useEffect(() => {
    if (job?.status === "done" || job?.status === "error") loadHistory();
  }, [job?.status, loadHistory]);

  if (!isAdmin) return null;

  const submit = async () => {
    const q = question.trim();
    if (!q || busy || !profile) return;
    setSubmitErr("");
    try {
      const ref = await addDoc(collection(db(), "researchJobs"), {
        uid: profile.uid,
        question: q,
        sites: sites.map(({ id, cat, name, desc, url }) => ({ id, cat, name, desc, url })),
        status: "queued",
        createdAt: new Date().toISOString(),
      });
      setJob(null);
      setJobId(ref.id);
    } catch (e) {
      setSubmitErr(`등록하지 못했어요: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const remove = async (j: Job) => {
    if (!window.confirm("이 연구 기록을 삭제할까요?")) return;
    if (j.slidesPdf) await deleteFile(j.slidesPdf).catch(() => {});
    await deleteDoc(doc(db(), "researchJobs", j.id)).catch(() => {});
    if (jobId === j.id) {
      setJobId(null);
      setJob(null);
    }
    loadHistory();
  };

  const elapsed =
    job?.startedAt && busy ? Math.round((now - new Date(job.startedAt).getTime()) / 1000) : null;

  return (
    <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-violet-400/30 bg-white/70 p-4 text-left shadow-sm backdrop-blur dark:bg-zinc-900/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-violet-600 dark:text-violet-300">
          <FlaskConical className="h-4 w-4" aria-hidden="true" />
          헤르메스 연구소
          <span className="rounded-full bg-violet-400/15 px-2 py-0.5 text-[10px] font-semibold">주인장 전용</span>
        </p>
        <span className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span className={`h-2 w-2 rounded-full ${macAlive ? "bg-emerald-500" : "bg-zinc-400"}`} />
          {macAlive ? "맥북 연결됨" : "맥북 꺼짐 — 켜지면 자동으로 시작해요"}
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        내가 만든 사이트 {sites.length}개의 코드·문서를 근거로 헤르메스 에이전트가 연구해 보고서를 써요.
      </p>

      <form
        className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
          disabled={busy}
          placeholder="예) 편의점 사이트들의 데이터를 연결하면 어떤 SaaS를 만들 수 있을까?"
          className="w-full rounded-md border border-zinc-300 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-zinc-700"
        />
        <Button type="submit" disabled={busy || !question.trim()} className="gap-1.5">
          <FlaskConical className="h-4 w-4" aria-hidden="true" />
          {busy ? "연구 중…" : "연구하기"}
        </Button>
      </form>
      {submitErr && <p className="mt-2 text-xs text-red-500">{submitErr}</p>}

      {job && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className="truncate font-semibold text-foreground">Q. {job.question}</span>
            <span className="shrink-0 pl-2">
              {job.status === "queued" && (macAlive ? "맥북이 작업을 받는 중…" : "맥북을 기다리는 중")}
              {elapsed != null && job.status === "running" && `${elapsed}초 경과`}
              {job.status === "done" && job.endedAt && job.startedAt &&
                `완료 · ${secs(new Date(job.endedAt).getTime() - new Date(job.startedAt).getTime())}`}
            </span>
          </div>

          {/* 에이전트 작업대 — 실제 진행 상태 그대로 */}
          <div className="mt-3 overflow-x-auto pb-1">
            <div className="flex min-w-[520px] items-start gap-1">
              {AGENTS.map((a, i) => {
                const st = agentState(job, a.id);
                const step = job.steps?.[a.id];
                const next = AGENTS[i + 1];
                const nextSt = next ? agentState(job, next.id) : null;
                return (
                  <div key={a.id} className="flex flex-1 items-start">
                    <AgentStation
                      emoji={a.emoji}
                      name={a.name}
                      role={a.role}
                      state={st}
                      note={step?.status === "done" ? step.note || secs(step.ms) : undefined}
                    />
                    {next && <Beam on={st === "done" && nextSt !== "pending"} flowing={nextSt === "running"} />}
                  </div>
                );
              })}
            </div>
          </div>

          {job.intent && (
            <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
              🔍 사서가 본 질문의 의도: <span className="font-medium text-foreground">{job.intent}</span>
            </p>
          )}
          {!!job.selected?.length && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {job.selected.map((s, i) => (
                <a
                  key={s.id}
                  href={siteUrl.get(s.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={s.reason}
                  style={{ animationDelay: `${i * 120}ms` }}
                  className="agent-pop rounded-full border border-violet-400/40 bg-violet-400/10 px-2.5 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-400/20 dark:text-violet-200"
                >
                  {catEmoji(s.cat)} {s.name}
                </a>
              ))}
            </div>
          )}

          {job.status === "error" && (
            <p role="status" className="mt-3 text-xs text-red-500">
              연구하지 못했어요: {job.error}
            </p>
          )}
          {/* 🎞️ 슬라이드쇼 — 완성되면 바로 여기서 재생 */}
          {job.slidesPdf && (
            <div className="agent-pop mt-4 overflow-hidden rounded-xl border border-violet-400/40 bg-zinc-900">
              {pdfUrl ? (
                <iframe src={`${pdfUrl}#view=FitH`} title="연구 결과 슬라이드" className="aspect-video w-full bg-white" />
              ) : (
                <p className="flex aspect-video items-center justify-center text-xs text-zinc-300">
                  {pdfErr || `슬라이드를 불러오는 중… (${(job.slidesPdf.bytes / 1048576).toFixed(1)}MB)`}
                </p>
              )}
            </div>
          )}
          {(job.notebookUrl || pdfUrl) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {pdfUrl && (
                <>
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700"
                  >
                    🎞️ 슬라이드 크게 보기
                  </a>
                  <a
                    href={pdfUrl}
                    download={`연구-슬라이드-${(job.createdAt || "").slice(0, 10)}.pdf`}
                    className="rounded-lg bg-zinc-700 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-600"
                  >
                    PDF 받기
                  </a>
                </>
              )}
              {job.notebookUrl && (
                <a
                  href={job.notebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  📓 NotebookLM에서 열기 (PPTX 내보내기)
                </a>
              )}
            </div>
          )}
          {job.nlmError && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              보고서는 완성됐지만 NotebookLM 단계에서 멈췄어요: {job.nlmError}
            </p>
          )}

          {job.report && (
            <div className="mt-4 rounded-xl border border-zinc-200 bg-white/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
              <Report text={job.report} siteUrl={siteUrl} />
            </div>
          )}
        </div>
      )}

      {/* 내 연구 기록 — 본인 것만 (Firestore 규칙) */}
      <div className="mt-4 border-t border-violet-400/20 pt-3">
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          aria-expanded={showHistory}
          className="flex w-full items-center gap-1.5 text-left text-xs font-bold text-zinc-700 dark:text-zinc-300"
        >
          <History className="h-3.5 w-3.5" aria-hidden="true" />
          내 연구 기록{history ? ` (${history.length})` : ""}
          <ChevronDown
            className={`ml-auto h-3.5 w-3.5 transition-transform ${showHistory ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
        {showHistory && (
          <ul className="mt-2 max-h-64 divide-y divide-zinc-200 overflow-y-auto rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {!history?.length && <li className="px-3 py-2 text-xs text-zinc-400">아직 연구 기록이 없어요.</li>}
            {history?.map((h) => (
              <li key={h.id} className={`flex items-center gap-2 px-3 py-2 ${jobId === h.id ? "bg-violet-400/10" : ""}`}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setJob(h);
                    setJobId(h.id);
                  }}
                  className="min-w-0 flex-1 text-left disabled:opacity-60"
                >
                  <p className="truncate text-xs font-medium text-foreground hover:underline">{h.question}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-400">
                    {h.createdAt ? formatKST(h.createdAt) : ""} ·{" "}
                    {h.status === "done"
                      ? `사이트 ${h.selected?.length ?? 0}개 근거${h.slidesPdf ? " · 🎞️ 슬라이드" : ""}`
                      : h.status === "error"
                        ? "실패"
                        : "진행 중"}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => remove(h)}
                  aria-label="이 연구 기록 삭제"
                  className="shrink-0 rounded p-1 text-zinc-400 transition-colors hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
