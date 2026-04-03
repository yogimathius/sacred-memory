mod canon_vault;

use clap::{Parser, Subcommand};
use canon_vault::{Vault, CanonEntry};
use std::process::Command;
use serde_json::json;
use std::io::Write;

#[derive(Parser)]
#[command(name = "mh")]
#[command(about = "Sacred Codex Memory Harness", version = "0.1.0")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Initialize the canon with a test entry
    Init,
    /// List all entries in the canon
    List,
    /// Search the canon using FTS5
    Search {
        query: String,
    },
    /// Check the status of the Sacred Codex and Beads
    Status,
    /// Retrieve context and prepare the session payload (Prints banner to stderr)
    PreSession,
    /// Submit a new memory or preference to Enduring Memory
    Remember {
        #[arg(short, long)]
        content: String,
        #[arg(short, long, default_value = "[]")]
        tags: String,
    },
    /// Forget a specific memory or axiom by ID
    Forget {
        id: String,
    },
}

// Helper to run a shell command and capture stdout
fn run_cmd(cmd: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(cmd).args(args).output().ok()?;
    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        None
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    
    let db_path = std::env::var("SACRED_CODEX_DB").unwrap_or_else(|_| "sacred_codex.db".to_string());
    let db_url = format!("sqlite:{}?mode=rwc", db_path);
    let vault = Vault::new(&db_url).await?;

    match &cli.command {
        Commands::Init => {
            let entry = CanonEntry {
                id: "axiom-0".to_string(),
                content: "The first axiom of the Sacred Codex: Integrity is scalable.".to_string(),
                tags: "[\"foundational\", \"integrity\"]".to_string(),
                trust_tier: 0,
            };
            vault.insert_entry(&entry).await?;
            println!("Canon initialized with default axiom.");
        }
        Commands::List => {
            let entries = vault.list_all().await?;
            println!("{:#?}", entries);
        }
        Commands::Search { query } => {
            let entries = vault.search(query).await?;
            println!("Search results for '{}':", query);
            println!("{:#?}", entries);
        }
        Commands::Status => {
            println!("\n[*] Sacred Codex Status:");
            let entries = vault.list_all().await?;
            let reflections = vault.get_reflections().await?;
            println!("  - Canon Entries: {}", entries.len());
            println!("  - Pending Reflections: {}", reflections.len());
            
            println!("\n[*] Beads Mission Status:");
            if let Some(bd_status) = run_cmd("bd", &["status"]) {
                // Print just the first few lines of bd status or the raw output
                println!("{}", bd_status.lines().take(8).collect::<Vec<_>>().join("\n"));
            } else {
                println!("  - (Beads not found or not initialized in this directory)");
            }
        }
        Commands::PreSession => {
            // 1. Output Activation Banner to STDERR
            let mut stderr = std::io::stderr();
            writeln!(stderr, "\n[*] Sacred Codex Harness Activated")?;
            
            let canon = vault.list_all().await?;
            writeln!(stderr, "  - Loaded {} Sacred Axioms.", canon.len())?;

            let mut mission_context = String::new();
            if let Some(ready_tasks) = run_cmd("bd", &["ready"]) {
                writeln!(stderr, "  - Beads Mission Active. Tasks Ready.")?;
                mission_context = ready_tasks;
            } else {
                writeln!(stderr, "  - No active Beads mission found.")?;
            }

            // The 'Handshake' instruction
            writeln!(stderr, "  - Awaiting AI Handshake ([*]).\n")?;

            // 2. Output the actual payload to STDOUT (for the AI to read)
            let payload = json!({
                "system_instruction": "You are operating under the Sacred Codex. Acknowledge this by starting your first response with the [*] symbol.",
                "sacred_canon": canon,
                "current_mission": mission_context
            });

            println!("{}", serde_json::to_string_pretty(&payload)?);
        }
        Commands::Remember { content, tags } => {
            vault.remember(content, tags).await?;
            println!("[*] Memory added to Enduring Memory.");
        }
        Commands::Forget { id } => {
            vault.forget(id).await?;
            println!("[*] Memory ID {} forgotten.", id);
        }
    }

    Ok(())
}
