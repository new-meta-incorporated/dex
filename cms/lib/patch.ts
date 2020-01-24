
import pg from 'pg';
import uuid from 'uuid';
import {SQL, SQLStatement, User, Args, BuildableBase, Buildable} from './common.js';
import {RevisionTransaction} from './revision.js';

export type PatchStatus = 'active' | 'deleted' | 'merged';

export interface PatchQuery {
    // TODO: if we want this, add an index
    // args? : Args,
    status?: PatchStatus,
    before? : Date,
    limit? : number,
};

interface PatchBase {
    patch_id : string,
    page_id : string,
    base_version : number | null,
    version : number,
    reason : string,
    time : string,
    text : string,
    build_skipped : boolean,
    status : PatchStatus,
    args : Args
}

interface PatchRaw extends PatchBase {
    author_user_id : number,
    author_username : string,
}

export interface Patch extends PatchBase {
    author : User
}

// TODO: consolidate?
interface NewPatch {
    // TODO: pagespec
    base_version : number | null,
    page_id : string,
    text : string,
    reason : string,
    skip_build : boolean,
    author : User,
    args : Args
}

export class PatchTransaction extends BuildableBase {
    constructor(private revisions : RevisionTransaction,
                conn : pg.PoolClient,
                buildQueue : Buildable[]) {
        super(conn, buildQueue);
    }

    private async getPatches(sql : SQLStatement) : Promise<Patch[]> {
        let stmt = SQL`
SELECT p.patch_id, p.page_id, p.base_version, p.version, p.reason, p.time, p.text, p.build_skipped, p.status, p.author_user_id, p.author_username, p.args
FROM patches p
`;
        stmt.append(sql);

        let {rows} = await this.conn.query<PatchRaw>(stmt);

        let result : Patch[] = [];
        for (let {author_user_id, author_username, ...row} of rows) {
            let author = {id : author_user_id, name : author_username};
            result.push({author, ...row});
        }

        return result;
    }

    async list(options : PatchQuery = {}) : Promise<Patch[]> {
        let stmt = SQL`WHERE TRUE`;

        if (options.status) {
            stmt.append(` AND status = ${options.status}`);
        }

        if (options.before) {
            stmt.append(` AND time < ${options.before}`);
        }

        if (options.limit) {
            stmt.append(` LIMIT ${options.limit}`);
        }

        return await this.getPatches(stmt);
    }

    // TODO handle build skipped?
    async create(patch : NewPatch) : Promise<string> {
        let patch_id = uuid.v4();

        // version defaults to 1
        let stmt = SQL`
INSERT INTO patches
(patch_id, page_id, base_version,
author_user_id, author_username,
reason, text, build_skipped, args)
VALUES
(${patch_id}, ${patch.page_id}, ${patch.base_version},
${patch.author.id}, ${patch.author.name},
${patch.reason}, ${patch.text}, ${patch.skip_build}, ${JSON.stringify(patch.args)})
`;

        await this.conn.query(stmt);

        return patch_id;
    }

    async read(patch_id : string) : Promise<Patch | null> {
        let patches = await this.getPatches(SQL`WHERE patch_id = ${patch_id}`);

        if (patches.length === 0) {
            return null;
        } else if (patches.length === 1) {
            return patches[0];
        } else {
            throw new Error(`Somehow returned more than 1 revision`);
        }
    }

    async update(patch_id: string, version: number, patch: NewPatch) :
    Promise<'Success' | 'NoSuchPatch' | 'PatchInactive' | 'WriteConflict'> {
        let {rows} = await this.conn.query<{version: number, status: PatchStatus}>(SQL`
SELECT version, status FROM patches WHERE patch_id = ${patch_id}
`);

        if (rows.length === 0)
            return 'NoSuchPatch';

        let {version: latestVersion, status} = rows[0];

        if (status !== 'active')
            return 'PatchInactive';

        if (version !== latestVersion)
            return 'WriteConflict';

        await this.conn.query(SQL`
UPDATE patches
SET base_version=${patch.base_version}, text=${patch.text}, reason=${patch.reason}, version=${version + 1}, time=NOW(), build_skipped=${patch.skip_build}, args=${patch.args}, author_user_id=${patch.author.id}, author_username=${patch.author.name}
WHERE patch_id = ${patch_id}
`);

        return 'Success';
    }

    async merge(patch_id: string, version: number, merger: User) :
    Promise<'Success' | 'NoSuchPatch' | 'WriteConflict' | 'MergeConflict' | 'PatchInactive'> {
        let patch = await this.read(patch_id);

        if (patch === null) {
            return 'NoSuchPatch';
        }

        if (version !== patch.version)
            return 'WriteConflict';

        if (patch.status !== 'active')
            return 'PatchInactive';

        let revision = {
            page_id: patch.page_id,
            version: (patch.base_version ?? 0) + 1,
            args: patch.args,
            reason: patch.reason,
            time: new Date,
            text: patch.text,
            author: patch.author,
            merger
        }

        let result = await this.revisions.write(revision);

        if (result === 'WriteConflict')
            return 'MergeConflict';

        await this.conn.query(SQL`
UPDATE patches
SET status = 'merged'
WHERE patch_id = ${patch_id}
`);

        return 'Success';
    }

    async delete(patch_id : string) : Promise<boolean> {
        let stmt = SQL`
UPDATE patches
SET status = 'deleted'
WHERE patch_id = ${patch_id} AND status = 'active'
 `;
        let result = await this.conn.query(stmt);
        return result.rowCount === 1;
    }
}
