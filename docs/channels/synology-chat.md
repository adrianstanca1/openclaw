---
summary: "Synology Chat channel setup, configuration, and troubleshooting"
read_when:
  - Setting up Synology Chat integration
  - Configuring webhooks for Synology NAS
  - Debugging Synology Chat messages
title: "Synology Chat"
---

# Synology Chat (Webhook)

Status: production-ready for DM conversations via outgoing webhooks. The Synology Chat extension connects your Synology NAS Chat application to OpenClaw using standard webhook integration.

<CardGroup cols={3}>
  <Card title="Pairing" icon="link" href="/channels/pairing">
    Default DM policy is allowlist for security.
  </Card>
  <Card title="Channel troubleshooting" icon="wrench" href="/channels/troubleshooting">
    Cross-channel diagnostics and repair playbooks.
  </Card>
  <Card title="Gateway configuration" icon="settings" href="/gateway/configuration">
    Full channel config patterns and examples.
  </Card>
</CardGroup>

## Quick setup

<Steps>
  <Step title="Enable outgoing webhook in Synology Chat">
    Open Synology Chat Admin panel, go to **Integration** > **Outgoing Webhook**.

    Create a new webhook with:
    - **URL**: `http://<your-openclaw-host>:<port>/webhook/synology`
    - **Trigger**: Choose specific keywords or "All messages"
    - **Token**: Generate a secure random token (save this for config)

  </Step>

  <Step title="Configure OpenClaw">

```json5
{
  channels: {
    "synology-chat": {
      enabled: true,
      token: "your-webhook-token-here",
      incomingUrl: "http://<nas-host>:<port>/webapi/entry.cgi?api=SYNO.Chat.External&method=chatbot&version=2",
      nasHost: "192.168.1.100", // Your NAS IP
      dmPolicy: "allowlist",
      allowedUserIds: ["1", "2", "3"], // Synology user IDs to allow
      rateLimitPerMinute: 30,
      allowInsecureSsl: false, // Set true only for self-signed certs
    },
  },
}
```

    Environment fallbacks:
    - `SYNOLOGY_CHAT_TOKEN` - webhook validation token
    - `SYNOLOGY_CHAT_INCOMING_URL` - bot reply endpoint
    - `SYNOLOGY_NAS_HOST` - NAS hostname/IP
    - `SYNOLOGY_ALLOWED_USER_IDS` - comma-separated user IDs
    - `SYNOLOGY_RATE_LIMIT` - requests per minute

  </Step>

  <Step title="Start gateway and approve pairing">

```bash
openclaw gateway
openclaw pairing list synology-chat
openclaw pairing approve synology-chat <CODE>
```

    Pairing codes expire after 1 hour.

  </Step>
</Steps>

## Configuration reference

### Base options

| Option               | Type     | Default               | Description                              |
| -------------------- | -------- | --------------------- | ---------------------------------------- |
| `enabled`            | boolean  | `true`                | Enable/disable the channel               |
| `token`              | string   | required              | Webhook validation token (shared secret) |
| `incomingUrl`        | string   | required              | Synology Chat Bot API URL for replies    |
| `nasHost`            | string   | `"localhost"`         | Your NAS hostname/IP                     |
| `webhookPath`        | string   | `"/webhook/synology"` | Path for incoming webhooks               |
| `dmPolicy`           | string   | `"allowlist"`         | `"open"`, `"allowlist"`, or `"disabled"` |
| `allowedUserIds`     | string[] | `[]`                  | Synology user IDs allowed to message     |
| `rateLimitPerMinute` | number   | `30`                  | Max messages per user per minute         |
| `allowInsecureSsl`   | boolean  | `false`               | Skip SSL verification (local NAS only)   |
| `botName`            | string   | `"OpenClaw"`          | Bot display name                         |

### Multi-account support

You can run multiple Synology Chat bots with different configurations:

```json5
{
  channels: {
    "synology-chat": {
      enabled: true,
      token: "default-token",
      incomingUrl: "http://nas1:5000/...",
      accounts: {
        home: {
          token: "home-token",
          incomingUrl: "http://home-nas:5000/...",
          nasHost: "home-nas.local",
          allowedUserIds: ["1", "2"],
        },
        work: {
          token: "work-token",
          incomingUrl: "http://work-nas:5000/...",
          nasHost: "work-nas.company.com",
          dmPolicy: "disabled", // No DMs, groups only
        },
      },
    },
  },
}
```

## Security

### Token validation

All incoming webhooks are validated using constant-time comparison to prevent timing attacks. The token must match the one configured in both Synology Chat and OpenClaw.

### User allowlisting

With `dmPolicy: "allowlist"`, only specified Synology user IDs can initiate DM conversations with the bot. Find user IDs in Synology Chat Admin panel.

### Rate limiting

Per-user rate limiting prevents abuse. Default is 30 messages/minute. Adjust with `rateLimitPerMinute`.

### Input sanitization

User messages are sanitized to prevent prompt injection attacks:

- Known jailbreak patterns are filtered
- Messages truncated to 4000 characters
- Special tokens and system patterns removed

### SSL/TLS

For production NAS deployments with valid certificates, keep `allowInsecureSsl: false`. Only set to `true` for local development with self-signed certificates.

## Capabilities

| Feature            | Supported               |
| ------------------ | ----------------------- |
| DM messages        | Yes                     |
| Group messages     | No (webhook limitation) |
| Text messages      | Yes                     |
| File/media sharing | Yes (via URL)           |
| Message replies    | No                      |
| Message editing    | No                      |
| Reactions          | No                      |
| Threads            | No                      |

## Formatting

Synology Chat has limited formatting support. Use these patterns:

**Links**: `<URL|display text>`

```
<https://example.com|Click here>
```

**File sharing**: Include a publicly accessible URL

```
https://example.com/image.png
```

The NAS will download and attach the file (max 32 MB).

**Limitations**:

- No markdown, bold, italic, or code blocks
- No buttons, cards, or interactive elements
- No message editing after send
- Keep messages under 2000 characters

## Troubleshooting

<AccordionGroup>
  <Accordion title="Webhook not receiving messages">
    1. Verify webhook is enabled in Synology Chat Admin
    2. Check token matches in both Synology and OpenClaw
    3. Ensure OpenClaw gateway is running
    4. Verify firewall allows incoming connections to webhook path
    5. Check OpenClaw logs: `openclaw logs`
  </Accordion>

  <Accordion title="Bot replies not sent">
    1. Verify `incomingUrl` is correct and accessible
    2. Check NAS is reachable from OpenClaw host
    3. Test URL manually: `curl -X POST "<incomingUrl>" -d "payload=..."`
    4. If using HTTPS with self-signed cert, set `allowInsecureSsl: true`
  </Accordion>

  <Accordion title="User not authorized errors">
    1. Check user ID in Synology Chat Admin panel
    2. Add user ID to `allowedUserIds` list
    3. Or set `dmPolicy: "open"` for testing (not recommended for production)
  </Accordion>

  <Accordion title="Rate limit exceeded">
    Increase `rateLimitPerMinute` or investigate if a user/bot is sending excessive messages.
  </Accordion>
</AccordionGroup>

## Related

- [/channels/pairing](/channels/pairing) - Pairing workflow
- [/channels/troubleshooting](/channels/troubleshooting) - General troubleshooting
- [/gateway/configuration](/gateway/configuration) - Gateway setup
