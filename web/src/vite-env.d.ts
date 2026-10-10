declare const __PINTA_OFFLINE__: boolean;

declare module '*.wasm?url' {
  const url: string;
  export default url;
}
