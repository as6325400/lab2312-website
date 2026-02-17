#!/bin/sh
# If the volume mount has no Caddyfile yet, copy the default template
if [ ! -f /etc/caddy/Caddyfile ]; then
  cp /defaults/Caddyfile /etc/caddy/Caddyfile
  echo "Copied default Caddyfile to /etc/caddy/"
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
