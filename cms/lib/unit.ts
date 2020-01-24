
// TODO: needs TLC

import detStringify from './det-stringify.js';

type Row = Record<string, unknown>;
type Reference = Row;
type Definition = {context: Row, stack: string[]};
type RefEntry = {obj : Reference,
                 serializedObj: string,
                 defined: Definition | null,
                 references: Definition[]};

// TODO From smogon/util, might want to move elsewhere
class DefaultMap<K, V> extends Map<K, V> {
    constructor(private fn : () => V) {
        super();
    }

    get(k : K) : V {
        let v = super.get(k);
        if (v === undefined) {
            v = this.fn();
            this.set(k, v);
        }
        return v;
    }
}

export default class Unit {
    constructor(private stack : string[] = [],
                private context : Row = {},
                public notifications : {channel : string, payload : string}[] = [],
                private schema = null,
                private references = new Map<string, RefEntry>(),
                // schemaName -> table -> rows
                private data : DefaultMap<string, DefaultMap<string, Row[]>> =
                 new DefaultMap(() => new DefaultMap(() => []))) {}

    withContext({description, context, schema} : any) : Unit {
        let stack = description === undefined ? this.stack : [...this.stack, description];
        context = context === undefined ? this.context : Object.setPrototypeOf(context, this.context);
        schema = schema === undefined ? this.schema : schema;
        // TODO: nasty, fix
        return {__proto__: this, stack, context, schema} as unknown as any;
    }

    notify(channel : string, payload : string) {
        this.notifications.push({channel, payload});
    }

    addReference(obj: Reference, isDefinition : boolean) {
        let serializedObj = detStringify(obj);
        let ref = this.references.get(serializedObj);
        if (!ref) {
            ref = {obj, serializedObj, defined: null, references: []};
            this.references.set(serializedObj, ref);
        }
        let info = {context: this.context, stack: this.stack};
        if (isDefinition) {
            if (ref.defined)
                throw new Error(`non-unique definition ${serializedObj}`);
            ref.defined = info;
        } else {
            ref.references.push(info);
        }
        return obj;
    }

    add(tableRowsObj : Record<string, Row[]>, schemaName : any = this.schema) {
        for (let [tableName, dstRows] of Object.entries(tableRowsObj)) {
            let srcRows = this.data.get(schemaName).get(tableName);
            for (let dstRow of dstRows) {
                Object.setPrototypeOf(dstRow, this.context);
                srcRows.push(dstRow);
            }
        }
    }

    getReferences() {
        return this.references.values();
    }

    *getRows() : Iterable<[string, string, Row[]]> {
        for (let [schemaName, tables] of this.data) {
            for (let [tableName, rows] of tables) {
                yield [schemaName, tableName, rows];
            }
        }
    }
}
