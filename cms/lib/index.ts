
import pg from 'pg';
import {Buildable} from './common.js';
export {User, Args} from './common.js';
import * as patch from './patch.js';
export * from './patch.js';
import * as revision from './revision.js';
export * from './revision.js';
import * as alert from './alert.js';
export * from './alert.js';
import * as draft from './draft.js';
export * from './draft.js';
import build from './build.js';

// Standardize this with the MySQL parts?
export type ConnectionInfo = {
    host?: string,
    port?: number,
    user: string,
    password?: string,
    max?: number,
    min?: number,
    database?: string,
    connectTimeoutMillis?: number,
    idleTimeoutMillis?: number,
    schema?: string,
}

export class Transaction {
    constructor(
        private conn : pg.PoolClient,
        private buildQueue : Buildable[] = [],
        public revisions = new revision.RevisionTransaction(conn, buildQueue),
        public patches = new patch.PatchTransaction(revisions, conn, buildQueue),
        public alerts = new alert.AlertTransaction(conn),
        public drafts = new draft.DraftTransaction(conn),
    ) {}

    async build() {
        await build(this.conn, this.buildQueue);

        // Must preserve sharing, don't do this.buildQueue = []
        this.buildQueue.length = 0;
    }

    async commit() {
        if (this.buildQueue.length !== 0)
            throw new Error('Commit without build');
        await this.conn.query("COMMIT");
        await this.conn.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    }

    async end() {
        await this.conn.query("ROLLBACK");
        this.conn.release();
    }
}

export class Session {
    private pool : pg.Pool;

    constructor(ci : ConnectionInfo) {
        this.pool = new pg.Pool(ci);
        if (ci.schema) {
            this.pool.on('connect', conn => {
                conn.query(`SET search_path to ${ci.schema}, public`);
            });
        }
    }

    static async with<T>(ci : ConnectionInfo, fn : (conn: Transaction) => Promise<T>): Promise<T> {
        let session = new Session(ci);
        try {
            return await session.with(fn);
        } finally {
            session.end();
        }
    }

    async start() : Promise<Transaction> {
        let conn = await this.pool.connect();
        // Default is READ COMMITTED ...
        await conn.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        return new Transaction(conn);
    }

    async with<T>(fn : (conn: Transaction) => Promise<T>): Promise<T> {
        let conn = await this.start();
        try {
            // Can't return fn(conn) directly; finally handler will run, closing
            // the connection before we run fn.
            return await fn(conn);
        } finally {
            await conn.end();
        }
    }

    async end() {
        await this.pool.end();
    }
}
