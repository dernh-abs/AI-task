import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { initialState } from "./data";
import type { AppState, CandidateTask, HelpRequest, Task } from "./types";
type Store = {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  reset: () => void;
  user: (id?: string) => string;
  project: (id: string) => string;
};
const C = createContext<Store | null>(null);
const KEY = "qy-task-os-demo-v2";
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "null") || initialState;
    } catch {
      return initialState;
    }
  });
  useEffect(() => localStorage.setItem(KEY, JSON.stringify(state)), [state]);
  const value = useMemo<Store>(
    () => ({
      state,
      setState,
      reset: () => setState(structuredClone(initialState)),
      user: (id) => state.users.find((x) => x.id === id)?.name || "未指定",
      project: (id) =>
        state.projects.find((x) => x.id === id)?.name || "未分类",
    }),
    [state],
  );
  return <C.Provider value={value}>{children}</C.Provider>;
}
export const useStore = () => {
  const v = useContext(C);
  if (!v) throw new Error("Store missing");
  return v;
};
export const candidateToTask = (c: CandidateTask): Task => ({
  id: `t${Date.now()}`,
  title: c.title,
  projectId: c.projectId,
  ownerId: c.ownerId,
  status: c.isMeeting ? "PENDING_OWNER_CONFIRMATION" : "TODO",
  priority: c.priority,
  mode: c.mode,
  dueAt: c.dueAt,
  background: c.background,
  objective: c.objective,
  deliverable: c.deliverable,
  acceptance: c.acceptance,
  points: c.points,
  source: c.sourceType,
  meetingStage: c.isMeeting ? "EMPLOYEE_CONFIRM" : undefined,
});
export const resolveHelp = (h: HelpRequest) => ({
  ...h,
  status: "RESOLVED" as const,
});
