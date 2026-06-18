import { createContext, useContext, createEffect } from "solid-js"
import { base64Encode } from "@shob-ai/util/encode"

interface MockSessionLayout {
  params: { sessionId: string }
  tabs: () => any
  view: () => any
}

const SessionLayoutContext = createContext<MockSessionLayout>()

export function useSessionLayout() {
  const ctx = useContext(SessionLayoutContext)
  if (ctx) return ctx
  
  // Return a safe mock if not wrapped
  return {
    params: { sessionId: "default-session" },
    tabs: () => ({
      active: undefined,
      all: () => [],
      setActive: () => {},
      open: async () => {},
    }),
    view: () => ({
      reviewPanel: {
        opened: () => false,
        open: () => {},
        close: () => {},
      }
    })
  }
}

export function createSessionTabs(props: any) { return { activeFileTab: () => undefined } }


export function useQueryOptions() { return { agents: (key?: any) => ({ queryKey: ['agents', key ?? 'global'], queryFn: () => [] }), providers: (key?: any) => ({ queryKey: ['providers', key ?? 'global'], queryFn: () => [] }) } }
export function pathKey(path: string | undefined) { return path || '' }


export function SessionLayoutProvider(props: any) {
  const routeParams = useParams()
  const value = {
    params: {
      get sessionId() {
        // props.sessionId is authoritative; routeParams.id is a fallback only
        return props.sessionId || routeParams.id
      },
    },
    tabs: () => ({ active: undefined, all: () => [], setActive: () => {}, open: async () => {} }),
    view: () => ({ reviewPanel: { opened: () => false, open: () => {}, close: () => {} } }),
  }
  return <SessionLayoutContext.Provider value={value}>{props.children}</SessionLayoutContext.Provider>
}


export function useFile() { return {} }


import { SDKProvider } from "@/context/sdk";
import { SyncProvider } from "@/context/sync";
import { LocalProvider } from "@/context/local";
import { LayoutProvider } from "@/context/layout";
import { CommentsProvider } from "@/context/comments";
import { PromptProvider } from "@/context/prompt";
import { SettingsProvider } from "@/context/settings";
import { CommandProvider } from "@/context/command";
import { PermissionProvider } from "@/context/permission";
import { MemoryRouter, Route, createMemoryHistory, useParams } from "@solidjs/router";

export function MockSessionProviders(props: { directory: string; sessionId: string; children: any }) { 
  const dir = () => props.directory; 
  const history = createMemoryHistory();
  const routeSessionId = () => props.sessionId?.startsWith("ses") ? props.sessionId : "new";
  
  createEffect(() => {
    history.set({ value: `/${base64Encode(props.directory)}/session/${routeSessionId()}`, replace: true, scroll: false });
  });

  return (
    <MemoryRouter history={history}>
      <Route path="/:dir/session/:id" component={() => (
        <SessionLayoutProvider sessionId={routeSessionId()}>
          <SettingsProvider>
            <SDKProvider directory={dir}>
              <SyncProvider>
                <LocalProvider>
                  <PermissionProvider>
                    <CommandProvider>
                      <LayoutProvider>
                        <CommentsProvider>
                          <PromptProvider>
                            {props.children}
                          </PromptProvider>
                        </CommentsProvider>
                      </LayoutProvider>
                    </CommandProvider>
                  </PermissionProvider>
                </LocalProvider>
              </SyncProvider>
            </SDKProvider>
          </SettingsProvider>
        </SessionLayoutProvider>
      )} />
    </MemoryRouter>
  ); 
}

