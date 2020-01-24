
Build
=====

`yarn build`

DB
==

If you're an admin and want to test against the Smogon DB, SSH forward the unix socket

`ssh <user>@smogon.com -nNT -L <port or unix socket path>:/var/run/mysqld/mysqld.sock`

Can connect to it with

`mysql -u <user> --socket <path>`

CLI usage
=========

`identitytool --db <connection string> lookup <user_id>`
`identitytool --db <connection string> verify <remember token>`

Connection string looks something like `'{"user":...,"socketPath":...}'`
