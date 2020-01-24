
// TODO: more fully typescript
// TODO: server-side version

import RouteRecognizer from 'route-recognizer';

export class RouteNotFound {
    constructor(public value: any) { }
}

export class RouteRedirect {
    constructor(public newPath: string, public temporary: boolean = false) { }
}

export class Router {
    public recognizer: any;
    public missingHandler: any;

    constructor(public base: string) {
        this.base = base;
        this.recognizer = new RouteRecognizer();
        this.missingHandler = (params: any) => null;
    }

    add(name: string, path: string, handler: any) {
        path = this.base + path;
        this.recognizer.add([{ path, handler }], { as: name });
    }

    match(path: string) {
        // All paths must be lowercase and end with a /, redirect if not.
        // This is so hacky... that refactor can't come soon enough.
        let npath = path.toLowerCase().replace(/\/?(\?|#|$)/, '/$1');
        if (path !== npath)
            throw new RouteRedirect(npath);

        let result = this.recognizer.recognize(path);
        if (result === undefined)
            this.notFound(path);

        // Result is some special snowflake array.
        let { queryParams } = result,
            { params, handler } = result[0];
        params.router = this;
        params.path = path;
        params.queryParams = queryParams;

        return { params, handler };
    }

    handle(path: string) {
        let { params, handler } = this.match(path);
        return handler(params);
    }

    notFound(path: string) {
        let result = this.missingHandler({ router: this, path: path });
        throw new RouteNotFound(result);
    }

    redirect(to: any, temporary: boolean) {
        throw new RouteRedirect(this.getPath(to), temporary);
    }

    getPath(to: any) {
        to = normalizeRouteParams(to, {});
        let path = this.recognizer.generate(to.routeName, to);
        // HACK For some reason route-recognizer "normalizes" without the
        // trailing slash if route doesn't end with a star. We like to normalize
        // the exact opposite...
        path = path.toLowerCase().replace(/\/?(\?|#|$)/, '/$1');
        return path;
    }
}

function normalizeRouteParams(to: any, queryParams: any /* mutable */): any {
    // Route params are
    // - object w/ toRouteParams
    // - {routeParams: ..., queryParams: ...}
    // - {routeName: ..., queryParams: ..., ... other params ...}
    if (typeof to.toRouteParams === 'function') {
        return normalizeRouteParams(to.toRouteParams(), queryParams);
    } else if (to.routeParams) {
        Object.assign(queryParams, to.queryParams || {});
        return normalizeRouteParams(to.routeParams, queryParams);
    } else if (to.routeName) {
        Object.assign(queryParams, to.queryParams || {});
        return { ...to, queryParams };
    }
}

export function transformHandler(router: any, f: any) {
    let oldMatch = router.match.bind(router);
    router.match = function(path: any) {
        let { params, handler } = oldMatch(path);
        return {
            params,
            handler(params: any) {
                return f(handler(params))
            }
        };
    }
}

// Client
//

let _active_router: any;
let _handleRender: any;

export function getPath(to: any) {
    return _active_router.getPath(to);
}

export function setMainRouter(router: any, handleRender: any) {
    _active_router = router;
    _handleRender = handleRender;
}

export async function reconcile() {
    for (; ;) {
        try {
            // XXX potentially resurrect caching
            let obj = _active_router.handle(location.pathname + location.search);
            await _handleRender(obj);
            break;
        } catch (e) {
            if (e instanceof RouteRedirect) {
                history.replaceState(history.state, "", e.newPath);
                continue;
            } else if (e instanceof RouteNotFound) {
                await _handleRender(e.value);
                break;
            }

            throw e;
        }
    }
}

export async function goPath(path: any, { replace = false, scroll = true }: any = {}) {
    let state = { scrollPos: scroll ? { x: 0, y: 0 } : null };
    if (replace) {
        history.replaceState(state, "", path);
    } else {
        history.pushState(state, "", path);
    }
    await reconcile();
}

export function go(to: any, args: any) {
    return goPath(getPath(to), args);
}

export async function start() {
    await reconcile();

    // Below is a comment I added many years ago. Is this still true?
    //
    // Don't add popstate in the first tick; this way we can ignore any
    // initial popstates. For example, if we back on page boundaries for
    // some reason we will get a popstate before everything has initialized.
    window.addEventListener("popstate", reconcile);
}

// React
//

import * as React from 'preact';

export const RouteInfo: React.Context<any> = React.createContext({ router: undefined, path: undefined });

export class Link extends React.Component<any, any> {
    async handleClick(path: any, scroll: any, postTransition: any, e: any) {
        e.preventDefault();
        await goPath(path, { scroll });
        if (postTransition) {
            postTransition();
        }
    }

    render() {
        let { className, children, hrefLang, to, scroll, postTransition } = this.props;
        return <RouteInfo.Consumer>
            {({ router, path }) =>
                <a hrefLang={hrefLang} className={className} href={router.getPath(to)} onClick={e => this.handleClick(path, scroll, postTransition, e)}>{children}</a>
            }
        </RouteInfo.Consumer>;
    }
}
