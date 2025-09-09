use moqtail::model::data::object::Object;
use std::path::Path;
use tokio::fs::OpenOptions;
use tokio::io::AsyncWriteExt;
use tracing::error;

/// Object logger for tracking object properties in MoQ relay
#[derive(Debug, Clone)]
pub struct ObjectLogger {
  log_folder: String,
}

impl ObjectLogger {
  /// Create a new ObjectLogger instance
  pub fn new(log_folder: String) -> Self {
    Self { log_folder }
  }

  /// Log object properties for subscription-level logging
  /// Filename format: <track_alias>_<subscriber_connection_id>.log
  /// Fields: group_id, subgroup_id, object_id, payload_size, object_received_time
  pub async fn log_subscription_object(
    &self,
    track_alias: u64,
    subscriber_connection_id: usize,
    object: &Object,
    object_received_time: u128,
  ) {
    let group_id = object.location.group;
    let object_id = object.location.object;
    let subgroup_id = object.subgroup_id.unwrap_or(0);
    let payload_size = object.payload.as_ref().map(|p| p.len()).unwrap_or(0);

    let log_filename = format!("{}_{}.log", track_alias, subscriber_connection_id);

    let log_entry = format!(
      "{},{},{},{},{}\n",
      group_id, subgroup_id, object_id, payload_size, object_received_time
    );

    self.write_log_entry(&log_filename, &log_entry).await;
  }

  /// Log object properties for track-level logging
  /// Filename format: <track_alias>.log
  /// Fields: group_id, subgroup_id, object_id, payload_len, object_received_time
  pub async fn log_track_object(
    &self,
    track_alias: u64,
    object: &Object,
    object_received_time: u128,
  ) {
    let group_id = object.location.group;
    let object_id = object.location.object;
    let subgroup_id = object.subgroup_id.unwrap_or(0);
    let payload_len = object.payload.as_ref().map(|p| p.len()).unwrap_or(0);

    let log_filename = format!("{}.log", track_alias);

    let log_entry = format!(
      "{},{},{},{},{}\n",
      group_id, subgroup_id, object_id, payload_len, object_received_time
    );

    self.write_log_entry(&log_filename, &log_entry).await;
  }

  /// Helper function to write log entries to files
  async fn write_log_entry(&self, log_filename: &str, log_entry: &str) {
    let log_path = Path::new(&self.log_folder).join(log_filename);

    // Create logs directory if it doesn't exist
    if let Err(e) = tokio::fs::create_dir_all(&self.log_folder).await {
      error!(
        "Failed to create log directory {}: {:?}",
        self.log_folder, e
      );
      return;
    }

    // Append to log file
    match OpenOptions::new()
      .create(true)
      .append(true)
      .open(&log_path)
      .await
    {
      Ok(mut file) => {
        if let Err(e) = file.write_all(log_entry.as_bytes()).await {
          error!("Failed to write to log file {:?}: {:?}", log_path, e);
        }
      }
      Err(e) => {
        error!("Failed to open log file {:?}: {:?}", log_path, e);
      }
    }
  }
}
