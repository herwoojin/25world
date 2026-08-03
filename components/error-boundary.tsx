"use client";

// 최상위 에러 경계 — 어느 한 컴포넌트가 렌더링 중 예외를 던지면 리액트는
// 기본적으로 트리 전체를 내려버려 "페이지가 갑자기 안 보이는" 증상으로
// 이어진다. 여기서 붙잡아 안내 화면 + 새로고침 버튼을 보여준다.
// (에러 경계는 클래스 컴포넌트로만 만들 수 있다 — 훅으로 대체 불가)
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-2xl">
            ⚠️
          </div>
          <p className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
            페이지를 표시하는 중 문제가 발생했습니다
          </p>
          <p className="max-w-sm text-sm text-zinc-500">
            일시적인 오류일 수 있어요. 새로고침하면 대부분 해결됩니다.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-1 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700"
          >
            새로고침
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
