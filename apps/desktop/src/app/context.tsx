// React glue for the store and controller: a provider and the hooks components use to read state and act.

import { createContext, type ReactElement, type ReactNode, useContext } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { Controller } from "./controller";
import type { AppStore } from "./store";

interface AppContextValue {
  store: StoreApi<AppStore>;
  controller: Controller;
}

const AppContext = createContext<AppContextValue | null>(null);

/** Props of {@link AppProvider}. */
export interface AppProviderProps {
  store: StoreApi<AppStore>;
  controller: Controller;
  children: ReactNode;
}

/** Makes the store and controller available to every component below it. */
export function AppProvider({ store, controller, children }: AppProviderProps): ReactElement {
  return <AppContext.Provider value={{ store, controller }}>{children}</AppContext.Provider>;
}

function useCtx(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("This component must be rendered inside <AppProvider>");
  return ctx;
}

/** Read a slice of the store; the component re-renders only when that slice changes. */
export function useApp<T>(selector: (s: AppStore) => T): T {
  return useStore(useCtx().store, selector);
}

/** The actions that talk to the server. */
export function useController(): Controller {
  return useCtx().controller;
}
