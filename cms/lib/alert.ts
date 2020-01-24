
import pg from 'pg';
import {SQL, SQLStatement, User, Args, TransactionBase} from './common.js';

export interface AlertQuery {
    args: Args,
    is: 'submission' | 'write'
};

export class AlertTransaction extends TransactionBase {
    /* TODO: more general interface */
    async getFor(options : AlertQuery) : Promise<User[]> {
        /* TODO:  add a username column */
        let stmt = SQL`
        SELECT user_id as id, '<unknown>' as name
        FROM alerts
        WHERE ${JSON.stringify(options.args)} @> args
        `;

        if (options.is === 'submission') {
            stmt.append(` AND on_submission`);
        } else if (options.is === 'write') {
            stmt.append(` AND on_write`);
        }

        let {rows} = await this.conn.query<User>(stmt);

        return rows;
    }
}
