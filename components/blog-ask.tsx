"use client";

// 듀얼 브레인 — 저장된 블로그 글(내 지식베이스)에 질문하고, 우리 서버(tg-post-saver
// /api/kb/ask)가 Claude 로 답한다. 서버가 단계별 진행을 NDJSON 으로 흘려보내면
// 질문 → 분석 → 검색 → 후보 글 → 관련성 판정 → (지식베이스 답변 | LLM 단독 답변)
// → 최종 답변 순서의 task graph 로 실시간 표시한다.
// 관련 글이 없으면 "지식베이스에 없음"을 알리고 LLM 일반 지식으로만 답한다.
// 유료회원 이상 전용. 끝난 질문·답변은 서버가 users/{uid}/kbChats 에 저장하고,
// 규칙상 본인만 읽고 지울 수 있다 — 기록을 누르면 그래프·답변을 그대로 다시 보여준다.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import {
  BrainCircuit,
  ChevronDown,
  CircleStop,
  ExternalLink,
  FileText,
  History,
  Link2,
  Lock,
  NotebookPen,
  Send,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BOT_SERVER_URL, getFirebaseApp, getFirebaseAuth } from "@/lib/firebase";
import { OWNER_EMAIL, useEffectiveGroup, useMyProfile } from "@/lib/membership";
import { formatKST } from "@/lib/posts";
import {
  NLM_SEPARATOR,
  NLM_URL,
  copyToClipboard,
  nlmCrawlUrl,
  postSourceBlock,
} from "@/components/notebooklm/nlm-copy";

type StepId = "analyze" | "search" | "judge" | "answer";
type StepStatus = "pending" | "running" | "done" | "skipped" | "error";
const STEP_IDS: StepId[] = ["analyze", "search", "judge", "answer"];

interface Candidate {
  id: string;
  title: string;
  score: number;
  snippet: string;
}
interface Judgment {
  id: string;
  relevant: boolean;
  reason: string;
}
interface Source {
  n: number;
  id: string;
  title: string;
}

