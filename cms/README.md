
`sudo docker run -p 5432:5432 --name cms-test -e POSTGRES_PASSWORD=test -d postgres:11`

`sudo docker {start,stop} cms-test`

`psql -U postgres -h localhost -p 5432`

or

`ssh <user>@smogon.com -nNT -L <port or unix socket path>:/var/run/postgresql/.s.PGSQL.5432`
