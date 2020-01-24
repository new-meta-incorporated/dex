
// TODO: fairly bare bones port, needs some TLC

import pg from 'pg';
import pgCopy from 'pg-copy-streams';
import SQL from 'sql-template-strings';
import escapeIdent from './escape-ident.js';

type Row = Record<string, unknown>;

function formatValue(s : any) {
    if (s === undefined || s === null) {
        // Null value
        return "\\N";
    }

    s = s.toString();
    // From the PG docs:
    //
    /* Backslash characters (\) can be used in the COPY data to quote data
     * characters that might otherwise be taken as row or column delimiters. In
     * particular, the following characters must be preceded by a backslash if
     * they appear as part of a column value: backslash itself, newline,
     * carriage return, and the current delimiter character. */
    s = s.replace(/\\/g, "\\\\");
    s = s.replace(/\n/g, "\\n");
    s = s.replace(/\r/g, "\\r");
    s = s.replace(/\t/g, "\\t");
    return s;
}

function formatRow(row : Row, columns : string[]) {
    // Remember that columns is guaranteed non-empty
    let s = formatValue(row[columns[0]]);
    for (let i = 1; i < columns.length; i++) {
        s += "\t";
        s += formatValue(row[columns[i]]);
    }
    s += "\n";
    return s;
}

async function getTableColumns(conn : pg.ClientBase, relationName : string) {
    // http://www.postgresql.org/docs/9.4/static/catalog-pg-attribute.html
    // Apparently information schema is slow? http://dba.stackexchange.com/a/22420/55553
    let {rows} = await conn.query<{attname: string}>(SQL`
    SELECT attname
    FROM pg_attribute
    WHERE attrelid = ${relationName}::regclass
    AND attnum > 0
    AND NOT attisdropped
    ORDER BY attnum
    `);

    let result = [];
    for (let {attname} of rows) {
        result.push(attname);
    }
    return result;
}

async function copyFrom<T>(conn : pg.ClientBase, q : string, fn : (stream : pgCopy.CopyStreamQuery) => Promise<T>) {
    let stream = conn.query(pgCopy.from(q));

    let result : T | undefined;
    try {
        result = await fn(stream);
    } finally {
        stream.end();
    }

    // Wait for the stream to end
    return new Promise<T>((resolve, reject) => {
        stream.once('error', reject);
        stream.once('end', () => resolve(result));
    });
}

export default async function copy(conn : pg.ClientBase,
                                   schemaName : string,
                                   tableName : string,
                                   rows : Row[]) {
    if (rows.length === 0)
        return
    let relationName = escapeIdent(tableName);
    if (schemaName)
        relationName = escapeIdent(schemaName) + "." + relationName;
    let columns = await getTableColumns(conn, relationName);

    return copyFrom(conn, `COPY ${relationName} FROM STDIN`, async (stream) => {
        for (let row of rows) {
            let s = formatRow(row, columns);
            stream.write(s);
        }
    });
}
