# Cloudflare R2 with presigned uploads and per-Student gift-able Budget

Student assets (Portrait, Work Media) live in **Cloudflare R2**, uploaded directly from the browser via presigned PUTs — the Hono server is never in the file-bytes path. Each Student gets a default per-account **Budget** carved from the displayed 8 GB Pool (10 GB physical R2 quota, 2 GB hidden buffer); Students may transfer Budget to each other peer-to-peer down to a 20 MB floor.

## Why this shape

- **R2 over S3 / Vercel Blob / local disk.** R2 has zero egress fees, which matters because Stage clients will pull the same assets repeatedly during a show. S3 was rejected on egress cost; local disk on the server was rejected because it doesn't survive container restarts on a typical hosting target and doesn't scale across instances; Vercel Blob would have tied infra to a vendor not otherwise in the stack.
- **Browser-presigned PUTs over server-proxied uploads.** Keeps the server thin and avoids any worker timeout / memory pressure from a 50 MB video upload.
- **Budget gifting as a social mechanic, not a quota fence.** The peer-to-peer transfer is a deliberate cohort behaviour for a graduation show — students with a 30s video clip can donate space to a peer building a richer media piece. The mechanic is the point; it is not a workaround for sizing the Pool wrong.
- **8 GB displayed vs 10 GB physical** keeps a hidden 2 GB safety buffer for image-resize overhead and the deferred Receipt Printer use case.

## Consequences

- R2 API credentials and an R2 bucket are operational dependencies. Loss of R2 access = no asset display = empty show.
- The Pool size, default Budget, and 20 MB floor are domain constants. Changing them retroactively after Students have transferred Budget requires careful migration to avoid Students dropping below their used storage.
- The Budget Gifting UI is part of the Student-facing experience, not an admin nicety. Cutting it for "v1 simplicity" would change the character of the product — the social mechanic is in scope.
