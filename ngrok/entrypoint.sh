#!/bin/bash

# Generate machine fingerprint for consistent ngrok domain

DEVICE_TYPE=${DEVICE_TYPE:-pc}

# Get machine ID (works on Linux, macOS, Windows WSL)
if [ -f /etc/machine-id ]; then
    MACHINE_ID=$(cat /etc/machine-id)
elif [ -f /var/lib/dbus/machine-id ]; then
    MACHINE_ID=$(cat /var/lib/dbus/machine-id)
elif command -v ioreg &> /dev/null; then
    # macOS
    MACHINE_ID=$(ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID | awk -F'"' '{print $4}')
elif [ -f /proc/sys/kernel/random/boot_id ]; then
    MACHINE_ID=$(cat /proc/sys/kernel/random/boot_id)
else
    # Fallback to hostname + username
    MACHINE_ID="$(hostname)$(whoami)"
fi

# Get username
USER_NAME=${USER:-$(whoami)}

# Create fingerprint
FINGERPRINT=$(echo -n "${MACHINE_ID}${USER_NAME}${DEVICE_TYPE}" | sha256sum | cut -c1-16)

# Generate subdomain (8 chars for readability)
SUBDOMAIN=$(echo "$FINGERPRINT" | cut -c1-8)

# Export for ngrok
export NGROK_SUBDOMAIN="${SUBDOMAIN}"
export NGROK_DOMAIN="${SUBDOMAIN}.${DEVICE_TYPE}.ngrok.io"

echo "Machine Fingerprint: $FINGERPRINT"
echo "NGROK Subdomain: $SUBDOMAIN"
echo "Domain: $NGROK_DOMAIN"

# Write to file for other services
echo "$NGROK_DOMAIN" > /tmp/ngrok-domain.txt
echo "$SUBDOMAIN" > /tmp/ngrok-subdomain.txt
echo "$FINGERPRINT" > /tmp/machine-fingerprint.txt

# Start ngrok with subdomain
exec ngrok http --subdomain="$SUBDOMAIN" "$@"
