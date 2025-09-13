FROM postgres:16

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        gnupg wget ca-certificates \
    && echo "deb http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        postgresql-16-postgis-3 \
        postgresql-16-postgis-3-scripts \
        postgresql-16-pgvector \
    && rm -rf /var/lib/apt/lists/*