interface Run {
  question: string;
  startedAt: number;
  endedAt?: number;
  connecting: boolean;
  steps: Record<StepId, { status: StepStatus; ms?: number; note?: string }>;
  intent?: string;
  keywords?: string[];
  posts?: number;
  chunks?: number;
  candidates?: Candidate[];
  judgments?: Judgment[];
  mode?: "kb" | "llm";
  sources?: Source[];
  model?: string;
  answer: string;
  done: boolean;
  error?: string;
  /** 내 질문 기록 문서 id · 저장 시각 (저장 후 또는 기록에서 연 경우) */
  savedId?: string;
  savedAt?: string;
  saveFailed?: boolean;
  fromHistory?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KbEvent = any;

/** 저장된 기록 문서 → 화면 상태 (그래프·로그·답변을 그대로 다시 그린다) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromDoc(id: string, d: Record<string, any>): Run {
  const steps = Object.fromEntries(
    STEP_IDS.map((k) => [
      k,
      { status: d.steps?.[k]?.status ?? "done", ms: d.steps?.[k]?.ms ?? undefined },
    ]),
  ) as Run["steps"];
  return {
    question: String(d.question ?? ""),
    startedAt: Number(d.startedAt) || 0,
    endedAt: Number(d.endedAt) || undefined,
    connecting: false,
    steps,
    intent: d.intent ?? undefined,
    keywords: d.keywords ?? undefined,
    posts: d.posts ?? undefined,
    chunks: d.chunks ?? undefined,
    candidates: d.candidates ?? undefined,
    judgments: d.judgments ?? undefined,
    mode: d.mode,
    sources: d.sources ?? [],
    model: d.model ?? undefined,
    answer: String(d.answer ?? ""),
    done: true,
    savedId: id,
    savedAt: String(d.createdAt ?? ""),
    fromHistory: true,
  };
}

const chatsRef = (uid: string) =>
  collection(getFirestore(getFirebaseApp()), "users", uid, "kbChats");

const postHref = (id: string) => `/post?id=${encodeURIComponent(id)}`;
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function newRun(question: string): Run {
  return {
    question,
    startedAt: Date.now(),
    connecting: true,
    steps: {
      analyze: { status: "pending" },
      search: { status: "pending" },
      judge: { status: "pending" },
      answer: { status: "pending" },
    },
    answer: "",
    done: false,
  };
}

function fail(r: Run, message: string): Run {
  const steps = { ...r.steps };
  for (const k of STEP_IDS) {
    if (steps[k].status === "running") steps[k] = { ...steps[k], status: "error" };
  }
  return { ...r, connecting: false, steps, error: message, endedAt: Date.now() };
}

function applyEvent(r: Run, ev: KbEvent): Run {
  const n: Run = { ...r, connecting: false };
  if (ev.type === "step") {
    const id = ev.id as StepId;
    const d = ev.data || {};
    n.steps = { ...r.steps, [id]: { status: ev.status, ms: ev.ms, note: d.note } };
    if (id === "analyze" && ev.status === "done") {
      n.intent = d.intent;
      n.keywords = d.keywords;
    }
    if (id === "search" && ev.status === "done") {
      n.posts = d.posts;
      n.chunks = d.chunks;
      n.candidates = d.candidates;
    }
    if (id === "judge" && d.judgments) n.judgments = d.judgments;
    if (id === "answer" && d.mode) {
      n.mode = d.mode;
      n.sources = d.sources;
      n.model = d.model;
    }
  } else if (ev.type === "delta") {
    n.answer = r.answer + ev.text;
  } else if (ev.type === "done") {
    n.done = true;
    n.endedAt = Date.now();
    n.mode = ev.mode;
    n.sources = ev.sources;
    n.model = ev.model;
  } else if (ev.type === "saved") {
    n.savedId = ev.id;
    n.savedAt = ev.createdAt;
  } else if (ev.type === "saveFailed") {
    n.saveFailed = true;
  } else if (ev.type === "error") {
    return fail(n, ev.message || "답변을 만들지 못했어요.");
  }
  return n;
}

// ── Task graph (SVG) ──────────────────────────────────────
type NodeState = "pending" | "running" | "done" | "ok" | "off" | "error";
type EdgeState = "idle" | "flow" | "on" | "ok" | "off";

const NODE_CLS: Record<NodeState, { box: string; g?: string; dash?: string }> = {
  pending: {
    box: "fill-white/70 stroke-zinc-300 dark:fill-zinc-900/70 dark:stroke-zinc-700",
    dash: "4 3",
  },
  running: { box: "fill-violet-50 stroke-violet-500 dark:fill-violet-950/60", g: "animate-pulse" },
  done: { box: "fill-white stroke-violet-400 dark:fill-zinc-900" },
  ok: { box: "fill-emerald-50 stroke-emerald-500 dark:fill-emerald-950/50" },
  off: {
    box: "fill-white/60 stroke-zinc-300 dark:fill-zinc-900/60 dark:stroke-zinc-700",
    g: "opacity-50",
    dash: "4 3",
  },
  error: { box: "fill-red-50 stroke-red-500 dark:fill-red-950/40" },
};

const EDGE_CLS: Record<EdgeState, string> = {
  idle: "stroke-zinc-300 dark:stroke-zinc-700",
  flow: "kb-flow stroke-violet-500",
  on: "stroke-violet-400",
  ok: "stroke-emerald-500",
  off: "stroke-zinc-300/50 dark:stroke-zinc-700/50",
};

const stepNode = (s: StepStatus): NodeState =>
  s === "skipped" ? "off" : s === "error" ? "error" : s;
const stepEdge = (s: StepStatus): EdgeState =>
  s === "running" ? "flow" : s === "done" ? "on" : s === "pending" ? "idle" : "off";

function GNode({
  x,
  y,
  w,
  h,
  state,
  label,
  sub,
  tip,
  href,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  state: NodeState;
  label: string;
  sub?: string;
  tip?: string;
  href?: string;
}) {
  const c = NODE_CLS[state];
  const body = (
    <g className={c.g}>
      {tip && <title>{tip}</title>}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={10}
        strokeWidth={1.5}
        strokeDasharray={c.dash}
        className={c.box}
      />
      <text
        x={x + w / 2}
        y={sub ? y + h / 2 - 3 : y + h / 2 + 4}
        textAnchor="middle"
        className="fill-zinc-800 text-[11.5px] font-bold dark:fill-zinc-100"
      >
        {label}
      </text>
      {sub && (
        <text
          x={x + w / 2}
          y={y + h / 2 + 12}
          textAnchor="middle"
          className="fill-zinc-500 text-[10px] dark:fill-zinc-400"
        >
          {sub}
        </text>
      )}
    </g>
  );
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="cursor-pointer">
      {body}
    </a>
  ) : (
    body
  );
}

function GEdge({
  from,
  to,
  state,
}: {
  from: [number, number];
  to: [number, number];
  state: EdgeState;
}) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const mx = (x1 + x2) / 2;
  return (
    <path
      d={`M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
      fill="none"
      strokeWidth={state === "ok" ? 2.5 : state === "idle" || state === "off" ? 1.5 : 2}
      strokeDasharray={state === "idle" || state === "off" ? "3 4" : undefined}
      className={EDGE_CLS[state]}
    />
  );
}

// 열 좌표 [x, 폭] — viewBox 가로 1000 기준
const COL = {
  q: [8, 90],
  analyze: [126, 104],
  search: [258, 104],
  posts: [392, 190],
  judge: [612, 100],
  answer: [740, 116],
  final: [890, 96],
} as const;
const NODE_H = 54;
const POST_H = 40;
const POST_GAP = 48;

function TaskGraph({ run }: { run: Run }) {
  const { steps, candidates, judgments, mode } = run;
  const verdict = (id: string) => judgments?.find((j) => j.id === id);

  // 후보 글 열 — 검색 전엔 회색 자리표시 3개, 후보가 없으면 "관련 글 없음" 1개
  const slots = candidates ? Math.max(candidates.length, 1) : 3;
  const H = Math.max(190, slots * POST_GAP + 40);
  const cy = H / 2;
  const nodeY = cy - NODE_H / 2;
  const postY = (i: number) => cy - (slots * POST_GAP) / 2 + i * POST_GAP + (POST_GAP - POST_H) / 2;
  const kbY = cy - NODE_H - 6;
  const llmY = cy + 6;

  const right = (c: readonly [number, number], y: number): [number, number] => [c[0] + c[1], y];
  const left = (c: readonly [number, number], y: number): [number, number] => [c[0], y];

  const answerState = (which: "kb" | "llm"): NodeState =>
    mode === which ? stepNode(steps.answer.status) : mode ? "off" : "pending";
  const toAnswerEdge = (which: "kb" | "llm"): EdgeState =>
    mode === which ? stepEdge(steps.answer.status) : mode ? "off" : "idle";
  const toFinalEdge = (which: "kb" | "llm"): EdgeState =>
    mode !== which ? (mode ? "off" : "idle") : run.done ? "on" : run.error ? "off" : "flow";

  const judgeSub =
    steps.judge.status === "skipped"
      ? "후보 없음 · 건너뜀"
      : judgments
        ? `채택 ${judgments.filter((j) => j.relevant).length} / ${judgments.length}`
        : steps.judge.status === "running"
          ? "판정 중…"
          : "대기";

  const postRows: {
    key: string;
    label: string;
    sub: string;
    state: NodeState;
    inEdge: EdgeState;
    outEdge: EdgeState;
    tip?: string;
    href?: string;
  }[] = !candidates
    ? [0, 1, 2].map((i) => ({
        key: `ghost${i}`,
        label: "후보 글",
        sub: steps.search.status === "running" ? "찾는 중…" : "대기",
        state: steps.search.status === "running" ? "running" : "pending",
        inEdge: steps.search.status === "running" ? "flow" : "idle",
        outEdge: "idle",
      }))
    : candidates.length === 0
      ? [
          {
            key: "none",
            label: "관련 글 없음",
            sub: "겹치는 글이 없어요",
            state: "off",
            inEdge: "off",
            outEdge: "off",
          },
        ]
      : candidates.map((c) => {
          const v = verdict(c.id);
          return {
            key: c.id,
            label: cut(c.title, 14),
            sub: v ? `${v.relevant ? "✓ 채택" : "✗ 제외"} · 점수 ${c.score}` : `점수 ${c.score}`,
            state: v ? (v.relevant ? "ok" : "off") : "done",
            inEdge: v ? (v.relevant ? "ok" : "off") : "on",
            outEdge: v
              ? v.relevant
                ? "ok"
                : "off"
              : steps.judge.status === "running"
                ? "flow"
                : "idle",
            tip: `${c.title}\n\n${c.snippet}${v?.reason ? `\n\n판정: ${v.reason}` : ""}\n\n(클릭하면 새 창에서 열려요)`,
            href: postHref(c.id),
          };
        });

  const totalSec = run.endedAt ? ((run.endedAt - run.startedAt) / 1000).toFixed(1) : null;

  return (
    <svg
      viewBox={`0 0 1000 ${H}`}
      className="block w-full min-w-[720px]"
      role="img"
      aria-label="답변이 만들어지는 과정을 보여주는 그래프"
    >
      {/* 간선 */}
      <GEdge
        from={right(COL.q, cy)}
        to={left(COL.analyze, cy)}
        state={run.connecting ? "flow" : stepEdge(steps.analyze.status)}
      />
      <GEdge
        from={right(COL.analyze, cy)}
        to={left(COL.search, cy)}
        state={stepEdge(steps.search.status)}
      />
      {postRows.map((p, i) => (
        <g key={`e-${p.key}`}>
          <GEdge
            from={right(COL.search, cy)}
            to={left(COL.posts, postY(i) + POST_H / 2)}
            state={p.inEdge}
          />
          <GEdge
            from={right(COL.posts, postY(i) + POST_H / 2)}
            to={left(COL.judge, cy)}
            state={p.outEdge}
          />
        </g>
      ))}
      <GEdge
        from={right(COL.judge, cy)}
        to={left(COL.answer, kbY + NODE_H / 2)}
        state={toAnswerEdge("kb")}
      />
      <GEdge
        from={right(COL.judge, cy)}
        to={left(COL.answer, llmY + NODE_H / 2)}
        state={toAnswerEdge("llm")}
      />
      <GEdge
        from={right(COL.answer, kbY + NODE_H / 2)}
        to={left(COL.final, cy)}
        state={toFinalEdge("kb")}
      />
      <GEdge
        from={right(COL.answer, llmY + NODE_H / 2)}
        to={left(COL.final, cy)}
        state={toFinalEdge("llm")}
      />

      {/* 노드 */}
      <GNode
        x={COL.q[0]}
        y={nodeY}
        w={COL.q[1]}
        h={NODE_H}
        state={run.connecting ? "running" : "done"}
        label="❓ 질문"
        sub={run.connecting ? "서버 연결 중…" : cut(run.question, 8)}
        tip={run.question}
      />
      <GNode
        x={COL.analyze[0]}
        y={nodeY}
        w={COL.analyze[1]}
        h={NODE_H}
        state={stepNode(steps.analyze.status)}
        label="🧠 질문 분석"
        sub={
          run.keywords
            ? `키워드 ${run.keywords.length}개`
            : steps.analyze.status === "running"
              ? "분석 중…"
              : "대기"
        }
        tip={run.keywords?.join(", ")}
      />
      <GNode
        x={COL.search[0]}
        y={nodeY}
        w={COL.search[1]}
        h={NODE_H}
        state={stepNode(steps.search.status)}
        label="📚 지식베이스"
        sub={
          run.posts != null
            ? `글 ${run.posts}개 검색`
            : steps.search.status === "running"
              ? "검색 중…"
              : "대기"
        }
        tip={steps.search.note}
      />
      {postRows.map((p, i) => (
        <GNode
          key={p.key}
          x={COL.posts[0]}
          y={postY(i)}
          w={COL.posts[1]}
          h={POST_H}
          state={p.state}
          label={p.label}
          sub={p.sub}
          tip={p.tip}
          href={p.href}
        />
      ))}
      <GNode
        x={COL.judge[0]}
        y={nodeY}
        w={COL.judge[1]}
        h={NODE_H}
        state={stepNode(steps.judge.status)}
        label="⚖️ 관련성 판정"
        sub={judgeSub}
      />
      <GNode
        x={COL.answer[0]}
        y={kbY}
        w={COL.answer[1]}
        h={NODE_H}
        state={answerState("kb")}
        label="📝 지식베이스 답변"
        sub={mode === "kb" ? `출처 ${run.sources?.length ?? 0}개 인용` : "내 글 근거"}
      />
      <GNode
        x={COL.answer[0]}
        y={llmY}
        w={COL.answer[1]}
        h={NODE_H}
        state={answerState("llm")}
        label="🤖 LLM 단독 답변"
        sub={mode === "llm" ? "지식베이스에 없음" : "일반 지식"}
      />
      <GNode
        x={COL.final[0]}
        y={nodeY}
        w={COL.final[1]}
        h={NODE_H}
        state={run.done ? "ok" : run.error ? "error" : "pending"}
        label="✅ 최종 답변"
        sub={run.done ? `${totalSec}초` : run.error ? "실패" : "대기"}
      />
    </svg>
  );
}

