declare module 'better-sqlite3-session-store' {
  import session from 'express-session';
  function BetterSqlite3SessionStore(s: typeof session): any;
  export = BetterSqlite3SessionStore;
}
