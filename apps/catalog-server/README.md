## Dependencies

- Docker (for running Redis in a container)
- Rust (make sure `cargo` is installed)

---

## Running the Catalog Server

1. **Start Redis**: Launch a Redis container locally:

```bash
docker run -d --name redis -p 127.0.0.1:6379:6379 redis
```

2. **Run the Server**: Start the `moq-catalog` server using Cargo:

```bash
cargo run
```

---

## Note

Make sure to rename `.env.example` to `.env` before running the server.

---

## Usage(local)

To test locally, send a `GET` or `POST` request to:

```
http://127.0.0.1:3000/catalog/<id>
```

- A `GET` request will return the catalog as JSON.
- A `POST` request should include a JSON body conforming to the WARP Streaming Format draft, section 4 (https://datatracker.ietf.org/doc/html/draft-ietf-moq-warp-00#section-4).

### Example Catalog

```json
{
  "version": 1,
  "supports_delta_updates": true,
  "tracks": [
    {
      "name": "hd",
      "render_group": 1,
      "packaging": "loc",
      "codec": "av01"
    },
    {
      "name": "audio",
      "render_group": 1,
      "packaging": "loc",
      "codec": "opus"
    }
  ]
}
```
