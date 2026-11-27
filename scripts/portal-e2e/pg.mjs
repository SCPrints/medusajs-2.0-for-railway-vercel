// Throwaway Postgres on :54329 (data in ./pgdata, safe to delete).
import EmbeddedPostgres from "embedded-postgres"
import fs from "fs"
const dir = new URL("./pgdata", import.meta.url).pathname
const pg = new EmbeddedPostgres({ databaseDir: dir, user: "medusa", password: "medusa", port: 54329, persistent: true })
if (!fs.existsSync(`${dir}/PG_VERSION`)) await pg.initialise()
await pg.start()
console.log("started")
setInterval(() => {}, 1 << 30) // keep the process (and Postgres) alive until run.sh stops it
