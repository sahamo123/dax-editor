// Optional shared host lets the app place its existing notices inside the active editor dialog.
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface NoticeHosts {
  current: HTMLElement | null;
  register(element: HTMLElement): () => void;
}

const Context = createContext<NoticeHosts | null>(null);

/** Share a stack of modal notice destinations with the shell and embedded editor. */
export function NoticeHostProvider({ children }: { children: ReactNode }): ReactElement {
  const [hosts, setHosts] = useState<HTMLElement[]>([]);
  const register = useCallback((element: HTMLElement) => {
    setHosts((previous) => [...previous.filter((host) => host !== element), element]);
    return () => setHosts((previous) => previous.filter((host) => host !== element));
  }, []);
  const value = useMemo(() => {
    // Child layout effects can register before parents; DOM order still selects the inner dialog.
    const current = hosts.reduce<HTMLElement | null>(
      (latest, host) =>
        !latest || latest.compareDocumentPosition(host) & Node.DOCUMENT_POSITION_FOLLOWING
          ? host
          : latest,
      null,
    );
    return { current, register };
  }, [hosts, register]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** Return the current modal destination, or null in standalone editor use. */
export function useNoticeHost(): HTMLElement | null {
  return useContext(Context)?.current ?? null;
}

/** Reserve a bounded area for notices in a mounted modal; harmless without a provider. */
export function NoticeHost(): ReactElement {
  const register = useContext(Context)?.register;
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element && register) return register(element);
  }, [register]);
  return <div ref={ref} className="notice-host" />;
}
