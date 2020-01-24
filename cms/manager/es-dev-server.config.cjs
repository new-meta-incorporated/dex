
const proxy = require('koa-proxies');

module.exports = {
    port: 9000,
    rootDir: "build",
    appIndex: "index.html",
    middlewares: [
        proxy('/_rpc', {
            target: 'httsp://localhost:9001',
        }),
    ],
};
