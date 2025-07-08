# Local Certificate Setup for WebTransport

## Quick Setup

1. **Install mkcert**:

- Follow the [official mkcert installation instructions](https://github.com/FiloSottile/mkcert#installation)

Sample script:

```bash
# Install local CA
mkcert -install

# Run from `apps/relay/cert` or manually move the *.pem under `cert/`
mkcert -key-file key.pem -cert-file cert.pem localhost 127.0.0.1 ::1
```

2. **Enable browser to trust private CAs**:

- Chrome:
  - Navigate to `chrome://flags/#webtransport-developer-mode`
  - Enable `WebTransport Developer Mode`
  - Restart Chrome

> [!NOTE]
> Instructions for Firefox and Edge are pending. Currently only Chrome is fully tested.
> If you successfully configure these browsers, please consider contributing the steps!

---

Certificates should be placed next to this README as `cert.pem` and `key.pem`
