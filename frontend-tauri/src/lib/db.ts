import Database from "@tauri-apps/plugin-sql";

let dbPromise: Promise<Database> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:qwen-local.db");
  }
  return dbPromise;
}

export type Session = {
  id: string;
  title: string;
  created_at: number;
};

export type StoredMessage = {
  id: number;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: number;
};

export type Memory = {
  id: number;
  content: string;
  created_at: number;
};

export async function listSessions(): Promise<Session[]> {
  const db = await getDb();
  return db.select<Session[]>("SELECT * FROM sessions ORDER BY created_at DESC");
}

export async function createSession(title: string): Promise<Session> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const created_at = Date.now();
  await db.execute("INSERT INTO sessions (id, title, created_at) VALUES ($1, $2, $3)", [
    id,
    title,
    created_at,
  ]);
  return { id, title, created_at };
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM messages WHERE session_id = $1", [id]);
  await db.execute("DELETE FROM sessions WHERE id = $1", [id]);
}

export async function listMessages(sessionId: string): Promise<StoredMessage[]> {
  const db = await getDb();
  return db.select<StoredMessage[]>(
    "SELECT * FROM messages WHERE session_id = $1 ORDER BY id ASC",
    [sessionId],
  );
}

export async function addMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO messages (session_id, role, content, created_at) VALUES ($1, $2, $3, $4)",
    [sessionId, role, content, Date.now()],
  );
}

export async function listMemories(): Promise<Memory[]> {
  const db = await getDb();
  return db.select<Memory[]>("SELECT * FROM memories ORDER BY created_at ASC");
}

export async function addMemory(content: string): Promise<void> {
  const db = await getDb();
  await db.execute("INSERT INTO memories (content, created_at) VALUES ($1, $2)", [
    content,
    Date.now(),
  ]);
}

export async function deleteMemory(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM memories WHERE id = $1", [id]);
}
