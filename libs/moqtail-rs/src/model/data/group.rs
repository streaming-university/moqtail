use super::full_track_name::FullTrackName;
use super::object::Object;
use super::subgroup::Subgroup;
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq)]
pub enum GroupContent {
  Subgroups(BTreeMap<u64, Subgroup>),
  Objects(BTreeMap<u64, Object>),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Group {
  pub full_track_name: FullTrackName,
  pub group_id: u64,
  pub content: GroupContent,
}
