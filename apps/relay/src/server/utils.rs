use bytes::Bytes;
use moqtail::{
  model::control::control_message::ControlMessageTrait, transport::data_stream_handler::HeaderInfo,
};

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

pub fn build_header_id(header: &HeaderInfo) -> String {
  match header {
    HeaderInfo::Fetch {
      header,
      fetch_request: _,
    } => {
      format!("fetch_{}", header.request_id)
    }
    HeaderInfo::Subgroup { header } => {
      format!(
        "subgroup_{}_{}",
        header.group_id,
        header.subgroup_id.unwrap_or(0)
      )
    }
  }
}
