
import mysql from 'mysql2/promise';
import crypto from 'crypto';
import SQL from 'sql-template-strings';

export type Remember = {user_id: number, remember_key: string};

export function parse(xf_user: string) : Remember | null {
    const [user_id_str, remember_key] = xf_user.split(",", 2);
    const user_id = parseInt(user_id_str, 10);
    if (remember_key === undefined) {
        return null;
    }
    return {user_id, remember_key};
}

function authenticate(given: string, expected: Buffer) : boolean {
    const givenHash = crypto.createHash("sha256").update(given, 'utf8').digest();
    return crypto.timingSafeEqual(givenHash, expected);
}

export async function validate(conn : mysql.Connection, remember : Remember) : Promise<boolean> {
    let q = SQL`
    SELECT remember_key
    FROM xf_user_remember
    WHERE user_id = ${remember.user_id} AND expiry_date >= unix_timestamp()`;
    let [rows] = await conn.query(q) as [mysql.RowDataPacket[], unknown];
    for (let {remember_key} of rows) {
        if (authenticate(remember.remember_key, remember_key)) {
            return true;
        }
    }
    return false;
}
