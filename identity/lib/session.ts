
import mysql from 'mysql2/promise.js';
import * as Remember from './remember.js';
import * as User from './user.js';

export type ConnectionInfo = {
    host?: string,
    port?: number,
    socketPath?: string,
    user: string,
    password?: string,
    connectionLimit?: number,
    connectTimeout?: number,
    debug?: boolean
}

export class Session {
    private pool : mysql.Pool;

    constructor(ci : ConnectionInfo) {
        let ci2 = {...ci, database: 'xenforo'};
        this.pool = mysql.createPool(ci2);
    }

    end() {
        this.pool.end();
    }

    async lookup(user_id : number) : Promise<User.User | null> {
        let conn = await this.pool.getConnection();
        try {
            return User.lookup(conn, user_id);
        } finally {
            conn.release();
        }
    }

    async validate(remember : Remember.Remember) : Promise<boolean> {
        let conn = await this.pool.getConnection();
        try {
            return Remember.validate(conn, remember);
        } finally {
            conn.release();
        }
    }

    async validateLookup(remember : Remember.Remember) : Promise<User.User | null> {
        if (await this.validate(remember)) {
            return this.lookup(remember.user_id);
        } else {
            return null;
        }
    }
}
