import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const {PGlite}=await import(process.argv[2]?pathToFileURL(process.argv[2]).href:'@electric-sql/pglite');
const db=new PGlite();
try{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.profiles(id uuid primary key,coins bigint);
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    grant all on public.profiles to service_role;`);
  const sql=await readFile(new URL('../backend/sql/custom_characters.sql',import.meta.url),'utf8');
  await db.exec(sql);await db.exec(sql); // Migration can be rerun safely.
  const user='4a8612fe-b48f-4151-b345-caa4a13a5a81';
  const jobs=[1,2,3,4,5,6].map(n=>`00000000-0000-4000-8000-00000000000${n}`);
  await db.query('insert into public.profiles values($1,1200)',[user]);
  const balance=async()=>(await db.query('select coins from public.profiles where id=$1',[user])).rows[0].coins;
  const start=(job,cost=500)=>db.query('select public.begin_character_generation($1,$2,$3)',[user,job,cost]);
  const fail=(job)=>db.query("select public.fail_character_generation($1,'test failure')",[job]);
  const finish=(job)=>db.query('select public.finish_character_generation($1,$2,$3)',[job,`${user}/${job}/sheet.png`,`${user}/${job}/portrait.png`]);
  await assert.rejects(()=>start(jobs[0],2000),/Not enough coins/);assert.equal(Number(await balance()),1200);
  await start(jobs[0]);assert.equal(Number(await balance()),700);
  await assert.rejects(()=>start(jobs[1]),/already being generated/);
  await finish(jobs[0]);await finish(jobs[0]);await fail(jobs[0]);
  assert.equal(Number(await balance()),700,'Completed requests cannot be refunded or charged twice');
  await start(jobs[1]);assert.equal(Number(await balance()),200);
  await fail(jobs[1]);await fail(jobs[1]);assert.equal(Number(await balance()),700,'Failure refunds exactly once');
  await assert.rejects(()=>finish(jobs[1]),/expired/);
  assert.equal((await db.query('select version from public.custom_characters')).rows[0].version,jobs[0],'Failed replacement preserves current character');
  await start(jobs[2]);await finish(jobs[2]);
  assert.equal(Number(await balance()),200);
  assert.equal((await db.query('select count(*) from public.custom_characters')).rows[0].count,1,'Only one active custom character');
  const cleanup=(await db.query('select cleanup_paths from public.character_generation_jobs where id=$1',[jobs[2]])).rows[0].cleanup_paths;
  assert.deepEqual(cleanup,[`${user}/${jobs[0]}/sheet.png`,`${user}/${jobs[0]}/portrait.png`]);
  await db.exec('update public.profiles set coins=1000');
  // Apply the incremental patch as an existing installation would, twice for idempotency.
  const patch=await readFile(new URL('../backend/sql/disable_character_hourly_limit.sql',import.meta.url),'utf8');
  await db.exec(patch);await db.exec(patch);
  await start(jobs[3]);await fail(jobs[3]);assert.equal(Number(await balance()),1000);
  await start(jobs[4]);await fail(jobs[4]);
  await start(jobs[5]);await fail(jobs[5]);
  assert.equal(Number(await balance()),1000,'More than three same-hour attempts work without losing refunded coins');
  const permissions=await db.query(`select
    has_function_privilege('authenticated','public.begin_character_generation(uuid,uuid,integer)','EXECUTE') as client_spend,
    has_function_privilege('anon','public.fail_character_generation(uuid,text)','EXECUTE') as client_refund,
    has_function_privilege('service_role','public.finish_character_generation(uuid,text,text)','EXECUTE') as server_finish,
    has_table_privilege('authenticated','public.custom_characters','INSERT') as client_insert`);
  assert.deepEqual(permissions.rows[0],{client_spend:false,client_refund:false,server_finish:true,client_insert:false});
  console.log('Passed SQL migration and hourly-limit patch, 6 same-hour attempts, coin reservation, concurrent-job guard, idempotent refunds, replacement cleanup and server-only permissions.');
}finally{await db.close();}