// ── 단계별 상세 기록 ──────────────────────────────────────
const STATUS_TEXT: Record<StepStatus, string> = {
  pending: "대기",
  running: "진행 중",
  done: "완료",
  skipped: "건너뜀",
  error: "실패",
};

function StepLog({ run }: { run: Run }) {
  const { steps } = run;
  const ms = (id: StepId) =>
    steps[id].ms != null ? ` · ${(steps[id].ms! / 1000).toFixed(1)}초` : "";
  const head = (n: number, title: string, id: StepId) => (
    <p className="font-semibold text-foreground">
      {n}. {title}
      <span className="ml-1.5 font-normal text-zinc-400">
        {STATUS_TEXT[steps[id].status]}
        {ms(id)}
      </span>
    </p>
  );

  return (
    <ol className="mt-3 space-y-2.5 text-xs text-zinc-600 dark:text-zinc-400">
      <li>
        {head(1, "질문 분석", "analyze")}
        {run.intent && <p className="mt-0.5">의도: {run.intent}</p>}
        {!!run.keywords?.length && (
          <p className="mt-1 flex flex-wrap gap-1">
            {run.keywords.map((k) => (
              <span
                key={k}
                className="rounded-full bg-violet-400/10 px-2 py-0.5 text-[11px] text-violet-600 dark:text-violet-300"
              >
                {k}
              </span>
            ))}
          </p>
        )}
      </li>
      <li>
        {head(2, "지식베이스 검색", "search")}
        {steps.search.note && steps.search.status === "running" && (
          <p className="mt-0.5">{steps.search.note}</p>
        )}
        {run.candidates && (
          <p className="mt-0.5">
            글 {run.posts?.toLocaleString()}개 · 조각 {run.chunks?.toLocaleString()}개에서 후보{" "}
            {run.candidates.length}개를 찾았어요.
          </p>
        )}
      </li>
      <li>
        {head(3, "관련성 판정", "judge")}
        {steps.judge.status === "skipped" && (
          <p className="mt-0.5">질문과 겹치는 글이 없어 판정을 건너뛰었어요.</p>
        )}
        {run.judgments && run.candidates && (
          <ul className="mt-1 space-y-1">
            {run.candidates.map((c) => {
              const v = run.judgments!.find((j) => j.id === c.id);
              return (
                <li key={c.id} className={v?.relevant ? "" : "opacity-60"}>
                  <span className={v?.relevant ? "text-emerald-500" : "text-zinc-400"}>
                    {v?.relevant ? "✓" : "✗"}
                  </span>{" "}
                  <a
                    href={postHref(c.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-foreground hover:underline"
                  >
                    {c.title}
                  </a>
                  {v?.reason && <span className="text-zinc-400"> — {v.reason}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </li>
      <li>
        {head(4, "답변 생성", "answer")}
        {run.mode && (
          <p className="mt-0.5">
            {run.mode === "kb"
              ? `내 지식베이스 글 ${run.sources?.length ?? 0}개를 근거로 답변`
              : "지식베이스에 관련 글이 없어 LLM 일반 지식만으로 답변"}
            {run.model && <span className="text-zinc-400"> · {run.model}</span>}
          </p>
        )}
      </li>
    </ol>
  );
}

// ── 답변 (출처 번호 → 글 링크) ─────────────────────────────
function AnswerText({ text, sources }: { text: string; sources: Source[] }) {
  return (
    <>
      {text.split(/(\[\d+\]|\(일반 지식\))/g).map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/);
        const s = m && sources.find((x) => x.n === Number(m[1]));
        if (s) {
          return (
            <a
              key={i}
              href={postHref(s.id)}
              target="_blank"
              rel="noopener noreferrer"
              title={s.title}
              className="mx-0.5 align-super text-[10px] font-bold text-sky-600 hover:underline dark:text-sky-400"
            >
              [{s.n}]
            </a>
          );
        }
        if (part === "(일반 지식)") {
          return (
            <span
              key={i}
              className="mx-0.5 rounded bg-amber-400/15 px-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
            >
              일반 지식
            </span>
          );
        }
        return part;
      })}
    </>
  );
}

// ── 참고한 글 → NotebookLM 소스 ──────────────────────────
// 참고한 글 전체 텍스트를 한 번에 복사해 NotebookLM "복사된 텍스트" 소스로 붙여넣게 한다.
// 본문은 패널이 뜰 때 미리 받아 둔다 — 누르는 즉시 복사돼야 브라우저가 클립보드 쓰기를 막지 않는다.
function NotebookLMPanel({ question, sources }: { question: string; sources: Source[] }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const blocksRef = useRef<Promise<string[]> | null>(null);

  useEffect(() => {
    blocksRef.current = Promise.all(
      sources.map((s) =>
        postSourceBlock({
          id: s.id,
          title: `[${s.n}] ${s.title}`,
          url: `${window.location.origin}${postHref(s.id)}`,
        }),
      ),
    );
  }, [sources]);

  const copyText = async () => {
    if (busy || !blocksRef.current) return;
    setBusy(true);
    try {
      const blocks = await blocksRef.current;
      const text = [`[듀얼 브레인 참고 자료] 질문: ${question}`, ...blocks].join(NLM_SEPARATOR);
      const ok = await copyToClipboard(text);
      setMsg(
        ok
          ? {
              ok,
              text: `✓ 글 ${sources.length}개 전체 텍스트를 복사했어요 (${text.length.toLocaleString()}자) — 이제 NotebookLM 에 붙여넣으세요`,
            }
          : { ok, text: "복사에 실패했어요. 한 번 더 눌러 주세요." },
      );
    } finally {
      setBusy(false);
    }
  };

  const copyUrls = async () => {
    const ok = await copyToClipboard(sources.map((s) => nlmCrawlUrl(s.id)).join("\n"));
    setMsg(
      ok
        ? {
            ok,
            text: `✓ 글 ${sources.length}개 주소를 복사했어요 — NotebookLM 소스 추가 → "웹사이트"에 붙여넣으세요`,
          }
        : { ok, text: "복사에 실패했어요. 한 번 더 눌러 주세요." },
    );
  };

  const btn =
    "flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

  return (
    <div className="mt-3 rounded-lg border border-emerald-400/40 bg-emerald-400/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
        <NotebookPen className="h-3.5 w-3.5" aria-hidden="true" />
        참고한 글 {sources.length}개를 NotebookLM 소스로
      </p>
      <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
        글 전체 텍스트를 한 번에 복사해 NotebookLM 에 붙여넣으면, 이 글들로 슬라이드·보고서를 만들
        수 있어요.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyText}
          disabled={busy}
          className={`${btn} bg-emerald-600 hover:bg-emerald-700`}
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
          {busy ? "글 모으는 중…" : "NotebookLM용 텍스트 복사"}
        </button>
        <a
          href={NLM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btn} bg-blue-600 hover:bg-blue-700`}
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          NotebookLM 열기
        </a>
        <button type="button" onClick={copyUrls} className={`${btn} bg-zinc-600 hover:bg-zinc-500`}>
          <Link2 className="h-4 w-4" aria-hidden="true" />
          URL 복사
        </button>
      </div>
      {msg && (
        <p
          role="status"
          className={`mt-2 text-xs font-semibold ${msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}
        >
          {msg.text}
        </p>
      )}
      <ol className="mt-2 space-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
        <li>
          ① <b className="text-foreground">NotebookLM용 텍스트 복사</b> 누르기
        </li>
        <li>
          ② <b className="text-foreground">NotebookLM 열기</b> → 새 노트북 → 소스 추가 →{" "}
          <b className="text-foreground">복사된 텍스트</b>에 붙여넣기
        </li>
        <li>
          ③ 오른쪽 스튜디오에서 <b className="text-foreground">슬라이드</b> 또는{" "}
          <b className="text-foreground">보고서</b> 만들기
        </li>
      </ol>
    </div>
  );
}

export default function BlogAsk() {
  const [question, setQuestion] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const viewRef = useRef<HTMLDivElement | null>(null);

  // 유료회원 이상 전용 — 서버도 같은 기준으로 막는다(/api/kb/ask PAID_ONLY)
  const profile = useMyProfile();
  const group = useEffectiveGroup();
  const allowed =
    group === "paid" ||
    group === "vip" ||
    group === "admin" ||
    profile?.email.toLowerCase() === OWNER_EMAIL;
  const uid = profile?.uid ?? null;

  // 내 질문 기록 (최근 50개)
  const [history, setHistory] = useState<Run[] | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [showHistory, setShowHistory] = useState(true);

  const loadHistory = useCallback(async (u: string) => {
    try {
      const snap = await getDocs(query(chatsRef(u), orderBy("createdAt", "desc"), limit(50)));
      setHistory(snap.docs.map((d) => fromDoc(d.id, d.data())));
      setHistoryError("");
    } catch (e) {
      console.error("[blog-ask] 질문 기록을 불러오지 못했습니다:", e);
      setHistoryError("질문 기록을 불러오지 못했어요.");
    }
  }, []);

  useEffect(() => {
    if (allowed && uid) loadHistory(uid);
  }, [allowed, uid, loadHistory]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const stop = () => abortRef.current?.abort();

  const openChat = (c: Run) => {
    if (busy) return;
    setRun(c);
    requestAnimationFrame(() =>
      viewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  const removeChat = async (c: Run) => {
    if (!uid || !c.savedId || !window.confirm("이 질문 기록을 삭제할까요?")) return;
    try {
      await deleteDoc(doc(chatsRef(uid), c.savedId));
      setHistory((h) => h?.filter((x) => x.savedId !== c.savedId) ?? h);
      setRun((r) => (r?.savedId === c.savedId ? null : r));
    } catch (e) {
      console.error("[blog-ask] 기록 삭제 실패:", e);
      window.alert("삭제하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  };

  const ask = async () => {
    const q = question.trim();
    if (!q || busy) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setRun(newRun(q));
    const update = (f: (r: Run) => Run) => setRun((r) => (r ? f(r) : r));

    try {
      // Render 무료 플랜이 잠들어 있을 수 있어 먼저 깨운다
      await fetch(`${BOT_SERVER_URL}/api/wake`, { signal: ac.signal }).catch(() => {});
      const idToken = await getFirebaseAuth()
        .currentUser?.getIdToken()
        .catch(() => undefined);
      if (!idToken) {
        update((r) => fail(r, "로그인 후 이용해 주세요."));
        return;
      }
      const res = await fetch(`${BOT_SERVER_URL}/api/kb/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, idToken }),
        signal: ac.signal,
      });
      // 거절(로그인·횟수 제한 등)은 일반 JSON, 정상 처리는 NDJSON 스트림
      if (!(res.headers.get("content-type") || "").includes("ndjson") || !res.body) {
        const d = await res.json().catch(() => ({}));
        update((r) => fail(r, d.message || "요청에 실패했어요."));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let saved = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          try {
            const ev = JSON.parse(line);
            if (ev.type === "saved") saved = true;
            update((r) => applyEvent(r, ev));
          } catch {}
        }
      }
      update((r) =>
        r.done || r.error ? r : fail(r, "응답이 중간에 끊겼어요. 다시 시도해 주세요."),
      );
      if (saved && uid) loadHistory(uid);
    } catch {
      update((r) =>
        fail(
          r,
          ac.signal.aborted
            ? "질문을 중지했어요."
            : "연결에 실패했어요. 잠시 후 다시 시도해 주세요.",
        ),
      );
    } finally {
      if (abortRef.current === ac) setBusy(false);
    }
  };

  const streaming = run?.steps.answer.status === "running";

  return (
    <div className="mt-4 rounded-xl border border-sky-400/40 bg-sky-400/5 p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-sky-500">
        <BrainCircuit className="h-4 w-4" aria-hidden="true" />
        듀얼 브레인 — 내 블로그 지식에 물어보기
      </p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        저장된 블로그 글(내 지식베이스)에서 먼저 근거를 찾고, AI가 그 글을 인용해 답해요. 어떤 글을
        참고했는지 과정을 그래프로 보여주고, 지식베이스에 없는 내용이면 그렇다고 알려준 뒤 AI 일반
        지식으로만 답해요.
      </p>

      {!profile ? null : !allowed ? (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-violet-400/30 bg-violet-400/5 px-3 py-2 text-xs font-semibold text-violet-500">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          유료회원 이상 전용 기능이에요 — 유료회원으로 전환하면 질문하고, 내 질문 기록도 모아 볼 수
          있어요.
        </p>
      ) : (
        <>
          <form
            className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
          >
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={500}
              placeholder="예) 클로드 코드를 처음 쓸 때 알아야 할 핵심은?"
              className="w-full rounded-md border border-zinc-300 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-zinc-700"
              disabled={busy}
            />
            {busy ? (
              <Button type="button" variant="outline" onClick={stop} className="gap-1.5">
                <CircleStop className="h-3.5 w-3.5" aria-hidden="true" />
                중지
              </Button>
            ) : (
              <Button type="submit" disabled={!question.trim()} className="gap-1.5">
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                질문하기
              </Button>
            )}
          </form>

          {run && (
            <>
              <div ref={viewRef} className="mt-4 scroll-mt-24">
                {run.savedId && (
                  <p className="mb-2 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                    {run.fromHistory
                      ? `📜 저장된 기록 · ${formatKST(run.savedAt ?? "")}`
                      : "✓ 내 질문 기록에 저장했어요 (나만 볼 수 있어요)"}
                  </p>
                )}
                {run.saveFailed && (
                  <p className="mb-2 text-[11px] text-amber-600 dark:text-amber-400">
                    답변은 완료됐지만 기록 저장에 실패했어요.
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    🧭 처리 과정 (Task Graph)
                  </p>
                  <p className="flex items-center gap-3 text-[11px] text-zinc-400">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-violet-500" /> 진행
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" /> 채택
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-600" />{" "}
                      제외·건너뜀
                    </span>
                  </p>
                </div>
                <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white/50 p-2 dark:border-zinc-800 dark:bg-zinc-950/40">
                  <TaskGraph run={run} />
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">
                  후보 글 노드에 마우스를 올리면 찾은 문장과 판정 이유가, 클릭하면 원문이 열려요.
                </p>
              </div>

              <StepLog run={run} />

              {run.mode && (
                <div
                  className={`mt-4 rounded-lg border px-3 py-2 text-xs font-semibold ${
                    run.mode === "kb"
                      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-600 dark:text-emerald-400"
                      : "border-amber-400/40 bg-amber-400/10 text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {run.mode === "kb"
                    ? `📚 내 지식베이스에서 관련 글 ${run.sources?.length ?? 0}개를 찾아 근거로 답했어요.`
                    : "🔎 내 지식베이스에는 이 질문과 관련된 글이 없어요 — 아래 답변은 AI(LLM)의 일반 지식만으로 작성했어요."}
                </div>
              )}

              {(run.answer || streaming) && (
                <div className="mt-2 whitespace-pre-wrap rounded-lg border border-zinc-200 bg-white/70 p-3 text-sm leading-relaxed text-foreground dark:border-zinc-800 dark:bg-zinc-900/60">
                  <AnswerText text={run.answer} sources={run.sources ?? []} />
                  {streaming && <span className="ml-0.5 animate-pulse text-sky-500">▍</span>}
                </div>
              )}

              {run.mode === "kb" && !!run.sources?.length && (
                <div className="mt-2 text-xs">
                  <p className="font-semibold text-zinc-600 dark:text-zinc-300">참고한 글</p>
                  <ol className="mt-1 space-y-0.5">
                    {run.sources.map((s) => (
                      <li key={s.id}>
                        <span className="font-bold text-sky-600 dark:text-sky-400">[{s.n}]</span>{" "}
                        <a
                          href={postHref(s.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-foreground hover:underline"
                        >
                          {s.title}
                        </a>
                      </li>
                    ))}
                  </ol>
                  {run.done && (
                    <NotebookLMPanel
                      key={run.savedId ?? run.startedAt}
                      question={run.question}
                      sources={run.sources}
                    />
                  )}
                </div>
              )}

              {run.error && (
                <p role="status" className="mt-2 text-xs text-red-500">
                  {run.error}
                </p>
              )}
            </>
          )}

          {/* 내 질문 기록 — users/{uid}/kbChats, 규칙상 본인만 읽고 지운다 */}
          <div className="mt-4 border-t border-sky-400/20 pt-3">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              aria-expanded={showHistory}
              className="flex w-full items-center gap-1.5 text-left text-xs font-bold text-zinc-700 dark:text-zinc-300"
            >
              <History className="h-3.5 w-3.5" aria-hidden="true" />내 질문 기록
              {history ? ` (${history.length})` : ""}
              <span className="ml-1 font-normal text-zinc-400">🔒 나만 볼 수 있어요</span>
              <ChevronDown
                className={`ml-auto h-3.5 w-3.5 transition-transform ${showHistory ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
            {showHistory &&
              (historyError ? (
                <p className="mt-2 text-xs text-red-500">{historyError}</p>
              ) : !history ? (
                <p className="mt-2 text-xs text-zinc-400">불러오는 중…</p>
              ) : history.length === 0 ? (
                <p className="mt-2 text-xs text-zinc-400">
                  아직 저장된 질문이 없어요. 질문하면 답변과 함께 여기에 쌓여요.
                </p>
              ) : (
                <ul className="mt-2 max-h-72 divide-y divide-zinc-200 overflow-y-auto rounded-lg border border-zinc-200 bg-white/50 dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/40">
                  {history.map((c) => (
                    <li
                      key={c.savedId}
                      className={`flex items-center gap-2 px-3 py-2 ${
                        run?.savedId === c.savedId ? "bg-sky-400/10" : ""
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => openChat(c)}
                        disabled={busy}
                        className="min-w-0 flex-1 text-left disabled:opacity-60"
                      >
                        <p className="truncate text-xs font-medium text-foreground hover:underline">
                          {c.question}
                        </p>
                        <p className="mt-0.5 text-[11px] text-zinc-400">
                          {formatKST(c.savedAt ?? "")} ·{" "}
                          {c.mode === "kb"
                            ? `📚 지식베이스 · 출처 ${c.sources?.length ?? 0}개`
                            : "🤖 LLM 단독"}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeChat(c)}
                        aria-label="이 질문 기록 삭제"
                        title="삭제"
                        className="shrink-0 rounded p-1 text-zinc-400 transition-colors hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
