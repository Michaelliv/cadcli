declare module "convert-layout/he.js" {
  const layout: {
    fromEn(text: string): string;
    toEn(text: string): string;
  };
  export default layout;
}

declare module "better-sqlite3" {
  const Database: new (
    path: string,
  ) => {
    exec(sql: string): void;
    close(): void;
    function(name: string, fn: (...args: unknown[]) => unknown): void;
    prepare(sql: string): {
      readonly?: boolean;
      columns?: () => Array<{ name: string }>;
      all(...params: unknown[]): unknown[];
      run(...params: unknown[]): unknown;
    };
  };
  export default Database;
}
