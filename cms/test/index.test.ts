
import pg from 'pg';
import {Session, ConnectionInfo, Transaction} from '@smogon/cms';
import {GenericContainer, StartedTestContainer} from 'testcontainers';
import {promises as fs} from 'fs'

let container : StartedTestContainer;
let ci : ConnectionInfo;
let session : Session;
let conn : Transaction;

beforeAll(async () => {
    try {
        container = await new GenericContainer("postgres", '11')
            .withExposedPorts(5432)
            .withEnv('POSTGRES_HOST_AUTH_METHOD', 'trust')
            .start();

        ci = {
            host: container.getContainerIpAddress(),
            port: container.getMappedPort(5432),
            user: 'postgres',
            database: 'postgres'
        };

        let client = new pg.Client(ci);
        await client.connect();
        try {
            let initScript = await fs.readFile(`../sql/schema.sql`, 'utf8');
            await client.query(initScript);
        } finally {
            client.end();
        }
    } catch(e) {
        // lol https://github.com/facebook/jest/issues/2713
        // If you're seeing this, you probably didn't run pnpx jest under sudo
        process.exit(1);
    }
});

afterAll(async () => {
    await container.stop();
});

beforeEach(async () => {
    session = new Session(ci);
    conn = await session.start();
});

afterEach(async () => {
    await conn.end();
    await session.end();
});

describe('revision', () => {
    test('write', async () => {
        let result = await conn.revisions.write({
            page_id: "c2d28fab-5a0e-4a7a-b81a-731d9bc053ef",
            version: 1,
            args: {},
            reason: "test",
            time: new Date,
            text: "hi",
            author: {id: 1, name: "chaos"},
            merger: null
        });
        expect(result).toBe('Success');

        let result2 = await conn.revisions.write({
            page_id: "c2d28fab-5a0e-4a7a-b81a-731d9bc053ef",
            version: 1,
            args: {},
            reason: "test",
            time: new Date,
            text: "hi",
            author: {id: 1, name: "chaos"},
            merger: null
        });
        expect(result2).toBe('WriteConflict');

        let result3 = await conn.revisions.write({
            page_id: "c2d28fab-5a0e-4a7a-b81a-731d9bc053ef",
            version: 2,
            args: {},
            reason: "test",
            time: new Date,
            text: "hi",
            author: {id: 1, name: "chaos"},
            merger: null
        });
        expect(result3).toBe('Success');

        // Different code path, test this again
        let result4 = await conn.revisions.write({
            page_id: "c2d28fab-5a0e-4a7a-b81a-731d9bc053ef",
            version: 2,
            args: {},
            reason: "test",
            time: new Date,
            text: "hi",
            author: {id: 1, name: "chaos"},
            merger: null
        });
        expect(result4).toBe('WriteConflict');

        let result5 = await conn.revisions.write({
            page_id: "c2d28fab-5a0e-4a7a-b81a-731d9bc053ef",
            version: 4, // Next version would be 3
            args: {},
            reason: "test",
            time: new Date,
            text: "hi",
            author: {id: 1, name: "chaos"},
            merger: null
        });
        expect(result5).toBe('WriteConflict');
    });
});

