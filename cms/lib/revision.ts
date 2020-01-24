
import pg from 'pg';
import {SQL, SQLStatement, User, Args, BuildableBase} from './common.js';


interface RevisionBase {
    page_id : string,
    version : number,
    args : Args,
    reason : string,
    time : Date,
    text : string
};

// TODO: can we modify the database schema to obviate this type?
interface RawRevision extends RevisionBase {
    author_user_id : number,
    author_username : string,
    merger_user_id : number | null,
    merger_username : string | null,
};

export interface Revision extends RevisionBase {
    author : User,
    merger : User | null,
};

export interface RevisionQuery {
    args?: Args,
    limit?: number
};

export class RevisionTransaction extends BuildableBase {
    private async getRevisions(sql : SQLStatement) : Promise<Revision[]> {
        let stmt = SQL`
        SELECT r.page_id, r.version, r.merger_user_id, r.merger_username, r.author_user_id, r.author_username, r.reason, r.time, r.text, r.args
        FROM revisions r
        `
        stmt.append(sql);

        let {rows} = await this.conn.query<RawRevision>(stmt);

        let result : Revision[] = [];
        for (let {merger_user_id, merger_username, author_user_id, author_username, ...row} of rows) {
            let author = {id : author_user_id, name : author_username};
            let merger = merger_user_id !== null ? {id : merger_user_id, name : merger_username as string} : null;
            result.push({author, merger, ...row});
        }
        return result;
    }

    async listActive(options : RevisionQuery={}) : Promise<Revision[]> {
        let stmt = SQL`
        JOIN pages p USING (page_id, version)
        WHERE r.text <> ''
        `;

        if (options.args) {
            stmt.append(SQL` AND r.args @> ${JSON.stringify(options.args)}`)
        }

        if (options.limit) {
            stmt.append(SQL` LIMIT ${options.limit}`);
        }

        return this.getRevisions(stmt);
    }

    async read(query:
               {q: 'args', args : Args} |
               {q: 'page', page_id : string, version : number | 'latest'}) :
    Promise<Revision | null> {
        let stmt = SQL``;

        if (query.q === 'args') {
            stmt.append(SQL`
            JOIN pages p USING (page_id, version)
            WHERE r.args = ${JSON.stringify(query.args)}
            `);
        } else {
            if (query.version === 'latest') {
                stmt.append(SQL`
                JOIN pages p USING (page_id, version)
                `);
            }

            stmt.append(SQL`
            WHERE r.page_id = ${query.page_id}
            `);

            if (query.version !== 'latest') {
                stmt.append(SQL` AND version = ${query.version}`);
            }
        }

        let revisions = await this.getRevisions(stmt);

        if (revisions.length === 0) {
            return null;
        } else if (revisions.length === 1) {
            return revisions[0];
        } else {
            throw new Error(`Somehow returned more than 1 revision`);
        }
    }

    async write(revision : Revision) : Promise<'Success' | 'WriteConflict'> {
        await this.conn.query(SQL`SET CONSTRAINTS page_has_valid_latest_revision DEFERRED`);

        try {
            let prev_version : number | null = null;

            if (revision.version === 1) {
                let result = await this.conn.query(SQL`
INSERT INTO pages
(page_id, args, version)
VALUES (${revision.page_id}, ${JSON.stringify(revision.args)}, 1)
ON CONFLICT DO NOTHING
`);
                if (result.rowCount === 0)
                    return 'WriteConflict';
                else if (result.rowCount > 1)
                    throw new Error(`Somehow updated more than 1 page`);
            } else {
                prev_version = revision.version - 1;
                let result = await this.conn.query(SQL`
UPDATE pages
SET version = version + 1
WHERE page_id = ${revision.page_id} AND version = ${prev_version}
`);
                if (result.rowCount === 0)
                    return 'WriteConflict';
                else if (result.rowCount > 1)
                    throw new Error(`Somehow updated more than 1 page`);
            }

            let merger_user_id : number | null = revision.merger === null ? null : revision.merger.id;
            let merger_username : string | null = revision.merger === null ? null : revision.merger.name;

            let result = await this.conn.query(SQL`
INSERT INTO revisions
(page_id, version, prev_version,
author_user_id, author_username,
merger_user_id, merger_username,
reason, text, args)
VALUES
(${revision.page_id}, ${revision.version}, ${prev_version},
${revision.author.id}, ${revision.author.name},
${merger_user_id}, ${merger_username},
${revision.reason}, ${revision.text}, ${JSON.stringify(revision.args)})
`);

            this.buildQueue.push({page_id : revision.page_id, args: revision.args, text: revision.text});

            return 'Success';
        } finally {
            await this.conn.query(SQL`SET CONSTRAINTS page_has_valid_latest_revision IMMEDIATE`);
        }
    }
}
