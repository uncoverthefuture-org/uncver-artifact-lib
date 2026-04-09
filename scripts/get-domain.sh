#!/bin/bash
# Get ngrok domain based on machine fingerprint
# Usage: ./scripts/get-domain.sh

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
if command -v sha256sum &> /dev/null; then
    FINGERPRINT=$(echo -n "${MACHINE_ID}${USER_NAME}${DEVICE_TYPE}" | sha256sum | cut -c1-16)
elif command -v shasum &> /dev/null; then
    # macOS
    FINGERPRINT=$(echo -n "${MACHINE_ID}${USER_NAME}${DEVICE_TYPE}" | shasum -a 256 | cut -c1-16)
else
    echo "Error: No sha256sum or shasum found"
    exit 1
fi

# Generate subdomain (8 chars for readability)
SUBDOMAIN=$(echo "$FINGERPRINT" | cut -c1-8)

# Export for ngrok
DOMAIN="${SUBDOMAIN}.${DEVICE_TYPE}.ngrok.io"

echo "Machine Fingerprint: $FINGERPRINT"
echo "NGROK Subdomain: $SUBDOMAIN"
echo "Domain: $DOMAIN"
echo ""
echo "Set this in GitHub:"
echo "  LOCAL_WEBSOCKET_URL=https://${DOMAIN}/notify"

# Write to file for other services
mkdir -p .uncver
echo "$DOMAIN" > .uncver/ngrok-domain
echo "$SUBDOMAIN" > .uncver/ngrok-subdomain
echo "$FINGERPRINT" > .uncver/machine-fingerprint
