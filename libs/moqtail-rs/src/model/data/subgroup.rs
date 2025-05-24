use std::collections::BTreeMap;

use super::{full_track_name::FullTrackName, object::Object};
#[derive(Debug, Clone, PartialEq)]
pub struct Subgroup {
  pub full_track_name: FullTrackName,
  pub group_id: u64,
  pub subgroup_id: u64,
  pub objects: BTreeMap<u64, Object>,
}
