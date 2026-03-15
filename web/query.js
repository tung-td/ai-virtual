import Database from "better-sqlite3";
const db = new Database("database.sqlite");
const jobs = db
  .prepare("SELECT * FROM tryon_jobs ORDER BY created_at DESC LIMIT 5")
  .all();
console.log(JSON.stringify(jobs, null, 2));
db.close();
