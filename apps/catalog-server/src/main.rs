use moqtail::model::catalog::warp_catalog;

use axum::{
  Json, Router,
  extract::{Path, State},
  http::StatusCode,
  response::IntoResponse,
  routing::get,
};
use bb8::Pool;
use bb8_redis::{RedisConnectionManager, bb8};
use dotenvy::dotenv;
use redis::AsyncCommands;
use std::net::SocketAddr;

#[tokio::main]
async fn main() {
  dotenv().ok();
  let redis_url = std::env::var("REDIS_URL").expect("REDIS_URL not set");
  let port: u16 = std::env::var("PORT")
    .expect("PORT not set")
    .parse()
    .expect("PORT must be a valid number");

  let manager = RedisConnectionManager::new(redis_url).unwrap();
  let pool = Pool::builder().build(manager).await.unwrap();

  let app = Router::new()
    .route("/catalog/{id}", get(get_catalog).post(save_catalog))
    .with_state(pool);

  let addr = SocketAddr::from(([127, 0, 0, 1], port));
  println!("listening on http://{addr}");

  axum::serve(tokio::net::TcpListener::bind(addr).await.unwrap(), app)
    .await
    .unwrap();
}

async fn get_catalog(
  Path(id): Path<String>,
  State(pool): State<Pool<RedisConnectionManager>>,
) -> impl IntoResponse {
  let key = format!("catalog:{id}");

  let mut conn = match pool.get().await {
    Ok(conn) => conn,
    Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
  };

  let value: Option<String> = match conn.get(&key).await {
    Ok(val) => val,
    Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
  };

  let value = match value {
    Some(v) => v,
    None => return StatusCode::NOT_FOUND.into_response(),
  };

  match serde_json::from_str::<warp_catalog::Catalog>(&value) {
    Ok(catalog) => Json(catalog).into_response(),
    Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
  }
}

pub async fn save_catalog(
  Path(id): Path<String>,
  State(pool): State<Pool<RedisConnectionManager>>,
  Json(payload): Json<warp_catalog::Catalog>,
) -> impl IntoResponse {
  let key = format!("catalog:{id}");

  let mut conn = match pool.get().await {
    Ok(c) => c,
    Err(_) => return StatusCode::INTERNAL_SERVER_ERROR,
  };

  let value = match serde_json::to_string(&payload) {
    Ok(v) => v,
    Err(_) => return StatusCode::INTERNAL_SERVER_ERROR,
  };

  let set_result: redis::RedisResult<()> = conn.set(&key, value).await;
  match set_result {
    Ok(_) => StatusCode::OK,
    Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
  }
}
