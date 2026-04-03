use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqlitePool;
use sqlx::{FromRow, Row};

#[derive(Serialize, Deserialize, Debug, Clone, FromRow)]
pub struct CanonEntry {
    pub id: String,
    pub content: String,
    pub tags: String, // Stored as JSON string in SQLite
    pub trust_tier: i64, // SQLite uses i64 for integers
}

pub struct Vault {
    pool: SqlitePool,
}

impl Vault {
    pub async fn new(db_url: &str) -> anyhow::Result<Self> {
        let pool = SqlitePool::connect(db_url).await?;

        // Initialize tables and FTS5 index
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS canon (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                tags TEXT,
                trust_tier INTEGER NOT NULL
            )",
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            "CREATE VIRTUAL TABLE IF NOT EXISTS canon_fts USING fts5(
                content,
                content='canon',
                content_rowid='rowid'
            )",
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS beads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                summary TEXT NOT NULL,
                project TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                session_id TEXT
            )",
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            "CREATE VIRTUAL TABLE IF NOT EXISTS beads_fts USING fts5(
                summary,
                content='beads',
                content_rowid='id'
            )",
        )
        .execute(&pool)
        .await?;

        // Triggers to keep FTS index in sync
        let triggers = [
            "CREATE TRIGGER IF NOT EXISTS canon_ai AFTER INSERT ON canon BEGIN
                INSERT INTO canon_fts(rowid, content) VALUES (new.rowid, new.content);
            END;",
            "CREATE TRIGGER IF NOT EXISTS canon_ad AFTER DELETE ON canon BEGIN
                INSERT INTO canon_fts(canon_fts, rowid, content) VALUES('delete', old.rowid, old.content);
            END;",
            "CREATE TRIGGER IF NOT EXISTS canon_au AFTER UPDATE ON canon BEGIN
                INSERT INTO canon_fts(canon_fts, rowid, content) VALUES('delete', old.rowid, old.content);
                INSERT INTO canon_fts(rowid, content) VALUES (new.rowid, new.content);
            END;",
            "CREATE TRIGGER IF NOT EXISTS beads_ai AFTER INSERT ON beads BEGIN
                INSERT INTO beads_fts(rowid, summary) VALUES (new.id, new.summary);
            END;",
        ];

        for trigger in triggers {
            sqlx::query(trigger).execute(&pool).await?;
        }

        Ok(Self { pool })
    }

    pub async fn insert_entry(&self, entry: &CanonEntry) -> anyhow::Result<()> {
        sqlx::query(
            "INSERT OR REPLACE INTO canon (id, content, tags, trust_tier) VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(&entry.id)
        .bind(&entry.content)
        .bind(&entry.tags)
        .bind(entry.trust_tier)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn remember(&self, content: &str, tags: &str) -> anyhow::Result<()> {
        let id = format!("memory-{}", uuid::Uuid::new_v4());
        let entry = CanonEntry {
            id,
            content: content.to_string(),
            tags: tags.to_string(),
            trust_tier: 1, // Tier 1 is Enduring Memory
        };
        self.insert_entry(&entry).await?;
        Ok(())
    }

    pub async fn get_reflections(&self) -> anyhow::Result<Vec<CanonEntry>> {
        let results = sqlx::query_as::<_, CanonEntry>(
            "SELECT id, content, tags, trust_tier FROM canon WHERE trust_tier = 3"
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(results)
    }

    pub async fn promote_reflection(&self, id: &str, new_tier: i64) -> anyhow::Result<()> {
        sqlx::query("UPDATE canon SET trust_tier = ?1 WHERE id = ?2 AND trust_tier = 3")
            .bind(new_tier)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn forget(&self, id: &str) -> anyhow::Result<()> {
        sqlx::query("DELETE FROM canon WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn search(&self, query: &str) -> anyhow::Result<Vec<CanonEntry>> {
        let results = sqlx::query_as::<_, CanonEntry>(
            "SELECT c.id, c.content, c.tags, c.trust_tier 
             FROM canon c
             JOIN canon_fts f ON c.rowid = f.rowid
             WHERE f.canon_fts MATCH ?1
             ORDER BY f.rank"
        )
        .bind(query)
        .fetch_all(&self.pool)
        .await?;

        Ok(results)
    }

    pub async fn list_all(&self) -> anyhow::Result<Vec<CanonEntry>> {
        let results = sqlx::query_as::<_, CanonEntry>(
            "SELECT id, content, tags, trust_tier FROM canon"
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(results)
    }
}
