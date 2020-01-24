
import {Revision, Args} from "@smogon/cms";

import crypto from 'crypto';
import uuid from 'uuid';
import {promises as fs} from 'fs';
import pathlib from 'path';

////////////////////////////////////////////////////////////////////////////////

// Note: subtype of Revision
interface FSPreRevision {
    page_id : string,
    args : Args,
    text : string
}

export interface FSRevision extends FSPreRevision {
    version : number,
}

type Index = { [page_id in string] : { version : number, args : Args, hash : string}};

function stringify(revision : FSPreRevision) : string {
    let header = {page_id: revision.page_id, args: revision.args};
    let contents = `--- CMS ---\n`;
    contents += JSON.stringify(header, null, 4) + '\n';
    contents += `--- /CMS ---\n`;
    contents += revision.text;
    return contents;
}

function parse(s : string) : FSPreRevision | null {
    let headerRE = /^--- CMS ---\n(.*?)\n--- \/CMS ---\n(.*)$/s;
    let result = s.match(headerRE);
    if (!result)
        return null;
    let [,headerString, text] = result;
    let header = JSON.parse(headerString);
    return {page_id: header.page_id, args: header.args, text};
}

function makeIndex(revisions : FSRevision[]) : Index {
    let index = Object.create(null);

    for (let revision of revisions) {
        let hash = crypto.createHash('sha256').update(revision.text, 'utf8').digest('hex');
        index[revision.page_id] = {version: revision.version, hash, args: revision.args};
    }

    return index;
}

////////////////////////////////////////////////////////////////////////////////

const INDEX_FILENAME = ".cmsindex";

async function dumpIndex(dirPath : string, revisions : FSRevision[]) {
    let index = makeIndex(revisions);
    let path = pathlib.join(dirPath, INDEX_FILENAME);
    let contents = JSON.stringify(index, null, 4);

    return fs.writeFile(path, contents);
}

async function dump1(dirPath : string, revision : FSRevision) {
    let filename = pathlib.join(dirPath, revision.page_id + ".txt");
    let contents = stringify(revision);
    return fs.writeFile(filename, contents);
}

export async function dump(dirPath : string, revisions : FSRevision[]) {
    await fs.mkdir(dirPath);

    let promises = [];
    promises.push(dumpIndex(dirPath, revisions));
    for (let revision of revisions) {
        promises.push(dump1(dirPath, revision));
    }

    await Promise.all(promises);
}

////////////////////////////////////////////////////////////////////////////////

async function loadIndex(dirPath : string) : Promise<Index> {
    let path = pathlib.join(dirPath, INDEX_FILENAME);
    let contents = await fs.readFile(path, 'utf8');
    return JSON.parse(contents);
}

async function load1(path : string) : Promise<FSPreRevision> {
    let contents = await fs.readFile(path, 'utf8');
    let revision = parse(contents);
    if (!revision) {
        throw new Error(`couldn't parse ${path}`);
    }
    return revision;
}

function argsEquiv(args1 : Args, args2 : Args) {
    let m1 = new Map(Object.entries(args1));
    let m2 = new Map(Object.entries(args2));
    if (m1.size !== m2.size) return false;
    for (let [k, v] of m1) {
        if (m2.get(k) !== v)
            return false;
    }
    return true;
}

export async function load(dirPath : string) : Promise<FSRevision[]> {
    let index = await loadIndex(dirPath);

    let filenames = await fs.readdir(dirPath);

    let promises = [];
    let result : FSRevision[] = [];

    for (let filename of filenames) {
        if (filename === INDEX_FILENAME)
            continue;

        promises.push((async () => {
            let revision = await load1(pathlib.join(dirPath, filename));
            let version
            if (revision.page_id === 'new') {
                revision.page_id = uuid.v4();
                version = 0;
            } else if (revision.page_id in index) {
                let {hash, args, version: version_} = index[revision.page_id]
                let newHash = crypto.createHash('sha256')
                    .update(revision.text, 'utf8')
                    .digest('hex');
                if (hash === newHash && argsEquiv(revision.args, args))
                    return;
                version = version_;
            } else {
                throw new Error(`Rage not in index: ${revision.page_id}`);
            }
            result.push({version, ...revision});
        })());
    }

    await Promise.all(promises);

    return result;
}