describe('patch', () => {
    test('create & update', async () => {
        let patch_id = await conn.patches.create({
            base_version : null,
            page_id : "c2d28fab-5a0e-4a7a-b81a-731d9bc053ef",
            text : "hi",
            reason : "test",
            skip_build : true,
            author : {id : 1, name : "chaos"},
            args : {}
        });

        let patches = await conn.patches.list();
        expect(patches.length).toBe(1);
        expect(patches[0].patch_id).toBe(patch_id);

        let result = await conn.patches.update(patch_id, 1, {
            base_version : null,
            page_id : "c2d28fab-5a0e-4a7a-b81a-731d9bc053ef",
            text: '',
            reason : "test",
            skip_build : true,
            author : {id : 1, name : "chaos"},
            args : {}
        });
        expect(result).toBe('Success');

        let result2 = await conn.patches.update(patch_id, 1, {
            base_version : null,
            page_id : "c2d28fab-5a0e-4a7a-b81a-731d9bc053ef",
            text: 'foo',
            reason : "test",
            skip_build : true,
            author : {id : 1, name : "chaos"},
            args : {}
        });
        expect(result2).toBe('WriteConflict');

        let result3 = await conn.patches.merge(patch_id, 1, {id: 1, name: "chaos"});
        expect(result3).toBe('WriteConflict');

        let result4 = await conn.patches.merge(patch_id, 2, {id: 1, name: "chaos"});
        expect(result4).toBe('Success');

        let result5 = await conn.patches.update(patch_id, 1, {
            base_version : null,
            page_id : "c2d28fab-5a0e-4a7a-b81a-731d9bc053ef",
            text: '',
            reason : "test",
            skip_build : true,
            author : {id : 1, name : "chaos"},
            args : {}
        });
        expect(result5).toBe('PatchInactive');

        let result6 = await conn.patches.update(patch_id, 2, {
            base_version : null,
            page_id : "c2d28fab-5a0e-4a7a-b81a-731d9bc053ef",
            text: '',
            reason : "test",
            skip_build : true,
            author : {id : 1, name : "chaos"},
            args : {}
        });
        expect(result6).toBe('PatchInactive');
    });

    test('good', async () => {
        let patch_id = await conn.patches.create({
            base_version : null,
            page_id : "c2d28fab-5a0e-4a7a-b81a-731d9bc053ef",
            text : `foo`,
            reason : "test",
            skip_build : true,
            author : {id : 1, name : "chaos"},
            args : {}
        });

        let result = await conn.patches.merge(patch_id, 1, {id: 2, name: "not chaos"});
        expect(result).toBe("Success");

        let revisions = await conn.revisions.listActive();
        expect(revisions.length).toBe(1);
        expect(revisions[0].merger).toEqual({id: 2, name: "not chaos"});
    });

    test('merge conflict', async () => {
        let patch_id = await conn.patches.create({
            base_version : null,
            page_id : "c2d28fab-5a0e-4a7a-b81a-731d9bc053ef",
            text : `foo`,
            reason : "test",
            skip_build : true,
            author : {id : 1, name : "chaos"},
            args : {}
        });

        let result = await conn.revisions.write({
            page_id: "c2d28fab-5a0e-4a7a-b81a-731d9bc053ef",
            version: 1,
            args: {},
            reason: "test",
            time: new Date,
            text: `bar`,
            author: {id: 1, name: "chaos"},
            merger: null
        });
        expect(result).toBe('Success');

        let result2 = await conn.patches.merge(patch_id, 1, {id: 1, name: "chaos"});
        expect(result2).toBe('MergeConflict');
    });

});

describe('build', () => {
    test('good', async () => {
        let result = await conn.revisions.write({
            page_id: "c2d28fab-5a0e-4a7a-b81a-731d9bc053ef",
            version: 1,
            args: {builder: 'alert'},
            reason: "test",
            time: new Date,
            text: `
# chaos
- argspec: {builder: alert}
  users: [1]
  alertOn: [submission]
`,
            author: {id: 1, name: "chaos"},
            merger: null
        });
        expect(result).toBe('Success');

        await conn.build();

        let users = await conn.alerts.getFor({args: {builder: 'alert'}, is: 'submission'});
        expect(users).toEqual([{id: 1, name: "<unknown>"}]);

        let result2 = await conn.revisions.write({
            page_id: "c2d28fab-5a0e-4a7a-b81a-731d9bc053ef",
            version: 2,
            args: {builder: 'alert'},
            reason: "test",
            time: new Date,
            text: ``,
            author: {id: 1, name: "chaos"},
            merger: null
        });
        expect(result2).toBe('Success');

        await conn.build();

        let users2 = await conn.alerts.getFor({args: {builder: 'alert'}, is: 'submission'});
        expect(users2).toEqual([]);
    });

    test('bad', async () => {
        let result = await conn.revisions.write({
            page_id: "c2d28fab-5a0e-4a7a-b81a-731d9bc053ef",
            version: 1,
            args: {builder: 'alert'},
            reason: "test",
            time: new Date,
            text: `nah`,
            author: {id: 1, name: "chaos"},
            merger: null
        });

        // Can't commit before build
        await expect(conn.commit()).rejects.toThrow('Commit without build');

        // And it doesn't build anyway.
        await expect(conn.build()).rejects.toThrow();
    });

    test('unknown', async () => {
        let result = await conn.revisions.write({
            page_id: "c2d28fab-5a0e-4a7a-b81a-731d9bc053ef",
            version: 1,
            args: {builder: 'foo'},
            reason: "test",
            time: new Date,
            text: "hi",
            author: {id: 1, name: "chaos"},
            merger: null
        });

        expect(result).toBe('Success');
        await expect(conn.build()).rejects.toThrow('invalid builder');
    });
});
