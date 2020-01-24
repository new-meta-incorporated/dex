
import pg from 'pg';
import uuid from 'uuid';
import copy from './copy.js';
import Unit from './unit.js';
import builderMap from './builder-map.js';
import {SQL, Args, SQLStatement} from './common.js';
import escapeIdent from './escape-ident.js';

// From smogon/database/conn
async function scalars<T>(conn : pg.ClientBase, q : SQLStatement) : Promise<T[]> {
    let {rows, fields} = await conn.query(q)
    if (fields.length !== 1)
        throw new Error(`query only has ${fields.length} columns; scalars() only allows one`)
    for (let i = 0; i < rows.length; i++) {
        rows[i] = rows[i][fields[0].name]
    }
    return rows as T[];
}

async function checkRefs(conn : pg.ClientBase, unit : Unit, page_ids : string[]) {
    let refs = Array.from(unit.getReferences());
    let defrefs = [];
    let crossrefs = [];
    for (let i = 0; i < refs.length; i++) {
        let {obj, defined, references} = refs[i];
        if (defined) {
            defrefs.push({ref: obj, i});
        } else {
            // Only check refs that weren't defined here
            if (references)
                crossrefs.push({ref: obj, i});
        }
    }

    // Check that there are no existing definitions in other pages.
    if (defrefs.length) {
        let badIndexes = await scalars<number>(conn, SQL`
        SELECT input.i
        FROM json_to_recordset(${JSON.stringify(defrefs)})
        AS input(ref jsonb, i int)
        WHERE
        EXISTS(
            SELECT 1
            FROM defrefs JOIN pages USING (build_id)
            WHERE
            pages.page_id <> ALL(${page_ids})
            AND defrefs.ref = input.ref
            )
        `);

        // FIXME need unit error tracking
        for (let badIndex of badIndexes) {
            throw new Error(`duplicate definition of ${refs[badIndex].serializedObj}`);
        }
    }

    // Check that crossrefs not defined in these pages have a definition elsewhere.
    if (crossrefs.length) {
        let badIndexes = await scalars<number>(conn, SQL`
        SELECT input.i
        FROM json_to_recordset(${JSON.stringify(crossrefs)})
        AS input(ref jsonb, i int)
        WHERE
        NOT EXISTS(
            SELECT 1
            FROM defrefs JOIN pages USING (build_id)
            WHERE
            pages.page_id <> ALL(${page_ids})
            AND defrefs.ref = input.ref
            )
        `);

        // FIXME need unit error tracking
        for (let badIndex of badIndexes) {
            throw new Error(`bad reference to ${refs[badIndex].serializedObj}`);
        }
    }

    // Check that crossrefs on other pages that don't have a matching definition
    // match one of the definitions on this page.
    let badRefs = await scalars(conn, SQL`
    SELECT ref
    FROM crossrefs
    JOIN pages USING (build_id)
    WHERE
    pages.page_id <> ALL(${page_ids}) AND
    NOT EXISTS (
        SELECT 1
        FROM defrefs JOIN pages USING (build_id)
        WHERE
        pages.page_id <> ALL(${page_ids})
        AND defrefs.ref = crossrefs.ref
    )
    AND
    NOT EXISTS (
        SELECT 1
        FROM json_to_recordset(${JSON.stringify(defrefs)})
        AS input(ref jsonb)
        WHERE
        crossrefs.ref = input.ref
    )
    `);

    for (let badRef of badRefs) {
        throw new Error(`other page references ${JSON.stringify(badRef)}, expected it to be defined here.`);
    }
}

async function run(conn : pg.ClientBase, unit : Unit, page_ids : string[], build_ids : string[]) {
    await conn.query(SQL`INSERT INTO builds (build_id) SELECT unnest(${build_ids}::uuid[])`);
    await conn.query(SQL`SET CONSTRAINTS ALL DEFERRED`);
    await conn.query(SQL`
    DELETE FROM builds
    USING pages
    WHERE builds.build_id = pages.build_id AND pages.page_id = ANY(${page_ids})
    `);

    let defrefs = [];
    let crossrefs = [];
    for (let {serializedObj, defined, references} of unit.getReferences()) {
        if (defined)
            defrefs.push({ref: serializedObj, build_id: defined.context.build_id});
        let seen = new Set;
        for (let reference of references) {
            if (!seen.has(reference.context.build_id))
                crossrefs.push({ref: serializedObj, build_id: reference.context.build_id});
            seen.add(reference.context.build_id);
        }
    }

    await copy(conn, "cms", "crossrefs", crossrefs);
    await copy(conn, "cms", "defrefs", defrefs);

    for (let [schemaName, tableName, rows] of unit.getRows()) {
        await copy(conn, schemaName, tableName, rows);
    }

    await conn.query(SQL`SET CONSTRAINTS ALL IMMEDIATE`);
    await conn.query(SQL`
    UPDATE pages
    SET build_id = mapping.build_id
    FROM unnest(${page_ids}::uuid[], ${build_ids}::uuid[]) AS mapping(page_id, build_id)
    WHERE pages.page_id = mapping.page_id
    `);
}

type Buildable = {page_id : string, args: Args, text : string};

// From smogon/database/conn
async function notify(conn : pg.ClientBase, channel : string, obj : any = null) {
    return conn.query(`NOTIFY ${escapeIdent(channel)}, '${JSON.stringify(obj)}'`);
}

export default async function build(conn : pg.ClientBase, buildables : Buildable[], testOnly : boolean=false) {
    let unit = new Unit;
    let page_ids = [];
    let build_ids = [];

    for (let {page_id, args, text} of buildables) {
        let builder = args.builder;
        let func = builderMap.get(builder);
        if (!func)
            throw new Error (`invalid builder ${builder}`);

        let build_id = uuid.v4();
        // If text is blank, do not actually build. This allows "deleting" a
        // page. Also, the blank revision must be considered a build no-op
        // because all pages (yes, this is an infinite set) are considered to
        // have a blank first revision present (which are created lazily).
        //
        // In the future we may not want to insert a worthless build_id, for now
        // its fine I guess.
        //
        // Builders are expected to ignore on text = null, but we still have to
        // call the routine so they can perform any refresh logic
        let buildText : string | null = text;
        if (!text.trim())
            buildText = null;
        let subUnit = unit.withContext({context: {build_id}});
        let mod = require(func);
        mod(subUnit, args, buildText);
        page_ids.push(page_id);
        build_ids.push(build_id);
    }

    if (!page_ids.length)
        return;

    await checkRefs(conn, unit, page_ids);

    if (!testOnly)
        await run(conn, unit, page_ids, build_ids);

    await Promise.all(unit.notifications.map(({channel, payload}) => notify(conn, channel, payload)));
}
