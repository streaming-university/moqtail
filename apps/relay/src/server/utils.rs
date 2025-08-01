use bytes::Bytes;
use moqtail::{
  model::control::control_message::ControlMessageTrait, transport::data_stream_handler::HeaderInfo,
};
use once_cell::sync::Lazy;
use std::time::Instant;

// Static reference time: set when the program starts
pub static BASE_TIME: Lazy<Instant> = Lazy::new(Instant::now);

pub fn print_msg_bytes(msg: &impl ControlMessageTrait) {
  let bytes = msg.serialize();
  print_bytes(bytes.as_ref().unwrap());
}

pub fn print_bytes(buffer: &Bytes) {
  for byte in buffer.iter() {
    print!("{byte:02X} ");
  }
  println!();
}

pub fn build_stream_id(track_alias: u64, header: &HeaderInfo) -> String {
  match header {
    HeaderInfo::Fetch {
      header,
      fetch_request: _,
    } => {
      format!("fetch_{}_{}", track_alias, header.request_id)
    }
    HeaderInfo::Subgroup { header } => {
      format!(
        "subgroup_{}_{}_{}",
        track_alias,
        header.group_id,
        header.subgroup_id.unwrap_or(0)
      )
    }
  }
}
