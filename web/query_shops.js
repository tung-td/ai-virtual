import Database from "better-sqlite3";
const db = new Database("database.sqlite");
const shops = db.prepare("SELECT * FROM shops").all();
console.log(JSON.stringify(shops, null, 2));
db.close();
