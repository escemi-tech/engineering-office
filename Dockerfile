FROM ghcr.io/hoverkraft-tech/docker-base-images/super-linter:2.0.0@sha256:a37519f1afdc1c239254fe3d9a3e76ee9f114990f09bba123c96b1737737d43e

HEALTHCHECK --interval=5m --timeout=10s CMD ["/bin/sh", "-c", "test -d /github/home"]

ARG UID=1000
ARG GID=1000
USER ${UID}:${GID}
