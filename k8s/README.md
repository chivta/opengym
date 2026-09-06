# Cluster deployment

These manifests run openGym at https://opengym.chivtar.dev on a k3s cluster driven by Flux
from `github.com/chivta/homelab`. Nothing here is applied by hand — Flux reconciles `./k8s`
from `main` every minute. Self-hosters want `docker-compose.yml` and `docs/SELF_HOSTING.md`
instead; this directory is one specific deployment, not the supported way to run openGym.

## Shape

| | |
|---|---|
| `api` | `ghcr.io/chivta/opengym-api`, one replica, `/data` on a 1 Gi ReadWriteOnce volume |
| `web` | `ghcr.io/chivta/opengym-web`, nginx on 8080 as uid 101, exercise media on a second volume |
| `ingress` | Traefik splits one host: `/api` → api:3000, everything else → web:80 |
| `middleware` | `ipAllowList` on 10.10.0.0/24, so only the headscale tailnet can reach it |

The compose stack puts nginx in front of the API so the whole app shares one origin, which
WebAuthn requires. Here the Ingress does that split instead, so nginx's `/api` proxy block
is never reached — which is just as well, since its `resolver 127.0.0.11` is Docker's
embedded DNS and would not resolve anything in a cluster.

## Tailnet only

The DNS record for `opengym.chivtar.dev` is an A record pointing at `10.10.0.1`, the
node's tailnet address, DNS-only rather than proxied. That handles routing, not access:
Traefik is a k3s ServiceLB and binds the node's ports on every interface, so a request
that finds the origin address and sets the right Host header would be served whatever DNS
says. `middleware.yaml` is what actually refuses it.

`RP_ID` does not change either way, so this can be reversed to a public record later
without invalidating a passkey. What it costs is a phone that is off the tailnet: push
notifications still arrive, but tapping one opens a page that cannot load.

Exercise media (~140 MB) is fetched by the `media` initContainer on the web pod, the same
job the compose `media` service does, and kept on a volume so a restart is not a re-download.

## No secrets

There is no `secrets.enc.yaml` and no SOPS here. openGym has nothing to hand the cluster:
the HMAC session secret and the VAPID keypair are generated into the data volume on first
boot, and everything else is plain configuration. Both GHCR packages are public, so there is
no `ghcr-secret` either.

If that changes — a Coach provider key, a private registry — add `k8s/secrets.enc.yaml`,
a `.sops.yaml` with the shared app recipient, and a `decryption` block on the Flux
Kustomization in homelab.

## Images

`.github/workflows/cd.yaml` builds the full-SHA tag and pins it into `kustomization.yaml`
with a `deploy:` commit. It runs after the Tests workflow, amd64 only, and builds only the
component whose paths changed since the SHA already pinned.

`docker-publish.yml` is untouched by all of this: it still publishes the multi-arch
`:latest` and `:vX.Y.Z` tags self-hosters pull, from pushes and from releases.

## Locking the instance down after the first sign-in

The api deploys with open signup and `ALLOW_GUEST=0`, because an admin can only be named
after somebody has registered a passkey, and `INVITE_ONLY=1` with no admin locks everyone
out. Once you have registered:

1. Read your uid out of the data volume: `kubectl -n opengym exec deploy/api -- sh -c 'cat /data/db.json'`, field `users[].id`. (That is a write verb the read-only kubeconfig does not have — run it with an admin kubeconfig, or read it off the node.)
2. Add to `k8s/api/deployment.yaml`:

   ```yaml
   - name: ADMIN_UIDS
     value: <your uid>
   - name: INVITE_ONLY
     value: "1"
   ```

3. Commit and push. Flux rolls the pod inside a minute; invite codes come from
   Settings → Admin after that.

## Backups

`opengym-data` is the whole instance — users, passkey credentials, workouts, the session
secret. `opengym-media` is a copy of a public dataset and needs no backup.
