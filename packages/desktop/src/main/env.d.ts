interface ImportMetaEnv {
  readonly SHOB_CHANNEL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module "virtual:shob-server" {
  export namespace Server {
    export const listen: typeof import("../../../shob/dist/types/src/node").Server.listen
    export type Listener = import("../../../shob/dist/types/src/node").Server.Listener
  }
  export namespace Config {
    export const get: typeof import("../../../shob/dist/types/src/node").Config.get
    export type Info = import("../../../shob/dist/types/src/node").Config.Info
  }
  export const bootstrap: typeof import("../../../shob/dist/types/src/node").bootstrap
}
