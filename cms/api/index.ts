
import "make-promises-safe";
import "source-map-support/register.js";

import program from "commander";
import http from 'http';
import Koa from 'koa';
import mount from 'koa-mount';

import * as identity from "@smogon/identity";
import * as cms from "@smogon/cms";

import {HANDLERS} from './rpc.js';
import {toKoa} from '@smogon/rpc-server'

import {init} from './session.js';

program.option('--cmsdb <connection string>', 'Database connection string');
program.option('--identitydb <connection string>', 'Database connection string');
program.parse(process.argv);

init(new identity.Session(JSON.parse(program.identitydb)),
     new cms.Session(JSON.parse(program.cmsdb)));

let app = new Koa();
app.use(mount('/_rpc', toKoa(HANDLERS)));

let server = http.createServer(app.callback());

process.on('message', (msg, h) => {
    if (msg === 'connection') {
        server.emit('connection', h);
    }
});
