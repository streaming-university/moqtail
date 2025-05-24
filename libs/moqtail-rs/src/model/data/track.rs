use std::collections::BTreeMap;

use super::{constant::ObjectForwardingPreference, full_track_name::FullTrackName, group::Group};

#[derive(Debug, Clone, PartialEq)]
pub struct Track {
  pub full_track_name: FullTrackName,
  pub groups: BTreeMap<u64, Group>,
  pub forwarding_preference: ObjectForwardingPreference,
}
