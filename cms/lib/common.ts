
import pg from 'pg';

import SQL from 'sql-template-strings';
import type {SQLStatement} from 'sql-template-strings';

export {SQL, SQLStatement};

export type User = {name : string, id : number};
export type Args = Record<string, string>;

export type Buildable = {page_id : string, args : Args, text : string};

export class TransactionBase {
    constructor(protected conn: pg.ClientBase) {};
}

export class BuildableBase extends TransactionBase {
    constructor(conn: pg.PoolClient, protected buildQueue: Buildable[]) { super(conn); };
}
