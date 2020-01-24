
import pg from 'pg';
import {SQL, SQLStatement, User, Args, TransactionBase} from './common.js';

interface Draft {
    // TODO: user object
    user_id : number,
    page_id : string,
    version : number,
    text : string
}

export class DraftTransaction extends TransactionBase {
    /* TODO: more general interface */

    async read(query: {q : 'args', args : Args}
               | {q : 'page', page_id : string}) : Promise<Draft | null> {
        let stmt = SQL`
SELECT d.user_id, d.page_id, d.version, d.text
FROM drafts d
`;

        if (query.q === 'args') {
            stmt.append(SQL`JOIN pages p ON (page_id) WHERE p.args = ${JSON.stringify(query.args)}`);
        } else {
            stmt.append(SQL`WHERE d.page_id = ${query.page_id}`);
        }

        let {rows} = await this.conn.query<Draft>(stmt);

        if (rows.length === 0) {
            return null;
        } else if (rows.length === 1) {
            return rows[0];
        } else {
            throw new Error(`Somehow returned more than 1 draft`)
        }
    }
}
