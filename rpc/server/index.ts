
import Koa from 'koa'
import bodyParser from 'koa-bodyparser';

type RawHandler = (args : any) => Promise<any>;
type NormalizedHandler = {cookies? : string[], fn : RawHandler};
type Handler = RawHandler | NormalizedHandler

export type Handlers = {
    [fnName : string]: Handler;

}
export class PassthroughJSON {
    constructor(public string : string) {}
}

function normalizeHandler(handler : Handler): NormalizedHandler {
    if (typeof handler === 'function') {
        return {fn: handler};
    } else {
        return handler;
    }
}

export function toKoa(handlers : Handlers) {
    const app = new Koa();
    app.use(bodyParser());
    app.use(async ctx => {
        if (ctx.method === 'GET') {
            ctx.body = "This is a working rpc endpoint, you have to use POST.";
            return;
        }

        let {fn, args} = ctx.request.body;

        let unnormalizedHandler = handlers[fn];
        if (unnormalizedHandler === undefined) {
            throw new Error(`Unknown handler: ${fn}`);
        }

        let handler = normalizeHandler(unnormalizedHandler);

        for (let name of handler.cookies ?? []) {
            args[name] = ctx.cookies.get(name) ?? null;
        }

        try {
            let result = await handler.fn(args);

            if (result === undefined)
                result = null;

            ctx.type = 'application/json';

            if (result instanceof PassthroughJSON) {
                ctx.body = result.string;
            } else {
                ctx.body = JSON.stringify(result);
            }
        } catch(e) {
            // TODO
            throw e;
        }
    });
    return app;
}
